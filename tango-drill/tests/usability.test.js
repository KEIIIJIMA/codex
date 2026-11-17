// 出題順・並び・絞り込み・キー操作の不具合のテスト。実行: node tests/usability.test.js
//   おまかせ（苦手・未学習を優先）の確保、英語のレベル別タブの並び、成績の苦手ワードの並び、
//   単語帳の検索語と状態の絞り込みの初期化、Ctrl・Alt・Meta を押しながらのキー操作
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

let browser, b, LATEST, KOBUN;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
  const page = await H.open(browser, b.html, null);
  KOBUN = await page.evaluate(() => window.__tangoTest.DATA.kobun.map(it => ({ id: it.id, w: it.w, k: it.k || '' }))); // 収録順
  await page.context().close();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async page => { assert.deepEqual(page.errors, [], 'ページ内でエラーが出た'); await page.context().close(); };
const openWith = (prog, prefs, days = {}) => H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days, prefs }));
// 修飾キーつきのキー操作（ブラウザのショートカットに取られないよう、ページの中で直接起こす）
const key = (page, init) => page.evaluate(i => { document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, i))); }, init);

/* ---- おまかせ（苦手・未学習を優先） ---- */
// 古文単語: 苦手5語・未学習5語・ほかはすべて習得、という状態を作る
const WEAK_AT = [3, 50, 120, 200, 300], NEW_AT = [7, 60, 130, 210, 310];
function autoFixture() {
  const prog = {};
  KOBUN.forEach((it, i) => {
    if (NEW_AT.includes(i)) return;
    prog[it.id] = WEAK_AT.includes(i) ? { c: 0, x: 2, s: 0, t: 5 } : { c: 2, x: 0, s: 2, t: 1000 + i };
  });
  return prog;
}
// フラッシュカードで最後まで進み、出題された語のID（出た順）を返す
async function sessionIds(page, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    assert.equal((await page.textContent('.prog .num')).trim(), `${i + 1} / ${n}`);
    const w = (await page.textContent('.card .word')).trim(), kEl = await page.$('.card .kanji'), k = kEl ? (await kEl.textContent()).trim() : '';
    ids.push('k:' + w + (k ? '|' + k : ''));
    await page.click('[data-ans="1"]');
  }
  return ids;
}
const autoRun = async order => {
  const page = await openWith(autoFixture(), { subj: 'kobun', kobun: { range: 'auto', count: '20', order } });
  await page.click('[data-start="flash"]');
  const ids = await sessionIds(page, 20);
  await done(page);
  return ids;
};

test('おまかせは、出題順がランダムでも、苦手と未学習を先に確保する', async () => {
  const weak = WEAK_AT.map(i => KOBUN[i].id), fresh = NEW_AT.map(i => KOBUN[i].id), all = KOBUN.map(it => it.id);
  let weakFirst = 0;
  for (let t = 0; t < 3; t++) {
    const ids = await autoRun('random');
    assert.equal(new Set(ids).size, 20);
    for (const id of ids) assert.ok(all.includes(id), '知らないID: ' + id);
    assert.deepEqual(weak.filter(id => !ids.includes(id)), [], '苦手の語が出題に入っていない');
    assert.deepEqual(fresh.filter(id => !ids.includes(id)), [], '未学習の語が出題に入っていない');
    if (ids.slice(0, 5).every(id => weak.includes(id))) weakFirst++;
  }
  assert.ok(weakFirst < 3, '出題順がランダムなのに、毎回 苦手の5語が先頭に並んだ'); // 確保した後で並べ替えていること
});

test('おまかせ＋収録順: 苦手と未学習を確保し、残りは収録順の先頭から。出題は収録順に並ぶ', async () => {
  const ids = await autoRun('index');
  const at = ids.map(id => KOBUN.findIndex(it => it.id === id));
  assert.ok(at.every(i => i >= 0));
  assert.deepEqual(at, at.slice().sort((x, y) => x - y), '収録順に並んでいない');
  const special = WEAK_AT.concat(NEW_AT);
  for (const i of special) assert.ok(at.includes(i), '苦手・未学習の語が入っていない: ' + KOBUN[i].w);
  const rest = at.filter(i => !special.includes(i));
  const firstOk = KOBUN.map((_, i) => i).filter(i => !special.includes(i)).slice(0, 10);
  assert.deepEqual(rest, firstOk, '残りの10語が、習得の語の収録順の先頭になっていない');
});

test('おまかせ＋既定の出題順は、これまでどおり 苦手→未学習→習得 の順', async () => {
  const ids = await autoRun('smart');
  const weak = WEAK_AT.map(i => KOBUN[i].id), fresh = NEW_AT.map(i => KOBUN[i].id);
  assert.deepEqual(ids.slice(0, 5).slice().sort(), weak.slice().sort());
  assert.deepEqual(ids.slice(5, 10).slice().sort(), fresh.slice().sort());
});

