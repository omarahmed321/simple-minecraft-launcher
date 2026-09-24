import { writeFile ,mkdir } from "node:fs/promises";
import AdmZip from "adm-zip";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

//--------- main setttings
const VERISION ='26.3'
const USERNAME = 'Omar'
const MAX_MEMORY = '4G'
const JAVA_PATH = 'java'


//--------- Platform / Rules 
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

//--------- Version
const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"

async function getJsonVerisonInfo(verisionId){
    const responce = await fetch(MANIFEST_URL);
    const manifest = await  responce.json();
const verision = manifest.versions.find((verision)=>{ return verision.id === verisionId})
return verision
}
const verision = await getJsonVerisonInfo(VERISION);


async function getVersionJson(versionUrl){
    const responce= await fetch(versionUrl);
    const json = await responce.json();
    return json;
}
const JSON_FILE = await getVersionJson(verision.url)

const libraries = JSON_FILE.libraries.filter((lib) => {
    return isAllowed(lib.rules) && lib.downloads?.artifact;
});

//--------- Client.jar
async function getClientJar(VersionJsonDownloadsClient){
    console.log(`Downloading: ./client-${verision.id}.jar`)
    const responce =await fetch(VersionJsonDownloadsClient)
    const jarFile = await responce.arrayBuffer();
    await writeFile(`./client-${verision.id}.jar`, Buffer.from(jarFile) )
    return jarFile
}
await getClientJar(JSON_FILE.downloads.client.url)

//--------- Libraries

console.log("-----------------------------------------------")
async function getArtifactUrl(library){
        const liburl = library.downloads.artifact.url;
    const path = library.downloads.artifact.path;
  console.log(`Downloading: ${path}`)
    const responce = await fetch(liburl)
    const jarFile = await responce.arrayBuffer();
    await mkdir("./libraries/" + path.substring(0,path.lastIndexOf('/')),{recursive:true}) 
    await writeFile(`./libraries/${path}`, Buffer.from(jarFile))

}
// تحميل

 for (const library of libraries) {
    await getArtifactUrl(library);
 }

//--------- Assets
const ASSETURL = JSON_FILE.assetIndex.url


async function getAssets(asseturl){
    console.log(`Downloading: ${asseturl}`)

    const responce = await fetch(asseturl)
    const assetjson = await responce.json();
    return assetjson
}
console.log("-----------------------------------------------")
console.log("Asseturl")
const assetjson = await getAssets(ASSETURL)
await mkdir('./assets/indexes',{recursive:true})
await writeFile(`./assets/indexes/${JSON_FILE.assetIndex.id}.json`, JSON.stringify(assetjson))


console.log("-----------------------------------------------")
console.log("Hashes")
//  *
async function getHashes(hash,path){
    console.log(`Downloading: ${path}`)

    const responce = await fetch(`https://resources.download.minecraft.net/${hash.substring(0,2)}/${hash}`)
const data = await responce.arrayBuffer();

await mkdir(`./assets/objects/${hash.substring(0,2)}`,{recursive:true})
await writeFile(`./assets/objects/${hash.substring(0,2)}/${hash}` ,Buffer.from(data));
return data
}

// Downloading  / تحميل
 for (const [path, asset] of Object.entries(assetjson.objects)) {

     await getHashes(asset.hash, path);

 }

//i'll make it concurrency limit on this

// await Promise.all(
//     Object.entries(assetjson.objects).map(([path,assets])=>getHashes(assets.hash,path))
// )

//--------- Natives
const filteredNativeByPlatform = libraries.filter((lib) => lib.name.includes("natives"));
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
const jarPath = native.downloads.artifact.path;
const zip = new AdmZip(`./libraries/${jarPath}`);


const entries = zip.getEntries();
const filesWithoutFolders = entries.filter((entry)=>{return !entry.isDirectory })

const nativeFiles = filesWithoutFolders.filter((entry)=>{
    return entry.entryName.endsWith(nativeExtension)
})
// تحميل / فك ضغط

for (const entry of nativeFiles) {
    const fileName = path.basename(entry.entryName);
    await mkdir("./natives", { recursive: true });
    await writeFile(`./natives/${fileName}`, entry.getData());
    console.log(`Extracting: ${fileName}`);
}
}

//--------- Classpath
const libPaths = libraries.map((lib)=>{return `./libraries/${lib.downloads.artifact.path}`})
const classpath = [
    `./client-${verision.id}.jar`,
    ...libPaths
];
const classpathValue = classpath.join(path.delimiter)
console.log("-----------------------------------------------");

//--------- JvmArguments
const jvmArguments=[]

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
// Game arguments
const gameArguments =[]

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

    "${classpath}": classpathValue,
    "${natives_directory}": "./natives",
    "${launcher_name}": "OmarsCustomLauncher",
    "${launcher_version}": "1.0",

    "${auth_player_name}": USERNAME,
    "${auth_uuid}": offlineUUID,
    "${auth_access_token}": "0",
    "${clientid}": "0",
    "${assets_root}": "./assets",
    "${auth_xuid}": "",
    "${user_type}": "legacy",
    "${version_name}": verision.id,
    "${version_type}": JSON_FILE.type,

    "${game_directory}": process.cwd(),

    "${assets_index_name}": JSON_FILE.assetIndex.id
};

function applyReplacements(argument) {
    return argument.replace(/\$\{(\w+)\}/g, (placeholder) => {
        return placeholder in replacements ? replacements[placeholder] : placeholder;
    });
}


jvmArguments.push(`-Xmx${MAX_MEMORY}`);
const finalJvmArguments = jvmArguments.map(applyReplacements);
const finalGameArguments = gameArguments.map(applyReplacements);
const javaArguments = [
    ...finalJvmArguments,
    JSON_FILE.mainClass,
    ...finalGameArguments
];

console.log("JVM:", finalJvmArguments);
console.log("GAME:", finalGameArguments);
console.log("--------------------------------------------")
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