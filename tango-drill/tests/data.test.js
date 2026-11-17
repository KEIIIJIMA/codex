// 語彙データの形式と README の語数のテスト（ブラウザを使わない）。実行: node tests/data.test.js
// 以前の validate.js（1つのチャンクだけの形式チェック）の検査を、全チャンクと元のデータ（src/data_*.js）にかけ、
// チャンク同士・元データとの重複も見る。README の「収録内容」の語数が、ビルドしたデータの件数と一致することも確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const H = require('./helpers');
const { rawData, countsFromHtml } = require('../tools/ids.js');

const ROOT = H.ROOT;
const TAGS = {
  kobun: new Set(['心情', '評価', '様子', '動詞', '名詞', '副詞', '呼応', '連語', '敬語', '多義語', '古今異義']),
  eigo: new Set(['社会', '政治・法', '経済', '科学', '環境', '心理', '思考', '言語', '学習', '文化', '行動', '変化', '評価', '性格', '時間', '抽象', '身体・健康', '日常']),
};
// 元のデータ（src/data_*.js）を読み込む
function base() {
  const g = {};
  new Function('g', fs.readFileSync(path.join(ROOT, 'src/data_eigo.js'), 'utf8').replace('const EIGO_RAW', 'g.eigo') + ';' +
    fs.readFileSync(path.join(ROOT, 'src/data_kobun.js'), 'utf8').replace('const KOBUN_RAW', 'g.kobun'))(g);
  return g;
}
const chunkFiles = () => fs.readdirSync(path.join(ROOT, 'src/chunks')).filter(f => f.endsWith('.json')).sort();

// 1行の形式の誤り（validate.js と同じ基準。英語は8要素、古文は9要素）
function rowErrors(r, kind) {
  const isKobun = kind === 'kobun', errs = [];
  if (!Array.isArray(r) || r.length !== (isKobun ? 9 : 8)) return ['要素数が不正'];
  if (!String(r[0]).trim()) errs.push('見出し空');
  const mi = isKobun ? 3 : 2, exi = isKobun ? 4 : 3, lvi = isKobun ? 7 : 6, tgi = isKobun ? 8 : 7;
  if (!Array.isArray(r[mi]) || !r[mi].length || r[mi].some(m => typeof m !== 'string' || !m.trim())) errs.push('意味が不正');
  if (typeof r[exi] !== 'string' || typeof r[exi + 1] !== 'string') errs.push('例文/訳が文字列でない');
  if (!isKobun && r[exi] && r[exi].split(/\s+/).length > 16) errs.push('例文が長すぎ(16語超)');
  if (![1, 2, 3, 4].includes(r[lvi]) || (isKobun && r[lvi] > 2)) errs.push('レベル不正');
  if (!Array.isArray(r[tgi]) || !r[tgi].length || r[tgi].some(t => !TAGS[kind].has(t))) errs.push('タグ不正: ' + JSON.stringify(r[tgi]));
  return errs;
}

test('追加語彙のチャンク（src/chunks/*.json）は、どれも1行ずつ正しい形式', () => {
  const files = chunkFiles();
  assert.ok(files.length > 0, 'src/chunks に JSON がありません');
  const errs = [];
  for (const f of files) {
    const kind = f.startsWith('kobun') ? 'kobun' : 'eigo';
    let arr;
    try { arr = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/chunks', f), 'utf8')); } catch (e) { errs.push(`${f}: 読み取れません: ${e.message}`); continue; }
    if (!Array.isArray(arr)) { errs.push(`${f}: 配列ではありません`); continue; }
    arr.forEach((r, i) => rowErrors(r, kind).forEach(e => errs.push(`${f} #${i} ${JSON.stringify(r && r[0])} ${e}`)));
  }
  assert.deepEqual(errs.slice(0, 40), []);
});

test('元のデータ（src/data_*.js）の行も、同じ形式', () => {
  const g = base(), errs = [];
  for (const kind of ['kobun', 'eigo']) g[kind].forEach((r, i) => rowErrors(r, kind).forEach(e => errs.push(`data_${kind}.js #${i} ${JSON.stringify(r && r[0])} ${e}`)));
  assert.deepEqual(errs.slice(0, 40), []);
});

test('見出し語は、元のデータと全チャンクを通して重複しない（英語は大文字小文字を区別しない、古文は漢字表記も含めて比べる）', () => {
  const g = base(), seen = new Map(), dup = [];
  const key = (r, kind) => kind === 'eigo' ? String(r[0]).trim().toLowerCase() : String(r[0]).trim() + '|' + (r[1] || '');
  const add = (rows, kind, where) => rows.forEach((r, i) => {
    const k = kind + ':' + key(r, kind);
    if (seen.has(k)) dup.push(`${where} #${i} ${k}（${seen.get(k)} と重複）`); else seen.set(k, `${where} #${i}`);
  });
  add(g.kobun, 'kobun', 'data_kobun.js');
  add(g.eigo, 'eigo', 'data_eigo.js');
  for (const f of chunkFiles()) add(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/chunks', f), 'utf8')), f.startsWith('kobun') ? 'kobun' : 'eigo', f);
  assert.deepEqual(dup, []);
});

test('README の「収録内容」の語数が、ビルドしたデータの件数と一致する', t => {
  const r = H.build();
  assert.equal(r.status, 0, r.out);
  const counts = countsFromHtml(fs.readFileSync(r.html, 'utf8'));
  // ビルドの出力にも同じ件数が出る
  assert.ok(r.out.includes('収録: ' + Object.entries(counts).map(([k, v]) => k + ' ' + v).join('／')), r.out);
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const rows = {};
  for (const m of readme.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|/gm)) rows[m[1]] = m[2];
  const num = s => +String(s).replace(/,/g, '');
  const want = {
    古文単語: counts['古文単語'], 古文330: counts['古文330'], 古文常識: counts['古文常識'], 文学史: counts['文学史'],
    和歌: counts['和歌'], 文法: counts['文法'], 読み: counts['読み'], 英単語: counts['英単語'],
  };
  for (const [name, n] of Object.entries(want)) {
    assert.ok(rows[name], `README の表に「${name}」の行がありません`);
    assert.equal(num(rows[name].match(/^[\d,]+/)[0]), n, `README の「${name}」の語数`);
  }
  assert.match(rows['古文330'], new RegExp('関連語' + counts['古文330の関連語']));
  // 内訳（文学史の作品数、和歌・文法の種類ごとの数）
  const d = rawData(fs.readFileSync(r.html, 'utf8'));
  const by = key => { const c = {}; d.EXTRA_SUBJ.find(e => e.key === key).items.forEach(i => { c[i.pos] = (c[i.pos] || 0) + 1; }); return c; };
  const bun = by('bungaku'), waka = by('waka'), bunpo = by('bunpo');
  assert.match(readme, new RegExp(`${bun['作品']}作品`), '文学史の作品数');
  assert.match(readme, new RegExp(`枕詞${waka['枕詞']}・掛詞${waka['掛詞']}・縁語${waka['縁語']}・歌枕${waka['歌枕']}`), '和歌の内訳');
  assert.match(readme, new RegExp(`助動詞${bunpo['助動詞']}`), '文法の助動詞の数');
  t.after(() => H.cleanup());
});
