# スプレッドシート連携セットアップ

Orbit は Google スプレッドシートを「データベース」として使います。
読み取りはシートのCSV公開URL、書き込みは Apps Script（GAS）の Web App 経由で行います。

このドキュメントは **GitHub・GAS を使ったことがない人** にも迷わず設定できるよう書かれています。
用語の説明なども入れていますので、上から順番に読み進めてください。

---

## はじめに: 全体の流れ

```
Google スプレッドシート（データの保存場所）
        ↑ 読み込み (CSV公開URL)
        ↓ 書き込み (Apps Script Web App)
   Orbit アプリ（GitHub Pages でホスト）
```

大まかな手順は次の 5 ステップです:

1. スプレッドシートにシートを作り、列を用意する
2. Apps Script（`Code.gs`）をスプレッドシートに貼り付けてデプロイする
3. 各シートを「ウェブに公開」してCSV URLを取得する
4. GitHub の Secrets にURLを登録する
5. GitHub Actions でビルド・デプロイする

---

## 1. シートの列構成

`database.xlsx`（リポジトリのサンプル）と同じ列名・順序にしてください。
列名は1行目のヘッダーで判定するので位置がずれても動きますが、**列名は完全一致が必要**です。

> **用語: シートとは?**  
> Google スプレッドシートはExcelのように複数のシートをタブで切り替えられます。  
> ここでは `Members`・`Projects`・`Tasks` の 3 枚のシートを作ります。

### Members（メンバー情報）

| 列名 | 内容 |
|---|---|
| id | メンバーID（重複しない任意の文字列、例: `m-1`） |
| name | 氏名（登録名） |
| display_name | 表示名（任意）。設定されていればUI上はこちらが優先表示されます |
| role | 一般、またはAdmin → Tagsで自由に追加できる権限レベル（初期値：班長・事業責任者・代表）。「一般」以外はすべて何らかの管理者権限を持ちます |
| project_ids | 最下位の管理者ロール（例：班長）が担当するプロジェクトID（複数可、カンマ区切り）。Admin → Membersの「担当プロジェクト」から設定できます |
| will_tags | 本人入力の得意分野・希望タスク（カンマ区切り） |
| judgment_tags | 管理者入力の評価タグ（カンマ区切り） |
| email | 通知メールの送信先（新規タスク通知に使用）。個人ページの「アカウント設定」から本人が編集できます |
| notify_new_task | `TRUE` ならこの人に新規タスク通知メールを送る |
| reports_to_id | この人の「報告先」メンバーID（任意）。設定すると、この人が担当するタスクの日程変更・確認待ち通知はここで指定した人に届きます |
| mentor_id | この人の「メンター/サポート担当」メンバーID（任意）。個人ページの人材育成タブから管理者が設定します |
| joined_at | 団体への所属開始日（`YYYY-MM-DD`、任意）。個人ページの Overview に「所属歴：◯年◯ヶ月」として表示されます |
| unavailable_dates | 本人が稼働できない日（カンマ区切り、`YYYY-MM-DD`）。個人ページのカレンダーから本人が編集します |
| avatar_color | アイコンの背景色（16進カラーコード、任意）。空欄の場合はIDから自動生成されます |
| avatar_initials | アイコンに表示するイニシャル（任意、2文字まで）。空欄の場合は氏名から自動生成されます |
| avatar_url | アップロードされたプロフィール画像のURL（任意）。個人ページから本人が画像をアップロードすると自動で設定されます |
| years_of_experience | 経験年数（数値、任意）。Admin → Membersの人材検索フィルタで使われます |
| has_management_experience | `TRUE` なら管理職経験あり。人材検索フィルタで使われます |
| desired_areas | 成長したい領域・スキル（カンマ区切り、任意）。人材検索フィルタで使われます |
| career_history_json | 経歴の配列（JSON文字列）。個人ページの「経歴・キャリア」タブで本人が編集できます |
| qualifications_json | 保有資格の配列（JSON文字列）。同タブで本人が編集できます |
| evaluation_history_json | 評価履歴の配列（JSON文字列）。管理者のみが同タブから編集できます |
| transfer_history_json | 異動履歴の配列（JSON文字列）。管理者のみが同タブから編集できます |
| skill_levels_json | スキルごとの習熟度（1〜5、JSON文字列）。本人が同タブから編集でき、タスク完了時にも自動登録されます |
| competencies_json | 役職に関連するコンピテンシー評価（1〜5、JSON文字列）。管理者のみが編集できます |
| career_aspiration | 将来やりたいこと・キャリア志向（自由記述、任意）。本人が同タブから編集できます |
| desired_future_role | 目指したい役職・ポジション（自由記述、任意） |
| career_plan | キャリアプランのメモ（自由記述、任意） |
| training_history_json | 研修受講履歴の配列（JSON文字列）。本人が「申請」すると承認待ちで追加され、管理者が承認/却下できます |
| development_plan_json | 育成計画（目標・達成目安日・状態の配列、JSON文字列） |
| one_on_ones_json | 1on1記録の配列（JSON文字列、日付・相手ID・メモ） |
| department_path | 組織階層パス（`>` 区切り、例: `事業本部A>事業部1>グループX`、任意）。Admin → 組織図で使われます |
| permission_overrides_json | 個別権限オーバーライド定義（JSON文字列、任意）。代表のみが設定できます |
| skill_points_json | スキルごとの累計ポイント（JSON文字列、例: `{"デザイン":120}`）。自動で更新されます |
| notify_settings | 通知頻度の個別設定（JSON文字列、任意）。個人ページの「アカウント設定」から設定できます |
| inactive | `TRUE` なら休止中メンバー（一覧から非表示）。Admin → Members から設定できます |
| absent_dates | 不在日リスト（カンマ区切り、`YYYY-MM-DD`）。個人ページから本人が編集できます |
| last_login | 最終ログイン日時（ISO datetime）。ログイン時に自動更新されます |
| last_inactive_notified | 未アクセス通知を最後に送った日（`YYYY-MM-DD`）。重複通知防止に使われます |
| timezone | 本人のタイムゾーン（IANA名、例: `Asia/Tokyo`）。個人ページの「言語 / タイムゾーン」から本人が設定できます。未設定時はJST扱い |
| locale | 本人の表示言語（例: `ja`, `en`）。個人ページの「言語 / タイムゾーン」から本人が設定できます。未設定時は日本語扱い |

