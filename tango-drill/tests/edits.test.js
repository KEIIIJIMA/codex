// 意味・メモの編集のテスト。実行: node tests/edits.test.js
//   カードの裏面・解答後の解説・単語帳・結果の誤答の解説にある「意味・メモを編集」で、意味の書き換えとメモの追記ができ、保存データの edits に残ること。
//   元に戻す、空にして保存、利用者の文字のエスケープ、edits の無い古いデータ・形のおかしい edits、2つのタブ、IDの移行、バックアップの往復、
//   記録のリセットでは消えないこと、全部消す操作、保存の失敗の知らせ、出題（選択肢・判定）は元の意味のままであること、スマホ幅での表示
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
let browser, b, LATEST, D;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
  const page = await H.open(browser, b.html, null);
  D = await page.evaluate(() => { const o = {}, T = window.__tangoTest; for (const k in T.DATA) o[k] = T.DATA[k].map(it => ({ id: it.id, w: it.w, m: it.m })); return o; });
  await page.context().close();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async (...pages) => { for (const p of pages) assert.deepEqual(p.errors, [], 'ページ内でエラーが出た'); await pages[0].context().close(); };
const SOME = { 'e:zzz-nothing': { c: 1, x: 0, s: 1, t: 1 } };
const INDEX = { range: 'all', count: '10', order: 'index' };
const save = (o = {}) => JSON.stringify(Object.assign({ v: LATEST, prog: SOME, days: {}, prefs: { subj: 'kobun', kobun: INDEX } }, o));
const openWith = (o, ctx, html = b.html) => H.open(browser, html, save(o), ctx);
const count = (page, sel) => page.locator(sel).count();
// 表示されている意味（意味ごとの用例は除く）
const means = (page, root = '.card.back') => page.$$eval(root + ' > .means li', ls => ls.map(l => { const c = l.cloneNode(true); c.querySelectorAll('.ex').forEach(x => x.remove()); return c.textContent.trim(); }));
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// フラッシュカードの1問目（収録順の先頭の語）の裏面を開く
async function back(page) { await page.click('[data-start="flash"]'); await page.click('.actions [data-flip]'); await page.waitForFunction(() => !document.querySelector('[data-ans="1"]').disabled); }
// 編集欄を開き、意味（行の配列）とメモを入れて保存する（undefined の欄は触らない）
async function edit(page, m, n) {
  await page.click('[data-edit]');
  if (m !== undefined) await page.fill('#ed-m', m.join('\n'));
  if (n !== undefined) await page.fill('#ed-n', n);
  await page.click('.edbox [type="submit"]');
}
const T0 = Date.now() - 1e6;

