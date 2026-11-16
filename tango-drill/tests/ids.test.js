// 項目IDの取り出しと、IDが消える更新を止める検査のテスト。実行: node tests/ids.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const H = require('./helpers');

const tool = name => path.join(H.ROOT, 'tools', name);
const ids = () => require(tool('ids.js'));
const check = () => require(tool('check_ids.js'));
const run = (name, ...args) => { const r = spawnSync(process.execPath, [tool(name), ...args], { encoding: 'utf8' }); return { status: r.status, out: r.stdout + r.stderr }; };
test.after(() => H.cleanup());

// 完成版と同じ形の小さな HTML（データの <script> と、移行表を埋め込んだアプリの <script>）
const fixture = (migrations = '[{"v":1,"map":{"y:9":"y:1"}}]') => `<!doctype html><html><body>
<script>
const KOBUN_RAW=[["あさまし","","形",["驚きあきれる"],"","","",1,["心情"]],["あく","飽く","動",["満足する"],"","","",1,["動詞"]]];
const EIGO_RAW=[["apple","名",["りんご"],"","","",1,["日常"]]];
KOBUN_RAW.push(...[["いと","","副",["とても"],"","","",1,["副詞"]]]);
EIGO_RAW.push(...[["zeal","名",["熱意"],"","","",4,["心理"]]]);
const EIGO_EXS={};
const KOBUN_EXS={};
const BOOK_RAW=[[1,"あさまし","","形",["驚く"],"","","",1,[],[["あさむ","動","驚く"],["あさましがる","動","驚きあきれる"]],null],[2,"あく","飽く","動",["満足する"],"","","",1,[],[],null]];
const BOOK_META={};
const YOMI_RAW=[[1,"朔日","ついたち","月の初め","ついたち"]];
const JOSHIKI_RAW=[["時刻","子の時","ねのとき","午前0時ごろ",300,"",1,"","clock"]];
const JOSHIKI_META={};
const EXTRA_SUBJ=[{key:"bunpo",meta:{},items:[{w:"だに",k:"体言・連体形・助詞に接続",pos:"副助詞"},{w:"や",pos:"間投助詞"}]},{key:"waka",meta:{},items:[{w:"あしひきの",k:"山",pos:"枕詞"}]}];
</script>
<script>
(function(){
'use strict';
const KEY='tango-drill-v1';
const MIGRATIONS=${migrations};
})();
</script></body></html>`;
const FIXTURE_IDS = ['b:1', 'b:2', 'br:1:0', 'br:1:1', 'bunpo:だに|体言・連体形・助詞に接続|副助詞', 'bunpo:や||間投助詞',
  'e:apple', 'e:zeal', 'j:子の時', 'k:あく|飽く', 'k:あさまし', 'k:いと', 'waka:あしひきの|山|枕詞', 'y:1'];

test('ids.js: 完成版の HTML から、アプリと同じ規則で全項目のIDを取り出す', () => {
  assert.deepEqual(ids().idsFromHtml(fixture()), [...FIXTURE_IDS].sort());
});

test('ids.js: 語彙データの無い HTML は、0件で通さずにエラーにする', () => {
  const { idsFromHtml } = ids();
  assert.throws(() => idsFromHtml('<html><script>const X=1;</script></html>'), /語彙データ/);
});

test('ids.js: 埋め込まれた移行表を読む。埋め込みの無い古い版は空（版0）', () => {
  assert.deepEqual(ids().migrationsFromHtml(fixture()), [{ v: 1, map: { 'y:9': 'y:1' } }]);
  assert.deepEqual(ids().migrationsFromHtml(fixture('[]')), []);
  assert.deepEqual(ids().migrationsFromHtml('<html><script>const KEY=1;</script></html>'), []);
});

