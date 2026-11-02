# JARVIS 共有サーバー（利用者にキーを入れさせずに使ってもらう）

ジャービスの URL を渡した相手が、API キーの用意なしで使えるようにする仕組みです。
あなたの API キーは Cloudflare Workers（無料枠: 1日10万リクエスト）に置き、ページはそこ経由で AI を呼びます。
利用者には **ページの URL と合言葉** だけ渡します。

```
利用者のブラウザ ──(合言葉)──▶ Cloudflare Worker ──(あなたのキー)──▶ Gemini / Claude
```

## 1. Worker を作る（ブラウザだけで5分）

1. https://dash.cloudflare.com/ にログイン（アカウントがなければ無料で作成）
2. 左メニュー **Workers & Pages** → **Create** → **Create Worker** → 名前は `jarvis-proxy` などにして **Deploy**
3. **Edit code** を押し、エディタの中身を全部消して `worker.js` の内容を貼り付け → **Deploy**
4. Worker の **Settings** → **Variables and Secrets** で次を追加

| 名前 | 種類 | 値 |
| --- | --- | --- |
| `PROVIDER` | Text | `gemini`（Claude を使うなら `claude`） |
| `MODEL` | Text | `gemini-3.5-flash-lite`（Claude なら `claude-haiku-5-5` など） |
| `GEMINI_API_KEY` | **Secret** | AI Studio で作ったキー（Claude なら `ANTHROPIC_API_KEY` に Console のキー） |
| `PASSPHRASE` | **Secret** | 合言葉。好きな文字列。空なら誰でも使える |
| `ALLOWED_ORIGINS` | Text | `https://keiiijima.github.io`（ページを置いている場所） |

5. Worker の URL（`https://jarvis-proxy.xxxx.workers.dev`）を控える

## 2. 利用者に渡すリンク

ページの URL に `?proxy=` と `&pass=` を付けて渡すと、開いた瞬間に設定が取り込まれ、何も入力せずに使えます。

```
https://keiiijima.github.io/codex/jarvis/?proxy=https://jarvis-proxy.xxxx.workers.dev&pass=合言葉
```

取り込んだあと URL から `proxy` と `pass` は消えるので、ブックマークやスクリーンショットに合言葉が残りにくくなっています。
あるいは利用者が設定画面で「頭脳 → 共有サーバー経由」を選び、URL と合言葉を手で入れてもかまいません。

`index.html` の先頭近くにある `DEFAULT_PROXY` に Worker の URL を書いておけば、`?proxy=` なしの素の URL でも最初から共有サーバー経由になります。

## 3. 守り

- **合言葉**: ヘッダで照合。違えば 401。リンクで渡した合言葉はそのブラウザに保存される
- **回数制限**: 1 IP あたり 1 分 12 回、全体で 1 分 60 回（`LIMIT_PER_MIN` / `LIMIT_GLOBAL_MIN` で変更）。Worker のメモリで数える簡易方式なので厳密ではないが、暴走は止まる
- **モデル固定**: ページが何を送ってきても `MODEL` のモデルで実行。Claude の `max_tokens` は 8000 まで
- **発信元制限**: `ALLOWED_ORIGINS` に書いたページ以外のサイトからは呼べない（CORS）
- **費用の上限**: Gemini の無料枠なら、上限に当たっても請求はゼロ。Claude を使う場合は [Console の Spend limits](https://platform.claude.com/) で月の上限を必ず設定する

## 4. 合言葉を変える・止める

- 合言葉を変える: `PASSPHRASE` を書き換えて保存。古いリンクは使えなくなる
- 一時停止: Worker の Settings で **Disable**、または `PASSPHRASE` をでたらめな値に
- 完全に止める: Worker を削除

## 動作確認

ブラウザで `https://jarvis-proxy.xxxx.workers.dev/config` を開くと、合言葉なしなら 401、合言葉を設定していなければ `{"provider":"gemini","model":"...","needsPass":false,...}` が返ります。