test('裏面の「意味・メモを編集」: 元の意味が1行に1つ入っていて、書き換え・行の追加・メモの追記ができる。再読み込みしても残る', async () => {
  const page = await openWith({}, PHONE), it = D.kobun[0];
  await back(page);
  assert.deepEqual(await means(page), it.m);
  assert.equal(await count(page, '[data-edmark]'), 0);
  assert.ok(await page.$eval('[data-edit]', e => e.getBoundingClientRect().height) >= 44, '「編集」が44px未満');
  await page.click('[data-edit]');
  assert.equal(await page.inputValue('#ed-m'), it.m.join('\n'));
  assert.equal(await page.inputValue('#ed-n'), '');
  for (const sel of ['#ed-m', '#ed-n']) assert.ok(await page.$eval(sel, e => parseFloat(getComputedStyle(e).fontSize)) >= 16, sel + ' の文字が16px未満');
  for (const sel of ['.edbox [type="submit"]', '[data-ed="cancel"]']) assert.ok(await page.$eval(sel, e => e.getBoundingClientRect().height) >= 44);
  // キャンセルでは何も変わらない
  await page.fill('#ed-m', 'x'); await page.click('[data-ed="cancel"]');
  assert.deepEqual(await means(page), it.m);
  assert.equal((await H.stored(page)).edits, undefined);
  // 書き換え＋行の追加＋メモ（前後の空白と空行は除く）
  await edit(page, ['  自分の言葉の意味  ', '', '足した意味'], ' 語呂で覚える\n2行目 ');
  assert.deepEqual(await means(page), ['自分の言葉の意味', '足した意味']);
  assert.equal((await page.textContent('[data-edmark] .edb')).trim(), '編集済み');
  assert.equal(await page.$eval('[data-memo]', e => e.textContent), 'メモ語呂で覚える\n2行目');
  assert.equal(await count(page, '.edbox'), 0);
  // 元の意味は「元の意味を見る」で確かめられる
  await page.click('.orig summary');
  assert.deepEqual(await page.$$eval('.orig .means li', ls => ls.map(l => l.textContent.trim())), it.m);
  const e = (await H.stored(page)).edits[it.id];
  assert.deepEqual([e.m, e.n], [['自分の言葉の意味', '足した意味'], '語呂で覚える\n2行目']);
  assert.ok(e.t > T0);
  assert.equal(await fits(page), true);
  // 再読み込み: 裏面にも単語帳にも出る。単語帳の行の意味も利用者のもの
  await H.quit(page);
  await page.reload(); await page.waitForSelector('#view > *');
  await back(page);
  assert.deepEqual(await means(page), ['自分の言葉の意味', '足した意味']);
  await H.quit(page);
  await page.click('.tabs [data-tab="list"]');
  assert.equal((await page.textContent(`[data-open="${it.id}"] .vm`)).trim(), '自分の言葉の意味／足した意味');
  await page.click(`[data-open="${it.id}"]`);
  assert.deepEqual(await means(page, '.vdet'), ['自分の言葉の意味', '足した意味']);
  assert.match(await page.textContent('.vdet [data-memo]'), /語呂で覚える/);
  // 編集欄には、利用者の意味とメモが入っている
  await page.click('.vdet [data-edit]');
  assert.equal(await page.inputValue('#ed-m'), '自分の言葉の意味\n足した意味');
  assert.equal(await page.inputValue('#ed-n'), '語呂で覚える\n2行目');
  await done(page);
});

test('元に戻す（確認あり）。空にして保存しても元に戻る。元と同じ内容の保存は編集として残さない', async () => {
  const it = D.kobun[0];
  const page = await openWith({ edits: { [it.id]: { m: ['へんしゅう'], n: 'めも', t: T0 } } });
  await back(page);
  assert.deepEqual(await means(page), ['へんしゅう']);
  await page.click('[data-edit]');
  await page.click('[data-ed="revert"]');
  assert.equal(await count(page, '[data-edconfirm]'), 1);
  await page.click('[data-ed="revert-no"]'); // やめる → そのまま
  assert.deepEqual(await means(page), ['へんしゅう']);
  await page.click('[data-edit]'); await page.click('[data-ed="revert"]'); await page.click('[data-ed="revert-yes"]');
  assert.deepEqual(await means(page), it.m);
  assert.equal(await count(page, '[data-edmark]') + await count(page, '[data-memo]'), 0);
  let e = (await H.stored(page)).edits[it.id];
  assert.deepEqual([e.del, e.m, e.n], [1, undefined, undefined]); // 消した印（もう片方のタブに伝えるため）
  // もう一度編集して、空にして保存 → 元の表示
  await edit(page, ['二度目'], 'メモ2');
  assert.deepEqual(await means(page), ['二度目']);
  await edit(page, [], '');
  assert.deepEqual(await means(page), it.m);
  assert.equal(await count(page, '[data-edmark]'), 0);
  assert.equal((await H.stored(page)).edits[it.id].del, 1);
  // 元と同じ意味のまま保存: 編集として残さない。メモだけなら、意味は元のままでメモだけ残る
  await edit(page);
  assert.equal(await count(page, '[data-edmark]'), 0);
  await edit(page, undefined, 'メモだけ');
  assert.deepEqual(await means(page), it.m);
  e = (await H.stored(page)).edits[it.id];
  assert.deepEqual([e.m, e.n, e.del], [undefined, 'メモだけ', undefined]);
  assert.equal(await count(page, '.orig'), 0, '意味を変えていないのに「元の意味を見る」が出ている');
  await done(page);
});

