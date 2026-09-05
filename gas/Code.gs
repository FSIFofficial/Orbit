/**
 * Orbit — Apps Script Web App (write API for the spreadsheet "database").
 *
 * Setup: open the FSIF database spreadsheet -> Extensions > Apps Script,
 * paste this whole file in as Code.gs, then Deploy > New deployment ->
 * type "Web app", execute as "Me", who has access "Anyone". Copy the
 * resulting /exec URL into the CSV_GAS GitHub secret.
 *
 * Reads (Members/Projects/Tasks) go directly to each sheet's published-CSV
 * URL from the frontend; this script only handles writes, dispatched by an
 * `action` field in the POST body. See gas/README.md for the full sheet
 * schema this expects.
 */

var SHEET_MEMBERS = 'Members'
var SHEET_PROJECTS = 'Projects'
var SHEET_TASKS = 'Tasks'
// optional 4th tab — key/value rows syncing the skill/category/role-level
// option pools and project templates; see gas/README.md. Missing sheet is
// fine, updateSetting() creates it on first write.
var SHEET_SETTINGS = 'Settings'
var SETTINGS_KEY_RECURRING_RULES = 'recurring_rules'
// スキルごとのレベルアップ閾値 JSON: { "デフォルト": 100, "デザイン": 150, ... }
var SETTINGS_KEY_SKILL_LEVEL_THRESHOLDS = 'skill_level_thresholds'
// 部署ツリー設定 JSON: 部署一覧を静的に管理したい場合に使う（省略時は
// Members.department_path の実データから動的導出）
var SETTINGS_KEY_DEPARTMENT_TREE_CONFIG = 'department_tree_config'
// NOT a Settings-sheet key (that sheet is published as a public CSV) — this
// is the PropertiesService key the Discord webhook URL is stored under
// instead. See getDiscordWebhookUrl()/updateDiscordWebhookUrl() below.
var DISCORD_WEBHOOK_PROPERTY_KEY = 'discord_webhook_url'

// A member is completing a certain number of same-category tasks and
// auto-certifying isn't something this file does — that check runs
// client-side (lib/orbit/store.tsx) since it only needs data already in
// hand. This file only handles writes coming from the browser.

function doGet(e) {
  return ContentService.createTextOutput('Orbit GAS endpoint is up.').setMimeType(
    ContentService.MimeType.TEXT,
  )
}

// ---- Authentication & Authorization ----------------------------------------

/**
 * Verifies a Google access token via the tokeninfo endpoint.
 * Returns { email } on success; throws with a Japanese message on failure.
 *
 * Note: we use access tokens (not JWT ID tokens) because the frontend GIS
 * client (initTokenClient) issues access tokens. The tokeninfo endpoint
 * returns the same email + audience fields for both token types, so the
 * security properties are equivalent for our purposes.
 */
function verifyToken(accessToken) {
  if (!accessToken) throw new Error('認証トークンがありません。再ログインしてください。')
  var url = 'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken)
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true })
  var code = resp.getResponseCode()
  if (code !== 200) {
    var errBody = {}
    try { errBody = JSON.parse(resp.getContentText()) } catch (_) {}
    if (errBody.error_description === 'Token has been expired or revoked.') {
      throw new Error('認証トークンの有効期限が切れています。再ログインしてください。')
    }
    throw new Error('トークンの検証に失敗しました (HTTP ' + code + ')。再ログインしてください。')
  }
  var info = JSON.parse(resp.getContentText())
  if (info.error || info.error_description) {
    throw new Error('トークンが無効です: ' + (info.error_description || info.error) + '。再ログインしてください。')
  }
  // Verify the token was issued for this app (audience check).
  // GOOGLE_OAUTH_CLIENT_ID is set in Apps Script: Project Settings > Script Properties.
  var expectedClientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_OAUTH_CLIENT_ID')
  if (expectedClientId) {
    // access_token tokeninfo returns 'audience'; id_token tokeninfo uses 'aud'
    var audience = info.audience || info.azp
    if (audience !== expectedClientId) {
      throw new Error('トークンの発行元がこのアプリと一致しません。')
    }
  }
  if (!info.email) throw new Error('トークンからメールアドレスを取得できませんでした。')
  return { email: info.email }
}

/**
 * Finds the acting member from the Members sheet by email.
 * Returns { id, role, project_ids } or throws if not found.
 */
function getActingMember(email) {
  var sheet = getSheet(SHEET_MEMBERS)
  var headers = headerRow(sheet)
  var emailCol = headers.indexOf('email')
  var idCol = headers.indexOf('id')
  var roleCol = headers.indexOf('role')
  var projectIdsCol = headers.indexOf('project_ids')
  var overridesCol = headers.indexOf('permission_overrides_json')
  if (emailCol < 0 || idCol < 0) throw new Error('Membersシートの構造が不正です。')
  var data = sheet.getDataRange().getValues()
  var lc = email.toLowerCase()
  for (var i = 1; i < data.length; i++) {
    var rowEmails = String(data[i][emailCol] || '').split(',').map(function (e) { return e.trim().toLowerCase() })
    if (rowEmails.indexOf(lc) >= 0) {
      var overrides = []
      if (overridesCol >= 0) {
        try { overrides = JSON.parse(data[i][overridesCol] || '[]') } catch (_) {}
      }
      return {
        id: String(data[i][idCol]),
        role: String(data[i][roleCol] || ''),
        project_ids: String(data[i][projectIdsCol] || '').split(',').map(function (s) { return s.trim() }).filter(Boolean),
        permission_overrides: Array.isArray(overrides) ? overrides : [],
      }
    }
  }
  throw new Error('メンバー登録が見つかりません。管理者にお問い合わせください。')
}

/**
 * Returns true if acting member has a permission_overrides entry matching
 * the action's target. Used as OR fallback when role-based check denies.
 *
 * Access level hierarchy: approve > edit > view
 * Override { targetType, targetId, access } — targetId matches:
 *   task       → body.taskId
 *   project    → body.projectId or task.project_id
 *   department → body.department or task.department
 */
function checkPermissionOverride(acting, action, body) {
  var overrides = acting.permission_overrides
  if (!overrides || overrides.length === 0) return false

  // Map action → required access level and target extraction
  var ACCESS_LEVELS = { view: 0, edit: 1, approve: 2 }

  var taskId = String(body.taskId || '')
  var projectId = String(body.projectId || '')
  var department = String(body.department || '')

  // For task-based actions resolve project/department from the sheet when not in body
  if (taskId && (!projectId || !department)) {
    var taskRow = findRow(SHEET_TASKS, taskId)
    if (taskRow) {
      if (!projectId) projectId = String(taskRow.project_id || '')
      if (!department) department = String(taskRow.department || '')
    }
  }

  // Minimum access required per action
  var requiredAccess = 'edit' // default for daihyoOrLeader actions
  if (action === 'approveTask') requiredAccess = 'approve'

  var required = ACCESS_LEVELS[requiredAccess] || 0

  for (var i = 0; i < overrides.length; i++) {
    var ov = overrides[i]
    var granted = ACCESS_LEVELS[ov.access]
    if (typeof granted !== 'number' || granted < required) continue
    if (ov.targetType === 'task' && ov.targetId === taskId && taskId) return true
    if (ov.targetType === 'project' && ov.targetId === projectId && projectId) return true
    if (ov.targetType === 'department' && ov.targetId === department && department) return true
  }
  return false
}

/**
 * Reads skill_level_thresholds from the Settings sheet.
 * Returns {} when the key is absent or unparseable.
 */
function getSkillLevelThresholds() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS)
    if (!sheet) return {}
    var data = sheet.getDataRange().getValues()
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === 'skill_level_thresholds') {
        return JSON.parse(data[i][1] || '{}')
      }
    }
  } catch (_) {}
  return {}
}

/**
 * Reads quiz_definitions from the Settings sheet.
 * Returns [] when the key is absent or unparseable.
 */
function getQuizDefinitions() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS)
    if (!sheet) return []
    var data = sheet.getDataRange().getValues()
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === 'quiz_definitions') {
        var defs = JSON.parse(data[i][1] || '[]')
        return Array.isArray(defs) ? defs : []
      }
    }
  } catch (_) {}
  return []
}

/**
 * Computes leveled-up skill_levels_json given current levels, cumulative
 * points, and threshold config. Returns the updated levels array.
 *
 * Logic: for each skill with points, check if total >= threshold * level.
 * The threshold is "points needed per level"; e.g. threshold=100 means
 * Lv1→Lv2 at 100pts, Lv2→Lv3 at 200pts, ..., max Lv5.
 */
function computeAutoLevels(currentLevels, cumulativePoints, thresholds) {
  var DEFAULT_THRESHOLD = thresholds['デフォルト'] || 100
  var levels = {}
  for (var i = 0; i < currentLevels.length; i++) {
    levels[currentLevels[i].skill] = currentLevels[i].level
  }
  var skills = Object.keys(cumulativePoints)
  for (var j = 0; j < skills.length; j++) {
    var skill = skills[j]
    var pts = cumulativePoints[skill] || 0
    var thr = thresholds[skill] || DEFAULT_THRESHOLD
    var earnedLevel = Math.min(5, Math.floor(pts / thr) + 1)
    var current = levels[skill] || 1
    if (earnedLevel > current) levels[skill] = earnedLevel
  }
  var result = []
  var allSkills = Object.keys(levels)
  for (var k = 0; k < allSkills.length; k++) {
    result.push({ skill: allSkills[k], level: levels[allSkills[k]] })
  }
  return result
}

/**
 * Awards skill points to a member on task completion.
 * Updates skill_points_json and auto-levels skill_levels_json.
 * Also saves awarded_points_json on the task for future avg calculations.
 */
function awardSkillPoints(taskId, memberId, points) {
  var memberRow = findRow(SHEET_MEMBERS, memberId)
  if (!memberRow) throw new Error('メンバーが見つかりません: ' + memberId)

  var currentPoints = {}
  try { currentPoints = JSON.parse(memberRow.skill_points_json || '{}') } catch (_) {}
  var currentLevels = []
  try { currentLevels = JSON.parse(memberRow.skill_levels_json || '[]') } catch (_) {}

  // Accumulate points
  var skillKeys = Object.keys(points)
  for (var i = 0; i < skillKeys.length; i++) {
    var s = skillKeys[i]
    currentPoints[s] = (currentPoints[s] || 0) + (points[s] || 0)
  }

  // Compute auto-level-up
  var thresholds = getSkillLevelThresholds()
  var newLevels = computeAutoLevels(currentLevels, currentPoints, thresholds)

  // Persist
  updateMemberFields(memberId, {
    skill_points_json: JSON.stringify(currentPoints),
    skill_levels_json: JSON.stringify(newLevels),
  })
  if (taskId) {
    updateTaskFields(taskId, { awarded_points_json: JSON.stringify(points) })
  }
  return { ok: true, newPoints: currentPoints, newLevels: newLevels }
}

/**
 * Processes a quiz submission. Reads the quiz definition from Settings,
 * scores the answers, and if pass rate is met, auto-levels the skill.
 */
function submitQuizResult(quizId, memberId, answers, acting) {
  if (memberId !== acting.id && acting.role === '一般') {
    throw new Error('他のメンバーの代わりに検定を受けることはできません。')
  }
  var defs = getQuizDefinitions()
  var quiz = null
  for (var i = 0; i < defs.length; i++) {
    if (defs[i].id === quizId) { quiz = defs[i]; break }
  }
  if (!quiz) throw new Error('検定が見つかりません: ' + quizId)

  var questions = quiz.questions || []
  if (questions.length === 0) throw new Error('検定に設問がありません。')

  var correct = 0
  for (var j = 0; j < questions.length; j++) {
    if (answers[j] === questions[j].correctIndex) correct++
  }
  var score = Math.round((correct / questions.length) * 100)
  var passed = score >= quiz.passRate

  var newLevel = null
  if (passed) {
    var memberRow = findRow(SHEET_MEMBERS, memberId)
    var currentLevels = []
    try { currentLevels = JSON.parse((memberRow && memberRow.skill_levels_json) || '[]') } catch (_) {}
    var targetSkill = quiz.targetSkill
    var targetLevel = quiz.targetLevel || 1
    var existing = currentLevels.find(function(sl) { return sl.skill === targetSkill })
    if (!existing || existing.level < targetLevel) {
      var nextLevels = currentLevels.filter(function(sl) { return sl.skill !== targetSkill })
      nextLevels.push({ skill: targetSkill, level: targetLevel })
      updateMemberFields(memberId, { skill_levels_json: JSON.stringify(nextLevels) })
      newLevel = targetLevel
    }
  }
  return { ok: true, passed: passed, score: score, newLevel: newLevel }
}

/**
 * Enforces per-action role-based access control.
 * Throws with a human-readable Japanese error on denial.
 *
 * Tiers (most to least restrictive):
 *   代表のみ        — organization leader only
 *   代表 or 班長    — any admin role (isLeader)
 *   selfOrAdmin     — acting on body.memberId === self, or any admin
 *   本人のみ        — acting on body.memberId === self only
 *   誰でも          — any logged-in member (with extra checks where noted)
 */
// lib/orbit/permissions.ts の isFullAdminRole と同じ基準:
// role が空または '一般' なら false、Settings の restricted_roles に含まれていれば false、それ以外は true。
// 代表は authorizeAction の先頭で早期 return するため、実質的には「restrictedRoles に含まれない班長」を判定する。
function isActingFullAdmin(acting) {
  var role = String(acting.role || '').trim()
  if (!role || role === '一般') return false
  var restrictedRaw = getSettingValue('restricted_roles') || ''
  var restricted = restrictedRaw.split(',').map(function(s) { return s.trim() }).filter(Boolean)
  return restricted.indexOf(role) < 0
}

