// 学習の設計（第4段階）のテスト。実行: node tests/learning.test.js
//   復習の間隔（記録の g＝段階・d＝次に出す日）: 日をあけた正解で段階が上がる・同じ日は上がらない・誤答で翌日に戻る、
//   習得と苦手の決め方、古い版の記録（g・d なし）の換算と、読み込み・バックアップ・2つのタブでの扱い、
//   出題順（復習→苦手→学習中→未学習）と復習・新出の配分、間違えた語の差し戻し（問題数・結果・再開）、
//   ホーム最上部の「今日の学習」と1日の目標、結果の「今回」と次の復習、本の番号とページ
// 日付は端末のローカル日付。テストでは helpers.js の clock() でページの時刻をずらす
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

const SKEY = H.KEY + '-session';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
let browser, b, LATEST, D;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
  const page = await H.open(browser, b.html, null);
  D = await page.evaluate(() => { const o = {}, T = window.__tangoTest; for (const k in T.DATA) o[k] = T.DATA[k].map(it => ({ id: it.id, w: it.w, k: it.k || '', num: it.num, page: it.page })); return o; });
  await page.context().close();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async (...pages) => { for (const p of pages) assert.deepEqual(p.errors, [], 'ページ内でエラーが出た'); await pages[0].context().close(); };
const SOME = { 'e:zzz-nothing': { c: 1, x: 0, s: 1, t: 1 } }; // 記録が空でない人（どの語にも当たらない記録）
const INDEX = { range: 'all', count: '10', order: 'index' };
const save = (prefs, prog = SOME, days = {}) => JSON.stringify({ v: LATEST, prog, days, prefs });
const openWith = (prefs, prog = SOME, ctx, days) => H.open(browser, b.html, save(prefs, prog, days), ctx);
const count = (page, sel) => page.locator(sel).count();
const num = async page => (await page.textContent('.prog .num')).trim();
const word = async page => (await page.textContent('.card .word')).trim();
const home = page => page.click('.tabs [data-tab="home"]');
const NOW = Date.now(), DAY = 864e5;
// 新しい形の記録: 段階 g、次に出す日は today＋due 日
const rec = (g, due, o = {}) => Object.assign({ c: Math.max(g, 1), x: 0, s: Math.max(g, 1), t: NOW - 30 * DAY, g, d: H.ymd(due) }, o);
// 収録順の1問目だけ答えて中断する
async function first(page, ok) { await page.click('[data-start="flash"]'); const w = await word(page); await H.ans(page, ok); await H.quit(page); return w; }
const sessIds = page => page.evaluate(() => window.__tangoTest.session().items.map(it => it.id));
const status = (page, id) => page.evaluate(i => { const T = window.__tangoTest; for (const k in T.DATA) { const it = T.DATA[k].find(x => x.id === i); if (it) return T.status(it); } return null; }, id);

/* ---- 復習の間隔 ---- */
test('正解すると段階が上がり 1→3→7日後に出る。同じ日の正解では上がらない。日をあけて3回正解すると習得', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX }), id = D.kobun[0].id;
  assert.equal(await first(page, true), D.kobun[0].w);
  let r = (await H.stored(page)).prog[id];
  assert.deepEqual([r.c, r.s, r.g, r.d], [1, 1, 1, H.ymd(1)]);
  assert.equal(await status(page, id), 'learning');
  // 同じ日にもう一度正解しても、段階も次の日も変わらない（回答数は増える）
  await first(page, true);
  r = (await H.stored(page)).prog[id];
  assert.deepEqual([r.c, r.s, r.g, r.d], [2, 2, 1, H.ymd(1)], '同じ日の2回目の正解で段階が上がった');
  assert.equal(await status(page, id), 'learning', '同じ日の連続正解で習得になった');
  assert.match(await page.textContent('[data-today]'), /復習 0語＋新出 \d+語/);
  // 翌日: 復習に出る。正解すると段階2・3日後
  await H.clock(page, 1); await home(page);
  assert.match(await page.textContent('[data-today]'), /復習 1語＋新出 \d+語/);
  await first(page, true);
  r = (await H.stored(page)).prog[id];
  assert.deepEqual([r.g, r.d], [2, H.ymd(4)]);
  // 期限の前（2日後）に正解しても変わらない
  await H.clock(page, 2); await home(page);
  await first(page, true);
  r = (await H.stored(page)).prog[id];
  assert.deepEqual([r.g, r.d], [2, H.ymd(4)], '期限の前の正解で段階が上がった');
  // 4日後: 段階3・7日後。習得になる
  await H.clock(page, 4); await home(page);
  await first(page, true);
  r = (await H.stored(page)).prog[id];
  assert.deepEqual([r.g, r.d], [3, H.ymd(11)]);
  assert.equal(await status(page, id), 'ok');
  assert.equal((await H.statCounts(page))['古文単語']['習得'], 1);
  await done(page);
});