> Admin → Membersの「メンバーを登録」フォームから新規メンバーを直接追加できます。
> スプレッドシートに直接行を追加することもできます。

### Projects（プロジェクト情報）

| 列名 | 内容 |
|---|---|
| id | プロジェクトID（例: `p-1`） |
| name | プロジェクト名 |
| description | 概要 |
| type | プロジェクトの種類（例：コンテンツ開発）。Admin → Projects でテンプレートタスクを設定できます |
| member_ids | 担当者のメンバーID（複数可、カンマ区切り） |
| owner_id | 責任者のメンバーID（任意） |
| parent_id | 上位プロジェクトのID（任意）。プロジェクトを入れ子にする場合に使います |
| archived | `TRUE`/`FALSE`。アーカイブすると一覧から隠れます |

### Tasks（タスク情報）

| 列名 | 内容 |
|---|---|
| id | タスクID（例: `t-1`） |
| project_id | 所属プロジェクトID |
| title | タスク名 |
| description | 詳細 |
| status | `未着手` / `進行中` / `サポート必要` / `確認待ち` / `修正中` / `完了` |
| assign_type | `open_bid` / `manager_assign` / `request` / `personal` |
| assignee_id | 担当者ID（複数可、カンマ区切り。空欄可） |
| creator_id | 作成者ID |
| created_at | 作成日 |
| start_date | 開始日（`YYYY-MM-DD`、任意） |
| due_date | 期限（`YYYY-MM-DD`） |
| due_time | 期限の時刻（`HH:MM`、任意）。カレンダー表示とGoogleカレンダー同期に使用 |
| visibility | `全員` / `幹部`（幹部＝一般以外の全権限レベル） |
| department | 部門タグ |
| category | カテゴリ |
| skills | 要求スキル（カンマ区切り） |
| difficulty | `新人歓迎` / `少し経験必要` / `経験者向け` |
| priority | `高` / `中` / `低` |
| completed_date | 完了日 |
| last_activity | 最終更新日（放置検知に使用） |
| progress_note | 直近の進捗メモ |
| progress_history_json | 進捗メモの履歴（JSON文字列） |
| original_input_id | 生成元の自然文入力ID |
| approval_status | `承認待ち` / `承認済み`（空欄は承認済み扱い） |
| depends_on_ids | 前提タスクID（複数可、カンマ区切り） |
| reviewer_id | 「確認者」メンバーID（任意、後方互換用） |
| reviewer_ids | 「確認者」メンバーID（複数可、カンマ区切り） |
| required_approvals | 確認待ちに必要な承認数（数値または `all`、任意） |
| blocker_note | 「困っている/作業が止まっている」メモ（任意） |
| blocker_since | ブロック登録日（`YYYY-MM-DD`） |
| deliverables_json | 成果物リンクの配列（JSON文字列） |
| history_json | フィールド変更履歴の配列（JSON文字列） |
| comments_json | コメントの配列（JSON文字列） |
| estimated_hours | 想定所要時間（時間、数値、任意） |
| actual_hours | 実績所要時間（時間、数値、任意） |
| retrospective_json | 完了時の振り返り（JSON文字列: `{"good":"...","bad":"...","improve":"..."}` ） |
| schedule_json | 日程調整の候補日時・招待メンバー・回答（JSON文字列） |
| form_json | 汎用フォームの質問項目・招待メンバー・回答（JSON文字列） |
| importance | `一般` / `重要` / `対外公開`（空欄は一般扱い） |
| awarded_points_json | 完了時に付与するスキルポイント（JSON文字列、例: `{"デザイン":30}`、任意） |

