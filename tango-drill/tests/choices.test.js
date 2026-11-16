// 4択の選択肢と設問文のテスト。
//  - 全科目・全項目で選択肢を繰り返し作り、選択肢が4つ・正解が1つだけ（意味が重なる誤答が無い）・
//    語→意味の選択肢に見出し語が出ない・誤答が正解と同じ品詞（分類）にそろうことを確かめる。
//  - 意味→語の設問文の伏せ字、1枚に複数の語が並ぶ項目の除外、設問に出す漢字表記と分野タグを画面で確かめる。
// 実行: node tests/choices.test.js
// 選択肢を作る関数は、ページのテスト用の窓口 window.__tangoTest から呼ぶ。判定（重なり・見出し語・品詞）は、アプリの実装とは別にこのファイルで書く。
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

let browser, b, LATEST, D;
test.before(async () => {
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
  // アプリの全データ（科目 → 項目の一覧）。book には関連語も rel として付ける
  const page = await H.open(browser, b.html, null);
  D = await page.evaluate(() => {
    const T = window.__tangoTest, pick = it => ({ id: it.id, w: it.w, k: it.k || '', pos: it.pos, m: it.m, lv: it.lv, tags: it.tags || [] }), o = {};
    for (const s in T.DATA) o[s] = T.DATA[s].map(pick);
    o.REL = T.BOOKREL.map(pick);
    return o;
  });
  await page.context().close();
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });
// 失敗したテストが開いたままにしたページを閉じる
test.afterEach(async () => { for (const c of browser ? browser.contexts() : []) await c.close(); });
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
const openWeak = (subj, ids, prefs) => openAt(subj, { weak: ids, prefs: Object.assign({ range: 'weak' }, prefs) });
const texts = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent));
const num = async page => (await page.textContent('.prog .num')).trim();
const total = async page => +(await num(page)).split(' / ')[1];
// 画面にある要素の数（要素そのものを assert に渡すと、失敗したときの表示でメモリを使い切るので、数で比べる）
const count = (page, sel) => page.$$eval(sel, els => els.length);

