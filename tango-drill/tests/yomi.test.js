// 「読みを入力」の判定のテスト。実行: node tests/yomi.test.js
// 比べる前に空白と「・」を除き、カタカナをひらがなにそろえること、歴史的仮名遣いと別の読みも正解になることを確かめる。
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

// 指定の語だけを「苦手」にして、その科目の「読みを入力」を始める（出題は指定の語だけになる）
async function startY(subj, ids) {
  const prog = {};
  ids.forEach(id => { prog[id] = { c: 0, x: 1, s: 0, t: 1 }; });
  const prefs = { subj, [subj]: { range: 'weak', count: 'all', order: 'index' } };
  const page = await H.open(browser, b.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs }));
  await page.click('[data-start="typeY"]');
  return page;
}
// 出題された語に answers[語] を入力して答え合わせをする。{語: 判定の行} を返す（全部の語が出るまで）
async function answerAll(page, answers) {
  const out = {}, n = Object.keys(answers).length;
  for (let i = 0; i < n; i++) {
    const w = (await page.textContent('.card .word')).trim();
    assert.ok(Object.hasOwn(answers, w), '想定していない語が出た: ' + w);
    await page.fill('#ans', answers[w]);
    await page.press('#ans', 'Enter');
    out[w] = (await page.textContent('.verdict')).replace(/\s+/g, ' ').trim();
    await page.click('[data-next]');
  }
  assert.match(await page.textContent('#view'), new RegExp(n + ' 問'));
  return out;
}
// 判定だけを直接確かめる（アプリの中の判定の関数を呼ぶ）
const judge = (page, id, input) => page.evaluate(([id, input]) => {
  const T = window.__tangoTest;
  for (const s in T.DATA) { const it = T.DATA[s].find(x => x.id === id); if (it) return T.yomiOk(it, input); }
  throw new Error('項目が無い: ' + id);
}, [id, input]);

test('読みに「・」を含む語は、中黒を打たなくても正解（摂政・関白、斎宮・斎院）', async () => {
  const page = await startY('joshiki', ['j:摂政・関白', 'j:斎宮・斎院']);
  const v = await answerAll(page, { '摂政・関白': 'せっしょうかんぱく', '斎宮・斎院': 'さいぐう さいいん' });
  assert.match(v['摂政・関白'], /^正解/);
  assert.match(v['斎宮・斎院'], /^正解/);
  assert.match(v['摂政・関白'], /読み: せっしょう・かんぱく/); // 表示は元の読みのまま
  await done(page);
});

test('カタカナで入力しても正解', async () => {
  const page = await startY('joshiki', ['j:摂政・関白', 'j:子の時']);
  const v = await answerAll(page, { '摂政・関白': 'セッショウ・カンパク', '子の時': 'ネノトキ' });
  assert.match(v['摂政・関白'], /^正解/);
  assert.match(v['子の時'], /^正解/);
  await done(page);
});

test('歴史的仮名遣いでも正解（読み・古文常識）。違う読みは不正解のまま', async () => {
  let page = await startY('yomi', ['y:1', 'y:2', 'y:3']);
  let v = await answerAll(page, { '入相': 'いりあひ', '節会': 'せちえ', '除目': 'じも' });
  assert.match(v['入相'], /^正解/);   // 歴史的仮名遣い
  assert.match(v['節会'], /^正解/);   // 現代仮名遣い
  assert.match(v['除目'], /^不正解/); // 足りない
  assert.match(v['除目'], /読み: じもく/);
  assert.match(v['除目'], /あなたの答え: じも/);
  await done(page);
  page = await startY('joshiki', ['j:亥の時', 'j:摂政・関白']);
  v = await answerAll(page, { '亥の時': 'ゐのとき', '摂政・関白': 'せつしやうくわんぱく' });
  assert.match(v['亥の時'], /^正解/);
  assert.match(v['摂政・関白'], /^正解/); // 歴史的仮名遣いの併記も、中黒なしで
  await done(page);
});

test('説明に「〜とも読む」とある別の読みも正解になり、回答後に別の読みを見せる（文月・御息所）', async () => {
  const page = await startY('joshiki', ['j:文月', 'j:御息所', 'j:子の時']);
  const v = await answerAll(page, { '文月': 'ふづき', '御息所': 'みやすんどころ', '子の時': 'ねのとき' });
  assert.match(v['文月'], /^正解/);
  assert.match(v['御息所'], /^正解/);
  assert.match(v['文月'], /読み: ふみづき/);
  assert.match(v['文月'], /別の読み: ふづき/);
  assert.match(v['御息所'], /読み: みやすどころ/);
  assert.match(v['御息所'], /別の読み: みやすんどころ/);
  assert.doesNotMatch(v['子の時'], /別の読み/); // 別の読みが無い語には出さない
  await done(page);
});

test('元の読みで答えても正解のままで、別の読みは回答後に見える', async () => {
  const page = await startY('joshiki', ['j:文月', 'j:御息所']);
  const v = await answerAll(page, { '文月': 'ふみづき', '御息所': 'みやすどころ' });
  assert.match(v['文月'], /^正解 読み: ふみづき.*別の読み: ふづき/);
  assert.match(v['御息所'], /^正解 読み: みやすどころ.*別の読み: みやすんどころ/);
  await done(page);
});

test('設問に「現代仮名遣いで」と添えてある', async () => {
  for (const [subj, id] of [['yomi', 'y:5'], ['joshiki', 'j:文月']]) {
    const page = await startY(subj, [id]);
    assert.match(await page.textContent('.qprompt'), /現代仮名遣いで/);
    await done(page);
  }
});

