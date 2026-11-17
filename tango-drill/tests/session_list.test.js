// 単語帳の検索・一覧と、学習セッションの保護のテスト。実行: node tests/session_list.test.js
//   単語帳の検索欄（日本語の変換入力・英字の直接入力・カーソル位置）、「さらに表示」、
//   学習の途中の確認（中断・タブ・教科と教材の切り替え）、再読み込みのあとの続きからの再開、選択中の教材タブの位置
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

const SKEY = H.KEY + '-session';
let browser, b, LATEST, D;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
  const page = await H.open(browser, b.html, null);
  D = await page.evaluate(() => { const o = {}, T = window.__tangoTest; for (const k in T.DATA) o[k] = T.DATA[k].map(it => ({ id: it.id, w: it.w, k: it.k || '' })); return o; });
  await page.context().close();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async page => { assert.deepEqual(page.errors, [], 'ページ内でエラーが出た'); await page.context().close(); };
const openWith = (prefs, prog = {}) => H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs }));
const count = (page, sel) => page.locator(sel).count();
const num = async page => (await page.textContent('.prog .num')).trim();
const countText = async page => (await page.textContent('.count')).trim();
const sess = async page => JSON.parse(await H.raw(page, SKEY));
const word = async page => (await page.textContent('.card .word')).trim();
// 検索欄の状態: 文字、最初に置いた目印が残っているか（＝作り直されていないか）、フォーカス、カーソル位置
const mark = page => page.evaluate(() => { document.querySelector('#q').__mark = 1; });
const qState = page => page.evaluate(() => { const q = document.querySelector('#q'); return { v: q.value, same: q.__mark === 1, focus: document.activeElement === q, pos: q.selectionStart }; });
const rows = page => page.$$eval('.vrow .vw', els => els.length);

/* ---- 単語帳の検索欄 ---- */
test('検索欄: 日本語の変換入力（変換中は一覧を変えず、確定で絞り込む。入力欄は作り直さない）', async () => {
  const page = await openWith({ subj: 'kobun' });
  await page.click('.tabs [data-tab="list"]');
  const before = await countText(page);
  await page.focus('#q');
  await mark(page);
  const cdp = await page.context().newCDPSession(page);
  for (const t of ['w', 'を', 'をk', 'をか', 'をかs', 'をかし']) {
    await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
    assert.equal(await page.inputValue('#q'), t);
    assert.equal(await countText(page), before, '変換中に一覧が変わった');
    assert.ok((await qState(page)).same, '変換中に入力欄が作り直された');
  }
  await cdp.send('Input.insertText', { text: 'をかし' });
  assert.deepEqual(await qState(page), { v: 'をかし', same: true, focus: true, pos: 3 });
  const n = await rows(page);
  assert.ok(n > 0 && n < 50, '絞り込まれていない: ' + n);
  assert.equal(await countText(page), `全 ${n} 語中 ${n} 語を表示`);
  assert.ok((await page.$$eval('.vrow .vw', els => els.map(e => e.textContent))).some(s => s.includes('をかし')));
  // 続けてもう一度変換する（確定した文字の後ろに足す）
  await cdp.send('Input.imeSetComposition', { text: 'げ', selectionStart: 1, selectionEnd: 1 });
  assert.equal(await rows(page), n);
  await cdp.send('Input.insertText', { text: 'げ' });
  assert.deepEqual(await qState(page), { v: 'をかしげ', same: true, focus: true, pos: 4 });
  assert.ok(await rows(page) < n);
  await done(page);
});

