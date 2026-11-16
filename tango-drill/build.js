// ビルド: src/ のテンプレートに語彙データを埋め込み、index.html (単体で開ける完全版) と
// dist/artifact.html (claude.ai Artifact 用、html/head/body の外枠なし) を生成する。
const fs = require('fs'), path = require('path');
const root = __dirname;
const tmpl = fs.readFileSync(path.join(root, 'src/index.tmpl.html'), 'utf8');
const data = ['data_kobun.js', 'data_eigo.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const chunkDir = path.join(root, 'src/chunks');
const chunks = fs.existsSync(chunkDir) ? fs.readdirSync(chunkDir).filter(f => f.endsWith('.json')).sort() : [];
let extra = '';
for (const f of chunks) {
  const arr = JSON.parse(fs.readFileSync(path.join(chunkDir, f), 'utf8'));
  extra += `\n${f.startsWith('kobun') ? 'KOBUN_RAW' : 'EIGO_RAW'}.push(...${JSON.stringify(arr)});`;
}
// 意味ごとの例文（src/exs/eigo_*.json: [{w, exs:[[例文,訳],...]}]）を EIGO_EXS として埋め込む
const exsDir = path.join(root, 'src/exs'); const eigoExs = {};
if (fs.existsSync(exsDir)) for (const f of fs.readdirSync(exsDir).filter(f => /^eigo_.*\.json$/.test(f)).sort())
  { try { for (const r of JSON.parse(fs.readFileSync(path.join(exsDir, f), 'utf8'))) eigoExs[r.w] = r.exs; } catch (e) { console.warn('skip ' + f + ': ' + e.message); } }
extra += `\nconst EIGO_EXS=${JSON.stringify(eigoExs)};`;
const kobunExs = {};
if (fs.existsSync(exsDir)) for (const f of fs.readdirSync(exsDir).filter(f => /^kobun_.*\.json$/.test(f)).sort())
  { try { for (const r of JSON.parse(fs.readFileSync(path.join(exsDir, f), 'utf8'))) kobunExs[r.key] = r.exs; } catch (e) { console.warn('skip ' + f + ': ' + e.message); } }
extra += `\nconst KOBUN_EXS=${JSON.stringify(kobunExs)};`;
// 単語集準拠データ（book/build_book.py が生成）があれば含める
const bookData = path.join(root, 'src/book_data.js');
if (fs.existsSync(bookData)) extra += '\n' + fs.readFileSync(bookData, 'utf8');
const joshikiData = path.join(root, 'src/joshiki_data.js');
if (fs.existsSync(joshikiData)) extra += '\n' + fs.readFileSync(joshikiData, 'utf8');
const extraData = path.join(root, 'src/extra_data.js');
if (fs.existsSync(extraData)) extra += '\n' + fs.readFileSync(extraData, 'utf8');
// 古文常識の挿絵と表の写真（data URI）
const imgData = path.join(root, 'src/joshiki_img.js');
if (fs.existsSync(imgData)) extra += '\n' + fs.readFileSync(imgData, 'utf8');
// 任意: node build.js --extra <data.js> [--extra ...] --out <file.html>
// 個人用データ（公開リポジトリに入れないもの）を追加し、Artifact 形式で --out にだけ書き出す。
const args = process.argv.slice(2), extras = [], outIdx = args.indexOf('--out');
args.forEach((a, i) => { if (a === '--extra') extras.push(args[i + 1]); });
for (const f of extras) extra += '\n' + fs.readFileSync(f, 'utf8');
// 項目IDの移行表（src/migrations.json: [{"v":1,"map":{"旧ID":"新ID",…}}, …]。v は1からの連番）を
// テンプレートの定数 MIGRATIONS に埋め込む。見出し語や番号の訂正でIDが変わっても、学習記録を新しいIDへ引き継ぐ。
const fail = msg => { console.error(msg); process.exit(1); };
const migFile = path.join(root, 'src/migrations.json');
let migrations = [];
try { if (fs.existsSync(migFile)) migrations = JSON.parse(fs.readFileSync(migFile, 'utf8')); } catch (e) { fail('src/migrations.json: 読み取れません: ' + e.message); }
if (!Array.isArray(migrations)) fail('src/migrations.json: 配列（[{"v":1,"map":{…}}, …]）ではありません');
migrations.forEach((m, i) => {
  if (!m || m.v !== i + 1) fail(`src/migrations.json: ${i + 1}番目の v が ${i + 1} ではありません（v は1からの連番）`);
  if (!m.map || typeof m.map !== 'object' || Array.isArray(m.map)) fail(`src/migrations.json: v:${m.v} に map（{"旧ID":"新ID"}）がありません`);
  for (const [from, to] of Object.entries(m.map)) if (typeof to !== 'string' || !to || to === from) fail(`src/migrations.json: v:${m.v} の「${from}」の付け替え先が正しくありません`);
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
