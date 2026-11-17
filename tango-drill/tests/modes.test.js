// 既存のデータから機械的に作る出題形式（第4段階）のテスト。実行: node tests/modes.test.js
//   文法「何形に付くか」「活用形」、敬語の種類、用例の意味、英語の語形（派生語）・語法（前置詞）、文学史の作者・成立順（並べ替え）、
//   英語の空所補充の「和訳は解答後に出す」設定、古文常識の行事の誤答。
// 全項目で問題を作り、正答が1つ・選択肢が重ならない・誤答が正答と紛れないことを確かめる。回答はもとの項目のIDに記録されること（新しいIDを作らない）も確かめる
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
const SOME = { 'e:zzz-nothing': { c: 1, x: 0, s: 1, t: 1 } };
const INDEX = { range: 'all', count: '10', order: 'index' };
const openAt = (subj, ctx, extra = {}) => H.open(browser, b.html, JSON.stringify({ v: LATEST, prog: SOME, days: {}, prefs: Object.assign({ subj, [subj]: INDEX }, extra) }), ctx);
const count = (page, sel) => page.locator(sel).count();
const num = async page => (await page.textContent('.prog .num')).trim();
const texts = (page, sel) => page.$$eval(sel, es => es.map(e => e.textContent.trim()));
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sess = page => page.evaluate(() => { const s = window.__tangoTest.session(); return { id: s.items[s.i].id, w: s.items[s.i].w, n: s.items.length, q: s.q && { ans: s.q.ans, opts: s.q.opts, show: s.q.show }, choices: s.choices }; });

test('出題モード: 教材ごとに、作れる形式だけが出る（対象の語数つき）', async () => {
  const page = await openAt('kobun');
  const want = { kobun: ['keigo', 'exm'], book: ['keigo', 'exm'], yomi: [], joshiki: [], bungaku: ['author', 'sei'], waka: [], bunpo: ['gSetsu', 'gKatsu'], eigo: ['exm', 'deriv', 'prep'], eigo1: ['exm', 'deriv', 'prep'] };
  const base = ['flash', 'quiz', 'quizR', 'cloze', 'clozeT', 'typeY'];
  for (const [k, ms] of Object.entries(want)) {
    await page.click(`.switch [data-group="${k.startsWith('eigo') ? 'eigo' : 'kobun'}"]`);
    await page.click(`.subtabs [data-subj="${k}"]`);
    const got = await page.$$eval('.modes [data-start]', bs => bs.map(x => x.dataset.start));
    assert.deepEqual(got.filter(m => !base.includes(m)), ms, k);
    for (const m of ms) assert.match(await page.textContent(`[data-start="${m}"] .c`), /^対象 \d+語/, k + ' ' + m);
    assert.equal(await fits(page), true);
  }
  await done(page);
});

