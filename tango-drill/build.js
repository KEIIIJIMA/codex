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
// 任意: node build.js --extra <data.js> [--extra ...] --out <file.html>
// 個人用データ（公開リポジトリに入れないもの）を追加し、Artifact 形式で --out にだけ書き出す。
const args = process.argv.slice(2), extras = [], outIdx = args.indexOf('--out');
args.forEach((a, i) => { if (a === '--extra') extras.push(args[i + 1]); });
for (const f of extras) extra += '\n' + fs.readFileSync(f, 'utf8');
const full = tmpl.replace('/*DATA*/', () => data + extra);
if (outIdx >= 0) {
  fs.writeFileSync(args[outIdx + 1], full.split('\n').filter(l => !l.includes('<!--SKEL-->')).join('\n'));
  console.log('built ' + args[outIdx + 1]);
  process.exit(0);
}
fs.writeFileSync(path.join(root, 'index.html'), full.split('\n').map(l => l.replace('<!--SKEL-->', '')).join('\n'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), full.split('\n').filter(l => !l.includes('<!--SKEL-->')).join('\n'));
console.log('built index.html and dist/artifact.html');
