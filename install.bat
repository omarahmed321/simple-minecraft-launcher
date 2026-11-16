@echo off
cd /d "%~dp0"

echo The launcher only finds java in C:\Program Files\Eclipse Adoptium
echo This is the default folder if you installed Temurin without changing it, it is already there.
echo.

choice /m "Have you already installed nodejs"
if %errorlevel%==2 winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

choice /m "Have you already installed java 8 (minecraft 1.16.5 and older) in the default folder"
if %errorlevel%==2 winget install -e --id EclipseAdoptium.Temurin.8.JRE --accept-package-agreements --accept-source-agreements

choice /m "Have you already installed java 17 (minecraft 1.17 to 1.20.4) in the default folder"
if %errorlevel%==2 winget install -e --id EclipseAdoptium.Temurin.17.JRE --accept-package-agreements --accept-source-agreements

choice /m "Have you already installed java 21 (minecraft 1.20.5 to 1.21) in the default folder"
if %errorlevel%==2 winget install -e --id EclipseAdoptium.Temurin.21.JRE --accept-package-agreements --accept-source-agreements

choice /m "Have you already installed java 25 (minecraft 26.x) in the default folder"
if %errorlevel%==2 winget install -e --id EclipseAdoptium.Temurin.25.JDK --accept-package-agreements --accept-source-agreements

choice /m "Interested in adding desktop shortcut with icon"
if %errorlevel%==1 powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Simple Minecraft Launcher (SL).lnk'); $s.TargetPath='%~dp0run.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0assets\icon.ico'; $s.Save()"

explorer.exe "%~dp0."
explorer.exe "%~dp0run.bat"
