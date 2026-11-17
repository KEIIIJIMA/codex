// デザインの作り替え（第3段階）で動きが変わった所のテスト。実行: node tests/design.test.js
//   フラッシュカードの判定（めくってから）、「次へ」「まだ／覚えた」の下端固定、学習中はヘッダーとタブを隠す、ヘッダーの固定、
//   条件に合う語が0のときの案内、学習ホームの並びと一覧表への近道、出題範囲の区切りと古文330の章→番号、
//   結果画面の主ボタンと「次のn問へ」、正誤の記号、入力欄の文字の大きさと押せる要素の高さ、用例の見出し語の強調、
//   「使い方」が開いたまま残らないこと、2つのタブでの「前回の続き」、prefs・days が null の保存データ
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
  D = await page.evaluate(() => { const o = {}, T = window.__tangoTest; for (const k in T.DATA) o[k] = T.DATA[k].map(it => ({ id: it.id, w: it.w, k: it.k || '', num: it.num, lv: it.lv, m: it.m.length })); return o; });
  await page.context().close();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async (...pages) => { for (const p of pages) assert.deepEqual(p.errors, [], 'ページ内でエラーが出た'); await pages[0].context().close(); };
const SOME = { 'e:zzz-nothing': { c: 1, x: 0, s: 1, t: 1 } }; // 記録が空でない人（どの語にも当たらない記録）
const INDEX = { range: 'all', count: '10', order: 'index' };
const openWith = (prefs, prog = SOME, ctx = PHONE, days = {}) => H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days, prefs }), ctx);
const count = (page, sel) => page.locator(sel).count();
const num = async page => (await page.textContent('.prog .num')).trim();
const word = async page => (await page.textContent('.card .word')).trim();
const box = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; });
const vh = page => page.evaluate(() => window.innerHeight);
const shown = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.height > 0; });

/* ---- フラッシュカード ---- */
test('フラッシュカード: 表面では判定できない。めくってから「まだ／覚えた」（めくった直後は受け付けない）', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX });
  await page.click('[data-start="flash"]');
  assert.equal(await count(page, '[data-ans]'), 0, '表面に「まだ／覚えた」が出ている');
  assert.equal((await page.innerText('.actions [data-flip]')).trim(), '答えを見る');
  // ボタンでめくる。めくった直後は判定ボタンが押せない（2回押しで記録されない）
  await page.evaluate(() => { const b = document.querySelector('.actions [data-flip]'); b.click(); const a = document.querySelector('[data-ans="1"]'); if (a) a.click(); });
  assert.equal(await count(page, '.card.back'), 1);
  assert.equal(await num(page), '1 / 10', 'めくった直後の2回目の押下で次へ進んだ');
  assert.deepEqual((await H.stored(page)).prog, SOME);
  assert.equal(await page.$eval('[data-ans="1"]', e => e.disabled), true);
  await page.waitForFunction(() => !document.querySelector('[data-ans="1"]').disabled);
  await page.click('[data-ans="1"]');
  assert.equal(await num(page), '2 / 10');
  assert.equal(await count(page, '[data-ans]'), 0);
  // カードのタップでもめくれる
  await page.click('.card[data-flip]');
  assert.equal(await count(page, '.card.back'), 1);
  await page.click('[data-ans="0"]');
  assert.equal(await num(page), '3 / 10');
  const s = await H.stored(page);
  assert.deepEqual([s.prog[D.kobun[0].id].c, s.prog[D.kobun[1].id].x], [1, 1]);
  await done(page);
});

test('フラッシュカード: キー操作も、表面では ←/→/1/2 を受け付けない（Space でめくってから）', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX }, SOME, {});
  await page.click('[data-start="flash"]');
  for (const k of ['ArrowLeft', 'ArrowRight', '1', '2']) await page.keyboard.press(k);
  assert.equal(await num(page), '1 / 10');
  assert.deepEqual((await H.stored(page)).prog, SOME);
  await page.keyboard.press(' ');
  assert.equal(await count(page, '.card.back'), 1);
  await page.waitForFunction(() => !document.querySelector('[data-ans="1"]').disabled);
  await page.keyboard.press('ArrowRight');
  assert.equal(await num(page), '2 / 10');
  await done(page);
});