test('check_ids: 基準のIDがすべて残っていれば通る', () => {
  const r = check().checkIds({ baseline: { v: 0, ids: ['a', 'b'] }, ids: ['a', 'b', 'c'], migrations: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
});

test('check_ids: 消えたIDを一覧にして失敗にする', () => {
  const r = check().checkIds({ baseline: { v: 0, ids: ['a', 'b', 'c'] }, ids: ['b'], migrations: [] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map(m => m.id), ['a', 'c']);
});

test('check_ids: 基準の版より新しい移行を番号順に当てた行き先で確かめる', () => {
  const migrations = [{ v: 1, map: { a: 'b' } }, { v: 2, map: { b: 'c' } }];
  assert.equal(check().checkIds({ baseline: { v: 0, ids: ['a'] }, ids: ['c'], migrations }).ok, true);
  const ng = check().checkIds({ baseline: { v: 0, ids: ['a'] }, ids: ['b'], migrations });
  assert.equal(ng.ok, false);
  assert.deepEqual(ng.missing, [{ id: 'a', to: 'c' }]);
});

test('check_ids: 基準の版までの移行は当てない', () => {
  // 基準が版1なら、基準の a は v:1 を当てた後の a。v:1 の a→b をもう一度当ててはいけない
  const migrations = [{ v: 1, map: { a: 'b' } }];
  assert.equal(check().checkIds({ baseline: { v: 1, ids: ['a'] }, ids: ['a'], migrations }).ok, true);
  assert.equal(check().checkIds({ baseline: { v: 1, ids: ['a'] }, ids: ['b'], migrations }).ok, false);
});

test('check_ids: 1つの移行は同時の付け替えとして扱う（入れ替え、玉突き）', () => {
  const swap = [{ v: 1, map: { a: 'b', b: 'a' } }];
  assert.equal(check().checkIds({ baseline: { v: 0, ids: ['a', 'b'] }, ids: ['a', 'b'], migrations: swap }).ok, true);
  // a→b と b→c が同じ移行にあるとき、a の行き先は b（c ではない）
  const shift = [{ v: 1, map: { a: 'b', b: 'c' } }];
  const r = check().checkIds({ baseline: { v: 0, ids: ['a'] }, ids: ['c'], migrations: shift });
  assert.deepEqual(r.missing, [{ id: 'a', to: 'b' }]);
});

test('check_ids: 新しい移行の付け替え先が完成版に無ければ失敗にする（記録が行き場を失う）', () => {
  // 基準に無い古いID（以前に切れた記録）を救う移行でも、行き先は実在しなければならない
  const r = check().checkIds({ baseline: { v: 0, ids: ['a'] }, ids: ['a'], migrations: [{ v: 1, map: { old: 'gone' } }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.dangling, [{ v: 1, from: 'old', to: 'gone' }]);
  // 後の移行でさらに付け替わって実在するIDに着くなら通る
  const ok = check().checkIds({ baseline: { v: 0, ids: ['a'] }, ids: ['a'], migrations: [{ v: 1, map: { old: 'gone' } }, { v: 2, map: { gone: 'a' } }] });
  assert.equal(ok.ok, true);
  // 基準の版までの移行は公開済みなので、ここでは調べない
  assert.equal(check().checkIds({ baseline: { v: 1, ids: ['a'] }, ids: ['a'], migrations: [{ v: 1, map: { old: 'gone' } }] }).ok, true);
});

test('check_ids.js（コマンド）: 消えたIDがあれば一覧を出して終了コード1、無ければ0', () => {
  const dir = H.tmpDir(), html = path.join(dir, 'index.html'), base = path.join(dir, 'base.json');
  fs.writeFileSync(html, fixture());
  fs.writeFileSync(base, JSON.stringify({ v: 1, ids: FIXTURE_IDS }));
  const ok = run('check_ids.js', html, base);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /IDの検査: OK/);
  // 基準が版0なら、基準の y:9 は v:1 で y:1 に付け替わるので通る。k:きえた は行き先が無い
  fs.writeFileSync(base, JSON.stringify({ v: 0, ids: [...FIXTURE_IDS, 'y:9', 'k:きえた', 'e:gone'] }));
  const ng = run('check_ids.js', html, base);
  assert.equal(ng.status, 1, ng.out);
  assert.match(ng.out, /IDの検査: 失敗/);
  assert.match(ng.out, /k:きえた/);
  assert.match(ng.out, /e:gone/);
  assert.doesNotMatch(ng.out, /y:9/);
});

test('update_baseline.js（コマンド）: 完成版のID一覧と、埋め込まれた移行表の版番号で基準を作る', () => {
  const dir = H.tmpDir(), html = path.join(dir, 'index.html'), base = path.join(dir, 'base.json');
  fs.writeFileSync(html, fixture());
  const r = run('update_baseline.js', html, base);
  assert.equal(r.status, 0, r.out);
  const b = JSON.parse(fs.readFileSync(base, 'utf8'));
  assert.equal(b.v, 1);
  assert.deepEqual(b.ids, [...FIXTURE_IDS].sort());
  assert.equal(run('check_ids.js', html, base).status, 0);
  // 版0の完成版（移行表の埋め込みなし）からは版0の基準ができる。メモも残せる
  fs.writeFileSync(html, fixture('[]'));
  assert.equal(run('update_baseline.js', html, base, '--note', '公開中の版').status, 0);
  const b0 = JSON.parse(fs.readFileSync(base, 'utf8'));
  assert.equal(b0.v, 0);
  assert.equal(b0.note, '公開中の版');
});

test('update_baseline.js（コマンド）: いまの基準の検査に通らない完成版では基準を書き換えない（--force で上書き）', () => {
  const dir = H.tmpDir(), html = path.join(dir, 'index.html'), base = path.join(dir, 'base.json');
  fs.writeFileSync(html, fixture());
  const old = JSON.stringify({ v: 1, ids: [...FIXTURE_IDS, 'k:きえた'] });
  fs.writeFileSync(base, old);
  const r = run('update_baseline.js', html, base);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /k:きえた/);
  assert.equal(fs.readFileSync(base, 'utf8'), old);
  const f = run('update_baseline.js', html, base, '--force');
  assert.equal(f.status, 0, f.out);
  assert.deepEqual(JSON.parse(fs.readFileSync(base, 'utf8')).ids, [...FIXTURE_IDS].sort());
});

test('リポジトリの移行表（src/migrations.json）: v は1からの連番、対応は 旧ID→新ID の文字列', () => {
  const migs = H.repoMigrations();
  assert.ok(migs.length >= 1, 'src/migrations.json が無いか空');
  migs.forEach((m, i) => {
    assert.equal(m.v, i + 1);
    for (const [from, to] of Object.entries(m.map)) {
      assert.ok(typeof to === 'string' && to, 'v:' + m.v + ' の「' + from + '」の付け替え先が空');
      assert.notEqual(from, to);
    }
  });
});

test('リポジトリの基準（tools/ids_baseline.json）: 版番号と、重複のないID一覧を持つ', () => {
  const b = JSON.parse(fs.readFileSync(tool('ids_baseline.json'), 'utf8'));
  assert.ok(Number.isInteger(b.v) && b.v >= 0);
  assert.ok(b.ids.length > 3000);
  assert.deepEqual(b.ids, [...new Set(b.ids)].sort());
  for (const p of ['k:', 'e:', 'b:', 'br:', 'y:', 'j:', 'bungaku:', 'waka:', 'bunpo:']) assert.ok(b.ids.some(id => id.startsWith(p)), p + ' のIDが無い');
});

// ---- build.js との組み合わせ（試験用の完成版を一時フォルダに作る。リポジトリの index.html は書き換えない） ----
let plain, liveIds, LATEST;
const prepare = () => {
  if (plain) return;
  const b = H.build();
  assert.equal(b.status, 0, b.out);
  liveIds = ids().idsFromHtml(fs.readFileSync(b.html, 'utf8'));
  LATEST = H.repoMigrations().reduce((n, m) => Math.max(n, m.v), 0);
  plain = b;
};

test('build.js: 移行表を完成版に埋め込む（HTML の区切りに見える文字があっても壊れない）', () => {
  const migrations = [{ v: 1, map: { 'x:</script><!--': 'x:ok', 'k:あ|亜': 'k:い' } }, { v: 2, map: {} }];
  const b = H.build({ migrations });
  assert.equal(b.status, 0, b.out);
  const html = fs.readFileSync(b.html, 'utf8');
  assert.deepEqual(ids().migrationsFromHtml(html), migrations);
  prepare();
  const scripts = h => h.split('</script>').length;
  assert.equal(scripts(html), scripts(fs.readFileSync(plain.html, 'utf8')), '<script> の区切りが増えている');
  assert.deepEqual(ids().migrationsFromHtml(fs.readFileSync(path.join(b.dir, 'artifact.html'), 'utf8')), migrations);
});

test('build.js: --out で作る個人用の完成版にも移行表が入る', () => {
  const b = H.build({ args: ['--out', 'personal.html'] });
  assert.equal(b.status, 0, b.out);
  const { migrationsFromHtml, latest } = ids();
  assert.equal(latest(migrationsFromHtml(fs.readFileSync(path.join(b.dir, 'personal.html'), 'utf8'))), latest(H.repoMigrations()));
});

test('build.js: 書き出した後にIDの検査をして、通れば終了コード0', () => {
  prepare();
  const b = H.build({ baseline: { v: LATEST, ids: liveIds } });
  assert.equal(b.status, 0, b.out);
  assert.match(b.out, /IDの検査: OK/);
});

test('build.js: 基準のIDが消えていたら、一覧を出して終了コード1（index.html は書き出し済み）', () => {
  prepare();
  const b = H.build({ baseline: { v: LATEST, ids: [...liveIds, 'k:きえた語|消'] } });
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /IDの検査: 失敗/);
  assert.match(b.out, /k:きえた語\|消/);
  assert.ok(fs.existsSync(b.html));
});

test('build.js: 消えたIDに移行があれば通る', () => {
  prepare();
  const migrations = [...H.repoMigrations(), { v: LATEST + 1, map: { 'k:きえた語|消': liveIds[0] } }];
  const b = H.build({ migrations, baseline: { v: LATEST, ids: [...liveIds, 'k:きえた語|消'] } });
  assert.equal(b.status, 0, b.out);
  assert.match(b.out, /IDの検査: OK/);
});

test('build.js: SKIP_ID_CHECK=1 のときは検査を飛ばす', () => {
  prepare();
  const b = H.build({ baseline: { v: LATEST, ids: [...liveIds, 'k:きえた語|消'] }, env: { SKIP_ID_CHECK: '1' } });
  assert.equal(b.status, 0, b.out);
  assert.match(b.out, /IDの検査を飛ばしました/);
});

test('build.js: 基準が読めないときは、検査なしで通さずに終了コード1', () => {
  const b = H.build({ env: { SKIP_ID_CHECK: '', TEST_OVERRIDES: JSON.stringify({ 'tools/ids_baseline.json': path.join(H.tmpDir(), 'nai.json') }) } });
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /ids_baseline\.json/);
});

test('build.js: 移行表の形が崩れていたら（連番でないなど）終了コード1', () => {
  for (const migrations of [[{ v: 2, map: {} }], [{ v: 1, map: { a: '' } }], [{ v: 1 }], { v: 1, map: {} }]) {
    const b = H.build({ migrations });
    assert.equal(b.status, 1, JSON.stringify(migrations) + '\n' + b.out);
    assert.match(b.out, /migrations\.json/);
  }
});
