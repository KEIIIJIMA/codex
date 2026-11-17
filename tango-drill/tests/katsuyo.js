// 古文の活用表（テストの照合用）。空所補充で空所にした部分が「見出し語の活用形」かどうかを、
// アプリの実装（src/index.tmpl.html の formsOf）とは別に、活用形をすべて書き出して確かめる。
const GYO = {
  ア: 'あいうえお', カ: 'かきくけこ', ガ: 'がぎぐげご', サ: 'さしすせそ', ザ: 'ざじずぜぞ', タ: 'たちつてと', ダ: 'だぢづでど',
  ナ: 'なにぬねの', ハ: 'はひふへほ', バ: 'ばびぶべぼ', マ: 'まみむめも', ヤ: 'やいゆえよ', ラ: 'らりるれろ', ワ: 'わゐうゑを',
};
const KANA = /^[ぁ-ゖー]+$/;
const isKana = s => KANA.test(s);

// 活用語尾（未然・連用・終止・連体・已然・命令の順。a i u e は、その行のア段・イ段・ウ段・エ段）
const DAN = {
  '四': ['a', 'i', 'u', 'u', 'e', 'e'],
  '上二': ['i', 'i', 'u', 'uる', 'uれ', 'iよ'],
  '下二': ['e', 'e', 'u', 'uる', 'uれ', 'eよ'],
};
const HEN = {
  'カ': ['く', ['こ', 'き', 'く', 'くる', 'くれ', 'こ', 'こよ']],
  'サ': ['す', ['せ', 'し', 'す', 'する', 'すれ', 'せよ']],
  'ザ': ['ず', ['ぜ', 'じ', 'ず', 'ずる', 'ずれ', 'ぜよ']], // 念ず・御覧ず などのサ変
  'ナ': ['ぬ', ['な', 'に', 'ぬ', 'ぬる', 'ぬれ', 'ね']],
  'ラ': ['り', ['ら', 'り', 'り', 'る', 'れ', 'れ']],
};
const KU = ['く', 'から', 'く', 'かり', 'し', 'き', 'かる', 'けれ', 'かれ', 'う'];        // 形容詞ク活用（語幹に付く。「う」はウ音便）
const SHIKU = ['く', 'から', 'く', 'かり', '', 'き', 'かる', 'けれ', 'かれ', 'う'];       // 形容詞シク活用（終止形「〜し」「〜じ」に付く）
const NARI = ['なら', 'なり', 'に', 'なり', 'なる', 'なれ', 'なれ'];
const TARI = ['たら', 'たり', 'と', 'たり', 'たる', 'たれ', 'たれ'];
const ZU = ['ず', 'ざら', 'ず', 'ざり', 'ず', 'ぬ', 'ざる', 'ね', 'ざれ', 'ざれ'];        // 打消の「ず」で終わる連語（ひとやりならず など）

const fill = (row, pat) => pat.replace(/[aiue]/g, c => row['aiue'.indexOf(c)]);
const cut = (r, n) => r.slice(0, r.length - n);

// 品詞の書き方を分ける: 「動カ四・下二」→ 動カ四 と 動カ下二、「副・形動ナリ」→ 副 と 形動ナリ
function kinds(pos) {
  const out = []; let cls = '', row = '';
  for (let t of String(pos).split('・')) {
    const m = /^(形動|動|形|名|副|連語|連体|感動|接)(.*)$/.exec(t);
    if (m) { cls = m[1]; t = m[2]; row = ''; }
    if (cls === '動') { const v = /^([ア-ワ])?(.+)$/.exec(t); if (v && v[1]) row = v[1]; out.push({ cls, row, type: v ? v[2] : '' }); }
    else out.push({ cls, type: t });
  }
  return out;
}

// 読み r（終止形・かな）と品詞から、活用形（と、形容詞・形容動詞の語幹）をすべて返す。活用しない語は r だけ
function paradigm(r, pos) {
  const forms = new Set([r]), last = r.slice(-1), add = (stem, ends) => ends.forEach(e => forms.add(stem + e));
  for (const k of kinds(pos)) {
    if (k.cls === '動') {
      if (k.type === '変') {
        const h = HEN[k.row === 'サ' && last === 'ず' ? 'ザ' : k.row];
        if (h && last === h[0]) add(cut(r, 1), h[1]);
      } else if (k.type === '上一' || k.type === '下一') {
        if (last === 'る') add(cut(r, 1), ['', '', 'る', 'る', 'れ', 'よ']);
      } else if (DAN[k.type]) {
        const row = GYO[k.row] || Object.values(GYO).find(g => g[2] === last && last !== 'う');
        if (row && row[2] === last) add(cut(r, 1), DAN[k.type].map(p => fill(row, p)));
      }
    } else if (k.cls === '形') {
      const stem = cut(r, 1);
      if ((k.type === 'ク' || !k.type) && last === 'し') add(stem, KU);
      if ((k.type === 'シク' || !k.type) && (last === 'し' || last === 'じ')) add(r, SHIKU);
      if (stem.length >= 3 && (last === 'し' || last === 'じ')) forms.add(stem); // 語幹の用法（あたら夜 など）。短い語幹は別の語に当たるので認めない
    } else if (k.cls === '形動') {
      if (k.type !== 'タリ' && r.endsWith('なり')) add(cut(r, 2), NARI);
      else if (r.endsWith('たり')) add(cut(r, 2), TARI);
      else continue;
      if (cut(r, 2).length >= 3) forms.add(cut(r, 2)); // 語幹の用法（おぼろけの人 など）。形容詞と同じく3字以上だけ
    } else if (k.cls === '連語') {
      if (r.endsWith('なり')) add(cut(r, 2), NARI);
      else if (last === 'ず') add(cut(r, 1), ZU);
      else if (r.endsWith('なし')) add(cut(r, 1), KU);
      else if (r.endsWith('あり')) add(cut(r, 1), HEN['ラ'][1]);
    }
  }
  forms.delete('');
  return forms;
}

// 見出し語から、空所の候補になる語（かな）を取り出す。「・」で分け、「〜」があればその前（無ければ後ろ）を使う。
// かな以外（「打消」「禁止」などの説明）は語ではないので捨てる。
function readings(w) {
  return String(w).split('・').map(a => { const p = a.split('〜'); return p[0] || p[1] || ''; }).filter(isKana);
}

// 見出し語 w・品詞 pos の語が用例に出るときの形（かな）→ その終止形
function kanaForms(w, pos) {
  const m = new Map();
  for (const r of readings(w)) for (const f of paradigm(r, pos)) if (!m.has(f)) m.set(f, r);
  return m;
}

// 書き方 hit（漢字まじり）が、読み y の書き方として、漢字表記 k と矛盾しないか。
// hit の漢字はすべて k にあり、かなの部分は y と同じ位置関係で合う（漢字1字は1字以上のかなに当たる）。
function writes(hit, y, k) {
  if (hit === y) return true;
  let re = '^';
  for (const c of hit) {
    if (isKana(c)) re += c;
    else { if (!String(k).includes(c)) return false; re += '.+'; }
  }
  return new RegExp(re + '$').test(y);
}

module.exports = { GYO, isKana, kinds, paradigm, readings, kanaForms, writes };
