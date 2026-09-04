# スプレッドシート連携セットアップ

Orbit は Members / Projects / Tasks の3シートを「データベース」として使います。
読み取りはシートのCSV公開URL、書き込みはこのフォルダの `Code.gs` を貼り付けた
Apps Script Web App 経由で行います（アルファ版設計ドキュメント §2参照）。

## 1. シートの列構成

`database.xlsx`（リポジトリのサンプル）と同じ列名・順序にしてください。列名は
1行目のヘッダーで判定するので、位置がずれても動きますが、列名は完全一致が必要です。

### Members
| 列 | 内容 |
|---|---|
| id | メンバーID |
| name | 氏名（登録名） |
| display_name | 表示名（任意）。設定されていればUI上はこちらが優先表示されます |
| role | 一般、またはAdmin → Tagsで自由に追加できる権限レベル（初期値：班長・事業責任者・代表、この順に上位）。「一般」以外はすべて何らかの管理者権限を持ち、最下位（初期値では「班長」）以外は組織全体のAdmin画面にフルアクセスできます。最下位のロールだけがAdmin → Membersの「担当プロジェクト」で指定した範囲に限定されます |
| project_ids | 最下位の管理者ロール（例：班長）が担当するプロジェクトID（複数可、カンマ区切り）。Admin → Membersの「担当プロジェクト」から設定でき、そのAdmin画面はここで指定したプロジェクトの範囲に絞り込まれます |
| will_tags | 本人入力の得意分野・希望タスク（カンマ区切り） |
| judgment_tags | 管理者入力の評価タグ（カンマ区切り） |
| email | 通知メールの送信先（新規タスク通知に使用）。個人ページの「アカウント設定」から本人が編集できます |
| notify_new_task | TRUE ならこの人に新規タスク通知メールを送る |
| reports_to_id | この人の「報告先」メンバーID（任意）。設定すると、この人が担当するタスクの日程変更・確認待ち通知はここで指定した人（例：事業部長）に届きます。未設定の場合は従来通り `notify_new_task` オプトイン者、いなければ代表全員に届きます |
| mentor_id | この人の「メンター/サポート担当」メンバーID（任意）。個人ページの人材育成タブから管理者が設定でき、同タブに表示されます |
| joined_at | 団体への所属開始日（YYYY-MM-DD、任意）。`years_of_experience`（社会人経験など団体外も含む自己申告の年数）とは別物で、個人ページの Overview に「所属歴：◯年◯ヶ月」として正確な期間が表示されます。本人または管理者が編集できます |
| unavailable_dates | 本人が稼働できない日（カンマ区切り、YYYY-MM-DD）。個人ページのカレンダーから本人が編集します |
| avatar_color | アイコンの背景色（16進カラーコード、任意）。個人ページから本人が変更できます。空欄の場合はIDから自動生成された色になります |
| avatar_initials | アイコンに表示するイニシャル（任意、2文字まで）。空欄の場合は氏名から自動生成されます |
| avatar_url | アップロードされたプロフィール画像のURL（任意）。個人ページから本人が画像をアップロードすると自動で設定されます。設定されている間は `avatar_color` / `avatar_initials` より優先して表示されます。色・イニシャルを選び直すと自動でクリアされます |
| years_of_experience | 経験年数（数値、任意）。個人ページの「経歴・キャリア」タブから編集し、Admin → Membersの人材検索フィルタで使われます |
| has_management_experience | TRUE なら管理職経験あり。同上、人材検索フィルタで使われます |
| desired_areas | 成長したい領域・スキル（カンマ区切り、任意）。Will（やりたいこと）や skills（保有スキル）とは別項目で、人材検索フィルタで使われます |
| career_history_json | 経歴の配列（JSON文字列、例：`[{"id":"c-1","startDate":"2024-04-01","affiliation":"...","role":"...","description":"..."}]`）。個人ページの「経歴・キャリア」タブで本人が編集できます |
| qualifications_json | 保有資格の配列（JSON文字列）。同タブで本人が編集できます |
| evaluation_history_json | 評価履歴の配列（JSON文字列、評価者ID・評価・コメントを含む）。管理者のみが同タブから編集できます |
| transfer_history_json | 異動履歴の配列（JSON文字列）。管理者のみが同タブから編集できます |
| skill_levels_json | スキルごとの習熟度（1〜5、JSON文字列）。本人が同タブから編集できるほか、タスクを完了するとその要求スキルがLv.1（「やり始めたばかり」の意味）で自動登録されます。要求分野（skill_field_skills/skill_field_threshold、§4.6）の認定は、ここに登録されたスキルの保有率で判定されます |
| competencies_json | 役職に関連するコンピテンシー評価（1〜5、JSON文字列）。管理者のみが同タブから編集できます |
| career_aspiration | 将来やりたいこと・キャリア志向（自由記述、任意）。本人が同タブから編集できます |
| desired_future_role | 目指したい役職・ポジション（自由記述、任意）。同上 |
| career_plan | キャリアプランのメモ（自由記述、任意）。同上 |
| training_history_json | 研修受講履歴の配列（JSON文字列）。本人が「申請」すると承認待ち(status: pending)で追加され、管理者が同タブで承認/却下できます（承認待ち中は報告先/管理者にメール通知、決定後は本人に通知） |
| development_plan_json | 育成計画（目標・達成目安日・状態の配列、JSON文字列）。管理者と本人の双方が同タブから編集できます |
| one_on_ones_json | 1on1記録の配列（JSON文字列、日付・相手ID・メモ）。管理者が同タブから編集できます |

