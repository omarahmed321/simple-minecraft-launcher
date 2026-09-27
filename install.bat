@echo off
cd /d "%~dp0"
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install -e --id EclipseAdoptium.Temurin.25.JDK --accept-package-agreements --accept-source-agreements
explorer.exe "%~dp0."
explorer.exe "%~dp0run.bat"