> `accept_at` / `deliverable_url` / `feedback_comment` は現状のUIからは未使用ですが、
> 列として残しておいて構いません。
>
> 経費申請・カスタムフォームの多段階承認で使われる `approval_steps_json`・`approval_records_json`・`current_step_index` は、
> `setupOrbit()` では自動追加されないため、使用する場合は手動で列を追加してください。

---

## 2. Apps Script のデプロイ

> **用語: Apps Script（GAS）とは?**  
> Google スプレッドシートに「プログラム」を書いて実行できる機能です。  
> Orbit はここに `Code.gs` を貼り付けることで、データの書き込み口（Web App）を作ります。

### 手順

1. スプレッドシートを開き、上部メニューの **「拡張機能」→「Apps Script」** をクリック
2. 開いたエディタの左側に `コード.gs` または `Code.gs` というファイルがある
3. その中身を**すべて選択して削除**し、リポジトリの `gas/Code.gs` の内容を丸ごとコピー&ペーストする
4. 上部の「保存」ボタン（フロッピーアイコン or `Ctrl+S`）で保存する
5. 上部の **「デプロイ」→「新しいデプロイ」** をクリック
6. 「種類の選択」で **「ウェブアプリ」** を選ぶ
7. 設定を次のようにする:
   - **実行するユーザー**: `自分`
   - **アクセスできるユーザー**: `全員`
8. 「デプロイ」をクリック（初回は権限の確認画面が出ます → 「アクセスを許可」）
9. デプロイ後に表示される **`/exec` で終わる URL** をコピーしておく（後で Secrets に使います）