function authorizeAction(acting, action, body) {
  var role = acting.role
  // isLeader: true for any role that is not '一般' (i.e. any admin-level role).
  // We cannot enumerate all possible role names (they are user-configurable in Admin → Tags),
  // so we match '代表' specially and treat everything else non-一般 as 班長-equivalent.
  var isDaihyo = role === '代表'
  var isLeader = !isDaihyo && role !== '一般' && role !== ''

  // 代表 can do anything
  if (isDaihyo) return

  // --- 代表のみ ---
  var daihyoOnly = [
    'updateRole',              // ロール変更は代表のみ
    'removeMember',            // メンバー削除は代表のみ
    'removeProject',           // プロジェクト削除は代表のみ
    'updateDiscordWebhookUrl', // システム設定は代表のみ
    'updateSlackWebhookUrl',   // システム設定は代表のみ
    'updateSetting',           // システム設定は代表のみ
    'uploadOrgLogo',           // 団体ロゴアップロードは代表のみ
    'addMember',               // メンバー追加は代表のみ
    'updateEmail',             // 他人のメールアドレス変更は代表のみ
    'updateJoinedAt',          // 所属開始日の編集は代表のみ（人事記録）
    'updateReportsTo',         // 報告先の設定は代表のみ（組織図操作）
    'updateMentor',            // メンター設定は代表のみ（HR操作）
    'notifyTrainingDecision',       // 研修承認通知は代表のみ（承認権限）
    'updatePermissionOverrides',    // 権限例外の編集は代表のみ（人事機密）
    'updateMemberProjects',         // プロジェクト割り当ては代表のみ（自己昇権の抜け穴防止）
  ]
  // 代表は関数冒頭の if (isDaihyo) return でここに到達しないため、
  // このブロックに到達した時点で非代表が確定している。
  // isActingFullAdmin は使わない（restricted_roles 依存で穴が開くため）。
  if (daihyoOnly.indexOf(action) >= 0) {
    if (checkPermissionOverride(acting, action, body)) return
    throw new Error('この操作は代表のみ実行できます。')
  }

  // --- 代表 or 班長 (任意の管理者ロール) ---
  var daihyoOrLeader = [
    'approveTask',          // タスク承認
    'updateJudgment',       // 評価タグの編集（管理者権限）
    'assignTask',           // タスクのアサイン
    'updateTaskDetails',    // タスク詳細編集
    'updateVisibility',     // タスク公開範囲の変更
    'updateReviewer',       // レビュアー設定
    'updateReviewers',      // レビュアー設定（複数）
    'removeTask',           // タスク削除
    'createProject',        // プロジェクト作成
    'updateProjectDetails', // プロジェクト詳細編集
    'updateProjectOwner',   // オーナー変更
    'updateProjectParent',  // 親プロジェクト変更
    'updateProjectArchived',// アーカイブ操作
    'updateProjectMembers', // プロジェクトメンバー管理
    // updateMemberProjects は daihyoOnly に移動（下記参照）
    'updatePriority',       // 優先度（管理者が設定するケースが主）
    'updateDifficulty',     // 難易度（管理者が設定するケースが主）
    'updateSchedule',       // 日程設定
    'updateDependsOn',      // 依存関係設定
    'setBlocker',           // ブロッカー設定（班長が管理）
    'notifyTaskRejected',   // タスク却下通知（管理者が送信）
    'updateSearchProfile',  // 人材検索プロフィール（HR管理者が設定）
    'awardSkillPoints',     // スキルポイント付与（管理者操作）
    'approveExpenseStep',   // 経費承認（管理者操作）
    'rejectExpense',        // 経費却下（管理者操作）
    'approveFormStep',      // フォーム承認（管理者操作）
    'rejectFormSubmission', // フォーム却下（管理者操作）
    'bulkUpdateSkills',          // スキル一括更新（管理者操作）
    'updateMemberInactive',      // 活動休止/再開（管理者操作）
    'updateMemberDepartmentPath',// 組織パス設定（管理者操作）
    'updateEvaluationHistory',   // 評価履歴（班長は担当メンバーのみ）
    'updateTransferHistory',     // 異動履歴（班長は担当メンバーのみ）
    'updateOneOnOnes',           // 1on1記録（班長は担当メンバーのみ）
    'updateCompetencies',        // コンピテンシー評価（班長は担当メンバーのみ）
  ]
  if (daihyoOrLeader.indexOf(action) >= 0) {
    if (!isLeader) {
      // ロールで弾かれた場合でも permission_overrides_json に該当する例外があれば許可（OR条件）
      if (checkPermissionOverride(acting, action, body)) return
      throw new Error('この操作は代表または管理者（班長以上）のみ実行できます。')
    }
    // 承認ステップの担当者チェック（代表は上で return 済みなので班長のみ到達）
    if (action === 'approveExpenseStep' || action === 'approveFormStep') {
      var approverCheckPassed = false
      try {
        if (action === 'approveExpenseStep') {
          var expSheet = ensureExpensesSheet()
          var expFound = findExpenseRow(expSheet, String(body.applicationId || ''))
          if (expFound) {
            var expSteps = JSON.parse(String(expFound.data[expFound.headers.indexOf('approval_steps_json')] || '[]'))
            var expIdx = Number(expFound.data[expFound.headers.indexOf('current_step_index')]) || 0
            var expStep = expSteps[expIdx]
            if (expStep) {
              if (expStep.type === 'member' && expStep.memberId === acting.id) approverCheckPassed = true
              if (expStep.type === 'role' && expStep.role === acting.role) approverCheckPassed = true
            }
          }
        } else {
          var fmSheet = ensureFormSubmissionsSheet()
          var fmFound = findFormSubmissionRow(fmSheet, String(body.submissionId || ''))
          if (fmFound) {
            var fmIdx = Number(fmFound.data[fmFound.headers.indexOf('current_step_index')]) || 0
            var fmId = String(fmFound.data[fmFound.headers.indexOf('form_id')] || '')
            var fmDefs = []
            try { var fmRaw = getSettingValue('custom_form_defs'); if (fmRaw) fmDefs = JSON.parse(fmRaw) } catch(e2) {}
            var fmDef = fmDefs.filter(function(f) { return f.id === fmId })[0]
            var fmStepObj = fmDef ? (fmDef.approvalSteps || [])[fmIdx] : null
            if (fmStepObj) {
              if (fmStepObj.type === 'member' && fmStepObj.memberId === acting.id) approverCheckPassed = true
              if (fmStepObj.type === 'role' && fmStepObj.role === acting.role) approverCheckPassed = true
            }
          }
        }
      } catch(e) {}
      if (!approverCheckPassed) {
        if (checkPermissionOverride(acting, action, body)) return
        throw new Error('この承認ステップの担当者ではありません。')
      }
    }

    // approveTask: importance に応じた承認者チェック（lib/orbit/permissions.ts の canApproveTask と同じロジック）
    if (action === 'approveTask') {
      var taskForApprove = null
      try { taskForApprove = findRow(SHEET_TASKS, String(body.taskId || '')) } catch(e) {}
      if (taskForApprove) {
        var taskImportance = String(taskForApprove.importance || '').trim()
        if (taskImportance === '重要' || taskImportance === '対外公開') {
          // escalated: 全権管理者（isFullAdmin）のみ承認可能
          if (!isActingFullAdmin(acting)) {
            if (checkPermissionOverride(acting, action, body)) return
            throw new Error('重要度が「重要」または「対外公開」のタスクは、全権管理者のみ承認できます。')
          }
        } else {
          // non-escalated: タスク登録者の上長（creator の reports_to_id）のみ承認可能
          if (!isActingFullAdmin(acting)) {
            var creatorId = String(taskForApprove.creator_id || '').trim()
            var approverId = ''
            if (creatorId) {
              try {
                var creatorRow = findRow(SHEET_MEMBERS, creatorId)
                approverId = String(creatorRow.reports_to_id || '').trim()
              } catch(e) {}
            }
            if (approverId && acting.id !== approverId) {
              if (checkPermissionOverride(acting, action, body)) return
              throw new Error('このタスクの承認者として指定されていないため、承認できません。')
            }
          }
        }
      }
    }

    // 班長（代表以外の管理者）はプロジェクトスコープに制限する。
    // acting.project_ids に対象プロジェクトが含まれなければ permission_overrides でのみ許可。
    var actingProjectIds = acting.project_ids ? String(acting.project_ids).split(',').map(function(s) { return s.trim() }).filter(Boolean) : []
    if (actingProjectIds.length > 0) {
      // 対象プロジェクトIDを特定する
      var targetProjectId = null
      if (body.projectId) {
        // プロジェクト操作（createProject/updateProjectDetails/updateProjectMembers 等）
        targetProjectId = String(body.projectId)
      } else if (body.taskId) {
        // タスク操作: タスクの project_id を引く
        try {
          var taskObj = findRow(SHEET_TASKS, String(body.taskId))
          if (taskObj) targetProjectId = String(taskObj.project_id || '')
        } catch(e) {}
      }
      // project_id が特定できた場合のみスコープチェック（特定できない操作は通過させる）
      if (targetProjectId && actingProjectIds.indexOf(targetProjectId) < 0) {
        if (checkPermissionOverride(acting, action, body)) return
        throw new Error('この操作は担当プロジェクトの範囲内でのみ実行できます。')
      }

      // updateSearchProfile は本人であればスコープ制限なしで許可
      if (action === 'updateSearchProfile' && body.memberId && acting.id === String(body.memberId)) return

      // メンバーを対象とするアクションのスコープチェック:
      // acting.project_ids に含まれるプロジェクトの member_ids を Projects シートから取得し、
      // 対象メンバーがそのいずれかに含まれるかで判定する（一般メンバーの project_ids は空欄設計のため）。
      var memberScopeActions = ['updateJudgment', 'updateSearchProfile', 'updateMemberInactive', 'updateMemberDepartmentPath', 'bulkUpdateSkills', 'updateEvaluationHistory', 'updateTransferHistory', 'updateOneOnOnes', 'updateCompetencies']
      if (memberScopeActions.indexOf(action) >= 0) {
        // acting.project_ids 配下の Projects を1回読んで所属メンバーIDのセットを作る
        var scopedMemberIdSet = {}
        try {
          var projectsSheet = getSheet(SHEET_PROJECTS)
          var pHeaders = headerRow(projectsSheet)
          var pIdCol = pHeaders.indexOf('id')
          var pMemberIdsCol = pHeaders.indexOf('member_ids')
          if (pIdCol >= 0 && pMemberIdsCol >= 0 && projectsSheet.getLastRow() > 1) {
            var pRows = projectsSheet.getRange(2, 1, projectsSheet.getLastRow() - 1, pHeaders.length).getValues()
            pRows.forEach(function(row) {
              var pid = String(row[pIdCol] || '').trim()
              if (actingProjectIds.indexOf(pid) >= 0) {
                var mids = String(row[pMemberIdsCol] || '').split(',').map(function(s) { return s.trim() }).filter(Boolean)
                mids.forEach(function(mid) { scopedMemberIdSet[mid] = true })
              }
            })
          }
        } catch(e) { /* Projects シート読み込み失敗時は scopedMemberIdSet が空のまま → 全件拒否（安全側） */ }

        // チェック対象の memberId 一覧を取得
        var memberIdsToCheck = []
        if (action === 'bulkUpdateSkills') {
          var bUpdates = body.updates || []
          bUpdates.forEach(function(u) { if (u && u.memberId) memberIdsToCheck.push(String(u.memberId)) })
        } else if (body.memberId) {
          memberIdsToCheck.push(String(body.memberId))
        }

        for (var mi = 0; mi < memberIdsToCheck.length; mi++) {
          if (!scopedMemberIdSet[memberIdsToCheck[mi]]) {
            if (checkPermissionOverride(acting, action, body)) return
            throw new Error('この操作は担当プロジェクトのメンバーにのみ実行できます。')
          }
        }
      }
    }
    return
  }

  // --- 本人 or 管理者 (selfOrAdmin) ---
  // これらのアクションは本人が自分の情報を編集するか、管理者が代理編集する。
  var selfOrAdmin = [
    'updateSkillLevels',    // 本人・管理者双方が編集可（タスク完了時に自動登録も）
    'updateCareerGoals',    // 本人・管理者双方が編集可
    'updateDevelopmentPlan',// 本人・管理者双方が編集可
    'updateCareerHistory',  // 本人が主体だが管理者も修正可（安全側: 本人or管理者）
    'updateQualifications', // 本人が主体だが管理者も修正可（安全側: 本人or管理者）
    'updateTrainingHistory',// 本人が申請、管理者が更新（ステータス変更）
    'notifyTrainingRequest',// 本人が申請するが念のため本人or管理者に制限
  ]
  if (selfOrAdmin.indexOf(action) >= 0) {
    var targetId = String(body.memberId || '')
    if (targetId !== acting.id && !isLeader) {
      throw new Error('この操作は本人または管理者のみ実行できます。')
    }
    return
  }

  // --- 本人のみ (selfOnly) ---
  var selfOnly = [
    'updateWill',            // 得意分野・希望タグは本人のみ
    'updateNotify',          // 通知設定は本人のみ
    'updateNotifySettings',  // 通知設定詳細は本人のみ
    'updateAvatar',          // アイコン変更は本人のみ
    'uploadAvatar',          // 画像アップロードは本人のみ
    'updateDisplayName',     // 表示名変更は本人のみ
    'updateUnavailableDates',// 稼働不可日は本人のみ
    'updateAbsentDates',    // 不在日は本人のみ
    'updateTimezone',       // タイムゾーン設定は本人のみ
  ]
  if (selfOnly.indexOf(action) >= 0) {
    var selfTargetId = String(body.memberId || '')
    if (selfTargetId !== acting.id) {
      throw new Error('この操作は本人のみ実行できます。')
    }
    return
  }

  // --- ログイン済みなら誰でも ---
  var anyLoggedIn = [
    'createTasks',
    'updateTaskStatus',      // 担当者チェックあり（下記）
    'updateProgress',
    'updateComments',
    'notifyMention',
    'updateEstimatedHours',
    'updateActualHours',
    'updateRetrospective',
    'updateTaskSchedule',
    'notifyScheduleResult',
    'updateTaskForm',
    'notifyFormResult',
    'updateHistory',
    'updateDeliverables',
    'submitQuizResult',        // 検定の受験はログイン済み誰でも
    'submitExpenseApplication',// 経費申請はログイン済み誰でも
    'withdrawExpense',         // 取り下げは本人（下層でチェック）
    'submitCustomForm',        // フォーム申請はログイン済み誰でも
    'updateLastLogin',         // ログイン日時更新は誰でも（本人のみ実質的）
  ]
  if (anyLoggedIn.indexOf(action) >= 0) {
    // updateTaskStatus: 全権管理者は制限なし。「完了」は確認者のみ可。それ以外は担当者のみ可。
    if (action === 'updateTaskStatus') {
      if (!isActingFullAdmin(acting)) {
        var taskId = String(body.taskId || '')
        var task = findRow(SHEET_TASKS, taskId)
        if (body.status === '完了') {
          // 「完了」への変更は確認者（reviewer_id / reviewer_ids）のみ許可
          var reviewerAllowed = false
          if (task) {
            var reviewerIdsRaw = String(task.reviewer_ids || task.reviewer_id || '').trim()
            var reviewerIdList = reviewerIdsRaw.split(',').map(function(s) { return s.trim() }).filter(Boolean)
            if (reviewerIdList.indexOf(acting.id) >= 0) reviewerAllowed = true
          }
          if (!reviewerAllowed) {
            throw new Error('担当者は「完了」に変更できません。確認者または管理者に依頼してください。')
          }
        } else {
          // 「完了」以外のステータス変更は担当者のみ許可
          if (task) {
            var assigneeIds = String(task.assignee_id || '').split(',').map(function (s) { return s.trim() }).filter(Boolean)
            if (assigneeIds.length > 0 && assigneeIds.indexOf(acting.id) < 0) {
              throw new Error('このタスクの担当者のみステータスを変更できます。')
            }
          }
        }
      }
    }
    return
  }

  // Unknown action — 安全側に倒して管理者限定（新しいactionが追加された際の保護）
  if (!isLeader) {
    // コメント: 未分類のactionは代表/班長のみに制限（新機能追加時の安全装置）
    throw new Error('この操作は代表または管理者のみ実行できます。(未分類のaction: ' + action + ')')
  }
}