test('出題範囲「すべて」＋ランダムは、これまでどおり全体からの抽選（苦手を先に確保しない）', async () => {
  // 苦手5語／336語から20問を引くと、5語すべてが入る確率はごくわずか
  const page = await openWith(autoFixture(), { subj: 'kobun', kobun: { range: 'all', count: '20', order: 'random' } });
  await page.click('[data-start="flash"]');
  const ids = await sessionIds(page, 20), weak = WEAK_AT.map(i => KOBUN[i].id);
  assert.ok(weak.filter(id => ids.includes(id)).length < 5);
  await done(page);
});

/* ---- 英語のレベル別タブの並び ---- */
test('英語のレベル別タブ（基礎・標準・発展・最難関）は、全レベルタブと同じ ABC 順', async () => {
  const page = await openWith({}, { subj: 'eigo4', eigo4: { range: 'all', count: '10', order: 'index' } });
  const lists = await page.evaluate(() => { const D = window.__tangoTest.DATA; return [1, 2, 3, 4].map(l => ({ tab: D['eigo' + l].map(it => it.w), all: D.eigo.filter(it => it.lv === l).map(it => it.w) })); });
  for (const [i, l] of lists.entries()) {
    assert.ok(l.tab.length > 50, `レベル${i + 1} が ${l.tab.length} 語しかない`);
    assert.deepEqual(l.tab, l.all, `レベル${i + 1} のタブの並びが、全レベルタブと違う`);
    const inv = l.tab.filter((w, j) => j > 0 && l.tab[j - 1].localeCompare(w, 'en') > 0);
    assert.deepEqual(inv, [], `レベル${i + 1} のタブで順序が逆転している語がある`);
  }
  // 画面でも: 「最難関」タブの単語帳の並び ＝ 全レベルタブで「最難関」を選んだ並び
  const words = () => page.$$eval('.vlist .vw', els => els.map(e => e.childNodes[0].textContent.trim()));
  await page.click('.tabs [data-tab="list"]');
  const tab = await words();
  await page.click('.subtabs [data-subj="eigo"]');
  await page.click('.tabs [data-tab="list"]');
  await page.click('.fchip[data-f="lv"][data-v="4"]');
  const all = await words();
  assert.ok(tab.length >= 100);
  assert.deepEqual(tab, all);
  assert.deepEqual(tab.slice(0, 3), lists[3].all.slice(0, 3));
  // 収録順の出題も ABC 順
  await page.click('.subtabs [data-subj="eigo4"]');
  await page.click('.tabs [data-tab="home"]');
  await page.click('[data-start="flash"]');
  const asked = [];
  for (let i = 0; i < 10; i++) { asked.push((await page.textContent('.card .word')).trim()); await page.click('[data-ans="1"]'); }
  assert.deepEqual(asked, lists[3].all.slice(0, 10));
  await done(page);
});

/* ---- 成績の苦手ワードの並び ---- */
test('成績の苦手ワードは、誤答数の多い順（同数なら正答の少ない順）に並ぶ', async () => {
  const [a, c, d, e] = [KOBUN[10], KOBUN[20], KOBUN[30], KOBUN[40]];
  const prog = { [a.id]: { c: 5, x: 5, s: 0, t: 1 }, [c.id]: { c: 3, x: 4, s: 1, t: 2 }, [d.id]: { c: 0, x: 1, s: 0, t: 3 }, [e.id]: { c: 1, x: 4, s: 0, t: 4 } };
  const page = await openWith(prog, { subj: 'kobun' });
  await page.click('.tabs [data-tab="stats"]');
  const rows = await page.locator('.panel', { hasText: '古文単語の苦手ワード' }).locator('.wlist li').evaluateAll(els => els.map(li => [li.querySelector('.w').textContent.trim(), li.querySelector('.num').textContent.replace(/\s+/g, '')]));
  assert.deepEqual(rows, [[a.w, '✕5◯5'], [e.w, '✕4◯1'], [c.w, '✕4◯3'], [d.w, '✕1◯0']]);
  await done(page);
});

