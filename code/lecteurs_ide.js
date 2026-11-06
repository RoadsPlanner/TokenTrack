'use strict';
/*
 * Lecteurs de tokens pour les IA utilisées dans les IDE de la famille VS Code
 * (VS Code, Cursor, Windsurf, Antigravity…).
 *
 *   GitHub Copilot          sessions de chat (workspaceStorage/*\/chatSessions) ; les requêtes
 *                           sans compteur sont estimées (outil « GitHub Copilot (estimé) »)
 *   Cline, Roo Code, Kilo   tâches de l'extension (globalStorage/<extension>/tasks)
 *
 * Chaque lecteur renvoie des réponses au même format que le reste du script.
 */

const fs = require('fs');
const path = require('path');
const { IDE_VSCODE } = require('./ia_detectees');

const lister = d => { try { return fs.readdirSync(d); } catch { return []; } };

// Dossier de travail d'un espace VS Code (workspace.json), y compris les dossiers WSL ou distants.
function dossierEspace(dossierEspace) {
  try {
    const w = JSON.parse(fs.readFileSync(path.join(dossierEspace, 'workspace.json'), 'utf8'));
    const uri = w.folder || w.workspace || '';
    return decodeURIComponent(uri.replace(/^[a-z-]+:\/\/[^/]*/i, '')).replace(/^\/([a-z]:)/i, '$1');
  } catch {
    return '';
  }
}

// --------------------------------------------------------------- GitHub Copilot
// Une session récente est un journal de modifications (.jsonl) :
//   kind 0 : état initial ; kind 1 : remplace la valeur au chemin k ; kind 2 : ajoute v au tableau en k.
// Les anciennes sessions (.json) sont l'état final directement.
function rejouer(texte) {
  let etat = null;
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) continue;
    let op;
    try { op = JSON.parse(ligne); } catch { continue; }
    if (op.kind === 0) { etat = op.v; continue; }
    if (!etat || !Array.isArray(op.k)) continue;
    let parent = etat;
    for (const cle of op.k.slice(0, -1)) {
      if (parent[cle] === undefined || parent[cle] === null) parent[cle] = {};
      parent = parent[cle];
    }
    const fin = op.k[op.k.length - 1];
    if (op.kind === 1) parent[fin] = op.v;
    else if (op.kind === 2) {
      if (!Array.isArray(parent[fin])) parent[fin] = [];
      if (typeof op.i === 'number') parent[fin].splice(op.i, Infinity, ...(op.v || []));
      else parent[fin].push(...(Array.isArray(op.v) ? op.v : [op.v]));
    }
  }
  return etat;
}

// Nombre de caractères de texte d'un objet de session (champs text, value, response, arguments,
// content), sans les identifiants, liens et réflexions chiffrées.
const IGNORES = new Set(['id', 'encrypted', 'statefulMarker', 'uris', 'baseUri', 'references', 'anchor', 'uri', 'agent', 'toolSpecificData']);
const TEXTES = new Set(['text', 'value', 'response', 'arguments', 'content']);
function caracteres(o, cle) {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'string') return TEXTES.has(cle) ? o.length : 0;
  if (Array.isArray(o)) return o.reduce((s, x) => s + caracteres(x, cle), 0);
  if (typeof o !== 'object') return 0;
  let s = 0;
  for (const k in o) if (!IGNORES.has(k)) s += caracteres(o[k], k);
  return s;
}

// Texte d'une requête Copilot : message envoyé (avec les fichiers joints), résultats des outils
// renvoyés au modèle, texte produit (réponses et arguments des appels d'outils), réflexion.
function texteRequete(req) {
  const meta = (req.result && req.result.metadata) || {};
  const tours = Array.isArray(meta.toolCallRounds) ? meta.toolCallRounds : [];
  const reponse = tours.length
    ? caracteres(tours.map(t => ({ response: t.response, toolCalls: (t.toolCalls || []).map(c => ({ arguments: c.arguments })) })))
    : caracteres((req.response || []).filter(p => !p.kind || p.kind === 'markdownContent'));
  return {
    message: meta.renderedUserMessage ? caracteres(meta.renderedUserMessage) : caracteres(req.message && req.message.text, 'text'),
    outils: caracteres(meta.toolCallResults),
    reponse,
    reflexion: tours.reduce((s, t) => s + ((t.thinking && t.thinking.tokens) || 0), 0), // déjà en tokens
    agent: tours.length > 0 || /agent/i.test(((req.modeInfo && req.modeInfo.kind) || '') + ((req.agent && req.agent.id) || '')),
  };
}