test('検索欄: 確定の知らせ（compositionend）の後に input が来る順でも、前に来る順でも、確定した文字で絞り込む', async () => {
  for (const endFirst of [false, true]) {
    const page = await openWith({ subj: 'kobun' });
    await page.click('.tabs [data-tab="list"]');
    const before = await countText(page);
    await page.focus('#q');
    await mark(page);
    await page.evaluate(endFirst => {
      const q = document.querySelector('#q'), ev = (type, init) => q.dispatchEvent(new (type === 'input' ? InputEvent : CompositionEvent)(type, Object.assign({ bubbles: true }, init)));
      ev('compositionstart', { data: '' });
      for (const t of ['あ', 'あh', 'あは', 'あはr', 'あはれ']) { q.value = t; ev('input', { isComposing: true, data: t }); }
      window.__mid = document.querySelector('.count').textContent.trim();
      if (endFirst) { ev('compositionend', { data: 'あはれ' }); ev('input', { isComposing: false, data: 'あはれ' }); }
      else { ev('input', { isComposing: true, data: 'あはれ' }); ev('compositionend', { data: 'あはれ' }); }
    }, endFirst);
    assert.equal(await page.evaluate(() => window.__mid), before, '変換中に一覧が変わった');
    const s = await qState(page);
    assert.equal(s.v, 'あはれ');
    assert.ok(s.same && s.focus);
    const n = await rows(page);
    assert.ok(n > 0 && n < 50, '絞り込まれていない: ' + n);
    assert.ok((await page.$$eval('.vrow .vw', els => els.map(e => e.textContent))).every(x => x.length > 0));
    await done(page);
  }
});

test('検索欄: 英字の直接入力（1文字ごとに絞り込む。入力欄・フォーカス・カーソル位置は保たれる）', async () => {
  const page = await openWith({ subj: 'eigo' });
  await page.click('.tabs [data-tab="list"]');
  await page.focus('#q');
  await mark(page);
  await page.keyboard.type('aban');
  assert.deepEqual(await qState(page), { v: 'aban', same: true, focus: true, pos: 4 });
  assert.ok((await page.$$eval('.vrow .vw', els => els.map(e => e.textContent))).some(s => s.startsWith('abandon')));
  const n = await rows(page);
  assert.ok(n >= 1 && n < 20);
  // 途中に打ち込む
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('x');
  assert.deepEqual(await qState(page), { v: 'abxan', same: true, focus: true, pos: 3 });
  assert.equal(await count(page, '.empty'), 1);
  assert.equal(await countText(page), '全 0 語中 0 語を表示');
  await page.keyboard.press('Backspace');
  assert.deepEqual(await qState(page), { v: 'aban', same: true, focus: true, pos: 2 });
  assert.equal(await rows(page), n);
  // 絞り込みのチップを押しても、検索欄は作り直さない（文字が残る）
  await page.click('.fchip[data-f="st"][data-v="new"]');
  const s = await qState(page);
  assert.ok(s.same && s.v === 'aban');
  assert.equal(await page.getAttribute('.fchip[data-f="st"][data-v="new"]', 'aria-pressed'), 'true');
  assert.equal(await rows(page), n);
  await done(page);
});

/* ---- 単語帳の一覧 ---- */
test('単語帳: 英語（全レベル）の全語を「さらに表示」で順に出せる', async () => {
  const page = await openWith({ subj: 'eigo' });
  await page.click('.tabs [data-tab="list"]');
  const N = D.eigo.length;
  assert.equal(N, 2138);
  let shown = 200;
  for (;;) {
    assert.equal(await rows(page), shown);
    assert.equal(await countText(page), `全 ${N} 語中 ${shown} 語を表示`);
    if (shown === N) break;
    assert.match(await page.textContent('[data-more]'), /さらに表示/);
    await page.click('[data-more]');
    shown = Math.min(N, shown + 200);
  }
  assert.equal(await count(page, '[data-more]'), 0);
  const ws = await page.$$eval('.vrow [data-open]', els => els.map(e => e.dataset.open));
  assert.deepEqual(ws, D.eigo.map(it => it.id)); // 収録順に、全語
  // 語を開いても、表示した範囲は保つ
  await page.click(`.vrow [data-open="${D.eigo[N - 1].id}"]`);
  assert.equal(await count(page, '.vdet'), 1);
  assert.equal(await rows(page), N);
  // 絞り込みを変えたら、先頭の200語に戻る
  await page.click('.fchip[data-f="lv"][data-v="1"]');
  assert.equal(await rows(page), 200);
  assert.match(await countText(page), /^全 \d+ 語中 200 語を表示$/);
  // 教材を変えても、先頭の200語から
  await page.click('.fchip[data-f="lv"][data-v="all"]');
  await page.click('[data-more]');
  assert.equal(await rows(page), 400);
  await page.click('.switch [data-group="kobun"]');
  await page.click('.subtabs [data-subj="kobun"]');
  assert.equal(await rows(page), 200);
  assert.equal(await countText(page), `全 ${D.kobun.length} 語中 200 語を表示`);
  await page.click('[data-more]');
  assert.equal(await rows(page), D.kobun.length);
  assert.equal(await count(page, '[data-more]'), 0);
  await done(page);
});

