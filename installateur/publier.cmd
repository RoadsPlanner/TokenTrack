@echo off
rem Double-cliquer pour publier une mise à jour : passe à la version suivante,
rem crée l'installateur et le met en ligne sur GitHub. Tous les PC qui ont
rem Tok&Track installé se mettront à jour à leur prochain lancement.
chcp 65001 >nul
cd /d "%~dp0"
node construire.js --publier
pause
