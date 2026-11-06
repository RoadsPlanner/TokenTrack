/*
 * Mise à jour automatique de la version installée (TokTrack.exe).
 *
 * Au lancement, demande à GitHub la dernière version publiée (onglet « Releases »
 * du dépôt). Si elle est plus récente, télécharge son Installer-TokTrack.exe,
 * le lance en mode silencieux et quitte : l'installateur remplace l'appli puis la relance.
 * Sans internet ou en cas de souci, l'appli se lance normalement.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEPOT = 'RoadsPlanner/Tok-Track';
const FICHIER = 'Installer-TokTrack.exe';
// TOKTRACK_MAJ_URL : adresse de remplacement, pour tester la mise à jour en local.
const API = process.env.TOKTRACK_MAJ_URL || `https://api.github.com/repos/${DEPOT}/releases/latest`;

// "1.2.10" > "1.2.9"
function plusRecente(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function lireJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'TokTrack', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Renvoie true si une mise à jour a été lancée (l'appli doit alors quitter).
async function miseAJour(versionActuelle) {
  let derniere;
  try { derniere = await lireJson(API); } catch { return false; } // hors ligne : on continue
  const version = String(derniere.tag_name || '').replace(/^v/, '');
  const fichier = (derniere.assets || []).find(a => a.name === FICHIER);
  if (!version || !fichier || !plusRecente(version, versionActuelle)) return false;

  console.log(`\nMise à jour de Tok&Track : ${versionActuelle} → ${version}. Téléchargement...`);
  try {
    const r = await fetch(fichier.browser_download_url, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const installeur = path.join(os.tmpdir(), `Installer-TokTrack-${version}.exe`);
    fs.writeFileSync(installeur, Buffer.from(await r.arrayBuffer()));
    console.log('Installation... Tok&Track va se rouvrir tout seul dans quelques secondes.');
    const { spawn } = require('child_process');
    spawn(installeur, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/MAJ=1'],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  } catch (e) {
    console.error(`Mise à jour impossible (${e.message}). Lancement de la version actuelle.`);
    return false;
  }
}

module.exports = { miseAJour, plusRecente };
