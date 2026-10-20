@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Create .env from .env.example and set a unique password. See README.md.
  exit /b 1
)
npm start
pause