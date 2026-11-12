'use strict';
/*
 * Détecte les IA présentes sur ce PC : applications, outils en ligne de commande,
 * extensions d'IDE (VS Code, Cursor, Windsurf, Antigravity…) et plugins JetBrains.
 *
 * Pour chaque IA, le catalogue indique si ses tokens peuvent être suivis :
 *   reel        compteurs de tokens enregistrés sur le PC, lus par le script
 *   estimation  tokens estimés à partir du texte des conversations
 *   quota       seulement un pourcentage d'abonnement
 *   aucun       présente, mais aucun compteur de tokens n'est enregistré sur le PC
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAISON = os.homedir();
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const SYSTEME = WIN ? 'Windows' : MAC ? 'macOS' : 'Linux';
// Dossiers de données des applications : ROAMING = réglages (VS Code, Claude…), LOCAL = données.
const SUPPORT_MAC = path.join(MAISON, 'Library', 'Application Support');
const ROAMING = WIN ? (process.env.APPDATA || path.join(MAISON, 'AppData', 'Roaming'))
  : MAC ? SUPPORT_MAC : (process.env.XDG_CONFIG_HOME || path.join(MAISON, '.config'));
const LOCAL = WIN ? (process.env.LOCALAPPDATA || path.join(MAISON, 'AppData', 'Local'))
  : MAC ? SUPPORT_MAC : (process.env.XDG_DATA_HOME || path.join(MAISON, '.local', 'share'));
const PROGRAMMES = WIN ? [path.join(LOCAL, 'Programs'), process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)']
  : MAC ? ['/Applications', path.join(MAISON, 'Applications')]
  : ['/opt', '/usr/share', path.join(MAISON, '.local', 'share')];

// Les outils en ligne de commande peuvent aussi être installés dans WSL (Linux sous Windows).
// Leurs dossiers personnels sont lus par \\wsl.localhost\<distribution>\home\<nom>.
// « options.wsl = false » (config.json : "wsl": false) désactive cette recherche.
const options = { wsl: true };
let maisonsWslTrouvees = null;
function maisonsWsl() {
  if (maisonsWslTrouvees) return maisonsWslTrouvees;
  maisonsWslTrouvees = [];
  if (process.platform !== 'win32' || !options.wsl) return maisonsWslTrouvees;
  // Seulement les distributions déjà démarrées : lire \\wsl.localhost réveillerait WSL,
  // ce qui peut prendre plus d'une minute. Ce qui a été compté avant reste dans l'historique.
  let sortie = '';
  try {
    sortie = require('child_process').execFileSync('wsl.exe', ['--list', '--running', '--quiet'],
      { timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf16le');
  } catch { return maisonsWslTrouvees; }
  for (const ligne of sortie.split(/\r?\n/)) {
    const distribution = ligne.replace(/\0/g, '').trim();
    if (!distribution) continue;
    if (/^docker-desktop/i.test(distribution)) continue;
    const racine = `\\\\wsl.localhost\\${distribution}`;
    const home = path.join(racine, 'home');
    for (const nom of lister(home)) maisonsWslTrouvees.push(path.join(home, nom));
    if (existe(path.join(racine, 'root', '.gemini')) || existe(path.join(racine, 'root', '.codex'))) maisonsWslTrouvees.push(path.join(racine, 'root'));
  }
  return maisonsWslTrouvees;
}
// Dossier personnel Windows puis ceux de WSL.
const maisons = () => [MAISON, ...maisonsWsl()];

// IDE de la famille VS Code : dossier des extensions et dossier des données utilisateur.
const IDE_VSCODE = [
  { nom: 'VS Code', extensions: path.join(MAISON, '.vscode', 'extensions'), donnees: path.join(ROAMING, 'Code') },
  { nom: 'VS Code Insiders', extensions: path.join(MAISON, '.vscode-insiders', 'extensions'), donnees: path.join(ROAMING, 'Code - Insiders') },
  { nom: 'Cursor', extensions: path.join(MAISON, '.cursor', 'extensions'), donnees: path.join(ROAMING, 'Cursor') },
  { nom: 'Windsurf', extensions: path.join(MAISON, '.windsurf', 'extensions'), donnees: path.join(ROAMING, 'Windsurf') },
  { nom: 'Antigravity', extensions: path.join(MAISON, '.antigravity', 'extensions'), donnees: path.join(ROAMING, 'Antigravity') },
  { nom: 'Antigravity IDE', extensions: path.join(MAISON, '.antigravity-ide', 'extensions'), donnees: path.join(ROAMING, 'Antigravity IDE') },
  { nom: 'VSCodium', extensions: path.join(MAISON, '.vscode-oss', 'extensions'), donnees: path.join(ROAMING, 'VSCodium') },
];

// Extensions d'IA connues (préfixe de l'identifiant d'extension, en minuscules).
// « globalStorage » : dossier de données de l'extension, preuve qu'elle a servi.
const EXTENSIONS_IA = [
  { id: 'copilot', nom: 'GitHub Copilot', prefixes: ['github.copilot'], globalStorage: ['github.copilot-chat', 'github.copilot'], suivi: 'reel', outil: 'GitHub Copilot', source: 'sessions de chat (VS Code)' },
  { id: 'cline', nom: 'Cline', prefixes: ['saoudrizwan.claude-dev'], globalStorage: ['saoudrizwan.claude-dev'], suivi: 'reel', outil: 'Cline', source: 'tâches enregistrées par l’extension' },
  { id: 'roo', nom: 'Roo Code', prefixes: ['rooveterinaryinc.roo-cline'], globalStorage: ['rooveterinaryinc.roo-cline'], suivi: 'reel', outil: 'Roo Code', source: 'tâches enregistrées par l’extension' },
  { id: 'kilo', nom: 'Kilo Code', prefixes: ['kilocode.kilo-code'], globalStorage: ['kilocode.kilo-code'], suivi: 'reel', outil: 'Kilo Code', source: 'tâches enregistrées par l’extension' },
  { id: 'claude-ext', nom: 'Claude Code (extension)', prefixes: ['anthropic.claude-code'], globalStorage: [], suivi: 'reel', outil: 'Claude Code', source: 'sessions Claude Code' },
  { id: 'gemini-assist', nom: 'Gemini Code Assist', prefixes: ['google.geminicodeassist', 'google.cloudcode'], globalStorage: ['google.geminicodeassist'], suivi: 'aucun' },
  { id: 'continue', nom: 'Continue', prefixes: ['continue.continue'], globalStorage: ['continue.continue'], suivi: 'aucun' },
  { id: 'codeium', nom: 'Codeium / Windsurf Plugin', prefixes: ['codeium.'], globalStorage: ['codeium.codeium'], suivi: 'aucun' },
  { id: 'tabnine', nom: 'Tabnine', prefixes: ['tabnine.'], globalStorage: ['tabnine.tabnine-vscode'], suivi: 'aucun' },
  { id: 'amazonq', nom: 'Amazon Q', prefixes: ['amazonwebservices.amazon-q', 'amazonwebservices.aws-toolkit'], globalStorage: [], suivi: 'aucun' },
  { id: 'codex-ext', nom: 'OpenAI Codex (extension)', prefixes: ['openai.chatgpt', 'openai.codex'], globalStorage: [], suivi: 'reel', outil: 'OpenAI Codex', source: 'sessions dans ~/.codex/sessions (partagées avec Codex CLI)' },
  { id: 'cody', nom: 'Sourcegraph Cody', prefixes: ['sourcegraph.cody'], globalStorage: [], suivi: 'aucun' },
  { id: 'supermaven', nom: 'Supermaven', prefixes: ['supermaven.'], globalStorage: [], suivi: 'aucun' },
  { id: 'qodo', nom: 'Qodo', prefixes: ['codium.codium', 'qodo.'], globalStorage: [], suivi: 'aucun' },
  { id: 'augment', nom: 'Augment', prefixes: ['augment.'], globalStorage: [], suivi: 'aucun' },
  { id: 'blackbox', nom: 'Blackbox AI', prefixes: ['blackboxapp.'], globalStorage: [], suivi: 'aucun' },
];

// Plugins JetBrains connus (nom du dossier de plugin).
const PLUGINS_JETBRAINS = [
  { id: 'copilot-jb', nom: 'GitHub Copilot', dossiers: ['github-copilot-intellij'], suivi: 'aucun' },
  { id: 'jb-ai', nom: 'JetBrains AI Assistant', dossiers: ['ml-llm'], suivi: 'aucun' },
  { id: 'junie', nom: 'Junie (JetBrains)', dossiers: ['junie', 'intellij-ml-llm-junie'], suivi: 'aucun' },
  { id: 'gemini-jb', nom: 'Gemini Code Assist', dossiers: ['GeminiCodeAssist', 'cloudcode'], suivi: 'aucun' },
  { id: 'claude-jb', nom: 'Claude Code (plugin)', dossiers: ['claude-code-jetbrains-plugin', 'claude-code'], suivi: 'reel', outil: 'Claude Code' },
  { id: 'continue-jb', nom: 'Continue', dossiers: ['continue', 'continue-intellij-extension'], suivi: 'aucun' },
  { id: 'tabnine-jb', nom: 'Tabnine', dossiers: ['TabNine', 'tabnine-intellij'], suivi: 'aucun' },
  { id: 'codeium-jb', nom: 'Windsurf / Codeium', dossiers: ['codeium', 'windsurf'], suivi: 'aucun' },
  { id: 'amazonq-jb', nom: 'Amazon Q', dossiers: ['amazon-q', 'aws-toolkit-jetbrains'], suivi: 'aucun' },
];

// Applications et outils en ligne de commande. « traces » : chemins dont la présence révèle l'outil.
const P = (...p) => path.join(...p);
const APPLICATIONS = [
  { id: 'claude-code', nom: 'Claude Code', type: 'Ligne de commande', suivi: 'reel', outil: 'Claude Code', source: 'sessions dans ~/.claude/projects',
    traces: [P(MAISON, '.claude', 'projects'), P(MAISON, '.local', 'bin', 'claude.exe')] },
  { id: 'claude-app', nom: 'Application Claude', type: 'Application', suivi: 'quota', source: 'relevés du quota d’abonnement',
    traces: [P(LOCAL, 'Claude-Data'), P(ROAMING, 'Claude'), P(LOCAL, 'AnthropicClaude')], motifs: [[P(LOCAL, 'Packages'), /^Claude_/i]] },
  { id: 'claude-ai', nom: 'Claude (chat)', type: 'claude.ai et onglet Claude de l’appli', suivi: 'estimation', outil: 'Claude.ai', source: 'export des conversations', toujours: true },
  { id: 'antigravity', nom: 'Antigravity', type: 'IDE', suivi: 'reel', outil: 'Antigravity', source: 'conversations dans ~/.gemini/antigravity-ide',
    traces: [P(MAISON, '.gemini', 'antigravity-ide'), P(MAISON, '.gemini', 'antigravity'), ...PROGRAMMES.map(d => P(d, 'Antigravity IDE')), ...PROGRAMMES.map(d => P(d, 'antigravity'))] },
  { id: 'gemini-cli', nom: 'Gemini CLI', type: 'Ligne de commande', suivi: 'reel', outil: 'Gemini CLI', source: 'sessions dans ~/.gemini/tmp/*/chats',
    traces: [P(ROAMING, 'npm', 'gemini.cmd')], dansMaison: [['.gemini', 'tmp']] },
  { id: 'copilot-cli', nom: 'GitHub Copilot CLI', type: 'Ligne de commande', suivi: 'aucun', traces: [P(MAISON, '.copilot')] },
  { id: 'codex-cli', nom: 'OpenAI Codex CLI', type: 'Ligne de commande', suivi: 'reel', outil: 'OpenAI Codex', source: 'sessions dans ~/.codex/sessions',
    traces: [P(ROAMING, 'npm', 'codex.cmd')], dansMaison: [['.codex']] },
  { id: 'cursor', nom: 'Cursor', type: 'IDE', suivi: 'aucun', traces: [P(ROAMING, 'Cursor'), ...PROGRAMMES.map(d => P(d, 'cursor'))] },
  { id: 'windsurf', nom: 'Windsurf', type: 'IDE', suivi: 'aucun', traces: [P(ROAMING, 'Windsurf'), P(MAISON, '.codeium', 'windsurf'), ...PROGRAMMES.map(d => P(d, 'Windsurf'))] },
  { id: 'chatgpt', nom: 'ChatGPT (application)', type: 'Application', suivi: 'aucun',
    traces: [...PROGRAMMES.map(d => P(d, 'ChatGPT'))], motifs: [[P(LOCAL, 'Packages'), /^OpenAI\.ChatGPT/i]] },
  { id: 'ollama', nom: 'Ollama (modèles locaux)', type: 'Application', suivi: 'aucun', traces: [P(MAISON, '.ollama'), ...PROGRAMMES.map(d => P(d, 'Ollama'))] },
  { id: 'lmstudio', nom: 'LM Studio (modèles locaux)', type: 'Application', suivi: 'aucun', traces: [P(MAISON, '.lmstudio'), P(MAISON, '.cache', 'lm-studio'), ...PROGRAMMES.map(d => P(d, 'LM Studio'))] },
  { id: 'aider', nom: 'Aider', type: 'Ligne de commande', suivi: 'aucun', traces: [P(MAISON, '.aider'), P(MAISON, '.aider.conf.yml')] },
  { id: 'opencode', nom: 'OpenCode', type: 'Ligne de commande', suivi: 'aucun', traces: [P(MAISON, '.local', 'share', 'opencode'), P(MAISON, '.config', 'opencode')] },
  { id: 'qwen', nom: 'Qwen Code', type: 'Ligne de commande', suivi: 'aucun', traces: [P(MAISON, '.qwen')] },
];

