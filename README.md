# Personality Lab

4人のAI人格に同じ問いかけを送り、性格・過去の経験・その解釈・価値観による反応の違いを観察する、日本語のローカルWebアプリです。Next.js / TypeScript / Tailwind CSS、FastAPI、SQLite、Ollamaで構成しています。外部AI API、アカウント、APIキー、有料サービスは使用しません。

## できること

- **人格設定**：ハル（黄色）、ナツ（赤）、アキ（青）、フユ（緑）の名前・基本性格を個別に編集。
- **記憶と価値観**：出来事・当時の考えを複数保存し、各記憶に複数の価値観を関連付け。編集・削除、削除前の確認、未保存変更の確認に対応。
- **モード切替**：自分で入力する通常モードと、サンプル入りのデモモードをワンクリックで切替。それぞれ別のSQLiteに人格・記憶・価値観・履歴を保存します。
- **反応比較**：同じローカルモデルに4人分の独立したプロンプトを順次送信。2×2のカードで進捗と回答を表示。
- **条件の比較**：基本性格／出来事／考え／価値観を独立して切り替え。すべて無効にすると名前も送らず、基準回答を生成。
- **履歴**：回答・実際のsystem/userメッセージ・生成時の人格名と性格・有効条件・モデル・Temperature・Seed・省略した記憶IDを保存。設定を変更しても過去の記録は保持。
- **再生成**：元の問いかけ・有効条件・Temperature・Seedをコピーして、新しい実験として保存。人格設定とモデルは再生成時のものを使用します。モデルが異なる場合は画面に表示します。

AIによる人格の自動変更、記憶の自動生成、問いかけや回答の記憶への自動登録は行いません。モデルの内部推論を取得・表示する機能ではなく、出力された回答や判断・表現の違いを比較するアプリです。

## Windowsでの初期設定

PowerShellを使います。Node.js 22以降、Python 3.11以降、Git、最新のOllamaを用意してください。この環境ではNode.js 24・Python 3.14で検証しています。

### 1. Ollamaとモデル