test('利用者の文字はそのまま文字として出る（<script> や <img onerror> を入れても実行されない）', async () => {
  const it = D.kobun[0], M = '<img src=x onerror="window.__x=1">', N = '<script>window.__y=1</script>"\'&amp;<b>太字</b>';
  const page = await openWith({});
  await back(page);
  await edit(page, [M, '</span></li><h1 id="pwn">x</h1>'], N);
  assert.deepEqual(await means(page), [M, '</span></li><h1 id="pwn">x</h1>']);
  assert.equal(await page.$eval('[data-memo]', e => e.textContent), 'メモ' + N);
  await H.quit(page);
  // 単語帳の行・詳細・編集欄、結果の誤答一覧、成績の苦手ワードでも同じ
  await page.click('.tabs [data-tab="list"]');
  await page.click(`[data-open="${it.id}"]`); await page.click('.vdet [data-edit]');
  assert.equal(await page.inputValue('#ed-m'), M + '\n</span></li><h1 id="pwn">x</h1>');
  await page.click('.tabs [data-tab="home"]'); await page.click('[data-start="flash"]');
  await H.ans(page, false); while (await count(page, '.prog')) await H.ans(page, false);
  assert.ok((await page.textContent('.wlist.res')).includes(M));
  await page.click('.tabs [data-tab="stats"]');
  assert.ok((await page.textContent('.wlist')).includes(M));
  await page.reload(); await page.waitForSelector('#view > *');
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => [window.__x, window.__y, document.querySelectorAll('#pwn, #view img[src="x"], #view script').length]), [undefined, undefined, 0]);
  await done(page);
});

test('edits の無い古いデータ、形のおかしい edits でも動く（おかしい項目は使わず、ほかは残す）', async () => {
  const [a, bb, c, d] = D.kobun.slice(0, 4).map(it => it.id);
  for (const edits of [undefined, null, [], 'x', 5]) {
    const page = await H.open(browser, b.html, JSON.stringify(Object.assign({ v: LATEST, prog: SOME, days: {}, prefs: { subj: 'kobun', kobun: INDEX } }, edits === undefined ? {} : { edits })));
    await back(page);
    assert.deepEqual(await means(page), D.kobun[0].m);
    await edit(page, ['あたらしい'], '');
    assert.deepEqual((await H.stored(page)).edits[a].m, ['あたらしい']);
    await done(page);
  }
  const page = await openWith({ edits: { [a]: { m: 'もじれつ', t: 1 }, [bb]: { m: ['よい'], t: 2 }, [c]: { m: [1, 2], n: 'x', t: 3 }, [d]: { n: 'メモ' }, zzz: null, 'k:無い語': { n: 'のこす', t: 9 } } });
  await page.click('.tabs [data-tab="list"]');
  const vm = id => page.$eval(`[data-open="${id}"] .vm`, e => e.textContent.trim());
  assert.equal(await vm(a), D.kobun[0].m.join('／'));
  assert.equal(await vm(bb), 'よい');
  assert.equal(await vm(c), D.kobun[2].m.join('／'));
  await page.click('.tabs [data-tab="stats"]'); await H.dm(page);
  assert.equal((await page.textContent('[data-edcount]')).trim(), '2件'); // 形の正しい2件（いまは無い語の編集も数える）
  await done(page);
});

test('出題は元の意味のまま: 4択の選択肢・正誤、意味→語の設問、空所補充は変わらない。解答後の解説には利用者の意味が出る', async () => {
  const it = D.kobun[0];
  const page = await openWith({ edits: { [it.id]: { m: ['まったく別の意味'], n: 'メモ', t: T0 } } });
  await page.click('[data-start="quiz"]');
  let cs = await page.$$eval('.choice .txt', es => es.map(e => e.textContent.trim()));
  assert.ok(!cs.some(c => c.includes('まったく別の意味')), '選択肢に利用者の意味が出ている');
  const want = await page.evaluate(() => { const T = window.__tangoTest, s = T.session(); return T.choiceText(s.items[0], true); });
  assert.ok(cs.includes(want));
  await H.pick(page);
  assert.match(await page.textContent('.verdict'), /^正解/);
  assert.deepEqual(await means(page, '.detail'), ['まったく別の意味']);
  assert.equal(await count(page, '.detail [data-edit]'), 1);
  // 解説からも編集できる。編集中は Enter・数字キーで次へ進まない
  await page.click('.detail [data-edit]');
  await page.keyboard.type('1 2');
  assert.equal((await page.textContent('.prog .num')).trim(), '1 / 10');
  await page.fill('#ed-m', '解説で直した'); await page.click('.edbox [type="submit"]');
  assert.deepEqual(await means(page, '.detail'), ['解説で直した']);
  assert.equal((await page.textContent('.prog .num')).trim(), '1 / 10');
  await page.click('[data-next]');
  assert.equal((await page.textContent('.prog .num')).trim(), '2 / 10');
  await H.quit(page);
  await page.click('[data-start="quizR"]');
  assert.ok(!(await page.textContent('.card.q')).includes('解説で直した'), '意味→語の設問に利用者の意味が出ている');
  await done(page);
});

