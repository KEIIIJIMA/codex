# テスト

- 全部を実行: `tango-drill/` で `node --test`（1つずつなら `node tests/migration.test.js` ＝ 記録の引き継ぎ、`node tests/ids.test.js` ＝ IDの取り出しと検査、`node tests/figs.test.js` ＝ 古文常識の図、
  `node tests/cloze.test.js` ＝ 空所補充の照合と古文330の見出し語の表示、`node tests/book_rel.test.js` ＝ 古文330の関連語の記録）。
- playwright（chromium）を使う。いまのソースから試験用の完成版を一時フォルダに作って開くので、リポジトリの `index.html` は書き換えない。
- 試験用の完成版だけ欲しいとき: `SKIP_ID_CHECK=1 node tests/preview_build.js <出力フォルダ>`。
- `tests/katsuyo.js` は古文の活用表（テストの照合用）。空所補充で空所にした部分が見出し語の活用形かどうかを、アプリの実装とは別に確かめる。
- アプリの中の関数を直接呼ぶテストは、ページのテスト用の窓口 `window.__tangoTest`（`src/index.tmpl.html` の末尾）を使う。