[OllamaのWindows版](https://ollama.com/download/windows)をインストールし、起動します。Windows版はバックグラウンドでローカルAPIを提供します。詳細は[公式Windowsドキュメント](https://docs.ollama.com/windows)を参照してください。

```powershell
ollama pull qwen3:8b
ollama list
```

モデル取得にはネット接続と保存領域が必要です。8Bが重い場合は `ollama pull qwen3:1.7b` または `ollama pull qwen3:0.6b` で軽量モデルを取得し、後述の `OLLAMA_MODEL` を変更します。[Qwen3のモデル一覧](https://ollama.com/library/qwen3)で選択できます。

Ollamaが起動していない場合はスタートメニューから起動するか、別のターミナルで `ollama serve` を実行してください。すでに起動している場合は追加でserveを実行する必要はありません。

### 2. Pythonとフロントエンドの依存ライブラリ

取得したリポジトリのルートで実行します。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.lock.txt
Set-Location frontend
npm.cmd ci
Set-Location ..
```

仮想環境の有効化は不要です。`npm.cmd` を使うため、PowerShellのスクリプト実行ポリシーを変更する必要もありません。`requirements.lock.txt` と `package-lock.json` に検証済みの依存バージョンを固定しています。別のPythonバージョンでロックの互換性問題が出る場合は、`backend/requirements.txt` で対応範囲内の依存を解決してください。

### 3. 環境設定

初回のみコピーします。既存の設定ファイルは上書きしないでください。

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env.local
```

`backend/.env` の内容：

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | ローカルOllama。HTTPのloopbackアドレスだけ許可 |
| `OLLAMA_MODEL` | `qwen3:8b` | 4人で共通のモデル。例：`qwen3:1.7b` |
| `OLLAMA_NUM_CTX` | `8192` | コンテキスト長。2048〜131072 |
| `OLLAMA_NUM_PREDICT` | `512` | 出力トークン上限。128〜4096 |
| `OLLAMA_TIMEOUT` | `300` | 1人の生成タイムアウト秒数 |
| `DATABASE_PATH` | `backend/data/personality-lab.sqlite3`（絶対パス） | 変更時は絶対パス推奨 |
| `DEMO_DATABASE_PATH` | 通常DBのファイル名に `-demo` を付加 | デモ専用DB。通常DBと同じファイルは指定不可 |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:3000` | 画面のポートを変更するときの許可オリジン。loopbackのHTTPのみ |

`frontend/.env.local` は `BACKEND_URL=http://127.0.0.1:8000` と `NEXT_TELEMETRY_DISABLED=1` です。設定を変更した場合はサーバーを再起動します。OS側の環境変数は `.env` より優先されます。

### 4. SQLiteの初期化

```powershell
.\.venv\Scripts\python.exe scripts\init_db.py
```

5つのテーブルと4人の初期人格を作成します。記憶と価値観は空です。既存の人格を上書き・追加し直すことはありません。起動時にも自動初期化するので、この手順は省略できます。手動初期化はアプリを停止して実行してください。

### 5. 起動

```powershell
.\start.cmd
```

起動後、ブラウザで **http://127.0.0.1:3000** を開きます。終了は起動したターミナルで **Ctrl+C**。バックエンドとフロントエンドを同時に停止します。Ollamaは別に起動しておいてください。

個別に起動する場合は、2つのターミナルを使います。

```powershell
# ターミナル1（リポジトリのルートから）
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# ターミナル2（リポジトリのルートから）
Set-Location frontend
$env:NEXT_TELEMETRY_DISABLED="1"
npm.cmd run dev
```

日常利用はビルド後の起動も可能です。

```powershell
Set-Location frontend
$env:NEXT_TELEMETRY_DISABLED="1"
npm.cmd run build
Set-Location ..
.\start.cmd --production
```

必要な依存ライブラリ・モデル・ビルド用バイナリを取得し、一度ビルドを完了すれば、その後はオフラインで利用できます。Webフォント、画像CDN、分析サービスは使用していません。Next.jsのテレメトリは起動スクリプトで無効にしています。

## 使い方

画面上部の **「通常モード」「デモモード」** で使用するDBを切り替えます。

- **通常モード**：初期4人格と、記憶・価値観・回答履歴が空のDBから始めます。自分で入力した内容はそのまま保存され、デモから戻しても復元されます。従来の通常DBに入力済みデータがあれば引き継ぎます。
- **デモモード**：架空の記憶2件ずつ、各記憶の価値観2件ずつ（計8記憶・16価値観）が入った別DBです。すぐに編集や比較を試せます。編集と回答履歴はデモDBにだけ保存します。

切替はDBの消去・コピーではありません。両モードのデータは独立して保持します。選択したモードはブラウザに保存します。未保存の変更は破棄する前に確認し、回答生成中は切替を無効にします。デモの初期化は起動時に行い、記憶が登録済みのデモ人格には追記しないので再起動で重複しません。デモ人格の記憶をすべて削除した場合は、次の起動時にその人格のサンプルが補充されます。回答生成は両モードとも実際のOllamaを使用します。

実行中のアプリにこの更新を反映する場合は、いったん `Ctrl+C` で終了して `start.cmd` で起動し直してください。本番モードでは再ビルドも必要です。

1. 「人格設定」で上部の4人から編集対象を選び、名前・性格を入力して「基本設定を保存」。
2. 「記憶を追加」で出来事と考えを記入して「記憶を保存」。保存後、同じカード内に価値観を追加できます。記憶と価値観はそれぞれの保存ボタンで保存します。
3. 「反応比較」で問いかけを入力し、AIに渡す情報を選択。TemperatureとSeedは4人で共通です。
4. 「4人の反応を比較する」で実行。順番待ち／生成中／回答完了を各カードに表示します。
5. 「使用した情報を見る」で実際に送ったプロンプトを確認。「実験の履歴」から過去の結果を開けます。

すべての情報を無効にした場合、4人に送るメッセージとSeedが同じになるため、同じ基準回答になることがあります。同一Seedでもモデルやハードウェア、Ollamaのバージョンによって完全な再現性は保証されません。厳密な比較ではそれらも揃えてください。

## データと生成の扱い

SQLiteは `profile` → `past_memories` → `formed_personalities` の関連を持ちます。記憶の削除時は対応する価値観も削除します。`questions` と `responses` は独立した実験履歴です。`responses` の質問IDと人格IDの組み合わせには一意制約があります。

比較受付時に、4人全員の設定を単一の読取トランザクションで取得します。生成中に人格設定を編集しても、その実験のプロンプトには反映されません。生成結果で人格テーブルを更新しません。LLMの出力は文字列として表示・保存するだけで、SQLやコードとして実行しません。

過去の記憶・考え・価値観には共通の出来事番号を付け、対応関係を保持します。入力はJSON文字列としてシステムプロンプトに埋め込み、設定内の命令に従わないルールを付けます。問いかけは別のuserメッセージです。[OllamaのChat API](https://docs.ollama.com/api/chat)を使用し、内部推論の出力を無効にしています。

コンテキスト長は、UTF-8のバイト数を保守的なトークン数の目安にし、出力用トークンとテンプレート余白を確保します。長すぎる記憶は出来事・考え・価値観を一組として省略します。省略件数を回答カードに、省略した記憶IDを詳細に表示し、送信済みプロンプトにも何を含めたか残します。実際のトークナイザーと厳密に一致する計算ではありません。非常に小さいコンテキスト長や別モデルでは、必要に応じて設定を調整してください。質問と基本設定だけで上限を超えると日本語のエラーにします。

アプリの送信先はloopback上のバックエンドとOllamaだけです。クラウド名やクラウドモデルのメタデータを拒否し、HTTPリダイレクトと環境のHTTPプロキシを使いません。Ollama自体のアップデート通信等はOllamaの設定に依存します。外部通信を完全に止める場合は必要な取得後にネット接続を切って利用できます。[Ollamaのローカル利用FAQ](https://docs.ollama.com/faq)も参照してください。

バックアップはアプリを停止して `backend/data` をコピーしてください。SQLiteのWAL/SHMファイルがある場合も同じフォルダごと保管します。`.env`、DB、テスト実行データ、仮想環境はGit管理対象外です。

## API

| メソッド | パス | 処理 |
| --- | --- | --- |
| GET | `/api/personalities` | 4人の人格と記憶・価値観 |
| GET / PUT | `/api/personalities/{id}` | 詳細取得 / 基本性格更新 |
| GET / POST | `/api/personalities/{id}/memories` | 記憶一覧 / 追加 |
| PUT / DELETE | `/api/memories/{id}` | 記憶編集 / 削除 |
| POST | `/api/memories/{id}/formed-personalities` | 価値観追加 |
| PUT / DELETE | `/api/formed-personalities/{id}` | 価値観編集 / 削除 |
| POST | `/api/compare` | 実験を受け付けて202を返す |
| GET | `/api/questions?limit=30&offset=0` | 問いかけ履歴 |
| GET | `/api/questions/{id}/responses` | 実験の状態・回答・プロンプト |
| GET | `/api/health` | DB・Ollama・モデル・実行中の実験ID |

`POST /api/compare` の例：

すべてのAPIはヘッダー `X-Lab-Mode: normal`（既定）または `X-Lab-Mode: demo` で対象DBを選びます。任意のファイルパスは指定できません。レスポンスにも同じヘッダーを返し、キャッシュを無効にします。質問ID・記憶IDが両DBで一致していても、指定したモードのデータだけを参照します。ローカルモデルの生成処理は両モードで共通の排他制御を行います。

```json
{
  "question": "新しいことに挑戦したい。どう思う？",
  "conditions": { "basic": true, "memories": true, "thoughts": true, "formed": true },
  "temperature": 0.7,
  "seed": 42,
  "parent_question_id": null
}
```

返された `question_id` を使って `/api/questions/{id}/responses` をポーリングします。実験の状態は `generating / complete / partial / failed`、各回答は `pending / generating / complete / error` です。1人が失敗しても他の回答を保存し、生成途中のサーバー停止は次の起動時に中断扱いにします。再生成は過去の行を上書きしません。

Pydanticで必須項目・文字数・数値範囲を検証します。基本性格は各500文字、名前は80文字、出来事・考え・価値観は各10,000文字、問いかけは2,000文字までです。記憶・価値観の登録件数に固定の上限はありません。OpenAPI定義は `/openapi.json`。CDNへのアクセスを避けるためSwagger UIは使用していません。

## テスト

バックエンドの自動テストは、一時SQLiteと制御したモデル応答でCRUD・永続化・人格分離・条件16通り・履歴スナップショット・二重送信・部分失敗を検証します。

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Set-Location ..
```

実際のOllamaとの接続を検証する場合：

```powershell
# 使用するモデルは先に ollama pull で取得してください。
$env:OLLAMA_MODEL="qwen3:8b"
.\.venv\Scripts\python.exe scripts\smoke_ollama.py
Remove-Item Env:OLLAMA_MODEL
```

このスモークテストは一時DBで4人の実回答・人格の不変性・再起動後の履歴復元を確認し、終了時に一時DBを削除します。モック応答への自動フォールバックはありません。

ブラウザテスト（専用の13000/18000ポートを使用するため、通常のアプリと同時に実行できます）：

```powershell
Set-Location frontend
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

デスクトップ・スマートフォン幅の編集、保存、再読み込み、削除確認、未保存変更の保護、条件切替、ダイアログ、横幅超過、通常・デモモードの切替を確認します。テスト用DBは `backend/data/e2e-*.sqlite3`、テスト用ビルドは `frontend/.next-test` に作成し、利用中のDB・サーバー・ビルドには触れません。実モデルを使う画面テストも有効にする場合：

```powershell
$env:E2E_LIVE="1"
$env:E2E_MODEL="qwen3:8b"
npm.cmd run test:e2e
Remove-Item Env:E2E_LIVE
Remove-Item Env:E2E_MODEL
```

```powershell
# frontend 内で型検査・本番ビルド
npm.cmd run typecheck
$env:NEXT_TELEMETRY_DISABLED="1"
npm.cmd run build
```

## トラブルシューティング

| 状況 | 対応 |
| --- | --- |
| Ollamaに接続できない | Ollamaを起動し、画面の「接続を確認」。`OLLAMA_BASE_URL` とポート11434を確認 |
| モデルがない | `ollama pull qwen3:8b` を実行。別モデルなら `.env` の名前と `ollama list` を照合 |
| メモリ不足・遅い・タイムアウト | 軽量モデルに変更。`OLLAMA_NUM_CTX`を縮小、または`OLLAMA_TIMEOUT`を延長 |
| 出力上限に達した | `OLLAMA_NUM_PREDICT`を増やし、コンテキスト長も必要に応じて増やす |
| 同じ名前を保存できない | 人格名は4人で一意にする |
| サーバーに接続できない | バックエンドを8000、フロントエンドを3000で起動。ブラウザは`127.0.0.1:3000`を使用 |
| ポート使用中 | すでに起動したアプリを停止してから起動。テスト時も両サーバーを停止 |
| 生成中にサーバーを止めた | 再起動後に履歴から確認し、再生成。保存済みの回答は残る |

生成を排他制御するため、バックエンドは**1プロセス・1ワーカー**で起動してください。Ollama・Next.js・FastAPIはこの端末だけで利用し、インターネットに公開する構成ではありません。

## ファイル構成

```text
backend/app/       FastAPI、SQLite、プロンプト、Ollama連携
backend/tests/     バックエンド自動テスト
frontend/app/      2画面のUIとスタイル
frontend/components/  人格・記憶・価値観の編集、アイコン、ダイアログ
frontend/tests/    Playwrightによるブラウザテスト
scripts/           起動、初期化、実Ollamaスモークテスト
start.cmd          Windows用の同時起動コマンド
```