test('全項目で問題を作る: 正答は1つ、選択肢は3つ以上で重ならない。形式ごとの決まりを守る', async () => {
  const page = await openAt('kobun');
  const r = await page.evaluate(() => {
    const T = window.__tangoTest, bad = [], n = {};
    const atoms = s => s.replace(/[（）()〈〉]/g, '・').split('・').filter(Boolean);
    for (const subj of ['bunpo', 'kobun', 'book', 'eigo', 'bungaku']) for (const mode of T.genModes(subj)) {
      const its = T.DATA[subj].filter(it => T.askable(it, mode)); n[subj + '/' + mode] = its.length;
      if (mode === 'sei') continue;
      for (const it of its) for (let k = 0; k < 4; k++) {
        const q = T.GEN[mode].make(it, subj), ts = q.opts.map(o => o.t), ok = q.opts.filter(o => o.ok), ds = q.opts.filter(o => !o.ok).map(o => o.t), E = m => bad.push(`${mode} ${it.w}: ${m} ［${ts.join('｜')}］`);
        if (ok.length !== 1 || ok[0].t !== q.ans) E('正答が1つでない');
        if (new Set(ts).size !== ts.length || ts.some(t => !t || !String(t).trim())) E('選択肢が重なる・空');
        if (ts.length < 3 || ts.length > 4) E('選択肢の数');
        if (mode === 'gSetsu') { const parts = s => s.split(/[・／]/); if (ds.some(d => d.includes('文末') || parts(d).some(x => parts(q.ans).some(y => x.includes(y) || y.includes(x))))) E('正答と重なる接続'); if (/に接続|[然用止体]形接続/.test(q.html)) E('設問に接続が出ている');
          const ctx = (it.note || '') + it.m.join(''); if (ds.some(d => parts(d).some(p => ctx.includes(p)))) E('注に出てくる形が誤答（き＝未然形にも付く、べし＝ラ変型には連体形）'); }
        if (mode === 'gKatsu') { const a = atoms(q.ans); if (ts.includes('○') || ds.some(d => atoms(d).some(x => a.includes(x)))) E('同じ形を含む誤答'); }
        if (mode === 'keigo' && ts.join() !== '尊敬語,謙譲語,丁寧語') E('3つの種類でない');
        if (mode === 'author') { const ps = q.ans.split('・'); if (ds.some(d => d.split('・').some(p => ps.includes(p)) || /[?？ら撰]$|未詳/.test(d)) || /[?？]|未詳/.test(q.ans)) E('作者が紛れる'); }
        if (mode === 'exm') { if (ds.some(d => it.m.includes(d))) E('同じ語の意味が誤答'); }
        if (mode === 'deriv') { const fam = T.familyOf(it).map(f => f[0]); if (ts.slice().sort().join() !== fam.concat(it.w).sort().join()) E('仲間の語でない'); }
        if (mode === 'prep') { const own = T.prepQs(it).map(x => x.prep); if (ds.some(d => own.includes(d))) E('その語のほかの語法の前置詞が誤答'); if (q.html.replace(/<[^>]+>/g, ' ').split(/\s+/).includes(q.ans)) E('設問に正答が出ている'); }
      }
    }
    return { bad, n };
  });
  assert.deepEqual(r.bad.slice(0, 20), []);
  // 対象の語数（データを直すと変わる。減ったら原因を確かめる）
  assert.deepEqual(r.n, { 'bunpo/gSetsu': 55, 'bunpo/gKatsu': 31, 'kobun/keigo': 17, 'kobun/exm': 256, 'book/keigo': 19, 'book/exm': 198, 'eigo/exm': 1760, 'eigo/deriv': 121, 'eigo/prep': 43, 'bungaku/author': 83, 'bungaku/sei': 127 });
  await done(page);
});

