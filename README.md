# Simple Minecraft Launcher (Custom Game Launcher, CLI)

**Status:** Local command-line tool. No live demo.

A **Minecraft: Java Edition** launcher written in **Node.js** that downloads any official version directly from Mojang's servers, runs versions you installed with **Fabric**, **Forge**, or **NeoForge**, and starts the game in **offline mode**.

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Java](https://img.shields.io/badge/Java-8_%7C_17_%7C_21_%7C_25-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows_%7C_Linux-555555?style=flat-square)

---

## Table of Contents
- [About](#about)
- [Architecture](#architecture)
- [Features](#features)
- [Supported Versions](#supported-versions)
- [Mod Loaders](#mod-loaders)
- [Tech Stack](#tech-stack)
- [Run Locally](#run-locally)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Code Structure](#code-structure)
- [Project Structure](#project-structure)

---

## About
This project rebuilds the core job of the official Minecraft launcher from scratch: resolving a version, downloading and verifying every file it needs, and building the exact Java command that starts the game. It talks directly to Mojang's public **piston-meta** and **resources** APIs, with no third-party launcher libraries.

It keeps every game file in a standard `.minecraft` folder, so the official **Fabric**, **Forge**, and **NeoForge** installers can install into it. The launcher then finds those installed versions, merges them with the vanilla version they are built on, picks the right Java for each version, and runs them like any other version.

---

## Architecture
The launcher is a single script that runs these stages in order:

1. **Source**: Asks whether to run an **installed** version or **install a new** one.
   - **Installed**: Lists every folder in `.minecraft/versions/` that has a `<id>/<id>.json` file. This includes versions made by the Fabric, Forge, and NeoForge installers. Works without internet.
   - **New**: Downloads Mojang's version manifest and lists every version with its type (`release`, `snapshot`, `old_beta`, `old_alpha`).
2. **Questions**: Asks for the version number, the in-game username, and the maximum memory in GB. Every answer is validated before anything is downloaded.
3. **Version JSON**: Downloads the JSON for a new version, or reads it from disk for an installed one.
4. **Merge (`inheritsFrom`)**: A mod loader JSON only lists what it adds and points to its base version with `inheritsFrom`. The launcher reads the base JSON and merges both into one: libraries and arguments are combined, `mainClass` comes from the mod loader, and the assets, client jar, and Java version come from the base. If the base version is missing, the launcher tells you its number in the "install new" list.
5. **Library normalization**: Converts every library format into one list of `{ path, url, sha1, isNative }` entries:
   - **Modern format** (1.19+): natives are separate libraries with an `artifact`.
   - **Legacy format** (before 1.19): natives live inside one library under `natives` and `downloads.classifiers`.
   - **Maven format** (Fabric, old Forge): only a `name` like `net.fabricmc:fabric-loader:0.19.5` and a repository `url`. The path is built from the name (`net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar`).
   - Libraries that the Forge installer generated itself have an empty `url` and are used from disk without downloading.
6. **Java selection**: Reads the required Java version (for example 8, 17, 21, or 25) and looks for an installed Java with exactly that version in `/usr/lib/jvm` (Linux) or `C:\Program Files\Eclipse Adoptium` (Windows). If none matches, it falls back to the default `java`.
7. **Downloads**: Downloads the client jar, the libraries, the asset index, and every asset object. Libraries and assets download in parallel with a **concurrency limit** (8 and 16 at a time).
8. **Verification**: Before downloading, every file that already exists is checked against its **SHA1**. Valid files are skipped; missing, partial, or corrupted files are downloaded again. Failed HTTP responses stop the launcher instead of writing broken files.
9. **Client jar for mod loaders**: The base jar is copied into the mod loader's version folder under the mod loader's own name (for example `1.20.1-forge-47.4.26.jar`). Modern Forge ignores the game jar only when it has this name; otherwise Java sees two copies of Minecraft and refuses to start.
10. **Natives**: Extracts `.so`, `.dll`, or `.dylib` files from the native jars into the version's `natives/` folder.
11. **Arguments**: Builds JVM and game arguments from the JSON:
    - **Modern format** (1.13+): evaluates the `rules` on each entry in `arguments.jvm` and `arguments.game`.
    - **Legacy format** (before 1.13): splits `minecraftArguments` into game arguments and adds the required JVM arguments (`-Djava.library.path` and `-cp`).
12. **Placeholders**: Replaces every `${...}` placeholder (classpath, directories, username, UUID, library directory, and more) with real values.
13. **Launch**: Starts the selected Java with the final arguments and streams the game's output to the terminal.

**Files vs game data:** `versions/`, `libraries/`, and `assets/` hold what is needed to *start* a version; the launcher writes them. `instances/<version>/` holds what the game creates *while you play* (mods, worlds, settings, logs); the game writes it. Every version gets its own instance, so mods and worlds never mix between versions.

**Offline identity:** The player UUID is generated from the username with the same method the vanilla server uses for offline players (MD5 of `OfflinePlayer:<name>`, version 3 UUID), so the same name always gets the same UUID.

---

## Features
- **Installed or new**: Run versions already in `.minecraft`, or pick any official version or snapshot to download.
- **Mod loader support**: Runs versions installed by the official Fabric, Forge, and NeoForge installers (see [Mod Loaders](#mod-loaders)).
- **Standard `.minecraft` layout**: `versions/<id>/<id>.jar`, `<id>.json`, `libraries/`, `assets/`, and `launcher_profiles.json`, so official installers recognize the folder.
- **Separate instances**: Each version gets its own `mods/`, `saves/`, `config/`, and settings under `instances/`.
- **Automatic Java selection**: Uses Java 8, 17, 21, or 25 depending on what each version needs.
- **Shared downloads**: Libraries and assets are downloaded once and reused by every version.
- **SHA1 verification**: Skips valid files and repairs missing or corrupted ones automatically.
- **Concurrency limit**: Parallel downloads with a fixed number of workers.
- **Safe downloads**: Stops with a clear message on any failed HTTP response.
- **Input validation**: Checks the version number, username (3 to 16 characters: letters, numbers, `_`), and memory (1 to 32 GB).
- **Cross-platform**: Detects Windows or Linux, picks the matching natives, and uses the correct classpath separator.
- **Run from anywhere**: All paths are resolved from the script's own folder, so it works no matter which folder the terminal is in.
- **One-command install**: A single line downloads the launcher (no Git needed), installs Node.js and every Java version, and starts it.

---

## Supported Versions

| Minecraft versions | Status | Java used |
|---|---|---|
| 1.20.5 to 26.x (and snapshots) | Tested and working | 21 or 25 |
| 1.17 to 1.20.4 | Tested and working | 17 |
| 1.13 to 1.16.5 | Tested and working (legacy natives) | 8 |
| 1.7.10 to 1.12.2 | Tested and working (legacy natives and legacy arguments) | 8 |
| Older than 1.7.3, beta, and alpha | Not supported (they use an older asset system) | |

Vanilla versions also run on a newer Java than they ask for. Old Forge versions do not, which is why the launcher picks the exact version.

---

## Mod Loaders

### Installing one
1. Install the base version first with the launcher (option **2**), so `.minecraft/versions/<version>/` has its jar and JSON.
2. Download the official installer: [Fabric](https://fabricmc.net/use/installer/), [Forge](https://files.minecraftforge.net/), or [NeoForge](https://neoforged.net/).
3. Choose **Install client** and set the install folder to the **`.minecraft` folder inside the launcher folder** (not the default one).
4. Run the launcher, choose **1** (installed), and pick the new version.

### Run the Forge installer with the matching Java
The Forge installer checks the SHA1 of the files it builds. With a newer Java than the version expects, the files come out slightly different and the installer stops with `Processor failed, invalid outputs`. Run it with the Java that matches the Minecraft version:

| Forge for Minecraft | Java for the installer |
|---|---|
| 1.16.5 and older | 8 |
| 1.17 to 1.20.4 | 17 |
| 1.20.5 to 1.21.x | 21 |
| 26.x | 25 |

```bash
# Linux example (Forge 1.20.1)
/usr/lib/jvm/java-17-openjdk/bin/java -jar forge-1.20.1-47.4.26-installer.jar
```

### Status

| Mod loader | Status |
|---|---|
| Fabric 26.3 | Tested and working |
| Forge 26.3 | Tested and working |
| Forge 1.17 to 1.21.x | Supported (same format as Forge 26.3, needs the jar rename fix above) |
| Forge 1.12.2 and 1.16.5 | Supported with Java 8 installed |
| NeoForge | Supported (same format as modern Forge) |
| Forge 1.6 and older | Not supported (it modifies the game jar directly) |

---

## Tech Stack
- **Runtime**: Node.js 22+ (ES modules, top-level `await`, built-in `fetch`)
- **Language**: JavaScript
- **Library**: [adm-zip](https://www.npmjs.com/package/adm-zip) to extract native files from `.jar` archives
- **Node built-ins**: `fs`, `fs/promises`, `path`, `os`, `crypto`, `child_process`, `readline/promises`
- **Game runtime**: Java 8, 17, 21, and 25 (OpenJDK or Temurin)

---

## Run Locally

### Quick start (one command)
Copy one line into a terminal. It downloads the launcher from GitHub (no Git needed), installs **Node.js**, **Java 8, 17, 21, and 25**, and the npm packages, then starts the launcher.

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

**Without a terminal:** switch to the `instances-supported-version` branch on the repository page, click **Code**, then **Download ZIP**, extract it, and double-click `install.bat` (Windows) or run `./install.sh` (Linux).

### Option 1: Setup script
The scripts install **Node.js**, **Java 8, 17, 21, and 25**, and the npm packages, then start the launcher.

**Linux** (Ubuntu / Debian, Arch / CachyOS / Manjaro, Fedora):
```bash
git clone -b instances-supported-version https://github.com/omarahmed321/simple-minecraft-launcher.git
cd simple-minecraft-launcher
./install.sh
```
The script uses `sudo` to install packages. If one Java version is not available on your distribution, only that line fails and the rest continue.

**Windows** (10 or 11):
```powershell
git clone -b instances-supported-version https://github.com/omarahmed321/simple-minecraft-launcher.git
```
Then open the folder and double-click **`install.bat`**.

`install.bat` installs Node.js and Java, opens the launcher folder in File Explorer so you can see where it is, then opens `run.bat` in a new window through Explorer, so the new window already sees the installed programs. On Linux, `install.sh` calls `run.sh` directly.

After the first setup, start the launcher with **`run.sh`** (Linux) or **`run.bat`** (Windows). They skip the system installation, run `npm install` only if `node_modules` is missing, and start the launcher.

### Option 2: Manual setup

**Prerequisites:** Git, **Node.js 22 or newer**, and the Java versions you need (8 for 1.16.5 and older, 17, 21, and 25).

| System | Command |
|---|---|
| Windows | `winget install -e --id OpenJS.NodeJS.LTS`, then `winget install -e --id EclipseAdoptium.Temurin.<8, 17, 21>.JRE` and `EclipseAdoptium.Temurin.25.JDK` |
| Ubuntu / Debian | `sudo apt install nodejs npm openjdk-8-jre openjdk-17-jre openjdk-21-jre openjdk-25-jre` |
| Arch / CachyOS | `sudo pacman -S nodejs npm jdk8-openjdk jdk17-openjdk jdk21-openjdk jdk-openjdk` |
| Fedora | `sudo dnf install nodejs npm java-1.8.0-openjdk java-17-openjdk java-21-openjdk java-latest-openjdk` |

On Arch, if `pacman` returns `404` for a package, run `sudo pacman -Syu` first to refresh the package list.

**Installation and execution:**
```bash
git clone -b instances-supported-version https://github.com/omarahmed321/simple-minecraft-launcher.git
cd simple-minecraft-launcher
npm install
npm start
```

---

## Usage
```
 1-wanna run installed version
 2-wanna install new version
 your choice:2
1-version:26.4-snapshot-1 : type:snapshot
2-version:26.3 : type:release
...
Which version do u wanna install /play ? 2
The name of the user in the game? Omar
How much memory u wanna the game allocate (write number for example 3)? 4
press enter to continue
```

1. **Source**: `1` for versions already in `.minecraft` (including Fabric, Forge, and NeoForge), `2` to download a new one.
2. **Version number**: the number shown next to the version in the list.
3. **Username**: 3 to 16 characters, using letters, numbers, and `_`.
4. **Memory**: whole number of GB between 1 and 32 (passed to Java as `-Xmx<number>G`).

The first run of a version downloads the client, its libraries, and its assets. Later runs verify the files and start much faster. Mods go in `.minecraft/instances/<version>/mods/`, and worlds, logs, and settings are saved next to them.

The launcher prints `Required Java` and `Installed Java` before starting, so you can see which Java it picked.

**Offline mode:** The launcher does not sign in to a Microsoft account. Singleplayer and offline-mode servers work; Realms and servers that require authentication do not.

---

## Troubleshooting
- **`Installed Java` is not the number the version needs**: That Java is not installed. Run the setup script again, or install it from the table in [Manual setup](#option-2-manual-setup). On Arch, `archlinux-java status` lists the installed versions.
- **`ClassCastException ... cannot be cast to class java.net.URLClassLoader`** or **`NoClassDefFoundError: net/minecraft/launchwrapper/...`**: An old Forge version ran on a new Java. Install Java 8.
- **`<version> needs <base>, install it first`**: The mod loader's base version is missing. Install it with option 2, using the number printed in the message.
- **`Processor failed, invalid outputs`** (Forge installer): Run the installer with the matching Java (see [Mod Loaders](#mod-loaders)).
- **`Module minecraft contains package ...`** (modern Forge): The game jar was not renamed. Make sure you are on the latest version of this branch.
- **`'npm' is not recognized` (Windows)**: The new window did not get the updated PATH. Close it and double-click `run.bat`.
- **`Cannot find package 'adm-zip'`**: Run `npm install` in the project folder.
- **`Invalid number`** or **`No versions found`**: The number is not in the list, or there are no installed versions yet.
- **`lets say here that we are : 404 ...`**: A download failed or the connection dropped. Run the launcher again; files that were already verified are skipped.
- **Game crashes with `UnsatisfiedLinkError`**: Delete `.minecraft/versions/<version>/natives` and run again so the natives are extracted fresh.

---

## Code Structure
All logic lives in `minecraft-verision-installer.js`, split into sections in the order they run:

| Section | Responsibility |
|---|---|
| **Settings** | `JAVA_PATH`, `BASE_DIR`, `MINECRAFT_DIR`, URLs, download limits, and `JAVA_SEARCH_DIRS` |
| **Platform** | Detects the OS, CPU architecture, and native file extension |
| **Helpers** | Shared functions (table below) |
| **Questions** | Installed or new, version, username, memory |
| **Version JSON + merge** | Reads or downloads the JSON and merges it with its `inheritsFrom` base |
| **Libraries list** | Builds the normalized `libFiles` list from every library format |
| **Java** | Finds the Java that matches the required version |
| **Client jar** | Creates the version and instance folders, `launcher_profiles.json`, downloads the jar, and copies it under the mod loader's name |
| **Libraries / Assets** | Downloads everything with the concurrency limit |
| **Natives** | Extracts native files into `versions/<version>/natives/` |
| **Classpath / Arguments / Replacements** | Builds the final Java command |
| **Launch** | Starts Java and streams the game output |

**Helper functions:**

| Function | Purpose |
|---|---|
| `fetchAllVersions(isLocal)` | Returns and prints the installed versions or Mojang's version list |
| `getInstalledVersions()` | Lists the folders in `versions/` that contain `<id>/<id>.json` |
| `getVersionJson(url)` | Downloads a version JSON |
| `mergeVersionJson(parent, child)` | Merges a mod loader JSON with its base version |
| `mavenToPath(name)` | Turns `group:artifact:version` into a Maven file path |
| `getVersionNumberInList(id)` | Finds a version's number in the "install new" list |
| `findJava(requiredJava)` | Finds an installed Java with the exact major version |
| `getInstalledJavaVersion(javaPath)` | Runs `java -version` and returns the major version (handles the old `1.8` format) |
| `isAllowed(rules)` | Evaluates Mojang `rules` (OS, architecture, features). The last matching rule wins. |
| `limiter(worker, items, limit)` | Runs `worker` on every item with at most `limit` running at the same time |
| `checkDownloading(url)` | `fetch` that throws a clear error on any non-OK HTTP status |
| `checkSha1(filePath, sha1)` | Returns `true` only if the file exists and its SHA1 matches |
| `downloadClientJar`, `downloadLibrary`, `getAssetIndex`, `downloadAsset`, `downloadOneAsset` | Download and verify the game files |
| `getOfflineUUID(username)` | Builds the offline-mode player UUID |
| `applyReplacements(argument)` | Replaces every `${...}` placeholder in one argument |

---

## Project Structure
```
simple-minecraft-launcher/
├── minecraft-verision-installer.js   # The launcher
├── install.sh                        # Linux: installs Node.js and Java 8/17/21/25, then runs run.sh
├── install.bat                       # Windows: installs Node.js and Java 8/17/21/25, then opens run.bat
├── run.sh                            # Linux: npm install (first time only) + start
├── run.bat                           # Windows: npm install (first time only) + start
├── package.json                      # Project metadata, start script, dependencies
└── README.md

Created at runtime:
├── node_modules/
└── .minecraft/
    ├── launcher_profiles.json        # Needed by the Fabric / Forge installers
    ├── libraries/                    # Shared Java libraries (Maven layout)
    ├── assets/                       # Shared assets (indexes/ and objects/ by SHA1)
    ├── versions/
    │   ├── 26.3/
    │   │   ├── 26.3.jar              # The game
    │   │   ├── 26.3.json             # Mojang's version JSON
    │   │   └── natives/              # Extracted .so / .dll / .dylib files
    │   └── fabric-loader-0.19.5-26.3/
    │       ├── fabric-loader-0.19.5-26.3.json   # Made by the Fabric installer (inheritsFrom 26.3)
    │       └── natives/
    └── instances/
        ├── 26.3/                     # saves/, logs/, options.txt
        └── fabric-loader-0.19.5-26.3/
            └── mods/                 # Mods for this version only
```
