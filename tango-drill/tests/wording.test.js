// 文言と、アプリ内の「使い方」のテスト。実行: node tests/wording.test.js
//   「このページについて」の文言、出題モードの説明文（科目別）、フッターの収録内容、出題範囲・単語帳・成績・カードのラベル、
//   タッチ端末でのキーボード操作の案内、初めて開いたときの「使い方」と一言
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
const SOME = { 'k:dummy': { c: 1, x: 0, s: 1, t: 1 } }; // 記録が空でない状態（知らない ID の記録が1つ）
const openWith = (prefs, prog = SOME, ctx) => H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs }), ctx);
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const PC = { viewport: { width: 1280, height: 900 } };

// 教材を選ぶ（教科の切り替え → 教材のタブ）
async function goSubj(page, k) {
  const grp = await page.evaluate(k => (k.startsWith('eigo') ? 'eigo' : 'kobun'), k);
  await page.click(`.switch [data-group="${grp}"]`);
  await page.click(`.subtabs [data-subj="${k}"]`);
  await page.click('.tabs [data-tab="home"]');
}
const SUBJS = ['kobun', 'book', 'yomi', 'joshiki', 'bungaku', 'waka', 'bunpo', 'eigo', 'eigo1', 'eigo2', 'eigo3', 'eigo4'];
const text = page => page.evaluate(() => document.body.innerText);

test('「個人用」「URLを他の人に渡さないでください」は、どの教材のどの画面にも出ない。「このページについて」は保存の決まりを書く', async () => {
  const page = await openWith({});
  for (const k of SUBJS) {
    await goSubj(page, k);
    for (const tab of ['home', 'list', 'stats']) {
      await page.click(`.tabs [data-tab="${tab}"]`);
      const t = await text(page);
      assert.ok(!t.includes('個人用'), `${k} ${tab}: 「個人用」が出ている`);
      assert.ok(!t.includes('URLを他の人に渡さないでください'), `${k} ${tab}: URL の文言が出ている`);
    }
  }
  await page.click('.tabs [data-tab="home"]');
  const share = await page.textContent('.share');
  assert.match(share, /このページについて/);
  assert.match(share, /ブラウザ/);
  assert.match(share, /他の人には見えません|ほかの人には見えません/);
  assert.match(share, /バックアップ/);
  assert.match(share, /iPhone/);
  assert.match(share, /ホーム画面に追加/);
  await done(page);
});

// 各教材のホームの出題モード: [{k, t, d}]。k はモードの呼び名（以前の英字の見出し。いまは画面に出さないので、data-start から引く）
const modes = page => page.$$eval('.modes .mode', bs => bs.map(x => ({ k: { flash: 'FLASHCARD', quiz: 'QUIZ A', quizR: 'QUIZ B', cloze: 'CLOZE A', clozeT: 'CLOZE B', typeY: 'TYPE' }[x.dataset.start], t: x.querySelector('.t').textContent, d: x.querySelector('.d').textContent })));
test('出題モードの説明文が、科目の内容に合っている', async () => {
  const page = await openWith({});
  const all = {};
  for (const k of SUBJS) { await goSubj(page, k); all[k] = await modes(page); }
  const d = (k, key) => (all[k].find(m => m.k === key) || {}).d || '';
  const EX = { kobun: true, book: true, eigo: true }; // 用例がある科目
  for (const k of SUBJS) {
    const en = k.startsWith('eigo');
    for (const m of all[k]) {
      if (!en) {
        assert.ok(!/綴り|作文|単語|例文/.test(m.d), `${k} ${m.k}: 英語向けの説明「${m.d}」`);
      }
      if (!EX[k.replace(/\d$/, '')]) assert.ok(!m.d.includes('用例'), `${k} ${m.k}: 用例のない科目に「用例」: ${m.d}`);
    }
  }
  // 古文単語・古文330: 空所補充（記述）はひらがなで答える。逆方向は古文向け
  for (const k of ['kobun', 'book']) {
    assert.match(d(k, 'CLOZE B'), /ひらがな/, k);
    assert.ok(!/作文/.test(d(k, 'QUIZ B')), k);
  }
  assert.deepEqual(all.kobun.map(m => m.d), all.book.map(m => m.d).slice(0, all.kobun.length), '古文単語と古文330で説明が違う');
  // 英語はこれまでどおり
  assert.match(d('eigo', 'CLOZE B'), /綴り/);
  assert.match(d('eigo', 'QUIZ B'), /作文/);
  // 読み: 漢字と読み
  for (const m of all.yomi) assert.ok(!/意味から語|語を見て/.test(m.d), `読み ${m.k}: ${m.d}`);
  assert.match(d('yomi', 'FLASHCARD'), /漢字/);
  assert.match(d('yomi', 'QUIZ B'), /読み/);
  // 文学史・和歌・文法・古文常識は、科目の言葉で書く
  assert.match(d('bungaku', 'FLASHCARD') + d('bungaku', 'QUIZ A') + d('bungaku', 'QUIZ B'), /作品/);
  assert.match(d('waka', 'FLASHCARD') + d('waka', 'QUIZ A') + d('waka', 'QUIZ B'), /枕詞/);
  assert.match(d('bunpo', 'FLASHCARD') + d('bunpo', 'QUIZ A') + d('bunpo', 'QUIZ B'), /助動詞/);
  assert.match(d('joshiki', 'FLASHCARD') + d('joshiki', 'QUIZ A') + d('joshiki', 'QUIZ B'), /古文常識/);
  // どの教材も、説明文が空でない
  for (const k of SUBJS) for (const m of all[k]) assert.ok(m.d.trim().length > 5, `${k} ${m.k}: 説明が空`);
  await done(page);
});

