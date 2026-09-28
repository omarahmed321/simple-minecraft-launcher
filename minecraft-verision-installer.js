import AdmZip from "adm-zip";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as readline from "node:readline/promises";
import { writeFile, mkdir, readFile } from "node:fs/promises";
//--------- main settings

const JAVA_PATH = "java";
const BASE_DIR = import.meta.dirname;

//--------- Platform / Rules / concurrency limit function /check downloading function / check if the sha1 valid GlobalFunctions
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
  console.log("Your OS is not supported");
  process.exit(1);
}
const ARCH_MAP = { x64: "x86_64", ia32: "x86", arm64: "arm64" };
const minecraftArch = ARCH_MAP[process.arch];

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

async function limiter(worker, assets, limit) {
  let turn = 0;

  async function runner() {
    while (turn < assets.length) {
      let asset = assets[turn];
      turn++;
      await worker(asset);
    }
  }
  const runners = [];
  for (let i = 0; i < limit; i++) {
    runners.push(runner());
  }

  await Promise.all(runners);
}

async function checkDownloading(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `lets say here that we are : ${response.status} and the url is:  ${url} `,
    );
  }
  return response;
}

async function checkSha1(filePath, expectedSha1) {
  if (!existsSync(filePath)) return false;
  const data = await readFile(filePath);
  const sha1 = crypto.createHash("sha1").update(data).digest("hex");
  return sha1 === expectedSha1;
}
//--------- fetching all version numbers and their types
const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
let allVersions;
async function fetchAllVersions() {
  const response = await checkDownloading(MANIFEST_URL);
  allVersions = await response.json();
  let i = 1;
  allVersions.versions.map((version) => {
    console.log(`${i}-version:${version.id} : type:${version.type}`);
    i++;
  });
}
await fetchAllVersions();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const versionAnswer = await rl.question("Which version do u wanna install / play? ");

const selectedVersion = allVersions.versions[Number(versionAnswer) - 1];
if (!selectedVersion) {
  console.log("Invalid number");
  process.exit(1);
}
console.log("You chose:", selectedVersion.id, selectedVersion.type);
const username = await rl.question("The name of the user in the game? ");
if (!/^\w{3,16}$/.test(username)) {
  console.log(
    "username must be 3-16 characters, letters, numbers, and u can use _",
  );
  process.exit(1);
}
console.log(`username is ${username} `);
const memAnswer = await rl.question(
  "How much memory u wanna the game allocate (write number for example 3)? ",
);
const memNumber = Number(memAnswer);
if (!Number.isInteger(memNumber) || memNumber < 1 || memNumber > 32) {
  console.log("Memory must be a whole number between 1 and 32");
  process.exit(1);
}
console.log(`you have set the max memory usage to -Xmx${memNumber}G `);
await rl.question("press enter to continue");
rl.close();
const gameDir = path.resolve(BASE_DIR, "versions", selectedVersion.id);

//--------- Version


async function getVersionJson(versionUrl) {
  const response = await checkDownloading(versionUrl);
  const json = await response.json();
  return json;
}
const versionJson = await getVersionJson(selectedVersion.url);