test('段階は 14日後・30日後まで進み、それ以上は30日ごと。誤答で段階0・翌日に戻る', async () => {
  const ids = D.kobun.slice(0, 3).map(it => it.id);
  const page = await openWith({ subj: 'kobun', kobun: INDEX }, { [ids[0]]: rec(3, 0), [ids[1]]: rec(5, -2), [ids[2]]: rec(4, 0) });
  await page.click('[data-start="flash"]');
  await H.ans(page, true); await H.ans(page, true); await H.ans(page, false);
  await H.quit(page);
  const p = (await H.stored(page)).prog;
  assert.deepEqual([p[ids[0]].g, p[ids[0]].d], [4, H.ymd(14)]);
  assert.deepEqual([p[ids[1]].g, p[ids[1]].d], [5, H.ymd(30)]);
  assert.deepEqual([p[ids[2]].g, p[ids[2]].d, p[ids[2]].s], [0, H.ymd(1), 0]);
  assert.equal(await status(page, ids[2]), 'weak', '習得していた語を落としたのに苦手にならない');
  await done(page);
});

test('苦手の決め方: 初めて見た語の誤答1回は学習中。2回間違えた語と、正解したあとで落とした語が苦手', async () => {
  const [a, bb, c] = D.kobun.slice(0, 3).map(it => it.id);
  const page = await openWith({ subj: 'kobun', kobun: INDEX }, { [bb]: rec(1, 0), [c]: { c: 0, x: 1, s: 0, t: NOW - DAY, g: 0, d: H.ymd(0) } });
  await page.click('[data-start="flash"]');
  await H.ans(page, false); await H.ans(page, false); await H.ans(page, false);
  await H.quit(page);
  assert.equal(await status(page, a), 'learning', '初見の誤答1回で苦手になった');
  assert.equal(await status(page, bb), 'weak', '正解したあとで落とした語が苦手にならない');
  assert.equal(await status(page, c), 'weak', '2回間違えた語が苦手にならない');
  const cs = (await H.statCounts(page))['古文単語'];
  assert.deepEqual([cs['学習中'], cs['苦手']], [1, 2]);
  // 2回間違えた語は、1回正解しても苦手のまま（習得するまで）
  await H.clock(page, 1); await home(page);
  await page.click('[data-start="flash"]'); await H.ans(page, true); await H.ans(page, true); await H.ans(page, true); await H.quit(page);
  assert.equal(await status(page, c), 'weak');
  assert.equal(await status(page, a), 'learning');
  await done(page);
});

test('単語帳の「苦手に登録」「習得済みにする」は、いまの決め方でも苦手・習得になる。次の復習の日が出る', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX }), [a, bb] = D.kobun.slice(0, 2).map(it => it.id);
  await page.click('.tabs [data-tab="list"]');
  await page.click(`[data-open="${a}"]`); await page.click('[data-set="weak"]');
  assert.equal(await status(page, a), 'weak');
  assert.match(await page.textContent('[data-due]'), /次の復習: 明日/);
  await page.click(`[data-open="${bb}"]`); await page.click('[data-set="ok"]');
  assert.equal(await status(page, bb), 'ok');
  assert.match(await page.textContent('[data-due]'), /次の復習: 7日後/);
  const p = (await H.stored(page)).prog;
  assert.deepEqual([p[a].g, p[a].d, p[bb].g, p[bb].d], [0, H.ymd(1), 3, H.ymd(7)]);
  await done(page);
});

