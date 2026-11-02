# 業務ダッシュボード（claude.ai Artifact 版）

毎朝の予定・メール・Teams を仕分けし、やること・日報・会議室・天気・ジャービス（音声アシスタント）を 1 画面にまとめた業務ダッシュボード。
`index.html` 1 枚で、claude.ai の Artifact として公開して使う（GitHub Pages や Netlify では動かない）。

公開先: https://claude.ai/artifact/RCMXLqCfpCJA8PuTp7LjvS

## 仕組み

- **動作環境**: claude.ai の Artifact ランタイム（`window.claude.use(...)`）。開いた本人の権限で動く。
  - `mcp`: Microsoft 365 コネクタ（予定表・メール・Teams・SharePoint・会議室の空き・下書き作成）
  - `sample`: 本人の Claude（仕分け、返信下書き、校正、日報下書き、ジャービス）
  - `db`: Artifact の保存領域。やること・日報・メモ・仕分け結果・設定は `data/users/<本人>/` 配下で本人専用。チーム共有ボードと天気の地点だけ `shared/` で共有
  - `user`: 本人の ID
- **公開時の宣言**（Artifact ツールの `capabilities`）:
  ```json
  {"db":{},"user":{},"sample":{},
   "mcp":{"servers":[{"server":"Microsoft 365","tools":["get_me","outlook_calendar_search","outlook_email_search","chat_message_search","read_resource","sharepoint_search","outlook_create_reply_draft","outlook_create_draft","outlook_find_available_time"]}]}}
  ```
- **定期タスク**（claude.ai 側に登録済み）
  - 平日 6:52: スマホへ「ダッシュボードを開いて更新」の通知
  - 毎日 6:34: Open-Meteo から天気を取得して `shared/weather` に書き込み（実行環境のネットワーク設定で `api.open-meteo.com` の許可が必要）

## 画面

1 画面（1920×1080 想定、1366×768 でも収まる）。上段に格言・日付・今日は何の日・Claude の一言・天気・承認待ち・ボタン。
下に 8 枠: やること／今日の予定／メール／ジャービス／会議室と Teams／2 か月カレンダー／返事待ち／日報。検索・メモ・設定は重ね窓。

## 主な設定（⚙️）

画面の色（ライト／ダーク、アクセント 6 色）、自動更新の間隔、仕分けの対象期間と 1 時間あたりの回数上限、呼び名、署名、除外する差出人、リンク集、天気の地点、会議室、定時・時間外の起算・早出・日報の締め日。

## 更新のしかた

`index.html` を編集して、Claude Code から Artifact ツールで同じ URL に公開する（`url` に上記を渡す）。
`capabilities` は前回の宣言が引き継がれるので、コネクタのツールを増やすときだけ渡し直す。