Admin → Membersの「メンバーを登録」フォームから新規メンバーを直接追加できます
（役職を「一般」以外にすれば、その場で管理者として登録できます＝管理者登録）。
なお「所属」欄は表示上の初期値としてローカルに反映されますが、Membersシートには
専用の列がなく、`project_ids` から動的に算出される値なので、スプレッドシートに
同期後は再取得のタイミングで所属プロジェクトの表示に置き換わります（他の管理者
登録メンバーと同様です）。

### Projects
| 列 | 内容 |
|---|---|
| id | プロジェクトID |
| name | プロジェクト名 |
| description | 概要 |
| type | プロジェクトの種類（例：コンテンツ開発）。Admin → Projects でこの種類ごとのテンプレートタスクを設定でき、新規プロジェクト作成時に自動で追加されます |
| member_ids | 担当者のメンバーID（複数可、カンマ区切り）。Admin → Projects から設定でき、このプロジェクトのタスクに新しく誰かをアサインすると自動的にここへ追加されます |
| owner_id | 責任者のメンバーID（任意）。Admin → Projects から設定します |
| archived | `TRUE`/`FALSE`。アーカイブすると削除はせず、OUTPUTの「プロジェクト」タブや通常の一覧から隠れます。Admin → Projects から切り替えられます |

### Tasks
設計ドキュメント §4 の基本列に加え、UIが使う追加列（`department` 以降）があります。