/* ---- 古い版の記録 ---- */
test('古い版の記録（g・d なし）: 読み込んでも書き換えない。連続正解2以上は習得のまま復習に出て、答えると段階が付く', async () => {
  const [a, bb, c, d] = D.kobun.slice(0, 4).map(it => it.id);
  const prog = { [a]: { c: 2, x: 0, s: 2, t: NOW - 10 * DAY }, [bb]: { c: 1, x: 0, s: 1, t: NOW }, [c]: { c: 3, x: 1, s: 0, t: NOW - 3 * DAY }, [d]: { c: 5, x: 0, s: 5, t: NOW - DAY } };
  const raw = save({ subj: 'kobun', kobun: INDEX }, prog);
  const page = await H.open(browser, b.html, raw);
  assert.equal(await H.raw(page), raw, '読み込んだだけで保存データが書き換わった');
  assert.deepEqual([await status(page, a), await status(page, bb), await status(page, c), await status(page, d)], ['ok', 'learning', 'weak', 'ok']);
  // 期限: a は最後に答えた日の7日後（＝3日前）、c は翌日（＝2日前）で復習に出る。b は明日、d は6日後
  assert.deepEqual(await page.evaluate(ids => ids.map(i => window.__tangoTest.schedOf(window.__tangoTest.DATA.kobun.find(x => x.id === i))), [a, bb, c, d]),
    [{ g: 3, d: H.ymd(-3) }, { g: 1, d: H.ymd(1) }, { g: 0, d: H.ymd(-2) }, { g: 3, d: H.ymd(6) }]);
  assert.match(await page.textContent('[data-today]'), /復習 2語＋新出 \d+語/);
  // 答えると、その記録に段階と次の日が付く（a: 3→4、c: 0→1）。答えていない記録はそのまま
  await page.click('[data-start="flash"]');
  await H.ans(page, true); await H.ans(page, true); await H.ans(page, true); await H.quit(page);
  const p = (await H.stored(page)).prog;
  assert.deepEqual([p[a].g, p[a].d, p[a].c, p[a].s], [4, H.ymd(14), 3, 3]);
  assert.deepEqual([p[bb].g, p[bb].d], [1, H.ymd(1)], '期限の前の正解で段階が変わった');
  assert.deepEqual([p[c].g, p[c].d], [1, H.ymd(1)]);
  assert.deepEqual(p[d], prog[d]);
  await done(page);
});

test('g・d の形がおかしい記録は、捨てずに s と t から換算する', async () => {
  const [a, bb] = D.kobun.slice(0, 2).map(it => it.id);
  const page = await openWith({ subj: 'kobun', kobun: INDEX }, { [a]: { c: 2, x: 0, s: 2, t: NOW, g: 99, d: 'x' }, [bb]: { c: 1, x: 0, s: 1, t: NOW, g: '2', d: null } });
  assert.deepEqual([await status(page, a), await status(page, bb)], ['ok', 'learning']);
  await first(page, true);
  const p = (await H.stored(page)).prog;
  assert.deepEqual([p[a].g, p[a].d, p[a].c], [3, H.ymd(7), 3]);
  await done(page);
});

test('バックアップ: 古い版の控え（g・d なし）も取り込める。g・d は形が正しければ残し、おかしければ落として記録は残す', async () => {
  const [a, bb, c] = D.kobun.slice(0, 3).map(it => it.id);
  const page = await openWith({ subj: 'kobun', kobun: INDEX });
  await page.click('.tabs [data-tab="stats"]'); await H.dm(page);
  const bak = { v: LATEST, prog: { [a]: { c: 2, x: 0, s: 2, t: NOW - 10 * DAY }, [bb]: { c: 4, x: 1, s: 3, t: NOW - DAY, g: 4, d: H.ymd(9) }, [c]: { c: 1, x: 0, s: 1, t: NOW, g: 7, d: '2026/01/01', z: 1 } }, days: {} };
  await page.fill('#imp', JSON.stringify(bak));
  await page.click('[data-import]');
  assert.match(await page.textContent('#msg'), /3 語の記録を取り込みました/);
  const p = (await H.stored(page)).prog;
  assert.deepEqual(p[a], bak.prog[a]);
  assert.deepEqual(p[bb], bak.prog[bb]);
  assert.deepEqual(p[c], { c: 1, x: 0, s: 1, t: bak.prog[c].t });
  assert.deepEqual([await status(page, a), await status(page, bb), await status(page, c)], ['ok', 'ok', 'learning']);
  // 書き出した控えにも g・d が入る
  await page.click('[data-export]');
  const out = JSON.parse(await page.inputValue('#imp'));
  assert.deepEqual(out.prog[bb], bak.prog[bb]);
  await done(page);
});

