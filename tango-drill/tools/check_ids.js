// IDが消える更新を止める検査。
// 基準（tools/ids_baseline.json ＝ 公開中の版のID一覧と版番号）の各IDに、基準の版より新しい移行を番号順に当て、
// その行き先が新しい完成版に存在することを確かめる。移行は完成版に埋め込まれたもの（＝利用者の手元で動くもの）を使う。
// あわせて、新しい移行の付け替え先が完成版に存在することも確かめる（存在しないIDへ記録を移さないため）。
// 使い方: node tools/check_ids.js [完成版.html] [基準.json]   → 問題があれば一覧を出して終了コード1
//         （省略時は ../index.html と tools/ids_baseline.json。node build.js が書き出しの後に自動で行う）
const fs = require('fs'), path = require('path');
const { idsFromHtml, migrationsFromHtml, latest } = require('./ids.js');

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// id に、版 from より新しい移行を番号順に当てた行き先（1つの移行の中では1回だけ付け替える）
const follow = (migrations, id, from) => migrations.reduce((x, m) => (m.v > from && has(m.map, x) ? m.map[x] : x), id);

// baseline: {v, ids}、ids: 新しい完成版のID、migrations: [{v, map}]
// 戻り値: { ok, missing: [{id, to}], dangling: [{v, from, to}] }
//   missing  = 基準のIDのうち、行き先 to が完成版に無いもの
//   dangling = 基準の版より新しい移行の対応のうち、行き先 to が完成版に無いもの
function checkIds({ baseline, ids, migrations }) {
  const live = new Set(ids), migs = migrations.slice().sort((a, b) => a.v - b.v);
  const missing = [], dangling = [];
  for (const id of baseline.ids) { const to = follow(migs, id, baseline.v); if (!live.has(to)) missing.push({ id, to }); }
  for (const m of migs) {
    if (m.v <= baseline.v) continue;
    for (const from of Object.keys(m.map)) { const to = follow(migs, m.map[from], m.v); if (!live.has(to)) dangling.push({ v: m.v, from, to }); }
  }
  return { ok: !missing.length && !dangling.length, missing, dangling };
}

// 完成版の HTML を基準と比べる。戻り値は checkIds の結果に、表示用の text を足したもの
function checkHtml(html, baseline) {
  const ids = idsFromHtml(html), migrations = migrationsFromHtml(html);
  const r = checkIds({ baseline, ids, migrations });
  const head = `基準: 版${baseline.v}・${baseline.ids.length}件／完成版: 版${latest(migrations)}・${ids.length}件`;
  if (r.ok) return Object.assign(r, { text: `IDの検査: OK（${head}）` });
  const lines = [`IDの検査: 失敗（${head}）`];
  if (r.missing.length) {
    lines.push(`■ 公開中の版にあるIDのうち ${r.missing.length} 件が、新しい完成版にありません。このまま公開すると、その項目の学習記録が切れます。`);
    for (const m of r.missing) lines.push('  - ' + m.id + (m.to !== m.id ? '   （移行の行き先: ' + m.to + '）' : ''));
  }
  if (r.dangling.length) {
    lines.push(`■ 新しい移行の付け替え先のうち ${r.dangling.length} 件が、新しい完成版にありません。記録が存在しないIDへ移ってしまいます。`);
    for (const d of r.dangling) lines.push(`  - v:${d.v}  ${d.from}  →  ${d.to}`);
  }
  lines.push('直し方: 見出し語や番号を直してIDが変わったのなら、src/migrations.json に 旧ID→新ID の対応を足す');
  lines.push('（公開済みの版の移行は書き換えず、次の番号の移行を足す。まだ公開していない移行は書き換えてよい）。');
  return Object.assign(r, { text: lines.join('\n') });
}

module.exports = { checkIds, checkHtml };

if (require.main === module) {
  const html = fs.readFileSync(path.resolve(process.argv[2] || path.join(__dirname, '../index.html')), 'utf8');
  const baseline = JSON.parse(fs.readFileSync(path.resolve(process.argv[3] || path.join(__dirname, 'ids_baseline.json')), 'utf8'));
  const r = checkHtml(html, baseline);
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}
