// 保存まわりのテスト。実行: node tests/storage.test.js
//   バックアップの取り込みの検査、2つのタブで同時に開いたときの記録の統合、保存に失敗したときの知らせ
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

let browser, b, swap, LATEST, X;
test.before(async () => {
  const MIGS = H.repoMigrations();
  LATEST = MIGS.reduce((n, m) => Math.max(n, m.v), 0);
  X = LATEST + 1;
  b = H.build();
  assert.equal(b.status, 0, b.out);
  // 試験用の移行（版 X: swap-a と swap-b の入れ替え）を足した完成版
  swap = H.build({ migrations: [...MIGS, { v: X, map: { 'e:swap-a': 'e:swap-b', 'e:swap-b': 'e:swap-a' } }] });
  assert.equal(swap.status, 0, swap.out);
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async (...pages) => { for (const p of pages) assert.deepEqual(p.errors, [], 'ページ内でエラーが出た'); await pages[0].context().close(); };
const FLASH = { range: 'all', count: '10', order: 'index' };
const PREFS = { subj: 'kobun', kobun: FLASH, eigo: FLASH };
const openWith = (prog, prefs = PREFS, days = {}, html = b.html) => H.open(browser, html, JSON.stringify({ v: LATEST, prog, days, prefs }));
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sum = days => Object.values(days).reduce((a, n) => a + n, 0);
const OTHER = { c: 1, x: 4, s: 0, t: 5 };

// バックアップの欄に貼り付けて「復元」を押し、出たメッセージを返す
async function imp(page, j) {
  await page.click('.tabs [data-tab="stats"]');
  await page.fill('#imp', typeof j === 'string' ? j : JSON.stringify(j));
  await page.click('[data-import]');
  return (await page.textContent('#msg')).trim();
}
// フラッシュカードで n 問答える（始まっていなければ始める）。答えた語のIDを返す
async function answer(page, n, ok = true) {
  if (!(await page.$('[data-ans]'))) { if (!(await page.$('[data-start="flash"]'))) await page.click('.tabs [data-tab="home"]'); await page.click('[data-start="flash"]'); }
  const pre = (await page.getAttribute('html', 'data-subj')) === 'eigo' ? 'e:' : 'k:', ids = [];
  for (let i = 0; i < n; i++) {
    const w = (await page.textContent('.card .word')).trim(), kEl = await page.$('.card .kanji'), k = kEl ? (await kEl.textContent()).trim() : '';
    ids.push(pre + w + (k ? '|' + k : ''));
    await page.click(`[data-ans="${ok ? 1 : 0}"]`);
  }
  return ids;
}
// 同じ保存データで2ページ開く（2つのタブで同時に開いた状態）。
// mute(page) を呼ぶと、そのページには ほかのタブの保存の知らせ（storage イベント）が届かなくなる（バックグラウンドで止まっていたタブの再現）。
// 知らせを止める仕掛けは、アプリより先に登録しておく必要があるので、ページを開く前に入れる
async function pair(prog, prefs = PREFS, days = {}, html = b.html) {
  const A = await openWith(prog, prefs, days, html);
  await A.context().addInitScript(() => window.addEventListener('storage', e => { if (window.__mute) e.stopImmediatePropagation(); }, true));
  await A.reload();
  await A.waitForSelector('#view > *');
  return [A, await H.openMore(A, html)];
}
const mute = page => page.evaluate(() => { window.__mute = true; });
// そのページが覚えている累計の回答数（成績タブの表示。保存はしない操作）
async function totalShown(page) {
  await page.click('.tabs [data-tab="stats"]');
  return +(await page.locator('.panel', { hasText: '学習の記録' }).locator('h2 .sub').textContent()).match(/累計 (\d+) 問/)[1];
}
// 古い版のタブが、自分の覚えている内容で保存データを丸ごと上書きした状態を作る（別のページから書き込む）
async function clobber(page, obj) {
  const p = await page.context().newPage();
  await p.goto('file://' + require('path').join(require('path').dirname(b.html), 'seed.html'));
  await p.evaluate(([k, v]) => localStorage.setItem(k, v), [H.KEY, JSON.stringify(obj)]);
  await p.close();
}

/* ---- バックアップの取り込み ---- */
test('取り込み: 形のおかしい記録と日別の回答数は捨て、件数を知らせる（指摘の例）', async () => {
  const d = today();
  const page = await openWith({ 'e:abandon': OTHER }, PREFS, { [d]: 3 });
  const msg = await imp(page, { prog: { 'k:あいなし': 5 }, days: { [d]: 'x' } });
  assert.match(msg, /^0 語の記録を取り込みました。/);
  assert.match(msg, /形の正しくない 2 件/);
  const s = await H.stored(page);
  assert.deepEqual(s.prog, { 'e:abandon': OTHER });
  assert.deepEqual(s.days, { [d]: 3 });
  await page.click('.tabs [data-tab="home"]');
  assert.match((await page.textContent('.today')).replace(/\s+/g, ' '), /今日の回答 3 問/);
  await done(page);
});

test('取り込み: 正しい形の記録だけを取り込み、余分な欄は落とす', async () => {
  const page = await openWith({});
  const good1 = { c: 1, x: 0, s: 1, t: 10 }, good2 = { c: 0, x: 3, s: 0, t: 20 };
  const msg = await imp(page, {
    prog: {
      'k:あいなし': good1, 'e:abandon': good2, 'e:extra': { c: 2, x: 1, s: 0, t: 30, foo: 'bar', m: [1] },
      'e:bad1': 5, 'e:bad2': null, 'e:bad3': 'abc', 'e:bad4': [1, 2, 3, 4], 'e:bad5': { c: 1, x: 0, s: 1 }, 'e:bad6': { c: '1', x: 0, s: 1, t: 5 },
      'e:bad7': { c: -1, x: 0, s: 0, t: 5 }, 'e:bad8': { c: 1, x: null, s: 0, t: 5 }, 'e:bad9': {}, 'e:bad10': true,
    },
    days: { '2026-10-01': 4, '2026-10-02': 'x', '2026-10-03': null, '2026-10-04': -2, 'yesterday': 3, '2026-10-05': [1] },
  });
  assert.match(msg, /^3 語の記録を取り込みました。/);
  assert.match(msg, /形の正しくない 15 件/); // 記録10件＋日別5件
  const s = await H.stored(page);
  assert.deepEqual(s.prog, { 'k:あいなし': good1, 'e:abandon': good2, 'e:extra': { c: 2, x: 1, s: 0, t: 30 } });
  assert.deepEqual(s.days, { '2026-10-01': 4 });
  assert.equal(s.v, LATEST);
  // 成績タブの集計も壊れない
  assert.equal(await totalShown(page), 4);
  await done(page);
});

test('取り込み: 数値でない大きすぎる値、days が表でないときも捨てる。問題が無ければ件数だけ知らせる', async () => {
  const page = await openWith({});
  let msg = await imp(page, '{"prog":{"e:inf":{"c":1e999,"x":0,"s":0,"t":1},"e:abandon":{"c":1,"x":0,"s":1,"t":1}},"days":"abc"}');
  assert.match(msg, /^1 語の記録を取り込みました。/);
  assert.match(msg, /形の正しくない 2 件/);
  msg = await imp(page, { prog: { 'e:ability': { c: 1, x: 0, s: 1, t: 1 } } }); // days が無くてもよい
  assert.equal(msg, '1 語の記録を取り込みました。');
  assert.deepEqual(Object.keys((await H.stored(page)).prog).sort(), ['e:abandon', 'e:ability']);
  await done(page);
});

test('取り込み: 記録の表が無い・形が違うものは読み取れないと知らせ、何も変えない', async () => {
  const page = await openWith({ 'e:abandon': OTHER }, PREFS, { '2026-10-01': 2 });
  const before = await H.raw(page);
  for (const txt of ['abc', '5', 'null', '[1,2]', '{}', '{"prog":[{"c":1,"x":0,"s":0,"t":1}]}', '{"prog":"x"}', '{"prog":null}', '{"days":{"2026-10-01":9}}']) {
    assert.match(await imp(page, txt), /^読み取れませんでした/, txt);
    assert.equal(await H.raw(page), before, txt);
  }
  await done(page);
});

test('取り込み: 同じ語は回答数の多いほう（同数なら新しいほう）を残し、日別の回答数は多いほうを残す', async () => {
  const mine = { 'e:a1': { c: 5, x: 1, s: 0, t: 100 }, 'e:a2': { c: 1, x: 0, s: 1, t: 300 }, 'e:a3': { c: 1, x: 1, s: 0, t: 10 }, 'e:a4': { c: 1, x: 1, s: 0, t: 40 } };
  const theirs = { 'e:a1': { c: 1, x: 0, s: 1, t: 200 }, 'e:a2': { c: 2, x: 2, s: 0, t: 50 }, 'e:a3': { c: 2, x: 0, s: 2, t: 20 }, 'e:a4': { c: 2, x: 0, s: 2, t: 30 }, 'e:a5': { c: 0, x: 1, s: 0, t: 1 } };
  const page = await openWith(mine, PREFS, { '2026-10-01': 10, '2026-10-03': 1 });
  const msg = await imp(page, { v: LATEST, prog: theirs, days: { '2026-10-01': 3, '2026-10-02': 7 } });
  assert.equal(msg, '3 語の記録を取り込みました。');
  const s = await H.stored(page);
  assert.deepEqual(s.prog, { 'e:a1': mine['e:a1'], 'e:a2': theirs['e:a2'], 'e:a3': theirs['e:a3'], 'e:a4': mine['e:a4'], 'e:a5': theirs['e:a5'] });
  assert.deepEqual(s.days, { '2026-10-01': 10, '2026-10-02': 7, '2026-10-03': 1 });
  await done(page);
});

/* ---- 2つのタブで同時に開く ---- */
test('2つのページを開いて交互に回答しても、両方の回答が残る', async () => {
  const [A, B] = await pair({});
  await B.click('.switch [data-group="eigo"]');
  const ids = [];
  ids.push(...await answer(A, 3));       // A: 古文単語を3問
  ids.push(...await answer(B, 2));       // B: 英単語を2問（A の回答の前から開いていた）
  ids.push(...await answer(A, 2, false));
  ids.push(...await answer(B, 1, false));
  ids.push(...await answer(A, 1));
  assert.equal(new Set(ids).size, 9);
  const s = await H.stored(A);
  assert.deepEqual(Object.keys(s.prog).sort(), ids.slice().sort());
  assert.equal(ids.filter(id => id.startsWith('k:')).length, 6);
  assert.equal(sum(s.days), 9);
  assert.deepEqual(s.days, { [today()]: 9 });
  // 開き直しても、どちらのページにも全部ある
  for (const p of [A, B]) { await p.reload(); await p.waitForSelector('#view > *'); assert.equal(await totalShown(p), 9); }
  assert.equal(Object.keys((await H.stored(B)).prog).length, 9);
  await done(A, B);
});

test('ほかのタブの保存の知らせが届かなくても、保存の直前に最新の内容と合わせるので消えない', async () => {
  const [A, B] = await pair({});
  await B.click('.switch [data-group="eigo"]');
  await mute(A); await mute(B);
  const a1 = await answer(A, 3);
  assert.equal(await totalShown(B), 0); // B には届いていない（古いままの内容を覚えている）
  const b1 = await answer(B, 2);
  let s = await H.stored(B);
  assert.deepEqual(Object.keys(s.prog).sort(), a1.concat(b1).sort());
  assert.equal(sum(s.days), 5);
  const a2 = await answer(A, 2);
  s = await H.stored(A);
  assert.deepEqual(Object.keys(s.prog).sort(), a1.concat(b1, a2).sort());
  assert.equal(sum(s.days), 7);
  await done(A, B);
});

test('ほかのタブが保存すると、開いたままのページにも取り込まれる（storage イベント）', async () => {
  const [A, B] = await pair({});
  assert.equal(await totalShown(B), 0);
  await answer(A, 2);
  let n = 0;
  for (let i = 0; i < 40 && n !== 2; i++) { await B.waitForTimeout(50); n = await totalShown(B); } // B は何も保存していない
  assert.equal(n, 2);
  // 取り込んだ内容は、成績の集計にも入る
  assert.equal((await H.statCounts(B))['古文単語']['学習中'], 2);
  await done(A, B);
});

test('知らせが届いていなくても、出題を始めるときは最新の記録で選ぶ（もう片方で付いた苦手が、苦手のみの出題に出る）', async () => {
  const [A, B] = await pair({}, { subj: 'kobun', kobun: { range: 'weak', count: '10', order: 'index' } });
  await mute(B);
  await A.selectOption('#o-range', 'all');
  const a1 = await answer(A, 3, false); // A で3語を「まだ」＝苦手にする
  await B.click('[data-start="flash"]'); // B は、その3語を知らないまま「苦手のみ」で始める
  assert.equal((await B.textContent('.prog .num')).trim(), '1 / 3');
  assert.deepEqual(await answer(B, 3), a1);
  // 成績の「苦手ワードだけ4択で復習」も同じ
  const a2 = await answer(A, 2, false);
  await B.click('.tabs [data-tab="stats"]');
  await B.click('[data-start-weak]');
  assert.equal((await B.textContent('.prog .num')).trim(), '1 / ' + (a1.length + a2.length));
  await done(A, B);
});

test('同じ語を2つのページで答えたら、回答が積み重なる', async () => {
  const [A, B] = await pair({});
  await mute(B);
  const [x] = await answer(A, 1);  // A で1回正解
  const [y] = await answer(B, 1);  // 同じ語を B でも正解（B は A の回答を知らないまま）
  assert.equal(x, y);
  const s = await H.stored(A);
  assert.deepEqual([s.prog[x].c, s.prog[x].x, s.prog[x].s], [2, 0, 2]);
  assert.equal(sum(s.days), 2);
  await done(A, B);
});

test('片方で消した記録は、開いたままのもう片方が保存しても戻らない（科目のリセット・1語の記録を消す）', async () => {
  const K1 = { c: 3, x: 1, s: 0, t: 1000 }, K2 = { c: 2, x: 0, s: 2, t: 2000 };
  for (const muted of [true, false]) {
    const [A, B] = await pair({ 'k:あいなし': K1, 'k:あからさまなり': K2, 'k:あはれなり': K1, 'e:abandon': OTHER });
    if (muted) await mute(B);
    await B.click('.switch [data-group="eigo"]'); // B は英語で開く（保存もする）
    // A: 単語帳で1語の記録を消す
    await A.click('.tabs [data-tab="list"]');
    await A.fill('#q', 'あはれなり');
    await A.click('.vrow [data-open="k:あはれなり"]');
    await A.click('[data-set="new"]');
    assert.deepEqual(Object.keys((await H.stored(A)).prog).sort(), ['e:abandon', 'k:あいなし', 'k:あからさまなり']);
    const b1 = await answer(B, 1);
    assert.deepEqual(Object.keys((await H.stored(A)).prog).sort(), ['e:abandon', 'k:あいなし', 'k:あからさまなり', ...b1].sort(), '消した1語が戻った');
    // A: 古文単語の記録をリセット
    await A.click('.tabs [data-tab="stats"]');
    await A.click('[data-reset="ask"]');
    await A.click('[data-reset="yes"]');
    const b2 = await answer(B, 1);
    let s = await H.stored(A);
    assert.deepEqual(Object.keys(s.prog).sort(), ['e:abandon', ...b1, ...b2].sort(), 'リセットした記録が戻った');
    // 消したあとで同じ語に答えれば、新しい記録が付く（どちらのページでも）
    await B.click('.tabs [data-tab="home"]');
    await B.click('[data-leave="yes"]'); // 学習の途中なので確認が出る
    await B.click('.switch [data-group="kobun"]');
    const k1 = await answer(B, 1);
    assert.deepEqual(k1, ['k:あいなし']);
    s = await H.stored(B);
    assert.deepEqual([s.prog['k:あいなし'].c, s.prog['k:あいなし'].x], [1, 0]);
    await A.reload(); await A.waitForSelector('#view > *');
    assert.equal((await H.statCounts(A))['古文単語']['学習中'], 1);
    assert.deepEqual(Object.keys((await H.stored(A)).prog).sort(), ['e:abandon', 'k:あいなし', ...b1, ...b2].sort());
    await done(A, B);
  }
});

test('記録を消したあとでも、バックアップから戻せる（もう片方のページが保存しても残る）', async () => {
  const K1 = { c: 3, x: 1, s: 0, t: 1000 }, K2 = { c: 2, x: 0, s: 2, t: 2000 };
  const [A, B] = await pair({ 'k:あいなし': K1, 'k:あからさまなり': K2 });
  await mute(B);
  await B.click('.switch [data-group="eigo"]');
  await A.click('.tabs [data-tab="stats"]');
  await A.click('[data-export]');
  const backup = await A.inputValue('#imp');
  assert.deepEqual(Object.keys(JSON.parse(backup)).sort(), ['days', 'prog', 'v']); // 書き出しの形は変えない
  await A.click('[data-reset="ask"]');
  await A.click('[data-reset="yes"]');
  assert.deepEqual((await H.stored(A)).prog, {});
  assert.match(await imp(A, backup), /^2 語の記録を取り込みました。/);
  const b1 = await answer(B, 1);
  const s = await H.stored(A);
  assert.deepEqual(Object.keys(s.prog).sort(), ['k:あいなし', 'k:あからさまなり', ...b1].sort());
  for (const [id, r] of [['k:あいなし', K1], ['k:あからさまなり', K2]]) assert.deepEqual([s.prog[id].c, s.prog[id].x, s.prog[id].s], [r.c, r.x, r.s]);
  await A.reload(); await A.waitForSelector('#view > *');
  const c = (await H.statCounts(A))['古文単語'];
  assert.deepEqual([c['習得'], c['苦手']], [1, 1]);
  await done(A, B);
});

test('古い版のタブに保存データを丸ごと上書きされても、開いているページの記録は次の保存で戻る', async () => {
  const A = await openWith({});
  const a1 = await answer(A, 2);
  await clobber(A, { v: LATEST, prog: { 'e:abandon': OTHER }, days: {}, prefs: {} }); // A の2問が無い内容で上書き
  assert.deepEqual(Object.keys((await H.stored(A)).prog), ['e:abandon']);
  const a2 = await answer(A, 1);
  const s = await H.stored(A);
  assert.deepEqual(Object.keys(s.prog).sort(), ['e:abandon', ...a1, ...a2].sort());
  assert.equal(sum(s.days), 3);
  await done(A);
});

test('出題設定は合わせない: それぞれのページが、画面に出ている設定のまま出題する', async () => {
  const [A, B] = await pair({});
  await A.selectOption('#o-count', '50');
  assert.equal((await H.stored(A)).prefs.kobun.count, '50');
  await B.click('[data-start="flash"]'); // B の画面の問題数は 10 のまま
  assert.equal((await B.textContent('.prog .num')).trim(), '1 / 10');
  await answer(B, 1);
  assert.equal(Object.keys((await H.stored(A)).prog).length, 1);
  await A.click('[data-start="flash"]'); // A は 50 問
  assert.equal((await A.textContent('.prog .num')).trim(), '1 / 50');
  await done(A, B);
});

test('版の違う保存内容と合わせるときも、移行は1回だけ当たる（古い版の内容は移行してから合わせ、新しい版の内容は版を下げない）', async () => {
  const A1 = { c: 5, x: 0, s: 2, t: 11 };
  // 版 X のページが開いているところへ、版 LATEST の内容が書き込まれる（古い版のタブの上書き）
  let page = await H.open(browser, swap.html, JSON.stringify({ v: X, prog: {}, days: {}, prefs: PREFS }));
  await clobber(page, { v: LATEST, prog: { 'e:swap-a': A1 }, days: {}, prefs: {} });
  const k1 = await answer(page, 1);
  let s = await H.stored(page);
  assert.equal(s.v, X);
  assert.deepEqual(Object.keys(s.prog).sort(), ['e:swap-b', ...k1].sort()); // 入れ替えが1回当たって swap-b へ
  assert.deepEqual(s.prog['e:swap-b'], A1);
  const k2 = await answer(page, 1);
  s = await H.stored(page);
  assert.deepEqual(Object.keys(s.prog).sort(), ['e:swap-b', ...k1, ...k2].sort()); // 2回目の保存で戻ったりしない
  await done(page);
  // 版 LATEST のページが開いているところへ、もっと新しい版の内容が書き込まれる
  page = await openWith({});
  await clobber(page, { v: LATEST + 5, prog: { 'e:swap-a': A1 }, days: {}, prefs: {} });
  const k3 = await answer(page, 1);
  s = await H.stored(page);
  assert.equal(s.v, LATEST + 5);
  assert.deepEqual(Object.keys(s.prog).sort(), ['e:swap-a', ...k3].sort());
  await done(page);
});

test('版が上がるとき、消した印のIDも、記録と同じ対応で付け替わる', async () => {
  const D = 1700000000000, R = { c: 1, x: 0, s: 1, t: D + 5 };
  const before = { v: LATEST, prog: { 'e:swap-b': R }, days: {}, prefs: PREFS, del: { 'e:swap-a': D, 'e:abandon': D } };
  const page = await H.open(browser, swap.html, JSON.stringify(before));
  const s = await H.stored(page);
  assert.equal(s.v, X);
  assert.deepEqual(s.prog, { 'e:swap-a': R });                    // 記録は swap-b → swap-a
  assert.deepEqual(s.del, { 'e:swap-b': D, 'e:abandon': D });     // 消した印は swap-a → swap-b（移った記録を消さない）
  const k = await answer(page, 1);
  assert.deepEqual(Object.keys((await H.stored(page)).prog).sort(), ['e:swap-a', ...k].sort());
  await done(page);
});

test('版が上がるとき、2つのIDが1つにまとまっても、まとめ先に前からあった記録は消した印で消えない（取り込み・ほかのタブの保存のあとも残る）', async () => {
  // 試験用の移行（版 X: old-a と old-b を abandon にまとめる）
  const fold = H.build({ migrations: [...H.repoMigrations(), { v: X, map: { 'e:old-a': 'e:abandon', 'e:old-b': 'e:abandon' } }] });
  assert.equal(fold.status, 0, fold.out);
  const D = 1700000000000, KEEP = { c: 7, x: 2, s: 2, t: D - 1000 };
  // old-a は消してある。abandon の記録は消していない（消した印より前の時刻）
  const before = { v: LATEST, prog: { 'e:abandon': KEEP }, days: {}, prefs: PREFS, del: { 'e:old-a': D } };
  const [A, B] = await pair({}, PREFS, {}, fold.html);
  await A.evaluate(([k, v]) => localStorage.setItem(k, v), [H.KEY, JSON.stringify(before)]);
  await A.reload(); await A.waitForSelector('#view > *');
  await B.reload(); await B.waitForSelector('#view > *');
  let s = await H.stored(A);
  assert.equal(s.v, X);
  assert.deepEqual(s.prog, { 'e:abandon': KEEP });
  // 無関係の1語を取り込む（合わせる処理が走る）
  assert.match(await imp(A, { prog: { 'e:zzz-other': OTHER }, days: {} }), /1 語の記録を取り込みました/);
  s = await H.stored(A);
  assert.deepEqual(s.prog['e:abandon'], KEEP);
  // もう片方のページが答えて保存しても残る
  await answer(B, 1);
  s = await H.stored(B);
  assert.deepEqual(s.prog['e:abandon'], KEEP);
  await answer(A, 1);
  assert.deepEqual((await H.stored(A)).prog['e:abandon'], KEEP);
  await done(A, B);

  // まとめ先に記録が無ければ、消した印は付け替わって残る（消した記録は戻らない）。
  // 消したあとに付いた記録（印より新しい）が移ってきたときは、記録も印も残る
  const R = { c: 1, x: 0, s: 1, t: D + 5 };
  let page = await H.open(browser, fold.html, JSON.stringify({ v: LATEST, prog: {}, days: {}, prefs: PREFS, del: { 'e:old-a': D } }));
  assert.deepEqual((await H.stored(page)).del, { 'e:abandon': D });
  await done(page);
  page = await H.open(browser, fold.html, JSON.stringify({ v: LATEST, prog: { 'e:old-b': R }, days: {}, prefs: PREFS, del: { 'e:old-a': D } }));
  s = await H.stored(page);
  assert.deepEqual(s.prog, { 'e:abandon': R });
  assert.deepEqual(s.del, { 'e:abandon': D });
  await done(page);
  // 消したのに保存データに残っていた記録（印より前の時刻）は、まとめる前に捨てる（まとめ先で生き返らない。印も残る）
  page = await H.open(browser, fold.html, JSON.stringify({ v: LATEST, prog: { 'e:old-a': KEEP }, days: {}, prefs: PREFS, del: { 'e:old-a': D } }));
  s = await H.stored(page);
  assert.deepEqual(s.prog, {});
  assert.deepEqual(s.del, { 'e:abandon': D });
  await done(page);
});

test('何も消していなければ、保存データに余分な欄は増えない', async () => {
  const page = await openWith({});
  await answer(page, 2);
  assert.deepEqual(Object.keys(await H.stored(page)).sort(), ['days', 'prefs', 'prog', 'v']);
  await done(page);
});

/* ---- 保存の失敗 ---- */
const breakStorage = () => { Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; };

test('保存に失敗したら、画面に一度だけ知らせる（学習は続けられる）', async () => {
  const page = await openWith({});
  await answer(page, 1);
  assert.equal(await page.locator('#savewarn').count(), 0); // 保存できているあいだは出ない
  await page.evaluate(breakStorage);
  await answer(page, 1);
  assert.equal(await page.locator('#savewarn').count(), 1);
  assert.match(await page.textContent('#savewarn'), /保存できませんでした/);
  assert.equal(await page.getAttribute('#savewarn', 'role'), 'alert');
  await answer(page, 2);
  assert.equal(await page.locator('#savewarn').count(), 1); // 何度失敗しても1つだけ
  await page.click('#savewarn button');
  assert.equal(await page.locator('#savewarn').count(), 0);
  await answer(page, 1);
  assert.equal(await page.locator('#savewarn').count(), 0);          // 閉じたら、もう出さない
  assert.equal((await page.textContent('.prog .num')).trim(), '6 / 10'); // 学習は続いている
  assert.equal(Object.keys((await H.stored(page)).prog).length, 1); // 保存されているのは最初の1問だけ
  await done(page);
});

test('最初から保存できない環境（プライベートブラウズなど）でも、開けて、一度だけ知らせる', async () => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(breakStorage);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto('file://' + b.html);
  await page.waitForSelector('#view > *');
  assert.equal(await page.locator('#savewarn').count(), 0); // まだ何も保存していない
  await page.click('.subtabs [data-subj="yomi"]'); // 科目の選択を保存しようとして失敗する
  assert.equal(await page.locator('#savewarn').count(), 1);
  await page.click('[data-start="flash"]');
  await page.click('[data-ans="1"]');
  assert.equal(await page.locator('#savewarn').count(), 1);
  await done(page);
});