test('2つのタブ: 片方の回答で付いた段階と次の日が、もう片方にもそのまま伝わる（回答数の多いほうの記録がまるごと残る）', async () => {
  const id = D.kobun[0].id;
  const A = await openWith({ subj: 'kobun', kobun: INDEX }, { [id]: { c: 2, x: 0, s: 2, t: NOW - 10 * DAY } });
  const B = await H.openMore(A, b.html);
  await first(A, true); // A: 古い記録に答えて、段階4・14日後
  await B.click('.tabs [data-tab="stats"]'); await B.click('.tabs [data-tab="home"]');
  assert.deepEqual(await B.evaluate(i => window.__tangoTest.schedOf(window.__tangoTest.DATA.kobun.find(x => x.id === i)), id), { g: 4, d: H.ymd(14) });
  // B で別の語に答えて保存しても、A の記録は消えない
  await B.click('[data-start="flash"]'); await H.ans(B, true); await H.ans(B, true); await H.quit(B);
  const p = (await H.stored(B)).prog;
  assert.deepEqual([p[id].g, p[id].d, p[id].c], [4, H.ymd(14), 4]);
  assert.deepEqual([p[D.kobun[1].id].g, p[D.kobun[1].id].d], [1, H.ymd(1)]);
  assert.deepEqual(B.errors, []);
  await done(A);
});

/* ---- 出題順と配分 ---- */
// 古文単語: 期限が来た復習 nDue 語（i 番目は i+1 日前が期限）、苦手（期限前）、学習中（期限前）、習得（期限前）を作る。残りは未学習
function mix(nDue) {
  const prog = {}, K = D.kobun, o = { due: [], weak: [], learning: [], ok: [] };
  for (let i = 0; i < nDue; i++) { prog[K[100 + i].id] = rec(1 + i % 4, -(i + 1)); o.due.push(K[100 + i].id); }
  for (let i = 0; i < 3; i++) { prog[K[200 + i].id] = rec(0, 1, { c: 1, x: 2, s: 0, t: NOW - (3 - i) * 1000 }); o.weak.push(K[200 + i].id); }
  for (let i = 0; i < 3; i++) { prog[K[220 + i].id] = rec(2, 2, { t: NOW - (3 - i) * 1000 }); o.learning.push(K[220 + i].id); }
  for (let i = 0; i < 5; i++) { prog[K[240 + i].id] = rec(4, 9); o.ok.push(K[240 + i].id); }
  return { prog, o };
}
test('既定の出題順は 復習→苦手→学習中→未学習。1セットは復習6：新出4に配分し、復習は期限の古い順', async () => {
  const { prog, o } = mix(15), fresh = id => !prog[id];
  const page = await openWith({ subj: 'kobun', kobun: { range: 'auto', count: '10', order: 'smart' } }, prog);
  await page.click('[data-start="flash"]');
  let ids = await sessIds(page);
  assert.equal(ids.length, 10);
  assert.deepEqual(ids.slice(0, 6), o.due.slice(9).reverse(), '復習の6語が、期限のいちばん古い語からになっていない');
  assert.ok(ids.slice(6).every(fresh), '残りの4語が未学習の語でない');
  await H.quit(page);
  // 問題数を増やすと、復習を出し切ったあとに 苦手→学習中、その後ろに未学習
  await page.selectOption('#o-count', '50');
  await page.click('[data-start="flash"]');
  ids = await sessIds(page);
  assert.deepEqual(ids.slice(0, 15), o.due.slice().reverse());
  assert.deepEqual(ids.slice(15, 18), o.weak);
  assert.deepEqual(ids.slice(18, 21), o.learning);
  assert.ok(ids.slice(21).every(fresh) && ids.length === 50, '残りが未学習の語でない（期限前の習得の語は、未学習があるうちは出さない）');
  await done(page);
});

