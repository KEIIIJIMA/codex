// 空所補充の照合（空所の位置・対象語数・同じ語の伏せ字）と、古文330の見出し語の表示のテスト。
// 実行: node tests/cloze.test.js
// アプリの中の照合（findForm）は、ページのテスト用の窓口 window.__tangoTest から呼ぶ。
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');
const K = require('./katsuyo');

let browser, b, LATEST;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async page => { assert.deepEqual(page.errors, [], 'ページ内でエラーが出た'); await page.context().close(); };

const WEAK = { c: 0, x: 1, s: 0, t: 1 };
// 科目 subj を開いた状態で始める。o.prefs は出題設定、o.weak は苦手にしておく項目ID
function openAt(subj, o = {}) {
  const prog = {};
  for (const id of o.weak || []) prog[id] = WEAK;
  const prefs = { subj, [subj]: Object.assign({ range: 'all', count: 'all', order: 'index', rel: 'no', from: '', to: '' }, o.prefs) };
  return H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs }));
}
// 苦手にした項目だけを出題する
const openWeak = (subj, ids) => openAt(subj, { weak: ids, prefs: { range: 'weak' } });
const texts = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent));
const num = async page => (await page.textContent('.prog .num')).trim();

// 科目 subj の全項目・全用例について、アプリが作る空所を取り出す
const collect = (page, subj) => page.evaluate(subj => {
  const T = window.__tangoTest;
  return T.DATA[subj].map(it => ({
    id: it.id, w: it.w, k: it.k || '', pos: it.pos,
    exs: (it.exs || (it.ex ? [[it.ex, it.tr]] : [])).map(e => {
      const f = T.findForm(it, e[0]);
      return { ex: e[0], f: f && { pre: f.pre, hit: f.hit, post: f.post, base: f.base, ys: f.ys, mpre: f.mpre, mpost: f.mpost } };
    }),
  }));
}, subj);

// 空所1つを、活用表（tests/katsuyo.js）で確かめる。問題があれば理由を返す
function checkBlank(it, e) {
  const f = e.f, forms = K.kanaForms(it.w, it.pos), bad = [];
  if (f.pre + f.hit + f.post !== e.ex) bad.push('前後をつなぐと用例に戻らない');
  if (!K.readings(it.w).includes(f.base)) bad.push('終止形「' + f.base + '」が見出し語に無い');
  if (!Array.isArray(f.ys) || !f.ys.length) bad.push('読みが無い');
  for (const y of f.ys || []) {
    if (!forms.has(y)) bad.push('「' + y + '」は見出し語の活用形ではない');
    else if (!K.writes(f.hit, y, it.k)) bad.push('空所「' + f.hit + '」は「' + y + '」の書き方ではない');
  }
  // いちばん長く一致する形を優先しているか（もっと長い形が用例の別の場所にあれば、そちらが見出し語）
  for (const y of forms.keys()) if (y.length > f.hit.length && e.ex.includes(y)) bad.push('もっと長い形「' + y + '」が用例にある');
  // 空所のほかに同じ語（2字以上の形）が残っていない
  for (const y of forms.keys()) if (y.length >= 2 && (f.mpre + '\n' + f.mpost).includes(y)) bad.push('空所のほかに「' + y + '」が見えている');
  if (f.mpre.replace(/＿＿/g, '').length > f.pre.length || f.mpost.replace(/＿＿/g, '').length > f.post.length) bad.push('伏せ字の前後が元の用例と合わない');
  return bad;
}

