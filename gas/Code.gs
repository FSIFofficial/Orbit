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

function doPost(e) {
  var result
  try {
    var body = JSON.parse(e.postData.contents)
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
      case 'updateRole':
        result = updateMemberFields(body.memberId, { role: body.role })
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
      case 'updateDiscordWebhookUrl':
        result = updateDiscordWebhookUrl(body.url)
        break
      case 'updateMemberProjects':
        result = updateMemberFields(body.memberId, {
          project_ids: (body.projectIds || []).join(','),
        })
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
    sendDiscordMessage('🔔 「' + task.title + '」が確認待ちになりました。')
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
function notifyMention(taskId, commentText, memberIds) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task) return
    var emails = memberEmailsByIds(memberIds)
    if (emails.length === 0) {
      console.warn('notifyMention: no email on file for memberIds ' + memberIds.join(',') + ' — nothing sent')
      return
    }
    MailApp.sendEmail({
      to: emails.join(','),
      subject: '[Orbit] コメントでメンションされました',
      body:
        'タスク「' + task.title + '」のコメントであなたがメンションされました。\n\n' +
        (commentText || '') +
        '\n\nOrbitで確認してください。',
    })
    console.log('notifyMention: sent to ' + emails.join(','))
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
    sendDiscordMessage('📚 ' + name + 'さんから研修「' + (trainingName || '') + '」の申請がありました。')
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
    sendDiscordMessage('🗓️ 「' + task.title + '」の日程調整で全員の回答が揃いました。')
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
    sendDiscordMessage('📝 「' + task.title + '」のフォームで全員の回答が揃いました。')
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

function createProject(name, description, type) {
  var sheet = getSheet(SHEET_PROJECTS)
  var headers = headerRow(sheet)
  var id = String(nextIntId(sheet, headers))
  var row = headers.map(function (h) {
    if (h === 'id') return id
    if (h === 'name') return name
    if (h === 'description') return description || ''
    if (h === 'type') return type || ''
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
  updateMemberFields(memberId, { avatar_url: url })
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
    var url = getDiscordWebhookUrl()
    if (!url) return
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
    sendDiscordMessage('⚠️ 期限超過タスクが' + overdue.length + '件あります。\n' + lines.join('\n'))
  } catch (err) {
    // best-effort
  }
}
