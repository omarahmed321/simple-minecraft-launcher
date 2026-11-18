import AdmZip from "adm-zip";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import * as p from "@clack/prompts";
import {
  writeFile,
  mkdir,
  readFile,
  readdir,
  copyFile,
} from "node:fs/promises";





//--------- restart manager
// the first copy only keeps running the real launcher again every time it closes with code 2
if (!process.env.LAUNCHER_CHILD) {
  let launcher;
  do {
    launcher = spawnSync(process.execPath, process.argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env, LAUNCHER_CHILD: "1" },
    });
  } while (launcher.status === 2);
  process.exit(launcher.status ?? 0);
}
//--------- main settings

//---- default settings settings.json next to the launcher overrides them
const DEFAULT_SETTINGS = {
  JAVA_PATH: "java",
  LIBRARY_FILES_DOWNLOAD_LIMIT: 8,
  ASSET_DOWNLOAD_LIMIT: 16,
  INTRO_ANIMATION_TIME: 1500,
  OUTRO_ANIMATION_TIME: 1500,
  BAR_SIZE: 20,
  BAR_RENDERING_DELAY: 16,
  MARGIN_LEFT: 4,
  MARGIN_TOP: 2,
};

//---- logo and colors
const LOGO = [
  "███████╗██╗     ",
  "██╔════╝██║     ",
  "███████╗██║     ",
  "╚════██║██║     ",
  "███████║███████╗",
  "╚══════╝╚══════╝",
];
const PURPLE = "\x1b[38;2;166;120;240m";
const RESET = "\x1b[39m";

// don't edit it
const BASE_DIR = import.meta.dirname;
const MINECRAFT_DIR = path.join(BASE_DIR, ".minecraft");
const PROFILES_PATH = path.join(BASE_DIR, "profiles.json");
const SETTINGS_PATH = path.join(BASE_DIR, "settings.json");
const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSETS_URL = "https://resources.download.minecraft.net";
const UPDATE_PACKAGE_URL =
  "https://raw.githubusercontent.com/omarahmed321/simple-minecraft-launcher/instances-supported-version/package.json";
const UPDATE_ZIP_URL =
  "https://github.com/omarahmed321/simple-minecraft-launcher/archive/refs/heads/instances-supported-version.zip";
const JAVA_SEARCH_DIRS = [
  "/usr/lib/jvm",
  "C:\\Program Files\\Eclipse Adoptium",
];

