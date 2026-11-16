# テスト

- 全部を実行: `tango-drill/` で `node --test`（1つずつなら `node tests/migration.test.js` ＝ 記録の引き継ぎ、`node tests/ids.test.js` ＝ IDの取り出しと検査、`node tests/figs.test.js` ＝ 古文常識の図）。
- playwright（chromium）を使う。いまのソースから試験用の完成版を一時フォルダに作って開くので、リポジトリの `index.html` は書き換えない。
- 試験用の完成版だけ欲しいとき: `SKIP_ID_CHECK=1 node tests/preview_build.js <出力フォルダ>`。
