@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 pause