/* ---- 判定（アプリの実装とは別に書く） ---- */
const kind = it => it.id.slice(0, it.id.indexOf(':')); // k=古文単語 e=英単語 b=古文330 br=関連語 y=読み j=古文常識 ほかは科目名
const PAREN = /[（(［【〔][^（）()［］【】〔〕]*[）)］】〕]/g;
const noParen = s => { let p; do { p = s; s = s.replace(PAREN, ''); } while (s !== p); return s; };
// 訳語の集合: かっこ書きを除き、「・」「／」で区切る（指示書の比べ方）
const glosses = ms => { const o = new Set(); for (const m of ms) for (const t of noParen(m).split(/[・／]/)) { const g = t.trim(); if (g) o.add(g); } return o; };
const common = (a, b) => [...a].filter(x => b.has(x));
// 説明の文の集合: 意味を「。」で区切る（かっこ書きはそのまま。文学史の「平安時代（11世紀）の物語。紫式部」→ 2文）
const sentences = ms => { const o = new Set(); for (const m of ms) for (const t of m.split('。')) { const g = t.replace(/\s/g, ''); if (g) o.add(g); } return o; };
const within = (a, b) => a.size > 0 && [...a].every(x => b.has(x));
// 見出し語の表記に含まれる語: 「・」「〜」で分けた各語。全角かっこの添え書き（む（ん）、こころ（を）やる）は、外した形・入れた形・中身
function wordParts(w, sep = /[・〜]/) {
  const o = new Set();
  for (const p of String(w).split(sep)) {
    if (!p) continue;
    o.add(p.replace(/[（(][^）)]*[）)]/g, '')); o.add(p.replace(/[（()）]/g, ''));
    for (const x of p.match(/[（(][^）)]*[）)]/g) || []) if (p.endsWith(x)) o.add(x.slice(1, -1));
  }
  o.delete('');
  return [...o];
}
const LETTER = /[ぁ-ゖァ-ヺー一-龠々A-Za-z0-9]/, KANA1 = /^[ぁ-ゖ]$/;
// 文 text に語 f が「語として」出ているか（前後が文字でない）
const solo = (text, f) => { for (let i = text.indexOf(f); i >= 0; i = text.indexOf(f, i + 1)) if (!LETTER.test(text[i - 1] || '') && !LETTER.test(text[i + f.length] || '')) return true; return false; };
// 項目 it の見出し語が、文 text に出ているか。出ていれば、その形を返す。
//   2字以上の語は、どこに出ていても数える。かな1字の語（る・な・を）は、語として出ている箇所だけ。
//   「な〜そ」のような呼応の形の見出し語は、かな1字の部分（な・そ）を見ない（訳語の「〜するな」に当たるため）。
//   kanji は、設問に出ている漢字表記（「・」区切り）。2字以上はどこでも、1字は語として出ている箇所だけ。
function shows(it, text, kanji) {
  if (kind(it) === 'e') return new RegExp('\\b' + it.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text) ? it.w : null;
  const pattern = String(it.w).includes('〜');
  for (const f of wordParts(it.w)) {
    if (f.length >= 2 || !KANA1.test(f)) { if (text.includes(f)) return f; } else if (!pattern && solo(text, f)) return f;
  }
  for (const f of String(kanji || '').replace(/[〔〕]/g, '').split('・').filter(Boolean)) if (f.length >= 2 ? text.includes(f) : solo(text, f)) return f;
  return null;
}
// 漢字表記の欄（k）に見出し語の漢字が入っている科目（古文単語・古文330・関連語）。文法の k は接続の説明
const hasKanji = it => ['k', 'b', 'br'].includes(kind(it));
// 1枚に複数の語と意味が並ぶ項目（よし＝良い／よろし＝…、［行幸］…／［行啓］…）
const isMulti = it => { const ws = String(it.w).split('・'), ks = String(it.k).split('・').filter(Boolean); return ws.length > 1 && it.m.length > 1 && it.m.every(m => ws.some(w => m.startsWith(w + '＝')) || ks.some(k => m.startsWith('［' + k + '］'))); };
// 品詞の大分類（古文は 動・形・形動・名・副・連語 など、英語は品詞表記の1つ目、文法は 助動詞・助詞・動詞の活用 など、古文常識・文学史・和歌は分類）
function cls(it) {
  const k = kind(it), p = String(it.pos);
  if (k === 'k' || k === 'b' || k === 'br') { const m = /^(形動|動|形|名|副|連語|連体|感動|接)/.exec(p); return m ? m[1] : p; }
  if (k === 'e') return p.split('・')[0];
  return /助詞$/.test(p) ? '助詞' : p;
}

// 科目 subj の全項目について、出題モード mode の選択肢を reps 回ずつ作る（rel: 古文330の関連語も出題する）。
// 戻り値: { info: { 項目ID: { t: 選択肢の文, ms: 語→意味で表示している意味（元の文） } }, out: [{ id, skip } | { id, sets: [[選択肢の項目ID×4]…], q }] }
//   q は、語→意味なら設問に出している漢字表記、それ以外は意味→語の設問文（意味ごとの配列）
const generate = (page, subj, mode, reps, rel) => page.evaluate(([subj, mode, reps, rel]) => {
  const T = window.__tangoTest, toM = mode === 'quiz', items = T.DATA[subj].concat(rel ? T.BOOKREL : []), info = {}, out = [];
  for (const x of items) info[x.id] = toM ? { t: T.choiceText(x, true), ms: T.choiceMs(x) } : { t: T.choiceText(x, false) };
  for (const it of items) {
    if (!T.askable(it, mode)) { out.push({ id: it.id, skip: true }); continue; }
    const sets = [];
    for (let r = 0; r < reps; r++) sets.push(T.makeChoices(it, mode, subj).map(x => x.id));
    out.push({ id: it.id, sets, q: toM ? T.qKanji(it) : T.hideWord(it) });
  }
  return { info, out };
}, [subj, mode, reps, rel]);