> **Code.gs を更新した場合（アプリのバージョンアップ時）**:  
> Apps Script エディタで内容を貼り直し → 「デプロイ」→「デプロイを管理」→  
> 対象のウェブアプリの編集（鉛筆アイコン）→「バージョン」で **「新規」** を選んで更新。  
> 「保存」だけでは既存のURLには反映されません。
>
> **さらに、貼り直した Code.gs が Members/Projects/Tasks シートに新しい列を
> 追加している場合（例: `timezone`、`locale` 列の追加時）は、Apps Script
> エディタ上部の関数選択ドロップダウンで `setupOrbit` を選び ▶ 実行ボタンを
> 押してください。** これを忘れると、新しい列を使う機能（タイムゾーン設定
> など）の保存が「エラーも出ずに何も保存されない」状態になります
> （列が無いため書き込み先が見つからず、静かにスキップされていました。
> 現在は列が1つも見つからない場合はエラーを返すよう修正済みです）。

---

## 3. シートのCSV公開

各シート（Members / Projects / Tasks）について同じ操作を行います。

> **用語: ウェブに公開とは?**  
> シートを「誰でもURLを知っていれば読める」CSV形式で公開する機能です。  
> アクセストークン不要で読み取れるため、GitHub Actions のビルド時にデータを埋め込めます。

### 手順

1. スプレッドシートを開き、**「ファイル」→「共有」→「ウェブに公開」** をクリック
2. ドロップダウンで **「公開するシート」** を `Members`（または `Projects`、`Tasks`）に変更
3. 「ウェブページ」の選択を **「カンマ区切りの値（.csv）」** に変更
4. 「発行」をクリック
5. 表示されたURL（`https://docs.google.com/spreadsheets/d/...` で始まる）をコピーしておく
6. **`Projects`・`Tasks`でも同じ操作を繰り返す**（シートを切り替えて3回）

---

## 4. GitHub Secrets の設定

> **用語: GitHub Secrets とは?**  
> パスワードや秘密URLなど「コードに直接書きたくない値」を安全に保存しておける場所です。  
> ビルド時に GitHub Actions が自動的に読み込みます。

### 必須の Secrets

リポジトリの **「Settings」→「Secrets and variables」→「Actions」→「New repository secret」** から追加します。

| Secret名 | 値の取得場所 | 説明 |
|---|---|---|
| `MEMBERS_CSV` | 手順3でコピーした Members シートのURL | メンバー情報の読み込み |
| `PROJECTS_CSV` | 手順3でコピーした Projects シートのURL | プロジェクト情報の読み込み |
| `TASKS_CSV` | 手順3でコピーした Tasks シートのURL | タスク情報の読み込み |
| `CSV_GAS` | 手順2でコピーした `/exec` で終わるURL | データの書き込み口 |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | 後述「4.1」参照 | ログイン認証（Googleサインイン） |

### 任意の Secrets

| Secret名 | 説明 |
|---|---|
| `DRIVE_FOLDER_ID` | プロフィール画像アップロード先。後述「4.5」参照 |
| `SETTINGS_CSV` | 設定の全員共有に使う Settings シートのURL。後述「4.6」参照 |

**注意**: 静的サイトとしてビルドされるため、ビルド後のJavaScriptを見ればこれらのURLは誰でも読み取れます。機密情報を含むデータはスプレッドシートに置かないでください。

---

## 4.1. Google OAuth クライアントID の設定（Googleサインイン）

Orbit のログインには Google アカウントでのサインインを使います。
そのために Google Cloud Console でクライアントIDを取得する必要があります。

> 初めての方は少し複雑ですが、一度設定すれば変更の必要はありません。

### 手順

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. 左上のプロジェクト選択から **「新しいプロジェクト」** を作成（名前は何でもOK）
3. 左メニューの **「APIとサービス」→「OAuth 同意画面」** を開く
   - ユーザーの種類: **「外部」** を選択 → 「作成」
   - アプリ名・メールアドレスを入力 → 「保存して次へ」を何度かクリックして完了