function doPost(e) {
  var result
  try {
    var body = JSON.parse(e.postData.contents)

    // ---- Token verification & authorization --------------------------------
    // Every write must carry an authToken (Google access token obtained at
    // login via GIS initTokenClient). We verify it against Google's tokeninfo
    // endpoint, extract the email, find the acting member in the Members sheet,
    // and check whether they have permission for this action.
    //
    // Auth errors are returned with authError:true so the frontend can
    // distinguish them from business logic errors and attempt a silent
    // token refresh + retry automatically.
    var actingMember
    try {
      actingMember = getActingMember(verifyToken(body.authToken || '').email)
      authorizeAction(actingMember, body.action, body)
    } catch (authErr) {
      return jsonOutput({ ok: false, error: String(authErr), authError: true })
    }
    // ------------------------------------------------------------------------

    switch (body.action) {
      case 'createTasks':
        result = createTasks(body.tasks)
        break
      case 'updateTaskStatus':
        result = updateTaskFields(body.taskId, {
          status: body.status,
          last_activity: todayStr(),
          completed_date: body.status === '完了' ? todayStr() : '',
        })
        // the assignee's "I'm done" signal — email the admins so they know
        // to go confirm it (they already see it in their 確認待ち panel)
        if (body.status === '確認待ち') notifyReview(body.taskId)
        break
      case 'assignTask':
        result = updateTaskFields(body.taskId, {
          assignee_id: (body.assigneeIds || []).join(','),
        })
        syncCalendarForTask(body.taskId)
        break
      case 'updatePriority':
        result = updateTaskFields(body.taskId, { priority: body.priority })
        break
      case 'updateDifficulty':
        result = updateTaskFields(body.taskId, { difficulty: body.difficulty })
        break
      case 'updateTaskDetails':
        result = updateTaskFields(body.taskId, {
          title: body.name,
          description: body.description || '',
          project_id: body.projectId,
          department: body.department,
          category: body.category,
          skills: (body.skills || []).join(','),
          difficulty: body.difficulty,
          priority: body.priority,
          visibility: body.visibility === '幹部' ? '幹部' : '全員',
          importance: body.importance || '一般',
        })
        break
      case 'updateProgress':
        result = updateTaskFields(body.taskId, {
          progress_note: body.text,
          progress_history_json: JSON.stringify(body.progressHistory || []),
          last_activity: todayStr(),
        })
        break
      case 'updateWill':
        result = updateMemberFields(body.memberId, { will_tags: (body.will || []).join(',') })
        try {
          var willMember = findRow(SHEET_MEMBERS, body.memberId)
          var willName = willMember ? (willMember.display_name || willMember.name || '不明') : '不明'
          var willTags = (body.will || []).join('、') || '（タグなし）'
          var willSubject = '[Orbit] Will タグが更新されました'
          var willBody = willName + 'さんのWillタグが更新されました。\n\n' +
            '【設定されたWillタグ】\n' + willTags + '\n\n' +
            'Orbitの人材画面で確認してください。'
          notifyAdmins(willSubject, willBody)
          notifyChat('💡 ' + willName + 'さんのWillタグが更新されました：' + willTags)
        } catch (err) {
          console.error('updateWill notification failed: ' + err)
        }
        break
      case 'updateTimezone':
        result = updateMemberFields(body.memberId, { timezone: body.timezone || '' })
        break
      case 'updateJudgment':
        result = updateMemberFields(body.memberId, {
          judgment_tags: (body.judgment || []).join(','),
        })
        break
      case 'approveTask':
        result = updateTaskFields(body.taskId, { approval_status: '承認済み' })
        break
      case 'notifyTaskRejected':
        // body.taskId は authorizeAction() のスコープチェックで使用済み
        notifyTaskRejected(body.creatorId, body.taskName, body.reason)
        result = { ok: true }
        break
      case 'removeTask':
        result = removeTask(body.taskId)
        break
      case 'createProject':
        result = createProject(body.name, body.description, body.type)
        break
      case 'removeProject':
        result = removeProject(body.projectId)
        break
      case 'removeMember':
        result = removeMember(body.memberId)
        break
      case 'updateNotify':
        result = updateMemberFields(body.memberId, {
          notify_new_task: body.notify ? 'TRUE' : 'FALSE',
        })
        break
      case 'updateNotifySettings':
        result = updateMemberFields(body.memberId, {
          notify_settings: JSON.stringify(body.settings),
        })
        break
      case 'updateRole':
        result = updateMemberFields(body.memberId, { role: body.role })
        break
      case 'updatePermissionOverrides':
        result = updateMemberFields(body.memberId, {
          permission_overrides_json: JSON.stringify(body.overrides || []),
        })
        break
      case 'updateReportsTo':
        result = updateMemberFields(body.memberId, { reports_to_id: body.reportsToId || '' })
        break
      case 'updateMentor':
        result = updateMemberFields(body.memberId, { mentor_id: body.mentorId || '' })
        break
      case 'updateDisplayName':
        result = updateMemberFields(body.memberId, { display_name: body.displayName || '' })
        break
      case 'updateJoinedAt':
        result = updateMemberFields(body.memberId, { joined_at: body.joinedAt || '' })
        break
      case 'updateUnavailableDates':
        result = updateMemberFields(body.memberId, {
          unavailable_dates: (body.dates || []).join(','),
        })
        break
      case 'updateSchedule':
        result = updateTaskFields(body.taskId, {
          start_date: body.startDate || '',
          due_date: body.deadline || '',
        })
        notifyScheduleChange(body.taskId)
        break
      case 'updateDependsOn':
        result = updateTaskFields(body.taskId, {
          depends_on_ids: (body.dependsOnIds || []).join(','),
        })
        break
      case 'updateVisibility':
        result = updateTaskFields(body.taskId, {
          visibility: body.visibility === '幹部' ? '幹部' : '全員',
        })
        break
      case 'updateReviewer':
        result = updateTaskFields(body.taskId, { reviewer_id: body.reviewerId || '' })
        break
      case 'updateReviewers':
        result = updateTaskFields(body.taskId, {
          reviewer_ids: (body.reviewerIds || []).join(','),
          reviewer_id: (body.reviewerIds && body.reviewerIds[0]) || '',
          required_approvals: body.requiredApprovals != null ? String(body.requiredApprovals) : '',
        })
        break
      case 'setBlocker':
        result = updateTaskFields(body.taskId, {
          blocker_note: body.note || '',
          blocker_since: body.note ? body.since || todayStr() : '',
        })
        break
      case 'updateDeliverables':
        result = updateTaskFields(body.taskId, {
          deliverables_json: JSON.stringify(body.deliverables || []),
        })
        break
      case 'updateHistory':
        result = updateTaskFields(body.taskId, {
          history_json: JSON.stringify(body.history || []),
        })
        break
      case 'updateComments':
        result = updateTaskFields(body.taskId, {
          comments_json: JSON.stringify(body.comments || []),
        })
        break
      case 'notifyMention':
        notifyMention(body.taskId, body.commentText, body.memberIds || [])
        result = { ok: true }
        break
      case 'updateEstimatedHours':
        result = updateTaskFields(body.taskId, {
          estimated_hours: body.hours === null || body.hours === undefined ? '' : body.hours,
        })
        break
      case 'updateActualHours':
        result = updateTaskFields(body.taskId, {
          actual_hours: body.hours === null || body.hours === undefined ? '' : body.hours,
        })
        break
      case 'updateRetrospective':
        result = updateTaskFields(body.taskId, {
          retrospective_json: body.retrospective ? JSON.stringify(body.retrospective) : '',
        })
        break
      case 'updateTaskSchedule':
        result = updateTaskFields(body.taskId, {
          schedule_json: body.schedule ? JSON.stringify(body.schedule) : '',
        })
        break
      case 'notifyScheduleResult':
        notifyScheduleResult(body.taskId)
        result = { ok: true }
        break
      case 'updateTaskForm':
        result = updateTaskFields(body.taskId, {
          form_json: body.form ? JSON.stringify(body.form) : '',
        })
        break
      case 'notifyFormResult':
        notifyFormResult(body.taskId)
        result = { ok: true }
        break
      case 'updateProjectMembers':
        result = updateProjectFields(body.projectId, {
          member_ids: (body.memberIds || []).join(','),
        })
        break
      case 'updateProjectOwner':
        result = updateProjectFields(body.projectId, { owner_id: body.ownerId || '' })
        break
      case 'updateProjectParent':
        result = updateProjectFields(body.projectId, { parent_id: body.parentId || '' })
        break
      case 'updateProjectDetails':
        result = updateProjectFields(body.projectId, {
          description: body.description || '',
          type: body.type || '',
        })
        break
      case 'updateProjectArchived':
        result = updateProjectFields(body.projectId, {
          archived: body.archived ? 'TRUE' : 'FALSE',
        })
        break
      case 'updateAvatar':
        // choosing a color+initials avatar supersedes any uploaded picture
        result = updateMemberFields(body.memberId, {
          avatar_color: body.avatarColor || '',
          avatar_initials: body.initials || '',
          avatar_url: '',
        })
        break
      case 'uploadAvatar':
        result = uploadAvatar(body.memberId, body.dataUrl, body.filename, body.folderId)
        break
      case 'addMember':
        result = addMember(body.name, body.email, body.affiliation, body.role)
        break
      case 'updateEmail':
        result = updateMemberFields(body.memberId, { email: body.email || '' })
        break
      case 'updateSetting':
        result = updateSetting(body.key, body.value)
        break
      case 'uploadOrgLogo':
        result = uploadOrgLogo(body.dataUrl, body.filename, body.folderId)
        break
      case 'updateDiscordWebhookUrl':
        result = updateDiscordWebhookUrl(body.url)
        break
      case 'updateSlackWebhookUrl':
        result = updateSlackWebhookUrl(body.url)
        break
      case 'updateMemberProjects':
        result = updateMemberFields(body.memberId, {
          project_ids: (body.projectIds || []).join(','),
        })
        break
      case 'updateMemberInactive':
        result = updateMemberFields(body.memberId, { inactive: body.inactive ? 'TRUE' : '' })
        break
      case 'updateMemberDepartmentPath':
        result = updateMemberFields(body.memberId, { department_path: body.departmentPath || '' })
        break
      // ---- タレントマネジメント ----
      case 'updateSearchProfile':
        result = updateMemberFields(body.memberId, {
          years_of_experience:
            body.yearsOfExperience === null || body.yearsOfExperience === undefined
              ? ''
              : body.yearsOfExperience,
          has_management_experience: body.hasManagementExperience ? 'TRUE' : 'FALSE',
          desired_areas: (body.desiredAreas || []).join(','),
        })
        break
      case 'updateCareerHistory':
        result = updateMemberFields(body.memberId, {
          career_history_json: JSON.stringify(body.entries || []),
        })
        break
      case 'updateQualifications':
        result = updateMemberFields(body.memberId, {
          qualifications_json: JSON.stringify(body.entries || []),
        })
        break
      case 'updateEvaluationHistory':
        result = updateMemberFields(body.memberId, {
          evaluation_history_json: JSON.stringify(body.entries || []),
        })
        break
      case 'updateTransferHistory':
        result = updateMemberFields(body.memberId, {
          transfer_history_json: JSON.stringify(body.entries || []),
        })
        break
      case 'updateSkillLevels':
        result = updateMemberFields(body.memberId, {
          skill_levels_json: JSON.stringify(body.levels || []),
        })
        break
      case 'updateCompetencies':
        result = updateMemberFields(body.memberId, {
          competencies_json: JSON.stringify(body.competencies || []),
        })
        break
      case 'updateCareerGoals':
        result = updateMemberFields(body.memberId, {
          career_aspiration: body.careerAspiration || '',
          desired_future_role: body.desiredFutureRole || '',
          career_plan: body.careerPlan || '',
        })
        break
      case 'updateTrainingHistory':
        result = updateMemberFields(body.memberId, {
          training_history_json: JSON.stringify(body.entries || []),
        })
        break
      case 'notifyTrainingRequest':
        notifyTrainingRequest(body.memberId, body.trainingName)
        result = { ok: true }
        break
      case 'notifyTrainingDecision':
        notifyTrainingDecision(body.memberId, body.trainingName, body.approved)
        result = { ok: true }
        break
      case 'updateDevelopmentPlan':
        result = updateMemberFields(body.memberId, {
          development_plan_json: JSON.stringify(body.entries || []),
        })
        break
      case 'updateOneOnOnes':
        result = updateMemberFields(body.memberId, {
          one_on_ones_json: JSON.stringify(body.entries || []),
        })
        break
      case 'awardSkillPoints':
        result = awardSkillPoints(body.taskId, body.memberId, body.points || {})
        break
      case 'submitQuizResult':
        result = submitQuizResult(body.quizId, body.memberId, body.answers || [], actingMember)
        break
      case 'submitExpenseApplication':
        result = saveExpenseApplication(body.application, actingMember)
        break
      case 'approveExpenseStep':
        // actingMember.id を使うことでクライアントの自己申告値(body.actorId)による偽装を防ぐ
        result = processExpenseStep(body.applicationId, body.stepId, actingMember.id, 'approved', body.comment)
        break
      case 'rejectExpense':
        result = setExpenseStatus(body.applicationId, 'rejected', body.reason)
        break
      case 'withdrawExpense':
        result = setExpenseStatus(body.applicationId, 'withdrawn', null, actingMember.id)
        break
      case 'submitCustomForm':
        result = saveCustomFormSubmission(body.submission, actingMember)
        break
      case 'approveFormStep':
        // actingMember.id を使うことでクライアントの自己申告値(body.actorId)による偽装を防ぐ
        result = processFormStep(body.submissionId, body.stepId, actingMember.id, 'approved', body.comment)
        break
      case 'rejectFormSubmission':
        result = setFormSubmissionStatus(body.submissionId, 'rejected', body.reason)
        break
      case 'bulkUpdateSkills':
        result = bulkUpdateSkillLevels(body.updates || [])
        break
      case 'updateAbsentDates':
        result = updateMemberFields(body.memberId, { absent_dates: (body.dates || []).join(',') })
        break
      case 'updateLastLogin':
        result = updateMemberFields(body.memberId, { last_login: new Date().toISOString() })
        break
      default:
        throw new Error('Unknown action: ' + body.action)
    }
    return jsonOutput({ ok: true, result: result })
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) })
  }
}

// ---- Tasks ----------------------------------------------------------------

