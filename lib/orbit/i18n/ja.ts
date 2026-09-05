// 翻訳キーの唯一の源泉（source of truth）。他言語ファイル（en.ts など）は
// `satisfies Record<keyof typeof ja, string>` でこのキー集合との一致を型
// チェックする — キーを1つでも書き漏らすとコンパイルエラーになる。
// {name} のような {} 括りはプレースホルダーで、t(key, { name: '...' }) の
// ように呼び出し側で埋め込む値を渡す。
export const ja = {
  // ---- common ----------------------------------------------------------
  'common.loading': '読み込み中…',
  'common.cancel': 'キャンセル',
  'common.save': '保存',
  'common.close': '閉じる',
  'common.search': '検索',
  'common.clear': 'クリア',
  'common.delete': '削除',
  'common.edit': '編集',
  'common.add': '追加',
  'common.confirm': '確認',
  'common.reload': '再読み込み',
  'common.notSet': '未設定',
  'common.none': 'なし',

  // ---- header ------------------------------------------------------------
  'header.back': '戻る',
  'header.back.aria': '前の画面に戻る',
  'header.mode.input': '仕事を書く',
  'header.mode.output': '組織で見る',
  'header.mode.admin': '管理する',
  'header.notifications': '通知',
  'header.notifications.empty': '新しい通知はありません',
  'header.notifications.dismiss': '通知を閉じる',
  'header.notifications.dismiss.title': '消す',
  'header.refresh': '情報を更新',
  'header.search.placeholder': 'タスクを検索…',
  'header.search.clear': 'クリア',
  'header.search.empty': '該当するタスクがありません',
  'header.theme.light': 'ライトモードに切替',
  'header.theme.dark': 'ダークモードに切替',
  'header.menu.profile': 'プロフィール',
  'header.menu.activity': 'アクティビティ',
  'header.menu.dailyreport': '日報・週報',
  'header.menu.survey': '体験アンケート',
  'header.menu.orgSettings': '団体設定',
  'header.menu.feedback': '改善を要望する',
  'header.menu.logout': 'ログアウト',
  'header.logoAlt': 'ロゴ',

  // ---- login ---------------------------------------------------------
  'login.tagline': 'タスクを打ち上げ、組織を軌道に乗せる。',
  'login.googleSignIn': 'Googleでログイン',
  'login.signingIn': 'ログイン中…',
  'login.oauthNotConfigured': 'Google OAuthが設定されていません。管理者にお問い合わせください。',
  'login.failed': 'ログインできませんでした。もう一度お試しください。',
  'login.notRegistered': '{email} はOrbitに登録されていません。',
  'login.poweredByGoogle': 'Powered by Google',

  // ---- output / list-view ------------------------------------------------
  'output.list.searchPlaceholder': 'タスクを検索',
  'output.list.projectAll': 'プロジェクト: すべて',
  'output.list.statusAll': 'ステータス: すべて',
  'output.list.assigneeAll': '担当: すべて',
  'output.list.unassigned': '未アサイン',
  'output.list.departmentAll': '部門: すべて',
  'output.list.exportExcel': 'Excel出力',
  'output.list.colTask': 'タスク',
  'output.list.colAssignee': '担当',
  'output.list.colProject': 'プロジェクト',
  'output.list.colDepartment': '部門',
  'output.list.colDeadline': '期限',
  'output.list.colStatus': 'ステータス',
  'output.list.colCategory': 'カテゴリ',
  'output.list.colDifficulty': '難易度',
  'output.list.empty': '条件に一致するタスクがありません。',

  // ---- task status (内部enum → 表示ラベル) --------------------------------
  'status.todo': '未着手',
  'status.progress': '進行中',
  'status.support': 'サポート必要',
  'status.review': '確認待ち',
  'status.fix': '修正中',
  'status.done': '完了',

  // ---- admin members -------------------------------------------------
  'admin.members.colMember': 'Member',
  'admin.members.colRole': '役職',
  'admin.members.colReportsTo': '報告先',
  'admin.members.colProjects': '担当プロジェクト',
  'admin.members.colActive': 'Active',
  'admin.members.colWill': 'Will',
  'admin.members.colJudgment': 'Judgment',
  'admin.members.colStatus': 'Status',
  'admin.members.colNotify': '新規タスク通知',
  'admin.members.reportsToDefault': '（デフォルト）',
  'admin.members.empty': '条件に一致するメンバーがいません。',

  // ---- admin projects -----------------------------------------------
  'admin.projects.title': 'Projects',
  'admin.projects.colStaffing': '人材',
  'admin.projects.staffingShort': '不足',

  // ---- settings (言語・タイムゾーン) ------------------------------------
  'settings.language': '言語',
  'settings.timezone': 'タイムゾーン',

  // ---- 部門（DEPARTMENTS、types.tsで固定8種）--------------------------------
  // 組織が追加できる自由ロール名とは違い、この8種は決め打ちの定数なので
  // 安全に辞書化できる。GAS/シートには引き続きこの日本語のまま保存される。
  'department.運営': '運営',
  'department.広報': '広報',
  'department.開発': '開発',
  'department.デザイン': 'デザイン',
  'department.渉外': '渉外',
  'department.イベント': 'イベント',
  'department.リサーチ': 'リサーチ',
  'department.未分類': '未分類',

  // ---- 優先度（Priority: 高・中・低の3値固定）--------------------------------
  'priority.高': '高',
  'priority.中': '中',
  'priority.低': '低',
  'priority.prefix': '優先度',

  // ---- 難易度（DIFFICULTY_LABEL、5段階固定）----------------------------------
  'difficulty.誰でも可': '誰でも可',
  'difficulty.新人歓迎': '新人歓迎',
  'difficulty.少し経験必要': '少し経験必要',
  'difficulty.経験者向け': '経験者向け',
  'difficulty.上級者向け': '上級者向け',

  // ---- 基本ロール（BASE_ROLE。それ以外の追加ロールは組織の自由入力のため
  // 辞書化できず、自動翻訳（lib/orbit/translate.ts）の対象にする）------------
  'role.一般': '一般',
} satisfies Record<string, string>