//--------- settings.json
// creates settings.json with the defaults the first time
if (!existsSync(SETTINGS_PATH)) {
  await writeFile(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

// a typo in settings.json would crash the launcher so show a clear message instead
let savedSettings;
try {
  savedSettings = JSON.parse(await readFile(SETTINGS_PATH, "utf8"));
} catch {
  console.log(
    "settings.json has a mistake in it. fix it or delete it to get the default settings back.",
  );
  process.exit(1);
}

// saved values win and anything missing from the file uses its default
const {
  JAVA_PATH,
  LIBRARY_FILES_DOWNLOAD_LIMIT,
  ASSET_DOWNLOAD_LIMIT,
  INTRO_ANIMATION_TIME,
  OUTRO_ANIMATION_TIME,
  BAR_SIZE,
  BAR_RENDERING_DELAY,
  MARGIN_LEFT,
  MARGIN_TOP,
} = { ...DEFAULT_SETTINGS, ...savedSettings };

//--------- margin
// the 3 ways a printed line can start: a new line or clack jumping back to the line start

// checks if margin is valid or not (mandatory to be here)
function validMargin(name, value, max) {
  if (Number.isInteger(value) && value >= 0 && value <= max) return value;
  console.log(
    `settings.json: ${name} must be a whole number from 0 to ${max}, using ${DEFAULT_SETTINGS[name]} instead.`,
  );
  return DEFAULT_SETTINGS[name];
}

const LINE_START = /\n|\x1b\[1?G|\x1b\[999D/g;

const margin = " ".repeat(validMargin("MARGIN_LEFT", MARGIN_LEFT, 40));
const printOnScreen = process.stdout.write.bind(process.stdout);

// puts the margin at the start of every line then prints it
function printWithMargin(text, encoding, callback) {
  const pushedText = String(text).replaceAll(
    LINE_START,
    (lineStart) => lineStart + margin,
  );
  return printOnScreen(pushedText, encoding, callback);
}

process.stdout.write = printWithMargin;
process.stdout.write("\n".repeat(validMargin("MARGIN_TOP", MARGIN_TOP, 20)));
//--------- intro  lines with clack
console.log(PURPLE + LOGO.join("\n") + RESET);
await showAnimatedText("made by Omar", INTRO_ANIMATION_TIME);
console.log();
p.intro("Simple Launcher");

//--------- Platform
const platform = os.platform();
const minecraftPlatform =
  platform == "win32"
    ? "windows"
    : platform == "darwin"
      ? "osx"
      : platform == "linux"
        ? "linux"
        : null;
if (!minecraftPlatform) {
  p.cancel("Your OS is not supported");
  process.exit(1);
}
const nativeExtension =
  platform == "win32"
    ? ".dll"
    : platform == "darwin"
      ? ".dylib"
      : platform == "linux"
        ? ".so"
        : null;
const ARCH_MAP = { x64: "x86_64", ia32: "x86", arm64: "arm64" };
const minecraftArch = ARCH_MAP[process.arch];

// function that fetch all version to show for the user

async function fetchAllVersions(isLocal) {
  let shownVersions;

  if (Number(isLocal) === 1) {
    const installedIds = await getInstalledVersions();
    shownVersions = installedIds.map((id) => {
      return { id: id, type: "installed" };
    });
  } else if (Number(isLocal) === 2) {
    const response = await checkDownloading(MANIFEST_URL);
    const manifest = await response.json();
    shownVersions = manifest.versions;
  }

  if (shownVersions.length === 0) {
    p.cancel("No versions found");
    process.exit(1);
  }

  return shownVersions;
}
// fucntions is allowed just takes rules and returns the boolean
// that we depend on to determine what files your system needs based on the arch
function isAllowed(rules) {
  if (!rules) return true;
  let allowed = false;
  for (const rule of rules) {
    let matches = true;
    if (rule.features) matches = false;
    if (rule.os?.name && rule.os.name !== minecraftPlatform) matches = false;
    if (rule.os?.arch && rule.os.arch !== minecraftArch) matches = false;
    if (matches) allowed = rule.action === "allow";
  }
  return allowed;
}
// limiter takes the function as a worker and the assets and how many runners will work this for Concurrency limit
async function limiter(worker, assets, limit, title) {
  let turn = 0;
  let done = 0;
  const bar = p.progress({
    max: assets.length,
    size: BAR_SIZE,
    delay: BAR_RENDERING_DELAY,
  });
  bar.start(title);
  async function runner() {
    while (turn < assets.length) {
      let asset = assets[turn];
      turn++;
      await worker(asset);
      done++;
      bar.advance(
        1,
        `${title} ${done}/${assets.length} ${path.basename(asset.path ?? asset[0])}`,
      );
    }
  }
  const runners = [];
  for (let i = 0; i < limit; i++) {
    runners.push(runner());
  }

  await Promise.all(runners);
  bar.stop(`${title} done`);
}
// check server response like if its 5xx error or 4xx error
async function checkDownloading(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `lets say here that we are : ${response.status} and the url is:  ${url} `,
    );
  }
  return response;
}
// calculates the files to sha1 and compare it to the compelete one in the original database Mojang's one
async function checkSha1(filePath, expectedSha1) {
  if (!existsSync(filePath)) return false;
  const data = await readFile(filePath);
  const sha1 = crypto.createHash("sha1").update(data).digest("hex");
  return sha1 === expectedSha1;
}

//  check the required version of java for the version / and see the version on the system

function getInstalledJavaVersion(javaPath) {
  const result = spawnSync(javaPath, ["-version"], { encoding: "utf8" });
  if (result.error) return null;

  const text = result.stderr;

  const versionText = text.split('"')[1];
  if (!versionText) return null;

  const parts = versionText.split(".");
  if (parts[0] === "1") return parseInt(parts[1]);
  return parseInt(parts[0]);
}

//  function makes a 128 bit hash uuid for every different user
function getOfflineUUID(username) {
  const hash = crypto
    .createHash("md5")
    .update(`OfflinePlayer:${username}`)
    .digest();

  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString("hex");

  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

// function that has regex replaces the arguments ${im here} replaces im here with the replacements table
function applyReplacements(argument) {
  return argument.replace(/\$\{(\w+)\}/g, (placeholder) => {
    return placeholder in replacements
      ? replacements[placeholder]
      : placeholder;
  });
}
// function to get the json for the selected version
async function getVersionJson(versionUrl) {
  const response = await checkDownloading(versionUrl);
  const json = await response.json();
  return json;
}
// download client jar lol you could tell
async function downloadClientJar(clientUrl) {
  if (await checkSha1(`${jarPath}`, versionJson.downloads.client.sha1)) return;
  p.log.step("Downloading client jar");
  const response = await checkDownloading(clientUrl);
  const jarFile = await response.arrayBuffer();
  await writeFile(`${jarPath}`, Buffer.from(jarFile));
  return jarFile;
}
// download library
async function downloadLibrary(file) {
  if (!file.url) return;
  const libUrl = file.url;
  const path = file.path;
  if (await checkSha1(`${MINECRAFT_DIR}/libraries/${path}`, file.sha1)) return;

  const response = await checkDownloading(libUrl);
  const jarFile = await response.arrayBuffer();
  await mkdir(
    `${MINECRAFT_DIR}/libraries/` + path.substring(0, path.lastIndexOf("/")),
    { recursive: true },
  );
  await writeFile(`${MINECRAFT_DIR}/libraries/${path}`, Buffer.from(jarFile));
}

// download asset
async function downloadAsset(hash, path) {
  if (
    await checkSha1(
      `${MINECRAFT_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
      hash,
    )
  )
    return;

  const response = await checkDownloading(
    `${ASSETS_URL}/${hash.substring(0, 2)}/${hash}`,
  );
  const data = await response.arrayBuffer();

  await mkdir(`${MINECRAFT_DIR}/assets/objects/${hash.substring(0, 2)}`, {
    recursive: true,
  });
  await writeFile(
    `${MINECRAFT_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
    Buffer.from(data),
  );
  return data;
}
// download one asset to make it work with the limiter
async function downloadOneAsset(item) {
  const path = item[0];
  const asset = item[1];
  return downloadAsset(asset.hash, path);
}

// returns the name of folders in directory
async function getInstalledVersions() {
  const versionsDir = path.join(MINECRAFT_DIR, "versions");
  if (!existsSync(versionsDir)) return [];
  const allFolders = await readdir(versionsDir);
  return allFolders.filter((id) => {
    return existsSync(path.join(versionsDir, id, `${id}.json`));
  });
}

// child (fabric/forge) + parent (vanilla)
function mergeVersionJson(parentJson, childJson) {
  const merged = { ...parentJson, ...childJson };
  merged.libraries = [...childJson.libraries, ...parentJson.libraries];
  if (parentJson.arguments) {
    merged.arguments = {
      jvm: [
        ...(parentJson.arguments.jvm ?? []),
        ...(childJson.arguments?.jvm ?? []),
      ],
      game: [
        ...(parentJson.arguments.game ?? []),
        ...(childJson.arguments?.game ?? []),
      ],
    };
  } else {
    delete merged.arguments;
  }
  return merged;
}
function mavenToPath(name) {
  const parts = name.split(":");
  const group = parts[0].replaceAll(".", "/");
  const artifact = parts[1];
  const version = parts[2];
  return `${group}/${artifact}/${version}/${artifact}-${version}.jar`;
}

// looks for an installed java with the exact major version falls back to JAVA_PATH
async function findJava(requiredJava) {
  const javaFile = platform === "win32" ? "java.exe" : "java";
  for (const baseDir of JAVA_SEARCH_DIRS) {
    if (!existsSync(baseDir)) continue;
    for (const folder of await readdir(baseDir)) {
      const javaPath = path.join(baseDir, folder, "bin", javaFile);
      if (!existsSync(javaPath)) continue;
      if (getInstalledJavaVersion(javaPath) === requiredJava) return javaPath;
    }
  }
  p.log.warn(`Java ${requiredJava} not found, using default java instead`);
  return JAVA_PATH;
}
// shows text with a moving rainbow or as plain text when time is 0
async function showAnimatedText(text, time) {
  if (time === 0) return console.log(text);

  const { default: chalkAnimation } = await import("chalk-animation");
  const animation = chalkAnimation.rainbow(text);
  await sleep(time);
  animation.stop();
}

// reads the saved profiles or an empty list the first time lol
async function loadProfiles() {
  if (!existsSync(PROFILES_PATH)) return [];
  const data = JSON.parse(await readFile(PROFILES_PATH, "utf8"));
  return data.profiles;
}

// saves the profiles list to profiles.json
async function saveProfiles(profiles) {
  await writeFile(PROFILES_PATH, JSON.stringify({ profiles }, null, 2));
}

// asks for a name and memory, saves them as a new profile, and returns it
async function createProfile(profiles) {
  const name = await p.text({
    message: "The name of the user in the game?",
    placeholder: "Steve",
    validate: (value) => {
      if (!/^\w{3,16}$/.test(value)) {
        return "username must be 3-16 characters, letters, numbers, and u can use _";
      }
    },
  });
  if (p.isCancel(name)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const memAnswer = await p.text({
    message:
      "How much memory u wanna the game allocate (write number for example 3)?",
    placeholder: "3",
    validate: (value) => {
      // transforming value to number cuz the spaces
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1 || number > 32) {
        return "Memory must be a whole number between 1 and 32";
      }
    },
  });
  if (p.isCancel(memAnswer)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const profile = { name: name, memory: Number(memAnswer) };
  profiles.push(profile);
  await saveProfiles(profiles);
  p.log.success(`Profile "${name}" saved`);
  return profile;
}

// returns the newest version number on GitHub or null with no internet
async function getLatestVersion() {
  try {
    const response = await fetch(UPDATE_PACKAGE_URL, {
      signal: AbortSignal.timeout(3000),
    });
    const latestPackage = await response.json();
    return latestPackage.version;
  } catch {
    return null;
  }
}

// downloads the newest launcher from GitHub and unpacks it over the current files
async function updateLauncher() {
  const response = await checkDownloading(UPDATE_ZIP_URL);
  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    // every file in the zip is inside one top folder so drop that folder from the path
    const relativePath = entry.entryName.split("/").slice(1).join("/");
    // windows keeps reading run.bat while it runs so changing it now could break the window
    if (relativePath === "run.bat") continue;
    zip.extractEntryTo(
      entry,
      path.join(BASE_DIR, path.dirname(relativePath)),
      false,
      true,
    );
  }
}
// closes with code 2 so the restart manager opens a fresh launcher
function restartLauncher() {
  process.exit(2);
}





//-------- Update Checking
// checks if there is a newier version
const localPackage = JSON.parse(
  await readFile(path.join(BASE_DIR, "package.json"), "utf8"),
);
const isDevCopy = existsSync(path.join(BASE_DIR, ".git"));
const latestVersion = isDevCopy ? null : await getLatestVersion();

if (latestVersion && latestVersion !== localPackage.version) {
  const wantsUpdate = await p.confirm({
    message: `Update available (${localPackage.version} → ${latestVersion}). Update now?`,
  });
  if (p.isCancel(wantsUpdate)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
  if (wantsUpdate) {
    try {
      await updateLauncher();

      // a new version can need new packages
      p.log.step("Installing new packages");
      const install = spawnSync("npm", ["install"], {
        cwd: BASE_DIR,
        stdio: "ignore",
        shell: true,
      });
      if (install.status !== 0) throw new Error("npm install failed");

      // start the updated launcher in this same window and close this old one when it closes
      p.outro(`Updated to ${latestVersion}, starting the new version`);
      const newLauncher = spawnSync(process.execPath, process.argv.slice(1), {
        stdio: "inherit",
      });
      process.exit(newLauncher.status ?? 0);
    } catch {
      p.log.warn("Update failed, keeping the current version.");
    }
  }
}
//--------- Profile
const profiles = await loadProfiles();
// with no saved profiles, skip the list and go straight to creating one
let profile = "new";
if (profiles.length > 0) {
  profile = await p.select({
    message: "Choose a profile",
    options: [
      ...profiles.map((saved) => ({
        value: saved,
        label: saved.name,
        hint: `${saved.memory} GB`,
      })),
      { value: "new", label: "+ create a new profile" },
    ],
  });
  if (p.isCancel(profile)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
}
if (profile === "new") profile = await createProfile(profiles);

const username = profile.name;
const memNumber = profile.memory;

// the questions

const isLocal = await p.select({
  message: "What do you wanna do ?",
  options: [
    { value: 1, label: "run an installed version" },
    { value: 2, label: "install new version " },
    { value: "exit", label: "Exit" },
  ],
});
if (isLocal === "exit") process.exit(0);
if (p.isCancel(isLocal)) {
  p.cancel("Cancelled");
  process.exit(0);
}
const shownVersions = await fetchAllVersions(isLocal);
const selectedVersion = await p.autocomplete({
  message: "Choose version:",
  placeholder: "write here the version",
  maxItems: 8,
  options: [
    { value: "back", label: "← Back" },
    ...shownVersions.map((version) => ({
      value: version,
      label: version.id,
      hint: version.type,
    })),
  ],

});
if (selectedVersion === "back") restartLauncher();
if (p.isCancel(selectedVersion)) {
  p.cancel("Cancelled");
  process.exit(0);
}

// path.resolve actually will connect them all
const versionDir = path.join(MINECRAFT_DIR, "versions", selectedVersion.id);
const gameDir = path.join(MINECRAFT_DIR, "instances", selectedVersion.id);
let versionJson;
if (selectedVersion.url) {
  versionJson = await getVersionJson(selectedVersion.url);
} else {
  const jsonPath = path.join(
    MINECRAFT_DIR,
    "versions",
    selectedVersion.id,
    `${selectedVersion.id}.json`,
  );
  versionJson = JSON.parse(await readFile(jsonPath, "utf8"));
}
// merge block
let jarId = selectedVersion.id;
if (versionJson.inheritsFrom) {
  const parentId = versionJson.inheritsFrom;
  const parentPath = path.join(
    MINECRAFT_DIR,
    "versions",
    parentId,
    `${parentId}.json`,
  );
  if (!existsSync(parentPath)) {
    p.cancel(
      `${selectedVersion.id} needs ${parentId}. Run again, choose "install new version", and pick ${parentId}.`,
    );
    process.exit(1);
  }
  const parentJson = JSON.parse(await readFile(parentPath, "utf8"));
  versionJson = mergeVersionJson(parentJson, versionJson);
  jarId = parentId;
}
const jarPath = path.join(MINECRAFT_DIR, "versions", jarId, `${jarId}.jar`);
// -----
const requiredJava = versionJson.javaVersion?.majorVersion ?? 8;
p.log.info(`Required Java: ${requiredJava}`);
const offlineUUID = getOfflineUUID(username);
//--------- Version

const libFiles = [];
for (const lib of versionJson.libraries) {
  // new technique early Exit reduce code complexity
  if (!isAllowed(lib.rules)) continue;
  if (!lib.downloads) {
    const baseUrl = lib.url ?? "https://libraries.minecraft.net/";
    const libPath = mavenToPath(lib.name);
    libFiles.push({
      path: libPath,
      url: baseUrl + libPath,
      sha1: lib.sha1,
      isNative: false,
    });
    continue;
  }
  if (lib.downloads?.artifact) {
    const libArtifact = lib.downloads.artifact;
    const file = {
      path: libArtifact.path,
      url: libArtifact.url,
      sha1: libArtifact.sha1,
      isNative: lib.name.includes("natives"),
    };
    libFiles.push(file);
  }
  const libNative = lib.natives?.[minecraftPlatform]?.replace("${arch}", "64");
  const libClassifier = lib.downloads?.classifiers?.[libNative];
  if (libClassifier) {
    const file = {
      path: libClassifier.path,
      url: libClassifier.url,
      sha1: libClassifier.sha1,
      isNative: true,
    };
    libFiles.push(file);
  }
}
//--------- Java Check

const javaPath = await findJava(requiredJava);
const installedJava = getInstalledJavaVersion(javaPath);
p.log.info(`Installed Java: ${installedJava}`);
if (installedJava === null) {
  p.cancel(
    `Java not found at "${javaPath}". Install Java ${requiredJava} and try again.`,
  );
  process.exit(1);
}

if (installedJava < requiredJava) {
  p.cancel(
    `Minecraft ${selectedVersion.id} needs Java ${requiredJava}, but you have Java ${installedJava}.`,
  );
  process.exit(1);
}

//--------- Client.jar
await mkdir(versionDir, { recursive: true });
await mkdir(gameDir, { recursive: true });
// launcher json for other instances
const profilesPath = path.join(MINECRAFT_DIR, "launcher_profiles.json");
if (!existsSync(profilesPath)) {
  await writeFile(profilesPath, JSON.stringify({ profiles: {} }));
}
//----

if (selectedVersion.url) {
  await writeFile(
    `${versionDir}/${selectedVersion.id}.json`,
    JSON.stringify(versionJson),
  );
}

await downloadClientJar(versionJson.downloads.client.url);
// forge ignores the game jar only if it has the version's own name
let classpathJar = jarPath;
if (jarId !== selectedVersion.id) {
  classpathJar = path.join(versionDir, `${selectedVersion.id}.jar`);
  await copyFile(jarPath, classpathJar);
}

//--------- Libraries

await limiter(
  downloadLibrary,
  libFiles,
  LIBRARY_FILES_DOWNLOAD_LIMIT,
  "Libraries",
);

//--------- Assets
const indexPath = path.join(
  MINECRAFT_DIR,
  "assets",
  "indexes",
  `${versionJson.assetIndex.id}.json`,
);
// use the saved index when it is there and not broken, so installed versions start without internet
if (!(await checkSha1(indexPath, versionJson.assetIndex.sha1))) {
  const response = await checkDownloading(versionJson.assetIndex.url);
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, await response.text());
}
const assetIndex = JSON.parse(await readFile(indexPath, "utf8"));
const assetList = Object.entries(assetIndex.objects);
await limiter(downloadOneAsset, assetList, ASSET_DOWNLOAD_LIMIT, "Assets");

//--------- Legacy assets (versions before 1.7.3 look for files by name, not by hash)
let gameAssetsDir = `${MINECRAFT_DIR}/assets`;
if (assetIndex.map_to_resources)
  gameAssetsDir = path.join(gameDir, "resources");
if (assetIndex.virtual)
  gameAssetsDir = path.join(
    MINECRAFT_DIR,
    "assets",
    "virtual",
    versionJson.assetIndex.id,
  );

if (assetIndex.map_to_resources || assetIndex.virtual) {
  for (const [assetPath, asset] of assetList) {
    const target = path.join(gameAssetsDir, assetPath);
    if (existsSync(target)) continue;
    const hashFile = path.join(
      MINECRAFT_DIR,
      "assets",
      "objects",
      asset.hash.substring(0, 2),
      asset.hash,
    );
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(hashFile, target);
  }
}

//--------- Natives
const nativeLibFiles = libFiles.filter((file) => file.isNative);
// ---------------------------------------------------------------------------------------------
// now we have downloaded all the required files we need to do (extraction,manage launch arguments & class path ,launch the game )

//--------- Extraction
// make all the natives from .jar (zipped data) to .so files and more
for (const native of nativeLibFiles) {
  const nativeJarPath = native.path;
  const zip = new AdmZip(`${MINECRAFT_DIR}/libraries/${nativeJarPath}`);

  const entries = zip.getEntries();
  const filesWithoutFolders = entries.filter((entry) => {
    return !entry.isDirectory;
  });

  const nativeFiles = filesWithoutFolders.filter((entry) => {
    return entry.entryName.endsWith(nativeExtension);
  });

  for (const entry of nativeFiles) {
    zip.extractEntryTo(entry, `${versionDir}/natives`, false, true);
  }
}

//--------- Classpath
const libPaths = libFiles.map((file) => {
  return `${MINECRAFT_DIR}/libraries/${file.path}`;
});
const classpath = [classpathJar, ...libPaths];
const classpathValue = classpath.join(path.delimiter);

//--------- JvmArguments and GameArguments
const jvmArguments = [];
const gameArguments = [];
if (versionJson.arguments) {
  for (const argument of versionJson.arguments.jvm) {
    if (typeof argument === "string") jvmArguments.push(argument);
    if (typeof argument === "object") {
      const allowed = isAllowed(argument.rules);

      if (allowed) {
        if (Array.isArray(argument.value)) jvmArguments.push(...argument.value);
        else jvmArguments.push(argument.value);
      }
    }
  }

  for (const argument of versionJson.arguments.game) {
    if (typeof argument === "string") {
      gameArguments.push(argument);
    }

    if (typeof argument === "object") {
      const allowed = isAllowed(argument.rules);

      if (allowed) {
        if (Array.isArray(argument.value)) {
          gameArguments.push(...argument.value);
        } else {
          gameArguments.push(argument.value);
        }
      }
    }
  }
} else {
  const oldVersionsArguments = [
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
  ];
  jvmArguments.push(...oldVersionsArguments);
  const oldGameArguments = versionJson.minecraftArguments.split(" ");
  gameArguments.push(...oldGameArguments);
}
//--------- Replacements
const replacements = {
  "${library_directory}": `${MINECRAFT_DIR}/libraries`,
  "${classpath_separator}": path.delimiter,
  "${user_properties}": "{}",
  "${classpath}": classpathValue,
  "${natives_directory}": `${versionDir}/natives`,
  "${launcher_name}": "OmarsCustomLauncher",
  "${launcher_version}": "1.0",

  "${auth_player_name}": username,
  "${auth_uuid}": offlineUUID,
  "${auth_access_token}": "0",
  "${clientid}": "0",
  "${assets_root}": `${MINECRAFT_DIR}/assets`,
  "${game_assets}": gameAssetsDir,
  "${auth_session}": "0",
  "${auth_xuid}": "",
  "${user_type}": "legacy",
  "${version_name}": selectedVersion.id,
  "${version_type}": versionJson.type,

  "${game_directory}": gameDir,

  "${assets_index_name}": versionJson.assetIndex.id,
};

jvmArguments.push(`-Xmx${memNumber}G`);
const finalJvmArguments = jvmArguments.map(applyReplacements);
const finalGameArguments = gameArguments.map(applyReplacements);
const javaArguments = [
  ...finalJvmArguments,
  versionJson.mainClass,
  ...finalGameArguments,
];

//--------- outro lines with clack
p.outro("Launching");
await showAnimatedText("Yo Have Fun", OUTRO_ANIMATION_TIME);
//--------- Launch
const minecraft = spawn(javaPath, javaArguments, {
  cwd: gameDir,
  stdio: "inherit",
});

minecraft.on("error", (error) => {
  console.log("SPAWN ERROR:", error);
});

minecraft.on("close", (code) => {
  console.log("Minecraft exited with code:", code);
  restartLauncher();
});