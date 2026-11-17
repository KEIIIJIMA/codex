// テスト共通の道具: 試験用の完成版を一時フォルダに作る／保存データを入れてからアプリを開く。
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.join(__dirname, '..');
const KEY = 'tango-drill-v1', BAK = KEY + '-bak';

const dirs = [];
function tmpDir() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-drill-test-')); dirs.push(d); return d; }
function cleanup() { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); }

// リポジトリの移行表（src/migrations.json）。無ければ空。
function repoMigrations() {
  const f = path.join(ROOT, 'src/migrations.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}
// 期待値の計算用: ID に移行を番号順に当てた行き先
const chain = (migs, id, from = 0) => migs.reduce((x, m) => (m.v > from && Object.hasOwn(m.map, x) ? m.map[x] : x), id);

// いまのソースから完成版を一時フォルダに作る（リポジトリの index.html は書き換えない）。
//   opts.migrations: src/migrations.json の代わりに埋め込む移行の配列
//   opts.baseline:   tools/ids_baseline.json の代わりに使う基準。渡したときだけ ID の検査をする
//   opts.env:        追加の環境変数
//   opts.args:       build.js に渡す引数（例: ['--out', 'personal.html']。書き出し先は同じ一時フォルダになる）
// 戻り値: { dir, html, status, out }
function build(opts = {}) {
  const dir = tmpDir(), over = {};
  const put = (rel, name, obj) => { over[rel] = path.join(dir, name); fs.writeFileSync(over[rel], JSON.stringify(obj)); };
  if (opts.migrations) put('src/migrations.json', 'in.migrations.json', opts.migrations);
  if (opts.baseline) put('tools/ids_baseline.json', 'in.baseline.json', opts.baseline);
  const env = Object.assign({}, process.env, { TEST_OVERRIDES: JSON.stringify(over) });
  if (opts.baseline) delete env.SKIP_ID_CHECK; else env.SKIP_ID_CHECK = '1';
  Object.assign(env, opts.env || {});
  const r = spawnSync(process.execPath, [path.join(__dirname, 'preview_build.js'), dir, ...(opts.args || [])], { env, encoding: 'utf8' });
  return { dir, html: path.join(dir, 'index.html'), status: r.status, out: r.stdout + r.stderr };
}

// 保存データを先に入れてから、完成版を開く。
//   stored: キー tango-drill-v1 に入れる文字列（null なら何も入れない＝初めての利用者）
//   ctxOpts: ブラウザの文脈の設定（例: スマホを模す { viewport, hasTouch: true, isMobile: true }）
// 戻り値の page.errors にページ内のエラーがたまる。
async function open(browser, html, stored, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || {});
  // 「記録をコピー」は、クリップボードが使えないとき入力欄に書き出す。テストではその経路を使う
  await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) {} });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  const seed = path.join(path.dirname(html), 'seed.html');
  if (!fs.existsSync(seed)) fs.writeFileSync(seed, '<!doctype html><meta charset="utf-8"><title>seed</title>');
  await page.goto('file://' + seed);
  if (stored != null) await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, stored]);
  await page.goto('file://' + html);
  await page.waitForSelector('#view > *');
  return page;
}
// 同じブラウザ（同じ保存データ）で、完成版をもう1ページ開く（2つのタブで同時に開いた状態を作る）
async function openMore(page, html) {
  const p = await page.context().newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.goto('file://' + html);
  await p.waitForSelector('#view > *');
  return p;
}
const raw = (page, key = KEY) => page.evaluate(k => localStorage.getItem(k), key);
const stored = async page => JSON.parse(await raw(page));

// 成績タブの科目ごとの数: { 科目名: { 習得, 学習中, 苦手, 未学習 } }
async function statCounts(page) {
  await page.click('.tabs [data-tab="stats"]');
  return page.$$eval('.sgrid .panel', ps => Object.fromEntries(ps.map(p => {
    const name = p.querySelector('h2').firstChild.textContent.trim(), c = {};
    p.querySelectorAll('.legend span').forEach(s => { const m = s.textContent.match(/^(\S+) (\d+)$/); if (m) c[m[1]] = +m[2]; });
    return [name, c];
  })));
}

// 学習の途中の「中断」: 確認が出たら「中断する」を押してホームに戻る（結果画面の「ホームへ」は確認なしで戻る）
async function quit(page) {
  await page.click('[data-quit]');
  if (await page.locator('[data-leave="yes"]').count()) await page.click('[data-leave="yes"]');
}

module.exports = { ROOT, KEY, BAK, quit, tmpDir, cleanup, repoMigrations, chain, build, open, openMore, raw, stored, statCounts };
