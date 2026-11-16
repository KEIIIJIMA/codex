// 学習記録の引き継ぎ（項目IDの付け替え）のテスト。実行: node tests/migration.test.js
// 試験用の完成版を一時フォルダに作り、旧形式の記録を localStorage に入れてから開いて確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { chromium } = require('playwright');
const H = require('./helpers');

// 以前の更新（文法の助詞の表の打ち直し）でIDが変わり、記録が切れた13項目の旧ID
const OLD = [
  'bunpo:より|体言・連体形に接続|格助詞',
  'bunpo:して|体言に接続|格助詞',
  'bunpo:が・に・を|連体形に接続|接続助詞',
  'bunpo:ながら|連用形などに接続|接続助詞',
  'bunpo:ぞ・なむ||係助詞',
  'bunpo:や・か||係助詞',
  'bunpo:だに||副助詞',
  'bunpo:すら||副助詞',
  'bunpo:さへ||副助詞',
  'bunpo:てしがな・にしがな|連用形に接続|終助詞',
  'bunpo:もがな・がな|体言などに接続|終助詞',
  'bunpo:そ|連用形（カ変・サ変は未然形）に接続|終助詞',
  'bunpo:や・よ・を||間投助詞',
];
const rec = i => ({ c: i + 2, x: i % 3, s: 2, t: 1700000000000 + i }); // s:2 は「習得」
const A = { c: 5, x: 0, s: 2, t: 11 }, B = { c: 0, x: 3, s: 0, t: 22 };
const OTHER = { c: 1, x: 4, s: 0, t: 5 };

// repo = リポジトリの移行表そのままの完成版。swap = それに試験用の移行（版 X）を足した完成版。
let browser, repo, swap, MIGS, LATEST, X;
const to = id => H.chain(MIGS, id); // リポジトリの移行表での行き先
test.before(async () => {
  MIGS = H.repoMigrations();
  LATEST = MIGS.reduce((n, m) => Math.max(n, m.v), 0);
  X = LATEST + 1;
  repo = H.build();
  swap = H.build({ migrations: [...MIGS, { v: X, map: { 'e:swap-a': 'e:swap-b', 'e:swap-b': 'e:swap-a', [to(OLD[0])]: 'x:chained', 'x:</script><!--': 'x:ok' } }] });
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
const done = async page => { assert.deepEqual(page.errors, [], 'ページ内でエラーが出た'); await page.context().close(); };

test('試験用の完成版が作れる', () => {
  assert.equal(repo.status, 0, repo.out);
  assert.equal(swap.status, 0, swap.out);
});

test('(a) v:1 の対応で、切れていた13項目の旧IDの記録が新IDに移る', async () => {
  const v1 = MIGS.find(m => m.v === 1);
  assert.ok(v1, 'src/migrations.json に v:1 が無い');
  for (const id of OLD) assert.ok(Object.hasOwn(v1.map, id), 'v:1 に旧ID「' + id + '」の対応が無い');
  const prog = { 'e:abandon': OTHER, 'zz:知らないID': { c: 9, x: 9, s: 0, t: 6 } };
  OLD.forEach((id, i) => { prog[id] = rec(i); });
  const before = { prog, days: { '2026-11-01': 5 }, prefs: { subj: 'bunpo' } };
  const page = await H.open(browser, repo.html, JSON.stringify(before));
  const s = await H.stored(page);
  assert.equal(s.v, LATEST);
  OLD.forEach((id, i) => {
    assert.notEqual(to(id), id);
    assert.equal(s.prog[id], undefined, '旧IDに記録が残っている: ' + id);
    assert.deepEqual(s.prog[to(id)], rec(i), '新IDに記録が無い: ' + to(id));
  });
  // 対応表に無いIDはそのまま。日ごとの回答数と設定も変えない
  assert.deepEqual(s.prog['e:abandon'], OTHER);
  assert.deepEqual(s.prog['zz:知らないID'], prog['zz:知らないID']);
  assert.equal(Object.keys(s.prog).length, OLD.length + 2);
  assert.deepEqual(s.days, before.days);
  assert.deepEqual(s.prefs, before.prefs);
  await done(page);
});

test('(a) 移した記録が、画面でも文法の「習得」として数えられる', async t => {
  const { idsFromHtml } = require('../tools/ids.js');
  const live = new Set(idsFromHtml(fs.readFileSync(repo.html, 'utf8')));
  const dead = OLD.map(to).filter(id => !live.has(id));
  if (dead.length) t.diagnostic('移行の付け替え先のうち、いまのデータに無いID（移行表の調整が必要）: ' + dead.join(' ／ '));
  assert.ok(dead.length < OLD.length, '付け替え先が1つもいまのデータに無い');
  const prog = {};
  OLD.forEach((id, i) => { prog[id] = rec(i); });
  const page = await H.open(browser, repo.html, JSON.stringify({ prog, days: {}, prefs: {} }));
  assert.equal((await H.statCounts(page))['文法']['習得'], OLD.length - dead.length);
  await done(page);
});

test('(b) 同じ移行の中の入れ替え（a→b と b→a）が正しく入れ替わり、移行は番号順に当たる', async () => {
  const prog = { 'e:swap-a': A, 'e:swap-b': B, [OLD[0]]: rec(0), 'x:</script><!--': rec(1) };
  const page = await H.open(browser, swap.html, JSON.stringify({ prog, days: {}, prefs: {} }));
  const s = await H.stored(page);
  assert.equal(s.v, X);
  assert.deepEqual(s.prog['e:swap-a'], B);
  assert.deepEqual(s.prog['e:swap-b'], A);
  assert.deepEqual(s.prog['x:chained'], rec(0)); // リポジトリの移行で新IDへ移り、続く試験用の移行でさらに先へ
  assert.deepEqual(s.prog['x:ok'], rec(1));      // HTML の区切りに見える文字を含むIDでも壊れない
  assert.equal(Object.keys(s.prog).length, 4);
  await done(page);
});

test('(b) 保存データの版より新しい移行だけが当たる', async () => {
  const prog = { 'e:swap-a': A, [OLD[0]]: rec(0) };
  const page = await H.open(browser, swap.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs: {} }));
  const s = await H.stored(page);
  assert.equal(s.v, X);
  assert.deepEqual(s.prog['e:swap-b'], A);
  assert.deepEqual(s.prog[OLD[0]], rec(0)); // 版 LATEST までの移行は済んだ扱いなので当て直さない
  assert.equal(Object.keys(s.prog).length, 2);
  await done(page);
});