// 科目ごとの繰り返し回数（語→意味・意味→語。空所補充はその半分）。英語は語数が多いので少なめ
const SUBJECTS = [
  ['kobun', '古文単語', 10, true], ['book', '古文330', 10, true], ['eigo', '英単語（全レベル）', 4, true],
  ['eigo1', '英単語 基礎', 2, true], ['eigo2', '英単語 標準', 2, true], ['eigo3', '英単語 発展', 2, true], ['eigo4', '英単語 最難関', 2, true],
  ['yomi', '読み', 20, false], ['joshiki', '古文常識', 20, false], ['bungaku', '文学史', 20, false], ['waka', '和歌', 20, false], ['bunpo', '文法', 20, false],
];
const RATES = {}; // 科目 → モード → 誤答が正解と同じ品詞（分類）だった割合

for (const [subj, name, reps, hasCloze] of SUBJECTS) {
  test(name + ': 選択肢は必ず4つ、正解は1つだけ、語→意味の選択肢に見出し語が出ない（全項目で繰り返し確かめる）', async t => {
    const page = await openAt(subj);
    const byId = new Map(D[subj].concat(subj === 'book' ? D.REL : []).map(it => [it.id, it])), inPool = new Set(D[subj].map(it => it.id)); // 誤答の候補は見出し語から選ぶ
    const G = new Map([...byId.values()].map(it => [it.id, glosses(it.m)])), SE = new Map([...byId.values()].map(it => [it.id, sentences(it.m)]));
    RATES[subj] = {};
    for (const mode of ['quiz', 'quizR'].concat(hasCloze ? ['cloze'] : [])) {
      const toM = mode === 'quiz', { info, out } = await generate(page, subj, mode, mode === 'cloze' ? Math.ceil(reps / 2) : reps, subj === 'book');
      assert.equal(out.length, byId.size);
      const bad = [], say = s => { if (bad.length < 40) bad.push(s); };
      let nSets = 0, nDis = 0, nSame = 0, nOnly = 0;
      for (const o of out) {
        const it = byId.get(o.id);
        // 1枚に複数の語と意味が並ぶ項目は、4択にも空所補充にも出さない
        if (isMulti(it)) { if (!o.skip) say(`${it.w}: 複数の語が並ぶ項目なのに出題される`); continue; }
        if (o.skip) { if (mode !== 'cloze') say(`${it.w}: 出題されない`); continue; }
        const gAll = G.get(it.id), alts = wordParts(it.w.toLowerCase(), '・'); // 併記（A・B）の各語
        if (toM) {
          // 選択肢の文は、表示する意味（元の文）から見出し語を伏せたもの
          for (const x of [it]) {
            const inf = info[x.id];
            if (!inf.ms.length || inf.ms.length > 2 || inf.ms.some(m => !x.m.includes(m))) say(`${x.w}: 表示する意味が元の意味の1〜2個ではない ${JSON.stringify(inf.ms)}`);
            for (const frag of inf.t.split(/＿＿|／/)) if (frag && !inf.ms.some(m => m.includes(frag))) say(`${x.w}: 選択肢の文「${inf.t}」の「${frag}」が元の意味に無い`);
            if (!inf.t.replace(/＿＿/g, '').replace(/[\s・／〜（）()]/g, '')) say(`${x.w}: 選択肢の文が伏せ字だけ「${inf.t}」`);
          }
        } else {
          // 意味→語（空所補充では出さない）の設問文: 空でなく、見出し語が出ていない
          const q = o.q.join('　／　');
          if (!q.replace(/＿＿/g, '').trim()) say(`${it.w}: 設問文が空「${q}」`);
          const f = shows(it, q, '');
          if (f) say(`${it.w}: 設問文に見出し語「${f}」が出ている「${q}」`);
        }
        for (const ids of o.sets) {
          nSets++;
          const cs = ids.map(id => byId.get(id)), ts = ids.map(id => info[id].t), at = `${it.w}（${mode}）[${ts.join(' ｜ ')}]`;
          if (cs.length !== 4 || cs.some(x => !x)) { say(`${at}: 選択肢が4つではない`); continue; }
          if (new Set(ids).size !== 4 || ids.filter(id => id === it.id).length !== 1) say(`${at}: 正解が1つではない・同じ項目がある`);
          if (new Set(ts.map(s => s.toLowerCase())).size !== 4 || ts.some(s => !s)) say(`${at}: 同じ文・空の選択肢がある`);
          // 訳がまったく同じ語が2つ並ばない（む と むず、す と さす）
          if (new Set(cs.map(x => [...(toM ? glosses(info[x.id].ms) : G.get(x.id))].sort().join('\n'))).size !== 4) say(`${at}: 訳がまったく同じ選択肢がある`);
          let same = 0;
          for (const x of cs) {
            if (toM) { const f = shows(it, info[x.id].t, hasKanji(it) ? o.q : ''); if (f) say(`${at}: 選択肢に見出し語「${f}」が出ている`); }
            if (x.id === it.id) continue;
            if (isMulti(x)) say(`${at}: 複数の語が並ぶ項目「${x.w}」が選択肢にある`);
            // 語→意味は、選択肢に表示している意味と、正解の語のすべての意味を比べる。意味→語・空所補充は、すべての意味どうし
            const ov = common(toM ? glosses(info[x.id].ms) : G.get(x.id), gAll);
            if (ov.length) say(`${at}: 誤答「${x.w}」は正解と意味が重なる（${ov.join('・')}）`);
            // 説明がまるごと当てはまる誤答が無い。語→意味: 誤答の選択肢の文がすべて、正解の語の説明にもある（源氏物語の誤答に「平安時代（11世紀）の物語」）。
            // 意味→語・空所補充: 設問文（正解の語の説明）がすべて、誤答の語の説明にもある（「平安時代（11世紀）の物語」の誤答に源氏物語）
            if (toM ? within(sentences(info[x.id].ms), SE.get(it.id)) : within(SE.get(it.id), SE.get(x.id))) say(`${at}: 誤答「${x.w}」にも説明がまるごと当てはまる`);
            if (wordParts(x.w.toLowerCase(), '・').some(p => alts.includes(p))) say(`${at}: 誤答「${x.w}」は正解と同じ語`);
            if (toM) { const f = shows(x, info[x.id].t, ''); if (f) say(`${at}: 誤答「${x.w}」の文に、その語「${f}」が出ている`); }
            nDis++; if (cls(x) === cls(it)) same++;
          }
          nSame += same; if (!same) nOnly++;
          // 同じ品詞（分類）の語が足りるなら、ほかの品詞で補わない: 指示書の比べ方で使える同じ品詞の語が10語以上あるのに、ほかの品詞が混ざっていたら誤り
          if (same < 3) {
            const usable = [...byId.values()].filter(x => inPool.has(x.id) && x.id !== it.id && cls(x) === cls(it) && !isMulti(x) && !wordParts(x.w.toLowerCase(), '・').some(p => alts.includes(p)) && !common(G.get(x.id), gAll).length);
            if (usable.length >= 10) say(`${at}: 同じ品詞（${cls(it)}）の語が ${usable.length} 語使えるのに、誤答 ${3 - same} つがほかの品詞`);
          }
        }
      }
      RATES[subj][mode] = nSame / nDis;
      t.diagnostic(`${name} ${mode}: ${nSets} 回。誤答が正解と同じ品詞（分類） ${(nSame / nDis * 100).toFixed(1)}%、同じ品詞の誤答が1つも無い出題 ${(nOnly / nSets * 100).toFixed(1)}%`);
      assert.deepEqual(bad, [], `${name} ${mode}`);
    }
    await done(page);
  });
}

