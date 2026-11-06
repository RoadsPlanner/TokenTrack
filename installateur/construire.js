#!/usr/bin/env node
/*
 * Fabrique Tok&Track : Node.js + le code dans un seul programme
 * (Node « single executable application »), rien à installer pour le lancer.
 *
 *   node installateur/construire.js
 *       Windows : installateur/Installer-TokTrack.exe (compilé avec Inno Setup).
 *
 *   node installateur/construire.js --publier          (= publier.cmd)
 *       Passe à la version suivante, crée l'installateur Windows, pousse sur GitHub
 *       et publie la version dans les Releases. GitHub fabrique ensuite tout seul
 *       les versions Mac et Linux (.github/workflows/mac-linux.yml).
 *
 *   node installateur/construire.js --cibles linux-x64,darwin-arm64 [--version 1.2.3]
 *       Programmes Mac / Linux : installateur/TokTrack-<mac|linux>-<x64|arm64>.
 *       Utilisé par GitHub (sur un Mac, pour pouvoir signer les versions Mac).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ICI = __dirname;
const RACINE = path.join(ICI, '..');
const CODE = path.join(RACINE, 'code');
const TEMP = path.join(ICI, 'temp');
const MODULES = ['ia_detectees', 'lecteurs_cli', 'lecteurs_ide', 'mise_a_jour', 'suivi_tokens'];
const FICHIER_VERSION = path.join(CODE, 'version.json');
const DEPOT = 'RoadsPlanner/TokenTrack';
const FUSIBLE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const arg = nom => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : null; };
const PUBLIER = process.argv.includes('--publier');
const CIBLES = arg('--cibles') ? arg('--cibles').split(',') : null;
const q = s => `"${s}"`; // chemins entre guillemets : ils peuvent contenir « & » et des espaces
const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8' }).trim();
const arreter = message => { console.error(`\n${message}`); process.exit(1); };

// ------------------------------------------------------------- version

let version = arg('--version') || JSON.parse(fs.readFileSync(FICHIER_VERSION, 'utf8')).version;
if (PUBLIER) {
  try { execSync('gh auth status', { stdio: 'ignore' }); } catch {
    arreter('GitHub CLI n\'est pas connecté. Lance une fois « gh auth login » puis recommence.');
  }
  // Tout doit être commité : la version publiée doit correspondre au code de GitHub.
  if (git('status', '--porcelain')) arreter('Des modifications ne sont pas commitées. Commite-les d\'abord, puis relance.');
  const v = version.split('.').map(Number);
  version = `${v[0]}.${v[1]}.${v[2] + 1}`;
  fs.writeFileSync(FICHIER_VERSION, JSON.stringify({ version }) + '\n');
}
console.log(`Tok&Track version ${version}\n`);

fs.rmSync(TEMP, { recursive: true, force: true });
fs.mkdirSync(TEMP, { recursive: true });

// ------------------------------------------- code regroupé + ressources

// Un seul fichier JS : un programme Node autonome ne charge que les modules intégrés,
// donc les require('./...') du projet sont regroupés ici.
console.log('Regroupement du code...');
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
fs.writeFileSync(path.join(TEMP, 'version.json'), JSON.stringify({ version }));

// Le « blob » (code + ressources) est le même pour tous les systèmes
// (sans cache de code ni snapshot, il peut être injecté dans le Node d'un autre système).
const configSea = path.join(TEMP, 'sea-config.json');
const blob = path.join(TEMP, 'sea.blob');
fs.writeFileSync(configSea, JSON.stringify({
  main: path.join(TEMP, 'paquet.js'),
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets: {
    'config.json': path.join(CODE, 'config.json'),
    'modele_tableau_de_bord.html': path.join(CODE, 'modele_tableau_de_bord.html'),
    'version.json': path.join(TEMP, 'version.json'),
  },
}));
execFileSync(process.execPath, ['--experimental-sea-config', configSea], { stdio: 'inherit' });

const injecter = (binaire, mac) => execSync(
  `npx --yes postject@1.0.0-alpha.6 ${q(binaire)} NODE_SEA_BLOB ${q(blob)} --sentinel-fuse ${FUSIBLE}${mac ? ' --macho-segment-name NODE_SEA' : ''}`,
  { stdio: 'inherit' });

// ------------------------------------------------------ Mac et Linux

if (CIBLES) {
  for (const cible of CIBLES) {
    const [systeme, arch] = cible.split('-'); // linux-x64, darwin-arm64…
    const mac = systeme === 'darwin';
    const nom = `TokTrack-${mac ? 'mac' : 'linux'}-${arch}`;
    console.log(`\n${nom} : téléchargement de Node.js ${process.version} pour ${cible}...`);
    const dossierNode = `node-${process.version}-${cible}`;
    const archive = path.join(TEMP, `${dossierNode}.tar.gz`);
    execFileSync('curl', ['-fsSL', '-o', archive, `https://nodejs.org/dist/${process.version}/${dossierNode}.tar.gz`], { stdio: 'inherit' });
    // (chemins relatifs : certains tar sous Windows lisent « C: » comme une adresse réseau)
    execFileSync('tar', ['-xzf', path.basename(archive), `${dossierNode}/bin/node`], { cwd: TEMP, stdio: 'inherit' });
    const binaire = path.join(ICI, nom);
    fs.copyFileSync(path.join(TEMP, dossierNode, 'bin', 'node'), binaire);
    fs.chmodSync(binaire, 0o755);
    // Mac : la signature de Node doit être retirée avant l'injection, puis refaite
    // (signature « ad hoc », obligatoire pour lancer un programme sur les Mac Apple Silicon).
    if (mac) {
      if (process.platform !== 'darwin') arreter('Les versions Mac doivent être fabriquées sur un Mac (c\'est fait automatiquement par GitHub).');
      execFileSync('codesign', ['--remove-signature', binaire], { stdio: 'inherit' });
    }
    injecter(binaire, mac);
    if (mac) execFileSync('codesign', ['--sign', '-', binaire], { stdio: 'inherit' });
    console.log(`Prêt : ${binaire}`);
  }
  fs.rmSync(TEMP, { recursive: true, force: true });
  process.exit(0);
}

// ----------------------------------------------------------- Windows

const EXE = path.join(TEMP, 'TokTrack.exe');
console.log('Création de TokTrack.exe...');
fs.copyFileSync(process.execPath, EXE);
injecter(EXE, false);

// Exe « fenêtré » (sous-système Windows GUI) : pas de fenêtre noire de console au lancement.
const octets = fs.readFileSync(EXE);
const entetePE = octets.readUInt32LE(0x3c);
octets.writeUInt16LE(2, entetePE + 24 + 68); // champ Subsystem : 3 = console, 2 = GUI
fs.writeFileSync(EXE, octets);

console.log('Création de l\'installateur...');
const iscc = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
].find(f => fs.existsSync(f));
if (!iscc) {
  if (PUBLIER) git('checkout', '--', FICHIER_VERSION);
  arreter('Inno Setup 6 est introuvable. Installe-le (winget install JRSoftware.InnoSetup) puis relance.');
}
execFileSync(iscc, ['/Q', `/DVersion=${version}`, path.join(ICI, 'TokTrack.iss')], { stdio: 'inherit' });

fs.rmSync(TEMP, { recursive: true, force: true });
const installeur = path.join(ICI, 'Installer-TokTrack.exe');
console.log(`\nInstallateur prêt : ${installeur}`);

// Publication : commit de la version, push, puis release GitHub. Les PC qui ont
// Tok&Track installé passeront à cette version à leur prochain lancement.
if (PUBLIER) {
  console.log(`\nPublication de la version ${version} sur GitHub...`);
  git('add', FICHIER_VERSION);
  git('commit', '-m', `Version ${version}`);
  execFileSync('git', ['push'], { cwd: RACINE, stdio: 'inherit' });
  execSync(`gh release create v${version} ${q(installeur)} --repo ${DEPOT} --target ${git('rev-parse', 'HEAD')} --title "Tok&Track ${version}" --notes "Mise à jour automatique."`,
    { stdio: 'inherit' });
  console.log(`\nVersion ${version} publiée. Les versions Mac et Linux seront ajoutées par GitHub dans quelques minutes.`);
}
