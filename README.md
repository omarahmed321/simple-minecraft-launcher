# Simple Minecraft Launcher (Custom Game Launcher, CLI)

**Status:** Local command-line tool. No live demo.

A **Minecraft: Java Edition** launcher written in **Node.js** that lists every official version, downloads the one you pick directly from Mojang's servers, and starts it in **offline mode**.

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Java](https://img.shields.io/badge/Java-25-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows_%7C_Linux-555555?style=flat-square)

---

## Table of Contents
- [About](#about)
- [Architecture](#architecture)
- [Features](#features)
- [Supported Versions](#supported-versions)
- [Tech Stack](#tech-stack)
- [Run Locally](#run-locally)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Code Structure](#code-structure)
- [Project Structure](#project-structure)

---

## About
This project rebuilds the core job of the official Minecraft launcher from scratch: resolving a version, downloading and verifying every file it needs, and building the exact Java command that starts the game. It talks directly to Mojang's public **piston-meta** and **resources** APIs, with no third-party launcher libraries. It understands both the modern and the legacy version formats, so one code path runs versions from **1.7.10** up to the latest release and snapshots.

---

## Architecture
The launcher is a single script that runs these stages in order:

1. **Version list**: Downloads the version manifest once and prints every version with its number and type (`release`, `snapshot`, `old_beta`, `old_alpha`).
2. **Questions**: Asks for the version number, the in-game username, and the maximum memory in GB. Every answer is validated before anything is downloaded.
3. **Version JSON**: Downloads the chosen version's JSON, which describes every file and argument the game needs.
4. **Library normalization**: Reads the `libraries` list and converts both formats into one list of `{ path, url, sha1, isNative }` entries:
   - **Modern format** (1.19+): natives are separate libraries with an `artifact`.
   - **Legacy format** (before 1.19): natives live inside one library under `natives` and `downloads.classifiers`.
5. **Java check**: Reads the required Java version from the JSON and compares it with the installed Java, before any large download starts.
6. **Downloads**: Downloads `client.jar`, the libraries, the asset index, and every asset object. Libraries and assets download in parallel with a **concurrency limit** (8 and 16 at a time).
7. **Verification**: Before downloading, every file that already exists is checked against the **SHA1** from Mojang. Valid files are skipped; missing, partial, or corrupted files are downloaded again. Failed HTTP responses stop the launcher instead of writing broken files.
8. **Natives**: Extracts `.so`, `.dll`, or `.dylib` files from the native jars into the version's `natives/` folder.
9. **Arguments**: Builds JVM and game arguments from the JSON:
   - **Modern format** (1.13+): evaluates the `rules` on each entry in `arguments.jvm` and `arguments.game`.
   - **Legacy format** (before 1.13): splits `minecraftArguments` into game arguments and adds the required JVM arguments (`-Djava.library.path` and `-cp`).
10. **Placeholders**: Replaces every `${...}` placeholder (classpath, directories, username, UUID, and more) with real values.
11. **Launch**: Starts Java with the final arguments and streams the game's output to the terminal.

**Shared vs per-version files:** `libraries/` and `assets/` are shared by all versions because their paths are unique (versioned paths and SHA1 file names), so nothing is downloaded twice. Everything that belongs to one version (`client.jar`, `natives/`, worlds, logs, settings) lives in `versions/<version>/`.

**Offline identity:** The player UUID is generated from the username with the same method the vanilla server uses for offline players (MD5 of `OfflinePlayer:<name>`, version 3 UUID), so the same name always gets the same UUID.

---

## Features
- **Interactive version picker**: Lists all official versions and snapshots with a number and type; choose by typing the number.
- **Wide version support**: Runs modern and legacy version formats from one code path (see [Supported Versions](#supported-versions)).
- **Per-version folders**: Each version gets its own game directory under `versions/`.
- **Shared downloads**: Libraries and assets are downloaded once and reused by every version.
- **SHA1 verification**: Skips valid files and repairs missing or corrupted ones automatically.
- **Concurrency limit**: Parallel downloads with a fixed number of workers.
- **Safe downloads**: Stops with a clear message on any failed HTTP response.
- **Java check**: Stops before downloading if the installed Java is older than the version needs.
- **Input validation**: Checks the version number, username (3 to 16 characters: letters, numbers, `_`), and memory (1 to 32 GB).
- **Cross-platform**: Detects Windows or Linux, picks the matching natives, and uses the correct classpath separator.
- **Run from anywhere**: All paths are resolved from the script's own folder, so it works no matter which folder the terminal is in.
- **One-command install**: A single line downloads the launcher (no Git needed), installs everything, and starts it.
- **One-step setup scripts**: `install.sh` (Linux) and `install.bat` (Windows) install everything and start the launcher; `run.sh` and `run.bat` start it afterwards.

---

## Supported Versions

| Minecraft versions | Status |
|---|---|
| 1.19 to 26.x (and snapshots) | Tested and working |
| 1.13 to 1.18.2 | Tested and working (legacy natives) |
| 1.7.10 to 1.12.2 | Tested and working (legacy natives and legacy arguments) |
| Older than 1.7.3, beta, and alpha | Not supported (they use an older asset system) |

Java **25** has been tested with every supported version, including 1.7.10. Java is backward compatible: a version that asks for Java 8 still runs on a newer Java.

---

## Tech Stack
- **Runtime**: Node.js 22+ (ES modules, top-level `await`, built-in `fetch`)
- **Language**: JavaScript
- **Library**: [adm-zip](https://www.npmjs.com/package/adm-zip) to extract native files from `.jar` archives
- **Node built-ins**: `fs`, `fs/promises`, `path`, `os`, `crypto`, `child_process`, `readline/promises`
- **Game runtime**: Java 25 (OpenJDK or Temurin)

---

## Run Locally

### Quick start (one command)
Copy one line into a terminal. It downloads the launcher from GitHub (no Git needed), installs **Node.js**, **Java 25**, and the npm packages, then starts the launcher.

**Linux** (terminal):
```bash
curl -fsSL https://github.com/omarahmed321/simple-minecraft-launcher/archive/refs/heads/instances-supported-version.tar.gz | tar xz && cd simple-minecraft-launcher-instances-supported-version && ./install.sh
```

**Windows** (Command Prompt):

Open **Command Prompt normally, not as administrator** (press `Win`, type `cmd`, press Enter). It opens in your user folder (`C:\Users\<your name>`), and the launcher is downloaded there. Running it as administrator opens it in `C:\Windows\System32` instead, so avoid that; the installers ask for permission on their own when they need it.

```bat
curl -L -o launcher.zip https://github.com/omarahmed321/simple-minecraft-launcher/archive/refs/heads/instances-supported-version.zip && tar -xf launcher.zip && cd simple-minecraft-launcher-instances-supported-version && install.bat
```

`curl` and `tar` are built into Windows 10 and 11. This command is for Command Prompt; in PowerShell, open `cmd` first.

Both commands create a `simple-minecraft-launcher-instances-supported-version` folder in the folder the terminal is opened in. After the first run, start the launcher with `run.sh` (Linux) or `run.bat` (Windows) inside that folder.

**Without a terminal:** click **Code**, then **Download ZIP** on the repository page, extract it, and double-click `install.bat` (Windows) or run `./install.sh` (Linux).

### Option 1: Setup script
The scripts install **Node.js**, **Java 25**, and the npm packages, then start the launcher.

**Linux** (Ubuntu / Debian, Arch / CachyOS / Manjaro, Fedora):
```bash
git clone https://github.com/omarahmed321/simple-minecraft-launcher.git
cd simple-minecraft-launcher
./install.sh
```
The script uses `sudo` to install packages.

**Windows** (10 or 11):
```powershell
git clone https://github.com/omarahmed321/simple-minecraft-launcher.git
```
Then open the folder and double-click **`install.bat`**.

`install.bat` installs Node.js and Java, opens the launcher folder in File Explorer so you can see where it is, then opens `run.bat` in a new window through Explorer, so the new window already sees the installed programs. On Linux, `install.sh` calls `run.sh` directly.

After the first setup, start the launcher with **`run.sh`** (Linux) or **`run.bat`** (Windows). They skip the system installation, run `npm install` only if `node_modules` is missing, and start the launcher.

### Option 2: Manual setup

**Prerequisites:** Git, **Node.js 22 or newer**, and **Java 25**.

| System | Command |
|---|---|
| Windows | `winget install -e --id OpenJS.NodeJS.LTS` and `winget install -e --id EclipseAdoptium.Temurin.25.JDK` |
| Ubuntu / Debian | `sudo apt install nodejs npm openjdk-25-jdk` |
| Arch / CachyOS | `sudo pacman -S nodejs npm jdk-openjdk` |
| Fedora | `sudo dnf install nodejs npm java-latest-openjdk` |

On older Ubuntu or Debian releases, the packaged Node.js can be older than 22 and `openjdk-25-jdk` may be missing. In that case, install Node.js from [nodejs.org](https://nodejs.org/) and Java from [adoptium.net](https://adoptium.net/temurin/releases/?version=25).

Check the installation:
```bash
node --version    # v22.0.0 or higher
java --version    # 25
```

**Installation and execution:**
```bash
git clone https://github.com/omarahmed321/simple-minecraft-launcher.git
cd simple-minecraft-launcher
npm install
npm start
```

---

## Usage
The launcher asks three questions:

```
1-version:26.4-snapshot-1 : type:snapshot
2-version:26.3 : type:release
...
Which version do u wanna install / play? 2
The name of the user in the game? Omar
How much memory u wanna the game allocate (write number for example 3)? 4
press enter to continue
```

1. **Version number**: the number shown next to the version in the list.
2. **Username**: 3 to 16 characters, using letters, numbers, and `_`.
3. **Memory**: whole number of GB between 1 and 32 (passed to Java as `-Xmx<number>G`).

The first run of a version downloads the client, its libraries, and its assets. Later runs verify the files and start much faster. Worlds, logs, and settings are saved in `versions/<version>/`.

**Offline mode:** The launcher does not sign in to a Microsoft account. Singleplayer and offline-mode servers work; Realms and servers that require authentication do not.

**Custom Java path:** To use a specific Java installation, change `JAVA_PATH` at the top of `minecraft-verision-installer.js` to the full path of the `java` executable.

---

## Troubleshooting
- **`Java not found at "java"`**: Java is not installed or not on your `PATH`. Run the setup script or install Java 25, then open a new terminal.
- **`needs Java X, but you have Java Y`**: Your Java is older than the version requires. Install Java 25.
- **`'npm' is not recognized` (Windows)**: The new window did not get the updated PATH. Close it and double-click `run.bat`.
- **`Cannot find package 'adm-zip'`**: Run `npm install` in the project folder.
- **`Invalid number`**: The number you typed is not in the version list.
- **`lets say here that we are : 404 ...`**: A download failed on Mojang's side or the connection dropped. Run the launcher again; files that were already verified are skipped.
- **Game crashes with `UnsatisfiedLinkError`**: Delete `versions/<version>/natives` and run again so the natives are extracted fresh.
- **Game crashes after an interrupted download**: Run the launcher again. The SHA1 check finds and re-downloads any broken file.

---

## Code Structure
All logic lives in `minecraft-verision-installer.js`, split into sections marked with `//---------` comments, in the order they run:

| Section | Responsibility |
|---|---|
| **Settings** | `JAVA_PATH` and `BASE_DIR` (the script's folder, used for every path) |
| **Platform / Rules / Global functions** | Detects the OS and CPU architecture, and defines the shared helpers below |
| **Fetching all versions** | Downloads the manifest, prints the numbered list, asks the questions, validates the answers, and sets `GAME_DIR` |
| **Version** | Downloads the version JSON and builds the normalized `libFiles` list |
| **Java Check** | Compares the required Java version with the installed one and stops early if it is too old |
| **Client.jar** | Downloads `client.jar` into the version folder |
| **Libraries** | Downloads every entry in `libFiles` with the concurrency limit |
| **Assets** | Downloads the asset index and every asset object with the concurrency limit |
| **Natives / Extraction** | Extracts native files from the native jars into `versions/<version>/natives/` |
| **Classpath** | Joins `client.jar` and all library jars with the platform separator |
| **JvmArguments and GameArguments** | Builds arguments from `arguments` (modern) or `minecraftArguments` (legacy) |
| **Replacements** | Maps every `${...}` placeholder to its value and applies it to all arguments |
| **Launch** | Starts Java and streams the game output |

**Shared helper functions:**

| Function | Purpose |
|---|---|
| `isAllowed(rules)` | Evaluates Mojang `rules` (OS, architecture, features). The last matching rule wins. |
| `limiter(worker, items, limit)` | Runs `worker` on every item with at most `limit` running at the same time |
| `checkDownloading(url)` | `fetch` that throws a clear error on any non-OK HTTP status |
| `checkSha1(filePath, sha1)` | Returns `true` only if the file exists and its SHA1 matches |
| `getInstalledJavaVersion(javaPath)` | Runs `java -version` and returns the major version (handles the old `1.8` format) |
| `getOfflineUUID(username)` | Builds the offline-mode player UUID |
| `applyReplacements(argument)` | Replaces every `${...}` placeholder in one argument |

---

## Project Structure
```
simple-minecraft-launcher/
├── minecraft-verision-installer.js   # The launcher
├── install.sh                        # Linux: installs Node.js and Java, then runs run.sh
├── install.bat                       # Windows: installs Node.js and Java, then opens run.bat
├── run.sh                            # Linux: npm install (first time only) + start
├── run.bat                           # Windows: npm install (first time only) + start
├── package.json                      # Project metadata, start script, dependencies
└── README.md

Created at runtime:
├── node_modules/
├── libraries/                        # Shared Java libraries (Maven layout)
├── assets/                           # Shared assets
│   ├── indexes/                      # Asset index JSON per version
│   └── objects/                      # Sounds, textures, languages (by SHA1)
└── versions/
    └── <version>/                    # One folder per version, e.g. 26.3
        ├── client.jar
        ├── natives/                  # Extracted .so / .dll / .dylib files
        ├── saves/                    # Worlds
        ├── logs/
        └── options.txt               # Game settings
```