test('判定の表: 空白・中黒・カタカナ・歴史的仮名遣い・別の読み', async () => {
  const page = await H.open(browser, b.html, null);
  const T = [
    // 読みに「・」を含む語（見出し語も併記）: 全体で1つの読み。片方だけでは正解にしない
    ['j:摂政・関白', 'せっしょう・かんぱく', true], ['j:摂政・関白', 'せっしょうかんぱく', true], ['j:摂政・関白', ' せっしょう　かんぱく ', true],
    ['j:摂政・関白', 'ｾｯｼｮｳｶﾝﾊﾟｸ', true], ['j:摂政・関白', 'せっしょう', false], ['j:摂政・関白', 'かんぱく', false], ['j:摂政・関白', 'かんぱくせっしょう', false],
    ['j:斎宮・斎院', 'さいぐうさいいん', true], ['j:斎宮・斎院', 'サイグウ・サイイン', true], ['j:斎宮・斎院', 'さいぐうさいゐん', true], ['j:斎宮・斎院', 'さいぐう', false],
    // 読み（70語）
    ['y:1', 'いりあい', true], ['y:1', 'イリアイ', true], ['y:1', 'いりあひ', true], ['y:1', 'いり あい', true], ['y:1', 'いりあ', false], ['y:1', 'いりあいい', false],
    ['y:5', 'うち', true], ['y:12', 'てんじょうびと', true], ['y:12', 'てんじやうびと', true], ['y:12', 'テンジョウビト', true], ['y:12', 'てんじょうひと', false],
    // 説明の「〜とも読む」「〜とも」の別の読み
    ['j:文月', 'ふみづき', true], ['j:文月', 'ふづき', true], ['j:文月', 'フヅキ', true], ['j:文月', 'ふつき', false],
    ['j:御息所', 'みやすどころ', true], ['j:御息所', 'みやすんどころ', true], ['j:御息所', 'みやすところ', false],
    ['j:警蹕', 'けいひつ', true], ['j:警蹕', 'けいひち', true], ['j:築地', 'ついじ', true], ['j:築地', 'ついぢ', true], ['j:築地', 'ついひぢ', true],
    // 説明のかぎかっこでも、「〜とも」の付かないものは読みにしない（中陰の「のちのわざ」、あづまの「えびす」）
    ['j:中陰', 'ちゅういん', true], ['j:中陰', 'のちのわざ', false],
    // 読みにかっこ書きの別の読みがある語（藤原定家＝ふじわらのさだいえ（ていか））
    ['bungaku:藤原定家||作者', 'ふじわらのさだいえ', true], ['bungaku:藤原定家||作者', 'ふじわらのていか', true], ['bungaku:藤原定家||作者', 'フジワラノテイカ', true],
    ['bungaku:藤原定家||作者', 'ふじわらのさだいえ（ていか）', true], ['bungaku:藤原定家||作者', 'ていか', false], ['bungaku:藤原定家||作者', 'さだいえ', false],
    ['bungaku:紀貫之||作者', 'きのつらゆき', true], ['bungaku:紀貫之||作者', 'きの', false],
    // 空の入力、記号だけ
    ['y:1', '', false], ['y:1', '・', false], ['y:1', '　', false],
  ];
  const bad = [];
  for (const [id, input, want] of T) { const got = await judge(page, id, input); if (got !== want) bad.push(`${id} に「${input}」→ ${got}（期待は ${want}）`); }
  assert.deepEqual(bad, []);
  await done(page);
});

test('別の読みを持つ語は、いまのデータではこの5語だけ（データを足して増えたら、ここで気づく）', async () => {
  const page = await H.open(browser, b.html, null);
  const got = await page.evaluate(() => {
    const T = window.__tangoTest, out = {};
    for (const s in T.DATA) { if (/^eigo\d$/.test(s)) continue; for (const it of T.DATA[s]) { if (!T.askable(it, 'typeY')) continue; const r = T.readings(it); if (r.more.length) out[it.id] = r.more; } }
    return out;
  });
  assert.deepEqual(got, {
    'j:文月': ['ふづき'], 'j:御息所': ['みやすんどころ'], 'j:築地': ['ついひぢ'], 'j:警蹕': ['けいひち'],
    'bungaku:藤原定家||作者': ['ふじわらのていか'],
  });
  await done(page);
});

test('「読みを入力」に出る全項目で、データの読みをそのまま入力すれば正解になる', async () => {
  const page = await H.open(browser, b.html, null);
  const r = await page.evaluate(() => {
    const T = window.__tangoTest, bad = []; let n = 0;
    for (const s in T.DATA) { if (/^eigo\d$/.test(s)) continue; for (const it of T.DATA[s]) { if (!T.askable(it, 'typeY')) continue; n++;
      if (!T.yomiOk(it, it.rd)) bad.push(it.id + ' 読み ' + it.rd);
      if (it.alt && !T.yomiOk(it, it.alt)) bad.push(it.id + ' 歴史的仮名遣い ' + it.alt);
      if (T.yomiOk(it, it.rd + 'ん')) bad.push(it.id + ' 余分な字が付いても正解になる');
    } }
    return { n, bad };
  });
  assert.ok(r.n >= 400, '対象が ' + r.n + ' 語しかない');
  assert.deepEqual(r.bad, []);
  await done(page);
});