test('対象にする・しないの決まり（接続・活用・敬語・作者・成立順・語形・語法）', async () => {
  const page = await openAt('kobun');
  const r = await page.evaluate(() => {
    const T = window.__tangoTest, D = T.DATA, f = (s, w, p) => D[s].filter(it => it.w === w && (!p || p(it)));
    const bun = (w, k) => f('bunpo', w, it => k === undefined || it.k === k)[0];
    return {
      ru: T.setsuOf(bun('る')), na: T.setsuOf(bun('な', '終止形／体言・文末に接続')), shidan: T.setsuOf(bun('四段活用')),
      nari: f('bunpo', 'なり').map(it => [T.setsuOf(it), T.formQs(it).find(q => q.i === 1).ans]),
      ji: T.formQs(bun('じ')).length, ki: T.formQs(bun('き')).map(q => q.i + q.ans).join(' '), kahen: T.formQs(bun('カ行変格活用')).map(q => q.ans).join(' '), shidanQ: T.formQs(bun('四段活用')).length,
      keigoK: Object.fromEntries(['のたまふ', 'まうす', 'たまふ', 'たまはす', 'たまはる', 'はべり', 'たてまつる', 'まゐる', 'きこしめす'].map(w => [w, T.keigoKind(f('kobun', w)[0])])),
      keigoB: Object.fromEntries([301, 306, 309, 310, 311, 313, 315, 321, 325].map(n => [n, T.keigoKind(D.book.find(it => it.num === n))])),
      notKeigo: D.kobun.filter(it => !it.tags.includes('敬語') && T.keigoKind(it)).length,
      authors: Object.fromEntries(['古事記', '古今和歌集', '新古今和歌集', '栄花物語', '夜の寝覚', '拾遺和歌集', '太平記', '竹取物語'].map(w => [w, T.authorOf(f('bungaku', w)[0])])),
      spans: Object.fromEntries(['古事記', '徒然草', '古今和歌集', '竹取物語', '太平記', '紀貫之'].map(w => [w, T.spanOf(f('bungaku', w)[0])])),
      fam: Object.fromEntries(['define', 'courage', 'contempt', 'consult', 'abandon', 'abstract'].map(w => [w, T.familyOf(f('eigo', w)[0])])),
      prep: Object.fromEntries(['consist', 'advance', 'accord', 'dwell', 'contend', 'deprive', 'absorb'].map(w => [w, T.prepQs(f('eigo', w)[0]).map(q => q.toks.map((t, i) => i === q.at ? '[' + t + ']' : t).join(' ') + '=' + q.mean).join(' ／ ')])),
    };
  });
  assert.deepEqual([r.ru, r.na, r.shidan], ['未然形', null, null]); // 意味ごとに接続の違う語と、接続欄の無い語は出さない
  assert.deepEqual(r.nari.sort(), [['終止形', 'なり'], ['連体形・体言', 'なり・に']].sort()); // 同じ語形の2語を、接続欄と活用で区別できている
  assert.equal(r.ji, 0); // じ／じ／じ: 誤答にできる別の形が無い
  assert.equal(r.ki, '0せ 2き 3し 4しか'); // 「○」の形は問わない
  assert.equal(r.kahen, 'こ き く くる くれ こ（こよ）');
  assert.equal(r.shidanQ, 0); // 「a・i・u・u・e・e と活用する」は形の並びではない
  assert.deepEqual(r.keigoK, { 'のたまふ': '尊敬', 'まうす': '謙譲', 'たまふ': null, 'たまはす': null, 'たまはる': null, 'はべり': null, 'たてまつる': null, 'まゐる': null, 'きこしめす': null });
  assert.deepEqual(r.keigoB, { 301: '尊敬', 306: '謙譲', 309: null, 310: null, 311: null, 313: null, 315: null, 321: null, 325: '尊敬' });
  assert.equal(r.notKeigo, 0);
  assert.deepEqual(r.authors, { '古事記': '太安万侶', '古今和歌集': '紀貫之', '新古今和歌集': '藤原定家・藤原家隆', '栄花物語': '赤染衛門', '夜の寝覚': null, '拾遺和歌集': null, '太平記': null, '竹取物語': null });
  assert.deepEqual(r.spans['古事記'], { lo: 712, hi: 712, lab: '712年' });
  assert.equal(r.spans['徒然草'], null); // 確実性が低い年は使わない
  assert.deepEqual([r.spans['古今和歌集'].lo, r.spans['古今和歌集'].hi], [895, 915]); // 「ごろ」は前後10年
  assert.deepEqual([r.spans['竹取物語'].lo, r.spans['竹取物語'].hi, r.spans['竹取物語'].lab], [901, 1000, '10世紀']);
  assert.deepEqual([r.spans['太平記'].lo, r.spans['太平記'].hi], [1360, 1389]);
  assert.equal(r.spans['紀貫之'], null);
  assert.deepEqual(r.fam.define, [['definition', '名'], ['definite', '形']]);
  assert.deepEqual([r.fam.courage, r.fam.contempt, r.fam.consult, r.fam.abandon, r.fam.abstract], [null, null, null, null, null]); // 別系統の語・同じ品詞が2つ・派生語が1つ・見出し語の品詞が2つ
  assert.deepEqual(r.prep, { consist: 'consist [of]=〜から成る ／ consist [in]=〜にある', advance: '[in] advance=前もって', accord: '', dwell: '', contend: '', deprive: 'deprive A [of] B=AからBを奪う', absorb: 'be absorbed [in]=夢中にさせる' });
  await done(page);
});

