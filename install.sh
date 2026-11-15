#!/usr/bin/env bash
cd "$(dirname "$0")"

if command -v pacman >/dev/null; then
  sudo pacman -S --needed --noconfirm nodejs npm
  sudo pacman -S --needed --noconfirm jdk8-openjdk
  sudo pacman -S --needed --noconfirm jdk17-openjdk
  sudo pacman -S --needed --noconfirm jdk21-openjdk
  sudo pacman -S --needed --noconfirm jdk-openjdk
  # if node is broken, tell the user how to fix it and stop
  node -v >/dev/null || { echo "Node.js cannot start. Run: sudo pacman -Syu  then run ./install.sh again."; exit 1; }

elif command -v apt-get >/dev/null; then
  sudo apt-get install -y nodejs npm
  sudo apt-get install -y openjdk-8-jre
  sudo apt-get install -y openjdk-17-jre
  sudo apt-get install -y openjdk-21-jre
  sudo apt-get install -y openjdk-25-jre
  node -v >/dev/null || { echo "Node.js cannot start. Run: sudo apt update && sudo apt upgrade  then run ./install.sh again."; exit 1; }

elif command -v dnf >/dev/null; then
  sudo dnf install -y nodejs npm
  sudo dnf install -y java-1.8.0-openjdk
  sudo dnf install -y java-17-openjdk
  sudo dnf install -y java-21-openjdk
  sudo dnf install -y java-latest-openjdk
  node -v >/dev/null || { echo "Node.js cannot start. Run: sudo dnf upgrade  then run ./install.sh again."; exit 1; }
fi

./run.sh
