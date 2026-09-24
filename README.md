# Minecraft Launcher (Custom Game Launcher, CLI)

**Status:** Local command-line tool. No live demo.

A minimal **Minecraft: Java Edition** launcher written in **Node.js** that downloads a game version directly from Mojang's servers and starts it in **offline mode**.

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Java](https://img.shields.io/badge/Java-25-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows_%7C_macOS_%7C_Linux-555555?style=flat-square)

---

## Table of Contents
- [About](#about)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Run Locally](#run-locally)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)

---

## About
This project rebuilds the core job of the official Minecraft launcher from scratch: resolving a version, downloading every file it needs, and building the exact Java command that starts the game. It talks directly to Mojang's public **piston-meta** and **resources** APIs, with no third-party launcher libraries. It is a learning-focused project and is still in active development.

---

## Architecture
The launcher runs as a single script that executes these stages in order:

1. **Version resolution**: Fetches the version manifest (`version_manifest_v2.json`), finds the configured version, and downloads its **version JSON**, which describes every file and argument the game needs.
2. **Client download**: Saves the game itself as `client-<version>.jar`.
3. **Libraries**: Downloads every library listed in the version JSON into `libraries/`, keeping Maven-style paths.
4. **Assets**: Downloads the **asset index** into `assets/indexes/`, then every asset object (sounds, textures, languages) into `assets/objects/<first 2 chars of hash>/<hash>`.
5. **Natives**: Picks the platform-specific native libraries (LWJGL, etc.) for the current OS and extracts the `.dll`, `.so`, or `.dylib` files into `natives/`.
6. **Arguments**: Evaluates the **rules** attached to each JVM and game argument, then replaces placeholders such as `${classpath}`, `${auth_player_name}`, and `${assets_root}` with real values.
7. **Offline identity**: Generates a stable **offline UUID** from the username (MD5 of `OfflinePlayer:<name>`, version 3 UUID), the same method the vanilla server uses.
8. **Launch**: Spawns `java` with the built arguments and streams the game's output to the terminal.

All files are stored in the project folder, which also acts as the **game directory** (worlds, logs, and settings are saved there).

---

## Features
- **Direct Mojang integration**: Downloads versions, libraries, and assets from official Mojang endpoints.
- **Any version by ID**: Change one constant to launch a different release or snapshot.
- **Cross-platform natives**: Detects Windows, macOS, or Linux and extracts the matching native libraries.
- **Rule-based arguments**: Builds JVM and game arguments from the version JSON instead of hardcoding them.
- **Offline mode**: Plays with a custom username and a deterministic offline UUID.
- **Memory control**: Sets the maximum heap size (`-Xmx`) from a single setting.

---

## Tech Stack
- **Runtime**: Node.js 22+ (ES modules, top-level `await`, built-in `fetch`)
- **Language**: JavaScript
- **Libraries**: [adm-zip](https://www.npmjs.com/package/adm-zip) for extracting native libraries from `.jar` archives
- **Node built-ins**: `fs/promises`, `path`, `os`, `crypto`, `child_process`
- **Game runtime**: Java (JDK or JRE) matching the version's `javaVersion.majorVersion`

---

## Run Locally

### Prerequisites
You need three things installed: **Git**, **Node.js 22 or newer**, and **Java**.

The Java version depends on the Minecraft version you launch. The version JSON states it in `javaVersion.majorVersion`:

| Minecraft version | Required Java |
|---|---|
| 26.1 and newer | Java 25 |
| 1.20.5 to 1.21.x | Java 21 |
| 1.18 to 1.20.4 | Java 17 |
| 1.17 | Java 16 |
| 1.16.5 and older | Java 8 |

The default version in this project is **26.3**, so install **Java 25**.

About **4 GB of free disk space** and an internet connection are needed for the first run.

#### Windows
Open **PowerShell** and run:
```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id EclipseAdoptium.Temurin.25.JDK -e
```
Close and reopen PowerShell so the new commands are on your `PATH`.

If `winget` is not available, install manually from [git-scm.com](https://git-scm.com/download/win), [nodejs.org](https://nodejs.org/), and [adoptium.net](https://adoptium.net/temurin/releases/?version=25). In the Temurin installer, enable **"Set JAVA_HOME"** and **"Add to PATH"**.

#### macOS
Install [Homebrew](https://brew.sh/) if you do not have it, then run:
```bash
brew install git node
brew install --cask temurin@25
```

#### Linux
**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```
For Java 25, use `sudo apt install -y openjdk-25-jdk` if your release provides it. Otherwise install **Temurin 25** from [adoptium.net](https://adoptium.net/installation/linux/).

**Arch Linux / CachyOS / Manjaro:**
```bash
sudo pacman -S --needed git nodejs npm jdk-openjdk
```

**Fedora:**
```bash
sudo dnf install -y git nodejs java-latest-openjdk
```

#### Verify the installation
On every system, these commands must work:
```bash
git --version
node --version    # v22.0.0 or higher
java --version    # 25 for Minecraft 26.x
```

### Installation
```bash
git clone https://github.com/omarahmed321/simple-minecraft-launcher.git
cd simple-minecraft-launcher
npm install
```

### Execution
```bash
npm start
```
Or run the script directly:
```bash
node minecraft-verision-installer.js
```

The **first run** downloads the client, libraries, and several thousand asset files, so it can take a while depending on your connection. When downloading finishes, the game window opens.

---

## Configuration
Settings are constants at the top of `minecraft-verision-installer.js`:

| Constant | Default | Description |
|---|---|---|
| `VERISION` | `'26.3'` | Minecraft version ID to download and launch, exactly as listed in the [version manifest](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json) |
| `USERNAME` | `'Omar'` | In-game player name (offline mode) |
| `MAX_MEMORY` | `'4G'` | Maximum Java heap size, for example `2G`, `4G`, `6G` |

If you change `VERISION`, make sure your installed Java matches the table in [Prerequisites](#prerequisites).

**Offline mode note:** The launcher does not sign in to a Microsoft account, so online servers that require authentication (and Realms) will not accept the connection. Singleplayer and offline-mode servers work.

---

## Troubleshooting
- **`java: command not found` / `'java' is not recognized`**: Java is not installed or not on your `PATH`. Reinstall it with the "Add to PATH" option, then open a new terminal.
- **`UnsupportedClassVersionError`**: Your Java is older than the version requires. Install the Java version from the table above.
- **`Cannot use import statement outside a module`**: Your Node.js is too old or `package.json` is missing `"type": "module"`. Update to Node.js 22+.
- **`Cannot find package 'adm-zip'`**: Run `npm install` inside the project folder.
- **`Cannot read properties of undefined (reading 'url')`**: The value of `VERISION` does not exist in the version manifest. Check the spelling.
- **Game crashes on startup with an `UnsatisfiedLinkError`**: The native libraries were not extracted correctly. Delete the `natives/` folder and run the launcher again.

---

## Project Structure
```
simple-minecraft-launcher/
├── minecraft-verision-installer.js   # The launcher (download, extract, launch)
├── package.json                      # Project metadata, start script, dependencies
├── package-lock.json
├── .gitignore
└── README.md

Created on first run (ignored by git):
├── client-<version>.jar              # The game client
├── libraries/                        # Java libraries in Maven layout
├── natives/                          # Extracted .dll / .so / .dylib files
├── assets/
│   ├── indexes/                      # Asset index JSON
│   └── objects/                      # Sounds, textures, languages (hashed)
├── saves/                            # Singleplayer worlds
├── logs/                             # Game logs
└── options.txt                       # Game settings
```
