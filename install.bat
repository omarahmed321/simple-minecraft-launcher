@echo off
cd /d "%~dp0"
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install -e --id EclipseAdoptium.Temurin.25.JDK --accept-package-agreements --accept-source-agreements
call npm install
node minecraft-verision-installer.js
pause