/* ---- 下端固定・ヘッダー ---- */
test('学習中はヘッダーとタブを隠し、「まだ／覚えた」「次へ」は画面の下端に出る。終わると戻る', async () => {
  const page = await openWith({ subj: 'eigo', eigo: INDEX });
  assert.ok(await shown(page, '.top') && await shown(page, '.tabs'));
  await page.click('[data-start="flash"]');
  assert.equal(await shown(page, '.top'), false, '学習中にヘッダーが出ている');
  assert.equal(await shown(page, '.tabs'), false, '学習中にタブが出ている');
  assert.ok((await box(page, '.prog')).top < 40, '進捗行が上端に無い');
  const h = await vh(page);
  for (let i = 0; i < 6; i++) {
    assert.ok((await box(page, '.actions [data-flip]')).bottom <= h, '「答えを見る」が画面外');
    await page.click('.actions [data-flip]');
    const a = await box(page, '[data-ans="1"]');
    assert.ok(a.bottom <= h && a.top > h / 2, `裏面の「覚えた」が画面の下端に無い（${a.top}〜${a.bottom}）`);
    await page.waitForFunction(() => !document.querySelector('[data-ans="1"]').disabled);
    await page.click('[data-ans="1"]');
  }
  await H.quit(page);
  assert.ok(await shown(page, '.top') && await shown(page, '.tabs'), '中断したのにヘッダーが戻らない');
  // 4択: 解答後、正誤と「次へ」が下端の帯に出る（解説が長くても画面内）
  await page.click('[data-start="quiz"]');
  for (let i = 0; i < 6; i++) {
    await page.click('[data-pick="0"]');
    const n = await box(page, '[data-next]'), v = await box(page, '.verdict');
    assert.ok(n.bottom <= h && n.top > h / 2, `「次へ」が画面の下端に無い（${n.top}〜${n.bottom}）`);
    assert.ok(v.bottom <= h && v.top > h / 2, '正誤の表示が画面外');
    await page.click('[data-next]');
  }
  for (let i = 6; i < 10; i++) { await page.click('[data-pick="0"]'); await page.click('[data-next]'); }
  // 結果画面ではヘッダーとタブが出る
  assert.match(await page.textContent('#view'), /\/ 10 問/);
  assert.ok(await shown(page, '.top') && await shown(page, '.tabs'), '結果画面でヘッダーが出ない');
  await done(page);
});

test('ヘッダーは長いページを送っても上に固定され、ページの末尾には下余白がある', async () => {
  const page = await openWith({ subj: 'kobun' });
  await page.click('.tabs [data-tab="list"]');
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForFunction(() => window.scrollY > 2900);
  const t = await box(page, '.top');
  assert.ok(Math.abs(t.top) < 1, 'ヘッダーの固定が外れた: top=' + t.top);
  assert.ok(t.h <= 125, 'スマホのヘッダーが高い: ' + t.h);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const gap = await page.evaluate(() => window.innerHeight - document.querySelector('footer.about').getBoundingClientRect().bottom);
  assert.ok(gap >= 40, 'ページ末尾の下余白が無い: ' + gap);
  await done(page);
});