for (const [subj, name, min] of [['book', '古文330', 315], ['kobun', '古文単語', 325]]) {
  test(name + ': 全用例で、空所にした部分が見出し語の活用形になっている。対象は ' + min + '語以上', async t => {
    const page = await openAt(subj);
    const items = await collect(page, subj);
    const bad = [], out = [];
    let nEx = 0, nHit = 0;
    for (const it of items) {
      for (const e of it.exs) {
        nEx++;
        if (!e.f) continue;
        nHit++;
        const why = checkBlank(it, e);
        if (why.length) bad.push(`${it.id}「${it.w}」 ${e.f.pre}【${e.f.hit}】${e.f.post} … ${why.join('／')}`);
      }
      if (!it.exs.some(e => e.f)) out.push(`${it.id}「${it.w}」`);
    }
    t.diagnostic(`${name}: 対象 ${items.length - out.length} / ${items.length} 語、空所を作れた用例 ${nHit} / ${nEx}`);
    if (out.length) t.diagnostic('対象にならない語: ' + out.join(' '));
    assert.deepEqual(bad, []);
    assert.ok(items.length - out.length >= min, `対象が ${items.length - out.length} 語しかない（対象にならない語: ${out.join(' ')}）`);
    await done(page);
  });
}

// 短い語・漢字で書かれた用例・併記の見出し語など、位置を取り違えやすい用例。空所は目で確かめたもの
const PINNED = {
  kobun: [
    ['k:え〜打消', 'え答へずなり侍りつ(徒然)', '', 'え'],
    ['k:な〜そ', 'な起こしたてまつりそ(宇治拾遺)', '', 'な'],
    ['k:ゐる|居る', 'ゐて待つ', '', 'ゐ'],
    ['k:ゐる|居る', '都に出でず、年ごろ山里にゐたり。', '都に出でず、年ごろ山里に', 'ゐ'],
    ['k:ぐす|具す', '供人を具して出で給ふ', '供人を', '具し'],
    ['k:ねぶ|老ぶ', 'ねびたる尼君の、いと清げなる', '', 'ねび'],
    ['k:あふ|逢ふ', 'みをつくしても逢はむとぞ思ふ(百人一首)', 'みをつくしても', '逢は'],
    ['k:あく|飽く', '見れど飽かぬ君の御姿かな', '見れど', '飽か'],
    ['k:ねんず|念ず', '念じて見給ふ', '', '念じ'],
    ['k:みゆ|見ゆ', '女、男に見えずして年経にけり', '女、男に', '見え'],
    ['k:こころう|心得', '心得ぬことなり', '', '心得'],
    ['k:こころづきなし|心付きなし', '心づきなきことなり', '', '心づきなき'],
    ['k:ところせし|所狭し', '所せき御勢ひにて、世の人みなかしこまる。', '', '所せき'],
    ['k:たまふ|給ふ', 'かくなむ思ひ給ふる。', 'かくなむ思ひ', '給ふる'],
    ['k:たのむ|頼む', '頼めし人は来ず', '', '頼め'],
    ['k:さぶらふ・さうらふ|候ふ', 'かかる事なむさぶらひし', 'かかる事なむ', 'さぶらひ'],
    ['k:よし・よろし・わろし・あし', 'あしき心をば持つべからず。', '', 'あしき'],
    ['k:ひとやりならず|人遣りならず', 'ひとやりならぬ道なれば', '', 'ひとやりならぬ'],
    ['k:こころあり|心あり', '心あらむ人に見せばや', '', '心あら'],
    ['k:よ|世', 'わがよふるうちに、またかかる事あらじ', 'わが', 'よ'],
    ['k:とし|疾し', 'とく帰り給へ', '', 'とく'],
    ['k:あたらし|惜し', 'あたら夜の月と花とを同じくはあはれ知れらむ人に見せばや(後撰)', '', 'あたら'],
    ['k:おぼろけなり|朧けなり', 'おぼろけの人にはあらず', '', 'おぼろけ'],
  ],
  book: [
    ['b:38', '空のけしきも変はりぬ', '空の', 'けしき'],
    ['b:3', 'いと苦しけれど、ねんじてゐたり', 'いと苦しけれど、', 'ねんじ'],
    ['b:9', '姫君、物も言はで泣きゐたり', '姫君、物も言はで泣き', 'ゐ'],
    ['b:47', 'え答へずなり侍りつ(徒然)', '', 'え'],
    ['b:50', 'いかでか人に語るべき', '', 'いかでか'],
    ['b:50', 'いかでこのかぐや姫を得てしがな(竹取)', '', 'いかで'],
    ['b:124', 'この文のて、いとうつくし。', 'この文の', 'て'],
    ['b:135', 'さ思ひて待ちゐたり', '', 'さ'],
    ['b:143', 'などか来ざりし', '', 'などか'],
    ['b:237', 'よのなかをまだ思ひ知らぬほどなり', '', 'よのなか'],
    ['b:246', 'ゆめ人に語るな', '', 'ゆめ'],
    ['b:251', '人をおきてて、高き木に登せて、梢を切らせしに(徒然)', '人を', 'おきて'],
    ['b:300', '悲しさに涙とどめあへず', '悲しさに涙とどめ', 'あへず'],
    ['b:307', 'いづこにかおはする', 'いづこにか', 'おはする'],
    ['b:307', '君は物思ひしておはします', '君は物思ひして', 'おはします'],
    ['b:310', 'さなむ思ひたまふる', 'さなむ思ひ', 'たまふる'],
    ['b:328', '中宮のぎやうけいありて、人々騒ぐ', '中宮の', 'ぎやうけい'],
  ],
};
for (const subj of ['kobun', 'book']) {
  test((subj === 'book' ? '古文330' : '古文単語') + ': 取り違えやすい用例の空所の位置', async () => {
    const page = await openAt(subj);
    const items = new Map((await collect(page, subj)).map(it => [it.id, it]));
    for (const [id, ex, pre, hit] of PINNED[subj]) {
      const it = items.get(id);
      assert.ok(it, id + ' が無い');
      const e = it.exs.find(x => x.ex === ex);
      assert.ok(e, `${id} に用例「${ex}」が無い（用例を変えたときは、このテストの表も直す）`);
      assert.ok(e.f, `${id}「${ex}」が空所補充の対象にならない`);
      assert.deepEqual([e.f.pre, e.f.hit], [pre, hit], `${id}「${ex}」`);
    }
    await done(page);
  });
}

