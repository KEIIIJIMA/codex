// 古文常識の図（月の満ち欠け、官位と官職の表）が本の図と合っていることのテスト。実行: node tests/figs.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers');

let browser, page;
test.before(async () => {
  const b = H.build();
  assert.equal(b.status, 0, b.out);
  browser = await chromium.launch();
  page = await H.open(browser, b.html, null);
  await page.click('.subtabs [data-subj="joshiki"]');
  await page.click('.tabs [data-tab="list"]');
});
test.after(async () => { if (browser) await browser.close(); H.cleanup(); });

// 単語帳で語を開き、その語の図（.figbox）を返す
async function figOf(word) {
  await page.fill('#q', word);
  await page.click(`[data-open="j:${word}"][aria-expanded="false"]`);
  return page.locator('.vdet .figbox');
}
const marked = fig => fig.locator('svg text[font-weight="700"]').allTextContents(); // 強調された月の呼び名
const rows = fig => fig.locator('table tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(c => c.textContent)));

test('月の図: 二十日余りの月は22日（本 p.301。23日ころは二十三夜の月）', async () => {
  const fig = await figOf('二十日余りの月');
  assert.deepEqual(await marked(fig), ['二十日余り']);
  const days = await fig.locator('svg text').allTextContents();
  assert.ok(days.includes('22日'));
  assert.ok(!days.includes('23日'));
});

test('月の図: 有明の月は十六夜から二十日余りまでを強調する', async () => {
  assert.deepEqual(await marked(await figOf('有明の月')), ['十六夜', '立ち待ち', '居待ち', '寝待ち', '更け待ち', '二十日余り']);
});

test('月の図: 夕月夜は本の帯のとおり望月までを強調する', async () => {
  assert.deepEqual(await marked(await figOf('夕月夜')), ['三日月', '七日', '十日余り', '十三夜', '望月']);
});

test('官位の表: 三位に参議があり、五位の守は地下（本 p.310）', async () => {
  const r = await rows(await figOf('上達部'));
  assert.deepEqual(r.find(x => x[0] === '三位'), ['三位', '大納言・中納言・参議', '上達部']);
  assert.deepEqual(r.find(x => x[0] === '四位'), ['四位', '参議・弁', '参議は上達部、ほかは殿上人']);
  assert.deepEqual(r.find(x => x[0] === '五位'), ['五位', '弁・蔵人・守（大国）', '弁・蔵人は殿上人（選ばれた人）、守は地下']);
  assert.deepEqual(r.find(x => x[0] === '六位'), ['六位', '蔵人・守（小国）', '蔵人だけ殿上人、ほかは地下']);
  assert.deepEqual(page.errors, []);
});