/* ---- 学習ホーム ---- */
test('学習ホーム: 出題モードが出題設定より上で、1画面目に開始ボタンがある。文法は一覧表への近道がある', async () => {
  const page = await openWith({ subj: 'kobun' });
  const subjs = await page.evaluate(() => Object.keys(window.__tangoTest.DATA));
  for (const k of subjs) {
    await page.click(`.switch [data-group="${k.startsWith('eigo') ? 'eigo' : 'kobun'}"]`);
    await page.click(`.subtabs [data-subj="${k}"]`);
    const y = await page.evaluate(() => { const t = s => document.querySelector(s).getBoundingClientRect(); return { mode: t('.modes .mode').bottom, modes: t('.modes').top, panel: t('#o-range').top, sw: document.documentElement.scrollWidth, iw: window.innerWidth }; });
    assert.ok(y.modes < y.panel, k + ': 出題モードが出題設定より下');
    assert.ok(y.mode < 844, k + ': 最初の開始ボタンが1画面目に無い（' + y.mode + '）');
    assert.equal(y.sw, y.iw, k + ': 横スクロールが出る');
    // 英字の見出しは出さない
    assert.equal(await count(page, '.mode .k'), 0);
  }
  await page.click('.switch [data-group="kobun"]');
  await page.click('.subtabs [data-subj="kobun"]');
  assert.deepEqual(await page.$$eval('.modes .mode', bs => bs.map(x => x.dataset.start)), ['flash', 'quiz', 'quizR', 'cloze', 'clozeT']);
  assert.equal(await count(page, '[data-jump]'), 0);
  await page.click('.subtabs [data-subj="bunpo"]');
  assert.match(await page.innerText('[data-jump]'), /一覧表（\d+表）/);
  await page.click('[data-jump]');
  await page.waitForFunction(() => { const r = document.querySelector('#tables').getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight / 2; });
  await done(page);
});