const existe = p => { try { return fs.existsSync(p); } catch { return false; } };
const lister = d => { try { return fs.readdirSync(d); } catch { return []; } };
function derniereModif(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

// Renvoie la liste des IA trouvées. Chaque entrée : { id, nom, type, ou[], suivi, outil, source, note, activite }
function detecterIA() {
  const trouvees = new Map();
  const ajouter = (base, ou, preuve) => {
    const cle = base.id;
    const e = trouvees.get(cle) || { id: base.id, nom: base.nom, type: base.type, suivi: base.suivi, outil: base.outil || null, source: base.source || '', note: base.note || '', ou: [], activite: 0 };
    if (ou && !e.ou.includes(ou)) e.ou.push(ou);
    if (preuve) e.activite = Math.max(e.activite, derniereModif(preuve));
    trouvees.set(cle, e);
  };

  // Applications et lignes de commande
  for (const a of APPLICATIONS) {
    if (a.toujours) { ajouter(a, null); continue; }
    // Sur Mac, les applications sont des dossiers « Nom.app ».
    const preuves = (a.traces || []).flatMap(t => MAC ? [t, t + '.app'] : [t]).filter(existe);
    // Traces relatives à un dossier personnel : Windows et WSL (la distribution est indiquée dans « Où »).
    for (const maison of a.dansMaison ? maisons() : []) {
      for (const p of a.dansMaison.map(morceaux => path.join(maison, ...morceaux)).filter(existe)) {
        const wsl = maison.match(/^\\\\wsl\.localhost\\([^\\]+)/);
        ajouter(a, wsl ? `WSL ${wsl[1]}` : SYSTEME, p);
      }
    }
    for (const [dossier, motif] of a.motifs || []) for (const n of lister(dossier)) if (motif.test(n)) preuves.push(path.join(dossier, n));
    for (const p of preuves) ajouter(a, null, p);
  }

  // Extensions des IDE de la famille VS Code
  for (const ide of IDE_VSCODE) {
    const installees = lister(ide.extensions).map(n => n.toLowerCase());
    const stockage = path.join(ide.donnees, 'User', 'globalStorage');
    for (const ext of EXTENSIONS_IA) {
      const dossiers = ext.globalStorage.map(g => path.join(stockage, g)).filter(existe);
      const installee = installees.some(n => ext.prefixes.some(pf => n.startsWith(pf)));
      // Copilot est intégré aux versions récentes de VS Code : ses données suffisent comme preuve.
      if (!installee && !dossiers.length) continue;
      ajouter({ ...ext, type: 'Extension d’IDE', nom: ext.nom }, ide.nom, dossiers[0] || ide.extensions);
    }
  }

  // Plugins JetBrains (configuration utilisateur et plugins installés)
  const racinesJb = [path.join(ROAMING, 'JetBrains'), path.join(LOCAL, 'JetBrains')];
  for (const racine of racinesJb) {
    for (const produit of lister(racine)) {
      const dossierPlugins = path.join(racine, produit, 'plugins');
      const plugins = lister(dossierPlugins).map(n => n.replace(/\.(zip|jar)$/i, '').toLowerCase());
      if (!plugins.length) continue;
      const ide = produit.replace(/(\d{4}\.\d+)$/, ' $1').replace(/^IntelliJIdea/, 'IntelliJ IDEA');
      for (const pl of PLUGINS_JETBRAINS) {
        if (!pl.dossiers.some(d => plugins.includes(d.toLowerCase()))) continue;
        ajouter({ ...pl, type: 'Plugin JetBrains' }, ide, dossierPlugins);
      }
    }
  }
  return [...trouvees.values()];
}

module.exports = { detecterIA, maisons, options, IDE_VSCODE, ROAMING, LOCAL, WIN, MAC };