/* ---- 学習の途中の確認 ---- */
const startFlash = async (prefs = { subj: 'kobun', kobun: { range: 'all', count: '10', order: 'random' } }) => {
  const page = await openWith(prefs);
  await page.click('[data-start="flash"]');
  return page;
};
// 学習中はヘッダー（教科・教材）とタブを隠すので、途中で離れる操作は「中断」だけになる
test('学習の途中の「中断」は、確認を出す（「続ける」で元の問題に戻る）。学習中はタブ・教科・教材の切り替えを出さない', async () => {
  const page = await startFlash();
  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.dismiss(); });
  for (let i = 0; i < 3; i++) await H.ans(page, 1);
  const w = await word(page);
  for (const sel of ['.tabs [data-tab="list"]', '.tabs [data-tab="stats"]', '.tabs [data-tab="home"]', '.switch [data-group="eigo"]', '.subtabs [data-subj="book"]', '.subtabs [data-subj="kobun"]'])
    assert.equal(await page.locator(sel).isVisible(), false, sel + ': 学習中に出ている');
  const tries = ['[data-quit]', '[data-quit]'];
  for (const sel of tries) {
    await page.click(sel);
    assert.equal(await count(page, '[data-leave="yes"]'), 1, sel + ': 確認が出ない');
    assert.equal(await num(page), '4 / 10', sel + ': 確認の前にセッションが終わった');
    assert.ok(await page.locator('[data-leave="yes"]').isVisible());
    await page.click('[data-leave="no"]');
    assert.equal(await count(page, '[data-leave]'), 0);
    assert.equal(await num(page), '4 / 10');
    assert.equal(await word(page), w);
    assert.equal(await page.getAttribute('html', 'data-subj'), 'kobun');
  }
  assert.equal(dialogs, 0, 'ブラウザの confirm を使った');
  // 「中断する」でホームへ戻り、タブが使える
  await page.click('[data-quit]');
  await page.click('[data-leave="yes"]');
  assert.equal(await count(page, '.prog'), 0);
  await page.click('.tabs [data-tab="list"]');
  assert.equal(await count(page, '[data-leave]'), 0);
  assert.equal(await count(page, '#q'), 1);
  assert.equal(await H.raw(page, SKEY), null, '中断したのに、進行中のセッションが残っている');
  assert.equal(Object.keys((await H.stored(page)).prog).length, 3); // 回答済みの記録は残る
  await done(page);
});

test('確認のあとの「中断する」: ホームへ戻り、教科・教材を切り替えられる', async () => {
  let page = await startFlash();
  await H.ans(page, 1);
  await page.click('[data-quit]');
  await page.click('[data-leave="yes"]');
  assert.equal(await count(page, '[data-start="flash"]'), 1);
  assert.equal(await count(page, '[data-resume]'), 0);
  await done(page);
  page = await startFlash();
  await H.quit(page);
  await page.click('.subtabs [data-subj="book"]');
  assert.equal(await count(page, '[data-leave]'), 0);
  assert.equal(await page.getAttribute('.subtabs [data-subj="book"]', 'aria-selected'), 'true');
  assert.equal(await count(page, '[data-start="flash"]'), 1);
  assert.equal((await H.stored(page)).prefs.subj, 'book');
  await page.click('[data-start="flash"]');
  await H.quit(page);
  await page.click('.switch [data-group="eigo"]');
  assert.equal(await page.getAttribute('html', 'data-subj'), 'eigo');
  await done(page);
});