test('復習が少ないときは新出で埋め、新出が無いときは復習で埋める。どちらも足りなければ期限前の習得の語', async () => {
  const { prog, o } = mix(2);
  let page = await openWith({ subj: 'kobun', kobun: { range: 'auto', count: '20', order: 'smart' } }, prog);
  await page.click('[data-start="flash"]');
  let ids = await sessIds(page);
  assert.deepEqual(ids.slice(0, 8), o.due.slice().reverse().concat(o.weak, o.learning));
  assert.ok(ids.slice(8).every(id => !prog[id]) && ids.length === 20);
  await done(page);
  // 未学習なし: 全語を期限前の習得にして、5語だけ期限が来ている → その5語、残りは習得の語
  const all = {}; D.kobun.forEach((it, i) => { all[it.id] = i < 5 ? rec(2, -1) : rec(4, 9, { t: NOW - i * 1000 }); });
  page = await openWith({ subj: 'kobun', kobun: { range: 'auto', count: '10', order: 'smart' } }, all);
  await page.click('[data-start="flash"]');
  ids = await sessIds(page);
  assert.deepEqual(ids.slice(0, 5).sort(), D.kobun.slice(0, 5).map(it => it.id).sort());
  assert.equal(ids.length, 10);
  await done(page);
});

test('おまかせ＋収録順・ランダムでも、同じ配分で先に確保する', async () => {
  const { prog, o } = mix(15), at = id => D.kobun.findIndex(it => it.id === id);
  for (const order of ['index', 'random']) {
    const page = await openWith({ subj: 'kobun', kobun: { range: 'auto', count: '10', order } }, prog);
    await page.click('[data-start="flash"]');
    const ids = await sessIds(page);
    assert.equal(ids.filter(id => o.due.includes(id)).length, 6, order + ': 復習が6語でない');
    assert.equal(ids.filter(id => !prog[id]).length, 4, order + ': 新出が4語でない');
    if (order === 'index') {
      assert.deepEqual(ids, ids.slice().sort((x, y) => at(x) - at(y)), '収録順に並んでいない');
      assert.deepEqual(ids.filter(id => !prog[id]), D.kobun.filter(it => !prog[it.id]).slice(0, 4).map(it => it.id), '新出が収録順の先頭からでない');
    }
    await done(page);
  }
});

