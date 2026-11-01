# JARVIS 音声アシスタント

ブラウザだけで動く「音声で受け答えするAIエージェント」。
マイクで話しかける → ブラウザ内蔵の音声認識で文字起こし → Claude がストリーミングで返答 → 文ができた端から音声合成で読み上げ、という流れを `index.html` 1枚で実装しています。サーバーもビルドも不要です。

## できること

- **押して話す / ハンズフリー** の2モード。ハンズフリーは「ジャービス、〜して」とウェイクワードで反応（PCは `Space` 長押しでも可）
- **ストリーミング読み上げ**: 返答全体を待たず、最初の一文ができた時点で喋り始める
- **割り込み**: 話している最中に球体をタップ / `Esc` / 停止ボタンで止めて、次の質問へ
- **ツール実行**（ブラウザ内で完結）
  - `set_timer` / `cancel_timers`: 「3分後に教えて」→ 時間になるとアラーム音と読み上げ
  - `open_url`: 「YouTubeを開いて」「○○をGoogleで検索して」→ 新しいタブで開く
  - `web_search`（Claude のサーバー側ツール）: 天気・ニュースなど最新情報を調べて答える。出典リンクをログに表示
- **長期記憶**: 「コーヒーはブラック派って覚えておいて」のように頼んだこと、会話の中で分かった名前・家族・仕事・好み・予定などを `remember` ツールで保存し、次回以降の会話に活かす。「忘れて」で `forget`。設定画面で一覧の確認・編集・全消去ができ、コピーして別端末に貼れば引き継げる
- **HUDモード（モニター表示）**: ヘッダーの「HUD」または `H` キー、`?hud` 付きURLで全画面の司令室風ダッシュボードに。中央は声に反応する粒子のエネルギー球（マイク許可があれば実音量、なければ合成）、左に会話ターン数・記憶件数・今日のトークン使用量と概算コスト・初トークン遅延・稼働時間・音声波形、右にモデル・オペレーションログ（聞き取り、Claude 送受信、ツール実行、記憶、タイマー、エラーの実イベント）・稼働プロセス一覧。中央をタップ／長押しで通常画面と同じく話しかけられる。開いている間は画面スリープを抑止
- モデル（Opus 5.5 / Sonnet 5.5 / Haiku 5.5）、考える深さ、声・話速、名前・呼び名・追加の人格指示を設定画面で変更
- 会話ログの文字入力欄からも話しかけられる（音声認識非対応ブラウザ向け）

## 使い方

1. [Claude Console](https://platform.claude.com/) で API キーを発行する
2. `https://<GitHub Pages のURL>/jarvis/` を **Chrome / Edge / Safari** で開く（ローカルなら `index.html` を直接開くか、`localhost` で配信。マイクのため http の公開URLでは動きません）
3. 最初に開く設定画面に API キーを貼って保存
4. 球体を押しながら話す。ハンズフリーに切り替えると、タップで待機を開始し「ジャービス」と呼ぶと応答

API キーはこのブラウザの `localStorage` にだけ保存され、リクエストはブラウザから `api.anthropic.com` に直接送られます（Anthropic の CORS 許可ヘッダ `anthropic-dangerous-direct-browser-access` を使用）。**自分専用**で使ってください。キーを入れたままの端末を他人に渡さないこと。

## 技術メモ

- 音声認識: `webkitSpeechRecognition`（Chrome/Edge は Google、Safari は Apple のクラウド認識を使うためネット接続が必要）
- 音声合成: `speechSynthesis`（OS に入っている声。Windows は「Microsoft Nanami Online (Natural)」、Mac/iOS は「Kyoko」「O-ren」などが自然）
- Claude API: `POST /v1/messages` を `stream: true` で呼び、SSE を自前でパース。`thinking` / `tool_use` / `server_tool_use` ブロックをそのまま履歴に保持して、ツール結果の往復と `pause_turn` の再開に対応
- 既定モデルは `claude-opus-5-5`、会話向けに `output_config.effort = "low"`。安全分類器に拒否された場合は `fallbacks: "default"`（ベータ `server-side-fallback-2026-07-01`）で別モデルに自動再実行（Haiku は非対応なので送らない）
- 会話履歴は直近 24 メッセージまで。`tool_use` と `tool_result` が泣き別れないよう user 境界で切り詰め
- HUD の数値は飾りではなく実データ。トークン使用量は SSE の `message_start` / `message_delta` の `usage` を日付ごとに `localStorage`（`jarvis.usage.v1`）へ積算し、概算コストは各モデルの公開単価で計算
- 長期記憶は `localStorage`（`jarvis.memory.v1`）に最大 80 件。毎回のリクエストでシステムプロンプト末尾に「覚えていること」として渡す。モデル自体は学習しないので、記憶を消せば元に戻る

## ファイル

```
jarvis/
  index.html   # アプリ本体（HTML/CSS/JS、依存なし）
  README.md
```
