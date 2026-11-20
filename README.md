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
- [Settings](#settings)
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

1. **Source**: Asks what to do: run an **installed** version, **install a new** one, **repair** an installed one, open **Settings**, or **Exit**.
   - **Installed**: Lists every folder in `.minecraft/versions/` that has a `<id>/<id>.json` file. This includes versions made by the Fabric, Forge, and NeoForge installers. Works without internet.
   - **New**: Downloads Mojang's version manifest and lists every version with its type (`release`, `snapshot`, `old_beta`, `old_alpha`).
2. **Questions**: Asks for a profile (an in-game username and the maximum memory in GB, saved in `profiles.json`), then the version (a searchable list). Every answer is validated before anything is downloaded.
3. **Version JSON**: Downloads the JSON for a new version, or reads it from disk for an installed one.
4. **Merge (`inheritsFrom`)**: A mod loader JSON only lists what it adds and points to its base version with `inheritsFrom`. The launcher reads the base JSON and merges both into one: libraries and arguments are combined, `mainClass` comes from the mod loader, and the assets, client jar, and Java version come from the base. If the base version is missing, the launcher names the version you need to install first.
5. **Library normalization**: Converts every library format into one list of `{ path, url, sha1, isNative }` entries:
   - **Modern format** (1.19+): natives are separate libraries with an `artifact`.
   - **Legacy format** (before 1.19): natives live inside one library under `natives` and `downloads.classifiers`.
   - **Maven format** (Fabric, old Forge): only a `name` like `net.fabricmc:fabric-loader:0.19.5` and a repository `url`. The path is built from the name (`net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar`).
   - Libraries that the Forge installer generated itself have an empty `url` and are used from disk without downloading.
6. **Java selection**: Reads the required Java version (for example 8, 17, 21, or 25) and looks for an installed Java with exactly that version in `/usr/lib/jvm` (Linux) or `C:\Program Files\Eclipse Adoptium` (Windows). It reads each Java's version from the `release` file in its folder instead of starting Java, and only runs `java -version` for a folder without that file. Java the launcher downloaded itself (in `.minecraft/runtime/`) is checked first. If none matches, it offers to download the exact Java from Mojang (see [Automatic Java download](#automatic-java-download)); if you say no, it falls back to the default `java`. If the Java it ends up with is older than the version needs, it says so and goes back to the menu.
7. **Downloads**: Downloads the client jar, the libraries, the asset index, and every asset object. Each file, the asset index included, is downloaded only if it is missing or its SHA1 does not match. Libraries and assets download in parallel with a **concurrency limit** (8 and 16 at a time). A failed download is tried 3 times; if it still fails, the launcher says so and goes back to the menu.
   - **Asset index**: Different versions can use the same index name (for example `36.json`) with different content. A copy of each index is also kept under its SHA1 (`indexes/<sha1>.json`), and the right one is copied to the name the game reads before every launch, so switching between those versions never needs the internet.
8. **Verification**: Before downloading, every file that already exists is checked against its **SHA1**. Valid files are skipped; missing, partial, or corrupted files are downloaded again. Files are hashed in small pieces, so a large jar never sits in memory all at once.
   - **`verified.json`**: Every file that passes its SHA1 check is saved in `.minecraft/verified.json` with its size and modification time. On later launches a file whose size and time have not changed is skipped without reading it, which makes starting an installed version about 10 times faster. A changed file is hashed again. **Repair** clears this list so every file is hashed again.
9. **Client jar for mod loaders**: The base jar is copied once into the mod loader's version folder under the mod loader's own name (for example `1.20.1-forge-47.4.26.jar`). Modern Forge ignores the game jar only when it has this name; otherwise Java sees two copies of Minecraft and refuses to start.
10. **Natives**: Extracts `.so`, `.dll`, or `.dylib` files from the native jars into the version's `natives/` folder. Files that are already there from an earlier launch are skipped.
11. **Arguments**: Builds JVM and game arguments from the JSON:
    - **Modern format** (1.13+): evaluates the `rules` on each entry in `arguments.jvm` and `arguments.game`.
    - **Legacy format** (before 1.13): splits `minecraftArguments` into game arguments and adds the required JVM arguments (`-Djava.library.path` and `-cp`).
12. **Placeholders**: Replaces every `${...}` placeholder (classpath, directories, username, UUID, library directory, and more) with real values.
13. **Launch**: Starts the selected Java with the final arguments and streams the game's output to the terminal. When the game closes, the launcher starts over at the profile menu (see [Staying open](#staying-open)).

**Files vs game data:** `versions/`, `libraries/`, and `assets/` hold what is needed to *start* a version; the launcher writes them. `instances/<version>/` holds what the game creates *while you play* (mods, worlds, settings, logs); the game writes it. Every version gets its own instance, so mods and worlds never mix between versions.

**Offline identity:** The player UUID is generated from the username with the same method the vanilla server uses for offline players (MD5 of `OfflinePlayer:<name>`, version 3 UUID), so the same name always gets the same UUID.

---

## Features
- **Profiles**: Save a username and memory once, then pick the profile at every start instead of typing them again.
- **Stays open**: After the game closes, the launcher goes back to the menu, so you can play another version without starting it again. **← Back** in the version list and **Exit** in the menu are always there.
- **Settings menu**: Change any setting from inside the launcher. Each value is checked before it is saved.
- **Repair**: Checks every file of a version against its SHA1 again and downloads any broken one.
- **Fast relaunch**: Files that were already verified are not hashed again (see `verified.json` above), and Java is found without starting it.
- **Installed or new**: Run versions already in `.minecraft`, or pick any official version or snapshot to download.
- **Mod loader support**: Runs versions installed by the official Fabric, Forge, and NeoForge installers (see [Mod Loaders](#mod-loaders)).
- **Standard `.minecraft` layout**: `versions/<id>/<id>.jar`, `<id>.json`, `libraries/`, `assets/`, and `launcher_profiles.json`, so official installers recognize the folder.
- **Separate instances**: Each version gets its own `mods/`, `saves/`, `config/`, and settings under `instances/`.
- **Automatic Java selection**: Uses Java 8, 17, 21, or 25 depending on what each version needs.
- **Automatic Java download**: If the right Java is missing, the launcher offers to download it from Mojang, the same Java the official launcher uses.
- **Shared downloads**: Libraries and assets are downloaded once and reused by every version.
- **SHA1 verification**: Skips valid files and repairs missing or corrupted ones automatically.
- **Install now, play later**: After installing a new version, the launcher asks whether to play it now or go back to the menu.
- **Offline play**: Installed versions start without internet, because every file they need, the asset index included, is read from disk once it is valid. This includes versions that share an asset index name.
- **Auto-update**: At startup the launcher checks GitHub for a newer version, asks before updating, keeps `settings.json`, `profiles.json`, and `.minecraft`, installs any new packages, and restarts itself. With no internet, or if the update fails, it carries on with the current version.
- **Concurrency limit**: Parallel downloads with a fixed number of workers.
- **Safe downloads**: Tries every download 3 times. With no internet, or if Mojang does not answer, it shows a clear message and goes back to the menu instead of crashing.
- **Terminal UI**: Arrow-key menus, a version list you can search by typing, a progress bar while downloading, and an animated rainbow intro.
- **Input validation**: Checks the username (3 to 16 characters: letters, numbers, `_`) and memory (1 to 32 GB), and asks again instead of exiting when an answer is wrong.
- **Cross-platform**: Detects Windows or Linux, picks the matching natives, and uses the correct classpath separator.
- **Run from anywhere**: All paths are resolved from the script's own folder, so it works no matter which folder the terminal is in.
- **One-command install**: A single line downloads the launcher (no Git needed), asks which of Node.js and Java 8, 17, 21, and 25 you still need, installs only those, and starts it.
- **Desktop shortcut**: The setup script can add a **Simple Minecraft Launcher (SL)** shortcut with its own icon to the desktop (Windows) or the apps menu and desktop (Linux).

---

## Supported Versions

| Minecraft versions | Status | Java used |
|---|---|---|
| 1.20.5 to 26.x (and snapshots) | Tested and working | 21 or 25 |
| 1.17 to 1.20.4 | Tested and working | 17 |
| 1.13 to 1.16.5 | Tested and working (legacy natives) | 8 |
| 1.7.10 to 1.12.2 | Tested and working (legacy natives and legacy arguments) | 8 |
| Classic, Indev, Infdev, Alpha, Beta, and 1.0 to 1.7.2 | Tested and working (legacy asset layout, see below) | 8 |

Every official version runs, from Classic 0.30 to the latest snapshot. Versions older than 1.7.3 look for sounds and other assets by file name instead of by hash. After downloading, the launcher copies each asset to its real name: into `instances/<version>/resources/` for versions before 1.6 (the asset index has `map_to_resources`), or into `assets/virtual/<index>/` for 1.6 to 1.7.2 (the asset index has `virtual`). The first launch of such a version takes a little longer while the files are copied; later launches skip files that are already there.

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
| Forge 1.20.1 | Tested and working (with Java 17) |
| Forge 1.17 to 1.21.x | Supported (same format as Forge 1.20.1) |
| Forge 1.12.2 | Tested and working (with Java 8) |
| Forge 1.16.5 | Tested and working (with Java 8) |
| NeoForge | Supported (same format as modern Forge) |
| Forge 1.6 and older | Not supported (it modifies the game jar directly) |

---

## Tech Stack
- **Runtime**: Node.js 22+ (ES modules, top-level `await`, built-in `fetch`)
- **Language**: JavaScript
- **Libraries**:
  - [adm-zip](https://www.npmjs.com/package/adm-zip) to extract native files from `.jar` archives
  - [@clack/prompts](https://www.npmjs.com/package/@clack/prompts) for the menus, the searchable version list, and the text questions
  - [chalk-animation](https://www.npmjs.com/package/chalk-animation) for the moving rainbow text (loaded only when the animation is on)
- **Node built-ins**: `fs`, `fs/promises`, `path`, `os`, `crypto`, `child_process`, `timers/promises`
- **Game runtime**: Java 8, 17, 21, and 25 (OpenJDK or Temurin)

---

## Run Locally

### Quick start (one command)
Copy one line into a terminal. It downloads the launcher from GitHub (no Git needed), asks which of **Node.js** and **Java 8, 17, 21, and 25** you already have, installs the rest and the npm packages, offers a desktop shortcut, then starts the launcher.

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

Both commands create a `simple-minecraft-launcher-instances-supported-version` folder in the folder the terminal is opened in. After the first run, start the launcher with `run.sh` (Linux) or `run.bat` (Windows) inside that folder. This install updates itself: when a new version is out, the launcher asks at startup.

**Without a terminal:** switch to the `instances-supported-version` branch on the repository page, click **Code**, then **Download ZIP**, extract it, and double-click `install.bat` (Windows) or run `./install.sh` (Linux).

### Option 1: Setup script
The scripts install **Node.js**, **Java 8, 17, 21, and 25**, and the npm packages, then start the launcher.

**Questions the script asks:**

| Question | Answer `y` | Answer `n` |
|---|---|---|
| Have you already installed nodejs / java 8 / 17 / 21 / 25 | Skips it | Installs it |
| Interested in adding desktop shortcut with icon | Adds the shortcut | Skips it |

Only `y` or `n` are accepted; anything else asks again. Answer `y` for a Java version only if it is in the default folder, because the launcher looks for Java only there: `C:\Program Files\Eclipse Adoptium` on Windows and `/usr/lib/jvm` on Linux. Installing with the script or your package manager puts it there.

**The desktop shortcut:**

| System | Where it is created | File |
|---|---|---|
| Windows | Desktop, or the Start menu if the desktop folder is missing | `Simple Minecraft Launcher (SL).lnk` |
| Linux | Apps menu, and the desktop if `~/Desktop` exists | `~/.local/share/applications/simple-minecraft-launcher.desktop` |

Search for **SL** or **Minecraft** in the Start menu or your app launcher to find it. The shortcut points to the folder you installed in: if you move or rename that folder, run the setup script again. To remove the shortcut, delete the file in the table (and the copy in `~/Desktop` on Linux).

If the script says `Desktop folder not found`, Windows points the desktop to a folder that does not exist. This happens when OneDrive backs up the desktop under a folder name it later lost. The shortcut is then in the Start menu: search for **SL**, and drag it to the desktop if you want it there. To fix the desktop itself, turn off the desktop backup in OneDrive, or right-click **Desktop** in File Explorer, open **Properties**, then **Location**, and point it to the folder your desktop files are in.

**Linux** (Ubuntu / Debian, Arch / CachyOS / Manjaro, Fedora):
```bash
git clone -b instances-supported-version https://github.com/omarahmed321/simple-minecraft-launcher.git
cd simple-minecraft-launcher
./install.sh
```
The script uses `sudo` to install packages. If one Java version is not available on your distribution, only that line fails and the rest continue. It supports `pacman`, `apt`, and `dnf`; on other systems it stops and asks you to install Node.js and Java yourself.

**Windows** (10 or 11):
```powershell
git clone -b instances-supported-version https://github.com/omarahmed321/simple-minecraft-launcher.git
```
Then open the folder and double-click **`install.bat`**.

`install.bat` installs Node.js and Java, opens the launcher folder in File Explorer so you can see where it is, then opens `run.bat` in a new window through Explorer, so the new window already sees the installed programs. On Linux, `install.sh` calls `run.sh` directly.

After the first setup, start the launcher with **`run.sh`** (Linux) or **`run.bat`** (Windows). They skip the system installation, run `npm install` only if `node_modules` is missing, and start the launcher.

**Updating a `git clone`:** the launcher does not auto-update a folder that has `.git` in it, so your local changes are never overwritten. Run `git pull` and then `npm install` instead.

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
███████╗██╗
██╔════╝██║
███████╗██║
╚════██║██║
███████║███████╗
╚══════╝╚══════╝
made by Omar

┌  Simple launcher
│
◇  Choose a profile
│  Omar
│
◇  What do you wanna do ?
│  install new version
│
◆  Choose version:
│
│  Search: 1.20█ (7 matches)
│  ● 1.20.6 (release)
│  ○ 1.20.5
│  ○ 1.20.4
│  ...
│  ↑/↓ to select • Enter: confirm • Type: to search
└
```

1. **Profile**: pick a saved profile, or "+ create a new profile". The first time, when no profile exists yet, the launcher goes straight to creating one.
2. **Source**: pick with the arrow keys and press Enter.
   - **run an installed version**: lists what is already in `.minecraft` (including Fabric, Forge, and NeoForge).
   - **install new version**: downloads one. When it finishes, the launcher asks **Play now?**; choose No to go back to the menu.
   - **repair an installed version**: checks every file of the version you pick again and downloads any that are broken. Use it if a version crashes for no clear reason.
   - **Settings**: see [Settings](#settings).
   - **Exit**: closes the launcher.
3. **Version**: type part of the version name to filter the list (for example `1.20`), move with the arrow keys, and press Enter. **← Back** at the top of the list goes back to the start.

**Creating a profile** asks two questions:

- **Username**: 3 to 16 characters, using letters, numbers, and `_`.
- **Memory**: whole number of GB between 1 and 32 (passed to Java as `-Xmx<number>G`).

If an answer is not valid, the launcher shows the reason and asks again. Profiles are saved in `profiles.json` next to the launcher. To delete one, choose **✖ remove a profile** at the top of the profile list, pick it, and confirm; to rename one, edit that file. Press `Ctrl+C` at any question to exit.

### Automatic Java download
Every version says which Java it needs. If that exact Java is not installed, the launcher asks **Java <n> is not installed. Download it now?** and, on Yes, downloads it from Mojang's servers (the same servers as the game files) into `.minecraft/runtime/<component>/`, with a progress bar and a SHA1 check on every file. It is used for every version that needs that Java from then on. This works on Linux and Windows; on macOS install Java yourself.

### Deleting a version
There is no button for this on purpose. Close the launcher and delete the folder yourself:

| Folder | What is in it | Delete it? |
|---|---|---|
| `.minecraft/versions/<version>/` | The game jar and its JSON | Yes, this removes the version from the list |
| `.minecraft/instances/<version>/` | Your worlds, mods, and settings for that version | Only if you do not want them anymore |

A Fabric or Forge version needs its base version (for example `1.20.1`), so delete the mod loader version too, or keep the base. `libraries/` and `assets/` are shared by every version; leave them.

The first run of a version downloads the client, its libraries, and its assets. Later runs verify the files and start much faster. Mods go in `.minecraft/instances/<version>/mods/`, and worlds, logs, and settings are saved next to them.

The launcher prints `Required Java` and `Installed Java` before starting, so you can see which Java it picked.

### Staying open
When the game closes, the screen is cleared and the launcher starts again at the profile menu. The intro animation and the update check only happen the first time. If something goes wrong (no internet, the wrong Java, a missing base version), the launcher shows the reason for 3 seconds and goes back to the menu instead of closing.

On Linux and macOS the launcher replaces itself with a fresh copy (`process.execve`), so only one `simple-launcher` process is ever running. Windows has no way to do that, so the first copy stays in the background and starts a fresh launcher each time; this costs about 13 MB of memory.

**Offline mode:** The launcher does not sign in to a Microsoft account. Singleplayer and offline-mode servers work; Realms and servers that require authentication do not.

---

## Settings
The settings live in `settings.json` next to the launcher. The launcher creates it with the defaults on the first run. Updates never touch this file.

To change a setting, choose **Settings** in the menu, pick the setting (its current value is shown next to it), and type the new value. The launcher checks the value, saves it, and starts again so the new value is used right away. You can also edit `settings.json` in any text editor.

| Setting | Default | What it does |
|---|---|---|
| `JAVA_PATH` | `"java"` | The Java used when the launcher cannot find the exact version a game needs. Set it to a full path to force a specific Java, for example `"/usr/lib/jvm/java-17-openjdk/bin/java"`. |
| `LIBRARY_FILES_DOWNLOAD_LIMIT` | `8` | How many library files download at the same time. |
| `ASSET_DOWNLOAD_LIMIT` | `16` | How many asset files download at the same time. Lower both limits on a slow or unstable connection. |
| `INTRO_ANIMATION_TIME` | `1500` | How long the "made by Omar" rainbow moves at startup, in milliseconds. `0` turns it off. |
| `OUTRO_ANIMATION_TIME` | `1500` | How long the "Yo Have Fun" rainbow moves before the game starts, in milliseconds. `0` turns it off. |
| `BAR_SIZE` | `20` | Width of the download progress bar, in characters. If the bar repeats on new lines instead of updating in place, the line is wider than your terminal: lower this or widen the window. |
| `BAR_RENDERING_DELAY` | `16` | How often the progress bar is redrawn, in milliseconds. Lower values do not download faster; 16 is about 60 redraws per second. |
| `MARGIN_LEFT` | `4` | Empty space to the left of everything the launcher shows, in characters, from `0` (off) to `40`. Any other value uses the default and prints a message. |
| `MARGIN_TOP` | `2` | Empty lines above the logo, from `0` (off) to `20`. Any other value uses the default and prints a message. |
| `VERSIONS_SHOWN_LIMIT` | `8` | How many versions the version list shows at once, from `5`. The list never grows taller than the terminal window. |

With an animation time of `0` the text is printed in plain white and the launcher starts right away. `1000` milliseconds is one second. The two download limits need at least `1`.

A setting you delete from the file goes back to its default. If the file has a mistake in it (a missing `,` or `"`), the launcher says so and stops; fix it, or delete `settings.json` to get the defaults back.

---

## Troubleshooting
- **`Installed Java` is not the number the version needs**: That Java is not installed. Pick the version again and choose Yes when the launcher offers to download it, or run the setup script again, or install it from the table in [Manual setup](#option-2-manual-setup). On Arch, `archlinux-java status` lists the installed versions.
- **`ClassCastException ... cannot be cast to class java.net.URLClassLoader`** or **`NoClassDefFoundError: net/minecraft/launchwrapper/...`**: An old Forge version ran on a new Java. Install Java 8.
- **`<version> needs <base>`**: The mod loader's base version is missing. Choose "install new version" and pick the base version named in the message.
- **`Minecraft <version> needs Java <n>, but you have Java <m>`**: Install the Java named in the message (run the setup script again), then pick the version again.
- **`Processor failed, invalid outputs`** (Forge installer): Run the installer with the matching Java (see [Mod Loaders](#mod-loaders)).
- **`Module minecraft contains package ...`** (modern Forge): The game jar was not renamed. Make sure you are on the latest version of this branch.
- **`node: error while loading shared libraries: libsimdjson.so...`** (or another `lib...so` file): Node.js is installed but cannot start, because the system is only partly updated. This is common on Arch and CachyOS. Update the whole system, then run `./install.sh` again:

  | System | Command |
  |---|---|
  | Arch / CachyOS | `sudo pacman -Syu` |
  | Ubuntu / Debian | `sudo apt update && sudo apt upgrade` |
  | Fedora | `sudo dnf upgrade` |

  `install.sh` checks for this after installing and prints the command for your system.
- **`'npm' is not recognized` (Windows)**: The new window did not get the updated PATH. Close it and double-click `run.bat`.
- **`Cannot find package 'adm-zip'`**, **`'@clack/prompts'`**, or **`'chalk-animation'`**: Run `npm install` in the project folder. This also happens after updating an older copy of the launcher, because new libraries were added.
- **`No versions found`**: There are no installed versions yet. Choose "install new version" first.
- **The menus look broken or the arrow keys print letters**: Run the launcher in a real terminal window, not through a pipe or an editor's output panel.
- **`Could not download <file>. Check your internet and try again.`**: The download failed 3 times. Check the connection and pick the version again; files that were already verified are skipped.
- **`profiles.json has a mistake in it`**: The file was edited by hand or saved only halfway. Fix it, or delete it to start with no profiles.
- **A version crashes and you don't know why**: Choose "repair an installed version" and pick it. Every file is checked again and broken ones are downloaded again.
- **Game crashes with `UnsatisfiedLinkError`**: Delete `.minecraft/versions/<version>/natives` and run again so the natives are extracted fresh.

---

## Code Structure
All logic lives in `minecraft-verision-installer.js`, split into sections in the order they run:

| Section | Responsibility |
|---|---|
| **Restart manager** | `canSwap` and `isRestart`; on Windows the first copy keeps starting a fresh launcher every time one closes with code `2` |
| **Settings** | `DEFAULT_SETTINGS`, the logo and its colors, then `BASE_DIR`, `MINECRAFT_DIR`, file paths, URLs, and `JAVA_SEARCH_DIRS` |
| **settings.json** | Creates `settings.json` with the defaults the first time, reads it, and fills in any missing value from `DEFAULT_SETTINGS` |
| **verified.json** | Loads the list of files that already passed their SHA1 check |
| **Intro** | Prints the logo, the animated "made by Omar" line, and opens the prompt frame |
| **Platform** | Detects the OS, CPU architecture, and native file extension |
| **Helpers** | Shared functions (table below) |
| **Profile** | Loads `profiles.json`, shows the profile list, or creates a profile |
| **Questions** | Play, install, repair, settings, or exit, then the version |
| **Version JSON + merge** | Reads or downloads the JSON and merges it with its `inheritsFrom` base |
| **Libraries list** | Builds the normalized `libFiles` list from every library format |
| **Java** | Finds the Java that matches the required version |
| **Client jar** | Creates the version and instance folders, `launcher_profiles.json`, downloads the jar, and copies it under the mod loader's name |
| **Libraries / Assets** | Downloads everything with the concurrency limit |
| **Margin** | Wraps `process.stdout.write` so every printed line starts after `MARGIN_LEFT` spaces |
| **Natives** | Extracts native files into `versions/<version>/natives/` with adm-zip's `extractEntryTo` |
| **Classpath / Arguments / Replacements** | Builds the final Java command |
| **verified.json save** | Saves the checked files, and after an install asks whether to play now |
| **Outro / Launch** | Closes the prompt frame, plays the "Yo Have Fun" animation, then starts Java with its output going straight to the terminal (`stdio: "inherit"`), and starts the launcher again when the game closes |

**Helper functions:**

| Function | Purpose |
|---|---|
| `fetchAllVersions(action)` | Returns the installed versions (play, repair) or Mojang's version list (install) |
| `getInstalledVersions()` | Lists the folders in `versions/` that contain `<id>/<id>.json` |
| `getVersionJson(url)` | Downloads a version JSON |
| `mergeVersionJson(parent, child)` | Merges a mod loader JSON with its base version |
| `mavenToPath(name)` | Turns `group:artifact:version` into a Maven file path |
| `findJava(requiredJava)` | Finds an installed Java with the exact major version |
| `readJavaVersion(javaHome)` | Reads the major version from the `release` file in a Java folder without starting Java (handles the old `1.8` format) |
| `getInstalledJavaVersion(javaPath)` | Runs `java -version` and returns the major version; used only when there is no `release` file |
| `parseJavaVersion(text)` | Turns a full Java version like `1.8.0_392` or `21.0.5` into its main number (8 or 21) |
| `downloadJava(component)` | Downloads the Java a version needs from Mojang into `.minecraft/runtime/<component>/` |
| `isAllowed(rules)` | Evaluates Mojang `rules` (OS, architecture, features). The last matching rule wins. |
| `limiter(worker, items, limit, title)` | Runs `worker` on every item with at most `limit` running at the same time, and shows a progress bar named `title` |
| `checkDownloading(url)` | `fetch` that tries 3 times, then shows a message and goes back to the menu |
| `downloadFile(url, filePath, sha1)` | Downloads one file unless it is already there and valid, then checks it; every download goes through it |
| `checkSha1(filePath, sha1)` | Returns `true` only if the file exists and its SHA1 matches; skips the hashing for a file in `verified.json` whose size and time have not changed |
| `downloadLibrary(file)`, `downloadAsset([name, asset])` | Build the path and URL of one library or asset and call `downloadFile` |
| `getOfflineUUID(username)` | Builds the offline-mode player UUID |
| `applyReplacements(argument)` | Replaces every `${...}` placeholder in one argument |
| `printWithMargin(text, encoding, callback)` | Replaces `process.stdout.write`: adds the margin at the start of every line, then prints |
| `loadProfiles()` / `saveProfiles(profiles)` | Read and write `profiles.json` |
| `createProfile(profiles)` | Asks for a username and memory, saves the new profile, and returns it |
| `removeProfile(profiles)` | Lists the profiles, asks to confirm, and saves the list without the chosen one |
| `editSettings()` | Lists the settings with their current values, asks for a new value, checks it, and saves `settings.json` |
| `getLatestVersion()` / `updateLauncher()` | Read the newest version number on GitHub, and download and unpack it |
| `restartLauncher()` | Starts the launcher again: replaces the process with `process.execve` on Linux and macOS, or exits with code `2` for the manager on Windows |
| `backToMenu(message)` | Shows what went wrong for 3 seconds, then calls `restartLauncher()` |
| `exitIfCancelled(answer)` | Closes the launcher when `Ctrl+C` was pressed at a question |
| `showAnimatedText(text, time)` | Shows text with a moving rainbow for `time` milliseconds, or as plain text when `time` is `0` |

---

## Project Structure
```
simple-minecraft-launcher/
├── minecraft-verision-installer.js   # The launcher
├── install.sh                        # Linux: asks, installs Node.js and Java 8/17/21/25, adds the shortcut, then runs run.sh
├── install.bat                       # Windows: asks, installs Node.js and Java 8/17/21/25, adds the shortcut, then opens run.bat
├── assets/                           # icon.svg (source), icon.png (Linux), icon.ico (Windows)
├── run.sh                            # Linux: npm install (first time only) + start
├── run.bat                           # Windows: npm install (first time only) + start
├── package.json                      # Project metadata, start script, dependencies
└── README.md

Created at runtime:
├── node_modules/
├── profiles.json                     # Saved profiles (username and memory)
├── settings.json                     # Your settings (see Settings)
└── .minecraft/
    ├── launcher_profiles.json        # Needed by the Fabric / Forge installers
    ├── libraries/                    # Shared Java libraries (Maven layout)
    ├── verified.json                 # Files that already passed their SHA1 check, with size and time
    ├── runtime/                      # Java downloaded by the launcher, one folder per Java (for example java-runtime-delta)
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