4. 左メニューの **「APIとサービス」→「認証情報」** を開く
5. 上部の **「認証情報を作成」→「OAuthクライアントID」** をクリック
6. アプリケーションの種類: **「ウェブアプリケーション」** を選択
7. 「承認済みのJavaScriptオリジン」に以下を追加:
   - `https://<GitHubユーザー名>.github.io`（GitHub Pages のURL）
   - `http://localhost:3000`（ローカル開発用、任意）
8. 「作成」をクリック → **「クライアントID」** をコピー（`123456789-xxxx.apps.googleusercontent.com` の形式）
9. このIDを GitHub Secrets の `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` に登録する

#### Apps Script にも登録する

同じIDを Apps Script の「スクリプトプロパティ」にも登録します:

1. Apps Script エディタを開く
2. 左メニューの **「プロジェクトの設定」（歯車アイコン）**
3. 「スクリプト プロパティ」→「プロパティを追加」
4. プロパティ名: `GOOGLE_OAUTH_CLIENT_ID`、値: 上でコピーしたクライアントID

> `GOOGLE_OAUTH_CLIENT_ID` が未設定の場合、ログイン認証が簡易モードになります（メールアドレスのみ照合、クライアントIDの検証なし）。

---

## 4.5. プロフィール画像アップロード（任意）

個人ページから本人が顔写真をアップロードできるようにします。

### 手順

1. Google ドライブで **新規フォルダ** を作成（名前: `Orbit avatars` など）
2. フォルダを開いた状態のURLの `folders/` より後ろの部分がフォルダIDです  
   例: `https://drive.google.com/drive/folders/`**`1ABC2DEF3GHI`** → フォルダID は `1ABC2DEF3GHI`
3. このIDを GitHub Secrets の `DRIVE_FOLDER_ID` に登録する
4. Apps Script を **再デプロイ**（「デプロイを管理」→「バージョン: 新規」）

`DRIVE_FOLDER_ID` を設定しない場合、プロフィール画像アップロードボタンは無効になります。

---

## 4.6. 設定の全員共有（Settings シート、任意）

要求スキル・カテゴリ・権限レベルなどの選択肢は、デフォルトではブラウザのlocalStorageにのみ保存され、**他の人の画面には反映されません**。全員の画面で共有するには Settings シートを設定します。

### 手順

1. スプレッドシートに **新しいシート** を追加し、シート名を **`Settings`** にする
2. 1行目に **`key`、`value`** の2列のヘッダーを入れる（データ行は空のままでOK）
3. この `Settings` シートも **手順3と同じ「ウェブに公開」** でCSV URLを取得する
4. このURLを GitHub Secrets の `SETTINGS_CSV` に登録する

設定すると、以下の項目がそのままスプレッドシートに書き込まれ、次回以降は誰の画面を開いてもそこから読み込まれます:

| 設定キー | 内容 | 形式 |
|---|---|---|
| `skill_options` | 要求スキルの選択肢 | カンマ区切り文字列 |
| `category_options` | カテゴリの選択肢 | カンマ区切り文字列 |
| `role_levels` | 権限レベルの一覧（下位〜上位） | カンマ区切り文字列 |
| `role_permissions` | 権限レベルごとの管理画面表示範囲 | JSON文字列 |
| `project_templates` | プロジェクト種類ごとのテンプレートタスク | JSON文字列 |
| `task_set_templates` | 業務テンプレート | JSON文字列 |
| `recurring_rules` | 定期タスクのルール | JSON文字列 |
| `job_requirements` | ポジション要件（スキルマップ） | JSON文字列 |
| `skill_field_options` | 要求分野の選択肢 | カンマ区切り文字列 |
| `skill_field_skills` | 分野ごとの対応スキル | JSON文字列 |
| `skill_field_threshold` | 分野認定の閾値（0〜1） | 数値文字列 |
| `skill_level_thresholds` | スキルレベルアップの累計ポイント閾値 | JSON文字列（例: `{"デフォルト":100,"デザイン":150}`） |
| `quiz_definitions` | 検定（クイズ）の定義 | JSON文字列 |
| `radar_axes` | レーダーチャートの軸定義 | JSON文字列 |
| `expense_categories` | 経費申請カテゴリと承認フロー | JSON文字列 |
| `custom_form_defs` | 団体カスタムフォームの定義 | JSON文字列 |
| `org_notification_emails` | 管理者向け通知の共有配信先メールアドレス | カンマ区切りメールアドレス |
| `project_order` | プロジェクトの表示順 | カンマ区切り文字列 |
| `one_on_one_questions` | 1on1ワークシートの質問項目（Admin → Tags の UI から設定可） | JSON配列（文字列） |
| `initial_tasks_json` | 初ログイン時に付与されるタスク一覧（未設定時はハードコードの3件） | JSON配列（各要素に `name`・`description`） |
| `inactive_notify_days` | 未アクセス通知の閾値（日数、デフォルト25） | 数値文字列 |