// New rows are built by walking the sheet's actual header row (see
// gas/README.md for the full column list), so this works regardless of
// column order and leaves any column not listed below blank.
function createTasks(tasks) {
  var sheet = getSheet(SHEET_TASKS)
  var headers = headerRow(sheet)
  var nextId = nextIntId(sheet, headers)
  var today = todayStr()
  var created = []

  tasks.forEach(function (t) {
    var id = String(nextId++)
    var row = headers.map(function (h) {
      switch (h) {
        case 'id':
          return id
        case 'project_id':
          return t.projectId
        case 'title':
          return t.title
        case 'description':
          return t.description || ''
        case 'status':
          return '未着手'
        case 'assign_type':
          return 'open_bid'
        case 'assignee_id':
          return (t.assigneeIds || []).join(',')
        case 'creator_id':
          return t.creatorId || ''
        case 'created_at':
          return today
        case 'start_date':
          return t.startDate || ''
        case 'due_date':
          return t.deadline || ''
        case 'due_time':
          return t.dueTime || ''
        case 'visibility':
          return t.visibility === '幹部' ? '幹部' : '全員'
        case 'department':
          return t.department || ''
        case 'category':
          return t.category || ''
        case 'skills':
          return (t.skills || []).join(',')
        case 'difficulty':
          return t.difficulty || ''
        case 'priority':
          return t.priority || ''
        case 'last_activity':
          return today
        case 'original_input_id':
          return t.originalInputId || ''
        case 'approval_status':
          return t.pendingApproval === false ? '承認済み' : '承認待ち'
        case 'estimated_hours':
          return t.estimatedHours || ''
        case 'importance':
          return t.importance || ''
        default:
          return ''
      }
    })
    sheet.appendRow(row)
    created.push({ tempId: t.tempId, id: id })
    if (t.assigneeIds && t.assigneeIds.length > 0) syncCalendarForTask(id)
  })

  // template tasks (pendingApproval === false) don't need an approval-queue email
  var needsApproval = tasks.filter(function (t) {
    return t.pendingApproval !== false
  })
  if (needsApproval.length > 0) notifyNewTasks(needsApproval)
  return created
}

function updateTaskFields(taskId, fields) {
  return updateRowFields(SHEET_TASKS, taskId, fields)
}

function updateProjectFields(projectId, fields) {
  return updateRowFields(SHEET_PROJECTS, projectId, fields)
}

// Emails whoever is flagged notify_new_task=TRUE on Members, falling back
// to every 代表 if nobody opted in (a notification must always go out
// somewhere). Best-effort: a mail failure never fails task creation.
function notifyNewTasks(tasks) {
  var titles = tasks.map(function (t) {
    return '・' + t.title
  })
  notifyAdmins(
    '[Orbit] 新しいタスクが承認待ちです（' + tasks.length + '件）',
    '以下のタスクが登録され、承認待ちです。\n\n' +
      titles.join('\n') +
      '\n\nOrbitの管理画面 > 承認 から確認してください。',
  )
}

// Emails admins when an assignee marks a task 確認待ち (their "I'm done,
// please confirm" signal).
function notifyReview(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task) return
    var assigneeIds = String(task.assignee_id || '')
      .split(',')
      .map(function (s) {
        return s.trim()
      })
      .filter(Boolean)
    notifyAdmins(
      '[Orbit] タスクの確認をお願いします',
      '「' + task.title + '」が確認待ちになりました。\n\nOrbitで確認し、問題なければ「完了」にしてください。',
      reportsToEmails(assigneeIds),
    )
    notifyChat('🔔 「' + task.title + '」が確認待ちになりました。')
  } catch (err) {
    console.error('notifyReview failed: ' + err)
  }
}

// Shared recipient logic: notify_new_task=TRUE members, or every 代表 if
// nobody opted in. Best-effort — a mail failure is swallowed. When
// `preferredEmails` is given (item 9's "admin of admins" hierarchy — e.g. a
// task's assignee's reports_to_id) those are used instead, still falling
// back to the default set if none resolve to anything.
// デバッグ専用 — Apps Scriptエディタ上部の関数選択ドロップダウンで
// "debugNotifyTest" を選び、実行ボタンを押すと、Executions画面やCloudログを
// 開かなくても、エディタ下部の実行ログにその場で結果が表示される。
// Membersシートの列名/メールアドレス設定・MailAppの残り送信数を確認した上で、
// notifyAdmins() を実際に一度呼び出してテストメールを送る。
function debugNotifyTest() {
  console.log('MailApp remaining daily quota: ' + MailApp.getRemainingDailyQuota())
  console.log('org_notification_emails: ' + JSON.stringify(orgNotificationEmails()))

  var sheet = getSheet(SHEET_MEMBERS)
  var headers = headerRow(sheet)
  console.log('Members sheet headers: ' + headers.join(', '))

  var emailCol = headers.indexOf('email')
  var notifyCol = headers.indexOf('notify_new_task')
  var roleCol = headers.indexOf('role')
  console.log(
    'email col idx=' + emailCol + ', notify_new_task col idx=' + notifyCol + ', role col idx=' + roleCol,
  )

  if (emailCol === -1) {
    console.warn('"email" 列が見つかりません。Membersシートのヘッダー名を確認してください。')
  } else {
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
    rows.forEach(function (r, i) {
      console.log(
        'row ' +
          (i + 2) +
          ': email=' +
          JSON.stringify(r[emailCol]) +
          (notifyCol !== -1 ? ', notify_new_task=' + JSON.stringify(r[notifyCol]) : '') +
          (roleCol !== -1 ? ', role=' + JSON.stringify(r[roleCol]) : ''),
      )
    })
  }

  console.log('--- calling notifyAdmins() now (this will actually try to send a real email) ---')
  notifyAdmins('[Orbit] テスト通知', 'これは debugNotifyTest() からのテストメールです。届いていれば設定は正常です。')
  console.log('debugNotifyTest: done — check the inbox (and spam folder) of the resolved recipient(s) above')
}

// 団体メール（Admin > Tagsで幹部/事業責任者が登録） — 個々のメンバーの
// notify_new_task設定に関わらず、常に全ての管理者向け通知(notifyAdmins)の
// 宛先に含める共有の配信先アドレス。Settingsシートの org_notification_emails
// キーにカンマ区切りで保存される（公開情報のため機密扱いではない）。
function orgNotificationEmails() {
  var raw = getSettingValue('org_notification_emails')
  if (!raw) return []
  return raw
    .split(',')
    .map(function (s) {
      return s.trim()
    })
    .filter(Boolean)
}

function uniqueEmails(list) {
  var seen = {}
  var out = []
  list.forEach(function (email) {
    var key = email.toLowerCase()
    if (email && !seen[key]) {
      seen[key] = true
      out.push(email)
    }
  })
  return out
}

// Returns the notify frequency for a given member + kind.
// Falls back to 'immediate' for kinds not configured yet.
function getNotifyFrequency(memberId, kind) {
  var row = findRow('Members', memberId)
  if (!row) return 'immediate'
  var raw = row.notify_settings
  if (!raw) return 'immediate'
  try {
    var settings = JSON.parse(raw)
    return settings[kind] || 'immediate'
  } catch (e) {
    return 'immediate'
  }
}

// Queues a notification for batch delivery. kind is one of:
// 'new_task' | 'review' | 'mention' | 'rejected' | 'deadline'
function queueNotification(memberId, kind, subject, body) {
  var freq = getNotifyFrequency(memberId, kind)
  if (freq === 'none') return
  if (freq === 'immediate') {
    var emails = memberEmailsByIds([memberId])
    if (emails.length > 0) {
      MailApp.sendEmail({ to: emails.join(','), subject: subject, body: body })
    }
    return
  }
  var key = 'notif_queue_' + memberId
  var props = PropertiesService.getScriptProperties()
  var existing = props.getProperty(key)
  var queue = existing ? JSON.parse(existing) : []
  queue.push({ kind: kind, subject: subject, body: body, ts: new Date().toISOString() })
  props.setProperty(key, JSON.stringify(queue))
}

// Time-triggered: send all queued batch notifications.
// Set up a time-based trigger calling this function every hour.
function sendBatchNotifications() {
  var props = PropertiesService.getScriptProperties()
  var allProps = props.getProperties()
  var now = new Date()
  Object.keys(allProps).forEach(function(key) {
    if (!key.startsWith('notif_queue_')) return
    var memberId = key.replace('notif_queue_', '')
    var queue = JSON.parse(allProps[key] || '[]')
    if (queue.length === 0) return

    var emails = memberEmailsByIds([memberId])
    if (emails.length === 0) {
      props.deleteProperty(key)
      return
    }

    // Filter by whether enough time has passed for each item based on member frequency
    var toSend = []
    var toKeep = []
    queue.forEach(function(item) {
      var freq = getNotifyFrequency(memberId, item.kind)
      if (freq === 'none') return
      if (freq === 'immediate') { toSend.push(item); return }
      var hours = freq === '3h' ? 3 : freq === '6h' ? 6 : 24
      var itemTime = new Date(item.ts)
      var elapsed = (now - itemTime) / 3600000
      if (elapsed >= hours) { toSend.push(item) } else { toKeep.push(item) }
    })

    if (toSend.length > 0) {
      var combined = toSend.map(function(i) { return '【' + i.subject + '】\n' + i.body }).join('\n\n---\n\n')
      MailApp.sendEmail({ to: emails.join(','), subject: 'Orbit 通知まとめ (' + toSend.length + '件)', body: combined })
    }
    if (toKeep.length > 0) {
      props.setProperty(key, JSON.stringify(toKeep))
    } else {
      props.deleteProperty(key)
    }
  })
}

function notifyAdmins(subject, body, preferredEmails) {
  try {
    var orgEmails = orgNotificationEmails()

    if (preferredEmails && preferredEmails.length > 0) {
      var to = uniqueEmails(preferredEmails.concat(orgEmails))
      MailApp.sendEmail({ to: to.join(','), subject: subject, body: body })
      console.log('notifyAdmins: sent to preferredEmails+org ' + to.join(','))
      return
    }
    var sheet = getSheet(SHEET_MEMBERS)
    var headers = headerRow(sheet)
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
    var emailCol = headers.indexOf('email')
    var notifyCol = headers.indexOf('notify_new_task')
    var roleCol = headers.indexOf('role')
    if (emailCol === -1 && orgEmails.length === 0) {
      console.warn('notifyAdmins: Members sheet has no "email" column and no org emails configured — nothing sent')
      return
    }

    var opted = []
    var reps = []
    if (emailCol !== -1) {
      rows.forEach(function (r) {
        var email = String(r[emailCol] || '').trim()
        if (!email) return
        var notify = notifyCol !== -1 && /^(true|1|yes)$/i.test(String(r[notifyCol] || ''))
        if (notify) opted.push(email)
        // any admin-level role (i.e. not blank and not "一般") counts as a
        // fallback recipient — role names are freely renamed/added/removed
        // from Admin > Tags, so this can't hardcode a specific role string
        else if (roleCol !== -1 && String(r[roleCol] || '').trim() && r[roleCol] !== '一般') reps.push(email)
      })
    }
    var recipients = uniqueEmails((opted.length > 0 ? opted : reps).concat(orgEmails))
    if (recipients.length === 0) {
      console.warn(
        'notifyAdmins: no recipients resolved (no member has notify_new_task=TRUE, no non-一般 role member has an email, and no org email configured) — nothing sent',
      )
      return
    }

    MailApp.sendEmail({ to: recipients.join(','), subject: subject, body: body })
    console.log('notifyAdmins: sent to ' + recipients.join(','))
  } catch (err) {
    // a mail error shouldn't roll back the caller's action, but log it so
    // it's visible in Executions instead of failing completely silently
    console.error('notifyAdmins failed: ' + err + (err && err.stack ? '\n' + err.stack : ''))
  }
}

// Resolves the "admin of admins" recipients for a set of assignee member
// ids: each assignee's reports_to_id (if set) mapped to that member's
// email. Returns [] when nobody involved has a reports_to_id set, so
// callers fall back to notifyAdmins' default opted-in/代表 logic.
function reportsToEmails(assigneeIds) {
  try {
    var sheet = getSheet(SHEET_MEMBERS)
    var headers = headerRow(sheet)
    var idCol = headers.indexOf('id')
    var emailCol = headers.indexOf('email')
    var reportsToCol = headers.indexOf('reports_to_id')
    if (idCol === -1 || emailCol === -1 || reportsToCol === -1) return []
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()

    var byId = {}
    rows.forEach(function (r) {
      byId[String(r[idCol])] = { email: String(r[emailCol] || '').trim(), reportsTo: String(r[reportsToCol] || '').trim() }
    })

    var emails = []
    ;(assigneeIds || []).forEach(function (aid) {
      var m = byId[String(aid)]
      var managerId = m && m.reportsTo
      var manager = managerId && byId[managerId]
      if (manager && manager.email && emails.indexOf(manager.email) === -1) {
        emails.push(manager.email)
      }
    })
    return emails
  } catch (err) {
    console.error('reportsToEmails failed: ' + err)
    return []
  }
}

// Resolves member ids to their email addresses (skips members with no
// email on file). Used by notifyMention.
function memberEmailsByIds(memberIds) {
  try {
    var sheet = getSheet(SHEET_MEMBERS)
    var headers = headerRow(sheet)
    var idCol = headers.indexOf('id')
    var emailCol = headers.indexOf('email')
    if (idCol === -1 || emailCol === -1) {
      console.warn('memberEmailsByIds: Members sheet missing "id" or "email" column')
      return []
    }
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
    var wanted = {}
    ;(memberIds || []).forEach(function (id) {
      wanted[String(id)] = true
    })
    var emails = []
    rows.forEach(function (r) {
      var email = String(r[emailCol] || '').trim()
      if (wanted[String(r[idCol])] && email) emails.push(email)
    })
    return emails
  } catch (err) {
    console.error('memberEmailsByIds failed: ' + err)
    return []
  }
}

// Emails members who were @mentioned in a task comment. commentText is
// passed straight from the client (not re-read from the sheet) since the
// comment was just appended in the same request.
// Respects each member's 'mention' frequency setting via queueNotification.
function notifyMention(taskId, commentText, memberIds) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task) return
    if (!memberIds || memberIds.length === 0) return
    var subject = '[Orbit] コメントでメンションされました'
    var body =
      'タスク「' + task.title + '」のコメントであなたがメンションされました。\n\n' +
      (commentText || '') +
      '\n\nOrbitで確認してください。'
    memberIds.forEach(function(mid) {
      queueNotification(mid, 'mention', subject, body)
    })
    console.log('notifyMention: queued for memberIds ' + memberIds.join(','))
  } catch (err) {
    console.error('notifyMention failed: ' + err)
  }
}

// 研修申請の承認フロー — a member requesting a training emails their
// reports_to_id manager (falling back to notifyAdmins' default 代表 set),
// mirroring notifyReview's routing.
function notifyTrainingRequest(memberId, trainingName) {
  try {
    var member = findRow(SHEET_MEMBERS, memberId)
    if (!member) return
    var name = member.display_name || member.name || '不明'
    notifyAdmins(
      '[Orbit] 研修申請の承認をお願いします',
      name + 'さんから研修「' + (trainingName || '') + '」の申請がありました。\n\nOrbitの人材育成タブから承認/却下してください。',
      reportsToEmails([memberId]),
    )
    notifyChat('📚 ' + name + 'さんから研修「' + (trainingName || '') + '」の申請がありました。')
  } catch (err) {
    console.error('notifyTrainingRequest failed: ' + err)
  }
}

