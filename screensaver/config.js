// ============================================================
// 設定ファイル - ここを編集してカスタマイズ
// ============================================================
const CONFIG = {
  // --- モニター設定 ---
  monitors: [
    { id: 0, x: 0,    y: 0, width: 1920, height: 1080 },
    { id: 1, x: 1920, y: 0, width: 1920, height: 1080 },
    { id: 2, x: 3840, y: 0, width: 1920, height: 1080 },
  ],
  // ベゼル幅(px) - モニター境界のUI非配置ゾーン
  bezelWidth: 20,

  // --- スライドショー設定 ---
  slideshow: {
    enabled: true,
    interval: 8000,       // スライド切り替え間隔(ms)
    transition: 2000,     // フェード時間(ms)
    images: [
      // images/ フォルダに画像を置いてここに追加
      // { src: "images/bg1.jpg", label: "Scene 1" },
      // { src: "images/bg2.jpg", label: "Scene 2" },
    ],
    // 画像がない場合はグラデーションアニメーションを表示
    fallbackGradients: [
      "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      "linear-gradient(135deg, #141e30, #243b55, #0f2027)",
      "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
    ],
  },

  // --- パララックス設定 ---
  parallax: {
    enabled: true,
    speed: 0.3,           // 基準スクロール速度(px/frame)
    layers: [
      { id: "layer-sky",    speedMult: 0.1, color: "#1a1a3e" },
      { id: "layer-far",    speedMult: 0.2, color: "#162447" },
      { id: "layer-mid",    speedMult: 0.4, color: "#1f4068" },
      { id: "layer-near",   speedMult: 0.7, color: "#1b262c" },
      { id: "layer-ground", speedMult: 1.0, color: "#0d0d0d" },
    ],
  },

  // --- パーティクル設定 ---
  particles: {
    enabled: true,
    count: 80,
    color: "rgba(255, 255, 255, 0.6)",
    minSize: 1,
    maxSize: 3,
    minSpeed: 0.1,
    maxSpeed: 0.5,
  },

  // --- 時計設定 ---
  clock: {
    locale: "ja-JP",
    timezone: "Asia/Tokyo",
    showSeconds: true,
    dateFormat: { year: "numeric", month: "long", day: "numeric" },
    days: ["日", "月", "火", "水", "木", "金", "土"],
  },

  // --- ティッカー（流れるテキスト）設定 ---
  ticker: {
    enabled: true,
    speed: 80,            // px/秒
    messages: [
      "マルチモニター スクリーンセイバー",
      "社内サイネージシステム",
      "ここにお知らせを追加してください",
    ],
  },

  // --- KPI設定 ---
  kpi: {
    // APIエンドポイントがある場合は url を設定
    // 現在はダミーデータを表示
    items: [
      { id: "kpi-val-1", label: "売上", unit: "万円", demoValue: 1234 },
      { id: "kpi-val-2", label: "件数", unit: "件",   demoValue: 56 },
      { id: "kpi-val-3", label: "達成率", unit: "%",  demoValue: 87 },
    ],
    refreshInterval: 60000,  // ms
    apiUrl: null,            // "https://your-api.example.com/kpi" など
  },

  // --- UIパネル表示設定 ---
  ui: {
    showLeftPanel: true,
    showCenterPanel: true,
    showRightPanel: true,
    showTickerBar: true,
    opacity: 0.92,
  },
};
