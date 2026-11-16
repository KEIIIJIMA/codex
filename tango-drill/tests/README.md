# テスト

- 全部を実行: `tango-drill/` で `node --test`（1つずつなら `node tests/migration.test.js` ＝ 記録の引き継ぎ、`node tests/ids.test.js` ＝ IDの取り出しと検査、`node tests/figs.test.js` ＝ 古文常識の図、
  `node tests/cloze.test.js` ＝ 空所補充の照合と古文330の見出し語の表示、`node tests/book_rel.test.js` ＝ 古文330の関連語の記録、
  `node tests/choices.test.js` ＝ 4択の選択肢と設問文、`node tests/yomi.test.js` ＝ 「読みを入力」の判定、
  `node tests/usability.test.js` ＝ おまかせの出題・英語のレベル別タブの並び・苦手ワードの並び・単語帳の絞り込み・キー操作、
  `node tests/storage.test.js` ＝ バックアップの取り込みの検査・2つのタブで開いたときの記録の統合・保存の失敗の知らせ）。
- `tests/choices.test.js` は、全科目・全項目で選択肢を繰り返し作り、選択肢が4つ・正解が1つだけ・語→意味の選択肢に見出し語が出ない・誤答の品詞（分類）がそろうことを確かめる。
  意味の重なりや見出し語が出ているかの判定は、アプリの実装とは別にテストの中に書いてある。選択肢は無作為に選ぶので、割合の基準（9割以上など）には余裕を持たせてある。
- playwright（chromium）を使う。いまのソースから試験用の完成版を一時フォルダに作って開くので、リポジトリの `index.html` は書き換えない。
- 試験用の完成版だけ欲しいとき: `SKIP_ID_CHECK=1 node tests/preview_build.js <出力フォルダ>`。
- `tests/katsuyo.js` は古文の活用表（テストの照合用）。空所補充で空所にした部分が見出し語の活用形かどうかを、アプリの実装とは別に確かめる。
- アプリの中の関数を直接呼ぶテストは、ページのテスト用の窓口 `window.__tangoTest`（`src/index.tmpl.html` の末尾）を使う。
- `tests/storage.test.js` は、同じ保存データで2ページを開いて確かめる（`helpers.js` の `openMore()`）。ほかのタブの保存の知らせ（storage イベント）が
  届かない場合も確かめるため、知らせを止める仕掛けをページを開く前に入れている（テストの中の `pair()` と `mute()`）。
- 画面に要素が無いことは、`page.locator(…).count()` が 0 であることで確かめる（`assert.equal(await page.$(…), null)` は、失敗したときに
  差分の表示でメモリを使い切ることがある）。
