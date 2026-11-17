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
  // .sgrid には、選択中の教材の苦手ワードの枠も入っている（凡例が無い）。教材の枠だけを数える
  return page.$$eval('.sgrid .panel', ps => Object.fromEntries(ps.filter(p => p.querySelector('.legend')).map(p => {
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

// フラッシュカードで1問答える: 表面なら「答えを見る」でめくってから、「覚えた」（ok）か「まだ」を押す。
// めくった直後は判定ボタンが押せないので、押せるようになるのを待つ（click が待つ）
async function ans(page, ok = true) {
  if (await page.locator('.actions [data-flip]').count()) await page.click('.actions [data-flip]');
  await page.click(`[data-ans="${ok ? 1 : 0}"]`);
}

// 成績タブの「データ管理」（バックアップ・記録のリセット）は折りたたみの中にある。閉じていれば開く
async function dm(page) {
  if (await page.locator('details[data-dm]').count() && !(await page.$eval('details[data-dm]', d => d.open))) await page.click('details[data-dm] > summary');
}

// 端末の日付を days 日ずらす（今の時刻からの差。負なら過去）。ページの Date を差し替える。再読み込みのあとも同じずれで始まる。
// 復習の間隔（日をあけると出る・同じ日は段階が上がらない）のテストに使う
async function clock(page, days) {
  const set = ms => {
    const R = window.__RealDate || (window.__RealDate = Date);
    window.__dateOff = ms;
    if (window.Date === R) window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + window.__dateOff); } static now() { return R.now() + window.__dateOff; } };
  };
  await page.context().addInitScript(set, days * 864e5);
  await page.evaluate(set, days * 864e5);
}
// 端末のローカル日付（'YYYY-MM-DD'）。days 日後
function ymd(days = 0) { const d = new Date(Date.now() + days * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// 4択で1問答える: 正答（ok）か、正答でない選択肢を押す（「次へ」は押さない）。
// 間違えた語は同じセットにもう一度出て問題数が増えるので、正誤を問わないテストは正答を押して進める
async function pick(page, ok = true) {
  const i = await page.evaluate(want => { const s = window.__tangoTest.session(), it = s.items[s.i]; return s.choices.findIndex(x => (x.id === it.id) === want); }, ok);
  await page.click(`[data-pick="${i}"]`);
}

module.exports = { pick, clock, ymd, ROOT, KEY, BAK, quit, ans, dm, tmpDir, cleanup, repoMigrations, chain, build, open, openMore, raw, stored, statCounts };