test('フッターの収録内容は、タブと同じ名前・順で全教材を並べ、語数はデータから数える', async () => {
  const page = await openWith({});
  const n = await page.evaluate(() => { const D = window.__tangoTest.DATA; const o = {}; for (const k in D) o[k] = D[k].length; o.rel = window.__tangoTest.BOOKREL.length; return o; });
  const about = (await page.textContent('.about')).trim();
  const want = `収録: 古文単語 ${n.kobun}語／古文330 ${n.book}語（関連語 ${n.rel}語）／読み ${n.yomi}語／古文常識 ${n.joshiki}語／文学史 ${n.bungaku}語／和歌 ${n.waka}語／文法 ${n.bunpo}語／英単語 ${n.eigo}語。`;
  assert.ok(about.startsWith(want), `フッター: ${about}\n期待: ${want}`);
  // タブの名前と同じ
  const tabs = [];
  for (const g of ['kobun', 'eigo']) { await page.click(`.switch [data-group="${g}"]`); tabs.push(...await page.$$eval('.subtabs [data-subj]', bs => bs.map(x => x.firstChild.textContent))); }
  for (const t of tabs.filter(t => !['全レベル', '基礎', '標準', '発展', '最難関'].includes(t))) assert.ok(about.includes(t + ' '), `フッターにタブ「${t}」が無い`);
  await done(page);
});

test('出題範囲・単語帳の絞り込み・成績・カードのラベルが、章や分野の科目に合っている', async () => {
  const page = await openWith({});
  const rangeOpts = () => page.$$eval('#o-range option', os => os.map(o => o.textContent));
  const listAll = async () => { await page.click('.tabs [data-tab="list"]'); const t = await page.$$eval('.filters [data-f="lv"]', bs => bs.map(x => x.textContent)); await page.click('.tabs [data-tab="home"]'); return t; };
  const ALL = { kobun: '全レベル', eigo: '全レベル', book: '全章', joshiki: '全分野', bungaku: '全時代' };
  for (const k of ['kobun', 'book', 'yomi', 'joshiki', 'bungaku', 'waka', 'bunpo', 'eigo']) {
    await goSubj(page, k);
    const opts = await rangeOpts(), lv = await listAll();
    if (ALL[k]) assert.equal(lv[0], ALL[k], `${k}: 単語帳の絞り込みの先頭`);
    if (!['kobun', 'eigo'].includes(k)) {
      assert.ok(!lv.includes('全レベル'), `${k}: 単語帳に「全レベル」`);
      assert.ok(!opts.some(o => /^レベル\d/.test(o)), `${k}: 出題範囲に「レベル◯:」: ${opts}`);
    } else {
      assert.ok(opts.some(o => /^レベル1/.test(o)), `${k}: 出題範囲のレベル`);
    }
    assert.ok(!opts.some(o => /分野: (マーカー|チェックリスト|まとめ|作者)/.test(o)), `${k}: ${opts}`);
    if (k === 'bungaku') {
      assert.ok(opts.includes('本でマーカーが付いている語'), String(opts));
      assert.ok(opts.includes('チェックリストの語'), String(opts));
    }
    if (k === 'waka') assert.ok(opts.includes('本でマーカーが付いている語'), String(opts));
  }
  // 成績: 名前に数字がある科目（古文330の「1章」）と、1つしかない科目（読み）は、番号を付けない
  await page.click('.tabs [data-tab="stats"]');
  const lvLabs = await page.$$eval('.sgrid .panel', ps => Object.fromEntries(ps.map(p => [p.querySelector('h2').firstChild.textContent.trim(), [...p.querySelectorAll('.lvbar .lab')].map(x => x.textContent)])));
  assert.deepEqual(lvLabs['古文330'], ['1章', '2章', '3章', '4章', '敬語']);
  assert.deepEqual(lvLabs['読み'], ['読み']);
  assert.deepEqual(lvLabs['古文単語'], ['1 必修', '2 発展']);
  await done(page);
  // カード: 古文330の敬語の章（No.301）は、チップに「敬語」が1つだけ
  const p2 = await openWith({ subj: 'book', book: { range: 'all', count: '10', order: 'index', rel: 'no', from: '301', to: '301' } });
  await p2.click('[data-start="flash"]');
  const chips = await p2.$$eval('.card .chips .chip', cs => cs.map(c => c.textContent));
  assert.equal(chips.filter(c => c === '敬語').length, 1, `チップ: ${chips}`);
  await H.quit(p2);
  await done(p2);
});

