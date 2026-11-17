# 難関大 単語ドリル

大学受験（共通テスト〜最難関大レベル）向けの古文単語・英単語学習アプリ。
依存ライブラリなしの単一 HTML ファイルで、`index.html` をブラウザで開くだけで動きます（主な利用は iPhone の Safari）。
文字は Google Fonts（Shippori Mincho・Noto Sans JP・Source Serif 4）を読み込んで表示します。オフラインなどで読み込めないときは端末の標準の書体で表示されます。

## 収録内容

| 科目 | 語数 | 内容 |
| --- | --- | --- |
| 古文単語 | 336 | 見出し・漢字表記・品詞・意味（多義）・用例と訳・古今異義などの注・必修/発展レベル・分野タグ |
| 古文330 | 330（関連語317） | 古文単語集の番号・章立て準拠。意味ごとの用例・関連語つき |
| 古文常識 | 212 | 時刻・方角・月、季節の景物と行事、恋愛・結婚、社会、住居、信仰など10分野。挿絵23点と、時刻盤・月齢・官位・平安京・内裏の略図つき |
| 文学史 | 152 | 奈良〜江戸の126作品（時代・世紀・ジャンル・作者・要点）、成立順などのまとめ10、主要作者16 |
| 和歌 | 64 | 枕詞15・掛詞21・縁語10・歌枕7、修辞の用語と言葉遊び11 |
| 文法 | 83 | 助動詞28（意味・接続・活用）、助詞42、動詞・形容詞・形容動詞の活用13。助動詞・助詞・活用の一覧表つき |
| 読み | 70 | 古文常識語の漢字の読み（現代仮名遣い。歴史的仮名遣いも正解） |
| 英単語 | 2,138 | 単語・品詞・意味・例文と訳・派生語/関連語・4段階レベル（基礎/標準/発展/最難関）・分野タグ |

語数は `node build.js`（または `./build_all.sh`）の出力の「収録: …」の行と同じです。データを増減したら、この表も直してください（`tests/data.test.js` が一致を確かめます）。

## 画面の構成

- 上の段: 画面の切り替え（学習 / 単語帳 / 成績）
- 下の段: 教材のタブ
  - 古文: 古文単語・古文330・読み・古文常識・文学史・和歌・文法
  - 英語: 英単語と、レベル別（基礎・標準・発展・最難関）
- 学習ホームの「使い方」（たたんだ説明）と、文学史・和歌・文法の「一覧表」（助動詞・助詞・活用表、文学史年表など。タップで開く）

## 機能

- フラッシュカード（自己判定）、4択テスト（語→意味 / 意味→語）、例文の空所補充（4択 / 記述）、読みを入力（読み・古文常識・文学史など、漢字の語のある教材）
- 出題範囲（おまかせ・未習得のみ・苦手のみ・レベル別・分野別）、問題数、出題順の設定
- 既存のデータから作る出題形式: 文法（何形に付くか・活用形）、敬語の種類、用例の意味、文学史（作者・成立順の並べ替え）、英語（語形・語法の前置詞）
- 復習の間隔: 正解した語は翌日・3日後・7日後・14日後・30日後に出し直す（同じ日の正解は1回ぶん。誤答で翌日からやり直し）。日をあけて3回正解で「習得」
- ホーム最上部の「今日の学習を始める（復習n語＋新出n語）」と1日の目標。間違えた語は同じセットの3〜5問あとにもう一度出る
- 正誤に応じた「未学習 / 学習中 / 苦手 / 習得」の自動判定と、苦手だけの復習（苦手＝2回以上間違えた語と、正解したあとで落とした語）
- カードの意味の編集とメモの追記（この端末に保存。出題の選択肢と判定は元の意味のまま）
- 学習の途中で中断するときの確認と、再読み込みのあとの続きからの再開
- 単語帳（検索・絞り込み・手動で苦手/習得の登録）
- 成績（習得率、直近14日の回答数、苦手ワード一覧）
- 学習記録のバックアップ（コピー＆貼り付けで別端末へ引き継ぎ）
- キーボード操作、ダークモード、スマホ幅対応

学習記録はブラウザの `localStorage` に保存され、端末ごとに独立しています。
同じ端末で2つのタブ（ウィンドウ）に開いて使っても、保存の直前に最新の保存内容と合わせるので、片方の記録がもう片方を上書きして消すことはありません
（項目ごとに回答数の多いほう、同数なら新しいほうを残す。消した記録は、消した印を残して戻らないようにする）。
保存に失敗したとき（容量の不足など）は、画面に一度だけ知らせます。