| 列 | 内容 |
|---|---|
| id | タスクID |
| project_id | 所属プロジェクトID |
| title | タスク名 |
| description | 詳細 |
| status | 未着手 / 進行中 / サポート必要 / 確認待ち / 修正中 / 完了 |
| assign_type | open_bid / manager_assign / request / personal |
| assignee_id | 担当者ID（複数可、カンマ区切り。空欄可） |
| creator_id | 作成者ID |
| accepted_at | request方式の承諾日時（未使用） |
| deliverable_url | 成果物リンク（未使用） |
| feedback_comment | 完了時FB（未使用） |
| created_at | 作成日 |
| start_date | 開始日（YYYY-MM-DD、任意） |
| due_date | 期限（YYYY-MM-DD） |
| due_time | 期限の時刻（HH:MM、任意）。カレンダー表示とGoogleカレンダー同期に使用 |
| visibility | 全員 / 幹部（幹部＝一般以外の全権限レベル、初期値では班長・事業責任者・代表が閲覧可） |
| department | 部門タグ |
| category | カテゴリ（タレントマッチングにも使用） |
| skills | 要求スキル（カンマ区切り） |
| difficulty | 新人歓迎 / 少し経験必要 / 経験者向け |
| priority | 高 / 中 / 低 |
| completed_date | 完了日 |
| last_activity | 最終更新日（放置検知に使用） |
| progress_note | 直近の進捗メモ |
| progress_history_json | 進捗メモの履歴の配列（JSON文字列、例：`[{"id":"pg-1","text":"...","at":"2026-01-01T00:00:00.000Z","byId":"1"}]`）。タスク詳細の進捗ログに新しい順で表示されます |
| original_input_id | 生成元の自然文入力ID |
| approval_status | 承認待ち / 承認済み（空欄は承認済み扱い） |
| depends_on_ids | このタスクの前提タスクID（複数可、カンマ区切り）。ワークスペースの「依存関係」表示で、枝でつないだツリーとして表示されます（既存の「ワークフロー」カンバンとは別のビューです） |
| reviewer_id | 担当者とは別の「確認者」メンバーID（任意）。タスク詳細から設定でき、「確認待ち」ステータスと組み合わせて誰の確認待ちかを明確にします |
| blocker_note | 「困っている/作業が止まっている」ことを示すメモ（任意、空欄ならブロックされていない）。Admin ダッシュボードの Blocked Tasks に表示されます |
| blocker_since | ブロック登録日（YYYY-MM-DD）。`blocker_note` と同時に設定されます |
| deliverables_json | 成果物リンクの配列（JSON文字列、例：`[{"id":"dl-1","label":"ポスターPDF","url":"https://drive.google.com/..."}]`）。タスク詳細と個人の実績ページに表示されます |
| history_json | フィールド変更履歴の配列（JSON文字列）。担当者・期限・開始日・優先度・ステータス・確認者の変更を記録し、タスク詳細に表示されます |
| comments_json | コメントの配列（JSON文字列）。タスク詳細のコメント欄に表示されます |
| estimated_hours | 想定所要時間（時間、数値、任意）。タスク詳細から編集でき、INPUT画面では同カテゴリの過去実績の平均をおすすめ表示します。Admin → Assignments の「今週の工数」表示にも使われます |
| actual_hours | 実績所要時間（時間、数値、任意）。タスク詳細から担当者/管理者が編集できます |
| retrospective_json | 完了時の振り返り（JSON文字列、例：`{"good":"...","bad":"...","improve":"..."}`）。ステータスが完了のタスクでタスク詳細から編集でき、似たタスクの登録時（Admin承認画面・INPUT結果画面）に改善点として表示されます |
| schedule_json | 日程調整の候補日時・招待メンバー・回答（JSON文字列）。タスク詳細の「日程調整」欄から設定・回答でき、招待者全員が回答し終えると自動的にステータスが完了になり、作成者に結果がメール通知されます |
| form_json | 汎用フォームの質問項目・招待メンバー・回答（JSON文字列）。タスク詳細の「フォーム」欄から質問項目を自由に設定でき、招待者全員が回答し終えると自動的にステータスが完了になり、作成者に回答結果がメール通知されます |
| importance | タスクの重要度：一般 / 重要 / 対外公開（空欄は一般扱い）。INPUT画面で設定します。重要・対外公開のタスクは、登録者の報告先ではなく最下位以外の管理者ロール（初期値では事業責任者・代表）のみが承認できます |

> `accepted_at` / `deliverable_url` / `feedback_comment` は現状のUIからは未使用です（次フェーズ）。列として残しておいて構いません。

### 承認フロー

INPUT画面からタスクが登録されると `approval_status` が「承認待ち」で作成され、
管理者が Admin → 承認 で確認するまでワークスペース（カンバン/リスト/カレンダー/
個人ページなど）には表示されません。承認すると「承認済み」に変わり、通常通り
見えるようになります。既存の行（このカラムが空欄）は承認済み扱いです。

タスク登録と同時に、Membersシートで `notify_new_task` が TRUE の人（の `email`）
宛にメールが飛びます。1人も TRUE にしていない場合は role が「代表」の人全員に
自動的に送られるので、通知が誰にも届かない状態にはなりません。

