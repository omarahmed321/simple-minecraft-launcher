import AdmZip from "adm-zip";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as readline from 'node:readline/promises';
import { writeFile, mkdir, readFile } from "node:fs/promises";
//--------- main setttings



const JAVA_PATH = 'java'
const BASE_DIR = import.meta.dirname


//--------- Platform / Rules / concurrency limit function /check downloading function / check if the sha1 valid GlobalFunctions
const platform = os.platform()
const minecraftPlatform =platform == 'win32'? 'windows': platform == 'darwin'? 'osx': platform == 'linux'? 'linux': null;
const  ArchReplacements= { x64: "x86_64", ia32: "x86", arm64: "arm64" };
const minecraftArch = ArchReplacements[process.arch];

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

async function limiter(worker,assets,limit){
    let turn =0;
   
   
 async function runner(){
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

async function checkDownloading (url){
    const response = await fetch(url);
    if(!response.ok){
        throw new Error(`lets say here that we are : ${response.status} and the url is:  ${url} `);
        
    }
    return response;
}

async function checkSha1(filePath,readySha1){
      if (!existsSync(filePath)) return false;
        const data = await readFile(filePath);
    const sha1 = crypto.createHash("sha1").update(data).digest("hex");
    return sha1===readySha1;
}
//--------- fetching all version numbers and their types
const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
let allVersions;
async function fetchAllVersions(){
     const responce = await checkDownloading(MANIFEST_URL);
    allVersions = await  responce.json();
    let i =1
    allVersions.versions.map((version)=>{console.log(`${i}-version:${version.id} : type:${version.type}`);
i++})
}
await fetchAllVersions();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question('Which version do u wanna install / play? ');

const chosen = allVersions.versions[Number(answer) - 1];
if (!chosen) { console.log("Invalid number"); process.exit(1); }
console.log("You chose:", chosen.id, chosen.type);
const USERNAME =await rl.question("The name of the user in the game? ");
if (!/^\w{3,16}$/.test(USERNAME)) {
    console.log("username must be 3-16 characters, letters, numbers, and u can use _");
    process.exit(1);
}
console.log(`username is ${USERNAME} `)
const memAllocated=await rl.question("How much memory u wanna the game allocate (write number for example 3)? ");
const memNumber = Number(memAllocated);
if (!Number.isInteger(memNumber) || memNumber < 1 || memNumber > 32) {
    console.log("Memory must be a whole number between 1 and 32");
    process.exit(1);
}
console.log(`you have set the max memory usage to -Xmx${memNumber}G `)
await rl.question("press enter to continue")
rl.close();
const GAME_DIR = path.resolve(BASE_DIR, "versions", chosen.id)


//--------- Version
const verision = chosen;


async function getVersionJson(versionUrl){
    const responce= await checkDownloading(versionUrl);
    const json = await responce.json();
    return json;
}
const JSON_FILE = await getVersionJson(verision.url)

const libFiles =[];
for(const lib of JSON_FILE.libraries){
    // new technique early Exit reduce code complexity
  if (!isAllowed(lib.rules)) continue; 
  if(lib.downloads?.artifact){
    const libArtifact =lib.downloads.artifact
    const file={
        path:libArtifact.path,
        url:libArtifact.url,
        sha1:libArtifact.sha1,
        isNative:lib.name.includes("natives")

    }
    libFiles.push(file)

  }
const libNative = lib.natives?.[minecraftPlatform]?.replace("${arch}", "64")
const libClassifier = lib.downloads?.classifiers?.[libNative]
if(libClassifier){
    const file={
          path: libClassifier.path,
        url: libClassifier.url,
        sha1: libClassifier.sha1,
        isNative: true
    }
      libFiles.push(file)
}

}
//--------- Java Check
const requiredJava = JSON_FILE.javaVersion?.majorVersion ?? 8;
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
    console.log(`Java not found at "${JAVA_PATH}". Install Java ${requiredJava} and try again.`);
    process.exit(1);
}

if (installedJava < requiredJava) {
    console.log(`Minecraft ${verision.id} needs Java ${requiredJava}, but you have Java ${installedJava}.`);
    process.exit(1);
}


//--------- Client.jar
async function getClientJar(VersionJsonDownloadsClient){
   if(await checkSha1(`${GAME_DIR}/client.jar`,JSON_FILE.downloads.client.sha1)) return console.log(`the file exists at:${GAME_DIR}/client.jar`)
console.log(`Downloading: ${GAME_DIR}/client.jar`)
    const responce =await checkDownloading(VersionJsonDownloadsClient)
    const jarFile = await responce.arrayBuffer();
   await writeFile(`${GAME_DIR}/client.jar`, Buffer.from(jarFile) )
    return jarFile
}
await mkdir(GAME_DIR, { recursive: true })
await getClientJar(JSON_FILE.downloads.client.url)

//--------- Libraries

console.log("-----------------------------------------------")
async function getArtifactUrl(file){
         const liburl = file.url;
    const path = file.path;
   if(await checkSha1(`${BASE_DIR}/libraries/${path}`,file.sha1)) return console.log(`the file exists: ${BASE_DIR}/libraries/${path}`)
   
  console.log(`Downloading: ${path}`)
    const responce = await checkDownloading(liburl)
    const jarFile = await responce.arrayBuffer();
    await mkdir(`${BASE_DIR}/libraries/` + path.substring(0,path.lastIndexOf('/')),{recursive:true}) 
   await writeFile(`${BASE_DIR}/libraries/${path}`, Buffer.from(jarFile))

}

await limiter(getArtifactUrl,libFiles , 8);

//--------- Assets
const ASSETURL = JSON_FILE.assetIndex.url


async function getAssets(asseturl){
    console.log(`Downloading: ${asseturl}`)

    const responce = await checkDownloading(asseturl)
    const assetjson = await responce.json();
    return assetjson
}
console.log("-----------------------------------------------")
console.log("Asseturl")
const assetjson = await getAssets(ASSETURL)
await mkdir(`${BASE_DIR}/assets/indexes`,{recursive:true})
await writeFile(`${BASE_DIR}/assets/indexes/${JSON_FILE.assetIndex.id}.json`, JSON.stringify(assetjson))


console.log("-----------------------------------------------")
console.log("Hashes")
//  *
async function getHashes(hash,path){
   if(await checkSha1(`${BASE_DIR}/assets/objects/${hash.substring(0,2)}/${hash}`,hash)) return console.log(`the file exists:${BASE_DIR}/assets/objects/${hash.substring(0,2)}/${hash}`)
    console.log(`Downloading: ${path}`)

    const responce = await checkDownloading(`https://resources.download.minecraft.net/${hash.substring(0,2)}/${hash}`)
const data = await responce.arrayBuffer();

await mkdir(`${BASE_DIR}/assets/objects/${hash.substring(0,2)}`,{recursive:true})
await writeFile(`${BASE_DIR}/assets/objects/${hash.substring(0,2)}/${hash}` ,Buffer.from(data));
return data
}



const assetList = Object.entries(assetjson.objects);


async function downloadOneAsset(item) {
    const path = item[0];
    const asset = item[1];
    return getHashes(asset.hash, path);
}


await limiter(downloadOneAsset, assetList,16);

    




//--------- Natives
const filteredNativeByPlatform = libFiles.filter((file) => file.isNative);
console.log("Natives")


// ---------------------------------------------------------------------------------------------
// now we have downloaded all the required files we need to do (extraction,manage launch arguments & class path ,launch the game )

//--------- Extraction
// make all the natives from .jar (zipped data) to .so files and more 
const nativeExtension =
      platform == 'win32' ? '.dll'
    : platform == 'darwin' ? '.dylib'
    : platform == 'linux' ? '.so'
    : null;
    
for (const native of filteredNativeByPlatform) {
const jarPath = native.path;
const zip = new AdmZip(`${BASE_DIR}/libraries/${jarPath}`);


const entries = zip.getEntries();
const filesWithoutFolders = entries.filter((entry)=>{return !entry.isDirectory })

const nativeFiles = filesWithoutFolders.filter((entry)=>{
    return entry.entryName.endsWith(nativeExtension)
})


for (const entry of nativeFiles) {
    const fileName = path.basename(entry.entryName);
  await mkdir(`${GAME_DIR}/natives`, { recursive: true });
await writeFile(`${GAME_DIR}/natives/${fileName}`, entry.getData());
    console.log(`Extracting: ${fileName}`);
}
}

//--------- Classpath
const libPaths = libFiles.map((file)=>{return `${BASE_DIR}/libraries/${file.path}`})

const classpath = [
   `${GAME_DIR}/client.jar`,
    ...libPaths
];
const classpathValue = classpath.join(path.delimiter)
console.log("-----------------------------------------------");

//--------- JvmArguments and GameArguments
const jvmArguments=[]
const gameArguments =[]
if(JSON_FILE.arguments){
for(const argument of JSON_FILE.arguments.jvm){
    if(typeof argument ==="string")jvmArguments.push(argument);
    if(typeof argument === "object"){
const allowed = isAllowed(argument.rules);

      if(allowed){
if (Array.isArray(argument.value)) jvmArguments.push(...argument.value);
else jvmArguments.push(argument.value);
      }
    }
}



for (const argument of JSON_FILE.arguments.game) {

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

}
else{
    const mainArguments =["-Djava.library.path=${natives_directory}","-cp","${classpath}"] 
jvmArguments.push(...mainArguments);
const gameArgument = JSON_FILE.minecraftArguments.split(" ");
gameArguments.push(...gameArgument)

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
const offlineUUID = getOfflineUUID(USERNAME);
//--------- Replacements
const replacements = {
    "${user_properties}": "{}",
    "${classpath}": classpathValue,
    "${natives_directory}": `${GAME_DIR}/natives`,
    "${launcher_name}": "OmarsCustomLauncher",
    "${launcher_version}": "1.0",

    "${auth_player_name}": USERNAME,
    "${auth_uuid}": offlineUUID,
    "${auth_access_token}": "0",
    "${clientid}": "0",
    "${assets_root}": `${BASE_DIR}/assets`,
    "${auth_xuid}": "",
    "${user_type}": "legacy",
    "${version_name}": verision.id,
    "${version_type}": JSON_FILE.type,

  "${game_directory}": GAME_DIR,

    "${assets_index_name}": JSON_FILE.assetIndex.id
};

function applyReplacements(argument) {
    return argument.replace(/\$\{(\w+)\}/g, (placeholder) => {
        return placeholder in replacements ? replacements[placeholder] : placeholder;
    });
}


jvmArguments.push(`-Xmx${memNumber}G`);
const finalJvmArguments = jvmArguments.map(applyReplacements);
const finalGameArguments = gameArguments.map(applyReplacements);
const javaArguments = [
    ...finalJvmArguments,
    JSON_FILE.mainClass,
    ...finalGameArguments
];


console.log("--------------------------------------------")

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