test('キーボード操作の案内は、タッチ端末では出さず、PCでは出す', async () => {
  for (const [ctx, touch] of [[PHONE, true], [PC, false]]) {
    const page = await openWith({ subj: 'kobun' }, SOME, ctx);
    const home = await text(page);
    assert.equal(home.includes('キーボード操作'), !touch, `ホーム（タッチ=${touch}）`);
    await page.click('[data-start="flash"]');
    const tap = (await page.innerText('.card .tap')).trim();
    assert.equal(tap, touch ? 'タップで意味を表示' : 'タップ / Space で意味を表示');
    // 表面は「答えを見る」だけ。めくると「まだ／覚えた」
    const btns = () => page.$$eval('.actions .btn', bs => bs.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(await btns(), touch ? ['答えを見る'] : ['答えを見る Space']);
    await page.click('.card[data-flip]');
    assert.deepEqual(await btns(), touch ? ['まだ', '覚えた'] : ['まだ ← / 1', '覚えた → / 2']);
    await H.ans(page, 1);
    await H.quit(page);
    // 4択の「次へ」の Enter
    await page.click('[data-start="quiz"]');
    await page.click('[data-pick="0"]');
    assert.equal((await page.innerText('[data-next]')).replace(/\s+/g, ' ').trim(), touch ? '次へ' : '次へ Enter');
    await H.quit(page);
    await done(page);
  }
});

test('記録が空で開くと「使い方」が開き、上部に一言が出る。閉じて再読み込みすると閉じたまま', async () => {
  const page = await H.open(browser, b.html, null, PHONE);
  assert.equal(await page.locator('details[data-howto]').count(), 1);
  assert.equal(await page.$eval('details[data-howto]', d => d.open), true, '初めてなのに閉じている');
  const how = await page.innerText('details[data-howto]');
  for (const w of ['教材', '出題設定', 'フラッシュカード', '4択', '空所補充', '習得', '苦手', '単語帳', '成績', 'バックアップ', 'ホーム画面に追加']) assert.ok(how.includes(w), `使い方に「${w}」が無い`);
  assert.equal(await page.locator('[data-first]').count(), 1, '記録が空なのに一言が無い');
  // 一言はホームの上部（出題設定より上）
  const y = await page.evaluate(() => [document.querySelector('[data-first]').getBoundingClientRect().top, document.querySelector('.modes').getBoundingClientRect().top]);
  assert.ok(y[0] < y[1]);
  // 閉じる → 保存 → 再読み込みで閉じたまま
  await page.click('details[data-howto] > summary');
  await page.waitForFunction(() => !document.querySelector('details[data-howto]').open);
  await page.waitForFunction(k => { try { return JSON.parse(localStorage.getItem(k)).prefs.howto === 'closed'; } catch (e) { return false; } }, H.KEY);
  await page.reload();
  await page.waitForSelector('#view > *');
  assert.equal(await page.$eval('details[data-howto]', d => d.open), false, '閉じたのに再読み込みで開いている');
  // 教材を変えて描き直しても閉じたまま
  await page.click('.subtabs [data-subj="book"]');
  assert.equal(await page.$eval('details[data-howto]', d => d.open), false);
  // 開いてから描き直しても、開いたまま（同じページの中では）
  await page.click('details[data-howto] > summary');
  await page.waitForFunction(() => document.querySelector('details[data-howto]').open);
  await page.click('.subtabs [data-subj="kobun"]');
  assert.equal(await page.$eval('details[data-howto]', d => d.open), true);
  await done(page);
});

test('一言のボタンでフラッシュカードが始まる。1問答えたら一言は消え、記録がある人には「使い方」は閉じて出る', async () => {
  const page = await H.open(browser, b.html, null);
  await page.click('[data-first] [data-start-first]');
  assert.equal(await page.locator('.card.flip').count(), 1);
  await H.ans(page, 1);
  await H.quit(page);
  assert.equal(await page.locator('[data-first]').count(), 0);
  await done(page);
  const p2 = await openWith({});
  assert.equal(await p2.$eval('details[data-howto]', d => d.open), false);
  assert.equal(await p2.locator('[data-first]').count(), 0);
  await done(p2);
});
