// 完成版の HTML から、学習記録のキーになる全項目のIDを取り出す。
// IDの作り方は src/index.tmpl.html の DATA を組み立てている箇所と同じ（変えるときは必ず両方を直す。
// tests/migration.test.js が、ここで取り出したIDとアプリが実際に使うIDの一致を確かめている）。
//   古文単語 k:見出し語|漢字表記（漢字表記が無ければ k:見出し語）   英単語 e:見出し語
//   古文330 b:番号   古文330の関連語 br:番号:順（0始まり）   読み y:番号   古文常識 j:語
//   文学史・和歌・文法など キー:語|k欄|種別
// 使い方: node tools/ids.js [完成版.html]   → IDを1行に1つ出力（省略時は ../index.html）
const fs = require('fs'), path = require('path');

// データの <script>（const KOBUN_RAW=… を含むもの）を実行して、元の配列を取り出す
function rawData(html) {
  const src = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => /\bconst KOBUN_RAW\s*=/.test(s));
  if (!src) throw new Error('完成版の HTML に語彙データ（const KOBUN_RAW=…）が見つかりません');
  const names = ['KOBUN_RAW', 'EIGO_RAW', 'BOOK_RAW', 'YOMI_RAW', 'JOSHIKI_RAW', 'EXTRA_SUBJ'];
  return new Function(src + '\nreturn {' + names.map(n => `${n}:typeof ${n}==='undefined'?[]:${n}`).join(',') + '};')();
}

// 全項目のID（重複なし、並べ替え済み）
function idsFromHtml(html) {
  const d = rawData(html), ids = new Set();
  d.KOBUN_RAW.forEach(r => ids.add('k:' + r[0] + (r[1] ? '|' + r[1] : '')));
  d.EIGO_RAW.forEach(r => ids.add('e:' + r[0]));
  d.BOOK_RAW.forEach(r => { ids.add('b:' + r[0]); (r[10] || []).forEach((x, i) => ids.add('br:' + r[0] + ':' + i)); });
  d.YOMI_RAW.forEach(r => ids.add('y:' + r[0]));
  d.JOSHIKI_RAW.forEach(r => ids.add('j:' + r[1]));
  d.EXTRA_SUBJ.forEach(e => e.items.forEach(r => ids.add(e.key + ':' + r.w + '|' + (r.k || '') + '|' + r.pos)));
  return [...ids].sort();
}

// 科目ごとの件数（README の「収録内容」の語数。build.js が書き出しの後に「収録: …」として出す）
function countsFromHtml(html) {
  const d = rawData(html), ex = key => (d.EXTRA_SUBJ.find(e => e.key === key) || { items: [] }).items.length;
  return {
    古文単語: d.KOBUN_RAW.length, 古文330: d.BOOK_RAW.length, 古文330の関連語: d.BOOK_RAW.reduce((n, r) => n + (r[10] || []).length, 0),
    古文常識: d.JOSHIKI_RAW.length, 文学史: ex('bungaku'), 和歌: ex('waka'), 文法: ex('bunpo'), 読み: d.YOMI_RAW.length, 英単語: d.EIGO_RAW.length,
  };
}

// 完成版に埋め込まれた移行表（build.js が「const MIGRATIONS=[…];」の1行で埋め込む）。
// 埋め込みの無い古い版は空の配列（＝版0）。
function migrationsFromHtml(html) {
  const m = html.match(/^const MIGRATIONS=(\[.*\]);$/m);
  return m ? JSON.parse(m[1]) : [];
}
const latest = migrations => migrations.reduce((n, m) => Math.max(n, m.v), 0);

module.exports = { rawData, idsFromHtml, countsFromHtml, migrationsFromHtml, latest };

if (require.main === module) {
  const file = path.resolve(process.argv[2] || path.join(__dirname, '../index.html'));
  console.log(idsFromHtml(fs.readFileSync(file, 'utf8')).join('\n'));
}
