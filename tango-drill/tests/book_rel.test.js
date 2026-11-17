// 古文330の関連語の学習記録が、ホームの集計・成績の苦手ワード・苦手だけの復習・記録のリセットに入ることのテスト。
// 実行: node tests/book_rel.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

let browser, b, LATEST;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async page => { assert.deepEqual(page.errors, [], 'ページ内でエラーが出た'); await page.context().close(); };

const open = (prog, book) => H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs: { subj: 'book', book: Object.assign({ range: 'all', count: '10', order: 'index', rel: 'only', from: '', to: '' }, book) } }));
const tile = async (page, cls) => (await page.textContent('.tiles .tile' + cls)).replace(/\s+/g, '');
const relIds = s => Object.keys(s.prog).filter(id => id.startsWith('br:'));
const relTotal = page => page.evaluate(() => window.__tangoTest.BOOKREL.length); // 関連語の総数

test('関連語だけを出題して「まだ」と答えると、ホームの苦手の数と成績の苦手ワードに出て、記録を消すと消える', async () => {
  const page = await open({ 'b:1': { c: 0, x: 2, s: 0, t: 1 }, 'e:abandon': { c: 0, x: 1, s: 0, t: 1 } });
  const REL = await relTotal(page);
  assert.ok(REL >= 300, '関連語が ' + REL + ' 語しかない');
  assert.match(await tile(page, '.weak'), /^苦手1語関連語0$/);
  await page.click('[data-start="flash"]');
  for (let i = 0; i < 10; i++) await page.click('[data-ans="0"]');
  assert.match(await page.textContent('#view'), /0 \/ 10 問/);
  assert.equal((await page.$$('.wlist li')).length, 10);
  await H.quit(page);
  let s = await H.stored(page);
  assert.equal(relIds(s).length, 10);

  // ホーム: 見出し語と関連語を分けて数える
  assert.match(await tile(page, '.weak'), /^苦手1語関連語10$/);
  assert.equal(await tile(page, ':first-child'), `収録語数330語関連語${REL}`);
  assert.equal(await tile(page, ':last-child'), `未学習329語関連語${REL - 10}`);

  // 成績: 科目の集計と、苦手ワードの一覧（間違いの多い順。見出し語1＋関連語10）
  const counts = await H.statCounts(page);
  assert.deepEqual(counts['古文330'], { '習得': 0, '学習中': 0, '苦手': 1, '未学習': 329 }); // 見出し語の数は変えない
  const panel = page.locator('.panel', { hasText: '古文330の苦手ワード' });
  assert.match(await panel.locator('h2').textContent(), /見出し語 1語・関連語 10語/);
  const rows = await panel.locator('.wlist li').allTextContents();
  assert.equal(rows.length, 11);
  assert.match(rows[0], /^おどろく/);
  assert.equal(rows.filter(r => /関連語/.test(r)).length, 10);
  assert.ok((await page.locator('.sgrid .panel', { hasText: '古文330' }).textContent()).includes(`関連語 ${REL}語：習得 0・学習中 0・苦手 10・未学習 ${REL - 10}`));

  // 苦手だけの復習: 関連語も出題される
  await page.click('[data-start-weak]');
  assert.equal((await page.textContent('.prog .num')).trim(), '1 / 11');
  await H.quit(page);

  // 記録のリセット: 関連語の記録も消える（ほかの科目の記録は残る）
  await page.click('.tabs [data-tab="stats"]');
  await page.click('[data-reset="ask"]');
  assert.match(await page.textContent('.confirm'), /古文330の学習記録（関連語を含む）をすべて消します/);
  await page.click('[data-reset="yes"]');
  s = await H.stored(page);
  assert.deepEqual(Object.keys(s.prog), ['e:abandon']);
  await page.click('.tabs [data-tab="home"]');
  assert.match(await tile(page, '.weak'), /^苦手0語関連語0$/);
  // 「関連語だけ・苦手のみ」で始めても、もう出題されない
  await page.selectOption('#o-range', 'weak');
  await page.click('[data-start="quiz"]');
  assert.match(await page.textContent('#view'), /この条件に当てはまる語がありません/);
  await done(page);
});

test('関連語の習得も、ホームと成績で関連語として数える（見出し語の習得率には混ぜない）', async () => {
  const ok = { c: 2, x: 0, s: 2, t: 1 };
  const page = await open({ 'br:1:0': ok, 'br:2:0': ok, 'b:2': ok });
  const REL = await relTotal(page);
  assert.match(await tile(page, '.ok'), /^習得1語関連語2$/);
  assert.match(await page.textContent('.today'), /古文330の習得率 0%/); // 1/330 語
  const counts = await H.statCounts(page);
  assert.deepEqual(counts['古文330'], { '習得': 1, '学習中': 0, '苦手': 0, '未学習': 329 });
  assert.ok((await page.locator('.sgrid .panel', { hasText: '古文330' }).textContent()).includes(`関連語 ${REL}語：習得 2・学習中 0・苦手 0・未学習 ${REL - 2}`));
  await done(page);
});

test('ほかの科目のホームには、関連語の数を出さない', async () => {
  const page = await open({});
  await page.click('.subtabs [data-subj="kobun"]');
  assert.match(await tile(page, '.weak'), /^苦手0語$/);
  await done(page);
});