Admin → 承認 の各タスクには「承認する」に加えて「承認しない」ボタンもあり、
押すとそのタスクは削除され、任意の理由とともに登録者へメールで通知されます。

### 完了の確認フロー

担当者は「完了」ボタンを直接押せません（管理者のみ）。担当者が押せるのは
「確認待ち」までで、ここで同じ通知先（`notify_new_task` / 代表フォールバック）に
メールが飛びます。管理者のDashboard（確認待ちパネル）にも自動的に表示されるので、
そこから「完了」に変更＝確認したことになります。

### 日程変更の通知

タスク詳細（右から出るパネル）で管理者が開始日・期限を変更すると、その場で通知
メールが飛びます。宛先はタスクの担当者に `reports_to_id`（報告先）が設定されて
いればその人、なければ従来通り `notify_new_task` オプトイン者、いなければ代表
全員です。

### タスクの公開範囲

`visibility` を「幹部」にすると、そのタスクは一般メンバーには一覧・カンバン・
カレンダーなどどこにも表示されなくなり、一般以外の権限レベル（初期値では班長・
事業責任者・代表）にのみ見えます。INPUT画面の「公開範囲」欄で設定します。

### 複数担当者

`assignee_id` はカンマ区切りで複数人入れられます。1つのタスクに何人でもアサイン
できます。

### Googleカレンダー同期

担当者がアサインされ、かつ `due_date` が入っているタスクは、Apps Scriptを実行して
いるGoogleアカウントのデフォルトカレンダーに予定を作成し、担当者のメールアドレスへ
招待を送ります（`due_time` があれば1時間の予定、なければ終日予定）。再アサインすると
同名の既存の予定を消してから作り直します。`email` が入っていない担当者は招待されません。

### 定期タスクの自動生成（サーバー側トリガー）

Admin → Projects で設定した定期タスク（`RecurringTaskRule`）は、誰かがOrbitを開いた
タイミングでもクライアント側からチェック・生成されますが、それとは別に、`Code.gs`
自体にもサーバー側で毎日自動チェックする `generateRecurringTasks()` を用意しています。
これを使うと、誰もアプリを開かなかった日でも定期タスクが確実に生成されます。

**前提条件**: この機能は `SETTINGS_CSV`（「4.6」参照）を設定している場合のみ動作します。
定期タスクのルール自体がSettingsシートの `recurring_rules` に保存されるため、
Settingsシートを使っていない場合はサーバー側から参照するものがありません。

有効にするには、Apps Script のエディタで一度だけ以下を行います。

1. `Code.gs` の関数選択のプルダウンから `setupDailyTrigger` を選ぶ
2. ▶ 実行 をクリックする（初回はトリガー作成の権限承認を求められます）

これで毎日1回（スクリプトのタイムゾーンで朝6時ごろ）`dailyMaintenance` が自動実行され、
定期タスクの生成と、後述するDiscordへの期限超過タスク通知が行われます。再度
`setupDailyTrigger` を実行しても、既存のトリガーを削除してから作り直すだけなので
二重に生成されることはありません。

## 2. Apps Script のデプロイ

1. スプレッドシートを開き、拡張機能 → Apps Script
2. デフォルトの `Code.gs` の中身をこのフォルダの `Code.gs` の内容で置き換える
3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
   - 実行するユーザー: **自分**
   - アクセスできるユーザー: **全員**
4. デプロイ後に表示される `/exec` で終わるURLをコピー

## 3. シートのCSV公開

各シート（Members / Projects / Tasks）ごとに:

1. ファイル → 共有 → ウェブに公開
2. 公開する範囲でそのシート名を選択、形式は「カンマ区切りの値(.csv)」
3. 発行して表示されるURLをコピー

## 4. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に以下を設定します（すでに設定済み）。

| Secret名 | 値 |
|---|---|
| `MEMBERS_CSV` | Membersシートの公開CSV URL |
| `PROJECTS_CSV` | Projectsシートの公開CSV URL |
| `TASKS_CSV` | Tasksシートの公開CSV URL |
| `CSV_GAS` | 手順2でコピーしたApps Web AppのURL |
| `DRIVE_FOLDER_ID` | （任意）プロフィール画像のアップロード先。次の「4.5」参照 |
| `SETTINGS_CSV` | （任意）Settingsシートの公開CSV URL。「4.6」参照 |

