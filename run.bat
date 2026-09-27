@echo off
cd /d "%~dp0"
call npm install
node minecraft-verision-installer.js
pause
