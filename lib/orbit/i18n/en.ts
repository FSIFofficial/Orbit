import { ja } from './ja'

// `satisfies Record<keyof typeof ja, string>` forces this object to carry
// every key ja.ts defines — add a key to ja.ts and this file won't compile
// until the English translation is filled in too.
export const en = {
  // ---- common ----------------------------------------------------------
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.clear': 'Clear',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.confirm': 'Confirm',
  'common.reload': 'Reload',
  'common.notSet': 'Not set',
  'common.none': 'None',

  // ---- header ------------------------------------------------------------
  'header.back': 'Back',
  'header.back.aria': 'Go back',
  'header.mode.input': 'Write work',
  'header.mode.output': 'View org',
  'header.mode.admin': 'Manage',
  'header.notifications': 'Notifications',
  'header.notifications.empty': 'No new notifications',
  'header.notifications.dismiss': 'Dismiss notification',
  'header.notifications.dismiss.title': 'Dismiss',
  'header.refresh': 'Refresh data',
  'header.search.placeholder': 'Search tasks…',
  'header.search.clear': 'Clear',
  'header.search.empty': 'No matching tasks',
  'header.theme.light': 'Switch to light mode',
  'header.theme.dark': 'Switch to dark mode',
  'header.menu.profile': 'Profile',
  'header.menu.activity': 'Activity',
  'header.menu.dailyreport': 'Daily / weekly report',
  'header.menu.survey': 'Experience survey',
  'header.menu.orgSettings': 'Org settings',
  'header.menu.feedback': 'Send feedback',
  'header.menu.logout': 'Log out',
  'header.logoAlt': 'Logo',

  // ---- login ---------------------------------------------------------
  'login.tagline': 'Launch your tasks, put your team into orbit.',
  'login.googleSignIn': 'Sign in with Google',
  'login.signingIn': 'Signing in…',
  'login.oauthNotConfigured': 'Google OAuth is not configured. Please contact an administrator.',
  'login.failed': 'Sign-in failed. Please try again.',
  'login.notRegistered': '{email} is not registered in Orbit.',
  'login.poweredByGoogle': 'Powered by Google',

  // ---- output / list-view ------------------------------------------------
  'output.list.searchPlaceholder': 'Search tasks',
  'output.list.projectAll': 'Project: All',
  'output.list.statusAll': 'Status: All',
  'output.list.assigneeAll': 'Assignee: All',
  'output.list.unassigned': 'Unassigned',
  'output.list.departmentAll': 'Department: All',
  'output.list.exportExcel': 'Export Excel',
  'output.list.colTask': 'Task',
  'output.list.colAssignee': 'Assignee',
  'output.list.colProject': 'Project',
  'output.list.colDepartment': 'Department',
  'output.list.colDeadline': 'Deadline',
  'output.list.colStatus': 'Status',
  'output.list.colCategory': 'Category',
  'output.list.colDifficulty': 'Difficulty',
  'output.list.empty': 'No tasks match the current filters.',

  // ---- task status (internal enum → display label) -----------------------
  'status.todo': 'To do',
  'status.progress': 'In progress',
  'status.support': 'Needs support',
  'status.review': 'In review',
  'status.fix': 'Fixing',
  'status.done': 'Done',

  // ---- admin members -------------------------------------------------
  'admin.members.colMember': 'Member',
  'admin.members.colRole': 'Role',
  'admin.members.colReportsTo': 'Reports to',
  'admin.members.colProjects': 'Assigned projects',
  'admin.members.colActive': 'Active',
  'admin.members.colWill': 'Will',
  'admin.members.colJudgment': 'Judgment',
  'admin.members.colStatus': 'Status',
  'admin.members.colNotify': 'New task alerts',
  'admin.members.reportsToDefault': '(Default)',
  'admin.members.empty': 'No members match the current filters.',

  // ---- admin projects -----------------------------------------------
  'admin.projects.title': 'Projects',
  'admin.projects.colStaffing': 'Staffing',
  'admin.projects.staffingShort': 'Short',

  // ---- settings (language / timezone) ------------------------------------
  'settings.language': 'Language',
  'settings.timezone': 'Timezone',

  // ---- department (fixed 8 values in DEPARTMENTS) -------------------------
  'department.運営': 'Operations',
  'department.広報': 'PR',
  'department.開発': 'Development',
  'department.デザイン': 'Design',
  'department.渉外': 'External Relations',
  'department.イベント': 'Events',
  'department.リサーチ': 'Research',
  'department.未分類': 'Uncategorized',

  // ---- priority (fixed 3 values) ------------------------------------------
  'priority.高': 'High',
  'priority.中': 'Medium',
  'priority.低': 'Low',
  'priority.prefix': 'Priority: ',

  // ---- difficulty (fixed 5 values) -----------------------------------------
  'difficulty.誰でも可': 'Anyone',
  'difficulty.新人歓迎': 'Beginner welcome',
  'difficulty.少し経験必要': 'Some experience needed',
  'difficulty.経験者向け': 'Experienced',
  'difficulty.上級者向け': 'Advanced',

  // ---- base role -------------------------------------------------------
  'role.一般': 'General',
} satisfies Record<keyof typeof ja, string>