`.github/workflows/deploy.yml` がビルド時にこれらを `NEXT_PUBLIC_*` 環境変数として
埋め込みます。**注意**: これは静的サイトなので、埋め込んだ後はビルド成果物
（＝公開サイトのJavaScript）を見れば誰でもこれらのURLを読み取れます。設計ドキュメント
§3の通り、なりすまし防止をしない内輪利用・デモ用途を前提とした構成です。機密情報を
含むデータはこのスプレッドシートに置かないでください。

## 4.5. プロフィール画像アップロード（任意）

個人ページから本人が自分の顔写真をアップロードできるようにするには：

1. Googleドライブでアップロード先フォルダを新規作成する（例：「Orbit avatars」）
2. フォルダを開いた状態のURL（`https://drive.google.com/drive/folders/`
   の後ろの文字列）がフォルダIDです。これをコピー
3. リポジトリの Secrets に `DRIVE_FOLDER_ID` としてこのIDを追加
4. 手順2（Apps Script のデプロイ）をやり直すか、既存のデプロイを更新する
   （`uploadAvatar` アクションがDriveへの書き込み権限を新たに必要とするため、
   初回実行時に権限の再承認を求められることがあります）

`DRIVE_FOLDER_ID` を設定しない場合、個人ページの画像アップロードボタンは無効表示に
なり、これまで通り色とイニシャルのアイコンが使われます。アップロードされた画像は
「リンクを知っている全員が閲覧可」で共有され、`<img>` タグから直接表示できるURL
（`https://lh3.googleusercontent.com/d/...`）としてMembersシートの `avatar_url`
に保存されます。同じ人が再アップロードすると、フォルダ内の古いファイルは自動で
ゴミ箱に移動されます。

## 4.6. 選択肢プールのスプレッドシート同期（任意）

INPUT画面の「要求スキル」「カテゴリ」、Admin → Tagsの「権限レベル」、Admin →
Projectsの「プロジェクトの種類・テンプレートタスク」は、デフォルトではブラウザの
localStorageにのみ保存され、他の人の画面には反映されません。全員の画面で共有する
には：

1. スプレッドシートに新しいシートを追加し、シート名を `Settings` にする
2. 1行目に `key`, `value` の2列のヘッダーを入れる（データ行は空のままでOK。
   最初の書き込み時に自動で行が追加されます）
3. Settingsシートも他の3シートと同じ手順で「ウェブに公開」し、CSV URLを取得
4. リポジトリの Secrets に `SETTINGS_CSV` としてこのURLを追加

設定すると、要求スキル・要求分野・カテゴリ・権限レベル・権限レベルごとの管理画面
表示範囲・プロジェクトテンプレート・業務テンプレート・定期タスクルール・
ポジション要件・要求分野の構成・団体メール・プロジェクトの表示順の追加や変更が
その場でSettingsシートに書き込まれ（`key` 列は `skill_options` /
`skill_field_options` / `category_options` / `role_levels` / `role_permissions` /
`project_templates` / `task_set_templates` / `recurring_rules` / `job_requirements` /
`skill_field_skills` / `skill_field_threshold` / `org_notification_emails` /
`project_order`、`value` 列はカンマ区切り文字列、`role_permissions` /
`project_templates` / `task_set_templates` / `recurring_rules` / `job_requirements` /
`skill_field_skills` のみJSON文字列、`skill_field_threshold` のみ0〜1の数値文字列）、
次回以降は誰の画面を開いてもそこから読み込まれます。未設定の場合はこれまで通り
ブラウザごとのlocalStorageにフォールバックし、何も壊れません。

`org_notification_emails`（団体メール）は、Admin → Tagsで幹部/事業責任者（=最下位
以外の権限レベル、いわゆるfull admin）が登録・削除できる、カンマ区切りの共有配信先
メールアドレスです。個々のメンバーの「新規タスク通知」設定に関わらず、
`notifyAdmins()`（承認依頼・確認待ち・研修申請など全ての管理者向け通知の共通経路。
gas/Code.gs参照）が送るメールに常に追加されます。この値はメールアドレスという
公開して問題ない情報なので、次のDiscord Webhook URLとは異なり、この公開Settings
シートにそのまま保存されます。

