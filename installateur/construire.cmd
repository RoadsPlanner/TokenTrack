@echo off
rem Double-cliquer pour (re)créer Installer-TokTrack.exe dans ce dossier.
chcp 65001 >nul
cd /d "%~dp0"
node construire.js
pause
