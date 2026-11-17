# テスト

- 全部を実行: `tango-drill/` で `node --test`（1つずつなら `node tests/migration.test.js` ＝ 記録の引き継ぎ、`node tests/ids.test.js` ＝ IDの取り出しと検査、`node tests/figs.test.js` ＝ 古文常識の図、
  `node tests/cloze.test.js` ＝ 空所補充の照合と古文330の見出し語の表示、`node tests/book_rel.test.js` ＝ 古文330の関連語の記録、
  `node tests/choices.test.js` ＝ 4択の選択肢と設問文、`node tests/yomi.test.js` ＝ 「読みを入力」の判定、
  `node tests/usability.test.js` ＝ おまかせの出題・英語のレベル別タブの並び・苦手ワードの並び・単語帳の絞り込み・キー操作、
  `node tests/storage.test.js` ＝ バックアップの取り込みの検査・2つのタブで開いたときの記録の統合・保存の失敗の知らせ、
  `node tests/session_list.test.js` ＝ 単語帳の検索欄（日本語の変換入力）と「さらに表示」・学習の途中の確認と再読み込みのあとの再開・選択中の教材タブの位置、
  `node tests/wording.test.js` ＝ 「このページについて」・出題モードの説明文・フッターの収録内容・章や分野のラベル・タッチ端末でのキーボード案内・「使い方」と初回の一言、
  `node tests/design.test.js` ＝ デザインの作り替えで動きが変わった所（フラッシュカードはめくってから判定・「次へ」「まだ／覚えた」の下端固定・学習中はヘッダーとタブを隠す・
  ヘッダーの固定・0語の案内の位置・学習ホームの並びと一覧表への近道・出題範囲の区切りと古文330の章→番号・結果の主ボタンと「次のn問へ」・正誤の記号・
  入力欄16px以上と押せる要素44px以上・「使い方」が開いたまま残らない・2つのタブでの「前回の続き」・prefs や days が null の保存データ）、
  `node tests/learning.test.js` ＝ 復習の間隔（段階と次に出す日・同じ日は上がらない・誤答で翌日）・習得と苦手の決め方・古い版の記録の換算・出題順と復習/新出の配分・
  間違えた語の差し戻し・ホームの「今日の学習」と1日の目標・結果の「今回」と次の復習・本の番号とページ、
  `node tests/edits.test.js` ＝ 意味・メモの編集（保存と再読み込み・元に戻す・エスケープ・古いデータ・2つのタブ・IDの移行・バックアップ・リセットで残る・全部消す）、
  `node tests/modes.test.js` ＝ 既存のデータから作る出題形式（文法の接続と活用形・敬語の種類・用例の意味・語形・語法・作者・成立順）と、英語の空所補充の和訳の設定、
  `node tests/data.test.js` ＝ 語彙データの形式（以前の validate.js の検査を全チャンクと src/data_*.js に）・見出し語の重複・README の語数とビルドの件数の一致、
  `node tests/build.test.js` ＝ 組み立てスクリプトと build.js が入力の不備で止まること・build_all.sh で作り直した完成版がコミットされたものと一致すること）。
- ブラウザを使わないテストは `tests/ids.test.js`・`tests/data.test.js`・`tests/build.test.js` の3つ。GitHub Actions（`.github/workflows/tango-drill-check.yml`）ではこの3つだけを実行する。
- `tests/build.test.js` は、リポジトリの `book/` `src/` `tools/` `build.js` `build_all.sh` を一時フォルダに写し、そこで生成する（リポジトリのファイルは書き換えない）。
  完成版の一致の確認は作業中のファイルと比べるので、生成物を作り直さずにデータだけ直していると失敗する（`./build_all.sh` で作り直す）。
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
- 学習の途中で「中断」を押すと確認が出る。テストでホームへ戻るときは `helpers.js` の `quit(page)` を使う（確認が出ていれば「中断する」を押す）。
- 日本語の変換入力は、Chromium の CDP（`Input.imeSetComposition` → `Input.insertText`）で再現する（`tests/session_list.test.js`）。
- フラッシュカードは、めくってから「まだ／覚えた」を押す（表面には判定ボタンが無く、めくった直後の0.3秒は押せない）。テストで1問答えるときは `helpers.js` の `ans(page, ok)` を使う。
- 学習中（出題の途中）はヘッダー（教科・教材）とタブを隠している。途中で離れるには `quit(page)`。
- 成績タブのバックアップと記録のリセットは、折りたたみ「データ管理」の中にある。操作の前に `helpers.js` の `dm(page)` で開く。
- スマホ（タッチ端末）を模すときは `helpers.js` の `open()` の4つ目の引数に `{ viewport, hasTouch: true, isMobile: true }` を渡す。
  なお、スマホを模した状態で `fullPage: true` のスクリーンショットを撮ると、Chromium ではその後 `(pointer: coarse)` が外れる（確認の画像は fullPage を使わずに撮る）。
- 日付をまたぐ動き（復習の間隔）は、`helpers.js` の `clock(page, 日数)` でページの時刻をずらして確かめる（再読み込みのあとも同じずれ）。期待する日付は `ymd(日数)`。
- 間違えた語は同じセットにもう一度出るので、誤答を押すと問題数が増える。正誤を問わないテストは `helpers.js` の `pick(page)`（4択で正答を押す）や `ans(page, true)` で進める。
  誤答を押すなら `pick(page, false)`。出題中の内容（選択肢・並べ替えの正しい順）は `window.__tangoTest.session()` から読める。
- 「苦手」にしておく記録は、誤答2回以上（`{ c: 0, x: 2, s: 0, t: 1 }`）。誤答1回だけの記録は「学習中」になる。