/* ---- 単語帳の検索語と状態の絞り込み ---- */
test('単語帳の検索語と状態の絞り込みは、科目を切り替えたら消える', async () => {
  const page = await openWith({ 'k:あはれなり': { c: 0, x: 1, s: 0, t: 1 } }, { subj: 'kobun' });
  await page.click('.tabs [data-tab="list"]');
  await page.fill('#q', 'あはれ');
  await page.click('.fchip[data-f="st"][data-v="weak"]');
  assert.equal(await page.inputValue('#q'), 'あはれ');
  assert.equal(await page.getAttribute('.fchip[data-f="st"][data-v="weak"]', 'aria-pressed'), 'true');
  const state = async () => ({ q: await page.inputValue('#q'), all: await page.getAttribute('.fchip[data-f="st"][data-v="all"]', 'aria-pressed'), weak: await page.getAttribute('.fchip[data-f="st"][data-v="weak"]', 'aria-pressed'), count: (await page.textContent('.count')).trim() });
  // 古文 → 英語
  await page.click('.switch [data-group="eigo"]');
  let s = await state();
  assert.deepEqual([s.q, s.all, s.weak], ['', 'true', 'false']);
  assert.match(s.count, /^全 2138 語中 200 語を表示$/);
  assert.equal(await page.locator('.empty').count(), 0);
  // 同じ古文の中での切り替え（古文単語 → 古文330）でも消える
  await page.click('.switch [data-group="kobun"]');
  await page.click('.subtabs [data-subj="kobun"]');
  await page.fill('#q', 'あはれ');
  await page.click('.fchip[data-f="st"][data-v="weak"]');
  await page.click('.subtabs [data-subj="book"]');
  s = await state();
  assert.deepEqual([s.q, s.all, s.weak], ['', 'true', 'false']);
  assert.match(s.count, /^全 330 語中 200 語を表示$/);
  await done(page);
});

test('単語帳の検索語は、同じ科目の中でタブ（学習・成績）を行き来しても残る', async () => {
  const page = await openWith({}, { subj: 'kobun' });
  await page.click('.tabs [data-tab="list"]');
  await page.fill('#q', 'あはれ');
  await page.click('.tabs [data-tab="stats"]');
  await page.click('.tabs [data-tab="list"]');
  assert.equal(await page.inputValue('#q'), 'あはれ');
  await done(page);
});

/* ---- キー操作 ---- */
test('4択: Ctrl・Alt・Meta を押しながらの数字キーでは回答しない。押さなければ回答する', async () => {
  const page = await openWith({}, { subj: 'kobun' });
  await page.click('[data-start="quiz"]');
  for (const mod of ['ctrlKey', 'altKey', 'metaKey']) {
    await key(page, { key: '2', [mod]: true });
    assert.equal(await page.locator('.verdict').count(), 0, mod + ' を押しながらの 2 で回答が確定した');
  }
  await page.keyboard.press('Control+2'); // 実際のキー入力でも（ブラウザのタブ切り替えの操作）
  assert.equal(await page.locator('.verdict').count(), 0);
  assert.deepEqual((await H.stored(page)).prog, {}, '回答が記録された');
  await page.keyboard.press('2');
  assert.equal(await page.locator('.verdict').count(), 1);
  assert.equal(Object.keys((await H.stored(page)).prog).length, 1);
  // 回答後: 修飾キーつきの Enter では次へ進まない。Enter だけなら進む
  await key(page, { key: 'Enter', ctrlKey: true });
  assert.equal((await page.textContent('.prog .num')).trim().split(' ')[0], '1');
  await page.keyboard.press('Enter');
  assert.equal((await page.textContent('.prog .num')).trim().split(' ')[0], '2');
  await done(page);
});

test('フラッシュカード: Alt+←（ブラウザの「戻る」）や Ctrl+1 では「まだ」「覚えた」を記録しない', async () => {
  const page = await openWith({}, { subj: 'kobun' });
  await page.click('[data-start="flash"]');
  const at = async () => (await page.textContent('.prog .num')).trim().split(' ')[0];
  for (const init of [{ key: 'ArrowLeft', altKey: true }, { key: 'ArrowRight', altKey: true }, { key: 'ArrowLeft', metaKey: true }, { key: '1', ctrlKey: true }, { key: '2', metaKey: true }, { key: ' ', ctrlKey: true }]) {
    await key(page, init);
    assert.equal(await at(), '1', JSON.stringify(init) + ' で次のカードへ進んだ');
    assert.equal(await page.locator('.card.back').count(), 0, JSON.stringify(init) + ' で裏返った');
  }
  assert.deepEqual((await H.stored(page)).prog, {}, '回答が記録された');
  await page.keyboard.press('ArrowLeft'); // 修飾キーなしなら「まだ」
  assert.equal(await at(), '2');
  const s = await H.stored(page);
  assert.deepEqual(Object.values(s.prog).map(r => [r.c, r.x]), [[0, 1]]);
  await done(page);
});

test('入力欄にいるときのキー操作は回答に使わない（読みを入力・空所補充の記述）', async () => {
  for (const [subj, mode] of [['yomi', 'typeY'], ['kobun', 'clozeT']]) {
    const page = await openWith({}, { subj });
    await page.click(`[data-start="${mode}"]`);
    await page.focus('#ans');
    await page.keyboard.type('12 34');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.inputValue('#ans'), '12 34');
    assert.equal(await page.locator('.verdict').count(), 0);
    assert.deepEqual((await H.stored(page)).prog, {}, '回答が記録された');
    assert.equal((await page.textContent('.prog .num')).trim().split(' ')[0], '1');
    await done(page);
  }
});