> **`skill_level_thresholds`（スキルレベルアップ閾値）**: スキルポイントが何点に達したらレベルが上がるかを設定します。  
> 例: `{"デフォルト":100,"デザイン":150}` → デザインスキルは150点でレベルアップ、他は100点。

> **`expense_categories`（経費申請カテゴリ）**: Admin → 経費申請の承認カテゴリと多段階承認フローを定義します。  
> Admin → 経費申請の設定画面から GUI で編集できるため、JSON を手書きする必要はありません。

> **`initial_tasks_json`（初ログイン時付与タスク）**: 新規メンバーが初ログインしたときに自動付与されるタスクを定義します。  
> 例: `[{"name":"Orbitの使い方を確認する","description":"INPUT画面でタスクを登録してみましょう。"},{"name":"プロフィールを設定する","description":"スキルとWillを登録しましょう。"}]`  
> 未設定の場合はシステム組み込みの3件が付与されます。

> **`custom_form_defs`（カスタムフォーム）**: Admin → フォームで作成した団体独自の申請フォームの定義です。  
> こちらも Admin → フォームの GUI から編集できます。

---

## 4.7. Discord Webhook 連携（任意）

タスクが確認待ちになったとき、および期限超過タスクの日次サマリーを Discord チャンネルに通知できます。

### 手順

1. Discord で通知したいチャンネルの **「設定」→「連携サービス」→「ウェブフック」→「新しいウェブフックを作成」** → URLをコピー
2. Orbit の **Admin → Tags** の「Discord Webhook 連携」欄にURLを貼り付けて保存する

Webhook URLは Settings シート（公開CSV）には保存されず、Apps Script の PropertiesService（スクリプト専用の非公開領域）に保存されます。

---

## 5. 承認・通知フローの説明

### タスク登録時の承認フロー

INPUT画面からタスクが登録されると `approval_status` が「承認待ち」になり、Admin → 承認 で管理者が確認するまでワークスペースには表示されません。

タスク登録と同時に `notify_new_task` が `TRUE` のメンバーへ通知メールが届きます。
1人も設定していない場合は、最上位ロールのメンバー全員に自動送信されます。

### 多段階承認

経費申請・カスタムフォーム申請は、Admin で定義した複数の承認者を順番に経由する多段階承認に対応しています。各ステップが承認されると次のステップへ進み、全ステップが承認されると申請が完了します。

### タスク確認フロー

担当者は「確認待ち」にするだけで「完了」にはできません。「完了」への変更は、タスクに設定された確認者（`reviewer_ids`）または全権管理者のみが行えます。
確認待ちになると通知先にメールが届き、Admin → Dashboard の「確認待ちパネル」にも表示されます。

### 確認待ちの複数承認

タスクに「確認者」を複数設定でき、「n人承認が必要」「全員の承認が必要」のどちらかを選べます。

---

## 6. 定期タスクの自動生成（サーバー側トリガー）

誰もアプリを開かなかった日でも定期タスクを確実に生成するために、Apps Script に時刻ベースのトリガーを設定します。

> **前提条件**: `SETTINGS_CSV` を設定している場合のみ動作します。

### 手順

