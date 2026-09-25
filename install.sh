#!/usr/bin/env bash
cd "$(dirname "$0")"
if command -v apt-get >/dev/null; then sudo apt-get install -y nodejs npm openjdk-25-jdk
elif command -v pacman >/dev/null; then sudo pacman -S --needed --noconfirm nodejs npm jdk-openjdk
elif command -v dnf >/dev/null; then sudo dnf install -y nodejs npm java-latest-openjdk; fi
npm install
node minecraft-verision-installer.js