test('確認を出しても、入力中の答えは消えない。結果画面と、学習していないときは確認を出さない', async () => {
  const page = await openWith({ subj: 'kobun', kobun: { range: 'all', count: '10', order: 'random' } });
  await page.click('.tabs [data-tab="list"]'); // 学習していないとき
  assert.equal(await count(page, '[data-leave]'), 0);
  assert.equal(await count(page, '#q'), 1);
  await page.click('.tabs [data-tab="home"]');
  await page.click('[data-start="clozeT"]');
  await page.fill('#ans', 'あいう');
  await page.click('[data-quit]');
  assert.equal(await count(page, '[data-leave="yes"]'), 1);
  assert.equal(await page.inputValue('#ans'), 'あいう');
  await page.click('[data-leave="no"]');
  assert.equal(await page.inputValue('#ans'), 'あいう');
  await page.click('[data-quit]');
  await page.click('[data-leave="yes"]');
  // 最後まで答えた結果画面
  await page.click('[data-start="flash"]');
  for (let i = 0; i < 10; i++) await H.ans(page, 1);
  assert.match(await page.textContent('#view'), /10 \/ 10 問/);
  assert.equal(await H.raw(page, SKEY), null);
  await page.click('.tabs [data-tab="stats"]');
  assert.equal(await count(page, '[data-leave]'), 0);
  assert.equal(await count(page, '.sgrid'), 1);
  await done(page);
});

/* ---- 再読み込みのあとの再開 ---- */
test('学習の途中で再読み込みすると、「続きから（◯問目）」で同じ並びの続きから再開できる', async () => {
  const page = await startFlash();
  const ids = (await sess(page)).ids;
  assert.equal(ids.length, 10);
  const byId = Object.fromEntries(D.kobun.map(it => [it.id, it]));
  assert.equal(await word(page), byId[ids[0]].w);
  for (let i = 0; i < 3; i++) await H.ans(page, i !== 1);
  assert.deepEqual((await sess(page)).res, [1, 0, 1]);
  await page.reload();
  await page.waitForSelector('#view > *');
  assert.equal(await count(page, '.prog'), 0); // 勝手には始めない
  assert.equal((await page.textContent('[data-resume="yes"]')).trim(), '続きから（4問目）');
  assert.equal((await page.textContent('[data-resume="no"]')).trim(), 'やめる');
  // もう一度読み込んでも、まだ選べる
  await page.reload();
  await page.waitForSelector('#view > *');
  await page.click('[data-resume="yes"]');
  for (let i = 3; i < 10; i++) {
    assert.equal(await num(page), `${i + 1} / 10`);
    assert.equal(await word(page), byId[ids[i]].w, `${i + 1}問目の語が違う`);
    await H.ans(page, 1);
  }
  // 結果は、再読み込みの前の回答も合わせて数える（10問中9問）
  assert.match(await page.textContent('#view'), /9 \/ 10 問/);
  assert.equal(await page.locator('.wlist > li').count(), 1);
  assert.ok((await page.textContent('.wlist li')).includes(byId[ids[1]].w));
  assert.equal(await H.raw(page, SKEY), null);
  const s = await H.stored(page);
  assert.equal(Object.keys(s.prog).length, 10);
  for (const id of ids) assert.equal(s.prog[id].c + s.prog[id].x, 1, id + ': 回答が二重に記録された');
  assert.equal(s.session, undefined); // 学習記録の保存データには入れない
  await page.reload();
  await page.waitForSelector('#view > *');
  assert.equal(await count(page, '[data-resume]'), 0);
  await done(page);
});

