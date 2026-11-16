#!/usr/bin/env bash
cd "$(dirname "$0")"

# each system has its own install command and package names
if command -v pacman >/dev/null; then
  install="sudo pacman -S --needed --noconfirm"
  node="nodejs npm"
  java8="jdk8-openjdk"
  java17="jdk17-openjdk"
  java21="jdk21-openjdk"
  java25="jdk-openjdk"
  update="sudo pacman -Syu"

elif command -v apt-get >/dev/null; then
  install="sudo apt-get install -y"
  node="nodejs npm"
  java8="openjdk-8-jre"
  java17="openjdk-17-jre"
  java21="openjdk-21-jre"
  java25="openjdk-25-jre"
  update="sudo apt update && sudo apt upgrade"

elif command -v dnf >/dev/null; then
  install="sudo dnf install -y"
  node="nodejs npm"
  java8="java-1.8.0-openjdk"
  java17="java-17-openjdk"
  java21="java-21-openjdk"
  java25="java-latest-openjdk"
  update="sudo dnf upgrade"

else
  echo "This script supports pacman, apt and dnf only. Install Node.js and Java yourself, then run ./run.sh"
  exit 1
fi

# keeps asking the question ($1) until the user types y or n, the answer ends up in $answer
ask() {
  answer=""
  while [ "$answer" != "y" ] && [ "$answer" != "n" ]; do
    read -p "$1 [y/n] " answer
    answer=${answer,,} # makes Y and N small, so they count too
  done
}

# asks the question ($1), runs the command ($2) only when the answer is n
ask_install() {
  ask "$1"
  if [ "$answer" = "n" ]; then
    $2
  fi
}

echo "The launcher only finds java in /usr/lib/jvm"
echo "This is the default folder: if you installed java with your package manager, it is already there."
echo

ask_install "Have you already installed nodejs" "$install $node"
ask_install "Have you already installed java 8 (minecraft 1.16.5 and older) in the default folder" "$install $java8"
ask_install "Have you already installed java 17 (minecraft 1.17 to 1.20.4) in the default folder" "$install $java17"
ask_install "Have you already installed java 21 (minecraft 1.20.5 to 1.21) in the default folder" "$install $java21"
ask_install "Have you already installed java 25 (minecraft 26.x) in the default folder" "$install $java25"

# if node is broken tell the user how to fix it and stop
node -v >/dev/null || { echo "Node.js is missing or cannot start. Run: $update  then run ./install.sh again."; exit 1; }

ask "Interested in adding desktop shortcut with icon"
if [ "$answer" = "y" ]; then
  mkdir -p ~/.local/share/applications
  shortcut=~/.local/share/applications/simple-minecraft-launcher.desktop
  echo "[Desktop Entry]" > "$shortcut"
  echo "Type=Application" >> "$shortcut"
  echo "Name=Simple Minecraft Launcher (SL)" >> "$shortcut"
  echo "Keywords=SL;Minecraft;" >> "$shortcut"
  echo "Exec=\"$PWD/run.sh\"" >> "$shortcut"
  echo "Icon=$PWD/assets/icon.png" >> "$shortcut"
  echo "Terminal=true" >> "$shortcut"
  echo "Categories=Game;" >> "$shortcut"
  # also put it on the desktop if there is one
  if [ -d ~/Desktop ]; then
    cp "$shortcut" ~/Desktop/
    chmod +x ~/Desktop/simple-minecraft-launcher.desktop
  fi
fi

./run.sh