test('同じ品詞の語が十分ある科目では、誤答が正解と同じ品詞の大分類になる割合が9割以上', () => {
  for (const subj of ['kobun', 'book', 'eigo', 'eigo1', 'eigo2', 'eigo3', 'eigo4', 'bunpo']) {
    assert.ok(RATES[subj], subj + ' の集計が無い（上のテストが先に動く）');
    for (const [mode, r] of Object.entries(RATES[subj])) assert.ok(r >= 0.9, `${subj} ${mode}: ${(r * 100).toFixed(1)}%`);
  }
  // 古文常識・文学史・和歌は分類が細かく、同じ分類の語が3語に満たないものがある（足りない分だけ、近い区分の語で補う）
  for (const [subj, min] of [['joshiki', 0.8], ['bungaku', 0.8], ['waka', 0.8]]) for (const [mode, r] of Object.entries(RATES[subj])) assert.ok(r >= min, `${subj} ${mode}: ${(r * 100).toFixed(1)}%`);
});

/* ---- 画面で確かめる ---- */
const BUNPO = (w, k, pos) => `bunpo:${w}|${k}|${pos}`;

test('語→意味: 選択肢の文に見出し語が出ない。回答後の解説は元の文のまま', async () => {
  const cases = [
    ['eigo', 'e:absorb', /absorb/i, '(be absorbed in)夢中にさせる', null],
    ['joshiki', 'j:梅', /梅/, '白梅は雪や白波に見立てる', '香りを楽しむ。白＿＿は雪や白波に見立てる。鶯の宿'],
    ['bunpo', BUNPO('らし', '終止形に接続', '助動詞'), /らし/, '推定（〜らしい）', '推定（〜＿＿い）'],
    ['kobun', 'k:ことなり|異なり・殊なり', /ことなり|異なり|殊なり/, '(異なり)違っている', null],
  ];
  for (const [subj, id, re, orig, masked] of cases) {
    const page = await openWeak(subj, [id]);
    await page.click('[data-start="quiz"]');
    const cs = await texts(page, '.choice .txt');
    assert.equal(cs.length, 4, id);
    assert.deepEqual(cs.filter(c => re.test(c)), [], id + ': 選択肢に見出し語が出ている');
    if (masked) assert.ok(cs.includes(masked), id + ': ' + cs.join(' ｜ '));
    if (subj === 'eigo') assert.deepEqual(cs.filter(c => /[（(][^）)]*[A-Za-z]/.test(c)), [], id + ': 英語のかっこ書きが残っている');
    await page.click('[data-pick="0"]');
    assert.ok((await page.textContent('.detail')).includes(orig), id + ': 回答後の解説が元の文でない');
    await done(page);
  }
});