test('再開: 4択で答えた直後（解説の表示中）に再読み込みしたら、次の問題から。「やめる」で消える', async () => {
  const page = await openWith({ subj: 'eigo', eigo: { range: 'all', count: '10', order: 'random' } });
  await page.click('[data-start="quiz"]');
  const ids = (await sess(page)).ids;
  await page.click('[data-pick="0"]');
  await page.click('[data-next]');
  await page.click('[data-pick="1"]'); // 2問目に答えたところ（「次へ」はまだ）
  await page.reload();
  await page.waitForSelector('#view > *');
  assert.equal((await page.textContent('[data-resume="yes"]')).trim(), '続きから（3問目）');
  await page.click('[data-resume="yes"]');
  assert.equal(await num(page), '3 / 10');
  assert.equal(await word(page), ids[2].slice(2));
  assert.equal(await count(page, '.choice'), 4);
  const s = await H.stored(page);
  assert.equal(Object.values(s.prog).reduce((n, r) => n + r.c + r.x, 0), 2);
  // 別の教材を開いたまま読み込んでも、再開すると元の教材に戻る
  await page.evaluate(k => { const j = JSON.parse(localStorage.getItem(k)); j.prefs.subj = 'kobun'; localStorage.setItem(k, JSON.stringify(j)); }, H.KEY);
  await page.reload();
  await page.waitForSelector('#view > *');
  assert.equal(await page.getAttribute('html', 'data-subj'), 'kobun');
  await page.click('[data-resume="yes"]');
  assert.equal(await page.getAttribute('html', 'data-subj'), 'eigo');
  assert.equal(await num(page), '3 / 10');
  assert.equal(await word(page), ids[2].slice(2));
  // やめる
  await page.reload();
  await page.waitForSelector('#view > *');
  await page.click('[data-resume="no"]');
  assert.equal(await count(page, '[data-resume]'), 0);
  assert.equal(await H.raw(page, SKEY), null);
  assert.equal(await count(page, '[data-start="flash"]'), 1);
  await done(page);
});

test('再開: 新しく始めたら前の途中のセッションは消える。壊れた保存内容・無くなった語は、再開を出さない', async () => {
  const page = await startFlash();
  await H.ans(page, 1);
  const first = await sess(page);
  await page.reload();
  await page.waitForSelector('#view > *');
  assert.equal(await count(page, '[data-resume="yes"]'), 1);
  await page.click('[data-start="quiz"]');
  const second = await sess(page);
  assert.equal(second.mode, 'quiz');
  assert.deepEqual(second.res, []);
  await H.quit(page);
  assert.equal(await count(page, '[data-resume]'), 0);
  for (const bad of ['{', '[]', 'null', JSON.stringify(Object.assign({}, first, { ids: ['k:無い語'] })), JSON.stringify(Object.assign({}, first, { res: new Array(10).fill(1) })),
    JSON.stringify(Object.assign({}, first, { mode: 'x' })), JSON.stringify(Object.assign({}, first, { subj: 'x' })), JSON.stringify(Object.assign({}, first, { res: 'x' }))]) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SKEY, bad]);
    await page.reload();
    await page.waitForSelector('#view > *');
    assert.equal(await count(page, '[data-resume]'), 0, bad.slice(0, 40));
    assert.equal(await count(page, '[data-start="flash"]'), 1);
  }
  await done(page);
});