test('条件に合う語が0のとき、案内が出題モードのすぐ上に出て、画面内に送られる', async () => {
  const page = await openWith({ subj: 'kobun', kobun: { range: 'weak', count: '10', order: 'smart' } });
  await page.evaluate(() => document.querySelector('.modes .mode:last-child').scrollIntoView({ block: 'start' }));
  await page.click('[data-start="quizR"]');
  assert.equal(await count(page, '.prog'), 0);
  const z = page.locator('[data-zero]');
  assert.equal(await z.count(), 1);
  assert.match(await z.innerText(), /当てはまる語がありません/);
  assert.equal(await z.getAttribute('role'), 'alert');
  assert.ok(await page.evaluate(() => document.querySelector('[data-zero]').nextElementSibling.classList.contains('modes')), '案内が出題モードの直前に無い');
  await page.waitForFunction(() => { const r = document.querySelector('[data-zero]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
  const y = await page.evaluate(() => [document.querySelector('[data-zero]').getBoundingClientRect().bottom, document.querySelector('[data-start="quizR"]').getBoundingClientRect().top]);
  assert.ok(y[1] - y[0] < 300, '案内が押したボタンから遠い');
  // 範囲を変えて始めれば案内は消える
  await page.selectOption('#o-range', 'all');
  await page.click('[data-start="flash"]');
  await H.quit(page);
  assert.equal(await count(page, '[data-zero]'), 0);
  await done(page);
});

test('出題範囲は「状態」「章・レベル」「分野」に区切る。古文330は章を選ぶと番号欄にその範囲が入る', async () => {
  const page = await openWith({ subj: 'kobun' });
  const groups = () => page.$$eval('#o-range optgroup', gs => gs.map(g => g.label));
  assert.deepEqual(await groups(), ['状態', 'レベル', '分野']);
  // 値と選択肢の数は変えない
  assert.deepEqual(await page.$$eval('#o-range option', os => os.slice(0, 4).map(o => o.value)), ['auto', 'notok', 'weak', 'new']);
  await page.click('.subtabs [data-subj="book"]');
  assert.deepEqual((await groups()).slice(0, 2), ['状態', '章']);
  const range = lv => { const a = D.book.filter(it => it.lv === lv).map(it => it.num); return [String(Math.min(...a)), String(Math.max(...a))]; };
  await page.selectOption('#o-range', 'lv2');
  assert.deepEqual([await page.inputValue('#o-from'), await page.inputValue('#o-to')], range(2));
  let s = await H.stored(page);
  assert.deepEqual([s.prefs.book.range, s.prefs.book.from, s.prefs.book.to], ['lv2', ...range(2)]);
  await page.selectOption('#o-range', 'lv3');
  assert.deepEqual([await page.inputValue('#o-from'), await page.inputValue('#o-to')], range(3));
  // 章の選択をやめたら、章から入った番号は消す（手で入れた番号は残す）
  await page.selectOption('#o-range', 'all');
  assert.deepEqual([await page.inputValue('#o-from'), await page.inputValue('#o-to')], ['', '']);
  await page.fill('#o-from', '5'); await page.dispatchEvent('#o-from', 'change');
  await page.selectOption('#o-range', 'weak');
  assert.equal(await page.inputValue('#o-from'), '5');
  // 番号欄はほかの欄と同じ見た目（幅・高さ）
  const f = await box(page, '#o-from');
  assert.ok(f.h >= 44 && f.w >= 120, `番号欄が小さい: ${f.w}×${f.h}`);
  await done(page);
});

/* ---- 結果 ---- */
test('結果: 誤答があれば「間違えたn語をもう一度」が主ボタン。全問正解なら「次のn問へ」が主ボタンで、前の回に出た語を除いて出題する', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX });
  const run = async wrongAt => { const ws = []; for (let i = 0; i < 10; i++) { ws.push(await word(page)); await H.ans(page, i === wrongAt ? 0 : 1); } return ws; };
  await page.click('[data-start="flash"]');
  const first = await run(2);
  assert.deepEqual(first, D.kobun.slice(0, 10).map(it => it.w));
  assert.deepEqual(await page.$$eval('.row .btn.acc', bs => bs.map(x => x.dataset.retry)), ['wrong']);
  assert.match(await page.innerText('[data-retry="same"]'), /^次の ?10 ?問へ$/);
  // 間違えた語の行は、押すと解説が開く
  assert.equal(await count(page, '.wlist.res > li'), 1);
  await page.click('.wlist.res summary');
  assert.ok((await page.innerText('.wlist.res li')).includes('①') || await count(page, '.wlist.res li .means') === 1);
  await page.click('[data-retry="same"]');
  const second = await run(-1);
  assert.deepEqual(second, D.kobun.slice(10, 20).map(it => it.w), '収録順なのに続きの10語が出ない');
  // 全問正解: 主ボタンは「次の10問へ」。円は緑、「全問正解」
  assert.deepEqual(await page.$$eval('.row .btn.acc', bs => bs.map(x => x.dataset.retry)), ['same']);
  assert.match(await page.innerText('.score'), /全問正解/);
  assert.match(await page.innerText('.score'), /今日 ?20 ?問/);
  await page.click('[data-retry="same"]');
  const third = await run(-1);
  assert.deepEqual(third, D.kobun.slice(20, 30).map(it => it.w), '3回目が、1回目と2回目に出た語を除いていない');
  await done(page);
});

test('結果: 除くと0語になるときは、同じ設定でもう一度（同じ語）', async () => {
  const page = await openWith({ subj: 'yomi', yomi: { range: 'all', count: 'all', order: 'index' } });
  await page.click('[data-start="flash"]');
  const n = D.yomi.length;
  for (let i = 0; i < n; i++) await H.ans(page, 1);
  assert.equal((await page.innerText('[data-retry="same"]')).trim(), '同じ設定でもう一度');
  await page.click('[data-retry="same"]');
  assert.equal(await num(page), `1 / ${n}`);
  await done(page);
});