test('成立順: 並べるのは、時期が25年以上離れた作品だけ（同じ世紀の作品どうしは並べない）。まとめの項目は本の順のまま', async () => {
  const page = await openAt('bungaku');
  const r = await page.evaluate(() => {
    const T = window.__tangoTest, D = T.DATA.bungaku, bad = [], by = w => D.find(x => x.w === w);
    for (const it of D.filter(x => T.askable(x, 'sei'))) for (let k = 0; k < 6; k++) {
      const q = T.seiSet(it, 'bungaku'), ws = q.opts.map(o => o.w);
      if (ws.length < 3 || ws.length > 4 || new Set(ws).size !== ws.length) bad.push(it.w + ': 数 ' + ws.join('→'));
      if (it.pos === '作品') { if (!ws.includes(it.w)) bad.push(it.w + ': 自分が入っていない');
        const sp = ws.map(w => T.spanOf(by(w))); for (let i = 1; i < sp.length; i++) if (!sp[i] || sp[i].lo - sp[i - 1].hi < 25) bad.push(it.w + ': 近い ' + ws.join('→')); }
      else { const seq = it.m[0].split('→').map(x => x.trim()); let at = -1; for (const w of ws) { const i = seq.indexOf(w); if (i <= at) bad.push(it.w + ': 順が違う ' + ws.join('→')); at = i; } }
    }
    return { bad, matome: D.filter(x => x.pos === 'まとめ' && T.askable(x, 'sei')).map(x => x.w), ask: n => T.askable(by(n), 'sei') };
  });
  assert.deepEqual(r.bad.slice(0, 10), []);
  assert.deepEqual(r.matome, ['「鏡物」の成立順', '八代集の成立順', '三大随筆の成立順', '日記の成立順']);
  await done(page);
});

test('文法「何形に付くか」: 設問に区分（未然形接続）を出さない。正答・誤答の表示と記録（もとの項目のIDに）。誤答は同じセットにもう一度出る', async () => {
  const page = await openAt('bunpo');
  await page.click('[data-start="gSetsu"]');
  assert.equal(await num(page), '1 / 10');
  let s = await sess(page);
  const card = await page.textContent('.card.q');
  assert.ok(card.includes(s.w) && !/未然形接続|連用形接続|に接続/.test(card), '設問に接続が出ている: ' + card);
  assert.equal(await count(page, '.choices .choice'), 4);
  assert.equal(await count(page, '.detail'), 0);
  await H.pick(page, true);
  assert.match(await page.textContent('.verdict'), /^正解/);
  assert.match(await page.textContent('.detail'), /に接続/); // 解答後の解説には接続が出る
  assert.equal((await H.stored(page)).prog[s.id].c, 1);
  await page.click('[data-next]');
  s = await sess(page);
  await H.pick(page, false);
  assert.match(await page.textContent('.verdict'), new RegExp('^不正解　正答: ' + s.q.ans.replace(/[「」・]/g, '.')));
  assert.equal(await page.$eval('.choice.correct .txt', e => e.textContent), s.q.ans);
  assert.equal(await num(page), '2 / 11');
  const st = await H.stored(page);
  assert.deepEqual([st.prog[s.id].x, st.prog[s.id].g], [1, 0]);
  assert.ok(Object.keys(st.prog).every(id => /^(e|bunpo):/.test(id)), '新しい形のIDが記録された: ' + Object.keys(st.prog));
  // キー操作: 数字で選び、Enter で次へ
  await page.keyboard.press('Enter');
  assert.equal(await num(page), '3 / 11');
  await page.keyboard.press('2');
  assert.equal(await count(page, '.verdict'), 1);
  await done(page);
});

