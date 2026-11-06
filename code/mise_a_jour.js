/*
 * Mise à jour automatique de l'appli installée.
 *
 * Au lancement, demande à GitHub la dernière version publiée (onglet « Releases »
 * du dépôt). Si elle est plus récente :
 *   - Windows : télécharge Installer-TokTrack.exe, le lance en mode silencieux et quitte ;
 *     l'installateur remplace l'appli puis la relance.
 *   - Mac et Linux : télécharge le nouveau programme, remplace l'actuel et le relance.
 * Sans internet ou en cas de souci, l'appli se lance normalement.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEPOT = 'RoadsPlanner/TokenTrack';
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
// Fichier de la release propre à ce système (même nom que ceux créés par installateur/construire.js).
const FICHIER = WIN ? 'Installer-TokTrack.exe' : `TokTrack-${MAC ? 'mac' : 'linux'}-${process.arch}`;
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

async function telecharger(url, destination) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.writeFileSync(destination, Buffer.from(await r.arrayBuffer()));
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
    if (WIN) {
      const installeur = path.join(os.tmpdir(), `Installer-TokTrack-${version}.exe`);
      await telecharger(fichier.browser_download_url, installeur);
      console.log('Installation... Tok&Track va se rouvrir tout seul dans quelques secondes.');
      spawn(installeur, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/MAJ=1'],
        { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else {
      // Le programme en cours peut être remplacé : il continue de tourner sur l'ancienne copie.
      const nouveau = process.execPath + '.nouveau';
      await telecharger(fichier.browser_download_url, nouveau);
      fs.chmodSync(nouveau, 0o755);
      fs.renameSync(nouveau, process.execPath);
      console.log('Mise à jour installée, réouverture de Tok&Track...');
      spawn(process.execPath, [], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch (e) {
    console.error(`Mise à jour impossible (${e.message}). Lancement de la version actuelle.`);
    return false;
  }
}

module.exports = { miseAJour, plusRecente };