test('同じ語が用例にもう一度出るときは、残りも伏せる（空所は最初の1か所）', async () => {
  let page = await openAt('kobun');
  let items = new Map((await collect(page, 'kobun')).map(it => [it.id, it]));
  const f1 = items.get('k:かつ|且つ').exs.find(e => e.ex === 'かつ消えかつ結びて(方丈記)').f;
  assert.deepEqual([f1.pre, f1.hit, f1.post, f1.mpre, f1.mpost], ['', 'かつ', '消えかつ結びて(方丈記)', '', '消え＿＿結びて(方丈記)']);
  const f2 = items.get('k:あふ|逢ふ').exs.find(e => e.ex === '久しくあはざりし友にあひぬ').f;
  assert.deepEqual([f2.pre, f2.hit, f2.mpost], ['久しく', 'あは', 'ざりし友に＿＿ぬ']); // 別の活用形でも伏せる
  await done(page);
  // 英単語
  page = await openAt('eigo');
  items = new Map((await collect(page, 'eigo')).map(it => [it.id, it]));
  const en = (id, ex) => { const e = items.get(id).exs.find(x => x.ex === ex); assert.ok(e && e.f, id + ' の用例が無い: ' + ex); return e.f; };
  let f = en('e:negative', 'A negative number multiplied by another negative number gives a positive number.');
  assert.deepEqual([f.pre, f.hit, f.mpost], ['A ', 'negative', ' number multiplied by another ＿＿ number gives a positive number.']);
  f = en('e:income', "Income tax rates depend on a person's total annual income.");
  assert.deepEqual([f.hit, f.mpost], ['Income', " tax rates depend on a person's total annual ＿＿."]);
  f = en('e:patient', 'The doctor was patient with every worried patient who came in.');
  assert.deepEqual([f.hit, f.mpost], ['patient', ' with every worried ＿＿ who came in.']);
  // 英単語の全用例: 空所のほかに、見出し語そのものが単語として残っていない。伏せ字が無ければ元の文のまま
  const left = [];
  for (const it of items.values()) for (const e of it.exs) {
    if (!e.f) continue;
    const esc = it.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('\\b' + esc + '\\b', 'i').test(e.f.mpre + '\n' + e.f.mpost)) left.push(it.w + ': ' + e.ex);
    if (!/＿＿/.test(e.f.mpre + e.f.mpost)) assert.deepEqual([e.f.mpre, e.f.mpost], [e.f.pre, e.f.post]);
  }
  assert.deepEqual(left, []);
  await done(page);
});