const libFiles = [];
for (const lib of versionJson.libraries) {
  // new technique early Exit reduce code complexity
  if (!isAllowed(lib.rules)) continue;
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
const requiredJava = versionJson.javaVersion?.majorVersion ?? 8;
console.log("Required Java:", requiredJava);
function getInstalledJavaVersion(javaPath) {
  const result = spawnSync(javaPath, ["-version"], { encoding: "utf8" });
  if (result.error) return null;

  const text = result.stderr;

  const versionText = text.split('"')[1];
  if (!versionText) return null;

  const parts = versionText.split(".");
  if (parts[0] === "1") return Number(parts[1]);
  return Number(parts[0]);
}

const installedJava = getInstalledJavaVersion(JAVA_PATH);
console.log("Installed Java:", installedJava);
if (installedJava === null) {
  console.log(
    `Java not found at "${JAVA_PATH}". Install Java ${requiredJava} and try again.`,
  );
  process.exit(1);
}

if (installedJava < requiredJava) {
  console.log(
    `Minecraft ${selectedVersion.id} needs Java ${requiredJava}, but you have Java ${installedJava}.`,
  );
  process.exit(1);
}

//--------- Client.jar
async function downloadClientJar(clientUrl) {
  if (
    await checkSha1(`${gameDir}/client.jar`, versionJson.downloads.client.sha1)
  )
    return console.log(`the file exists at:${gameDir}/client.jar`);
  console.log(`Downloading: ${gameDir}/client.jar`);
  const response = await checkDownloading(clientUrl);
  const jarFile = await response.arrayBuffer();
  await writeFile(`${gameDir}/client.jar`, Buffer.from(jarFile));
  return jarFile;
}
await mkdir(gameDir, { recursive: true });
await downloadClientJar(versionJson.downloads.client.url);

//--------- Libraries

console.log("-----------------------------------------------");
async function downloadLibrary(file) {
  const libUrl = file.url;
  const path = file.path;
  if (await checkSha1(`${BASE_DIR}/libraries/${path}`, file.sha1))
    return console.log(`the file exists: ${BASE_DIR}/libraries/${path}`);

  console.log(`Downloading: ${path}`);
  const response = await checkDownloading(libUrl);
  const jarFile = await response.arrayBuffer();
  await mkdir(
    `${BASE_DIR}/libraries/` + path.substring(0, path.lastIndexOf("/")),
    { recursive: true },
  );
  await writeFile(`${BASE_DIR}/libraries/${path}`, Buffer.from(jarFile));
}

await limiter(downloadLibrary, libFiles, 8);

//--------- Assets
const assetUrl = versionJson.assetIndex.url;

async function getAssetIndex(assetUrl) {
  console.log(`Downloading: ${assetUrl}`);

  const response = await checkDownloading(assetUrl);
  const assetIndex = await response.json();
  return assetIndex;
}
console.log("-----------------------------------------------");
console.log("Asset index");
const assetIndex = await getAssetIndex(assetUrl);
await mkdir(`${BASE_DIR}/assets/indexes`, { recursive: true });
await writeFile(
  `${BASE_DIR}/assets/indexes/${versionJson.assetIndex.id}.json`,
  JSON.stringify(assetIndex),
);

console.log("-----------------------------------------------");
console.log("Hashes");
//  *
async function downloadAsset(hash, path) {
  if (
    await checkSha1(
      `${BASE_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
      hash,
    )
  )
    return console.log(
      `the file exists:${BASE_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
    );
  console.log(`Downloading: ${path}`);

  const response = await checkDownloading(
    `https://resources.download.minecraft.net/${hash.substring(0, 2)}/${hash}`,
  );
  const data = await response.arrayBuffer();

  await mkdir(`${BASE_DIR}/assets/objects/${hash.substring(0, 2)}`, {
    recursive: true,
  });
  await writeFile(
    `${BASE_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
    Buffer.from(data),
  );
  return data;
}

const assetList = Object.entries(assetIndex.objects);

async function downloadOneAsset(item) {
  const path = item[0];
  const asset = item[1];
  return downloadAsset(asset.hash, path);
}

await limiter(downloadOneAsset, assetList, 16);

//--------- Natives
const nativeLibFiles = libFiles.filter((file) => file.isNative);
console.log("Natives");

// ---------------------------------------------------------------------------------------------
// now we have downloaded all the required files we need to do (extraction,manage launch arguments & class path ,launch the game )

//--------- Extraction
// make all the natives from .jar (zipped data) to .so files and more
const nativeExtension =
  platform == "win32"
    ? ".dll"
    : platform == "darwin"
      ? ".dylib"
      : platform == "linux"
        ? ".so"
        : null;

for (const native of nativeLibFiles) {
  const jarPath = native.path;
  const zip = new AdmZip(`${BASE_DIR}/libraries/${jarPath}`);

  const entries = zip.getEntries();
  const filesWithoutFolders = entries.filter((entry) => {
    return !entry.isDirectory;
  });

  const nativeFiles = filesWithoutFolders.filter((entry) => {
    return entry.entryName.endsWith(nativeExtension);
  });

  for (const entry of nativeFiles) {
    const fileName = path.basename(entry.entryName);
    await mkdir(`${gameDir}/natives`, { recursive: true });
    await writeFile(`${gameDir}/natives/${fileName}`, entry.getData());
    console.log(`Extracting: ${fileName}`);
  }
}

//--------- Classpath
const libPaths = libFiles.map((file) => {
  return `${BASE_DIR}/libraries/${file.path}`;
});

const classpath = [`${gameDir}/client.jar`, ...libPaths];
const classpathValue = classpath.join(path.delimiter);
console.log("-----------------------------------------------");

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
const offlineUUID = getOfflineUUID(username);
//--------- Replacements
const replacements = {
  "${user_properties}": "{}",
  "${classpath}": classpathValue,
  "${natives_directory}": `${gameDir}/natives`,
  "${launcher_name}": "OmarsCustomLauncher",
  "${launcher_version}": "1.0",

  "${auth_player_name}": username,
  "${auth_uuid}": offlineUUID,
  "${auth_access_token}": "0",
  "${clientid}": "0",
  "${assets_root}": `${BASE_DIR}/assets`,
  "${auth_xuid}": "",
  "${user_type}": "legacy",
  "${version_name}": selectedVersion.id,
  "${version_type}": versionJson.type,

  "${game_directory}": gameDir,

  "${assets_index_name}": versionJson.assetIndex.id,
};

function applyReplacements(argument) {
  return argument.replace(/\$\{(\w+)\}/g, (placeholder) => {
    return placeholder in replacements
      ? replacements[placeholder]
      : placeholder;
  });
}

jvmArguments.push(`-Xmx${memNumber}G`);
const finalJvmArguments = jvmArguments.map(applyReplacements);
const finalGameArguments = gameArguments.map(applyReplacements);
const javaArguments = [
  ...finalJvmArguments,
  versionJson.mainClass,
  ...finalGameArguments,
];

console.log("--------------------------------------------");

//--------- Launch
const minecraft = spawn(JAVA_PATH, javaArguments);

minecraft.stdout.on("data", (data) => {
  console.log("OUT:", data.toString());
});

minecraft.stderr.on("data", (data) => {
  console.log("ERR:", data.toString());
});

minecraft.on("error", (error) => {
  console.log("SPAWN ERROR:", error);
});

minecraft.on("close", (code) => {
  console.log("Minecraft exited with code:", code);
});
