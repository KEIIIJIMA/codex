// 古文330の番号を本の索引どおりに直したときの、学習記録の付け替え（移行 v2）のテスト。
// 番号で決まるID（b:番号、br:番号:順）は、IDの検査では中身の入れ替わりを見つけられないので、
// 「直す前の版で各IDが指していた語」と「移行後のIDが指す語」が同じ語であることを全件確かめる。
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { build, open, stored, cleanup, repoMigrations, chain } = require('./helpers.js');
const { checkIds } = require('../tools/check_ids.js');

after(cleanup);

// 直す前の版（移行の版1）の 項目ID→語
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/book_v1.json'), 'utf8'));
// 索引に合わせて語形そのものを直した語（旧→新）。漢字の添え書きや〔 〕の違いは bare() で吸収するので、ここには書かない
const RENAMED = {
  'あへず': '〜あへず', 'いかがはせむ・いかがせむ': 'いかがせむ・いかがはせむ', 'およすく': 'およすぐ', 'ぎやうがう・ごかう・ぎやうけい': 'ぎやうがう・ぎやうけい・ごかう',
  'あなかしこ': 'あなかしこ〜禁止', 'あるじまうけ': 'あるじまうけす', 'まらうど': 'まらうと', 'まらうどざね': 'まらうとざね', 'あれかにもあらず': 'あれにもあらず',
  'いたつく': 'いたづく', 'いまする': 'います', 'いろをかふ': 'いろをうしなふ', 'かたちをかふ・やつす': 'かたちをかふ', 'かしらおろす': 'かしらおろす・かざりおろす',
  'さまをかふ・やつす': 'さまをかふ', 'よをそむく・すつ・のがる・はなる': 'よをそむく', 'かち(徒歩)': 'かちぢ', 'かなしむ・かなしぶ・かなしうす': 'かなしむ',
  'こころとして': 'こころと', 'さてもあるべきならねば': 'さてしもあるべきことならねば', 'つれなくつくる': 'つれなしづくる', 'そでをしぼる': 'そでをぬらす',
  'なみだにしづむ・くる・くもる': 'なみだにしずむ', 'よりけに': '〜よりけに', 'わななき': 'わななきごゑ',
};
// 索引に無く、項目そのものが無くなった語（記録も消える）
const GONE = ['さる(然る)'];
const bare = s => String(s).replace(/\s+/g, '').replace(/[（〔\[(][^）〕\])]*[）〕\])]/g, '').replace(/[～〜]/g, '〜');

function bookWords(html) {
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1], g = {};
  new Function('g', src.replace(/const (\w+)\s*=/g, 'g.$1=').replace(/\b(KOBUN_RAW|EIGO_RAW)\.push/g, 'g.$1.push'))(g);
  const words = {};
  for (const r of g.BOOK_RAW) { words['b:' + r[0]] = r[1]; (r[10] || []).forEach((x, i) => { words['br:' + r[0] + ':' + i] = x[0]; }); }
  return words;
}

test('古文330: 番号を直す前の記録は、移行後も同じ語に付く（全件）', () => {
  const b = build();
  assert.strictEqual(b.status, 0, b.out);
  const now = bookWords(fs.readFileSync(b.html, 'utf8')), migs = repoMigrations(), bad = [];
  for (const [id, w] of Object.entries(fx.words)) {
    const to = chain(migs, id, fx.v);
    if (GONE.includes(w)) { if (to !== null) bad.push(`${id}「${w}」は無くなった語なのに ${to} へ移る`); continue; }
    const want = RENAMED[w] || w;
    if (to === null) bad.push(`${id}「${w}」の記録が消える`);
    else if (!(to in now)) bad.push(`${id}「${w}」→ ${to} は存在しない`);
    else if (bare(now[to]) !== bare(want)) bad.push(`${id}「${w}」→ ${to}「${now[to]}」（別の語）`);
  }
  assert.deepStrictEqual(bad, []);
});

test('古文330: 見出し語は 1〜330 がそろい、番号の重複がない', () => {
  const b = build(), now = bookWords(fs.readFileSync(b.html, 'utf8'));
  const nums = Object.keys(now).filter(k => /^b:\d+$/.test(k)).map(k => +k.slice(2)).sort((a, c) => a - c);
  assert.deepStrictEqual(nums, Array.from({ length: 330 }, (_, i) => i + 1));
});

test('移行: 値が null の対応は、その項目の記録を消す（ほかの付け替えは通常どおり）', async () => {
  const b = build({ migrations: [{ v: 1, map: { 'x:a': null, 'x:b': 'x:c' } }] });
  const browser = await chromium.launch();
  try {
    const rec = { s: 2, c: 2, x: 0, t: 1 };
    const page = await open(browser, b.html, JSON.stringify({ prog: { 'x:a': rec, 'x:b': rec, 'x:d': rec }, days: {}, prefs: {} }));
    const s = await stored(page);
    assert.deepStrictEqual(Object.keys(s.prog).sort(), ['x:c', 'x:d']);
    assert.strictEqual(s.v, 1);
    assert.deepStrictEqual(page.errors, []);
  } finally { await browser.close(); }
});

test('IDの検査: null（削除）の対応があるIDは「消えた」と数えない。対応の無いIDが消えれば失敗する', () => {
  const migrations = [{ v: 1, map: { a: null, b: 'c' } }];
  assert.strictEqual(checkIds({ baseline: { v: 0, ids: ['a', 'b'] }, ids: ['c'], migrations }).ok, true);
  const r = checkIds({ baseline: { v: 0, ids: ['a', 'b', 'z'] }, ids: ['c'], migrations });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.missing.map(m => m.id), ['z']);
});