/* ---- 正誤の記号・読み上げ ---- */
test('4択: 解答後、正答の番号は「✓」、選んだ誤答は「✕」になり、読み上げ用の文字が付く', async () => {
  const page = await openWith({ subj: 'eigo', eigo: INDEX });
  await page.click('[data-start="quizR"]');
  const it = await page.evaluate(() => { const T = window.__tangoTest; return T.DATA.eigo[0].w; });
  const texts = await page.$$eval('.choice .txt', es => es.map(e => e.textContent.trim()));
  const right = texts.indexOf(it), wrong = right === 0 ? 1 : 0;
  assert.deepEqual(await page.$$eval('.choice .n', es => es.map(e => e.textContent.trim())), ['1', '2', '3', '4']);
  // 英単語には lang="en"
  assert.deepEqual(await page.$$eval('.choice .txt', es => es.map(e => e.lang)), ['en', 'en', 'en', 'en']);
  await page.click(`[data-pick="${wrong}"]`);
  const ns = await page.$$eval('.choice .n', es => es.map(e => e.textContent.trim()));
  assert.equal(ns[right], '✓'); assert.equal(ns[wrong], '✕');
  assert.equal(ns.filter(x => /^[1-4]$/.test(x)).length, 2);
  assert.match(await page.$eval('.choice.correct', e => e.textContent), /正答/);
  assert.match(await page.$eval('.choice.wrong', e => e.textContent), /あなたの答え/);
  assert.match(await page.textContent('.verdict'), /^不正解　正答: /);
  assert.match(await page.textContent('#live'), /不正解/);
  assert.equal(await page.getAttribute('#view', 'aria-live'), null);
  assert.equal(await page.$eval('.detail .word', e => e.lang), 'en');
  await done(page);
});

test('語→意味の選択肢は意味ごとの塊（.mm）に分かれ、文字は変わらない', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX });
  await page.click('[data-start="quiz"]');
  const r = await page.evaluate(() => { const T = window.__tangoTest, S = [...document.querySelectorAll('.choice .txt')];
    return S.map(e => ({ t: e.textContent, mm: [...e.querySelectorAll('.mm')].map(x => x.textContent) })); });
  for (const c of r) { assert.ok(c.mm.length >= 1); assert.equal(c.mm.join(''), c.t); assert.ok(c.mm.slice(0, -1).every(x => x.endsWith('／'))); }
  await done(page);
});

test('解説: 用例の中の見出し語を強調する。意味が1つの語は番号を出さない', async () => {
  const page = await openWith({ subj: 'kobun', kobun: INDEX });
  await page.click('.tabs [data-tab="list"]');
  const r = await page.evaluate(() => { const T = window.__tangoTest; let hit = 0, tot = 0, bad = [];
    for (const it of T.DATA.kobun) for (const e of (it.exs || [[it.ex]])) { if (!e[0]) continue; tot++; if (T.findForm(it, e[0])) hit++; }
    return { hit, tot }; });
  assert.ok(r.hit / r.tot > 0.9);
  await page.fill('#q', 'をかし');
  await page.click('.vrow >> nth=0');
  const hits = await page.$$eval('.vdet .ex .q', qs => qs.map(q => ({ t: q.textContent, b: [...q.querySelectorAll('b.hit')].map(x => x.textContent) })));
  assert.ok(hits.length >= 2);
  for (const h of hits) { assert.equal(h.b.length, 1, '強調が無い: ' + h.t); assert.ok(h.b[0].startsWith('をかし')); }
  // 意味が1つの語: 番号の丸を出さない
  const one = D.kobun.find(it => it.m === 1);
  await page.fill('#q', one.w);
  await page.click(`.vrow [data-open="${one.id}"]`);
  assert.equal(await page.$eval('.vdet .means li', li => getComputedStyle(li, '::before').display), 'none');
  await done(page);
});

