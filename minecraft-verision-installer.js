
import { writeFile ,mkdir } from "node:fs/promises";
import AdmZip from "adm-zip";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

// main setttings
const VERISION ='26.3'
const USERNAME = 'Omar'
const MAX_MEMORY = '4G'

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"

// The files required to get the game working (client.jar, libraries, assets, natives)

// fetching the version data first 
async function getJsonVerisonInfo(verisionId){
    const responce = await fetch(MANIFEST_URL);
    const manifest = await  responce.json();
const verision = manifest.versions.find((verision)=>{ return verision.id === verisionId})
return verision
}
const verision = await getJsonVerisonInfo(VERISION);
console.log(verision)
// fetching the version url from the first object 
async function getVersionJson(versionUrl){
    const responce= await fetch(versionUrl);
    const json = await responce.json();
    return json;
}
const JSON_FILE = await getVersionJson(verision.url)



// 1- Client.jar
// here we can see the client jar 
console.log("-----------------------------------------------")
console.log("Client")
console.log(JSON_FILE.downloads.client);
// here we can see the server jar
console.log("-----------------------------------------------")
console.log("Server")
console.log(JSON_FILE.downloads.server);
console.log("-----------------------------------------------")
// the function that downloads the client jar
async function getClientJar(VersionJsonDownloadsClient){
    const responce =await fetch(VersionJsonDownloadsClient)
    const jarFile = await responce.arrayBuffer();
    await writeFile(`./client-${verision.id}.jar`, Buffer.from(jarFile) )
    return jarFile
}
await getClientJar(JSON_FILE.downloads.client.url)
// here we 've finsihed installing the correct client.jar that the version needed 
// ---------------------------------------------------------------------------------------------
// now let's go for the libraries

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

for (const library of JSON_FILE.libraries) {
    await getArtifactUrl(library);
}

// ---------------------------------------------------------------------------------------------
// now let's go for the assets
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

// ---------------------------------------------------------------------------------------------
// now let's go for the natives
console.log("-----------------------------------------------")
console.log("natives (windows,linux,macos)files")
const native = JSON_FILE.libraries.filter((object)=>{return object.name.includes("natives")})
console.log(native)
console.log("-----------------------------------------------")
const platform = os.platform()
const minecraftPlatform =platform == 'win32'? 'windows': platform == 'darwin'? 'osx': platform == 'linux'? 'linux': null;

const filteredNativeByPlatform = native.filter((object)=>{
return object.rules.some((rule)=>{
    return rule.os.name == minecraftPlatform && rule.action == 'allow'
})

})
console.log("Natives")
async function getNatives (filteredNativesByPlatformURL,path){
    const response = await fetch(filteredNativesByPlatformURL);
    const data = await response.arrayBuffer();
    await mkdir(`./libraries/${path.substring(0,path.lastIndexOf('/'))}`,{recursive:true})
    await writeFile(`./libraries/${path}`,Buffer.from(data))
}
// تحميل
for (const native of filteredNativeByPlatform) {
    
await getNatives(native.downloads.artifact.url,native.downloads.artifact.path)
}

// ---------------------------------------------------------------------------------------------
// now we have downloaded all the required files we need to do (extraction,manage launch arguments & class path ,launch the game )

// extraction
// make all the natives from .jar (zipped data) to .so files and more 
const nativeExtension =
      platform == 'win32' ? '.dll'
    : platform == 'darwin' ? '.dylib'
    : platform == 'linux' ? '.so'
    : null;
    
for (const native of filteredNativeByPlatform) {
const path = native.downloads.artifact.path;

const zip = new AdmZip(`./libraries/${path}`);
const entries = zip.getEntries();
const filesWithoutFolders = entries.filter((entry)=>{return !entry.isDirectory })

const nativeFiles = filesWithoutFolders.filter((entry)=>{
    return entry.entryName.endsWith(nativeExtension)
})
// تحميل
for(const entry of nativeFiles){
    const data =entry.getData();
        await mkdir(`./natives/${entry.entryName.substring(0, entry.entryName.lastIndexOf('/'))}`,{ recursive: true } );
   await writeFile(`./natives/${entry.entryName}`, data);
   console.log(`Extracting: ${entry.entryName}`)
}

}

// ---------------------------------------------------------------------------------------------
// launch Arguments


// first gathering librarypaths
const libPaths = JSON_FILE.libraries.map((lib)=>{return `./libraries/${lib.downloads.artifact.path}`})
const classpath = [
    `./client-${verision.id}.jar`,
    ...libPaths
];

const classpathValue = classpath.join(path.delimiter)
console.log("-----------------------------------------------");
const testRule = JSON_FILE.arguments.jvm[0].rules[0];


function DoesRuleMatch(rule){
    if(rule.features){return false} 
if(rule.os?.name)if(rule.os.name !== minecraftPlatform){return false}
if(rule.os?.arch)if(rule.os.arch !== process.arch){return false}
if(rule.action !== "allow") {return false}
return true;
}

const jvmArguments=[]

for(const argument of JSON_FILE.arguments.jvm){
    if(typeof argument ==="string")jvmArguments.push(argument);
    if(typeof argument === "object"){
        const allowed = argument.rules.some((rule) => {
            return DoesRuleMatch(rule);
        });

      if(allowed){
jvmArguments.push(...argument.value)
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

        const allowed = argument.rules.some((rule) => {
            return DoesRuleMatch(rule);
        });

     if (allowed) {

    if (Array.isArray(argument.value)) {
        gameArguments.push(...argument.value);
    } else {
        gameArguments.push(argument.value);
    }

}
    }
}

// fucking function makes a 128 bit hash uuid for every different user 
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

    "${version_name}": verision.id,
    "${version_type}": JSON_FILE.type,
    "${assets_root}": "./assets",
    "${game_directory}": process.cwd(),
    "${assets_root}": "./assets",
    "${assets_index_name}": JSON_FILE.assetIndex.id
};

 let index = 0;

for (const argument of jvmArguments) {

    if (argument.includes("${")) {

        const start = argument.indexOf("${");
        const end = argument.indexOf("}", start);

        const placeholder = argument.substring(start, end + 1);

          if (placeholder in replacements) {
         const newArgument =
        argument.substring(0, start) +replacements[placeholder] +argument.substring(end + 1);

    jvmArguments[index] = newArgument;
        }
    }

    index++;
}

let gameIndex = 0;
for (const argument of gameArguments) {

    if (argument.includes("${")) {

        const start = argument.indexOf("${");
        const end = argument.indexOf("}", start);

        const placeholder = argument.substring(start, end + 1);

        if (placeholder in replacements) {

            const newArgument =
                argument.substring(0, start) +
                replacements[placeholder] +
                argument.substring(end + 1);

            gameArguments[gameIndex] = newArgument;
        }
    }

    gameIndex++;
}

const optionalArguments = new Set([
    "--width",
    "--height",
    "--quickPlayPath",
    "--quickPlaySingleplayer",
    "--quickPlayMultiplayer",
    "--quickPlayRealms"
]);

for (let i = 0; i < gameArguments.length; i++) {
    if (optionalArguments.has(gameArguments[i])) {
        gameArguments.splice(i, 2);
        i--;
    }
}
jvmArguments.push(`-Xmx${MAX_MEMORY}`);
const javaArguments = [
    ...jvmArguments,
    JSON_FILE.mainClass,
    ...gameArguments
];


const minecraft = spawn("java", javaArguments);

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