test('結果の誤答の解説からも編集できる（開いた行は開いたまま）', async () => {
  const page = await openWith({});
  await page.click('[data-start="flash"]');
  await H.ans(page, false); while (await count(page, '.prog')) await H.ans(page, true);
  await page.click('.wlist.res summary');
  await page.click('.wlist.res [data-edit]');
  await page.fill('#ed-n', 'けっかのメモ'); await page.click('.edbox [type="submit"]');
  assert.equal(await page.$eval('.wlist.res details', d => d.open), true);
  assert.match(await page.textContent('.wlist.res [data-memo]'), /けっかのメモ/);
  await done(page);
});

test('2つのタブ: 片方の編集・取り消しが、もう片方に伝わる（新しいほうが残る）', async () => {
  const it = D.kobun[0], it2 = D.kobun[1];
  const A = await openWith({}), B = await H.openMore(A, b.html);
  await back(A); await edit(A, ['Aの意味'], 'Aのメモ'); await H.quit(A);
  // B: 別の語を編集して保存しても、A の編集は消えない。B の画面にも A の編集が出る
  await B.click('.tabs [data-tab="list"]');
  await B.click(`[data-open="${it2.id}"]`); await edit(B, ['Bの意味']);
  let s = await H.stored(B);
  assert.deepEqual([s.edits[it.id].m, s.edits[it2.id].m], [['Aの意味'], ['Bの意味']]);
  await B.click(`[data-open="${it.id}"]`);
  assert.deepEqual(await means(B, '.vdet'), ['Aの意味']);
  // B で A の編集を元に戻す → A にも伝わる（A の古い編集で上書きされない）
  await B.click('.vdet [data-edit]'); await B.click('[data-ed="revert"]'); await B.click('[data-ed="revert-yes"]');
  await back(A);
  assert.deepEqual(await means(A), it.m);
  await H.ans(A, true); await H.quit(A); // A が保存しても、消した編集は戻らない
  s = await H.stored(A);
  assert.equal(s.edits[it.id].del, 1);
  assert.deepEqual(s.edits[it2.id].m, ['Bの意味']);
  // 同じ語を両方で編集: 後から保存したほう
  await A.click('.tabs [data-tab="list"]'); await A.click(`[data-open="${it2.id}"]`); await edit(A, ['Aが後から']);
  await B.click('.tabs [data-tab="stats"]'); await B.click('.tabs [data-tab="list"]');
  assert.equal((await B.textContent(`[data-open="${it2.id}"] .vm`)).trim(), 'Aが後から');
  assert.deepEqual(B.errors, []);
  await done(A);
});

test('IDの移行: 付け替えは編集にも当てる。無くなった項目の編集は捨てる', async () => {
  const to = D.kobun[0].id, keep = D.kobun[1].id;
  const mb = H.build({ migrations: H.repoMigrations().concat([{ v: LATEST + 1, map: { 'k:むかしの見出し': to, 'k:消えた語': null, 'k:別の旧名': keep } }]) });
  assert.equal(mb.status, 0, mb.out);
  const page = await openWith({ edits: { 'k:むかしの見出し': { m: ['引き継ぐ意味'], n: 'メモ', t: 5 }, 'k:消えた語': { n: '消える', t: 6 }, 'k:別の旧名': { n: '古いほう', t: 1 }, [keep]: { n: '新しいほう', t: 2 } } }, undefined, mb.html);
  const s = await H.stored(page);
  assert.equal(s.v, LATEST + 1);
  assert.deepEqual(Object.keys(s.edits).sort(), [to, keep].sort());
  assert.deepEqual(s.edits[to], { m: ['引き継ぐ意味'], n: 'メモ', t: 5 });
  assert.equal(s.edits[keep].n, '新しいほう'); // 付け替え先が重なったら、新しいほう
  await back(page);
  assert.deepEqual(await means(page), ['引き継ぐ意味']);
  await done(page);
});

