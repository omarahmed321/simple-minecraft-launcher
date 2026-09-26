#!/usr/bin/env bash
# One-line installer for Linux:
# curl -fsSL https://raw.githubusercontent.com/omarahmed321/simple-minecraft-launcher/main/setup.sh | bash
set -e

DIR="$HOME/simple-minecraft-launcher"
ARCHIVE="https://github.com/omarahmed321/simple-minecraft-launcher/archive/refs/heads/main.tar.gz"

echo "Downloading the launcher to $DIR ..."
mkdir -p "$DIR"
curl -fsSL "$ARCHIVE" | tar xz --strip-components=1 -C "$DIR"

cd "$DIR"
chmod +x install.sh run.sh
# Read answers from the keyboard, not from the curl pipe
bash install.sh < /dev/tty