test('文法「活用形」・敬語の種類（3択）・文学史「作者」・英語「語形」: 1問ずつ答えられる', async () => {
  for (const [subj, mode, n, re] of [['bunpo', 'gKatsu', [3, 4], /この語の(未然|連用|終止|連体|已然|命令)形は？/], ['kobun', 'keigo', [3], /この敬語の種類は？/], ['book', 'keigo', [3], /この敬語の種類は？/],
    ['bungaku', 'author', [4], /この作品の作者（撰者）は？/], ['eigo', 'deriv', [3, 4], /この単語の(名詞|動詞|形容詞|副詞)形は？/]]) {
    const page = await openAt(subj);
    await page.click(`[data-start="${mode}"]`);
    assert.match(await page.textContent('.card.q .qprompt'), re, mode);
    const k = await count(page, '.choices .choice');
    assert.ok(n.includes(k), `${mode}: 選択肢が ${k} 個`);
    if (mode === 'keigo') { await page.keyboard.press('4'); assert.equal(await count(page, '.verdict'), 0, '選択肢の無い番号のキーで答えた'); }
    const s = await sess(page);
    await H.pick(page, true);
    assert.match(await page.textContent('.verdict'), /^正解/);
    assert.equal((await H.stored(page)).prog[s.id].c, 1, mode + ': もとの項目に記録されていない');
    await page.click('[data-next]');
    assert.equal(await num(page), '2 / 10');
    await done(page);
  }
});

test('用例の意味: 用例の中の見出し語を強調し、訳は解答後に出す。語法: 空所は解答後に埋まる', async () => {
  let page = await openAt('kobun');
  await page.click('[data-start="exm"]');
  let s = await sess(page);
  assert.match(await page.textContent('.card.q .qprompt'), new RegExp('この文での「' + s.w + '」の意味は？'));
  assert.equal(await count(page, '.card.q .cloze b.hit'), 1);
  assert.equal(await count(page, '.card.q .tr'), 0, '解答前に訳が出ている');
  await H.pick(page, true);
  assert.equal(await count(page, '.card.q .tr'), 1);
  assert.match(await page.textContent('.card.q'), /この用例は意味[①-⑧]/);
  await done(page);
  page = await openAt('eigo', undefined, { eigo: { range: 'all', count: 'all', order: 'index' } });
  await page.click('[data-start="prep"]');
  s = await sess(page);
  assert.equal(await num(page), '1 / 43');
  assert.equal((await page.textContent('.card.q .blank')).trim(), '＿＿');
  assert.ok(!(await page.textContent('.card.q [data-ph]')).split(/\s+/).includes(s.q.ans));
  await H.pick(page, true);
  assert.equal((await page.textContent('.card.q .blank')).trim(), s.q.ans);
  await done(page);
});