test('文法: 訳が同じ語（る・らる、す・さす・しむ、つ・ぬ、む・むず）が、選択肢に並ばない', async () => {
  const groups = [['る', 'らる'], ['す', 'さす', 'しむ'], ['つ', 'ぬ'], ['む（ん）', 'むず（んず）']];
  for (const mode of ['quiz', 'quizR']) {
    // 未然形接続（る・らる・す・さす・しむ・む・むず など）と連用形接続（つ・ぬ など）の助動詞を、区分ごとに通しで2回ずつ
    for (const lv of ['lv1', 'lv2']) {
      const page = await openAt('bunpo', { prefs: { range: lv } });
      await page.click(`[data-start="${mode}"]`);
      const n = await total(page);
      assert.equal(n, D.bunpo.filter(it => it.lv === +lv.slice(2)).length);
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < n; i++) {
          const cs = await texts(page, '.choice .txt');
          assert.equal(new Set(cs).size, 4, `${mode}: 同じ選択肢がある ${cs.join(' ｜ ')}`);
          if (mode === 'quizR') for (const g of groups) assert.ok(cs.filter(c => g.includes(c)).length <= 1, `訳が同じ語が並んだ: ${cs.join(' ')}`);
          // 語→意味: かっこ書き（訳語）を除いた用法の並びが同じ選択肢が無い（使役／尊敬 が2つ、など）
          else assert.equal(new Set(cs.map(noParen)).size, 4, `用法が同じ選択肢がある: ${cs.join(' ｜ ')}`);
          await page.click('[data-pick="0"]');
          await page.click('[data-next]');
        }
        await page.click('[data-retry="same"]');
      }
      await done(page);
    }
  }
});

