// 基準（tools/ids_baseline.json）を、完成版のID一覧と版番号で更新する。新しい版を公開するたびに実行する。
// 版番号は、完成版に埋め込まれた移行表の最新の v（埋め込みの無い古い版は0）。
// 使い方: node tools/update_baseline.js [完成版.html] [基準.json] [--note メモ] [--force]
//   省略時は ../index.html と tools/ids_baseline.json。
//   いまの基準の検査（check_ids.js）に通らない完成版では書き換えない。わざとIDを消したときだけ --force を付ける。
const fs = require('fs'), path = require('path');
const { idsFromHtml, migrationsFromHtml, latest } = require('./ids.js');
const { checkHtml } = require('./check_ids.js');

const files = [], opt = {};
for (let a = process.argv.slice(2), i = 0; i < a.length; i++) {
  if (a[i] === '--force') opt.force = true; else if (a[i] === '--note') opt.note = a[++i]; else files.push(a[i]);
}
const htmlFile = path.resolve(files[0] || path.join(__dirname, '../index.html'));
const baseFile = path.resolve(files[1] || path.join(__dirname, 'ids_baseline.json'));
const html = fs.readFileSync(htmlFile, 'utf8');
if (fs.existsSync(baseFile) && !opt.force) {
  const r = checkHtml(html, JSON.parse(fs.readFileSync(baseFile, 'utf8')));
  if (!r.ok) {
    console.error(r.text);
    console.error('いまの基準の検査に通らないので、基準は書き換えていません（わざと消したIDなら --force を付ける）。');
    process.exit(1);
  }
}
const ids = idsFromHtml(html), v = latest(migrationsFromHtml(html));
// IDを1行に1つ書く（差分を読みやすくするため）
fs.writeFileSync(baseFile, `{\n"v": ${v},\n"note": ${JSON.stringify(opt.note || '')},\n"ids": [\n${ids.map(id => JSON.stringify(id)).join(',\n')}\n]\n}\n`);
console.log(`基準を更新しました: 版${v}・${ids.length}件 → ${baseFile}`);