> **注意**: Discord Webhook URL（次の「4.7」）は、上と同じ仕組みには**あえて
> 乗せていません**。Settingsシートは他の3シートと同様に「ウェブに公開」の
> 公開CSVなので、そこに書けば誰でも読める状態になってしまいます。Webhook URLは
> 知っている人なら誰でもそのDiscordチャンネルに投稿できてしまう、いわば
> パスワードのような値なので、別の非公開の仕組みで保存しています。

## 4.7. Discord Webhook 連携（任意）

タスクが確認待ちになったとき、および期限超過タスクの日次サマリーを、指定した
Discordチャンネルに通知できます。

1. Discordで通知したいチャンネルの設定 → 連携サービス → ウェブフック → 新しい
   ウェブフックを作成し、URLをコピーする
2. Orbitの Admin → Tags の「Discord Webhook 連携」欄にこのURLを貼り付けて保存する

**前提条件**: `CSV_GAS`（書き込み用のApps Script URL。「4. GitHub Secrets」参照）が
設定されていれば動作します。`SETTINGS_CSV` は不要です。

**セキュリティ上の設計**: Webhook URLは Settings シート（公開CSV）には一切保存され
ません。Admin → Tags から保存すると、Apps Scriptの `PropertiesService`
（このスクリプトプロジェクトからしかアクセスできない非公開のキー/バリュー領域）に
書き込まれます。この値をクライアントへ読み返すエンドポイントも用意していないため、
一度保存すると画面上には二度と表示されません（書き込み専用）。変更したい場合は
新しいURLを入力して再度保存してください。

通知される内容:

- **確認待ち**: 担当者がタスクを「確認待ち」にした瞬間、既存のメール通知
  （`notifyReview`）と同時にDiscordへも投稿されます
- **期限超過タスク**: 「定期タスクの自動生成（サーバー側トリガー）」で設定した
  日次トリガー（`dailyMaintenance`）が、期限を過ぎていて未完了のタスクを一覧化して
  1日1回投稿します。日次トリガーを設定していない場合、この通知は届きません
  （確認待ち通知はトリガーなしでも動作します）

## 5. 動作確認

secrets未設定のままだと従来通りローカルのモックデータで動きます。4つの必須 secrets
が揃うと、次回のデプロイ以降は自動でスプレッドシートからの読み込み・書き込みに
切り替わります（`DRIVE_FOLDER_ID` は任意で、画像アップロード機能のみに影響します）。

## 5.5. メール通知が届かないときの確認手順

通知系の関数（`notifyAdmins` / `notifyReview` / `notifyMention` / `notifyTrainingRequest` /
`notifyTrainingDecision` / `notifyScheduleResult` / `notifyScheduleChange` など）はすべて
「メール送信に失敗してもタスクの登録・更新自体は失敗させない」設計のため、try/catchで
エラーを握りつぶします。そのため送信に失敗していても画面上はエラーが出ません。原因切り分けは
次の順で行ってください。

1. **`Code.gs` を編集したら必ず再デプロイする** — Apps Scriptエディタの保存だけでは既存の
   Webアプリ（`/exec` URL）には反映されません。デプロイ → デプロイを管理 → 対象のウェブ
   アプリの編集(鉛筆アイコン) → バージョン「新規」を選んで更新してください。
2. **実行ログを見る** — Apps Scriptエディタ左メニューの「実行数」（Executions）を開き、
   問題の操作（コメント投稿・研修申請・タスク登録など）を行った直後の実行を選ぶと、
   上記の関数群が `console.log`/`console.warn`/`console.error` で送信結果や失敗理由を
   出力します（例: 「no recipients resolved」「Members sheet has no "email" column」）。
