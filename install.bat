@echo off
cd /d "%~dp0"
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install -e --id EclipseAdoptium.Temurin.25.JDK --accept-package-agreements --accept-source-agreements
set "PATH=%PATH%;C:\Program Files\nodejs"
for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk-25*") do set "PATH=%PATH%;%%d\bin"
call npm install
node minecraft-verision-installer.js
pause