/* ---- 間違えた語の差し戻し ---- */
// 「もう一度」の印が出るまで正解で進み、出た問題の番号（何問目か）を返す
async function untilAgain(page) { for (let i = 0; i < 12; i++) { if (await count(page, '.again')) return +(await num(page)).split(' / ')[0]; await H.ans(page, true); } return 0; }
test('間違えた語は3〜5問あとにもう一度出る（2回まで）。問題数・進み具合・結果は差し戻しを含めて数える', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX }, SOME, PHONE);
  await page.click('[data-start="flash"]');
  const w = await word(page);
  assert.equal(await num(page), '1 / 10');
  await H.ans(page, false);
  assert.equal(await num(page), '2 / 11', '差し戻しが問題数に入っていない');
  assert.equal(await count(page, '.again'), 0);
  let at = await untilAgain(page);
  assert.ok(at >= 4 && at <= 6, `1問目の語が ${at} 問目に出た（4〜6問目のはず）`);
  assert.equal(await word(page), w);
  await H.ans(page, false); // 2回目の誤答 → もう一度だけ差し戻す
  assert.equal((await num(page)).split(' / ')[1], '12');
  const at2 = await untilAgain(page);
  assert.ok(at2 - at >= 3 && at2 - at <= 5, `2回目の差し戻しが ${at2 - at} 問あと`);
  assert.equal(await word(page), w);
  await H.ans(page, false); // 3回目の誤答 → もう差し戻さない
  assert.equal((await num(page)).split(' / ')[1], '12', '3回目の誤答でも差し戻した');
  // 進み具合のバーは、差し戻しの後も後ろへ戻らない
  const wBar = () => page.$eval('.prog .track i', e => parseFloat(e.style.width));
  let prev = await wBar();
  while (await count(page, '.prog')) { await H.ans(page, true); if (await count(page, '.prog')) { const x = await wBar(); assert.ok(x > prev); prev = x; } }
  // 結果: 正答数は語ごとの最初の回答で数える（10語中9語）。出し直しの回数を添える。回答数は12
  assert.match(await page.textContent('.score .big'), /9 \/ 10 問/);
  assert.match(await page.textContent('.score'), /出し直し 2回/);
  assert.equal(await count(page, '.wlist.res > li'), 1);
  assert.match(await page.textContent('[data-retry="wrong"]'), /間違えた 1 語をもう一度/);
  const s = await H.stored(page), r = s.prog[D.kobun[0].id];
  assert.deepEqual([r.c, r.x, r.g, r.d], [0, 3, 0, H.ymd(1)]);
  assert.equal(s.days[H.ymd(0)], 12);
  assert.equal(await page.evaluate(k => localStorage.getItem(k), SKEY), null);
  // 「今回」: 9語は学習中（初めての正解）、1語は苦手（3回誤答）。次の復習は全部明日
  assert.match(await page.textContent('[data-rsum]'), /今回習得 0語・学習中 10語（うち苦手 1語）/);
  assert.match(await page.textContent('[data-rsum]'), /次の復習明日 10語/);
  await done(page);
});

test('差し戻しで正解しても、段階は上がらない（翌日に出る）。4択でも差し戻す', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX });
  await page.click('[data-start="quiz"]');
  // 1問目をわざと間違える（正答でない選択肢を押す）
  const pickWrong = async ok => { const i = await page.evaluate(want => { const s = window.__tangoTest.session(), it = s.items[s.i]; return s.choices.findIndex(x => (x.id === it.id) === want); }, ok); await page.click(`[data-pick="${i}"]`); await page.click('[data-next]'); };
  await pickWrong(false);
  assert.equal(await num(page), '2 / 11');
  for (let i = 0; i < 10; i++) await pickWrong(true);
  assert.equal(await count(page, '.score'), 1);
  const r = (await H.stored(page)).prog[D.kobun[0].id];
  assert.deepEqual([r.c, r.x, r.s, r.g, r.d], [1, 1, 1, 0, H.ymd(1)]);
  assert.equal(await status(page, D.kobun[0].id), 'learning', '初見の誤答1回＋差し戻しの正解は学習中');
  await done(page);
});

test('差し戻しのあとで再読み込みしても、続きから再開できる（問題数と「今回」の数が合う）。古い形の途中データも読める', async () => {
  const id = D.kobun[0].id;
  let page = await openWith({ subj: 'kobun', kobun: INDEX }, { [id]: rec(2, 0) });
  await page.click('[data-start="flash"]');
  await H.ans(page, false); await H.ans(page, true);
  assert.equal(await num(page), '3 / 11');
  const j = JSON.parse(await page.evaluate(k => localStorage.getItem(k), SKEY));
  assert.equal(j.ids.length, 11); assert.equal(j.ids.filter(x => x === id).length, 2); assert.deepEqual(j.res, [0, 1]); assert.equal(j.pre[id], 'learning');
  await page.reload(); await page.waitForSelector('#view > *');
  assert.match(await page.textContent('.panel h2'), /全11問/);
  await page.click('[data-resume="yes"]');
  assert.equal(await num(page), '3 / 11');
  while (await count(page, '.prog')) await H.ans(page, true);
  assert.match(await page.textContent('.score .big'), /9 \/ 10 問/);
  assert.match(await page.textContent('[data-rsum]'), /学習中 10語（うち苦手 1語）/);
  await done(page);
  // 古い版が書いた途中データ（pre なし）
  page = await H.open(browser, b.html, save({ subj: 'kobun', kobun: INDEX }));
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SKEY, JSON.stringify({ v: LATEST, subj: 'kobun', mode: 'flash', ids: D.kobun.slice(0, 3).map(it => it.id), res: [1] })]);
  await page.reload(); await page.waitForSelector('#view > *');
  await page.click('[data-resume="yes"]');
  assert.equal(await num(page), '2 / 3');
  await H.ans(page, true); await H.ans(page, true);
  assert.match(await page.textContent('[data-rsum]'), /今回習得 0語・学習中 3語/);
  await done(page);
});