3. **Membersシートの `email` 列を確認する** — 通知したい相手（または代表・班長などの
   管理者ロールのメンバー）に `email` が入力されているか確認してください。`notify_new_task`
   を`TRUE`にしたメンバーがいない場合は「一般以外のロールを持つ全員」にフォールバックする
   ため、そのフォールバック先にメールアドレスが入っていないと誰にも届きません。
   個々のメンバー設定に依存させたくない場合は、Admin → Tagsの「団体メール」（§4.6）に
   共有の配信先アドレスを登録しておくと、そちらには常に届きます。
4. **MailAppの1日あたり送信上限を確認する** — 個人のGoogleアカウントは1日100通程度、
   Google Workspaceアカウントはプランに応じてより多い上限があります。Apps Scriptエディタで
   一時的に `function checkQuota() { console.log(MailApp.getRemainingDailyQuota()) }` を
   実行し、実行ログで残り件数を確認してください。上限に達している場合、翌日まで送信できません。
5. **Webアプリの実行ユーザー設定を確認する** — デプロイ設定が「実行するユーザー: 自分」に
   なっているか確認してください（§2参照）。「アクセスしているユーザー」になっていると、
   匿名アクセスからのメール送信権限がなく失敗します。

## 5.6. GASエンドポイントの認証設定 (GOOGLE_OAUTH_CLIENT_ID)

`Code.gs` の `doPost` は、すべてのリクエストに対してGoogleアクセストークンを検証します。
フロントエンドはログイン時に取得したGoogleアクセストークンを `authToken` フィールドとして
毎回のPOSTに添付します。GAS側はそのトークンをGoogleの `tokeninfo` エンドポイントに送り、
メールアドレスとオーディエンス（クライアントID）を確認した上でMembersシートと照合します。

### 設定手順

1. **GCPのOAuth 2.0クライアントIDを確認する**
   Google Cloud Console → 対象プロジェクト → 「APIとサービス」→ 「認証情報」で
   Webアプリ用の「OAuthクライアントID」を確認します。
   `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` GitHub SecretにセットしているIDと同じ値です。

2. **Apps Scriptのスクリプトプロパティに登録する**
   Apps Scriptエディタを開き、「プロジェクトの設定」（歯車アイコン）→「スクリプト プロパティ」
   →「プロパティを追加」で以下を登録してください。

   | プロパティ名 | 値 |
   |---|---|
   | `GOOGLE_OAUTH_CLIENT_ID` | GCPのWebアプリ用クライアントID（例: `123456789-xxxx.apps.googleusercontent.com`） |

3. **登録後に再デプロイする**
   スクリプトプロパティの変更は実行中のWebアプリにすぐ反映されます（再デプロイ不要）が、
   念のため「デプロイを管理」→「バージョン新規」で再デプロイすることを推奨します。

### 動作

- `GOOGLE_OAUTH_CLIENT_ID` が未設定の場合、オーディエンス検証はスキップされますが
  メールアドレスの照合は引き続き行われます（開発環境向けのフォールバック）。
- トークンが無効・期限切れの場合は `{ ok: false, error: "..." }` が返り、
  フロントエンドのトースト通知に表示されます。「再ログインしてください」という
  エラーメッセージが出たら、一度ログアウトして再ログインしてください。
- アクセストークンの有効期限はGoogleのデフォルトで**1時間**です。長時間操作しない
  でいると期限切れエラーが出ることがあります。

### 権限チェックの概要

| アクション | 許可条件 |
|---|---|
| updateRole, removeMember, removeProject, updateDiscordWebhookUrl, updateSetting, addMember, updateEmail, updateJoinedAt, updateReportsTo, updateMentor, updateEvaluationHistory, updateTransferHistory, updateOneOnOnes, updateCompetencies, notifyTrainingDecision | 代表のみ |
| approveTask, updateJudgment, assignTask, updateTaskDetails, updateVisibility, updateReviewer(s), removeTask, createProject, updateProject*, updatePriority, updateDifficulty, updateSchedule, updateDependsOn, setBlocker, notifyTaskRejected, updateSearchProfile | 代表 または 班長（任意の管理者ロール） |
| updateSkillLevels, updateCareerGoals, updateDevelopmentPlan, updateCareerHistory, updateQualifications, updateTrainingHistory, notifyTrainingRequest | 本人 または 管理者 |
| updateWill, updateNotify, updateNotifySettings, updateAvatar, uploadAvatar, updateDisplayName, updateUnavailableDates | 本人のみ |
| createTasks, updateProgress, updateComments, notifyMention, updateEstimatedHours, updateActualHours, updateRetrospective, updateTaskSchedule, notifyScheduleResult, updateTaskForm, notifyFormResult, updateHistory, updateDeliverables | ログイン済みなら誰でも |
| updateTaskStatus | ログイン済み かつ 担当者であること |

