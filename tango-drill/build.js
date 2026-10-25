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
const full = tmpl.replace('/*DATA*/', () => data + extra);
fs.writeFileSync(path.join(root, 'index.html'), full.split('\n').map(l => l.replace('<!--SKEL-->', '')).join('\n'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), full.split('\n').filter(l => !l.includes('<!--SKEL-->')).join('\n'));
console.log('built index.html and dist/artifact.html');
