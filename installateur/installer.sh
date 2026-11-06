#!/bin/sh
# Installe (ou réinstalle) Tok&Track sur Mac ou Linux. À coller dans un Terminal :
#   curl -fsSL https://raw.githubusercontent.com/RoadsPlanner/TokenTrack/main/installateur/installer.sh | sh
# Mac   : ~/Applications/Tok&Track.app
# Linux : ~/.local/share/tok-track/TokTrack + raccourci dans le menu des applications
# Ensuite, l'appli se met à jour toute seule.
set -e

DEPOT="RoadsPlanner/TokenTrack"
# TOKTRACK_BASE : adresse de remplacement, pour tester avec des fichiers locaux.
BASE="${TOKTRACK_BASE:-https://github.com/$DEPOT/releases/latest/download}"

case "$(uname -s)" in
  Darwin) SYSTEME=mac ;;
  Linux) SYSTEME=linux ;;
  *) echo "Tok&Track ne fonctionne que sur Mac, Linux et Windows."; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) ARCH=x64 ;;
  arm64 | aarch64) ARCH=arm64 ;;
  *) echo "Processeur non pris en charge : $(uname -m)"; exit 1 ;;
esac
FICHIER="TokTrack-$SYSTEME-$ARCH"

telecharger() {
  echo "Téléchargement de Tok&Track ($SYSTEME, $ARCH)..."
  curl -fL --progress-bar "$BASE/$FICHIER" -o "$1.nouveau"
  chmod 755 "$1.nouveau"
  mv -f "$1.nouveau" "$1"
}

if [ "$SYSTEME" = mac ]; then
  APP="$HOME/Applications/Tok&Track.app"
  mkdir -p "$APP/Contents/MacOS"
  telecharger "$APP/Contents/MacOS/TokTrack"
  cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Tok&amp;Track</string>
  <key>CFBundleDisplayName</key><string>Tok&amp;Track</string>
  <key>CFBundleIdentifier</key><string>io.github.roadsplanner.toktrack</string>
  <key>CFBundleExecutable</key><string>TokTrack</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
  echo ""
  echo "Tok&Track est installé dans « Applications » (dossier personnel)."
  echo "Ouverture..."
  open "$APP"
else
  DOSSIER="${XDG_DATA_HOME:-$HOME/.local/share}/tok-track"
  mkdir -p "$DOSSIER"
  telecharger "$DOSSIER/TokTrack"
  RACCOURCIS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$RACCOURCIS"
  cat > "$RACCOURCIS/tok-track.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Tok&Track
Comment=Tableau de bord des tokens IA
Exec="$DOSSIER/TokTrack"
Icon=utilities-system-monitor
Terminal=false
Categories=Utility;
DESKTOP
  echo ""
  echo "Tok&Track est installé : cherche « Tok&Track » dans le menu des applications."
  echo "Ouverture..."
  nohup "$DOSSIER/TokTrack" >/dev/null 2>&1 &
fi
