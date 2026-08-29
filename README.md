# Orbit

タスクを打ち上げ、組織を軌道に乗せる。学生団体向けのタスク管理×人材管理ツールです。

Orbitはもともと FSIF（学生団体）向けに作られましたが、コードはそのまま他団体でも
セルフホストして使えるように設計されています。**Orbitチーム側が複数団体を横断的に
運用することはありません** — 導入する団体ごとに、自分たちの Google Spreadsheet・
Google アカウント・GitHub リポジトリの上で、完全に独立した1インスタンスとして動きます。

## アーキテクチャ

```
┌─────────────────┐     読み取り: CSV公開URL      ┌──────────────────┐
│  Next.js (静的   │ ─────────────────────────────▶│                  │
│  エクスポート)    │                                │  Google          │
│  GitHub Pages    │     書き込み: Web App (POST)   │  Spreadsheet     │
│  でホスト         │ ◀─────────────────────────────│  (Members /      │
└─────────────────┘   ┌──────────────────────┐      │   Projects /     │
                       │  Google Apps Script  │─────▶│   Tasks /        │
                       │  Web App (Code.gs)   │      │   Settings)      │
                       └──────────────────────┘      └──────────────────┘
```

- **フロントエンド**: Next.js 16 (App Router) を `output: 'export'` で静的サイトとしてビルドし、
  GitHub Pages でホストします。サーバーサイドのAPIやDBは持ちません。
- **データベース**: Google Spreadsheet の Members / Projects / Tasks（任意で Settings）の
  4シートが「データベース」です。
- **読み取り**: 各シートを「ウェブに公開」した CSV URL をビルド時に環境変数として埋め込み、
  クライアントから直接フェッチします。
- **書き込み**: Google Apps Script（`gas/Code.gs`）をウェブアプリとしてデプロイし、
  クライアントからそのURLへ POST することでシートに書き込みます。
- **認証**: 現状は簡易的なデモ用のメンバー選択画面です（本人確認なし）。実際の
  Google アカウントによるログイン（Google OAuth / Google Identity Services）は
  今後実装予定の機能で、下記のセットアップ手順にはそのための準備段階の項目も含めています。
  現時点でこの「本人確認なし」という制約を理解した上で、機密性の高い情報は
  シートに置かないようにしてください（詳細は `gas/README.md` の注意事項を参照）。

この構成のため、**追加のサーバー費用は一切かかりません**（GitHub Pages・Google
Spreadsheet・Apps Script はすべて無料枠で完結します）。

## セットアップ（新規団体向け）

他団体がOrbitを自分たちの団体用に導入する場合の手順です。すべて団体ごとに
**自分たちのアカウントで新規に作成**してください（他団体のSpreadsheet・Apps Script・
GitHubリポジトリを共用することはできません／してはいけません）。

### 1. リポジトリを取得する

このリポジトリを Fork するか、`git clone` した上で新しい GitHub リポジトリとして
push してください。

> **重要**: `next.config.mjs` の `repoName` 定数（現在 `'Orbit'`）は GitHub Pages の
> 公開パス（`https://<org>.github.io/<repoName>/`）に使われます。リポジトリ名を
> 変えた場合は、この定数もリポジトリ名に合わせて書き換えてください。

### 2. Google Spreadsheet を用意する

1. このリポジトリの `database.xlsx`（列構成のサンプル）を Google スプレッドシートに
   インポートするか、新規スプレッドシートに `database.xlsx` と同じシート名・列名で
   Members / Projects / Tasks の3シートを作成します。
2. サンプルの黄色い行（入力例）を削除し、自団体の実データに置き換えます。
   詳しい手順は [`docs/onboarding.md`](docs/onboarding.md) のチェックリストを参照してください。
3. 列構成の詳細な意味は [`gas/README.md`](gas/README.md) の「1. シートの列構成」を
   参照してください。

### 3. Google Apps Script をデプロイする

`gas/README.md` の「2. Apps Script のデプロイ」〜「3. シートのCSV公開」の手順に従い、
書き込み用の Web App URL と、各シートの CSV 公開URLを取得します。

定期タスク（`RecurringTaskRule`）を毎日自動生成させたい場合は、同ファイルの
「定期タスクの自動生成（サーバー側トリガー）」の手順で時間主導トリガーも設定してください。