const mediane = l => { if (!l.length) return 0; const t = [...l].sort((a, b) => a - b); return t[Math.floor(t.length / 2)]; };

function lireCopilot({ nomDossier, jourLocal, sousProjet, sousProjets, caracteresParToken = 3.5 }) {
  const reponses = [];
  const stats = { sessions: 0, sansCompteur: 0, estimees: 0, surcoutAgent: 0, facteurSortie: 1 };
  const aEstimer = []; // requêtes sans compteur, estimées une fois toutes les sessions lues
  const mesures = []; // requêtes avec compteur, pour calibrer l'estimation
  for (const ide of IDE_VSCODE) {
    const user = path.join(ide.donnees, 'User');
    const espaces = lister(path.join(user, 'workspaceStorage')).map(h => path.join(user, 'workspaceStorage', h));
    const sources = [
      ...espaces.map(e => [path.join(e, 'chatSessions'), dossierEspace(e)]),
      [path.join(user, 'globalStorage', 'emptyWindowChatSessions'), ''],
    ];
    for (const [dossier, cheminTravail] of sources) {
      for (const nom of lister(dossier).filter(n => /\.jsonl?$/.test(n))) {
        let session;
        try {
          const texte = fs.readFileSync(path.join(dossier, nom), 'utf8');
          session = nom.endsWith('.jsonl') ? rejouer(texte) : JSON.parse(texte);
        } catch { continue; }
        if (!session || !Array.isArray(session.requests)) continue;
        stats.sessions++;
        const dossierP = cheminTravail ? nomDossier(cheminTravail) : '(fenêtre sans dossier)';
        let projet = null;
        let contexte = 0; // caractères des échanges précédents de la session, renvoyés au modèle
        session.requests.forEach((req, i) => {
          if (!req) return;
          const meta = (req.result && req.result.metadata) || {};
          const texte = texteRequete(req);
          const contexteAvant = contexte;
          contexte += caracteres(req.message && req.message.text, 'text') + texte.reponse;
          if (!req.timestamp) return;
          const mesuree = typeof meta.promptTokens === 'number' || typeof meta.outputTokens === 'number';
          if (projet === null) projet = sousProjet(() => JSON.stringify(session.requests.map(r => r && r.message)), dossierP, sousProjets);
          const quand = new Date(req.timestamp);
          const ligne = {
            cle: `gh:${session.sessionId || nom}:${req.requestId || i}`,
            outil: 'GitHub Copilot',
            date: jourLocal(quand.getTime()),
            heure: quand.toLocaleTimeString('fr-FR'),
            modele: String(meta.resolvedModel || req.modelId || 'copilot').replace(/^copilot\//, ''),
            projet,
            dossier: dossierP,
            conversation: session.customTitle ? `${session.customTitle} (${String(session.sessionId || nom).slice(0, 8)})` : String(session.sessionId || nom),
            entree: meta.promptTokens || 0,
            sortie: meta.outputTokens || 0,
            cache: 0,
            reflexion: 0,
          };
          const estimation = { ligne, req, texte, contexteAvant };
          if (mesuree) { reponses.push(ligne); mesures.push(estimation); }
          else { stats.sansCompteur++; aEstimer.push(estimation); }
        });
      }
    }
  }

  // Requêtes sans compteur (VS Code ne les enregistrait pas encore) : tokens estimés.
  // Le texte seul ne suffit pas : en mode agent, Copilot envoie aussi ses instructions et la
  // définition de ses outils (souvent plus de la moitié de l'entrée). Ce surcoût et le rapport
  // entre la sortie mesurée et la sortie estimée sont calibrés sur les requêtes mesurées.
  const tokens = n => n / caracteresParToken;
  const entreeTexte = e => tokens(e.contexteAvant + e.texte.message + e.texte.outils);
  const agents = mesures.filter(e => e.texte.agent && e.ligne.entree);
  stats.surcoutAgent = Math.round(Math.max(0, mediane(agents.map(e => e.ligne.entree - entreeTexte(e)))));
  const sortieMesuree = mesures.reduce((s, e) => s + e.ligne.sortie, 0);
  const sortieTexte = mesures.reduce((s, e) => s + tokens(e.texte.reponse), 0);
  stats.facteurSortie = sortieMesuree && sortieTexte ? Math.min(2, Math.max(0.2, sortieMesuree / sortieTexte)) : 1;
  const estimer = e => ({
    ...e.ligne,
    cle: e.ligne.cle.replace(/^gh:/, 'ghe:'),
    outil: 'GitHub Copilot (estimé)',
    entree: typeof e.req.promptTokens === 'number' ? e.req.promptTokens : Math.round(entreeTexte(e) + (e.texte.agent ? stats.surcoutAgent : 0)),
    sortie: typeof e.req.completionTokens === 'number' ? e.req.completionTokens : Math.round(tokens(e.texte.reponse) * stats.facteurSortie),
    reflexion: e.texte.reflexion,
  });
  for (const e of aEstimer) reponses.push(estimer(e));
  stats.estimees = new Set(aEstimer.map(e => e.ligne.cle)).size; // une session peut être enregistrée deux fois
  // Contrôle : la même méthode appliquée aux requêtes mesurées, comparée à leurs vrais compteurs.
  const sansCompteurs = e => estimer({ ...e, req: {} });
  stats.controle = {
    requetes: mesures.length,
    mesure: mesures.reduce((s, e) => s + e.ligne.entree + e.ligne.sortie, 0),
    estime: mesures.reduce((s, e) => { const r = sansCompteurs(e); return s + r.entree + r.sortie; }, 0),
  };
  return { reponses, stats };
}

// ------------------------------------------------- Cline, Roo Code, Kilo Code
// Chaque tâche a un ui_messages.json ; chaque appel à l'API y laisse un message
// « api_req_started » dont le texte contient tokensIn, tokensOut, cacheReads, cacheWrites.
const EXTENSIONS_TACHES = [
  { outil: 'Cline', id: 'saoudrizwan.claude-dev' },
  { outil: 'Roo Code', id: 'rooveterinaryinc.roo-cline' },
  { outil: 'Kilo Code', id: 'kilocode.kilo-code' },
];

function lireTachesExtensions({ nomDossier, jourLocal, sousProjet, sousProjets }) {
  const reponses = [];
  for (const ide of IDE_VSCODE) {
    for (const ext of EXTENSIONS_TACHES) {
      const dossierTaches = path.join(ide.donnees, 'User', 'globalStorage', ext.id, 'tasks');
      for (const tache of lister(dossierTaches)) {
        let messages;
        try { messages = JSON.parse(fs.readFileSync(path.join(dossierTaches, tache, 'ui_messages.json'), 'utf8')); } catch { continue; }
        if (!Array.isArray(messages)) continue;
        // Le dossier de travail est cité dans l'historique de l'API (« Current Working Directory »).
        let cwd = '';
        try {
          const h = fs.readFileSync(path.join(dossierTaches, tache, 'api_conversation_history.json'), 'utf8');
          const m = h.match(/Current Working Directory \(([^)]+)\)/);
          if (m) cwd = m[1].replace(/\\\\/g, '\\');
        } catch { /* facultatif */ }
        const dossierP = cwd ? nomDossier(cwd) : '(dossier inconnu)';
        const projet = sousProjet(() => JSON.stringify(messages), dossierP, sousProjets);
        messages.forEach((m, i) => {
          if (m.say !== 'api_req_started' || !m.text || !m.ts) return;
          let d;
          try { d = JSON.parse(m.text); } catch { return; }
          if (d.tokensIn === undefined && d.tokensOut === undefined) return;
          const quand = new Date(m.ts);
          reponses.push({
            cle: `${ext.id}:${tache}:${m.ts}:${i}`,
            outil: ext.outil,
            date: jourLocal(quand.getTime()),
            heure: quand.toLocaleTimeString('fr-FR'),
            modele: d.model || d.modelId || ext.outil,
            projet,
            dossier: dossierP,
            conversation: tache,
            entree: (d.tokensIn || 0) + (d.cacheWrites || 0),
            sortie: d.tokensOut || 0,
            cache: d.cacheReads || 0,
            reflexion: 0,
          });
        });
      }
    }
  }
  return reponses;
}

module.exports = { lireCopilot, lireTachesExtensions, rejouer };