test('画面: 伏せ字は答える前だけ。答えたあとは元の用例を見せる', async () => {
  const page = await openWeak('kobun', ['k:かつ|且つ']);
  await page.click('[data-start="cloze"]');
  assert.equal(await num(page), '1 / 1');
  assert.equal(await page.textContent('.cloze'), '＿＿＿＿消え＿＿結びて(方丈記)');
  const i = (await texts(page, '.choice .txt')).indexOf('かつ');
  assert.ok(i >= 0, '選択肢に「かつ」が無い');
  await page.click(`[data-pick="${i}"]`);
  assert.equal(await page.textContent('.cloze'), 'かつ消えかつ結びて(方丈記)');
  assert.match(await page.textContent('.verdict'), /^正解/);
  await done(page);
});

test('古文330: 語の表示に「(漢字)」「〔言い換え〕」の添え書きが出ない（見出し語・関連語の全件）', async () => {
  const page = await openAt('book');
  const d = await page.evaluate(() => {
    const T = window.__tangoTest, pick = it => ({ id: it.id, w: it.w, k: it.k || '', pos: it.pos, note: it.note || '' });
    return { book: T.DATA.book.map(pick), rel: T.BOOKREL.map(pick) };
  });
  const noted = d.book.concat(d.rel).filter(it => /[()〔〕]/.test(it.w)).map(it => it.id + '「' + it.w + '」');
  assert.deepEqual(noted, []);
  const by = Object.fromEntries(d.book.concat(d.rel).map(it => [it.id, it]));
  // 漢字は漢字表記の欄（k）だけに出る
  assert.deepEqual([by['b:38'].w, by['b:38'].k], ['けしき', '気色']);
  assert.deepEqual([by['b:3'].w, by['b:3'].k], ['ねんず', '念ず']);
  assert.deepEqual([by['b:328'].w, by['b:328'].k], ['ぎやうがう・ぎやうけい・ごかう', '行幸・行啓・御幸']);
  // 同じ語形の2語は、見出しは同じで品詞が違う
  assert.deepEqual([by['b:309'].w, by['b:309'].pos, by['b:310'].w, by['b:310'].pos], ['たまふ', '動ハ四', 'たまふ', '動ハ下二']);
  // 関連語の添え書きは、漢字表記の欄に回す
  assert.deepEqual([by['br:4:0'].w, by['br:4:0'].k], ['しのぶ', '偲ぶ']);
  assert.deepEqual([by['br:32:0'].w, by['br:32:0'].k], ['かたちをかふ', '〔やつす〕']);
  assert.deepEqual([by['br:169:0'].w, by['br:169:0'].k], ['うれへ', '憂へ・愁へ']);
  assert.match(by['br:4:0'].note, /^「しのぶ」（No\.4）の関連語$/);
  await done(page);
});