## 既知の制約

- 設計ドキュメント §3 が定める「自分の project_ids の範囲に限定」というスコープ制限は
  実装済みです。権限レベルのうち最下位のもの（初期値は「班長」。Admin → Tagsで確認・
  変更できます）以外を持つメンバーは、プロジェクトの新規作成・削除・テンプレート管理、
  `重要`/`対外公開`タスクの承認も含めて組織全体のAdmin画面（Dashboard / Approvals /
  Assignments / Projects / Members / Tags）にフルアクセスできます（初期値では
  事業責任者・代表がこれに当たり、両者は完全に同じ権限を持ちます）。最下位の管理者ロール
  （例：「班長」）だけが Admin → Membersの「担当プロジェクト」で割り当てたプロジェクトの
  範囲に限定されます。`reports_to_id` による通知先の階層分けと併用できます。
- 通知メールの「オプトインが誰もいない場合のフォールバック」（`notifyAdmins`関数）は、
  役職名を問わず「一般」以外の役職を持つメンバー全員を対象にします（特定の役職名を
  ハードコードしていないため、役職を自由に追加・削除・改名しても壊れません）。
- プロフィール画像はGoogleドライブの画像URLをそのままハイパーリンクしています。
  Google側の仕様変更やアクセス集中時の挙動保証はないため、確実な配信が必要な場合は
  別途CDNなどの利用を検討してください。アップロードされる画像は圧縮のうえ256×256に
  リサイズされますが、Apps Scriptの実行時間・POSTボディサイズには上限があるため、
  極端に大きい画像（数十MB）は失敗する場合があります。
- 「ウェブに公開」のCSVはGoogle側のキャッシュにより反映まで数分かかることがあります。
  書き込みはその場でシートに反映されますが、読み込み側（他の人の画面）への反映には
  ラグがあります。この影響で、定期タスクのサーバー側トリガー（後述）とクライアント側の
  生成チェックが同じ日にごく近いタイミングで重なった場合、まれに同じ定期タスクが
  2件生成されることがあります（`lastGeneratedDate` は自動修復されないので、その場合は
  重複した方を手動で削除してください）。
- 通知メールは Apps Script を実行しているGoogleアカウントの `MailApp` 経由で送られます
  （1日の送信数に上限あり）。`email` 列が空の人には送れないので、通知したい相手の
  メールアドレスは必ず入力してください。
- INPUT画面の選択肢プール（要求スキル・カテゴリ）、権限レベルとその表示範囲、
  プロジェクトの種類・テンプレートタスク、業務テンプレート、定期タスクルール、
  ポジション要件は、`SETTINGS_CSV` を設定していない場合はブラウザのlocalStorageにのみ
  保存され、他の人の画面には反映されません。「4.6」の手順で設定すると、スプレッドシート
  経由で全員の画面に同期されます。
- Googleカレンダー同期は初回デプロイ時にCalendarへのアクセス許可を求められます
  （Apps Scriptの承認画面で許可してください）。許可していない場合、同期は失敗しますが
  タスクの作成・アサイン自体は失敗しません（ベストエフォート）。
- 定期タスクのサーバー側トリガー（「定期タスクの自動生成（サーバー側トリガー）」）と
  Discordの期限超過サマリー（「4.7」）は、どちらも `setupDailyTrigger` を一度手動実行
  しない限り動作しません。Discord Webhook URLは書き込み専用（保存後は画面に一切
  表示されません）なので、忘れた場合はDiscord側で同じチャンネルのWebhookを作り直して
  再設定してください。