/* ---- 入力欄・押せる要素 ---- */
test('入力欄の文字は16px以上、押せる要素は高さ44px以上', async () => {
  const page = await openWith({ subj: 'book' }, { 'b:1': { c: 0, x: 2, s: 0, t: 1 } });
  const small = sel => page.$$eval(sel, es => es.filter(e => e.getBoundingClientRect().height > 0).map(e => ({ tag: e.tagName, id: e.id || e.className || e.textContent.trim().slice(0, 8), fs: parseFloat(getComputedStyle(e).fontSize), h: Math.round(e.getBoundingClientRect().height * 10) / 10 })));
  const checkTap = async where => { for (const e of await small('button, select, summary, input:not([type=hidden]), [role=button]')) assert.ok(e.h >= 44, `${where}: ${e.tag} ${e.id} の高さ ${e.h}px`); };
  const checkFont = async where => { for (const e of await small('select, input, textarea')) assert.ok(e.fs >= 16, `${where}: ${e.tag} ${e.id} の文字 ${e.fs}px`); };
  await checkTap('ホーム'); await checkFont('ホーム');
  await page.click('[data-start="clozeT"]');
  await checkTap('空所補充'); await checkFont('空所補充');
  assert.equal(await page.getAttribute('#ans', 'enterkeyhint'), 'done');
  assert.ok(await page.getAttribute('#ans', 'aria-label'));
  const f = await box(page, '#ans'), s = await box(page, '.typeform .btn');
  assert.ok(Math.abs(f.top - s.top) < 2 && s.left > f.right - 1, '入力欄と「答え合わせ」が1行に並んでいない');
  await H.quit(page);
  await page.click('.tabs [data-tab="list"]');
  await checkTap('単語帳'); await checkFont('単語帳');
  await page.click('.tabs [data-tab="stats"]');
  await page.click('details[data-dm] > summary');
  await checkTap('成績'); await checkFont('成績');
  await done(page);
});

test('成績: 選択中の教材が先頭、教材の並びはタブと同じ。苦手ワードの ✕ と ◯ は色を分ける。データ管理は折りたたみ', async () => {
  const page = await openWith({ subj: 'book' }, { 'b:1': { c: 3, x: 2, s: 0, t: 1 } });
  await page.click('.tabs [data-tab="stats"]');
  const names = await page.$$eval('.sgrid .panel h2', hs => hs.map(h => h.firstChild.textContent.trim()));
  // 選択中の教材 → その苦手ワード → ほかの教材（タブと同じ順）
  const tabs = await page.evaluate(() => { const o = []; for (const g of ['kobun', 'eigo']) { document.querySelector(`.switch [data-group="${g}"]`).click(); o.push(...[...document.querySelectorAll('.subtabs [data-subj]')].map(x => x.firstChild.textContent.trim())); } document.querySelector('.switch [data-group="kobun"]').click(); document.querySelector('.subtabs [data-subj="book"]').click(); document.querySelector('.tabs [data-tab="stats"]').click(); return o; });
  assert.deepEqual(names.slice(0, 2), ['古文330', '古文330の苦手ワード']);
  const want = tabs.filter(n => n !== '古文330' && !['全レベル', '基礎', '標準', '発展', '最難関'].includes(n)).concat('英単語');
  assert.deepEqual(names.slice(2), want);
  // ほかの教材は閉じた1行（押すと内訳が開く）
  assert.equal(await page.$eval('.sgrid details.panel', d => d.open), false);
  // 学習の記録（要約とグラフ）は教材の内訳より上
  const y = await page.evaluate(() => [document.querySelector('.act').getBoundingClientRect().top, document.querySelector('.sgrid').getBoundingClientRect().top]);
  assert.ok(y[0] < y[1]);
  const c = await page.$eval('.wlist li', li => ({ x: getComputedStyle(li.querySelector('.wx')).color, o: getComputedStyle(li.querySelector('.wo')).color, t: li.querySelector('.wx').textContent + li.querySelector('.wo').textContent }));
  assert.notEqual(c.x, c.o); assert.equal(c.t.replace(/\s/g, ''), '✕2◯3');
  assert.equal(await page.$eval('details[data-dm]', d => d.open), false);
  await page.click('details[data-dm] > summary');
  await page.click('[data-export]');
  assert.equal(await page.$eval('details[data-dm]', d => d.open), true, '操作のあとの描き直しで閉じた');
  assert.ok((await page.inputValue('#imp')).includes('"b:1"'));
  await done(page);
});

