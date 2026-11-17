// ビルド: src/ のテンプレートに語彙データを埋め込み、index.html (単体で開ける完全版) と
// dist/artifact.html (claude.ai Artifact 用、html/head/body の外枠なし) を生成する。
// 入力の不備（必要なファイルの欠け、JSON の読み取りの失敗）は、飛ばさずに終了コード1で止める。
// データの組み立て（book/*.py）からまとめて行うときは ./build_all.sh を使う。
const fs = require('fs'), path = require('path');
const root = __dirname;
const fail = msg => { console.error(msg); process.exit(1); };
// 必要なファイルを読む（無ければ止まる）
const need = rel => {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) fail(rel + ': ファイルがありません（book/ のデータから作るものは ./build_all.sh で作り直してください）');
  return fs.readFileSync(f, 'utf8');
};
// JSON のファイルを読む（読み取れなければ止まる）
const needJson = rel => { const s = need(rel); try { return JSON.parse(s); } catch (e) { return fail(rel + ': 読み取れません: ' + e.message); } };
const tmpl = need('src/index.tmpl.html');
const data = ['data_kobun.js', 'data_eigo.js'].map(f => need('src/' + f)).join('\n');
const jsonFiles = (dir, re) => { if (!fs.existsSync(path.join(root, dir))) fail(dir + ': フォルダがありません'); return fs.readdirSync(path.join(root, dir)).filter(f => re.test(f)).sort(); };
const chunks = jsonFiles('src/chunks', /\.json$/);
let extra = '';
for (const f of chunks) {
  const arr = needJson('src/chunks/' + f);
  if (!Array.isArray(arr)) fail('src/chunks/' + f + ': 配列ではありません');
  extra += `\n${f.startsWith('kobun') ? 'KOBUN_RAW' : 'EIGO_RAW'}.push(...${JSON.stringify(arr)});`;
}
// 意味ごとの例文（src/exs/eigo_*.json: [{w, exs:[[例文,訳],...]}]）を EIGO_EXS として埋め込む
const exsOf = (re, key) => {
  const o = {};
  for (const f of jsonFiles('src/exs', re)) {
    const arr = needJson('src/exs/' + f);
    if (!Array.isArray(arr)) fail('src/exs/' + f + ': 配列ではありません');
    for (const r of arr) o[r[key]] = r.exs;
  }
  return o;
};
extra += `\nconst EIGO_EXS=${JSON.stringify(exsOf(/^eigo_.*\.json$/, 'w'))};`;
// 古文単語の意味ごとの例文（src/exs/kobun_*.json: [{key, exs}]）
extra += `\nconst KOBUN_EXS=${JSON.stringify(exsOf(/^kobun_.*\.json$/, 'key'))};`;
// 古文330・読み（book/build_book.py が生成）、古文常識（book/build_joshiki.py）、文学史・和歌・文法（book/build_extra.py）、
// 古文常識の挿絵（data URI。作り方は README.md の「挿絵の作り方」）
for (const f of ['src/book_data.js', 'src/joshiki_data.js', 'src/extra_data.js', 'src/joshiki_img.js']) extra += '\n' + need(f);
// 任意: node build.js --extra <data.js> [--extra ...] --out <file.html>
// 個人用データ（公開リポジトリに入れないもの）を追加し、Artifact 形式で --out にだけ書き出す。
const args = process.argv.slice(2), extras = [], outIdx = args.indexOf('--out');
args.forEach((a, i) => { if (a === '--extra') extras.push(args[i + 1]); });
for (const f of extras) extra += '\n' + fs.readFileSync(f, 'utf8');
// 項目IDの移行表（src/migrations.json: [{"v":1,"map":{"旧ID":"新ID",…}}, …]。v は1からの連番）を
// テンプレートの定数 MIGRATIONS に埋め込む。見出し語や番号の訂正でIDが変わっても、学習記録を新しいIDへ引き継ぐ。
const migFile = path.join(root, 'src/migrations.json');
let migrations = [];
try { if (fs.existsSync(migFile)) migrations = JSON.parse(fs.readFileSync(migFile, 'utf8')); } catch (e) { fail('src/migrations.json: 読み取れません: ' + e.message); }
if (!Array.isArray(migrations)) fail('src/migrations.json: 配列（[{"v":1,"map":{…}}, …]）ではありません');
migrations.forEach((m, i) => {
  if (!m || m.v !== i + 1) fail(`src/migrations.json: ${i + 1}番目の v が ${i + 1} ではありません（v は1からの連番）`);
  if (!m.map || typeof m.map !== 'object' || Array.isArray(m.map)) fail(`src/migrations.json: v:${m.v} に map（{"旧ID":"新ID"}）がありません`);
  // 付け替え先は新IDの文字列。null は「削除」（その項目が無くなった）
  for (const [from, to] of Object.entries(m.map)) if (to !== null && (typeof to !== 'string' || !to || to === from)) fail(`src/migrations.json: v:${m.v} の「${from}」の付け替え先が正しくありません`);
});
migrations = migrations.map(m => ({ v: m.v, map: m.map })); // note などの覚え書きは埋め込まない
// <script> の中に入るので、HTML の区切りに見える「<」などは \u 形式にする
const migJson = JSON.stringify(migrations).replace(/[<\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const full = tmpl.replace('/*MIGRATIONS*/[]', () => migJson).replace('/*DATA*/', () => data + extra);
const { migrationsFromHtml } = require('./tools/ids.js');
if (JSON.stringify(migrationsFromHtml(full)) !== JSON.stringify(migrations)) fail('移行表を埋め込めませんでした。src/index.tmpl.html に「const MIGRATIONS=/*MIGRATIONS*/[];」の行が必要です');
if (outIdx >= 0) {
  fs.writeFileSync(args[outIdx + 1], full.split('\n').filter(l => !l.includes('<!--SKEL-->')).join('\n'));
  console.log('built ' + args[outIdx + 1]);
  process.exit(0);
}
const indexHtml = full.split('\n').map(l => l.replace('<!--SKEL-->', '')).join('\n');
fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), full.split('\n').filter(l => !l.includes('<!--SKEL-->')).join('\n'));
console.log('built index.html and dist/artifact.html');
// 科目ごとの件数（README の「収録内容」の語数と同じになるようにする。tests/data.test.js が確かめる）
console.log('収録: ' + Object.entries(require('./tools/ids.js').countsFromHtml(indexHtml)).map(([k, n]) => k + ' ' + n).join('／'));
// IDが消える更新を止める検査（tools/check_ids.js）。公開中の版のID（tools/ids_baseline.json）が、
// 移行を当てた上で新しい完成版にすべて残っていることを確かめる。SKIP_ID_CHECK=1 で飛ばせる。
if (process.env.SKIP_ID_CHECK === '1') console.log('IDの検査を飛ばしました（SKIP_ID_CHECK=1）');
else {
  let baseline;
  try { baseline = JSON.parse(fs.readFileSync(path.join(root, 'tools/ids_baseline.json'), 'utf8')); } catch (e) { fail('tools/ids_baseline.json: 読み取れません: ' + e.message); }
  const res = require('./tools/check_ids.js').checkHtml(indexHtml, baseline);
  if (!res.ok) fail(res.text);
  console.log(res.text);
}