test('古文330: フラッシュカードと単語帳で、漢字が二重に出ない', async () => {
  const page = await openAt('book', { prefs: { from: '38', to: '38' } });
  await page.click('[data-start="flash"]');
  assert.equal(await page.textContent('.card .word'), 'けしき');
  assert.equal(await page.textContent('.card .kanji'), '気色');
  await H.quit(page);
  await page.click('.tabs [data-tab="list"]');
  // 章ごと（200語の上限に掛からない）に全行を見る
  let rows = 0;
  for (const lv of ['1', '2', '3', '4', '5']) {
    await page.click(`.fchip[data-f="lv"][data-v="${lv}"]`);
    const ws = await page.$$eval('.vrow .vw', els => els.map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('')));
    rows += ws.length;
    assert.deepEqual(ws.filter(w => /[()〔〕]/.test(w)), []);
  }
  assert.equal(rows, 330);
  // 関連語の一覧（No.4 しのぶ → 関連語 しのぶ・偲ぶ）
  await page.click('.fchip[data-f="lv"][data-v="all"]');
  await page.fill('#q', 'しのぶ');
  await page.click('[data-open="b:4"]');
  assert.deepEqual(await texts(page, '.vdet .rel .rw'), ['しのぶ']);
  assert.match(await page.textContent('.vdet .rel li'), /^しのぶ偲ぶ動/);
  await done(page);
});

test('古文330: 4択の選択肢に添え書きが出ない（1章を通しで）', async () => {
  for (const mode of ['quizR', 'cloze']) {
    const page = await openAt('book', { prefs: { range: 'lv1' } });
    await page.click(`[data-start="${mode}"]`);
    const n = +(await num(page)).split(' / ')[1];
    assert.ok(n >= 48, `${mode}: 1章の出題が ${n} 問しかない`);
    for (let i = 0; i < n; i++) {
      const cs = await texts(page, '.choice .txt');
      assert.equal(cs.length, 4);
      assert.deepEqual(cs.filter(c => /[()〔〕]/.test(c)), [], `${mode} ${i + 1}問目`);
      assert.equal(new Set(cs).size, 4, `${mode} ${i + 1}問目: 同じ選択肢がある ${cs.join(' ')}`);
      await page.click('[data-pick="0"]');
      await page.click('[data-next]');
    }
    await done(page);
  }
});

test('古文330:「ためし」の意味→語で、選択肢が答えの手がかりにならない', async () => {
  const page = await openWeak('book', ['b:110']);
  await page.click('[data-start="quizR"]');
  const cs = await texts(page, '.choice .txt');
  assert.ok(cs.includes('ためし'), cs.join(' '));
  assert.deepEqual(cs.filter(c => /[()一-龠]/.test(c)), []);
  await done(page);
});

test('古文330: 同じ語形の「たまふ」が選択肢に2つ並ばない', async () => {
  const page = await openWeak('book', ['b:309', 'b:310']);
  await page.click('[data-start="quizR"]');
  for (let i = 0; i < 2; i++) {
    const cs = await texts(page, '.choice .txt');
    assert.equal(cs.filter(c => c === 'たまふ').length, 1, cs.join(' '));
    assert.match(await page.textContent('.card .chips'), /動ハ(四|下二)/); // 設問は品詞で区別できる
    await page.click('[data-pick="0"]');
    await page.click('[data-next]');
  }
  await done(page);
});

test('古文330:「けしき(気色)」が空所補充（4択・記述）に出る', async () => {
  let page = await openWeak('book', ['b:38']);
  await page.click('[data-start="cloze"]');
  assert.equal(await num(page), '1 / 1');
  assert.match(await page.textContent('.cloze'), /＿＿＿＿/);
  const cs = await texts(page, '.choice .txt');
  await page.click(`[data-pick="${cs.indexOf('けしき')}"]`);
  assert.match(await page.textContent('.verdict'), /^正解/);
  await done(page);
  page = await openWeak('book', ['b:38']);
  await page.click('[data-start="clozeT"]');
  assert.ok((await texts(page, '.card .chips .chip')).includes('け・・（3字）'), '字数のヒントが「け・・（3字）」でない');
  await page.fill('#ans', 'けしき');
  await page.press('#ans', 'Enter');
  assert.match(await page.textContent('.verdict'), /^正解/);
  await done(page);
});