test('成立順の並べ替え: 押した順に番号が付き、もう一度押すと外れる。全部押すと答え合わせができ、解答後は正しい順と年・世紀が出る', async () => {
  const page = await openAt('bungaku', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.click('[data-start="sei"]');
  let s = await sess(page);
  const n = s.q.opts.length, ns = () => texts(page, '.choice.ord .n');
  assert.deepEqual((await texts(page, '.choice.ord .txt')).sort(), s.q.opts.map(o => o.w).sort());
  assert.notDeepEqual(await texts(page, '.choice.ord .txt'), s.q.opts.map(o => o.w), '初めから正しい順に並んでいる');
  assert.equal(await page.$eval('[data-ordcheck]', e => e.disabled), true);
  assert.equal(await page.$eval('[data-ordreset]', e => e.disabled), true);
  // 正しい順の1番目・2番目を押す → ①②。1番目をもう一度押すと外れて、2番目が①になる
  await page.click(`[data-ord="0"]`); await page.click(`[data-ord="1"]`);
  assert.deepEqual((await ns()).filter(Boolean).sort(), ['1', '2']);
  await page.click(`[data-ord="0"]`);
  assert.equal((await page.textContent('[data-ord="1"] .n')).trim(), '1');
  await page.click('[data-ordreset]');
  assert.deepEqual((await ns()).filter(Boolean), []);
  // 逆順に押して答え合わせ → 不正解。正しい順に並べ直して、年・世紀と自分の順を出す
  for (let i = n - 1; i >= 0; i--) await page.click(`[data-ord="${i}"]`);
  assert.equal(await page.$eval('[data-ordcheck]', e => e.disabled), false);
  for (const sel of ['[data-ordcheck]', '[data-ordreset]', '.choice.ord']) assert.ok(await page.$eval(sel, e => e.getBoundingClientRect().height) >= 44);
  assert.ok(await page.$eval('[data-ordcheck]', e => e.getBoundingClientRect().bottom) <= 844, '「答え合わせ」が画面外');
  await page.click('[data-ordcheck]');
  assert.match(await page.textContent('.verdict'), /^不正解/);
  assert.ok((await page.textContent('.verdict')).includes(s.q.opts.map(o => o.w).join(' → ')));
  assert.deepEqual(await page.$$eval('.choice.ord .txt', es => es.map(e => e.firstChild.textContent.trim())), s.q.opts.map(o => o.w));
  assert.match(await page.textContent('.choice.ord small'), /^1番目/);
  assert.equal(await fits(page), true);
  let st = await H.stored(page);
  assert.equal(st.prog[s.id].x, 1);
  await page.click('[data-next]');
  // 正しい順に押す → 正解。キー操作（数字で押す・Enter で答え合わせ）でもできる
  s = await sess(page);
  for (let i = 0; i < s.q.opts.length; i++) await page.keyboard.press(String(s.q.show.indexOf(i) + 1));
  await page.keyboard.press('Enter');
  assert.match(await page.textContent('.verdict'), /^正解/);
  st = await H.stored(page);
  assert.ok(st.prog[s.id].c >= 1);
  assert.ok(Object.keys(st.prog).every(id => /^(e|bungaku):/.test(id)));
  // 途中で再読み込みしても、続きから再開できる
  await page.click('[data-next]');
  const at = await num(page);
  await page.reload(); await page.waitForSelector('#view > *');
  assert.match(await page.textContent('.panel h2'), /文学史：成立順/);
  await page.click('[data-resume="yes"]');
  assert.equal(await num(page), at);
  assert.ok(await count(page, '.choice.ord') >= 3);
  await done(page);
});

test('英語の空所補充: 「和訳は解答後に出す」設定（英語の教材にだけ出る。既定は解答前から出す）', async () => {
  const page = await openAt('eigo');
  assert.equal(await count(page, '#o-tr'), 1);
  await page.click('[data-start="cloze"]');
  assert.equal(await count(page, '[data-cztr]'), 1);
  await H.quit(page);
  await page.selectOption('#o-tr', 'yes');
  assert.equal((await H.stored(page)).prefs.trAfter, 'yes');
  for (const mode of ['cloze', 'clozeT']) {
    await page.click(`[data-start="${mode}"]`);
    assert.equal(await count(page, '[data-cztr]'), 0, mode + ': 解答前に和訳が出ている');
    if (mode === 'cloze') await H.pick(page, true); else { await page.fill('#ans', 'x'); await page.press('#ans', 'Enter'); }
    assert.equal(await count(page, '[data-cztr]'), 1, mode + ': 解答後に和訳が出ない');
    await H.quit(page);
  }
  // 英語のレベル別タブでも同じ設定。古文には出さず、古文の空所補充は変わらない
  await page.click('.subtabs [data-subj="eigo2"]');
  assert.equal(await page.inputValue('#o-tr'), 'yes');
  await page.click('.switch [data-group="kobun"]');
  assert.equal(await count(page, '#o-tr'), 0);
  await page.click('[data-start="cloze"]');
  assert.equal(await count(page, '[data-cztr]'), 1);
  await done(page);
});

test('「今日の学習」の形式に新しい形式を選べる（作れる語だけが出る）', async () => {
  const page = await openAt('kobun');
  await page.selectOption('#o-tmode', 'keigo');
  assert.equal((await page.innerText('[data-start-today]')).replace(/\s+/g, ''), '今日の学習を始める（復習0語＋新出10語）');
  await page.click('[data-start-today]');
  assert.equal(await num(page), '1 / 10');
  assert.equal(await count(page, '.choices .choice'), 3);
  await done(page);
});

test('古文常識: 誤答はほぼ同じ分類から。行事は、足りない分をほかの季節の行事から選ぶ', async () => {
  const page = await openAt('joshiki');
  const r = await page.evaluate(() => {
    const T = window.__tangoTest, D = T.DATA.joshiki; let n = 0, zero = 0, gyoji = 0, gn = 0;
    for (const it of D) { if (!T.askable(it, 'quiz')) continue; for (let k = 0; k < 4; k++) { const cs = T.makeChoices(it, 'quiz', 'joshiki').filter(x => x !== it); n++; if (!cs.some(x => x.pos === it.pos)) zero++;
      if (/の行事$/.test(it.pos)) { gn++; if (cs.every(x => /の行事$/.test(x.pos))) gyoji++; } } }
    return { zero: zero / n, gyoji: gyoji / gn };
  });
  assert.ok(r.zero < 0.02, '同じ分類の誤答が1つも無い問題が ' + (r.zero * 100).toFixed(1) + '%');
  assert.ok(r.gyoji > 0.95, '行事の誤答が行事でない: ' + (r.gyoji * 100).toFixed(1) + '%');
  await done(page);
});

test('スマホ幅390・320、ライト・ダーク: 新しい形式の出題と解答後で、横スクロールもエラーも出ない。選択肢は44px以上', async () => {
  for (const width of [390, 320]) for (const colorScheme of ['light', 'dark']) {
    for (const [subj, mode] of [['bunpo', 'gSetsu'], ['bunpo', 'gKatsu'], ['kobun', 'keigo'], ['book', 'exm'], ['eigo', 'exm'], ['eigo', 'deriv'], ['eigo', 'prep'], ['bungaku', 'author'], ['bungaku', 'sei']]) {
      const page = await openAt(subj, { viewport: { width, height: 700 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme });
      const tag = `${width}px ${colorScheme} ${subj}/${mode}`;
      assert.equal(await fits(page), true, tag + ': ホーム');
      await page.click(`[data-start="${mode}"]`);
      for (let i = 0; i < 3; i++) {
        assert.equal(await fits(page), true, tag + ': 出題');
        assert.ok((await page.$$eval('.choices .choice', es => Math.min(...es.map(e => e.getBoundingClientRect().height)))) >= 44, tag);
        if (mode === 'sei') { const n = await count(page, '.choice.ord'); for (let k = 0; k < n; k++) await page.click(`[data-ord="${k}"]`); await page.click('[data-ordcheck]'); } else await H.pick(page, i !== 1);
        assert.equal(await fits(page), true, tag + ': 解答後');
        assert.ok(await page.$eval('[data-next]', e => e.getBoundingClientRect().bottom) <= 700, tag + ': 「次へ」が画面外');
        await page.click('[data-next]');
      }
      await done(page);
    }
  }
});

test('設定「解答前の漢字・分野」: 隠すと、フラッシュカードの表面と4択（語→意味）の設問に漢字表記と分野のタグを出さない（解答後は出す）。既定は出す', async () => {
  const page = await openAt('kobun', undefined, { kobun: { range: 'tag:敬語', count: '10', order: 'index' } });
  const front = async () => ({ k: await count(page, '.card .kanji'), tags: (await texts(page, '.card .chip')).includes('敬語') });
  await page.click('[data-start="flash"]');
  assert.deepEqual(await front(), { k: 1, tags: true }); // 既定（収録順の先頭の敬語は「うけたまはる（承る）」）
  await H.quit(page);
  await page.selectOption('#o-hidek', 'yes');
  assert.equal((await H.stored(page)).prefs.hideK, 'yes');
  await page.click('[data-start="flash"]');
  assert.deepEqual(await front(), { k: 0, tags: false });
  assert.ok((await texts(page, '.card .chip')).length >= 2, '品詞・レベルまで消えた');
  await page.click('.actions [data-flip]');
  assert.deepEqual(await front(), { k: 1, tags: true }); // 裏面には出す
  await H.quit(page);
  await page.click('[data-start="quiz"]');
  assert.deepEqual(await front(), { k: 0, tags: false });
  await H.pick(page, true);
  assert.equal(await count(page, '.card.q .kanji'), 1); // 解答後は設問にも出す
  await H.quit(page);
  // 英語の教材には、この設定を出さない
  await page.click('.switch [data-group="eigo"]');
  assert.equal(await count(page, '#o-hidek'), 0);
  await done(page);
});