// 承認しない（却下） — 却下されたタスクは removeTask で削除されるため、
// タスク名は削除前にクライアント側から渡してもらう（削除後だと
// findRowで引けなくなるため）。best-effort。
function notifyTaskRejected(creatorId, taskName, reason) {
  try {
    if (!creatorId) return
    var emails = memberEmailsByIds([creatorId])
    if (emails.length === 0) {
      console.warn('notifyTaskRejected: no email on file for creatorId ' + creatorId + ' — nothing sent')
      return
    }
    MailApp.sendEmail({
      to: emails.join(','),
      subject: '[Orbit] タスクが承認されませんでした',
      body:
        '登録した「' + (taskName || '') + '」は承認されませんでした。\n\n' +
        (reason ? '理由: ' + reason + '\n\n' : '') +
        'Orbitで確認してください。',
    })
    console.log('notifyTaskRejected: sent to ' + emails.join(','))
  } catch (err) {
    console.error('notifyTaskRejected failed: ' + err)
  }
}

// Notifies the requester once their training request is approved/rejected.
function notifyTrainingDecision(memberId, trainingName, approved) {
  try {
    var emails = memberEmailsByIds([memberId])
    if (emails.length === 0) {
      console.warn('notifyTrainingDecision: no email on file for memberId ' + memberId + ' — nothing sent')
      return
    }
    MailApp.sendEmail({
      to: emails.join(','),
      subject: '[Orbit] 研修申請が' + (approved ? '承認' : '却下') + 'されました',
      body:
        '研修「' + (trainingName || '') + '」の申請が' + (approved ? '承認' : '却下') + 'されました。\n\nOrbitで確認してください。',
    })
    console.log('notifyTrainingDecision: sent to ' + emails.join(','))
  } catch (err) {
    console.error('notifyTrainingDecision failed: ' + err)
  }
}

// 日程調整ツール — 招待された全員が全候補への回答を終えたタイミングで
// store.tsx から呼ばれ、作成者へ集計結果をメールする。
function notifyScheduleResult(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task || !task.creator_id) return
    var emails = memberEmailsByIds([task.creator_id])
    if (emails.length === 0) {
      console.warn('notifyScheduleResult: no email on file for creator_id ' + task.creator_id + ' — nothing sent')
      return
    }

    var schedule = null
    try {
      schedule = task.schedule_json ? JSON.parse(task.schedule_json) : null
    } catch (e) {
      schedule = null
    }

    var body = 'タスク「' + task.title + '」の日程調整で全員の回答が揃いました。\n\n'
    if (schedule && schedule.candidates) {
      var sheet = getSheet(SHEET_MEMBERS)
      var headers = headerRow(sheet)
      var idCol = headers.indexOf('id')
      var nameCol = headers.indexOf('display_name')
      var altNameCol = headers.indexOf('name')
      var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
      var nameById = {}
      rows.forEach(function (r) {
        var id = String(r[idCol])
        nameById[id] = (nameCol !== -1 && r[nameCol]) || (altNameCol !== -1 && r[altNameCol]) || id
      })
      schedule.candidates.forEach(function (c) {
        body += '【' + c.label + '】\n'
        ;(schedule.invitedIds || []).forEach(function (mid) {
          var resp = schedule.responses && schedule.responses[mid] && schedule.responses[mid][c.id]
          body += '  ' + (nameById[mid] || mid) + ': ' + (resp || '未回答') + '\n'
        })
      })
    }
    body += '\nOrbitで確認してください。'

    MailApp.sendEmail({ to: emails.join(','), subject: '[Orbit] 日程調整の回答が揃いました', body: body })
    console.log('notifyScheduleResult: sent to ' + emails.join(','))
    notifyChat('🗓️ 「' + task.title + '」の日程調整で全員の回答が揃いました。')
  } catch (err) {
    console.error('notifyScheduleResult failed: ' + err)
  }
}

// 汎用フォームツール — 招待された全員が回答を終えたタイミングでstore.tsxから
// 呼ばれ、作成者へ回答結果をメールする。
function notifyFormResult(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task || !task.creator_id) return
    var emails = memberEmailsByIds([task.creator_id])
    if (emails.length === 0) {
      console.warn('notifyFormResult: no email on file for creator_id ' + task.creator_id + ' — nothing sent')
      return
    }

    var form = null
    try {
      form = task.form_json ? JSON.parse(task.form_json) : null
    } catch (e) {
      form = null
    }

    var body = 'タスク「' + task.title + '」のフォームで全員の回答が揃いました。\n\n'
    if (form && form.fields) {
      var sheet = getSheet(SHEET_MEMBERS)
      var headers = headerRow(sheet)
      var idCol = headers.indexOf('id')
      var nameCol = headers.indexOf('display_name')
      var altNameCol = headers.indexOf('name')
      var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
      var nameById = {}
      rows.forEach(function (r) {
        var id = String(r[idCol])
        nameById[id] = (nameCol !== -1 && r[nameCol]) || (altNameCol !== -1 && r[altNameCol]) || id
      })
      ;(form.invitedIds || []).forEach(function (mid) {
        body += '【' + (nameById[mid] || mid) + '】\n'
        var resp = (form.responses && form.responses[mid]) || {}
        form.fields.forEach(function (f) {
          var v = resp[f.id]
          var text = Array.isArray(v) ? v.join('、') : v || '（未回答）'
          body += '  ' + f.label + ': ' + text + '\n'
        })
        body += '\n'
      })
    }
    body += '\nOrbitで確認してください。'

    MailApp.sendEmail({ to: emails.join(','), subject: '[Orbit] フォームの回答が揃いました', body: body })
    console.log('notifyFormResult: sent to ' + emails.join(','))
    notifyChat('📝 「' + task.title + '」のフォームで全員の回答が揃いました。')
  } catch (err) {
    console.error('notifyFormResult failed: ' + err)
  }
}

// Emails admins (routed via reportsToEmails when the task's assignees have
// a designated 報告先) when a task's start date / deadline changes from
// the detail drawer.
function notifyScheduleChange(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task) return
    var assigneeIds = String(task.assignee_id || '')
      .split(',')
      .map(function (s) {
        return s.trim()
      })
      .filter(Boolean)
    notifyAdmins(
      '[Orbit] タスクの日程が変更されました',
      '「' + task.title + '」の日程が変更されました。\n開始日: ' +
        (task.start_date || '未設定') +
        '\n期限: ' +
        (task.due_date || '未設定') +
        '\n\nOrbitで確認してください。',
      reportsToEmails(assigneeIds),
    )
  } catch (err) {
    console.error('notifyScheduleChange failed: ' + err)
  }
}

// Creates/updates a Google Calendar event (on this script's default
// calendar) for a task's assignees, inviting them by email if known.
// Best-effort — never throws back to the caller.
function syncCalendarForTask(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task || !task.due_date) return

    var assigneeIds = String(task.assignee_id || '')
      .split(',')
      .map(function (s) {
        return s.trim()
      })
      .filter(Boolean)
    if (assigneeIds.length === 0) return

    var members = getSheet(SHEET_MEMBERS)
    var mHeaders = headerRow(members)
    var idCol = mHeaders.indexOf('id')
    var emailCol = mHeaders.indexOf('email')
    if (idCol === -1 || emailCol === -1) return
    var mRows = members.getRange(2, 1, Math.max(members.getLastRow() - 1, 0), mHeaders.length).getValues()
    var guests = mRows
      .filter(function (r) {
        return assigneeIds.indexOf(String(r[idCol])) !== -1
      })
      .map(function (r) {
        return String(r[emailCol] || '').trim()
      })
      .filter(Boolean)
    if (guests.length === 0) return

    var cal = CalendarApp.getDefaultCalendar()
    var title = '[Orbit] ' + task.title
    var existing = cal.getEvents(
      new Date(task.due_date + 'T00:00:00'),
      new Date(task.due_date + 'T23:59:59'),
      { search: title },
    )
    existing.forEach(function (ev) {
      ev.deleteEvent()
    })

    if (task.due_time) {
      var start = new Date(task.due_date + 'T' + task.due_time + ':00')
      var end = new Date(start.getTime() + 60 * 60 * 1000)
      cal.createEvent(title, start, end, { guests: guests.join(','), sendInvites: true })
    } else {
      cal.createAllDayEvent(title, new Date(task.due_date + 'T00:00:00'), {
        guests: guests.join(','),
        sendInvites: true,
      })
    }
  } catch (err) {
    // best-effort — Calendar quota/permissions issues shouldn't break assignment
  }
}

// ---- Projects ---------------------------------------------------------------

function createProject(name, description, type, parentId) {
  var sheet = getSheet(SHEET_PROJECTS)
  var headers = headerRow(sheet)
  var id = String(nextIntId(sheet, headers))
  var row = headers.map(function (h) {
    if (h === 'id') return id
    if (h === 'name') return name
    if (h === 'description') return description || ''
    if (h === 'type') return type || ''
    if (h === 'parent_id') return parentId || ''
    return ''
  })
  sheet.appendRow(row)
  return { id: id }
}

// Deletes a project and cascades: a task can't exist without a project
// (see lib/orbit/types.ts's Task.projectId, which is required), so its
// tasks are removed too, not just unassigned like removeMember does for
// members. Any admin scoped to this project (see project_ids) has it
// dropped from their scope so they don't end up referencing a dead id.
function removeProject(projectId) {
  var projects = getSheet(SHEET_PROJECTS)
  var projectHeaders = headerRow(projects)
  var idCol = projectHeaders.indexOf('id') + 1
  var lastRow = projects.getLastRow()
  var ids = idCol > 0 ? projects.getRange(2, idCol, Math.max(lastRow - 1, 0), 1).getValues() : []
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(projectId)) {
      projects.deleteRow(i + 2)
      break
    }
  }

  var tasks = getSheet(SHEET_TASKS)
  var taskHeaders = headerRow(tasks)
  var projectCol = taskHeaders.indexOf('project_id') + 1
  if (projectCol > 0) {
    var taskLastRow = tasks.getLastRow()
    var projectIds =
      taskLastRow > 1 ? tasks.getRange(2, projectCol, taskLastRow - 1, 1).getValues() : []
    // walk bottom-to-top so deleting a row doesn't shift the indices of
    // rows still to be checked
    for (var j = projectIds.length - 1; j >= 0; j--) {
      if (String(projectIds[j][0]) === String(projectId)) {
        tasks.deleteRow(j + 2)
      }
    }
  }

  var members = getSheet(SHEET_MEMBERS)
  var memberHeaders = headerRow(members)
  var projIdsCol = memberHeaders.indexOf('project_ids') + 1
  if (projIdsCol > 0) {
    var memberLastRow = members.getLastRow()
    var memberProjectIds =
      memberLastRow > 1 ? members.getRange(2, projIdsCol, memberLastRow - 1, 1).getValues() : []
    for (var k = 0; k < memberProjectIds.length; k++) {
      var list = String(memberProjectIds[k][0] || '')
        .split(',')
        .map(function (s) {
          return s.trim()
        })
        .filter(Boolean)
      if (list.indexOf(String(projectId)) !== -1) {
        var next = list.filter(function (id) {
          return id !== String(projectId)
        })
        members.getRange(k + 2, projIdsCol).setValue(next.join(','))
      }
    }
  }

  return { removed: projectId }
}

// Deletes a task outright — distinct from the automatic archive that
// happens client-side 14 days after completion (see visibleTasks/
// archivedTasks in lib/orbit/store.tsx), which just hides it, not this,
// which removes the row. Any other task that listed this one in
// depends_on_ids has that reference scrubbed so 依存関係 doesn't point at
// a dead id.
function removeTask(taskId) {
  var tasks = getSheet(SHEET_TASKS)
  var taskHeaders = headerRow(tasks)
  var idCol = taskHeaders.indexOf('id') + 1
  var lastRow = tasks.getLastRow()
  var ids = idCol > 0 ? tasks.getRange(2, idCol, Math.max(lastRow - 1, 0), 1).getValues() : []
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(taskId)) {
      tasks.deleteRow(i + 2)
      break
    }
  }

  var dependsCol = taskHeaders.indexOf('depends_on_ids') + 1
  if (dependsCol > 0) {
    var afterLastRow = tasks.getLastRow()
    var dependsValues =
      afterLastRow > 1 ? tasks.getRange(2, dependsCol, afterLastRow - 1, 1).getValues() : []
    for (var j = 0; j < dependsValues.length; j++) {
      var list = String(dependsValues[j][0] || '')
        .split(',')
        .map(function (s) {
          return s.trim()
        })
        .filter(Boolean)
      if (list.indexOf(String(taskId)) !== -1) {
        var next = list.filter(function (id) {
          return id !== String(taskId)
        })
        tasks.getRange(j + 2, dependsCol).setValue(next.join(','))
      }
    }
  }

  return { removed: taskId }
}

// ---- Members ----------------------------------------------------------------

function updateMemberFields(memberId, fields) {
  return updateRowFields(SHEET_MEMBERS, memberId, fields)
}

// Adds a brand-new member row — used by Admin → Members "メンバーを登録",
// including registering someone directly as an admin (role != 一般).
function addMember(name, email, affiliation, role) {
  var sheet = getSheet(SHEET_MEMBERS)
  var headers = headerRow(sheet)
  var id = String(nextIntId(sheet, headers))
  var row = headers.map(function (h) {
    switch (h) {
      case 'id':
        return id
      case 'name':
        return name
      case 'email':
        return email || ''
      case 'role':
        return role || '一般'
      case 'notify_new_task':
        return 'FALSE'
      default:
        return ''
    }
  })
  sheet.appendRow(row)
  // affiliation isn't its own column — it's derived from project_ids (or,
  // for admin roles with none, defaulted client-side), so nothing to store
  // for it here; kept as a param for parity with the client-side call.
  return { id: id }
}

// Saves a profile picture (sent as a data: URL, already resized client-side)
// into the configured Drive folder, makes it link-viewable so it can be
// hotlinked from an <img> tag, replaces any previous upload for this
// member, and records the resulting URL on their Members row.
function uploadAvatar(memberId, dataUrl, filename, folderId) {
  if (!folderId) throw new Error('Drive folder is not configured (NEXT_PUBLIC_DRIVE_FOLDER_ID)')
  var match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/)
  if (!match) throw new Error('Expected a base64 data URL')
  var mimeType = match[1]
  var base64Data = match[2]

  var folder = DriveApp.getFolderById(folderId)
  var namePrefix = 'avatar_' + memberId + '_'

  // remove any previous upload for this member so the folder doesn't
  // accumulate orphaned files every time someone changes their picture
  var existing = folder.getFiles()
  while (existing.hasNext()) {
    var f = existing.next()
    if (f.getName().indexOf(namePrefix) === 0) f.setTrashed(true)
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename)
  var file = folder.createFile(blob)
  file.setName(namePrefix + Date.now())
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

  // googleusercontent.com hotlinks more reliably in <img> tags than
  // Drive's own "uc?export=view" (which can trigger a virus-scan
  // interstitial) or "thumbnail?id=" (rate-limited more aggressively) URLs
  var url = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w256-h256-c'
  console.log('uploadAvatar: memberId=' + memberId + ' url=' + url)
  var writeResult = updateMemberFields(memberId, { avatar_url: url })
  console.log('uploadAvatar: updateMemberFields result=' + JSON.stringify(writeResult))
  return { url: url }
}

