// ============================================================
// マルチモニター スクリーンセイバー - メインスクリプト
// ============================================================

(function () {
  "use strict";

  // BroadcastChannel で複数ウィンドウを同期
  const channel = new BroadcastChannel("screensaver-sync");

  // URLパラメータからモニター番号を取得（?monitor=0 など）
  const monitorIndex = parseInt(new URLSearchParams(location.search).get("monitor") ?? "0");

  // ============================================================
  // 初期化
  // ============================================================

  function init() {
    setupParallax();
    setupSlideshow();
    setupParticles();
    setupClock();
    setupTicker();
    setupKPI();
    setupBroadcast();
    if (!CONFIG.ui.showLeftPanel)   document.getElementById("panel-left").style.display   = "none";
    if (!CONFIG.ui.showCenterPanel) document.getElementById("panel-center").style.display = "none";
    if (!CONFIG.ui.showRightPanel)  document.getElementById("panel-right").style.display  = "none";
    if (!CONFIG.ui.showTickerBar)   document.getElementById("ticker-bar").style.display   = "none";
  }

  // ============================================================
  // パララックス
  // ============================================================

  let parallaxOffset = 0;

  function setupParallax() {
    if (!CONFIG.parallax.enabled) return;

    CONFIG.parallax.layers.forEach(layer => {
      const el = document.getElementById(layer.id);
      if (el) el.style.background = layer.color;
    });

    // 地面のドットパターン生成
    generateGroundPattern();

    requestAnimationFrame(animateParallax);
  }

  function animateParallax() {
    parallaxOffset += CONFIG.parallax.speed;

    CONFIG.parallax.layers.forEach(layer => {
      const el = document.getElementById(layer.id);
      if (!el) return;
      const offset = (parallaxOffset * layer.speedMult) % window.innerWidth;
      el.style.transform = `translateX(-${offset}px)`;
    });

    requestAnimationFrame(animateParallax);
  }

  function generateGroundPattern() {
    const ground = document.getElementById("layer-ground");
    if (!ground) return;

    // ドット絵風の建物シルエットをSVGで生成
    const buildings = generateBuildingSVG();
    ground.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(buildings)}")`;
    ground.style.backgroundSize = "auto 100%";
    ground.style.backgroundRepeat = "repeat-x";
    ground.style.backgroundPosition = "bottom";
    ground.style.backgroundColor = "#0d0d1a";
  }

  function generateBuildingSVG() {
    const w = 400, h = 120;
    const buildings = [];
    let x = 0;

    while (x < w) {
      const bw = 20 + Math.floor(Math.random() * 40);
      const bh = 30 + Math.floor(Math.random() * 80);
      const shade = Math.floor(10 + Math.random() * 20);
      buildings.push(`<rect x="${x}" y="${h - bh}" width="${bw - 2}" height="${bh}" fill="rgb(${shade},${shade},${shade + 10})"/>`);
      // 窓
      for (let wy = h - bh + 6; wy < h - 4; wy += 10) {
        for (let wx = x + 4; wx < x + bw - 6; wx += 8) {
          if (Math.random() > 0.4) {
            buildings.push(`<rect x="${wx}" y="${wy}" width="4" height="5" fill="rgba(255,220,100,0.6)"/>`);
          }
        }
      }
      x += bw + 2;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${buildings.join("")}</svg>`;
  }

  // ============================================================
  // スライドショー
  // ============================================================

  let currentSlide = 0;
  const slides = document.querySelectorAll(".slide");

  function setupSlideshow() {
    if (!CONFIG.slideshow.enabled) return;

    const { images, fallbackGradients } = CONFIG.slideshow;

    slides.forEach((slide, i) => {
      if (images.length > 0) {
        const img = images[i % images.length];
        slide.style.backgroundImage = `url("${img.src}")`;
      } else {
        // 画像なし → グラデーションアニメーション
        slide.style.background = fallbackGradients[i % fallbackGradients.length];
        slide.classList.add("gradient-animated");
        // アニメーションの開始位置をずらしてバラつきを出す
        slide.style.animationDelay = `${-i * 4}s`;
      }
    });

    if (slides.length > 0) slides[0].classList.add("active");
    setInterval(nextSlide, CONFIG.slideshow.interval);
  }

  function nextSlide() {
    slides[currentSlide].classList.remove("active");
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add("active");

    // 他ウィンドウと同期
    channel.postMessage({ type: "slide", index: currentSlide });
  }

  // ============================================================
  // パーティクル（キャンバス）
  // ============================================================

  function setupParticles() {
    if (!CONFIG.particles.enabled) return;

    const canvas = document.getElementById("particle-canvas");
    const ctx = canvas.getContext("2d");

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: CONFIG.particles.count }, () => createParticle(canvas));

    function createParticle(canvas) {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: CONFIG.particles.minSize + Math.random() * (CONFIG.particles.maxSize - CONFIG.particles.minSize),
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(CONFIG.particles.minSpeed + Math.random() * (CONFIG.particles.maxSpeed - CONFIG.particles.minSpeed)),
        alpha: Math.random(),
        alphaDir: Math.random() > 0.5 ? 1 : -1,
      };
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.alpha += p.alphaDir * 0.005;

        if (p.alpha >= 1)   { p.alphaDir = -1; p.alpha = 1; }
        if (p.alpha <= 0)   { p.alphaDir =  1; p.alpha = 0; }
        if (p.y < 0)         { p.y = canvas.height; p.x = Math.random() * canvas.width; }
        if (p.x < 0)         { p.x = canvas.width; }
        if (p.x > canvas.width) { p.x = 0; }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.7})`;
        ctx.fill();
      });

      requestAnimationFrame(drawParticles);
    }

    requestAnimationFrame(drawParticles);
  }

  // ============================================================
  // 時計
  // ============================================================

  function setupClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }

  function updateClock() {
    const { locale, timezone, showSeconds, dateFormat, days } = CONFIG.clock;
    const now = new Date();
    const opts = { timeZone: timezone };

    // 日付
    const dateEl = document.getElementById("clock-date");
    if (dateEl) dateEl.textContent = now.toLocaleDateString(locale, { ...opts, ...dateFormat });

    // 時刻
    const timeEl = document.getElementById("clock-time");
    if (timeEl) {
      const timeStr = now.toLocaleTimeString(locale, {
        ...opts,
        hour: "2-digit",
        minute: "2-digit",
        second: showSeconds ? "2-digit" : undefined,
        hour12: false,
      });
      timeEl.textContent = timeStr;
    }

    // 曜日
    const dayEl = document.getElementById("clock-day");
    if (dayEl) dayEl.textContent = `（${days[now.getDay()]}）`;
  }

  // ============================================================
  // ティッカー（流れるテキスト）
  // ============================================================

  function setupTicker() {
    if (!CONFIG.ticker.enabled) return;

    const content = document.getElementById("ticker-content");
    if (!content) return;

    const separator = "　　　　✦　　　　";
    const text = CONFIG.ticker.messages.join(separator) + separator;
    content.textContent = text + text;  // 2回繰り返してシームレスループ

    let x = 0;
    let lastTime = null;

    const fullWidth = content.scrollWidth / 2;  // 1周分の幅

    function animateTicker(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const delta = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      x -= CONFIG.ticker.speed * delta;
      if (x <= -fullWidth) x = 0;

      content.style.transform = `translateX(${x}px)`;
      requestAnimationFrame(animateTicker);
    }

    requestAnimationFrame(animateTicker);
  }

  // ============================================================
  // KPI
  // ============================================================

  function setupKPI() {
    loadKPI();
    setInterval(loadKPI, CONFIG.kpi.refreshInterval);
  }

  async function loadKPI() {
    const { items, apiUrl } = CONFIG.kpi;

    if (apiUrl) {
      try {
        const res = await fetch(apiUrl);
        const data = await res.json();
        items.forEach(item => {
          const val = data[item.id];
          if (val !== undefined) updateKPIValue(item.id, val, item.unit);
        });
        return;
      } catch (e) {
        // APIエラー時はデモデータにフォールバック
      }
    }

    // デモデータ表示
    items.forEach(item => {
      updateKPIValue(item.id, item.demoValue, item.unit);
    });
  }

  function updateKPIValue(id, value, unit) {
    const el = document.getElementById(id);
    if (!el) return;

    const formatted = typeof value === "number"
      ? value.toLocaleString("ja-JP")
      : value;

    el.textContent = formatted + (unit ? ` ${unit}` : "");
    el.classList.remove("updated");
    void el.offsetWidth;  // リフロー強制でアニメーションリセット
    el.classList.add("updated");
    setTimeout(() => el.classList.remove("updated"), 1500);
  }

  // ============================================================
  // BroadcastChannel（マルチウィンドウ同期）
  // ============================================================

  function setupBroadcast() {
    channel.onmessage = (event) => {
      const { type, index } = event.data;

      if (type === "slide") {
        // 他ウィンドウからのスライド切り替え通知
        slides[currentSlide].classList.remove("active");
        currentSlide = index;
        slides[currentSlide].classList.add("active");
      }
    };
  }

  // ============================================================
  // ウィンドウ起動（マルチモニター用）
  // ============================================================

  // 別ウィンドウを開くユーティリティ（Electron化前の確認用）
  window.openMonitorWindows = function () {
    CONFIG.monitors.forEach((monitor, i) => {
      if (i === 0) return;  // 現在のウィンドウはモニター0

      const url = `${location.href.split("?")[0]}?monitor=${i}`;
      window.open(url, `monitor-${i}`,
        `left=${monitor.x},top=${monitor.y},width=${monitor.width},height=${monitor.height},` +
        "menubar=no,toolbar=no,location=no,status=no"
      );
    });
  };

  // ============================================================
  // エントリーポイント
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