test('(c) 2回読み込んでも二重に動かない', async () => {
  const before = JSON.stringify({ prog: { 'e:swap-a': A, 'e:swap-b': B }, days: {}, prefs: {} });
  const page = await H.open(browser, swap.html, before);
  const first = await H.stored(page);
  await page.reload();
  await page.waitForSelector('#view > *');
  const second = await H.stored(page);
  assert.deepEqual(second, first);
  assert.deepEqual(second.prog, { 'e:swap-a': B, 'e:swap-b': A }); // 2回動くと元に戻ってしまう
  assert.equal(await H.raw(page, H.BAK), before);                  // 退避も2回目に上書きされない
  await done(page);
});

test('(d) 移行する直前の保存内容が、退避キーにそのまま残る', async () => {
  const before = JSON.stringify({ prog: { [OLD[3]]: rec(3), 'e:abandon': OTHER }, days: { '2026-11-01': 5 }, prefs: { subj: 'eigo' } });
  const page = await H.open(browser, repo.html, before);
  assert.equal(await H.raw(page, H.BAK), before);
  assert.notEqual(await H.raw(page), before);
  await done(page);
});

test('(e) 記録が空のときは v だけが最新になる（退避もしない）', async () => {
  const before = { prog: {}, days: { '2026-11-01': 2 }, prefs: { subj: 'eigo' } };
  const page = await H.open(browser, repo.html, JSON.stringify(before));
  assert.deepEqual(await H.stored(page), Object.assign({ v: LATEST }, before));
  assert.equal(await H.raw(page, H.BAK), null);
  await done(page);
});

test('(e) 初めての利用者は、最初の保存から v が最新で入る（退避もしない）', async () => {
  const page = await H.open(browser, repo.html, null);
  await page.click('.subtabs [data-subj="yomi"]'); // 科目を選ぶと設定が保存される
  const s = await H.stored(page);
  assert.equal(s.v, LATEST);
  assert.deepEqual(s.prog, {});
  assert.equal(await H.raw(page, H.BAK), null);
  await done(page);
});

test('移行のあとも、回答すると記録が増えて保存される', async () => {
  const page = await H.open(browser, repo.html, JSON.stringify({ prog: { [OLD[0]]: rec(0) }, days: {}, prefs: { subj: 'yomi' } }));
  await page.click('[data-start="flash"]');
  await page.click('[data-ans="1"]'); // 1問目を「覚えた」
  const s = await H.stored(page);
  assert.equal(s.v, LATEST);
  assert.deepEqual(s.prog[to(OLD[0])], rec(0));
  const added = Object.keys(s.prog).filter(id => id.startsWith('y:'));
  assert.equal(added.length, 1);
  assert.deepEqual([s.prog[added[0]].c, s.prog[added[0]].x, s.prog[added[0]].s], [1, 0, 1]);
  assert.equal(Object.values(s.days).reduce((a, b) => a + b, 0), 1);
  await done(page);
});

test('アプリより新しい版の保存データには手を付けない', async () => {
  const before = JSON.stringify({ v: X + 5, prog: { 'e:swap-a': A, [OLD[0]]: rec(0) }, days: {}, prefs: {} });
  const page = await H.open(browser, swap.html, before);
  assert.equal(await H.raw(page), before);
  assert.equal(await H.raw(page, H.BAK), null);
  await done(page);
});