1. Apps Script エディタを開く
2. 上部の関数選択ドロップダウンから **`setupDailyTrigger`** を選ぶ
3. **▶ 実行** をクリック（初回はトリガー作成の権限承認が必要）

これで毎日1回（スクリプトのタイムゾーンで朝6時ごろ）`dailyMaintenance` が自動実行されます:
- 定期タスクルールに基づいて新しいタスクを自動生成
- 期限超過タスクを Discord（設定している場合）に通知

---

## 7. 動作確認

Secrets が未設定のままだとローカルのモックデータで動きます。
4つの必須 Secrets（`MEMBERS_CSV`・`PROJECTS_CSV`・`TASKS_CSV`・`CSV_GAS`）が揃うと、次回のデプロイ以降はスプレッドシートからの読み込み・書き込みに切り替わります。

デプロイ後に以下を確認してください:
- 代表アカウントでログインできる
- タスクの登録→承認→完了の流れが動く
- 通知メールが届く（メールアドレスが設定されている場合）

---

## 8. メール通知が届かないときの確認手順

通知系の関数はメール送信に失敗してもタスクの操作自体は失敗させない設計のため、エラーが画面に出ません。原因切り分けは次の順で行ってください:

1. **`Code.gs` を編集したら必ず再デプロイする** — Apps Script エディタの保存だけでは既存のWebアプリには反映されません
2. **実行ログを確認する** — Apps Script エディタ左メニューの「実行数（Executions）」で問題の操作の直後の実行を確認する
3. **Membersシートの `email` 列を確認する** — 通知したい相手にメールアドレスが入力されているか確認する
4. **MailAppの1日あたり送信上限を確認する** — Apps Script エディタで `function checkQuota() { console.log(MailApp.getRemainingDailyQuota()) }` を実行して残り件数を確認する
5. **Webアプリの実行ユーザー設定を確認する** — 「実行するユーザー: 自分」になっているか確認する（「アクセスしているユーザー」になっていると失敗します）

---

## 9. GASエンドポイントの権限チェック一覧

| アクション | 必要な権限 |
|---|---|
| updateRole, removeMember, removeProject, updateDiscordWebhookUrl, updateSlackWebhookUrl, updateSetting, uploadOrgLogo, addMember, updateEmail, updateJoinedAt, updateReportsTo, updateMentor, notifyTrainingDecision, updatePermissionOverrides, updateMemberProjects | 最上位ロール（代表）のみ |
| approveTask, assignTask, updateTaskDetails, setBlocker, createProject, updateProject, updatePriority, updateReviewer(s), removeTask, bulkUpdateSkills, updateExpenseStatus, addExpenseApplication, manageCustomForm, updateEvaluationHistory, updateTransferHistory, updateOneOnOnes, updateCompetencies 等 | 任意の管理者ロール（代表 または 班長以上） |
| updateSkillLevels, updateCareerGoals, updateDevelopmentPlan, updateCareerHistory, updateQualifications, updateTrainingHistory | 本人 または 管理者 |
| updateWill, updateNotify, updateNotifySettings, updateAvatar, uploadAvatar, updateDisplayName, updateUnavailableDates, updateTimezone, updateLocale | 本人のみ |
| createTasks, updateProgress, updateComments, updateTaskStatus（担当者のみ）, updateDeliverables 等 | ログイン済みなら誰でも |

---

## 既知の制約

- 「ウェブに公開」のCSVはGoogle側のキャッシュで反映まで数分かかることがあります
- プロフィール画像はGoogleドライブのURLをそのまま表示します。Google側の仕様変更やアクセス集中時の挙動保証はありません
- 定期タスクのサーバー側トリガーは `setupDailyTrigger` を一度手動実行しない限り動作しません
- 通知メールは Apps Script を実行しているGoogleアカウントの MailApp 経由で送られます（1日の送信数に上限あり）
- INPUT画面の選択肢プールは `SETTINGS_CSV` を設定していない場合、ブラウザのlocalStorageにのみ保存され他の人の画面には反映されません