test('バックアップ: 書き出しに編集が入り、別の端末に取り込める。古い控え（edits なし）も読める。形のおかしい編集は捨てて、ほかは残す', async () => {
  const [a, bb, c] = D.kobun.slice(0, 3).map(it => it.id);
  const page = await openWith({ edits: { [a]: { m: ['控えの意味'], n: '控えのメモ', t: T0 }, [bb]: { t: T0, del: 1 } } });
  await page.click('.tabs [data-tab="stats"]'); await H.dm(page);
  await page.click('[data-export]');
  const txt = await page.inputValue('#imp'), j = JSON.parse(txt);
  assert.deepEqual(j.edits[a], { m: ['控えの意味'], n: '控えのメモ', t: T0 });
  await done(page);
  // 別の端末（空の記録）に取り込む
  const q = await H.open(browser, b.html, null);
  await q.click('.tabs [data-tab="stats"]'); await H.dm(q);
  await q.fill('#imp', txt); await q.click('[data-import]');
  assert.match(await q.textContent('#msg'), /編集した意味・メモ 1 件を取り込みました/);
  assert.deepEqual((await H.stored(q)).edits[a], { m: ['控えの意味'], n: '控えのメモ', t: T0 });
  assert.equal((await q.textContent('[data-edcount]')).trim(), '1件');
  // 古い控え（edits なし）: 編集はそのまま残る
  await q.fill('#imp', JSON.stringify({ v: LATEST, prog: { [c]: { c: 1, x: 0, s: 1, t: 5 } }, days: {} })); await q.click('[data-import]');
  assert.match(await q.textContent('#msg'), /^1 語の記録を取り込みました。$/);
  assert.deepEqual((await H.stored(q)).edits[a].m, ['控えの意味']);
  // 形のおかしい編集は読み飛ばす
  await q.fill('#imp', JSON.stringify({ v: LATEST, prog: {}, days: {}, edits: { [bb]: { m: ['よい'], t: T0 + 5 }, [c]: { m: 'だめ', t: 1 }, x: 3 } })); await q.click('[data-import]');
  assert.match(await q.textContent('#msg'), /編集した意味・メモ 1 件を取り込みました。形の正しくない 2 件は読み飛ばしました/);
  let s = await H.stored(q);
  assert.deepEqual([s.edits[bb].m, s.edits[c]], [['よい'], undefined]);
  // 全部消したあとでも、控えから戻せる
  await q.click('[data-edreset="ask"]'); await q.click('[data-edreset="yes"]');
  assert.equal((await q.textContent('[data-edcount]')).trim(), '0件');
  await q.fill('#imp', txt); await q.click('[data-import]');
  s = await H.stored(q);
  assert.deepEqual(s.edits[a].m, ['控えの意味']);
  assert.equal((await q.textContent('[data-edcount]')).trim(), '1件');
  await done(q);
});

test('記録のリセットでは編集は消えない。「編集した意味・メモをすべて消す」は確認と件数つきで、全教材の編集を消す', async () => {
  const a = D.kobun[0].id, e1 = D.eigo[0].id;
  const page = await openWith({ prog: { [a]: { c: 1, x: 0, s: 1, t: 5 } }, edits: { [a]: { m: ['のこる'], t: T0 }, [e1]: { n: 'えいご', t: T0 } } });
  await page.click('.tabs [data-tab="stats"]'); await H.dm(page);
  await page.click('[data-reset="ask"]'); await page.click('[data-reset="yes"]');
  let s = await H.stored(page);
  assert.equal(s.prog[a], undefined);
  assert.deepEqual(s.edits[a].m, ['のこる']);
  assert.equal((await page.textContent('[data-edcount]')).trim(), '2件');
  await page.click('[data-edreset="ask"]');
  assert.match(await page.textContent('.dm .confirm'), /（2件）をすべて消して/);
  await page.click('[data-edreset="no"]');
  assert.deepEqual((await H.stored(page)).edits[a].m, ['のこる']);
  await page.click('[data-edreset="ask"]'); await page.click('[data-edreset="yes"]');
  s = await H.stored(page);
  assert.deepEqual([s.edits[a].del, s.edits[e1].del], [1, 1]);
  assert.equal(await count(page, '[data-edreset]'), 0);
  await page.click('.tabs [data-tab="list"]');
  assert.equal((await page.textContent(`[data-open="${a}"] .vm`)).trim(), D.kobun[0].m.join('／'));
  await done(page);
});