/* ---- ホーム最上部の「今日の学習」 ---- */
test('ホームの最上部に「今日の学習を始める（復習n語＋新出n語）」と1日の目標・達成度。押すと復習→新出の順に出る', async () => {
  const { prog, o } = mix(15);
  const page = await openWith({ subj: 'kobun', kobun: { range: 'new', count: '10', order: 'random' } }, prog, PHONE, { [H.ymd(0)]: 12 });
  // 最上部（出題モードより上、1画面目）にある
  const top = sel => page.$eval(sel, e => e.getBoundingClientRect().top);
  assert.ok(await top('[data-start-today]') < await top('.today'));
  assert.ok(await page.$eval('[data-start-today]', e => e.getBoundingClientRect().bottom) < 844 / 2, '「今日の学習を始める」が画面の上半分に入っていない');
  assert.equal((await page.innerText('[data-start-today]')).replace(/\s+/g, ''), '今日の学習を始める（復習6語＋新出4語）');
  assert.match(await page.textContent('[data-today] .tsub'), /復習待ち 15語/);
  // 目標と達成度（既定は30問）
  assert.match(await page.textContent('[data-goal]'), /12 \/ 30 問/);
  assert.equal(await page.$eval('[data-goal] .track i', e => e.style.width), '40%');
  assert.equal(await count(page, '[data-goal] .gdone'), 0);
  await page.selectOption('#o-goal', '10');
  assert.match(await page.textContent('[data-goal]'), /12 \/ 10 問達成/);
  assert.equal((await H.stored(page)).prefs.goal, '10');
  // 問題数を変えると、語数も変わる
  await page.selectOption('#o-count', '20');
  assert.equal((await page.innerText('[data-start-today]')).replace(/\s+/g, ''), '今日の学習を始める（復習12語＋新出8語）');
  // 押すと、出題範囲の設定（未学習のみ・ランダム）に関わらず、復習（期限の古い順）→ 新出
  await page.click('[data-start-today]');
  const ids = await sessIds(page);
  assert.deepEqual(ids.slice(0, 12), o.due.slice(3).reverse());
  assert.ok(ids.slice(12).every(id => !prog[id]) && ids.length === 20);
  assert.equal(await count(page, '.card.flip'), 1, '既定の形式がフラッシュカードでない');
  await H.quit(page);
  // 形式を変えられる
  await page.selectOption('#o-tmode', 'quiz');
  assert.match(await page.textContent('[data-today] .tsub'), /形式: 4択：語 → 意味/);
  await page.click('[data-start-today]');
  assert.equal(await count(page, '.choices .choice'), 4);
  await done(page);
});

test('今日の学習: 期限前の語（苦手・学習中）は数えない。復習も新出も無ければ、ボタンの代わりに次の復習の日を出す', async () => {
  const all = {}; D.yomi.forEach((it, i) => { all[it.id] = rec(i < 3 ? 0 : 2, i < 3 ? 1 : 3, i < 3 ? { c: 1, x: 2, s: 0 } : {}); });
  const page = await openWith({ subj: 'yomi' }, all);
  assert.equal(await count(page, '[data-start-today]'), 0);
  assert.match(await page.textContent('[data-today]'), /今日の復習と新しい語は、もうありません。次の復習は明日です。/);
  await H.clock(page, 1); await home(page);
  assert.equal((await page.innerText('[data-start-today]')).replace(/\s+/g, ''), '今日の学習を始める（復習3語＋新出0語）');
  await done(page);
});