test('保存データが壊れていても、空の記録で起動する', async () => {
  const page = await H.open(browser, repo.html, '{"prog":{"e:abandon"');
  assert.equal((await H.statCounts(page))['英単語']['習得'], 0);
  assert.equal(await H.raw(page, H.BAK), null);
  await done(page);
});

test('(f) 古い版のバックアップを取り込むと、移行されてから入る', async () => {
  const page = await H.open(browser, repo.html, null);
  await page.click('.tabs [data-tab="stats"]');
  await page.fill('#imp', JSON.stringify({ prog: { [OLD[6]]: rec(6), 'e:abandon': OTHER }, days: { '2026-10-01': 4 } }));
  await page.click('[data-import]');
  assert.match(await page.textContent('#msg'), /^2 語の記録を取り込みました/);
  const s = await H.stored(page);
  assert.equal(s.v, LATEST);
  assert.deepEqual(s.prog, { [to(OLD[6])]: rec(6), 'e:abandon': OTHER });
  assert.notEqual(to(OLD[6]), OLD[6]);
  assert.equal(s.days['2026-10-01'], 4);
  await done(page);
});

test('(f) 取り込むデータの版より新しい移行だけが当たる', async () => {
  const page = await H.open(browser, swap.html, null);
  await page.click('.tabs [data-tab="stats"]');
  const imp = async j => { await page.fill('#imp', JSON.stringify(j)); await page.click('[data-import]'); };
  await imp({ v: LATEST, prog: { 'e:swap-a': A }, days: {} }); // 1つ前の版の書き出し → 入れ替えが当たる
  assert.deepEqual((await H.stored(page)).prog, { 'e:swap-b': A });
  await imp({ v: X, prog: { 'e:swap-a': B }, days: {} });      // 最新の版の書き出し → 動かさない
  assert.deepEqual((await H.stored(page)).prog, { 'e:swap-b': A, 'e:swap-a': B });
  await done(page);
});

test('(f) 書き出したバックアップに v が入り、取り込み直しても動かない', async () => {
  const page = await H.open(browser, swap.html, JSON.stringify({ prog: { 'e:swap-a': A }, days: { '2026-11-01': 1 }, prefs: {} }));
  await page.click('.tabs [data-tab="stats"]');
  await page.click('[data-export]');
  const out = JSON.parse(await page.inputValue('#imp'));
  assert.equal(out.v, X);
  assert.deepEqual(out.prog, { 'e:swap-b': A });
  assert.deepEqual(out.days, { '2026-11-01': 1 });
  await page.click('[data-import]'); // 書き出した文字列をそのまま取り込む
  assert.deepEqual((await H.stored(page)).prog, { 'e:swap-b': A });
  await done(page);
});

test('付け替え先に既に記録があるときは、回答数（c＋x）の多いほうを残す', async () => {
  const many = { c: 6, x: 3, s: 0, t: 1 }, few = { c: 1, x: 0, s: 1, t: 999 };
  const many2 = { c: 2, x: 2, s: 2, t: 3 }, few2 = { c: 3, x: 0, s: 3, t: 4 };
  const prog = { [OLD[1]]: many, [to(OLD[1])]: few, [to(OLD[2])]: many2, [OLD[2]]: few2 };
  const page = await H.open(browser, repo.html, JSON.stringify({ prog, days: {}, prefs: {} }));
  assert.equal(Object.keys(prog).length, 4);
  assert.deepEqual((await H.stored(page)).prog, { [to(OLD[1])]: many, [to(OLD[2])]: many2 });
  await done(page);
});

test('tools/ids.js が取り出すIDは、アプリが実際に使うIDと一致する', async () => {
  const { idsFromHtml } = require('../tools/ids.js');
  const ids = idsFromHtml(fs.readFileSync(repo.html, 'utf8'));
  const prog = {};
  for (const id of ids) prog[id] = { c: 1, x: 0, s: 2, t: 1 }; // 全IDを「習得」にする
  const prefs = { subj: 'book', book: { range: 'new', count: 'all', order: 'index', rel: 'only', from: '', to: '' } };
  const page = await H.open(browser, repo.html, JSON.stringify({ v: LATEST, prog, days: {}, prefs }));
  // 古文330の関連語（br:番号:順）: 全部が習得なら、「関連語だけ・未学習のみ」の出題は0件になる
  await page.click('[data-start="flash"]');
  assert.match(await page.textContent('#view'), /この条件に当てはまる語がありません/);
  // 見出し語: 成績タブのどの科目にも、未学習・学習中・苦手が残らない
  const counts = await H.statCounts(page);
  let total = 0;
  for (const [name, c] of Object.entries(counts)) {
    assert.deepEqual([c['未学習'], c['学習中'], c['苦手']], [0, 0, 0], name + ' に ids.js が取りこぼしたIDがある');
    total += c['習得'];
  }
  // 数も合う: 見出し語の合計＋関連語の数 = ids.js の件数（合わなければIDの重複か、余分なID）
  const rel = +(await page.textContent('.about')).match(/関連語 (\d+)語/)[1];
  assert.equal(total + rel, ids.length);
  await done(page);
});
