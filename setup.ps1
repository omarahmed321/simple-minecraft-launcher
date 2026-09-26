# One-line installer for Windows (PowerShell):
# irm https://raw.githubusercontent.com/omarahmed321/simple-minecraft-launcher/main/setup.ps1 | iex

$Dir = Join-Path $HOME "simple-minecraft-launcher"
$Zip = Join-Path $env:TEMP "simple-minecraft-launcher.zip"
$Src = Join-Path $env:TEMP "simple-minecraft-launcher-src"

Write-Host "Downloading the launcher to $Dir ..."
Invoke-WebRequest "https://github.com/omarahmed321/simple-minecraft-launcher/archive/refs/heads/main.zip" -OutFile $Zip -UseBasicParsing
if (Test-Path $Src) { Remove-Item $Src -Recurse -Force }
Expand-Archive $Zip -DestinationPath $Src
New-Item -ItemType Directory -Force $Dir | Out-Null
Copy-Item "$Src\simple-minecraft-launcher-main\*" $Dir -Recurse -Force

Write-Host "Installing Node.js and Java 25 ..."
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install -e --id EclipseAdoptium.Temurin.25.JDK --accept-package-agreements --accept-source-agreements

# Load the new PATH so node, npm and java work in this same window
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

Set-Location $Dir
npm.cmd install
node minecraft-verision-installer.js