test('初めての利用者にも「今日の学習」が出る（復習0語＋新出）。全教材で、ホームを開いてもエラーが出ない', async () => {
  const page = await H.open(browser, b.html, null, PHONE);
  assert.equal((await page.innerText('[data-start-today]')).replace(/\s+/g, ''), '今日の学習を始める（復習0語＋新出8語）');
  for (const g of ['kobun', 'eigo']) {
    await page.click(`.switch [data-group="${g}"]`);
    const n = await count(page, '.subtabs [data-subj]');
    for (let i = 0; i < n; i++) {
      await page.locator('.subtabs [data-subj]').nth(i).click();
      assert.equal(await count(page, '[data-start-today]'), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '横スクロールが出た');
    }
  }
  await page.click('[data-start-today]');
  await H.ans(page, true);
  await done(page);
});

/* ---- 結果 ---- */
test('結果に「今回 習得n語・学習中n語」と次の復習の時期が出る', async () => {
  const ids = D.kobun.slice(0, 4).map(it => it.id);
  // 1語目: 段階2で期限 → 正解で習得。2語目: 段階4で期限 → 正解で習得のまま（14日後）。3語目: 未学習を正解。4語目: 未学習を誤答
  const page = await openWith({ subj: 'kobun', kobun: { range: 'all', count: '10', order: 'index' } }, { [ids[0]]: rec(2, 0), [ids[1]]: rec(3, -1) }, PHONE);
  await page.click('[data-start="flash"]');
  await H.ans(page, true); await H.ans(page, true); await H.ans(page, true); await H.ans(page, false);
  while (await count(page, '.prog')) await H.ans(page, true);
  const t = await page.textContent('[data-rsum]');
  assert.match(t, /今回習得 1語・学習中 8語・習得のまま 1語/);
  assert.match(t, /次の復習明日 8語・7日後 1語・14日後 1語/);
  assert.match(await page.textContent('.score'), /今日 11 \/ 30 問/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await done(page);
});

/* ---- 本の番号とページ ---- */
test('古文330: 結果の誤答一覧と成績の苦手ワードに本の No. が出る。古文常識: カードの裏面に本のページが出る', async () => {
  let page = await openWith({ subj: 'book', book: { range: 'all', count: '10', order: 'index', rel: 'no' } });
  await page.click('[data-start="flash"]');
  await H.ans(page, false);
  while (await count(page, '.prog')) await H.ans(page, await count(page, '.again') ? false : true);
  assert.match(await page.textContent('.wlist.res .w small'), /^No\.1(\s|　|$)/);
  await page.click('.tabs [data-tab="stats"]');
  assert.equal((await page.textContent('.wlist .chip.num')).trim(), 'No.1');
  await done(page);
  page = await openWith({ subj: 'joshiki', joshiki: { range: 'all', count: '10', order: 'index' } });
  await page.click('[data-start="flash"]');
  await page.click('.actions [data-flip]');
  const w = await word(page), it = D.joshiki.find(x => x.w === w);
  assert.ok(it.page > 0);
  assert.equal((await page.textContent('.card.back [data-page]')).trim(), '本のページp.' + it.page);
  await done(page);
});

/* ---- 画面 ---- */
test('スマホ幅390・320、ライト・ダーク: ホーム・差し戻しの問題・結果で、横スクロールもページ内のエラーも出ない', async () => {
  for (const width of [390, 320]) for (const colorScheme of ['light', 'dark']) {
    const { prog } = mix(15);
    const page = await openWith({ subj: 'book', book: { range: 'auto', count: '10', order: 'smart', rel: 'with' } }, prog, { viewport: { width, height: 700 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme });
    const fits = async what => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${width}px ${colorScheme}: ${what}で横スクロール`);
    await fits('ホーム');
    // 押せる要素は44px以上
    for (const sel of ['[data-start-today]', '#o-tmode', '#o-goal']) assert.ok(await page.$eval(sel, e => e.getBoundingClientRect().height) >= 44, sel + ' が44px未満');
    assert.ok(await page.$eval('#o-goal', e => parseFloat(getComputedStyle(e).fontSize)) >= 16);
    await page.click('[data-start-today]');
    await H.ans(page, false);
    await untilAgain(page);
    assert.equal(await count(page, '.again'), 1);
    await fits('差し戻しの問題');
    while (await count(page, '.prog')) await H.ans(page, true);
    await fits('結果');
    await done(page);
  }
});