test('長さの上限（意味・メモ各2000字）。単語帳の検索は利用者の意味・メモにも当たる', async () => {
  const it = D.kobun[5];
  const page = await openWith({});
  await page.click('.tabs [data-tab="list"]');
  await page.click(`[data-open="${it.id}"]`);
  await page.click('.vdet [data-edit]');
  await page.evaluate(() => { document.querySelector('#ed-m').value = 'あ'.repeat(1500) + '\n' + 'い'.repeat(1500) + '\nひとつめ'; document.querySelector('#ed-n').value = 'ん'.repeat(2500); });
  await page.click('.edbox [type="submit"]');
  const e = (await H.stored(page)).edits[it.id];
  assert.ok(e.m.join('\n').length <= 2000 && e.m.length === 1 && e.n.length === 2000);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '長い文字で横スクロールが出た');
  await page.click('.vdet [data-edit]'); await page.fill('#ed-m', 'ゆにーくな意味'); await page.fill('#ed-n', 'ごろあわせメモ'); await page.click('.edbox [type="submit"]');
  for (const q of ['ゆにーくな', 'ごろあわせ']) {
    await page.fill('#q', q);
    assert.deepEqual(await page.$$eval('.vrow [data-open]', bs => bs.map(x => x.dataset.open)), [it.id], q);
  }
  await done(page);
});

test('保存できなかったら、編集欄を開いたまま知らせる', async () => {
  const page = await openWith({});
  await back(page);
  await page.click('[data-edit]');
  await page.fill('#ed-m', 'ほぞんできない');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }; });
  await page.click('.edbox [type="submit"]');
  assert.match(await page.textContent('.edmsg'), /保存できませんでした/);
  assert.equal(await page.inputValue('#ed-m'), 'ほぞんできない');
  assert.equal(await count(page, '#savewarn'), 1);
  await done(page);
});

test('全教材で編集できる（関連語を含む）。スマホ幅390・320、ライト・ダークで、横スクロールもエラーも出ない', async () => {
  const page = await H.open(browser, b.html, save({}), PHONE);
  const subs = await page.evaluate(() => Object.keys(window.__tangoTest.DATA).filter(k => !/^eigo\d$/.test(k)));
  for (const k of subs) {
    await page.evaluate(([key, k]) => { const j = JSON.parse(localStorage.getItem(key)); j.prefs.subj = k; j.prefs[k] = { range: 'all', count: '10', order: 'index', rel: k === 'book' ? 'only' : 'no' }; localStorage.setItem(key, JSON.stringify(j)); }, [H.KEY, k]);
    await page.reload(); await page.waitForSelector('#view > *');
    await back(page);
    await edit(page, ['編集 ' + k], 'メモ ' + k);
    assert.deepEqual(await means(page), ['編集 ' + k], k);
    assert.equal(await fits(page), true, k);
    await H.quit(page);
  }
  const ids = Object.keys((await H.stored(page)).edits);
  assert.equal(ids.length, subs.length);
  assert.ok(ids.some(id => id.startsWith('br:')), '関連語の編集が無い');
  await done(page);
  for (const width of [390, 320]) for (const colorScheme of ['light', 'dark']) {
    const p = await openWith({ prefs: { subj: 'eigo', eigo: INDEX } }, { viewport: { width, height: 700 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme });
    const chk = async what => assert.equal(await fits(p), true, `${width}px ${colorScheme}: ${what}で横スクロール`);
    await back(p); await p.click('[data-edit]'); await chk('編集欄');
    await p.fill('#ed-m', '長い意味'.repeat(30) + '\nabcdefghij'.repeat(20)); await p.fill('#ed-n', 'memo'.repeat(60));
    await p.click('.edbox [type="submit"]'); await chk('編集済みの裏面');
    await p.click('[data-edit]'); await p.click('[data-ed="revert"]'); await chk('元に戻すの確認'); await p.click('[data-ed="revert-no"]');
    await H.quit(p);
    await p.click('.tabs [data-tab="list"]'); await chk('単語帳');
    await p.click('.vrow [data-open]'); await chk('単語帳の詳細');
    await p.click('.tabs [data-tab="stats"]'); await H.dm(p); await p.click('[data-edreset="ask"]'); await chk('データ管理');
    await done(p);
  }
});
