'use strict';
/*
 * Lecteurs de tokens pour les IA en ligne de commande, sous Windows et dans WSL.
 *
 *   Gemini CLI    sessions ~/.gemini/tmp/<projet>/chats/session-*.jsonl (ou .json, anciennes versions)
 *   OpenAI Codex  sessions ~/.codex/sessions/AAAA/MM/JJ/rollout-*.jsonl (CLI et extension VS Code)
 *
 * Chaque lecteur renvoie des réponses au même format que le reste du script.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { maisons } = require('./ia_detectees');

const lister = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const lire = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const json = t => { try { return JSON.parse(t); } catch { return null; } };

// Fichiers d'un dossier et de ses sous-dossiers dont le nom correspond au motif.
function fichiers(dossier, motif, liste = []) {
  for (const e of lister(dossier)) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) fichiers(p, motif, liste);
    else if (motif.test(e.name)) liste.push(p);
  }
  return liste;
}

// Dossiers de l'outil : celui donné par sa variable d'environnement, puis ceux de Windows et de WSL.
const dossiersOutil = (choisi, nom) => [...new Set([choisi, ...maisons().map(m => path.join(m, nom))].filter(Boolean))];

// ------------------------------------------------------------------ Gemini CLI
// Une session .jsonl : 1re ligne = métadonnées (sessionId, projectHash, startTime…), puis
// un message par ligne. Un message déjà écrit peut être réécrit plus bas avec le même id
// (par exemple quand ses tokens arrivent) : on garde la dernière version.
// Lignes spéciales : { $set }, { $patch }, { $rewindTo } ; un retour en arrière n'efface pas
// la consommation, ces lignes sont donc ignorées.
// tokens d'un message « gemini » : input (cache compris), output, cached, thoughts, tool, total.
function messagesGemini(texte) {
  const tout = json(texte);
  if (tout && Array.isArray(tout.messages)) return { meta: tout, messages: tout.messages }; // ancien format .json
  const meta = {};
  const parId = new Map();
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) continue;
    const o = json(ligne);
    if (!o || typeof o !== 'object') continue;
    if (o.$set || o.$patch || o.$rewindTo !== undefined) continue;
    if (o.id && o.type) parId.set(o.id, o);
    else if (o.sessionId) Object.assign(meta, o);
  }
  return { meta, messages: [...parId.values()] };
}

// Dossier de travail d'un dossier ~/.gemini/tmp/<nom> : fichier .project_root, sinon projects.json,
// sinon empreinte SHA-256 du chemin (anciennes versions).
function cheminsProjetsGemini(dossierGemini) {
  const projets = (json(lire(path.join(dossierGemini, 'projects.json'))) || {}).projects || {};
  const parNom = new Map();
  for (const [chemin, nom] of Object.entries(projets)) {
    parNom.set(nom, chemin);
    parNom.set(crypto.createHash('sha256').update(chemin).digest('hex'), chemin);
  }
  return nom => (lire(path.join(dossierGemini, 'tmp', nom, '.project_root')) || '').trim() || parNom.get(nom) || '';
}

function lireGeminiCli({ nomDossier, jourLocal, sousProjet, sousProjets }) {
  const reponses = [];
  for (const dossierGemini of dossiersOutil(process.env.GEMINI_CLI_HOME && path.join(process.env.GEMINI_CLI_HOME, '.gemini'), '.gemini')) {
    const cheminDe = cheminsProjetsGemini(dossierGemini);
    for (const projetTmp of lister(path.join(dossierGemini, 'tmp')).filter(e => e.isDirectory())) {
      const cheminTravail = cheminDe(projetTmp.name);
      const dossierP = cheminTravail ? nomDossier(cheminTravail) : '(dossier inconnu)';
      for (const fichier of fichiers(path.join(dossierGemini, 'tmp', projetTmp.name, 'chats'), /\.jsonl?$/)) {
        const texte = lire(fichier);
        if (!texte) continue;
        const { meta, messages } = messagesGemini(texte);
        const session = meta.sessionId || path.basename(fichier).replace(/\.jsonl?$/, '');
        let projet = null;
        for (const m of messages) {
          const t = m.type === 'gemini' && m.tokens;
          if (!t || !m.timestamp) continue;
          const quand = new Date(m.timestamp);
          if (isNaN(quand)) continue;
          if (projet === null) projet = sousProjet(() => texte, dossierP, sousProjets);
          const cache = t.cached || 0;
          reponses.push({
            cle: `gm:${session}:${m.id}`,
            outil: 'Gemini CLI',
            date: jourLocal(quand.getTime()),
            heure: quand.toLocaleTimeString('fr-FR'),
            modele: m.model || 'gemini',
            projet,
            dossier: dossierP,
            conversation: meta.summary ? `${meta.summary} (${String(session).slice(0, 8)})` : String(session),
            // input compte aussi les tokens lus depuis le cache : on les retire de l'entrée.
            entree: Math.max(0, (t.input || 0) - cache) + (t.tool || 0),
            sortie: t.output || 0,
            cache,
            reflexion: t.thoughts || 0,
          });
        }
      }
    }
  }
  return reponses;
}

// ---------------------------------------------------------------- OpenAI Codex
// Une ligne par événement : { timestamp, type, payload }.
//   session_meta  payload.id, payload.cwd
//   turn_context  payload.model, payload.cwd
//   event_msg     payload.type = « token_count », payload.info.last_token_usage (dernier appel)
//                 et payload.info.total_token_usage (cumul de la session)
// input_tokens comprend cached_input_tokens et output_tokens comprend reasoning_output_tokens.
// Un même relevé peut être répété (mise à jour des limites) : on l'ignore si le cumul n'a pas bougé.
function lireCodex({ nomDossier, jourLocal, sousProjet, sousProjets }) {
  const reponses = [];
  const vues = new Set();
  for (const dossierCodex of dossiersOutil(process.env.CODEX_HOME, '.codex')) {
    const liste = [...fichiers(path.join(dossierCodex, 'sessions'), /^rollout-.*\.jsonl$/), ...fichiers(path.join(dossierCodex, 'archived_sessions'), /^rollout-.*\.jsonl$/)];
    for (const fichier of liste) {
      const texte = lire(fichier);
      if (!texte) continue;
      let session = path.basename(fichier, '.jsonl'), cwd = '', modele = 'codex', precedent = null, n = 0;
      const projets = new Map();
      for (const ligne of texte.split('\n')) {
        if (!ligne.includes('"session_meta"') && !ligne.includes('"turn_context"') && !ligne.includes('"token_count"')) continue;
        const o = json(ligne);
        const p = o && o.payload;
        if (!p) continue;
        if (o.type === 'session_meta') { session = p.id || session; cwd = p.cwd || cwd; continue; }
        if (o.type === 'turn_context') { modele = p.model || modele; cwd = p.cwd || cwd; continue; }
        if (o.type !== 'event_msg' || p.type !== 'token_count' || !p.info || !p.info.last_token_usage) continue;
        const cumul = p.info.total_token_usage && p.info.total_token_usage.total_tokens;
        if (cumul !== undefined && cumul === precedent) continue;
        precedent = cumul;
        const cle = `cx:${session}:${n++}`;
        if (vues.has(cle)) continue; // même session dans sessions/ et archived_sessions/
        vues.add(cle);
        const quand = new Date(o.timestamp);
        if (isNaN(quand)) continue;
        const u = p.info.last_token_usage;
        const dossierP = cwd ? nomDossier(cwd) : '(dossier inconnu)';
        if (!projets.has(dossierP)) projets.set(dossierP, sousProjet(() => texte, dossierP, sousProjets));
        const cache = u.cached_input_tokens || 0, reflexion = u.reasoning_output_tokens || 0;
        reponses.push({
          cle,
          outil: 'OpenAI Codex',
          date: jourLocal(quand.getTime()),
          heure: quand.toLocaleTimeString('fr-FR'),
          modele,
          projet: projets.get(dossierP),
          dossier: dossierP,
          conversation: String(session),
          entree: Math.max(0, (u.input_tokens || 0) - cache),
          sortie: Math.max(0, (u.output_tokens || 0) - reflexion),
          cache,
          reflexion,
        });
      }
    }
  }
  return reponses;
}

module.exports = { lireGeminiCli, lireCodex, messagesGemini };