## ビルド

必要なもの: Node.js（22 で確認）、Python 3.11 以上（3.11 と 3.13 で確認）。テストには Playwright（chromium）も使います。

```sh
cd tango-drill
./build_all.sh
```

`build_all.sh` は次を順に実行し、どれかが失敗したらその場で止まります（終了コード1）。

1. `python3 book/build_book.py` … 古文330・読み → `src/book_data.js`
2. `python3 book/build_joshiki.py` … 古文常識 → `src/joshiki_data.js`
3. `python3 book/build_extra.py` … 文学史・和歌・文法 → `src/extra_data.js`
4. `node build.js` … `src/` のテンプレートにデータを埋め込み、`index.html` と `dist/artifact.html` を書き出す。最後に「収録: …」（科目ごとの件数）と「IDの検査: OK」を出す

`src/` のデータ（`data_*.js`・`chunks/`・`exs/`）やテンプレートだけを直したときは、`node build.js` だけでも構いません。
入力の不備（ファイルの欠け、列の数の違い、JSON の読み取りの失敗、古文330の用例の数と意味の数の食い違い）は、飛ばさずにファイル名と行番号を出して止まります。

`index.html` と `dist/artifact.html` は生成物ですが、GitHub Pages（`.github/workflows/pages.yml`）がそのまま公開するのでコミットします。
データやテンプレートを直したら、必ず作り直してから一緒にコミットしてください。
プルリクエストと main への push では、`.github/workflows/tango-drill-check.yml` が `build_all.sh` で作り直し、IDの検査が通ること、
作り直した `index.html`・`dist/artifact.html`・`src/*_data.js` がコミットされたものと一致すること、ブラウザを使わないテストが通ることを確かめます。

## テスト

```sh
cd tango-drill
node --test
```

ブラウザを使うテストは Playwright（chromium）で、試験用の完成版を一時フォルダに作って開きます（リポジトリの `index.html` は書き換えません）。
ブラウザを使わないテスト（CI で実行するもの）は `node --test tests/ids.test.js tests/data.test.js tests/build.test.js` です。
各テストの内容は `tests/README.md` にあります。

## 学習記録の引き継ぎ（IDを変える修正をするとき）

学習記録は項目のIDにひも付いています。見出し語や番号を直すとIDが変わるので、`src/migrations.json` に旧IDから新IDへの対応を足し、
`node build.js` の「IDの検査: OK」を確かめてください。手順と道具は `tools/README.md` にあります。

## ファイル構成

```
tango-drill/
  index.html            # ビルド済み・単体で開ける完全版（これを配布する。GitHub Pages で公開）
  dist/artifact.html    # claude.ai Artifact 用（外枠の html/head/body なし）
  build_all.sh          # データの組み立てからビルドまでを順に実行する
  build.js              # src/ から index.html と dist/ を生成する
  src/index.tmpl.html   # アプリ本体（HTML/CSS/JS）のテンプレート
  src/migrations.json   # 学習記録のIDの移行表（tools/README.md）
  src/data_kobun.js     # 古文単語データ
  src/data_eigo.js      # 英単語データ（初期分）
  src/chunks/*.json     # 追加語彙（ビルド時に結合。kobun_add.json は古文、ほかは英単語）
  src/exs/*.json        # 意味ごとの例文（古文・英単語）
  src/book_data.js      # 古文330・読み70（book/build_book.py が生成）
  src/joshiki_data.js   # 古文常識（book/build_joshiki.py が生成）
  src/extra_data.js     # 文学史・和歌・文法（book/build_extra.py が生成）
  src/joshiki_img.js    # 古文常識の挿絵23点（JPEG を data URI で埋め込み。book/illust/make_img.py が生成）
  book/                 # 古文330・読み・古文常識・文学史・和歌・文法の元データと組み立てスクリプト（下の表）
  tools/                # 学習記録のIDの取り出しと検査（tools/README.md）
  tests/                # テスト（tests/README.md）
```

## データの元ファイル