// 団体ロゴをDriveにアップロードし、Settingsシートのorg_logo_urlを更新する。
// uploadAvatarと異なりMembersシートは変更しない。
function uploadOrgLogo(dataUrl, filename, folderId) {
  if (!folderId) throw new Error('Drive folder is not configured (NEXT_PUBLIC_DRIVE_FOLDER_ID)')
  var match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/)
  if (!match) throw new Error('Expected a base64 data URL')
  var mimeType = match[1]
  var base64Data = match[2]

  var folder = DriveApp.getFolderById(folderId)
  var namePrefix = 'org_logo_'

  var existing = folder.getFiles()
  while (existing.hasNext()) {
    var f = existing.next()
    if (f.getName().indexOf(namePrefix) === 0) f.setTrashed(true)
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename)
  var file = folder.createFile(blob)
  file.setName(namePrefix + Date.now())
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

  var url = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w256-h256-c'
  console.log('uploadOrgLogo: url=' + url)
  updateSetting('org_logo_url', url)
  return { url: url }
}

// Deletes the member's row and clears assignee_id (or removes just their
// id from a multi-assignee list) on every task assigned to them.
function removeMember(memberId) {
  var members = getSheet(SHEET_MEMBERS)
  var memberHeaders = headerRow(members)
  var idCol = memberHeaders.indexOf('id') + 1
  var lastRow = members.getLastRow()
  var ids = idCol > 0 ? members.getRange(2, idCol, Math.max(lastRow - 1, 0), 1).getValues() : []
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(memberId)) {
      members.deleteRow(i + 2)
      break
    }
  }

  var tasks = getSheet(SHEET_TASKS)
  var taskHeaders = headerRow(tasks)
  var assigneeCol = taskHeaders.indexOf('assignee_id') + 1
  if (assigneeCol > 0) {
    var taskLastRow = tasks.getLastRow()
    var assignees = tasks.getRange(2, assigneeCol, Math.max(taskLastRow - 1, 0), 1).getValues()
    for (var j = 0; j < assignees.length; j++) {
      var remaining = String(assignees[j][0] || '')
        .split(',')
        .map(function (s) {
          return s.trim()
        })
        .filter(function (id) {
          return id && id !== String(memberId)
        })
      if (remaining.length !== String(assignees[j][0] || '').split(',').filter(Boolean).length) {
        tasks.getRange(j + 2, assigneeCol).setValue(remaining.join(','))
      }
    }
  }

  return { removed: memberId }
}

// ---- Settings (optional key/value sync sheet) ------------------------------

// Upserts one row of the Settings sheet by key. Used for the skill/category/
// role-level option pools and project templates (see gas/README.md) —
// each holds its whole current value (comma list or JSON) in a single cell.
function updateSetting(key, value) {
  var sheet = getOrCreateSheet(SHEET_SETTINGS, ['key', 'value'])
  var headers = headerRow(sheet)
  var keyCol = headers.indexOf('key') + 1
  var valueCol = headers.indexOf('value') + 1
  if (keyCol === 0 || valueCol === 0) throw new Error('Settings sheet needs "key" and "value" columns')

  var lastRow = sheet.getLastRow()
  var keys = lastRow > 1 ? sheet.getRange(2, keyCol, lastRow - 1, 1).getValues() : []
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) {
      sheet.getRange(i + 2, valueCol).setValue(value)
      return { key: key }
    }
  }
  var row = headers.map(function (h) {
    if (h === 'key') return key
    if (h === 'value') return value
    return ''
  })
  sheet.appendRow(row)
  return { key: key }
}

// ---- shared row helpers -----------------------------------------------------

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
  if (!sheet) throw new Error('Sheet not found: ' + name)
  return sheet
}

// Like getSheet, but creates the tab (with the given header row) instead
// of throwing when it doesn't exist yet — used for the optional Settings
// tab so admins don't have to pre-create it before the first sync.
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(name)
  if (sheet) return sheet
  sheet = ss.insertSheet(name)
  sheet.appendRow(headers)
  return sheet
}

function headerRow(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) {
      return String(h).trim()
    })
}

function nextIntId(sheet, headers) {
  var idCol = headers.indexOf('id') + 1
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return 1
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues()
  var max = 0
  ids.forEach(function (r) {
    var n = parseInt(r[0], 10)
    if (!isNaN(n) && n > max) max = n
  })
  return max + 1
}

// Reads a whole row (by its "id" column) into a {headerName: value} object.
function findRow(sheetName, rowId) {
  var sheet = getSheet(sheetName)
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id')
  if (idCol === -1) throw new Error('No "id" column on ' + sheetName)

  var lastRow = sheet.getLastRow()
  var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), headers.length).getValues()
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idCol]) === String(rowId)) {
      var obj = {}
      headers.forEach(function (h, c) {
        obj[h] = values[i][c]
      })
      return obj
    }
  }
  return null
}

// Finds the row whose "id" column equals rowId, and writes `fields`
// (a {headerName: value} map) into the matching columns of that row.
function updateRowFields(sheetName, rowId, fields) {
  var sheet = getSheet(sheetName)
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id') + 1
  if (idCol === 0) throw new Error('No "id" column on ' + sheetName)

  var lastRow = sheet.getLastRow()
  var ids = sheet.getRange(2, idCol, Math.max(lastRow - 1, 0), 1).getValues()
  var targetRow = -1
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(rowId)) {
      targetRow = i + 2
      break
    }
  }
  if (targetRow === -1) throw new Error(sheetName + ' row not found for id ' + rowId)

  Object.keys(fields).forEach(function (key) {
    var col = headers.indexOf(key) + 1
    if (col === 0) return // unknown column on this sheet — skip silently
    sheet.getRange(targetRow, col).setValue(fields[key])
  })

  return { id: rowId, updated: Object.keys(fields) }
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

// Reads a single value from the optional Settings sheet (see gas/README.md
// §4.6) by key. Returns '' when the sheet or the key doesn't exist yet
// (nothing configured) — every caller below treats that as "feature off".
function getSettingValue(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_SETTINGS)
  if (!sheet) return ''
  var headers = headerRow(sheet)
  var keyCol = headers.indexOf('key')
  var valueCol = headers.indexOf('value')
  if (keyCol === -1 || valueCol === -1) return ''
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return ''
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][keyCol]) === key) return String(rows[i][valueCol] || '')
  }
  return ''
}

// ---- 定期タスクの自動生成（サーバー側・日次トリガー）------------------------
//
// RecurringTaskRule (Admin > Projects の定期タスク) is normally checked
// client-side whenever someone's browser loads the app that day — see
// lib/orbit/store.tsx. That only fires if somebody happens to open Orbit on
// the due day. This mirrors the same generation logic server-side, driven
// by a time-based trigger (see setupDailyTrigger below), so a rule fires
// even if nobody opens the app. Requires SETTINGS_CSV to be configured
// (gas/README.md §4.6) — without it, recurring rules only live in each
// browser's localStorage and this function has nothing to read.
function generateRecurringTasks() {
  var raw = getSettingValue(SETTINGS_KEY_RECURRING_RULES)
  if (!raw) return
  var rules
  try {
    rules = JSON.parse(raw)
  } catch (err) {
    return // malformed value — don't let a bad cell break the trigger
  }
  if (!rules || rules.length === 0) return

  var now = new Date()
  var today = todayStr()
  var dow = now.getDay()
  var dom = now.getDate()
  var changed = false

  rules.forEach(function (rule) {
    if (!rule.active || rule.lastGeneratedDate === today) return
    var due = rule.frequency === 'weekly' ? rule.dayOfWeek === dow : rule.dayOfMonth === dom
    if (!due) return

    // isolate each rule — one bad rule (e.g. a stale projectId, a transient
    // Sheets error) must not abort the whole daily trigger and skip both
    // the remaining rules' lastGeneratedDate writes and the overdue-task
    // Discord sweep that runs after this function in dailyMaintenance()
    try {
      var deadline = null
      if (rule.dueInDays != null) {
        var d = new Date(now.getTime() + rule.dueInDays * 86400000)
        deadline = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      }
      // same payload shape/columns the client sends for a recurring-generated
      // task (see store.tsx) — reuses createTasks() so both paths stay in sync
      createTasks([
        {
          tempId: 'recurring-' + rule.id,
          title: rule.name,
          projectId: rule.projectId,
          department: rule.department,
          category: rule.category,
          skills: rule.skills,
          difficulty: rule.difficulty,
          priority: rule.priority,
          deadline: deadline,
          pendingApproval: false,
        },
      ])
      rule.lastGeneratedDate = today
      changed = true
    } catch (err) {
      // best-effort — skip this rule today, try again on the next run
    }
  })

  if (changed) updateSetting(SETTINGS_KEY_RECURRING_RULES, JSON.stringify(rules))
}

// One-time setup: open this file in the Apps Script editor, select
// "setupDailyTrigger" in the function dropdown next to ▶ Run, and run it
// once. It installs a daily time-based trigger that drives
// generateRecurringTasks() and the overdue-task Discord sweep below. Safe
// to re-run — it clears any existing trigger for dailyMaintenance first so
// re-running it never creates duplicates that fire the same day twice.
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyMaintenance') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(6).create()
}

// The function the trigger installed by setupDailyTrigger() actually calls.
// Each step is isolated so a failure in one (e.g. generateRecurringTasks
// throwing on a malformed rule) can't also skip the other.
function dailyMaintenance() {
  try {
    generateRecurringTasks()
  } catch (err) {
    // best-effort — still run the overdue sweep below
  }
  notifyOverdueTasksToDiscord()
  notifyOverdueTasksToAssignees()
  try { notifyInactiveMembers() } catch (err) { }
}

// 一定期間アクセスのないメンバーを管理者に通知する日次スイープ。
// 同日に既に通知済みのメンバーはスキップ（last_inactive_notified 列で管理）。
function notifyInactiveMembers() {
  var INACTIVE_DAYS = 25
  var thresholdRaw = getSettingValue('inactive_notify_days')
  var threshold = thresholdRaw ? (parseInt(thresholdRaw, 10) || INACTIVE_DAYS) : INACTIVE_DAYS

  var sheet = getSheet(SHEET_MEMBERS)
  if (!sheet || sheet.getLastRow() <= 1) return
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id')
  var nameCol = headers.indexOf('name')
  var inactiveCol = headers.indexOf('inactive')
  var lastLoginCol = headers.indexOf('last_login')
  var lastNotifiedCol = headers.indexOf('last_inactive_notified')
  if (idCol < 0 || lastLoginCol < 0) return

  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  var now = new Date().getTime()
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
  var staleMembers = []

  rows.forEach(function(row, i) {
    var inactive = String(row[inactiveCol] || '').trim().toUpperCase()
    if (inactive === 'TRUE') return
    var lastLogin = String(row[lastLoginCol] || '').trim()
    if (!lastLogin) return
    var lastLoginMs = new Date(lastLogin).getTime()
    if (isNaN(lastLoginMs)) return
    var days = Math.floor((now - lastLoginMs) / 86400000)
    if (days < threshold) return
    // 当日既に通知済みならスキップ
    var lastNotified = lastNotifiedCol >= 0 ? String(row[lastNotifiedCol] || '').trim() : ''
    if (lastNotified === todayStr) return
    staleMembers.push({ rowIdx: i + 2, name: String(row[nameCol] || ''), lastLogin: lastLogin, days: days })
  })

  if (staleMembers.length === 0) return

  // 通知済み日付を記録
  if (lastNotifiedCol >= 0) {
    staleMembers.forEach(function(m) {
      sheet.getRange(m.rowIdx, lastNotifiedCol + 1).setValue(todayStr)
    })
  }

  var lines = staleMembers.map(function(m) {
    return '・' + m.name + '（最終ログイン: ' + m.lastLogin.slice(0, 10) + '、' + m.days + '日経過）'
  })
  var subject = 'Orbit: ' + staleMembers.length + '名のメンバーが' + threshold + '日以上未ログインです'
  var body = '以下のメンバーが ' + threshold + ' 日以上 Orbit にログインしていません:\n\n' + lines.join('\n') + '\n\nOrbit管理画面から状況を確認してください。'
  notifyAdmins(subject, body)
  notifyChat('⚠️ ' + staleMembers.length + '名のメンバーが' + threshold + '日以上未ログインです。Orbitで確認してください。')
}

// 期限超過タスクを担当者本人に個別メール通知する日次スイープ。
// notifyOverdueTasksToDiscord() と同じ期限超過タスクを洗い出し、
// assignee_id（カンマ区切り複数可）を分解して担当者ごとに1通まとめる。
// 通知頻度は各担当者の notify_settings['deadline'] で制御。
// メールアドレス未登録の担当者はスキップし処理継続（best-effort）。
function notifyOverdueTasksToAssignees() {
  try {
    var sheet = getSheet(SHEET_TASKS)
    var headers = headerRow(sheet)
    var titleCol = headers.indexOf('title')
    var dueCol = headers.indexOf('due_date')
    var statusCol = headers.indexOf('status')
    var assigneeCol = headers.indexOf('assignee_id')
    if (titleCol === -1 || dueCol === -1 || statusCol === -1 || assigneeCol === -1) return
    var lastRow = sheet.getLastRow()
    if (lastRow < 2) return
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    var today = todayStr()

    // 期限超過タスクを担当者IDごとに集約
    var byAssignee = {}
    rows.forEach(function (r) {
      var due = cellDateStr(r[dueCol])
      var status = String(r[statusCol] || '')
      if (!due || due >= today || status === '完了') return
      var title = String(r[titleCol] || '')
      var assigneeIds = String(r[assigneeCol] || '')
        .split(',')
        .map(function (s) { return s.trim() })
        .filter(Boolean)
      assigneeIds.forEach(function (aid) {
        if (!byAssignee[aid]) byAssignee[aid] = []
        byAssignee[aid].push({ title: title, due: due })
      })
    })

    var assigneeIds = Object.keys(byAssignee)
    if (assigneeIds.length === 0) return

    assigneeIds.forEach(function (aid) {
      try {
        var tasks = byAssignee[aid]
        var lines = tasks.map(function (t) {
          return '・' + t.title + '（期限: ' + t.due + '）'
        })
        var subject = '[Orbit] 期限超過タスクのお知らせ（' + tasks.length + '件）'
        var body =
          '担当しているタスクのうち、期限を超過しているものが' + tasks.length + '件あります。\n\n' +
          lines.join('\n') +
          '\n\nOrbitにログインして対応状況を更新してください。'
        queueNotification(aid, 'deadline', subject, body)
      } catch (err) {
        // メンバー1人の通知失敗は他のメンバーの処理に影響させない
        console.error('notifyOverdueTasksToAssignees: failed for memberId=' + aid + ': ' + err)
      }
    })
  } catch (err) {
    console.error('notifyOverdueTasksToAssignees failed: ' + err)
  }
}

