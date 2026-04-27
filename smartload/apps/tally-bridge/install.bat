@echo off
setlocal
cd /d "%~dp0"
echo == SmartLoad Tally Bridge - Windows service installer ==
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not in PATH. Install Node.js 20+ LTS first.
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm is not in PATH. Install: npm install -g pnpm
  exit /b 1
)
if not exist "node_modules" call pnpm install
if not exist "dist\index.js" call pnpm run build
node install-service.cjs
if errorlevel 1 exit /b 1
echo.
echo Done. Ensure TallyPrime is running with ^"Allow HTTP^" and port 9000 (or set TALLY_URL^).
endlocal
pause
