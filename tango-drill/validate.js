// 使い方: node validate.js <json file> [rangeStart rangeEnd]
// 語彙チャンク(JSON配列)の形式チェック。英語は8要素、古文は9要素。
const fs = require('fs');
const [,, file, rs, re] = process.argv;
let arr; try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('JSON parse error:', e.message); process.exit(1); }
if (!Array.isArray(arr)) { console.log('not an array'); process.exit(1); }
const isKobun = /kobun/.test(file);
const g = {}; (new Function('g', fs.readFileSync(__dirname + '/src/data_eigo.js', 'utf8').replace('const EIGO_RAW', 'g.E') + ';' + fs.readFileSync(__dirname + '/src/data_kobun.js', 'utf8').replace('const KOBUN_RAW', 'g.K')))(g);
const existing = new Set((isKobun ? g.K : g.E).map(r => r[0].toLowerCase()));
const TAGS = new Set(isKobun ? ['心情','評価','様子','動詞','名詞','副詞','呼応','連語','敬語','多義語','古今異義'] : ['社会','政治・法','経済','科学','環境','心理','思考','言語','学習','文化','行動','変化','評価','性格','時間','抽象','身体・健康','日常']);
const errs = [], seen = new Set(); let n = 0; const lv = {};
arr.forEach((r, i) => {
  const tag = `#${i} ${JSON.stringify(r && r[0])}`;
  if (!Array.isArray(r) || r.length !== (isKobun ? 9 : 8)) return errs.push(tag + ' 要素数が不正');
  const w = String(r[0]).trim().toLowerCase();
  if (!w) return errs.push(tag + ' 見出し空');
  if (seen.has(w)) errs.push(tag + ' ファイル内で重複'); seen.add(w);
  if (existing.has(w)) errs.push(tag + ' 既存データと重複（削除してください）');
  if (rs && !(w >= rs && w < re)) errs.push(tag + ` 範囲外 [${rs}, ${re})`);
  const mi = isKobun ? 3 : 2, exi = isKobun ? 4 : 3, lvi = isKobun ? 7 : 6, tgi = isKobun ? 8 : 7;
  if (!Array.isArray(r[mi]) || !r[mi].length || r[mi].some(m => typeof m !== 'string' || !m.trim())) errs.push(tag + ' 意味が不正');
  if (typeof r[exi] !== 'string' || typeof r[exi + 1] !== 'string') errs.push(tag + ' 例文/訳が文字列でない');
  if (!isKobun && r[exi] && r[exi].split(/\s+/).length > 16) errs.push(tag + ' 例文が長すぎ(16語超)');
  if (![1,2,3,4].includes(r[lvi]) || (isKobun && r[lvi] > 2)) errs.push(tag + ' レベル不正');
  if (!Array.isArray(r[tgi]) || !r[tgi].length || r[tgi].some(t => !TAGS.has(t))) errs.push(tag + ' タグ不正: ' + JSON.stringify(r[tgi]));
  lv[r[lvi]] = (lv[r[lvi]] || 0) + 1; n++;
});
console.log(`entries: ${n}  levels: ${JSON.stringify(lv)}  errors: ${errs.length}`);
errs.slice(0, 40).forEach(e => console.log('  ' + e));
process.exit(errs.length ? 1 : 0);