// ---- Discord Webhook 連携 ---------------------------------------------------
//
// Set the webhook URL from Admin > Tags in the app (gas/README.md §4.7) to
// enable. Deliberately stored in Apps Script's private PropertiesService,
// NOT the Settings sheet — that sheet is published as a public CSV like
// Members/Projects/Tasks, and a webhook URL is a bearer-token-like secret
// (anyone holding it can post to the channel), so it must never round-trip
// through anything publicly readable. There is no doPost action or CSV
// that reads this value back out — write-only by design. Every call below
// is best-effort: a missing/invalid webhook or a Discord-side failure
// never breaks the task action that triggered it.

function getDiscordWebhookUrl() {
  return PropertiesService.getScriptProperties().getProperty(DISCORD_WEBHOOK_PROPERTY_KEY) || ''
}

// Changing this is otherwise invisible (write-only, see the block comment
// above) — email the usual admin recipients so a change is at least
// noticed/auditable, the same way every other admin-only action in this
// file is observable through its effect on the sheet.
function updateDiscordWebhookUrl(url) {
  PropertiesService.getScriptProperties().setProperty(DISCORD_WEBHOOK_PROPERTY_KEY, url || '')
  notifyAdmins(
    '[Orbit] Discord Webhook URLが変更されました',
    (url ? 'Discord Webhook URLが更新されました。' : 'Discord Webhook URLが削除されました。') +
      '\n\n心当たりがない場合はAdmin → Tagsから確認してください。',
  )
  return { updated: true }
}

var SLACK_WEBHOOK_PROPERTY_KEY = 'slack_webhook_url'

function getSlackWebhookUrl() {
  return PropertiesService.getScriptProperties().getProperty(SLACK_WEBHOOK_PROPERTY_KEY) || ''
}

function updateSlackWebhookUrl(url) {
  PropertiesService.getScriptProperties().setProperty(SLACK_WEBHOOK_PROPERTY_KEY, url || '')
  notifyAdmins(
    '[Orbit] Slack Webhook URLが変更されました',
    (url ? 'Slack Webhook URLが更新されました。' : 'Slack Webhook URLが削除されました。') +
      '\n\n心当たりがない場合はAdmin → Tagsから確認してください。',
  )
  return { updated: true }
}

// Task titles are free text any member can set (INPUT screen, or the admin
// edit form) — posted verbatim as Discord message content, `allowed_mentions`
// must suppress mention parsing so a title like "@everyone" can't mass-ping
// the configured channel.
function sendDiscordMessage(content) {
  try {
    var url = getDiscordWebhookUrl()
    if (!url) return
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ content: content, allowed_mentions: { parse: [] } }),
      muteHttpExceptions: true,
    })
  } catch (err) {
    // swallow — Discord delivery is best-effort
  }
}

function sendSlackMessage(content) {
  try {
    var url = getSlackWebhookUrl()
    if (!url) return
    // @here / @channel / @everyone をゼロ幅スペースで無効化（意図しないメンション防止）
    var safe = String(content).replace(/@(here|channel|everyone)/g, '​$1')
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: safe }),
      muteHttpExceptions: true,
    })
  } catch (err) {
    // swallow — Slack delivery is best-effort
  }
}

function notifyChat(content) {
  sendDiscordMessage(content)
  sendSlackMessage(content)
}

// A cell written as a plain 'yyyy-MM-dd' string can come back from
// getValues() as a Date object instead (Sheets auto-converts date-like
// strings in an unformatted column) — normalize either shape to
// 'yyyy-MM-dd' so string comparisons against todayStr() stay correct.
function cellDateStr(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  return String(v || '')
}

// Daily sweep (see dailyMaintenance/setupDailyTrigger above) — posts one
// message listing every task whose due_date has passed and isn't 完了.
function notifyOverdueTasksToDiscord() {
  try {
    var sheet = getSheet(SHEET_TASKS)
    var headers = headerRow(sheet)
    var titleCol = headers.indexOf('title')
    var dueCol = headers.indexOf('due_date')
    var statusCol = headers.indexOf('status')
    if (titleCol === -1 || dueCol === -1 || statusCol === -1) return
    var lastRow = sheet.getLastRow()
    if (lastRow < 2) return
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    var today = todayStr()
    var overdue = rows
      .map(function (r) {
        return { title: r[titleCol], due: cellDateStr(r[dueCol]), status: String(r[statusCol] || '') }
      })
      .filter(function (t) {
        return t.due && t.due < today && t.status !== '完了'
      })
    if (overdue.length === 0) return
    var lines = overdue.map(function (t) {
      return '・' + t.title + '（期限: ' + t.due + '）'
    })
    notifyChat('⚠️ 期限超過タスクが' + overdue.length + '件あります。\n' + lines.join('\n'))
  } catch (err) {
    // best-effort
  }
}

// ---- 初期セットアップ --------------------------------------------------------
//
// GASエディタ上部の関数ドロップダウンで "setupOrbit" を選び、▶ 実行 を押す。
// これ一回で:
//   1. 全サービスの権限ダイアログをまとめて通す (Drive / Mail / Calendar / 等)
//   2. Members / Projects / Tasks / Settings の各シートに不足しているヘッダー列を
//      自動追加する（既存データは一切変更しない）
//   3. 実行結果をエディタ下部のログに出力する
//
// デプロイ後に一度だけ実行すればOK。再実行しても重複は起きない。

function setupOrbit() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  console.log('📋 スプレッドシート: ' + ss.getName())

  // --- 権限の事前取得 ---
  try { DriveApp.getRootFolder(); console.log('✅ DriveApp') }
  catch (e) { console.error('❌ DriveApp: ' + e) }

  try { console.log('✅ MailApp (残り送信数: ' + MailApp.getRemainingDailyQuota() + ')') }
  catch (e) { console.error('❌ MailApp: ' + e) }

  try { console.log('✅ CalendarApp: ' + CalendarApp.getDefaultCalendar().getName()) }
  catch (e) { console.error('❌ CalendarApp: ' + e) }

  try {
    UrlFetchApp.fetch('https://www.google.com', { method: 'get', muteHttpExceptions: true })
    console.log('✅ UrlFetchApp')
  } catch (e) { console.error('❌ UrlFetchApp: ' + e) }

  try { console.log('✅ ScriptApp (トリガー数: ' + ScriptApp.getProjectTriggers().length + ')') }
  catch (e) { console.error('❌ ScriptApp: ' + e) }

  try { PropertiesService.getScriptProperties().getProperties(); console.log('✅ PropertiesService') }
  catch (e) { console.error('❌ PropertiesService: ' + e) }

  // --- ヘッダー行の確認・追加 ---
  var MEMBERS_HEADERS = [
    'id', 'name', 'email', 'role', 'notify_new_task', 'display_name',
    'avatar_url', 'avatar_color', 'avatar_initials',
    'will_tags', 'judgment_tags',
    'reports_to_id', 'mentor_id', 'joined_at', 'unavailable_dates', 'project_ids',
    'years_of_experience', 'has_management_experience', 'desired_areas',
    'career_history_json', 'qualifications_json', 'evaluation_history_json',
    'transfer_history_json', 'skill_levels_json', 'competencies_json',
    'career_aspiration', 'desired_future_role', 'career_plan',
    'training_history_json', 'development_plan_json', 'one_on_ones_json',
    'notify_settings',
    // 組織階層・権限・スキルポイント（新規列）
    'department_path',          // 例: "事業本部A>事業部1>グループX"
    'permission_overrides_json',// 例: [{"targetType":"task","targetId":"12","access":"view"}]
    'skill_points_json',        // 例: {"デザイン":120,"プログラミング":340}
    'inactive',                 // "TRUE" = 休止中メンバー（一覧から非表示）
    'absent_dates',            // 不在日リスト（カンマ区切り YYYY-MM-DD）
    'last_login',              // 最終ログイン日時（ISO datetime）
    'last_inactive_notified',  // 未アクセス通知を最後に送った日（YYYY-MM-DD）
    'timezone',                // 本人のタイムゾーン（IANA名、例: "Asia/Tokyo"）
  ]
  var PROJECTS_HEADERS = [
    'id', 'name', 'description', 'type', 'owner_id', 'member_ids', 'archived', 'parent_id',
  ]
  var TASKS_HEADERS = [
    'id', 'project_id', 'title', 'description', 'status', 'assign_type',
    'assignee_id', 'creator_id', 'created_at', 'start_date', 'due_date', 'due_time',
    'visibility', 'department', 'category', 'skills', 'difficulty', 'priority',
    'last_activity', 'original_input_id', 'approval_status', 'estimated_hours',
    'importance', 'reviewer_id', 'reviewer_ids', 'depends_on_ids',
    'progress_note', 'progress_history_json',
    'deliverables_json', 'history_json', 'comments_json',
    'retrospective_json', 'schedule_json', 'form_json',
    'blocker_note', 'blocker_since', 'completed_date', 'actual_hours',
    'awarded_points_json', // 完了時付与スキルポイント {"デザイン":30}
    'required_approvals',  // 承認に必要な確認者数 (数値 or "all")
  ]
  var SETTINGS_HEADERS = ['key', 'value']

  ensureSheetHeaders(ss, SHEET_MEMBERS,  MEMBERS_HEADERS)
  ensureSheetHeaders(ss, SHEET_PROJECTS, PROJECTS_HEADERS)
  ensureSheetHeaders(ss, SHEET_TASKS,    TASKS_HEADERS)
  ensureSheetHeaders(ss, SHEET_SETTINGS, SETTINGS_HEADERS)

  // --- Settings の初期キーを確保（上書きはしない）---
  var DEFAULT_SETTINGS = [
    ['org_name', ''],
    ['org_logo_url', ''],
  ]
  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS)
  var settingsData = settingsSheet.getLastRow() > 1
    ? settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues().map(function(r){ return String(r[0]) })
    : []
  DEFAULT_SETTINGS.forEach(function(pair) {
    if (settingsData.indexOf(pair[0]) === -1) {
      settingsSheet.appendRow(pair)
      console.log('➕ Settings 初期キー追加: ' + pair[0])
    }
  })

  // --- バッチ通知トリガーの設定 ---
  try {
    var triggers = ScriptApp.getProjectTriggers()
    var hasBatch = triggers.some(function(t) { return t.getHandlerFunction() === 'sendBatchNotifications' })
    if (!hasBatch) {
      ScriptApp.newTrigger('sendBatchNotifications')
        .timeBased()
        .everyHours(1)
        .create()
      console.log('✅ sendBatchNotifications トリガー作成')
    } else {
      console.log('✅ sendBatchNotifications トリガー既存')
    }
  } catch (e) { console.error('❌ トリガー設定: ' + e) }

  console.log('🚀 setupOrbit 完了')
}

// シートが存在しなければ作成し、不足しているヘッダー列を末尾に追加する。
// 既存のデータ行や既存の列は一切変更しない。
function ensureSheetHeaders(ss, sheetName, requiredHeaders) {
  var sheet = ss.getSheetByName(sheetName)
  if (!sheet) {
    sheet = ss.insertSheet(sheetName)
    sheet.appendRow(requiredHeaders)
    console.log('📄 シート作成: ' + sheetName + ' (' + requiredHeaders.length + ' 列)')
    return
  }

  var lastCol = sheet.getLastColumn()
  var existing = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim() })
    : []

  var missing = requiredHeaders.filter(function (h) { return existing.indexOf(h) === -1 })
  if (missing.length === 0) {
    console.log('✅ ' + sheetName + ': ヘッダー問題なし (' + existing.length + ' 列)')
    return
  }

  // 不足列を1行目の末尾に追加（既存データ行は空欄のままで問題ない）
  var startCol = lastCol + 1
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing])
  console.log('➕ ' + sheetName + ': ' + missing.length + ' 列追加 — ' + missing.join(', '))
}

// Membersシートの avatar_url 書き込みが正常に動くかテストする。
// GASエディタで "debugAvatarWrite" を選び ▶ 実行 → ログで結果を確認。
// 引数の memberId は実際のメンバーIDに変えてから実行すること。
function debugAvatarWrite() {
  var TEST_MEMBER_ID = '1' // ← 実際のメンバーIDに変更してください

  var sheet = getSheet(SHEET_MEMBERS)
  var headers = headerRow(sheet)
  console.log('📋 Membersヘッダー: ' + headers.join(' | '))

  var avatarCol = headers.indexOf('avatar_url')
  console.log('avatar_url 列インデックス: ' + avatarCol + (avatarCol === -1 ? ' ❌ 列が見つかりません' : ' ✅'))

  var idCol = headers.indexOf('id')
  var lastRow = sheet.getLastRow()
  var ids = idCol >= 0 ? sheet.getRange(2, idCol + 1, Math.max(lastRow - 1, 0), 1).getValues() : []
  var found = false
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(TEST_MEMBER_ID)) { found = true; break }
  }
  console.log('メンバーID ' + TEST_MEMBER_ID + ' の行: ' + (found ? '✅ 見つかりました' : '❌ 見つかりません'))

  if (avatarCol !== -1 && found) {
    var testUrl = 'https://example.com/test-avatar.png'
    updateMemberFields(TEST_MEMBER_ID, { avatar_url: testUrl })
    console.log('✅ テスト書き込み完了: avatar_url = ' + testUrl)
    console.log('スプレッドシートで avatar_url 列を確認してください。')
  }
}

// ---- Phase 5: 経費申請 -------------------------------------------------------

var SHEET_EXPENSES = 'Expenses'
var SHEET_FORM_SUBMISSIONS = 'FormSubmissions'

function ensureExpensesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_EXPENSES)
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_EXPENSES)
    sheet.appendRow(['id', 'applicant_id', 'amount', 'category_id', 'receipt_url', 'justification', 'purpose', 'approval_steps_json', 'approvals_json', 'current_step_index', 'status', 'created_at', 'rejection_reason'])
  }
  return sheet
}

function ensureFormSubmissionsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_FORM_SUBMISSIONS)
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_FORM_SUBMISSIONS)
    sheet.appendRow(['id', 'form_id', 'submitter_id', 'answers_json', 'approvals_json', 'current_step_index', 'status', 'created_at', 'rejection_reason'])
  }
  return sheet
}

function saveExpenseApplication(application, acting) {
  var sheet = ensureExpensesSheet()
  sheet.appendRow([
    application.id,
    application.applicantId,
    application.amount,
    application.categoryId,
    application.receiptUrl || '',
    application.justification || '',
    application.purpose || '',
    JSON.stringify(application.approvalSteps || []),
    '[]',
    0,
    'pending',
    application.createdAt || new Date().toISOString(),
    '',
  ])
  // 1次承認者への通知
  var steps = application.approvalSteps || []
  if (steps.length > 0) {
    var firstStep = steps[0]
    var emails = []
    if (firstStep.type === 'member' && firstStep.memberId) {
      emails = memberEmailsByIds([firstStep.memberId])
    }
    if (emails.length > 0) {
      MailApp.sendEmail({
        to: emails.join(','),
        subject: 'Orbit: 経費申請が届きました',
        body: '経費申請が届きました。Orbitから確認・承認してください。\n\n金額: ¥' + application.amount,
      })
    }
  }
  return { id: application.id }
}

