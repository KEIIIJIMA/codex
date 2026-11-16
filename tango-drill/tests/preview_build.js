// テスト用の道具: リポジトリの index.html を書き換えずに、いまのソースから完成版を別のフォルダに作る。
// 使い方: node tests/preview_build.js <出力フォルダ>   → <出力フォルダ>/index.html と artifact.html ができる
// 環境変数 TEST_OVERRIDES='{"src/migrations.json":"/別の/ファイル.json"}' を渡すと、
// build.js が読むファイル（tango-drill/ からの相対パスで指定）を別のファイルに差し替える。
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
if (!process.argv[2]) { console.error('使い方: node tests/preview_build.js <出力フォルダ>'); process.exit(2); }
const out = path.resolve(process.argv[2]);
const over = {};
for (const [rel, file] of Object.entries(JSON.parse(process.env.TEST_OVERRIDES || '{}'))) over[path.join(root, rel)] = file;
const { writeFileSync, readFileSync, mkdirSync, existsSync } = fs;
mkdirSync(out, { recursive: true });
fs.writeFileSync = (f, d) => writeFileSync(path.join(out, path.basename(String(f))), d);
fs.mkdirSync = (d, o) => (path.resolve(String(d)).startsWith(root) ? undefined : mkdirSync(d, o));
fs.readFileSync = (f, ...a) => readFileSync(over[path.resolve(String(f))] || f, ...a);
fs.existsSync = f => (over[path.resolve(String(f))] ? true : existsSync(f));
require(path.join(root, 'build.js'));