test('記述: 用例が漢字のときは、ひらがなの活用形でも終止形でも正解になる', async () => {
  for (const ans of ['ねんじ', 'ねんず', '念じ']) {
    const page = await openWeak('kobun', ['k:ねんず|念ず']);
    await page.click('[data-start="clozeT"]');
    assert.ok((await texts(page, '.card .chips .chip')).includes('ね・・（3字）'));
    await page.fill('#ans', ans);
    await page.press('#ans', 'Enter');
    assert.match(await page.textContent('.verdict'), /^正解/, ans);
    await done(page);
  }
  const page = await openWeak('kobun', ['k:ねんず|念ず']);
  await page.click('[data-start="clozeT"]');
  await page.fill('#ans', 'ねんぶ');
  await page.press('#ans', 'Enter');
  assert.match(await page.textContent('.verdict'), /^不正解　正答: 念じ（ねんず）/);
  await done(page);
});

test('記述: 併記の見出し語は、用例に入っている語で字数のヒントを出し、照合する', async () => {
  const page = await openWeak('book', ['b:143']); // など・などか（用例は「などか来ざりし」）
  await page.click('[data-start="clozeT"]');
  assert.equal(await page.textContent('.cloze'), '＿＿＿＿来ざりし');
  assert.ok((await texts(page, '.card .chips .chip')).includes('な・・（3字）'));
  await page.fill('#ans', 'などか');
  await page.press('#ans', 'Enter');
  assert.match(await page.textContent('.verdict'), /^正解/);
  await done(page);
});

test('学習ホーム: 空所補充の出題モードに、対象になる語数が出る', async () => {
  const czn = async page => (await page.textContent('[data-start="cloze"]')).match(/対象 (\d+)語(?:（範囲 (\d+)語のうち）)?/);
  // 古文単語: 表示された数と、実際に出題される数が同じ
  let page = await openAt('kobun');
  let m = await czn(page);
  assert.ok(m, '「対象 ○語」が無い: ' + await page.textContent('[data-start="cloze"]'));
  assert.ok(+m[1] >= 325);
  assert.match(await page.textContent('[data-start="clozeT"]'), new RegExp('対象 ' + m[1] + '語'));
  await page.click('[data-start="cloze"]');
  assert.equal(await num(page), '1 / ' + m[1]);
  await done(page);
  // 古文330: 関連語には用例が無いので、関連語だけにすると対象が0語になり、範囲より少ないことが分かる
  page = await openAt('book', { prefs: { rel: 'only' } });
  const REL = await page.evaluate(() => window.__tangoTest.BOOKREL.length); // 関連語の総数
  m = await czn(page);
  assert.deepEqual([m[1], m[2]], ['0', String(REL)]);
  // 設定を変えると、その場で数が変わる
  await page.selectOption('#o-rel', 'with');
  m = await czn(page);
  assert.ok(+m[1] >= 315);
  assert.equal(+m[2], 330 + REL);
  await page.selectOption('#o-rel', 'no');
  await page.fill('#o-from', '1');
  await page.fill('#o-to', '50');
  await page.dispatchEvent('#o-to', 'change');
  m = await czn(page);
  assert.ok(+m[1] >= 48 && +m[1] <= 50, '1〜50番の対象が ' + m[1] + '語');
  await page.click('[data-start="cloze"]');
  assert.equal(await num(page), '1 / ' + m[1]);
  await done(page);
  // 英単語: 対象にならない語があるので「範囲 ○語のうち」が出る
  page = await openAt('eigo');
  m = await czn(page);
  assert.ok(m[2] && +m[1] < +m[2], '英単語: ' + m[0]);
  await page.click('[data-start="cloze"]');
  assert.equal(await num(page), '1 / ' + m[1]);
  await done(page);
});