| ファイル | 内容 | 使うスクリプト |
| --- | --- | --- |
| `src/data_kobun.js`・`src/chunks/kobun_add.json` | 古文単語（古文330の品詞・用例の元にもなる） | `build.js`・`book/build_book.py` |
| `src/data_eigo.js`・`src/chunks/eigo_*.json` | 英単語 | `build.js` |
| `src/exs/eigo_*.json`・`src/exs/kobun_*.json` | 意味ごとの例文 | `build.js` |
| `book/index_transcription.json` | 古文単語集の索引の書き起こし（`mm_numbered.tsv` の元） | — |
| `book/mm_numbered.tsv` | 古文330の番号・見出し語・品詞・意味・ページ（6列） | `book/build_book.py` |
| `book/mm_related.tsv` | 古文330の関連語（見出し語・語・品詞・意味の4列） | `book/build_book.py` |
| `book/mm_yomi.tsv` | 読み70（番号・漢字・読み・意味・歴史的仮名遣いの5列） | `book/build_book.py` |
| `book/mm_new97.json` | 古文単語データに無かった語として新しく作った語 | `book/build_book.py` |
| `book/exs_out_1〜3.json` | 古文330の意味ごとの用例（意味の数と同じ数） | `book/build_book.py` |
| `book/book_overrides.json` | 古文330の見直し済みの漢字・品詞・注・分野（番号がキー） | `book/build_book.py` |
| `book/joshiki.tsv` | 古文常識（分類・語・読み・意味・ページ・[歴史的仮名遣い] の5〜6列） | `book/build_joshiki.py` |
| `book/bungakushi.tsv` | 文学史（時代・世紀・作品・ジャンル・作者・成立年・マーカー・要点の8列） | `book/build_extra.py` |
| `book/seiritsu.json` | 文学史の成立年の根拠 | `book/build_extra.py` |
| `book/tables_data.py` | 助詞・活用・文学史チェックリストの表データ | `book/build_extra.py` |
| `book/build_extra.py` の中の表 | 和歌の修辞（枕詞・掛詞・縁語・歌枕・用語）、助動詞 | `book/build_extra.py` |
| `book/shuji.tsv`・`book/joshiki_illust.tsv` | 和歌の修辞と古文常識の図の読み取りメモ（ビルドには使わない） | — |
| `book/illust/crops.tsv` | 挿絵の切り抜きの座標 | `book/illust/make_img.py` |

`book/inputs.py` は組み立てスクリプト共通の読み込み（入力の不備で止める）です。

## 挿絵の作り方

古文常識の挿絵（`src/joshiki_img.js`）は、古文単語集の古文常識のページの写真から切り抜いて作ります。
写真は権利の都合でリポジトリに入れていません（`book/illust/photos/` に置けば git には入りません）。使う写真は次の16枚です（ファイル名: 切り抜く挿絵のキー）。

```
10737c25-image.jpg: gissha
13c437ce-image.jpg: kangen
19ec3b35-image.jpg: uchiki
1a1a6da9-image.jpg: hagi ogi
2a4bdb9a-image.jpg: shinden
660ce91e-image.jpg: ika
711290e6-image.jpg: kaimami
7703852a-image.jpg: tachibana
80ec38bc-image.jpg: katatagae
8cfc97df-image.jpg: aoi
9097801c-image.jpg: kyosoku shitsunai
a473ea57-image.jpg: fumi akatsuki mikanoyo
d172c45a-image.jpg: hentai shirabyoshi
d5190607-image.jpg: rinne
eab6df18-image.jpg: gosechi
fc9d187b-image.jpg: mogi kanmuri bukumo
```

```sh
cd tango-drill
pip install Pillow
python3 book/illust/make_img.py book/illust/photos --png /tmp/illust-check   # --png は確認用（任意）
node build.js
```

`make_img.py` は、`book/illust/crops.tsv` の座標（写真の幅を2000としたときの左上と右下）で切り抜き、時計回りに90度回して、
長い辺を760px以内に縮め、JPEG（品質72）にして書き出します。同じ写真からは、いまの `src/joshiki_img.js` とまったく同じものができます（Pillow 12.3 で確認）。
挿絵を足すときは、`crops.tsv` に行を足し、`book/build_joshiki.py` の `IMG`（キーと語の対応）にも足してください。

## 単語の追加・修正

`src/chunks/` に JSON 配列ファイルを置く（または既存ファイルに行を足す）か、`src/data_*.js` を編集し、
`node --test tests/data.test.js` で形式（要素数・意味・レベル・タグ）と見出し語の重複を確かめてから `node build.js` を実行してください。
各行の形式は `src/data_*.js` 先頭のコメントに記載しています。英単語のレベルは 1=基礎（共通テスト）、2=標準（MARCH・関関同立）、3=発展（早慶上智・旧帝）、4=最難関。
見出し語を直すとIDが変わるので、上の「学習記録の引き継ぎ」も行ってください。
