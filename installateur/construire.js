#!/usr/bin/env node
/*
 * Construit installateur/Installer-TokTrack.exe en une fois :
 *   1. TokTrack.exe : Node.js + le code de Tok&Track dans un seul fichier
 *      (Node « single executable application »), rien à installer pour le lancer ;
 *   2. l'installateur, compilé avec Inno Setup à partir de TokTrack.iss.
 *
 * Utilisation : double-clic sur construire.cmd (ou node installateur/construire.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ICI = __dirname;
const CODE = path.join(ICI, '..', 'code');
const TEMP = path.join(ICI, 'temp');
const EXE = path.join(TEMP, 'TokTrack.exe');
const MODULES = ['ia_detectees', 'lecteurs_cli', 'lecteurs_ide', 'mise_a_jour', 'suivi_tokens'];
const FICHIER_VERSION = path.join(CODE, 'version.json');
const DEPOT = 'RoadsPlanner/TokenTrack';
const PUBLIER = process.argv.includes('--publier');

// Publication : passe à la version suivante (1.0.3 → 1.0.4) avant de construire.
let { version } = JSON.parse(fs.readFileSync(FICHIER_VERSION, 'utf8'));
if (PUBLIER) {
  try { execSync('gh auth status', { stdio: 'ignore' }); } catch {
    console.error('GitHub CLI n\'est pas connecté. Lance une fois « gh auth login » puis recommence.');
    process.exit(1);
  }
  const v = version.split('.').map(Number);
  version = `${v[0]}.${v[1]}.${v[2] + 1}`;
  fs.writeFileSync(FICHIER_VERSION, JSON.stringify({ version }) + '\n');
}
console.log(`Tok&Track version ${version}\n`);
const q = s => `"${s}"`; // chemins entre guillemets : le dossier contient « & » et des espaces

fs.rmSync(TEMP, { recursive: true, force: true });
fs.mkdirSync(TEMP, { recursive: true });

// 1. Un seul fichier JS : un exe Node ne charge que les modules intégrés,
//    donc les require('./...') du projet sont regroupés ici.
console.log('1/3  Regroupement du code...');
const morceaux = MODULES.map(nom => {
  const source = fs.readFileSync(path.join(CODE, nom + '.js'), 'utf8').replace(/^#!.*\r?\n/, '');
  return `'./${nom}': function (module, exports, require) {\n${source}\n}`;
});
fs.writeFileSync(path.join(TEMP, 'paquet.js'), `'use strict';
const __sources = {
${morceaux.join(',\n')}
};
const __charges = {};
function __require(nom) {
  if (!(nom in __sources)) return require(nom);
  if (!__charges[nom]) {
    const module = { exports: {} };
    __charges[nom] = module;
    __sources[nom](module, module.exports, __require);
  }
  return __charges[nom].exports;
}
__require('./suivi_tokens');
`);

// 2. TokTrack.exe = copie de node.exe + code et ressources injectés.
console.log('2/3  Création de TokTrack.exe...');
const configSea = path.join(TEMP, 'sea-config.json');
const blob = path.join(TEMP, 'sea.blob');
fs.writeFileSync(configSea, JSON.stringify({
  main: path.join(TEMP, 'paquet.js'),
  output: blob,
  disableExperimentalSEAWarning: true,
  assets: {
    'config.json': path.join(CODE, 'config.json'),
    'modele_tableau_de_bord.html': path.join(CODE, 'modele_tableau_de_bord.html'),
    'version.json': FICHIER_VERSION,
  },
}));
execFileSync(process.execPath, ['--experimental-sea-config', configSea], { stdio: 'inherit' });
fs.copyFileSync(process.execPath, EXE);
execSync(`npx --yes postject@1.0.0-alpha.6 ${q(EXE)} NODE_SEA_BLOB ${q(blob)} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { stdio: 'inherit' });

// Exe « fenêtré » (sous-système Windows GUI) : pas de fenêtre noire de console au lancement.
const octets = fs.readFileSync(EXE);
const entetePE = octets.readUInt32LE(0x3c);
octets.writeUInt16LE(2, entetePE + 24 + 68); // champ Subsystem : 3 = console, 2 = GUI
fs.writeFileSync(EXE, octets);

// 3. Installateur Inno Setup.
console.log('3/3  Création de l\'installateur...');
const iscc = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
].find(f => fs.existsSync(f));
if (!iscc) {
  console.error('\nInno Setup 6 est introuvable. Installe-le (winget install JRSoftware.InnoSetup) puis relance.');
  process.exit(1);
}
execFileSync(iscc, ['/Q', `/DVersion=${version}`, path.join(ICI, 'TokTrack.iss')], { stdio: 'inherit' });

fs.rmSync(TEMP, { recursive: true, force: true });
const installeur = path.join(ICI, 'Installer-TokTrack.exe');
console.log(`\nInstallateur prêt : ${installeur}`);

// Publication sur GitHub (onglet Releases) : les PC qui ont Tok&Track
// installé passeront à cette version à leur prochain lancement.
if (PUBLIER) {
  console.log(`\nPublication de la version ${version} sur GitHub...`);
  execSync(`gh release create v${version} ${q(installeur)} --repo ${DEPOT} --title "Tok&Track ${version}" --notes "Mise à jour automatique."`,
    { stdio: 'inherit' });
  console.log(`\nVersion ${version} publiée. Pense à commiter code/version.json.`);
}
