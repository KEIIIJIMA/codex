#!/usr/bin/env bash
# 単語ドリルを、元のデータからまとめて作り直す。どれかが失敗したら、その場で止まる（終了コード1）。
#   1. book/build_book.py    … 古文330・読み       → src/book_data.js
#   2. book/build_joshiki.py … 古文常識            → src/joshiki_data.js
#   3. book/build_extra.py   … 文学史・和歌・文法  → src/extra_data.js
#   4. node build.js         … 完成版 index.html と dist/artifact.html（最後に「IDの検査: OK」）
# 使い方: tango-drill/ で ./build_all.sh（どこから実行してもよい）
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
for s in build_book.py build_joshiki.py build_extra.py; do
  echo "== book/$s"
  "$PY" "book/$s"
done
echo "== node build.js"
node build.js
