// ============================================================
// Electron メインプロセス（Phase 2 用）
// 使い方: npm install electron && npx electron electron/main.js
// ============================================================

const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

// CONFIG を Node 側でも読めるよう簡易設定
const MONITOR_BEZEL = 20;

let windows = [];

function createWindows() {
  const displays = screen.getAllDisplays();

  displays.forEach((display, i) => {
    const { x, y, width, height } = display.bounds;

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreen: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const indexPath = path.join(__dirname, "..", "index.html");
    win.loadFile(indexPath, { query: { monitor: String(i) } });

    // 開発時のみ DevTools を開く
    if (process.env.NODE_ENV === "development") {
      win.webContents.openDevTools({ mode: "detach" });
    }

    windows.push(win);
  });
}

app.whenReady().then(() => {
  createWindows();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ESCキーで全ウィンドウを閉じる（スクリーンセイバー解除）
ipcMain.on("exit-screensaver", () => {
  windows.forEach(w => w.close());
  windows = [];
  app.quit();
});
