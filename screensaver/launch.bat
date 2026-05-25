@echo off
:: ============================================================
:: マルチモニター スクリーンセイバー 起動スクリプト
:: ============================================================
:: 使い方：
::   launch.bat         → Chromeで起動（通常）
::   launch.bat kiosk   → Chromeキオスクモードで起動
:: ============================================================

set DIR=%~dp0
set URL=file:///%DIR:\=/%index.html

if "%1"=="kiosk" goto kiosk

:: --- 通常モード ---
start "" "chrome" ^
  --new-window ^
  --window-position=0,0 ^
  --window-size=5760,1080 ^
  "%URL%"
goto end

:kiosk
:: --- キオスクモード（フルスクリーン・アドレスバーなし）---
:: モニターごとに個別ウィンドウを開く場合は下をアンコメント
::
:: start "" "chrome" --kiosk --window-position=0,0    --window-size=1920,1080 "%URL%?monitor=0"
:: start "" "chrome" --kiosk --window-position=1920,0 --window-size=1920,1080 "%URL%?monitor=1"
:: start "" "chrome" --kiosk --window-position=3840,0 --window-size=1920,1080 "%URL%?monitor=2"

:: 拡張デスクトップ全体に1枚で表示する場合（全幅5760px）
start "" "chrome" ^
  --kiosk ^
  --window-position=0,0 ^
  --window-size=5760,1080 ^
  "%URL%"

:end
