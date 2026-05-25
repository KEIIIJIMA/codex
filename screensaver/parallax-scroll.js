// マリオ風オリジナルドット絵 横スクロールシーン
// 著作権フリー・完全オリジナルデザイン
(function () {
  'use strict';

  const PIXEL = 3; // 1ゲームピクセル = 3px

  // NESインスパイア・オリジナルカラーパレット
  const C = {
    skyTop:   '#1a6fdb',
    skyBot:   '#72b4ff',
    cloud:    '#ffffff',
    cloudSh:  '#c8d8f8',
    mtnA:     '#6878b8',
    mtnASh:   '#3848a0',
    mtnSnow:  '#e8f0ff',
    hillTop:  '#00a808',
    hillSh:   '#007000',
    grass:    '#58d454',
    grassHi:  '#80e860',
    dirt:     '#c04c10',
    dirtDk:   '#803008',
    brick:    '#8c3800',
    pipeTop:  '#60d060',
    pipeBody: '#38a038',
    pipeDk:   '#1c7020',
    blockYel: '#e8c040',
    blockSide:'#c09030',
    blockDk:  '#906810',
    bushHi:   '#80e840',
    bush:     '#38a808',
    bushDk:   '#1c7000',
  };

  function px(n)   { return n * PIXEL; }
  function snap(v) { return Math.round(v / PIXEL) * PIXEL; }

  let canvas, ctx, W, H;
  let scrollX = 0;
  let cloudCache = null;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;
    cloudCache = null;
  }

  function groundY() { return snap(H * 0.82); }

  // ── ユーティリティ ──────────────────────────────────────────

  function fillOval(cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(snap(cx), snap(cy), snap(rx), snap(ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // シード付き乱数（同じ引数で常に同じ値を返す）
  function rand(seed, offset) {
    const s = Math.sin((seed + 1) * 9301 + (offset + 1) * 49297) * 233280;
    return s - Math.floor(s);
  }

  // ── 空 ─────────────────────────────────────────────────────

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, groundY());
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY());
  }

  // ── 雲 ─────────────────────────────────────────────────────

  const CLOUD_WORLD = 2; // ワールド幅 = W × CLOUD_WORLD

  function buildCloudDefs() {
    if (cloudCache) return cloudCache;
    const cw = W * CLOUD_WORLD;
    const defs = [];
    for (let i = 0; i < 10; i++) {
      defs.push({
        wx:    rand(i, 0) * cw,
        wy:    snap(H * 0.05 + rand(i, 1) * H * 0.28),
        scale: 0.5 + rand(i, 2) * 0.9,
      });
    }
    cloudCache = defs;
    return defs;
  }

  function drawClouds(camX) {
    const cw = W * CLOUD_WORLD;
    buildCloudDefs().forEach(({ wx, wy, scale }) => {
      const base = ((wx - camX) % cw + cw) % cw;
      // 主位置 + ループ端の折り返し描画
      [base, base - cw].forEach(sx => {
        if (sx > -px(90) * scale && sx < W + px(90) * scale) {
          drawCloud(sx, wy, scale);
        }
      });
    });
  }

  // 雲：4つの楕円を組み合わせたオリジナル形状
  function drawCloud(x, y, scale) {
    const u = px(6) * scale;
    ctx.fillStyle = C.cloud;
    fillOval(x + u * 0.5,  y + u * 1.1, u * 0.9, u * 0.65); // 左
    fillOval(x + u * 1.5,  y + u * 0.6, u * 1.1, u * 0.85); // 中央上
    fillOval(x + u * 2.6,  y + u * 0.9, u * 0.85, u * 0.72); // 右
    fillOval(x + u * 1.55, y + u * 1.3, u * 1.5,  u * 0.45); // 底面
    // 影
    ctx.fillStyle = C.cloudSh;
    fillOval(x + u * 1.55, y + u * 1.65, u * 1.3, u * 0.18);
  }

  // ── 遠景山 ─────────────────────────────────────────────────

  function drawMountains(camX) {
    const mw = W * 1.5;
    const gy = groundY();
    for (let i = 0; i < 5; i++) {
      const wx    = rand(i, 10) * mw;
      const mh    = snap(H * (0.18 + rand(i, 11) * 0.22));
      const mHalf = snap(W * (0.08 + rand(i, 12) * 0.06));
      const base  = ((wx - camX) % mw + mw) % mw;
      [base, base - mw].forEach(sx => {
        if (sx > -mHalf * 2 && sx < W + mHalf * 2) drawMountain(sx, gy, mh, mHalf);
      });
    }
  }

  function drawMountain(cx, baseY, h, halfW) {
    const peakY = baseY - h;
    // 本体
    ctx.fillStyle = C.mtnA;
    ctx.beginPath();
    ctx.moveTo(snap(cx - halfW), baseY);
    ctx.lineTo(snap(cx), peakY);
    ctx.lineTo(snap(cx + halfW), baseY);
    ctx.closePath();
    ctx.fill();
    // 右側影面
    ctx.fillStyle = C.mtnASh;
    ctx.beginPath();
    ctx.moveTo(snap(cx), peakY);
    ctx.lineTo(snap(cx + halfW), baseY);
    ctx.lineTo(snap(cx), baseY);
    ctx.closePath();
    ctx.fill();
    // 雪帽子
    const snowH = h * 0.22;
    ctx.fillStyle = C.mtnSnow;
    ctx.beginPath();
    ctx.moveTo(snap(cx), peakY);
    ctx.lineTo(snap(cx + snowH * 0.6), snap(peakY + snowH));
    ctx.lineTo(snap(cx - snowH * 0.5), snap(peakY + snowH));
    ctx.closePath();
    ctx.fill();
  }

  // ── 丘 ─────────────────────────────────────────────────────

  function drawHills(camX) {
    const hw = W * 1.2;
    const gy = groundY();
    for (let i = 0; i < 4; i++) {
      const wx    = (i / 4 + rand(i, 20) * 0.15) * hw;
      const hh    = snap(H * (0.08 + rand(i, 21) * 0.12));
      const hHalf = snap(W * (0.1  + rand(i, 22) * 0.08));
      const base  = ((wx - camX) % hw + hw) % hw;
      [base, base - hw].forEach(sx => {
        if (sx > -hHalf * 2 && sx < W + hHalf * 2) drawHill(sx, gy, hh, hHalf);
      });
    }
  }

  function drawHill(cx, baseY, h, halfW) {
    // メイン
    ctx.fillStyle = C.hillTop;
    ctx.beginPath();
    ctx.ellipse(snap(cx), baseY, halfW, h, 0, Math.PI, 0);
    ctx.lineTo(snap(cx + halfW), baseY + PIXEL);
    ctx.lineTo(snap(cx - halfW), baseY + PIXEL);
    ctx.closePath();
    ctx.fill();
    // 影（右寄り楕円で表現）
    ctx.fillStyle = C.hillSh;
    ctx.beginPath();
    ctx.ellipse(snap(cx + halfW * 0.15), baseY, halfW * 0.9, h * 0.95, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // ハイライト（左上に明るい楕円を重ねる）
    ctx.fillStyle = C.hillTop;
    ctx.beginPath();
    ctx.ellipse(snap(cx - halfW * 0.08), baseY, halfW * 0.82, h * 0.88, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }

  // ── 地面 ───────────────────────────────────────────────────

  function drawGround(camX) {
    const gy = groundY();
    const gh = H - gy;
    const p  = PIXEL;

    // 草
    ctx.fillStyle = C.grassHi;
    ctx.fillRect(0, gy, W, p);
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, gy + p, W, p * 2);
    // 土
    ctx.fillStyle = C.dirt;
    ctx.fillRect(0, gy + p * 3, W, gh);

    // レンガ目地（スクロールに合わせてずれる）
    const bw = px(16);
    const bh = px(8);
    ctx.strokeStyle = C.brick;
    ctx.lineWidth = p;
    const startY = gy + p * 3;
    const rows   = Math.ceil((gh + bh) / bh);
    for (let row = 0; row < rows; row++) {
      const by   = startY + row * bh;
      const offX = row % 2 === 0 ? -(camX % bw) : -(camX % bw) + bw / 2;
      const cols = Math.ceil(W / bw) + 2;
      for (let col = -1; col <= cols; col++) {
        const bx = snap(col * bw + offX);
        ctx.strokeRect(bx + p * 0.5, snap(by) + p * 0.5, bw - p, bh - p);
      }
    }
    // 上端の影ライン
    ctx.fillStyle = C.dirtDk;
    ctx.fillRect(0, gy + p * 3, W, p);
  }

  // ── 地上オブジェクト（プロシージャル無限生成）──────────────

  const SLOT = px(52); // オブジェクト配置スロット幅

  function drawObjects(camX) {
    const start = Math.floor(camX / SLOT) - 1;
    const end   = start + Math.ceil(W / SLOT) + 3;
    for (let slot = start; slot <= end; slot++) {
      const sx = slot * SLOT - camX;
      const r  = rand(slot, 99);
      if      (r < 0.12) drawPipe(sx, px(8 + Math.floor(rand(slot, 100) * 8) * 2));
      else if (r < 0.22) drawBlocks(sx, 1 + Math.floor(rand(slot, 101) * 3));
      else if (r < 0.44) drawBush(sx, rand(slot, 102) > 0.55);
    }
  }

  function drawPipe(sx, h) {
    const gy   = groundY();
    const p    = PIXEL;
    const bw   = px(10);
    const capW = bw + px(2);
    const capH = px(4);
    const py   = gy - h;
    const cx   = snap(sx - p);

    // 本体
    ctx.fillStyle = C.pipeBody;
    ctx.fillRect(snap(sx), snap(py), bw, h);
    ctx.fillStyle = C.pipeTop;
    ctx.fillRect(snap(sx), snap(py), px(2), h);
    ctx.fillStyle = C.pipeDk;
    ctx.fillRect(snap(sx + bw - px(2)), snap(py), px(2), h);

    // キャップ
    ctx.fillStyle = C.pipeBody;
    ctx.fillRect(cx, snap(py), capW, capH);
    ctx.fillStyle = C.pipeTop;
    ctx.fillRect(cx, snap(py), capW, p);
    ctx.fillRect(cx, snap(py), px(2), capH);
    ctx.fillStyle = C.pipeDk;
    ctx.fillRect(snap(cx + capW - px(2)), snap(py), px(2), capH);
    ctx.fillRect(cx, snap(py + capH - p), capW, p);
  }

  function drawBlocks(sx, count) {
    const gy = groundY();
    const p  = PIXEL;
    const bs = px(16);
    // 浮遊高さ：地面から画面高さの22%上
    const by = snap(gy - H * 0.22);

    for (let i = 0; i < count; i++) {
      const bx = snap(sx + i * bs);
      ctx.fillStyle = C.blockSide;
      ctx.fillRect(bx, by, bs, bs);
      // 上面・左面ハイライト
      ctx.fillStyle = C.blockYel;
      ctx.fillRect(bx, by, bs, px(2));
      ctx.fillRect(bx, by, px(2), bs);
      // 右面・下面影
      ctx.fillStyle = C.blockDk;
      ctx.fillRect(bx + bs - px(2), by, px(2), bs);
      ctx.fillRect(bx, by + bs - px(2), bs, px(2));
      // 内枠
      ctx.strokeStyle = C.blockDk;
      ctx.lineWidth = p;
      ctx.strokeRect(bx + px(3), by + px(3), bs - px(6), bs - px(6));
    }
  }

  function drawBush(sx, large) {
    const gy = groundY();
    const sc = large ? 1.6 : 1.0;
    const bw = snap(px(14) * sc);
    const bh = snap(px(7)  * sc);
    const by = gy - bh;
    const bx = snap(sx);

    ctx.fillStyle = C.bush;
    fillOval(bx + bw * 0.22, by + bh * 0.55, bw * 0.28, bh * 0.65);
    fillOval(bx + bw * 0.50, by + bh * 0.35, bw * 0.35, bh * 0.80);
    fillOval(bx + bw * 0.78, by + bh * 0.55, bw * 0.26, bh * 0.60);
    // 底面を矩形で埋める
    ctx.fillRect(bx, snap(by + bh * 0.5), bw, snap(bh * 0.5 + PIXEL));

    ctx.fillStyle = C.bushHi;
    fillOval(bx + bw * 0.43, by + bh * 0.22, bw * 0.18, bh * 0.28);

    ctx.fillStyle = C.bushDk;
    ctx.fillRect(bx, snap(by + bh - PIXEL), bw, PIXEL);
  }

  // ── メインループ ────────────────────────────────────────────

  function frame() {
    const speed = CONFIG.scrollScene?.speed ?? 1.5;

    drawSky();
    drawClouds(scrollX * 0.15);
    drawMountains(scrollX * 0.35);
    drawHills(scrollX * 0.65);
    drawGround(scrollX);
    drawObjects(scrollX);

    scrollX += speed;
    requestAnimationFrame(frame);
  }

  // ── 初期化 ──────────────────────────────────────────────────

  function init() {
    if (!CONFIG.scrollScene?.enabled) return;

    canvas = document.getElementById('scroll-canvas');
    if (!canvas) return;

    canvas.style.display = 'block';
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // スクロールシーン有効時はスライドショーとCSS背景を非表示
    ['slideshow-container', 'parallax-container'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