test('再開: 途中のセッションの語のIDも、記録の移行と同じ対応で付け替える', async () => {
  const [a, c] = D.kobun, migs = H.repoMigrations().concat([{ v: LATEST + 1, map: { 'k:むかしのID': a.id } }]);
  const b2 = H.build({ migrations: migs });
  assert.equal(b2.status, 0, b2.out);
  const page = await H.open(browser, b2.html, JSON.stringify({ v: LATEST, prog: {}, days: {}, prefs: { subj: 'kobun' } }));
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SKEY, JSON.stringify({ v: LATEST, subj: 'kobun', mode: 'flash', ids: [c.id, 'k:むかしのID', c.id], res: [1] })]);
  await page.reload();
  await page.waitForSelector('#view > *');
  await page.click('[data-resume="yes"]');
  assert.equal(await num(page), '2 / 3');
  assert.equal(await word(page), a.w);
  await done(page);
});

/* ---- 教材のタブ ---- */
const selBox = page => page.evaluate(() => { const b = document.querySelector('.subtabs [aria-selected="true"]').getBoundingClientRect(); return { l: b.left, r: b.right, y: window.scrollY, w: window.innerWidth }; });
const inView = (box, msg) => { assert.ok(box.l >= 0 && box.r <= box.w, `${msg}: 選択中のタブが画面の外（左 ${box.l}・右 ${box.r}）`); assert.equal(box.y, 0, msg + ': 縦に動いた'); };
test('教材のタブ: 選択中のタブは、読み込み直後も、教材・教科を切り替えたあとも画面の中にある（幅390px）', async () => {
  let page = await openWith({ subj: 'kobun' });
  const subs = await page.$$eval('.subtabs [data-subj]', els => els.map(e => e.dataset.subj));
  assert.ok(subs.length >= 4);
  await done(page);
  for (const subj of subs.slice(-3)) {
    page = await openWith({ subj });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.reload();
    await page.waitForSelector('#view > *');
    assert.equal(await page.getAttribute(`.subtabs [data-subj="${subj}"]`, 'aria-selected'), 'true');
    inView(await selBox(page), subj + ' 読み込み直後');
    // 英語に切り替える → 「全レベル」（左端）が見える
    await page.click('.switch [data-group="eigo"]');
    assert.equal(await page.getAttribute('.subtabs [data-subj="eigo"]', 'aria-selected'), 'true');
    inView(await selBox(page), subj + ' → 英語');
    await page.click('.switch [data-group="kobun"]');
    inView(await selBox(page), subj + ' → 英語 → 古文');
    // 右端の教材を選ぶ → 選んだタブが見える
    await page.evaluate(() => { document.querySelector('.subtabs').scrollLeft = 1e4; });
    await page.click(`.subtabs [data-subj="${subs[subs.length - 1]}"]`);
    inView(await selBox(page), '右端の教材');
    await page.evaluate(() => { document.querySelector('.subtabs').scrollLeft = 0; });
    await page.click('.tabs [data-tab="list"]');
    inView(await selBox(page), '画面のタブを切り替えたあと');
    await done(page);
  }
});

test('教材のタブ: 下までスクロールしているとき、一覧を描き直してもページの縦位置は動かない', async () => {
  const page = await openWith({ subj: 'kobun' });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('.tabs [data-tab="list"]');
  await page.evaluate(() => { document.querySelector('.subtabs').scrollLeft = 1e4; }); // 選択中のタブ（左端）を隠しておく
  await page.locator('.vrow:nth-child(60) [data-open]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  const y = await page.evaluate(() => window.scrollY);
  assert.ok(y > 1000);
  await page.click('.vrow:nth-child(60) [data-open]');
  assert.equal(await page.locator('.vdet').count(), 1);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - y) < 5, '縦に動いた');
  // 画面全体を描き直す操作（成績タブ → 苦手の登録など）でも、タブの列は横にだけ動く
  await page.evaluate(() => window.__tangoTest.render());
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - y) < 5, '縦に動いた');
  const box = await page.evaluate(() => { const b = document.querySelector('.subtabs [aria-selected="true"]').getBoundingClientRect(), c = document.querySelector('.subtabs').getBoundingClientRect(); return b.left >= c.left && b.right <= c.right; });
  assert.ok(box, '選択中のタブが列の外');
  await done(page);
});