function findExpenseRow(sheet, applicationId) {
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id')
  if (idCol < 0) return null
  var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idCol]) === applicationId) {
      return { row: i + 2, data: rows[i], headers: headers }
    }
  }
  return null
}

function processExpenseStep(applicationId, stepId, actorId, action, comment) {
  var sheet = ensureExpensesSheet()
  var found = findExpenseRow(sheet, applicationId)
  if (!found) throw new Error('経費申請が見つかりません: ' + applicationId)

  var headers = found.headers
  var data = found.data
  var approvalsCol = headers.indexOf('approvals_json')
  var stepIndexCol = headers.indexOf('current_step_index')
  var statusCol = headers.indexOf('status')
  var stepsCol = headers.indexOf('approval_steps_json')

  var approvals = JSON.parse(String(data[approvalsCol] || '[]'))
  var steps = JSON.parse(String(data[stepsCol] || '[]'))
  var currentIdx = Number(data[stepIndexCol]) || 0

  // 3-1: stepId 順序チェック — 現在のステップと一致しない場合は拒否
  var currentStep = steps[currentIdx]
  if (!currentStep || currentStep.id !== stepId) {
    throw new Error('指定されたステップは現在の承認ステップではありません。')
  }

  approvals.push({ stepId: stepId, memberId: actorId, at: new Date().toISOString(), action: action, comment: comment || '' })

  var step = steps[currentIdx]
  var stepApprovals = approvals.filter(function(a) { return a.stepId === (step ? step.id : '') && a.action === 'approved' })
  var needed = (step && step.requiredCount === 'all') ? Infinity : (step && typeof step.requiredCount === 'number' ? step.requiredCount : 1)
  var nextIdx = stepApprovals.length >= needed ? currentIdx + 1 : currentIdx
  var newStatus = nextIdx >= steps.length ? 'approved' : 'pending'

  sheet.getRange(found.row, approvalsCol + 1).setValue(JSON.stringify(approvals))
  sheet.getRange(found.row, stepIndexCol + 1).setValue(nextIdx)
  sheet.getRange(found.row, statusCol + 1).setValue(newStatus)

  // 次ステップ承認者への通知
  if (nextIdx > currentIdx && nextIdx < steps.length) {
    var nextStep = steps[nextIdx]
    var notifyIds = []
    if (nextStep && nextStep.type === 'member' && nextStep.memberId) {
      notifyIds = [nextStep.memberId]
    } else if (nextStep && nextStep.type === 'role' && nextStep.role) {
      try {
        var mSheet = getSheet(SHEET_MEMBERS)
        var mHeaders = headerRow(mSheet)
        var mRoleCol = mHeaders.indexOf('role')
        var mIdCol = mHeaders.indexOf('id')
        if (mRoleCol >= 0 && mIdCol >= 0 && mSheet.getLastRow() > 1) {
          var mRows = mSheet.getRange(2, 1, mSheet.getLastRow() - 1, mHeaders.length).getValues()
          mRows.forEach(function(r) {
            if (String(r[mRoleCol]).trim() === nextStep.role) notifyIds.push(String(r[mIdCol]))
          })
        }
      } catch(e) {}
    }
    if (notifyIds.length > 0) {
      var nextEmails = memberEmailsByIds(notifyIds)
      if (nextEmails.length > 0) {
        MailApp.sendEmail({ to: nextEmails.join(','), subject: 'Orbit: 経費承認の依頼', body: '経費申請の承認依頼が届きました。Orbitにログインして確認してください。' })
      }
      notifyChat('💴 経費申請の承認依頼が届きました（ステップ ' + (nextIdx + 1) + '）。Orbitにログインして確認してください。')
    }
  }

  // 申請者への完了通知
  if (newStatus === 'approved') {
    var applicantId = String(data[headers.indexOf('applicant_id')])
    var emails = memberEmailsByIds([applicantId])
    if (emails.length > 0) {
      MailApp.sendEmail({ to: emails.join(','), subject: 'Orbit: 経費申請が承認されました', body: '経費申請が承認されました。' })
    }
  }
  return { ok: true }
}

function setExpenseStatus(applicationId, status, reason, actorId) {
  var sheet = ensureExpensesSheet()
  var found = findExpenseRow(sheet, applicationId)
  if (!found) throw new Error('経費申請が見つかりません: ' + applicationId)

  var headers = found.headers
  var statusCol = headers.indexOf('status')
  var reasonCol = headers.indexOf('rejection_reason')
  var applicantId = String(found.data[headers.indexOf('applicant_id')])

  // 取り下げは申請者本人のみ
  if (status === 'withdrawn' && actorId && actorId !== applicantId) {
    throw new Error('この経費申請を取り下げる権限がありません。')
  }

  sheet.getRange(found.row, statusCol + 1).setValue(status)
  if (reason && reasonCol >= 0) {
    sheet.getRange(found.row, reasonCol + 1).setValue(reason)
  }

  // 取り下げ通知: 現在の承認ステップの担当者に「対応不要」を通知（best-effort）
  if (status === 'withdrawn') {
    try {
      var stepsColW = headers.indexOf('approval_steps_json')
      var stepIdxColW = headers.indexOf('current_step_index')
      if (stepsColW >= 0 && stepIdxColW >= 0) {
        var stepsW = JSON.parse(String(found.data[stepsColW] || '[]'))
        var stepIdxW = Number(found.data[stepIdxColW]) || 0
        var currentStepW = stepsW[stepIdxW]
        var withdrawNotifyIds = []
        if (currentStepW) {
          if (currentStepW.type === 'member' && currentStepW.memberId) {
            withdrawNotifyIds = [currentStepW.memberId]
          } else if (currentStepW.type === 'role' && currentStepW.role) {
            var wSheet = getSheet(SHEET_MEMBERS)
            var wHeaders = headerRow(wSheet)
            var wRoleCol = wHeaders.indexOf('role')
            var wIdCol = wHeaders.indexOf('id')
            if (wRoleCol >= 0 && wIdCol >= 0 && wSheet.getLastRow() > 1) {
              var wRows = wSheet.getRange(2, 1, wSheet.getLastRow() - 1, wHeaders.length).getValues()
              wRows.forEach(function(r) {
                if (String(r[wRoleCol]).trim() === currentStepW.role) withdrawNotifyIds.push(String(r[wIdCol]))
              })
            }
          }
        }
        if (withdrawNotifyIds.length > 0) {
          var wEmails = memberEmailsByIds(withdrawNotifyIds)
          if (wEmails.length > 0) {
            MailApp.sendEmail({ to: wEmails.join(','), subject: 'Orbit: 経費申請が取り下げられました', body: '経費申請が取り下げられました。この申請への対応は不要です。' })
          }
          notifyChat('💴 経費申請が取り下げられました。この申請への対応は不要です。')
        }
      }
    } catch(eW) { /* best-effort */ }
  }

  // 却下通知
  if (status === 'rejected') {
    var emails = memberEmailsByIds([applicantId])
    if (emails.length > 0) {
      MailApp.sendEmail({ to: emails.join(','), subject: 'Orbit: 経費申請が却下されました', body: '経費申請が却下されました。\n理由: ' + (reason || '—') })
    }
  }
  return { ok: true }
}

// ---- Phase 5: カスタムフォーム申請 -------------------------------------------

function saveCustomFormSubmission(submission, acting) {
  var sheet = ensureFormSubmissionsSheet()
  sheet.appendRow([
    submission.id,
    submission.formId,
    submission.submitterId,
    JSON.stringify(submission.answers || {}),
    '[]',
    0,
    'pending',
    submission.createdAt || new Date().toISOString(),
    '',
  ])
  return { id: submission.id }
}

function findFormSubmissionRow(sheet, submissionId) {
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id')
  if (idCol < 0) return null
  var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idCol]) === submissionId) {
      return { row: i + 2, data: rows[i], headers: headers }
    }
  }
  return null
}

function processFormStep(submissionId, stepId, actorId, action, comment) {
  var sheet = ensureFormSubmissionsSheet()
  var found = findFormSubmissionRow(sheet, submissionId)
  if (!found) throw new Error('フォーム申請が見つかりません: ' + submissionId)

  var headers = found.headers
  var data = found.data
  var approvalsCol = headers.indexOf('approvals_json')
  var stepIndexCol = headers.indexOf('current_step_index')
  var statusCol = headers.indexOf('status')

  var approvals = JSON.parse(String(data[approvalsCol] || '[]'))
  var currentIdx = Number(data[stepIndexCol]) || 0

  // フォーム定義からステップ一覧を取得（Settingsから読む）
  var formId = String(data[headers.indexOf('form_id')])
  var customFormDefs = []
  try {
    var raw = getSettingValue('custom_form_defs')
    if (raw) customFormDefs = JSON.parse(raw)
  } catch(e) {}
  var formDef = customFormDefs.filter(function(f) { return f.id === formId })[0]
  var allSteps = formDef ? (formDef.approvalSteps || []) : []
  var totalSteps = allSteps.length
  var step = allSteps[currentIdx]

  // 3-1: stepId 順序チェック — 現在のステップと一致しない場合は拒否
  if (!step || step.id !== stepId) {
    throw new Error('指定されたステップは現在の承認ステップではありません。')
  }

  approvals.push({ stepId: stepId, memberId: actorId, at: new Date().toISOString(), action: action, comment: comment || '' })
  var stepApprovals = approvals.filter(function(a) { return a.stepId === stepId && a.action === 'approved' })

  var needed = (step && step.requiredCount === 'all') ? Infinity : (step && typeof step.requiredCount === 'number' ? step.requiredCount : 1)
  var nextIdx = stepApprovals.length >= needed ? currentIdx + 1 : currentIdx
  var newStatus = nextIdx >= totalSteps ? 'approved' : 'pending'

  sheet.getRange(found.row, approvalsCol + 1).setValue(JSON.stringify(approvals))
  sheet.getRange(found.row, stepIndexCol + 1).setValue(nextIdx)
  sheet.getRange(found.row, statusCol + 1).setValue(newStatus)

  // 次ステップ承認者への通知
  if (nextIdx > currentIdx && nextIdx < totalSteps) {
    var nextFmStep = allSteps[nextIdx]
    var fmNotifyIds = []
    if (nextFmStep && nextFmStep.type === 'member' && nextFmStep.memberId) {
      fmNotifyIds = [nextFmStep.memberId]
    } else if (nextFmStep && nextFmStep.type === 'role' && nextFmStep.role) {
      try {
        var fmMSheet = getSheet(SHEET_MEMBERS)
        var fmMHeaders = headerRow(fmMSheet)
        var fmMRoleCol = fmMHeaders.indexOf('role')
        var fmMIdCol = fmMHeaders.indexOf('id')
        if (fmMRoleCol >= 0 && fmMIdCol >= 0 && fmMSheet.getLastRow() > 1) {
          var fmMRows = fmMSheet.getRange(2, 1, fmMSheet.getLastRow() - 1, fmMHeaders.length).getValues()
          fmMRows.forEach(function(r) {
            if (String(r[fmMRoleCol]).trim() === nextFmStep.role) fmNotifyIds.push(String(r[fmMIdCol]))
          })
        }
      } catch(e2) {}
    }
    if (fmNotifyIds.length > 0) {
      var fmNextEmails = memberEmailsByIds(fmNotifyIds)
      if (fmNextEmails.length > 0) {
        MailApp.sendEmail({ to: fmNextEmails.join(','), subject: 'Orbit: 申請フォーム承認の依頼', body: '申請フォームの承認依頼が届きました。Orbitにログインして確認してください。' })
      }
      notifyChat('📋 申請フォームの承認依頼が届きました（ステップ ' + (nextIdx + 1) + '）。Orbitにログインして確認してください。')
    }
  }

  return { ok: true }
}

function setFormSubmissionStatus(submissionId, status, reason) {
  var sheet = ensureFormSubmissionsSheet()
  var found = findFormSubmissionRow(sheet, submissionId)
  if (!found) throw new Error('フォーム申請が見つかりません: ' + submissionId)

  var headers = found.headers
  var statusCol = headers.indexOf('status')
  var reasonCol = headers.indexOf('rejection_reason')
  var submitterIdCol = headers.indexOf('submitter_id')

  sheet.getRange(found.row, statusCol + 1).setValue(status)
  if (reason && reasonCol >= 0) sheet.getRange(found.row, reasonCol + 1).setValue(reason)

  // 却下時: 申請者にメール通知（best-effort）
  if (status === 'rejected' && submitterIdCol >= 0) {
    try {
      var submitterId = String(found.data[submitterIdCol] || '')
      if (submitterId) {
        var emails = memberEmailsByIds([submitterId])
        if (emails.length > 0) {
          MailApp.sendEmail({
            to: emails.join(','),
            subject: '[Orbit] 申請フォームが却下されました',
            body:
              '申請フォームの申請が却下されました。\n\n' +
              (reason ? '理由: ' + reason + '\n\n' : '') +
              'Orbitで確認してください。',
          })
        }
        notifyChat('📋 申請フォームが却下されました。' + (reason ? '（理由: ' + reason + '）' : ''))
      }
    } catch (eR) {
      console.error('setFormSubmissionStatus: 却下通知送信失敗: ' + eR)
    }
  }

  return { ok: true }
}

// ---- Phase 6: スキル一括更新 ----

function bulkUpdateSkillLevels(updates) {
  // updates: [{ memberId, skill, level }]
  if (!updates || updates.length === 0) return { ok: true, updated: 0 }

  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_MEMBERS)
  if (!sheet) throw new Error('Membersシートが見つかりません')

  var data = sheet.getDataRange().getValues()
  var headers = data[0].map(function(h) { return String(h).trim() })
  var idCol = headers.indexOf('id')
  var skillLevelsCol = headers.indexOf('skill_levels_json')
  if (idCol < 0 || skillLevelsCol < 0) throw new Error('Membersシートの列が不足しています')

  // group updates by memberId
  var byMember = {}
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i]
    if (!byMember[u.memberId]) byMember[u.memberId] = []
    byMember[u.memberId].push(u)
  }

  var count = 0
  for (var row = 1; row < data.length; row++) {
    var memberId = String(data[row][idCol] || '')
    if (!memberId || !byMember[memberId]) continue

    var existing = []
    try {
      existing = JSON.parse(String(data[row][skillLevelsCol] || '[]')) || []
    } catch (e) { existing = [] }

    var memberUpdates = byMember[memberId]
    for (var j = 0; j < memberUpdates.length; j++) {
      var upd = memberUpdates[j]
      var found = false
      for (var k = 0; k < existing.length; k++) {
        if (existing[k].skill === upd.skill) {
          existing[k].level = upd.level
          found = true
          break
        }
      }
      if (!found) existing.push({ skill: upd.skill, level: upd.level })
    }

    sheet.getRange(row + 1, skillLevelsCol + 1).setValue(JSON.stringify(existing))
    count++
  }

  return { ok: true, updated: count }
}
