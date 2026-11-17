// ビルドの手順のテスト（ブラウザを使わない）。実行: node tests/build.test.js
// リポジトリの一部（book/ src/ tools/ build.js build_all.sh）を一時フォルダに写し、そこで生成を行う。
// 入力の不備（列の数の違い、JSON の読み込み失敗、必要なファイルの欠け）で、黙って飛ばさずエラーで止まることと、
// build_all.sh でまっさらな状態から作り直した完成版が、コミットされているものと一致することを確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const H = require('./helpers');

const ROOT = H.ROOT;
const tmps = [];
test.after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });

// 写しを作る（生成物 src/*_data.js も入る。index.html と dist/ は入れない）
function copy() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-drill-build-')); tmps.push(d);
  for (const x of ['book', 'src', 'tools', 'build.js', 'build_all.sh'])
    fs.cpSync(path.join(ROOT, x), path.join(d, x), { recursive: true, filter: s => !/__pycache__/.test(s) });
  return d;
}
const run = (dir, cmd, args) => { const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const py = (dir, script) => run(dir, 'python3', [path.join(dir, 'book', script)]);
const node = dir => run(dir, process.execPath, [path.join(dir, 'build.js')]);
const edit = (dir, rel, fn) => { const f = path.join(dir, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8'))); };
// n 行目（コメントを除いたデータの1行目なら n=1）に列を1つ足す
const addCol = (s, n = 1) => { let k = 0; return s.split('\n').map(l => (l && !l.startsWith('#') && ++k === n ? l + '\t余分' : l)).join('\n'); };

test('build_book.py: 関連語の行の列の数が違うと、ファイル名と行番号を出して止まる', () => {
  const d = copy();
  edit(d, 'book/mm_related.tsv', s => addCol(s, 3));
  const r = py(d, 'build_book.py');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /mm_related\.tsv:3: 列の数/);
});

test('build_book.py: 本の番号つきの語の行の列の数が違うと止まる', () => {
  const d = copy();
  edit(d, 'book/mm_numbered.tsv', s => addCol(s, 5));
  const r = py(d, 'build_book.py');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /mm_numbered\.tsv:5: 列の数/);
});

test('build_book.py: 用例（exs_out_*.json）や見直し（book_overrides.json）が欠けていたら、飛ばさずに止まる', () => {
  for (const f of ['exs_out_2.json', 'book_overrides.json', 'mm_new97.json']) {
    const d = copy();
    fs.rmSync(path.join(d, 'book', f));
    const r = py(d, 'build_book.py');
    assert.notEqual(r.status, 0, f + ' を消しても止まらない: ' + r.out);
    assert.match(r.out, new RegExp(f.replace('.', '\\.')));
  }
});

test('build_book.py: JSON が読み取れないと、ファイル名を出して止まる', () => {
  const d = copy();
  edit(d, 'book/exs_out_1.json', s => s.slice(0, -10));
  const r = py(d, 'build_book.py');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /exs_out_1\.json: 読み取れません/);
});

test('build_book.py: 用例の数が意味の数と合わない語があると止まる（用例を黙って捨てない）', () => {
  const d = copy();
  edit(d, 'book/exs_out_1.json', s => { const a = JSON.parse(s); a[0].exs.push(['余分の用例', '訳']); return JSON.stringify(a); });
  const r = py(d, 'build_book.py');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /用例の数/);
});

test('build_joshiki.py: 古文常識の行の列の数が違う（5か6でない）と止まる', () => {
  const d = copy();
  edit(d, 'book/joshiki.tsv', s => addCol(addCol(s, 2), 2));
  const r = py(d, 'build_joshiki.py');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /joshiki\.tsv:\d+: 列の数/);
});

test('build_extra.py: 文学史の行の列の数が違うと、黙って詰めたり切ったりせずに止まる', () => {
  for (const fn of [s => addCol(s, 1), s => s.replace(/^([^#\n][^\n]*)\t[^\t\n]*$/m, '$1')]) {
    const d = copy();
    edit(d, 'book/bungakushi.tsv', fn);
    const r = py(d, 'build_extra.py');
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /bungakushi\.tsv:\d+: 列の数/);
  }
});

test('build_extra.py: seiritsu.json が読み取れないと、ファイル名を出して止まる', () => {
  const d = copy();
  edit(d, 'book/seiritsu.json', s => s + ',');
  const r = py(d, 'build_extra.py');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /seiritsu\.json: 読み取れません/);
});

test('build.js: 例文ファイル（src/exs/*.json）が読み取れないと、警告で済ませずに止まる', () => {
  const d = copy();
  edit(d, 'src/exs/eigo_1.json', s => s.slice(0, -10));
  const r = node(d);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /src\/exs\/eigo_1\.json: 読み取れません/);
});

test('build.js: チャンクの JSON が読み取れないと、ファイル名を出して止まる', () => {
  const d = copy();
  edit(d, 'src/chunks/eigo_a.json', s => s.slice(0, -10));
  const r = node(d);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /src\/chunks\/eigo_a\.json: 読み取れません/);
});

test('build.js: 生成データ（src/book_data.js など）が無いと、黙って除かずに止まる', () => {
  for (const f of ['book_data.js', 'joshiki_data.js', 'extra_data.js', 'joshiki_img.js']) {
    const d = copy();
    fs.rmSync(path.join(d, 'src', f));
    const r = node(d);
    assert.notEqual(r.status, 0, f + ' を消しても止まらない: ' + r.out);
    assert.match(r.out, new RegExp('src/' + f.replace('.', '\\.')));
  }
});

test('Python の組み立てスクリプトは Python 3.11 でも読める（README に書いた版）', t => {
  const ok = spawnSync('python3.11', ['--version']).status === 0;
  if (!ok) return t.skip('python3.11 がありません');
  for (const f of ['build_book.py', 'build_joshiki.py', 'build_extra.py', 'tables_data.py', 'inputs.py']) {
    const r = spawnSync('python3.11', ['-c', 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())', path.join(ROOT, 'book', f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, f + ': ' + r.stderr);
  }
});

test('build_all.sh: まっさらな状態から作り直した完成版と生成データが、コミットされているものと一致する', () => {
  const d = copy();
  for (const f of ['book_data.js', 'joshiki_data.js', 'extra_data.js']) fs.rmSync(path.join(d, 'src', f));
  const r = run(d, 'bash', [path.join(d, 'build_all.sh')]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /IDの検査: OK/);
  for (const f of ['index.html', 'dist/artifact.html', 'src/book_data.js', 'src/joshiki_data.js', 'src/extra_data.js'])
    assert.ok(fs.readFileSync(path.join(d, f)).equals(fs.readFileSync(path.join(ROOT, f))), f + ' がコミットされているものと違う（作り直してコミットしてください）');
});

test('build_all.sh: 途中のスクリプトが失敗したら、その先（node build.js）へ進まずに止まる', () => {
  const d = copy();
  edit(d, 'book/joshiki.tsv', s => addCol(addCol(s, 2), 2));
  const r = run(d, 'bash', [path.join(d, 'build_all.sh')]);
  assert.notEqual(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /built index\.html/);
  assert.equal(fs.existsSync(path.join(d, 'index.html')), false);
});