test('意味→語: 設問文の伏せ字は、見出し語が語として出ている箇所だけ（1字の見出し語で訳語の中の文字を消さない）', async () => {
  const J = '　／　';
  const bunpo = [
    [BUNPO('る', '未然形に接続', '助動詞'), '自発（自然と〜れる・〜ずにはいられない）' + J + '可能（〜ことができる・〜られる）' + J + '受身（〜れる・〜られる）' + J + '尊敬（〜なさる・お〜になる・〜れる・〜られる）'],
    [BUNPO('らし', '終止形に接続', '助動詞'), '推定（〜＿＿い）'],
    [BUNPO('を', '体言・連体形に接続', '格助詞'), '動作の対象（〜＿＿・〜に対して）' + J + '動作の起点（〜＿＿・〜から）' + J + '経過する場所や時間（〜＿＿）'],
    [BUNPO('な', '終止形／体言・文末に接続', '終助詞'), '【終止形】禁止（〜（する）＿＿）' + J + '【体言・文末】詠嘆（〜なあ）'],
  ];
  let page = await openWeak('bunpo', bunpo.map(x => x[0]));
  await page.click('[data-start="quizR"]');
  assert.equal(await total(page), bunpo.length);
  for (const [id, want] of bunpo) { // 収録順に出る
    assert.equal(await page.textContent('.card .word'), want, id);
    await page.click('[data-pick="0"]');
    await page.click('[data-next]');
  }
  await done(page);
  // 古文単語: 意味の中のかっこ書きに見出し語の形（漢字表記・活用形）が出ない。意味そのもの（徒歩）は消さない
  const kobun = [
    ['k:かち|徒歩', '徒歩'],
    ['k:ことなり|異なり・殊なり', s => !/異なり|殊なり|ことなり/.test(s) && /違っている/.test(s)],
    ['k:しのぶ|忍ぶ・偲ぶ', s => !/[(（][^)）]*[忍偲]ぶ/.test(s) && /我慢する/.test(s) && /懐かしく思う/.test(s)],
    ['k:ながむ|眺む・詠む', s => !/眺む|詠む/.test(s) && /物思いにふける/.test(s)],
    ['k:なのめなり|斜めなり', s => !/なのめ/.test(s) && /格別だ/.test(s)],
    ['k:あいなし', s => !/あいな/.test(s) && /むやみに・わけもなく/.test(s)],
  ];
  page = await openWeak('kobun', kobun.map(x => x[0]));
  await page.click('[data-start="quizR"]');
  assert.equal(await total(page), kobun.length);
  const want = new Map(kobun);
  for (let i = 0; i < kobun.length; i++) {
    const q = await page.textContent('.card .word'), cs = await texts(page, '.choice .txt');
    await page.click('[data-pick="0"]');
    const w = await page.textContent('.detail .word'), it = D.kobun.find(x => x.w === w), chk = want.get(it.id);
    assert.ok(chk, w + ' は出題していない');
    assert.ok(cs.includes(w));
    if (typeof chk === 'string') assert.equal(q, chk, w); else assert.ok(chk(q), `${w}: 設問文「${q}」`);
    want.delete(it.id);
    await page.click('[data-next]');
  }
  assert.equal(want.size, 0);
  await done(page);
});

test('1枚に複数の語と意味が並ぶ項目は、4択（両方向）と空所補充に出さない。フラッシュカードと単語帳には残す', async () => {
  for (const [subj, id, w, prefs, search] of [['kobun', 'k:よし・よろし・わろし・あし', 'よし・よろし・わろし・あし', {}, 'よろし'], ['book', 'b:328', 'ぎやうがう・ぎやうけい・ごかう', { from: '328', to: '328' }, '328']]) {
    assert.ok(D[subj].some(it => it.id === id), id + ' がデータに無い');
    // その項目だけを出題範囲にすると、4択と空所補充は「当てはまる語がありません」になる
    let page = await openWeak(subj, [id], prefs);
    for (const mode of ['quiz', 'quizR', 'cloze', 'clozeT']) {
      await page.click(`[data-start="${mode}"]`);
      assert.match(await page.textContent('#view'), /この条件に当てはまる語がありません/, `${subj} ${mode}`);
      assert.equal(await count(page, '.prog'), 0, `${subj} ${mode}: 出題が始まった`);
    }
    // 成績の「苦手ワードだけ4択で復習」でも出ない
    await page.click('.tabs [data-tab="stats"]');
    await page.click('[data-start-weak]');
    assert.equal(await count(page, '.prog'), 0, subj + ': 苦手の復習で出題が始まった');
    // フラッシュカードには出る
    await page.click('.tabs [data-tab="home"]');
    await page.click('[data-start="flash"]');
    assert.equal(await num(page), '1 / 1');
    assert.equal(await page.textContent('.card .word'), w);
    await page.click('[data-quit]');
    // 単語帳にもある
    await page.click('.tabs [data-tab="list"]');
    await page.fill('#q', search);
    assert.ok((await texts(page, '.vrow .vw')).some(s => s.includes(w)), subj + ': 単語帳に無い');
    await done(page);
    // 全範囲では、4択はその1語だけ少なく、フラッシュカードは全語。空所補充の「対象 ○語」も実際の出題数と同じ
    page = await openAt(subj);
    const n = D[subj].length;
    for (const [mode, want] of [['flash', n], ['quiz', n - 1], ['quizR', n - 1]]) {
      await page.click(`[data-start="${mode}"]`);
      assert.equal(await total(page), want, `${subj} ${mode}`);
      await page.click('[data-quit]');
    }
    const m = (await page.textContent('[data-start="cloze"]')).match(/対象 (\d+)語/);
    assert.ok(+m[1] <= n - 1, `${subj}: 空所補充の対象 ${m[1]}語`);
    for (const mode of ['cloze', 'clozeT']) {
      await page.click(`[data-start="${mode}"]`);
      assert.equal(await total(page), +m[1], `${subj} ${mode}`);
      await page.click('[data-quit]');
    }
    await done(page);
  }
});