### 4. Google OAuth クライアントを作成する（本人認証・準備中）

現バージョンのログインは、本人確認を行わないデモ用のメンバー選択画面です。将来的に
Google アカウントでの本人認証（Google Identity Services）に置き換える計画があり、
そのための準備として OAuth クライアントを先に作成しておくことができます。

1. [Google Cloud Console](https://console.cloud.google.com/) で自団体用の新規プロジェクトを作成します
   （Spreadsheet / Apps Script と同じ Google アカウント配下で構いません）。
2. 「APIとサービス」→「認証情報」→「OAuth クライアント ID」を作成します。
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みの JavaScript 生成元: 本番URL（例: `https://<org>.github.io`）と
     `http://localhost:3000`（ローカル開発用）
3. 発行されたクライアントIDを控えておきます（現時点ではアプリ側での参照先はまだ
   ありませんが、実装され次第 `.env.local` に環境変数として追加する形になる想定です）。
4. **団体ごとに必ず自分のOAuthクライアントを発行してください。** 他団体のクライアントID・
   APIキーを流用すると、同意画面に表示される団体名やドメイン制限が自団体のものと
   一致せず、ログインが正しく機能しません。また、他団体のGoogle Cloudプロジェクトの
   クォータやセキュリティ設定に影響を与えてしまいます。

### 5. `.env.local` を設定する

`.env.local.example` を `.env.local` にコピーし、手順3で取得したURLを入力します。

```bash
cp .env.local.example .env.local
```

すべて空欄のままにすると、`lib/orbit/seed.ts` のローカルモックデータで動作します
（動作確認・開発用）。

### 6. ローカルで動作確認する

```bash
pnpm install
pnpm dev
```

`http://localhost:3000` で確認できます。

### 7. GitHub Pages へデプロイする

1. リポジトリの Settings → Secrets and variables → Actions に、`gas/README.md`
   「4. GitHub Secrets」の表にある Secret（`MEMBERS_CSV` / `PROJECTS_CSV` /
   `TASKS_CSV` / `CSV_GAS`、任意で `DRIVE_FOLDER_ID` / `SETTINGS_CSV`）を設定します。
2. Settings → Pages で、Source を「GitHub Actions」に設定します。
3. `main` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルド・
   デプロイします。

## セキュリティ・注意事項

- **APIキー・OAuthクライアント・Spreadsheetの公開URLは団体ごとに必ず自分で発行し、
  他団体と使い回さないでください。** これらは事実上「誰でも書き込める」形で
  クライアントサイドのJavaScriptに埋め込まれます（`gas/README.md`の注意事項参照）。
  他団体のURLを流用すると、自団体のタスク・メンバー情報が他団体からも操作・
  閲覧できる状態になってしまいます。
- 本人確認なしの内輪利用を前提とした設計です。機密性の高い情報（給与・成績など）は
  シートに置かないでください。
- 詳しい既知の制約は `gas/README.md` の「既知の制約」を参照してください。

## ディレクトリ構成

| パス | 内容 |
|---|---|
| `app/` | Next.js App Router のエントリポイント |
| `components/orbit/` | 画面ごとのReactコンポーネント（INPUT / OUTPUT / Admin / 個人ページなど） |
| `lib/orbit/` | 状態管理（`store.tsx`）、型定義（`types.ts`）、スプレッドシート連携（`remote.ts`）、ローカルモックデータ（`seed.ts`） |
| `gas/` | Google Apps Script（`Code.gs`）とスプレッドシート連携のセットアップ手順 |
| `database.xlsx` | シート構成のサンプルスプレッドシート |
| `docs/onboarding.md` | 新規団体向けの初期化チェックリスト |

## テスト

```bash
npx tsc --noEmit -p tsconfig.json   # 型チェック
pnpm test                            # ユニットテスト（Vitest）
pnpm build                           # 本番ビルド（ローカルモックデータ）
```

## ライセンス

[MIT License](LICENSE) — 自由に使用・改変・再配布できます。Orbitチームは、配布された
コードの利用によって生じたいかなる損害についても責任を負いません（詳細はLICENSE参照）。
