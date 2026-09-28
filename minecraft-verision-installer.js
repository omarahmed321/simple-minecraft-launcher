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
const MINECRAFT_DIR = path.join(BASE_DIR, ".minecraft");
const MANIFEST_URL ="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSETS_URL = "https://resources.download.minecraft.net";
const LIBRARY_FILES_DOWNLOAD_LIMIT = 8;
const ASSET_DOWNLOAD_LIMIT = 16;

//--------- Platform / Rules / concurrency limit function /check downloading function / check if the sha1 valid GlobalFunctions
const platform = os.platform();
const minecraftPlatform =platform == "win32"? "windows" : platform == "darwin"? "osx": platform == "linux"? "linux": null;
if (!minecraftPlatform) {
  console.log("Your OS is not supported");
  process.exit(1);
}
const nativeExtension =platform == "win32" ? ".dll": platform == "darwin"   ? ".dylib"   : platform == "linux"  ? ".so" : null;
const ARCH_MAP = { x64: "x86_64", ia32: "x86", arm64: "arm64" };
const minecraftArch = ARCH_MAP[process.arch];

// function that fetch all version to show for the user
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
  if (parts[0] === "1") return Number(parts[1]);
  return Number(parts[0]);
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
  if (
    await checkSha1(`${versionDir}/${selectedVersion.id}.jar`, versionJson.downloads.client.sha1)
  )
    return console.log(`the file exists at:${versionDir}/${selectedVersion.id}.jar`);
  console.log(`Downloading: ${versionDir}/${selectedVersion.id}.jar`);
  const response = await checkDownloading(clientUrl);
  const jarFile = await response.arrayBuffer();
  await writeFile(`${versionDir}/${selectedVersion.id}.jar`, Buffer.from(jarFile));
  return jarFile;
}
// download library
async function downloadLibrary(file) {
  const libUrl = file.url;
  const path = file.path;
  if (await checkSha1(`${MINECRAFT_DIR}/libraries/${path}`, file.sha1))
    return console.log(`the file exists: ${MINECRAFT_DIR}/libraries/${path}`);

  console.log(`Downloading: ${path}`);
  const response = await checkDownloading(libUrl);
  const jarFile = await response.arrayBuffer();
  await mkdir(
    `${MINECRAFT_DIR}/libraries/` + path.substring(0, path.lastIndexOf("/")),
    { recursive: true },
  );
  await writeFile(`${MINECRAFT_DIR}/libraries/${path}`, Buffer.from(jarFile));
}
// idk the fucntion names is too good at this point?
async function getAssetIndex(assetUrl) {
  console.log(`Downloading: ${assetUrl}`);

  const response = await checkDownloading(assetUrl);
  const assetIndex = await response.json();
  return assetIndex;
}
// download asset 
async function downloadAsset(hash, path) {
  if (
    await checkSha1(
      `${MINECRAFT_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
      hash,
    )
  )
    return console.log(
      `the file exists:${MINECRAFT_DIR}/assets/objects/${hash.substring(0, 2)}/${hash}`,
    );
  console.log(`Downloading: ${path}`);

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
//--------- fetching all version numbers and their types


await fetchAllVersions();

// the questions
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// wait for the upgrade
// const isLocal = await rl.question(" 1-wanna run installed version \n 2-wanna install new version")
// if(Number(isLocal)===1){}
const versionAnswer = await rl.question("Which version do u wanna install /play ? ");

const selectedVersion = allVersions.versions[Number(versionAnswer) - 1];
if (!selectedVersion) {
  console.log("Invalid number");
  process.exit(1);
}
console.log("You chose:", selectedVersion.id, selectedVersion.type);

const username = await rl.question("The name of the user in the game? ");
// regex to check he enters valid one
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
// transforming memAnswer to number cuz the spaces
const memNumber = Number(memAnswer);
if (!Number.isInteger(memNumber) || memNumber < 1 || memNumber > 32) {
  console.log("Memory must be a whole number between 1 and 32");
  process.exit(1);
}
console.log(`you have set the max memory usage to -Xmx${memNumber}G `);
await rl.question("press enter to continue");
rl.close();
// path.resolve actually will connect them all 
const versionDir = path.join(MINECRAFT_DIR, "versions", selectedVersion.id);
const gameDir = MINECRAFT_DIR;
const versionJson = await getVersionJson(selectedVersion.url);
const requiredJava = versionJson.javaVersion?.majorVersion ?? 8;
console.log("Required Java:", requiredJava);
const offlineUUID = getOfflineUUID(username);
//--------- Version





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
await mkdir(versionDir, { recursive: true });
await writeFile(`${versionDir}/${selectedVersion.id}.json`, JSON.stringify(versionJson));
await downloadClientJar(versionJson.downloads.client.url);

//--------- Libraries



await limiter(downloadLibrary, libFiles, LIBRARY_FILES_DOWNLOAD_LIMIT);

//--------- Assets
const assetUrl = versionJson.assetIndex.url;
const assetIndex = await getAssetIndex(assetUrl);
await mkdir(`${MINECRAFT_DIR}/assets/indexes`, { recursive: true });
await writeFile(
  `${MINECRAFT_DIR}/assets/indexes/${versionJson.assetIndex.id}.json`,
  JSON.stringify(assetIndex),
);
const assetList = Object.entries(assetIndex.objects);
await limiter(downloadOneAsset, assetList, ASSET_DOWNLOAD_LIMIT);

//--------- Natives
const nativeLibFiles = libFiles.filter((file) => file.isNative);
// ---------------------------------------------------------------------------------------------
// now we have downloaded all the required files we need to do (extraction,manage launch arguments & class path ,launch the game )

//--------- Extraction
// make all the natives from .jar (zipped data) to .so files and more
for (const native of nativeLibFiles) {
  const jarPath = native.path;
  const zip = new AdmZip(`${MINECRAFT_DIR}/libraries/${jarPath}`);

  const entries = zip.getEntries();
  const filesWithoutFolders = entries.filter((entry) => {
    return !entry.isDirectory;
  });

  const nativeFiles = filesWithoutFolders.filter((entry) => {
    return entry.entryName.endsWith(nativeExtension);
  });

  for (const entry of nativeFiles) {
    const fileName = path.basename(entry.entryName);
    await mkdir(`${versionDir}/natives`, { recursive: true });
    await writeFile(`${versionDir}/natives/${fileName}`, entry.getData());
    console.log(`Extracting: ${fileName}`);
  }
}

//--------- Classpath
const libPaths = libFiles.map((file) => {
  return `${MINECRAFT_DIR}/libraries/${file.path}`;
});
const classpath = [`${versionDir}/${selectedVersion.id}.jar`, ...libPaths];
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
//--------- Replacements
const replacements = {
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