test('意味→語と空所補充では、回答するまで漢字表記と分野タグを出さない（品詞の表示は残す）', async () => {
  for (const [subj, id] of [['kobun', 'k:ふみ|文'], ['book', 'b:1']]) {
    const it = D[subj].find(x => x.id === id);
    assert.ok(it && it.k && it.tags.length, id + ' に漢字表記と分野タグがある前提');
    for (const mode of ['quizR', 'cloze', 'clozeT']) {
      const page = await openWeak(subj, [id]);
      await page.click(`[data-start="${mode}"]`);
      // 回答前: 漢字表記の欄が無い。チップは品詞と区分（記述は字数のヒントも）だけで、分野タグが無い
      assert.equal(await count(page, '.card .kanji'), 0, `${id} ${mode}: 回答前に漢字表記が出ている`);
      const chips = await texts(page, '.card .chip');
      assert.equal(chips[0], it.pos, `${id} ${mode}: 品詞の表示`);
      assert.equal(chips.length, mode === 'clozeT' ? 3 : 2, `${id} ${mode}: ${chips.join(' ')}`);
      assert.deepEqual(chips.filter(c => it.tags.includes(c)), [], `${id} ${mode}: 分野タグが出ている`);
      // 回答後: 解説に漢字表記が出る
      if (mode === 'clozeT') { await page.fill('#ans', 'x'); await page.click('.typeform button'); } else await page.click('[data-pick="0"]');
      assert.equal(await page.textContent('.detail .kanji'), it.k, `${id} ${mode}: 回答後の漢字表記`);
      await done(page);
    }
  }
});

test('語→意味: 意味が漢字表記そのものの語（かち＝徒歩）は、回答するまで設問に漢字表記を出さない', async () => {
  // 伏せると選択肢の文が無くなる語。選択肢は元の意味のまま出し、設問の漢字表記を回答まで隠す
  const rel = D.REL.find(it => it.w === 'すべらぎ');
  assert.ok(rel && rel.k === '天皇');
  for (const [subj, id, k, prefs] of [['kobun', 'k:かち|徒歩', '徒歩', {}], ['book', 'b:32', '容貌', {}], ['book', rel.id, '天皇', { rel: 'only' }]]) {
    const page = await openWeak(subj, [id], prefs);
    await page.click('[data-start="quiz"]');
    assert.equal(await total(page), 1);
    assert.equal(await count(page, '.card .kanji'), 0, id + ': 回答前に漢字表記が出ている');
    assert.ok((await texts(page, '.choice .txt')).includes(k), id);
    await page.click('[data-pick="0"]');
    assert.equal(await page.textContent('.detail .kanji'), k, id);
    await done(page);
  }
  // ふつうの語は、語→意味の設問に漢字表記を出す（従来どおり）。選択肢には漢字表記を出さない
  const page = await openWeak('kobun', ['k:かたし|難し']);
  await page.click('[data-start="quiz"]');
  assert.equal(await page.textContent('.card .kanji'), '難し');
  const cs = await texts(page, '.choice .txt');
  assert.deepEqual(cs.filter(c => c.includes('難し')), []);
  assert.ok(cs.some(c => c.startsWith('＿＿い・困難だ')), cs.join(' ｜ '));
  await done(page);
});