test('アイコン・theme-color・短い名前が head にある（外部ファイルなし）', async () => {
  const page = await openWith({});
  const h = await page.evaluate(() => ({ icon: (document.querySelector('link[rel="icon"]') || {}).href || '', touch: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '',
    theme: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content), title: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content,
    capable: document.querySelectorAll('meta[name="apple-mobile-web-app-capable"]').length }));
  assert.match(h.icon, /^data:image\/svg\+xml/);
  assert.match(h.touch, /^data:image\/png;base64,/);
  assert.equal(h.theme.length, 2);
  assert.equal(h.title, '単語ドリル');
  assert.equal(h.capable, 0);
  await done(page);
});

/* ---- 前の段階の残り ---- */
test('初回に「使い方」を閉じないまま学習しても、ホームに戻ると閉じている', async () => {
  const page = await H.open(browser, b.html, null, PHONE);
  assert.equal(await page.$eval('details[data-howto]', d => d.open), true);
  await page.waitForTimeout(100); // 描画直後の toggle の知らせを待つ
  await page.click('[data-start-first]');
  await H.ans(page, 1);
  await H.quit(page);
  assert.equal(await page.$eval('details[data-howto]', d => d.open), false, '学習のあとも「使い方」が開いたまま');
  // 自分で開いたら、描き直しても開いたまま
  await page.click('details[data-howto] > summary');
  await page.waitForFunction(() => document.querySelector('details[data-howto]').open);
  await page.waitForTimeout(100);
  await page.click('.subtabs [data-subj="book"]');
  assert.equal(await page.$eval('details[data-howto]', d => d.open), true);
  await done(page);
});

test('2つのタブ: 片方で進行中の学習は、もう片方に「前回の続き」として出さない。閉じたあと・時間がたったあとは出す', async () => {
  const a = await openWith({ subj: 'kobun', kobun: INDEX });
  await a.click('[data-start="flash"]');
  await H.ans(a, 1);
  const saved = JSON.parse(await H.raw(a, SKEY));
  assert.equal(typeof saved.tab, 'string'); assert.equal(typeof saved.at, 'number');
  const b2 = await H.openMore(a, b.html);
  assert.equal(await count(b2, '[data-resume]'), 0, '別のタブで進行中の学習が「前回の続き」に出た');
  // 同じタブの再読み込みでは出る
  await a.reload();
  await a.waitForSelector('#view > *');
  assert.equal((await a.textContent('[data-resume="yes"]')).trim(), '続きから（2問目）');
  await a.click('[data-resume="yes"]');
  // 書いたタブが止まってから時間がたっていれば（保存時刻が古い）、別のタブにも出す
  await a.evaluate(k => { const j = JSON.parse(localStorage.getItem(k)); j.at -= 10 * 60 * 1000; localStorage.setItem(k, JSON.stringify(j)); }, SKEY);
  const c = await H.openMore(a, b.html);
  assert.equal(await count(c, '[data-resume="yes"]'), 1, '古いセッションが別のタブに出ない');
  await c.close();
  // 書いたタブを閉じたら、すぐ別のタブに出す
  await H.ans(a, 1);
  await a.close();
  const d = await H.openMore(b2, b.html);
  assert.equal((await d.textContent('[data-resume="yes"]')).trim(), '続きから（3問目）');
  await done(b2, d);
});

test('保存データの prefs や days が null でも起動する', async () => {
  for (const bad of [{ prefs: null }, { days: null }, { prefs: null, days: null }, { prefs: 'x', days: [] }]) {
    const page = await H.open(browser, b.html, JSON.stringify(Object.assign({ v: LATEST, prog: { [D.kobun[0].id]: { c: 1, x: 0, s: 1, t: 1 } }, days: {}, prefs: {} }, bad)), PHONE);
    assert.equal(await count(page, '.modes .mode'), 5, JSON.stringify(bad));
    await page.click('[data-start="flash"]');
    await H.ans(page, 1);
    const s = await H.stored(page);
    assert.equal(typeof s.prefs, 'object'); assert.ok(s.prefs && !Array.isArray(s.days));
    assert.equal(Object.values(s.days).reduce((x, y) => x + y, 0), 1);
    assert.equal(s.prog[D.kobun[0].id].c, 1);
    await done(page);
  }
});
