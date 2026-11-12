/*
 * Aimant animé de Tok&Track (script de navigateur) : un aimant en fer à cheval
 * attire des tokens dorés, qui filent vers ses pôles et y font une petite étincelle.
 * Utilisé par le tableau de bord et par la page « Calcul en cours ». Intégré dans
 * les pages à la place de /*__AIMANT__*\/ par suivi_tokens.js.
 *
 *   aimant(canvas, { tokens: 14 })
 *   aimant(canvas, { enTete: true, tokens: 0 })   aimant seul, à côté du titre (en-tête du tableau de bord)
 *
 * Couleurs lues dans les variables CSS : --aimant-corps, --aimant-pointe, --token, --token-halo.
 * Animation arrêtée si l'onglet est caché, et figée si le système demande moins de mouvement.
 */
function aimant(canvas, options) {
  const opts = Object.assign({ tokens: 14 }, options);
  const ctx = canvas.getContext('2d');
  const lent = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, u = 1, cx = 0, cy = 0, poles = [];
  let couleurs = {};
  const particules = [];
  const etincelles = [0, 0];

  function mesurer() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth || 132; H = canvas.clientHeight || 56;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Taille de l'aimant : d'après la hauteur (dans l'en-tête, plafonnée pour rester à côté du titre).
    u = opts.enTete ? Math.min(H, 78) / 64 : H / 56;
    cx = (opts.enTete ? 24 : 26) * u; cy = H / 2;
    // Pôles : extrémités des deux branches de l'aimant (ouvertes vers la droite).
    poles = [{ x: cx + 20 * u, y: cy - 14 * u }, { x: cx + 20 * u, y: cy + 14 * u }];
  }

  function lireCouleurs() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, d) => (s.getPropertyValue(n) || '').trim() || d;
    couleurs = {
      corps: v('--aimant-corps', '#e5484d'),
      pointe: v('--aimant-pointe', '#c9d1db'),
      token: v('--token', '#f5c518'),
      halo: v('--token-halo', '0') === '1',
    };
  }

  function nouvelle(p, auHasard) {
    p.x = auHasard ? cx + 24 * u + Math.random() * (W - cx - 24 * u) : W + Math.random() * 10 * u;
    p.y = Math.random() * H;
    p.vx = -(0.15 + Math.random() * 0.5) * u;
    p.vy = (Math.random() - 0.5) * 0.3 * u;
    p.pole = p.y < cy ? 0 : 1;
    p.r = (1.6 + Math.random() * 1.2) * u;
    return p;
  }

  // Nombre de tokens qui tournent autour de l'aimant (0 dans l'en-tête : seuls ceux de la souris arrivent).
  function ajusterNombre() {
    const voulu = opts.tokens;
    while (particules.length < voulu) particules.push(nouvelle({}, true));
    particules.length = voulu;
  }

  function avancer() {
    for (const p of particules) {
      const cible = poles[p.pole];
      const dx = cible.x - p.x, dy = cible.y - p.y;
      const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
      // Attraction de plus en plus forte en approchant (comme un aimant).
      const a = (60 * u * u * u) / (d2 + 40 * u * u);
      p.vx = (p.vx + (dx / d) * a) * 0.985;
      p.vy = (p.vy + (dy / d) * a) * 0.985;
      p.x += p.vx; p.y += p.vy;
      if (d < 3 * u || p.x < cx) { etincelles[p.pole] = 1; nouvelle(p, false); }
    }
    etincelles[0] *= 0.9; etincelles[1] *= 0.9;
  }

  function dessiner() {
    ctx.clearRect(0, 0, W, H);
    // Lignes de champ, très discrètes, entre les deux pôles.
    ctx.save();
    ctx.strokeStyle = couleurs.pointe; ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(poles[0].x, cy, (6 + k * 9) * u, 14 * u, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();

    // Tokens : petits points dorés, avec une traînée vers l'arrière.
    for (const p of particules) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = couleurs.token; ctx.lineWidth = p.r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke();
      ctx.globalAlpha = 1;
      if (couleurs.halo) { ctx.shadowColor = couleurs.token; ctx.shadowBlur = 6 * u; }
      ctx.fillStyle = couleurs.token;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Aimant en fer à cheval, ouvert vers la droite.
    const e = 9 * u, R = 14 * u, bras = 12 * u, pointe = 6 * u;
    ctx.save();
    ctx.lineWidth = e; ctx.lineCap = 'butt'; ctx.strokeStyle = couleurs.corps;
    ctx.beginPath();
    ctx.moveTo(cx + bras, cy - R); ctx.lineTo(cx, cy - R);
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(cx + bras, cy + R);
    ctx.stroke();
    // Reflet sur le métal.
    ctx.globalAlpha = 0.28; ctx.lineWidth = 1.5 * u; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, R + e / 2 - 2 * u, -Math.PI / 2 - 0.2, -Math.PI, true); ctx.stroke();
    ctx.restore();
    // Pointes métalliques (les pôles).
    ctx.fillStyle = couleurs.pointe;
    ctx.fillRect(cx + bras, cy - R - e / 2, pointe, e);
    ctx.fillRect(cx + bras, cy + R - e / 2, pointe, e);

    // Étincelles quand un token touche un pôle.
    for (let i = 0; i < 2; i++) {
      if (etincelles[i] < 0.05) continue;
      ctx.save();
      ctx.globalAlpha = etincelles[i];
      ctx.strokeStyle = couleurs.token; ctx.lineWidth = 1.2 * u;
      if (couleurs.halo) { ctx.shadowColor = couleurs.token; ctx.shadowBlur = 8 * u; }
      const p = poles[i];
      for (let k = 0; k < 4; k++) {
        const ang = -0.9 + k * 0.6, l1 = 3 * u, l2 = (6 + 3 * etincelles[i]) * u;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * l1, p.y + Math.sin(ang) * l1);
        ctx.lineTo(p.x + Math.cos(ang) * l2, p.y + Math.sin(ang) * l2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  mesurer(); lireCouleurs(); ajusterNombre();
  for (let i = 0; i < 40; i++) avancer(); // l'animation démarre « en cours », sans écran vide

  let derniere = 0, image = 0;
  function boucle(t) {
    if (!document.hidden && t - derniere > 15) {
      derniere = t;
      if (++image % 30 === 0) lireCouleurs(); // suit un changement de thème
      avancer(); dessiner();
    }
    requestAnimationFrame(boucle);
  }
  if (lent) dessiner(); else requestAnimationFrame(boucle);

  addEventListener('resize', () => { mesurer(); ajusterNombre(); dessiner(); });
  return {
    redessiner() { lireCouleurs(); dessiner(); },
    // Position des pôles dans la fenêtre (pour les tokens lâchés par la souris).
    poles() {
      const r = canvas.getBoundingClientRect();
      return poles.map(p => ({ x: r.left + p.x * (r.width / W), y: r.top + p.y * (r.height / H) }));
    },
    etincelle(i) { etincelles[i] = 1; if (lent) dessiner(); },
    couleurs() { return couleurs; },
  };
}

/* Tokens lâchés par la souris : quand elle bouge, de petits tokens dorés s'en échappent
   et sont attirés jusqu'à l'aimant de l'en-tête, où ils font une étincelle.
   Dessinés en arrière-plan, derrière les cartes (on les voit entre elles), sans bloquer aucun clic. */
function tokensSouris(logo) {
  if (!logo || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const calque = document.createElement('canvas');
  calque.setAttribute('aria-hidden', 'true');
  calque.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
  document.body.appendChild(calque);
  const ctx = calque.getContext('2d');
  const tokens = [];
  const MAX = 140;
  let W = 0, H = 0, enMarche = false, dernier = null;

  function mesurer() {
    const dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    calque.width = Math.round(W * dpr); calque.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Un token tous les ~16 px parcourus par la souris.
  addEventListener('mousemove', e => {
    if (dernier) {
      const dx = e.clientX - dernier.x, dy = e.clientY - dernier.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 16) return;
      const n = Math.min(3, Math.floor(dist / 16));
      for (let i = 0; i < n && tokens.length < MAX; i++) {
        const angle = Math.random() * Math.PI * 2, elan = 1 + Math.random() * 2.5;
        tokens.push({
          x: e.clientX, y: e.clientY,
          vx: Math.cos(angle) * elan + dx * 0.05, vy: Math.sin(angle) * elan + dy * 0.05,
          r: 1.6 + Math.random() * 1.4, age: 0,
        });
      }
    }
    dernier = { x: e.clientX, y: e.clientY };
    if (!enMarche) { enMarche = true; requestAnimationFrame(boucle); }
  }, { passive: true });
  document.addEventListener('mouseleave', () => { dernier = null; });

  function boucle() {
    ctx.clearRect(0, 0, W, H);
    const poles = logo.poles();
    const c = logo.couleurs();
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const p = t.y < (poles[0].y + poles[1].y) / 2 ? 0 : 1; // pôle le plus proche
      const dx = poles[p].x - t.x, dy = poles[p].y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      // Attraction : douce au départ, puis de plus en plus forte près de l'aimant.
      const a = Math.min(0.06 + t.age * 0.012, 0.9) + 900 / (d * d + 900);
      t.vx = (t.vx + (dx / d) * a) * 0.94;
      t.vy = (t.vy + (dy / d) * a) * 0.94;
      t.x += t.vx; t.y += t.vy; t.age++;
      if (d < 6 || t.age > 400) { if (d < 6) logo.etincelle(p); tokens.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = c.token; ctx.lineWidth = t.r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - t.vx * 2.5, t.y - t.vy * 2.5); ctx.stroke();
      ctx.globalAlpha = 1;
      if (c.halo) { ctx.shadowColor = c.token; ctx.shadowBlur = 6; }
      ctx.fillStyle = c.token;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (tokens.length) requestAnimationFrame(boucle); else enMarche = false;
  }

  mesurer();
  addEventListener('resize', mesurer);
}

/* Fond doré : de grandes vagues de lumière floues, comme de la soie, et un faisceau de
   fils lumineux qui ondulent lentement à travers l'écran en se croisant.
   Les vagues sont dessinées en petit puis agrandies (ce qui les rend floues à peu de frais) ;
   les fils sont dessinés en pleine résolution avec un halo.
   Couleurs dans les variables CSS --or-fond, --or-clair, --or-sombre, --or-fil, --or-halo.
   Dessiné derrière tout le contenu ; figé si le système demande moins de mouvement. */
function fondOndes() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');
  const petit = document.createElement('canvas'); // vagues floues, en basse résolution
  const pctx = petit.getContext('2d');
  const lent = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const REDUCTION = 8;
  let W = 0, H = 0, t = 0, c = null;

  function mesurer() {
    const e = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * e); canvas.height = Math.round(H * e);
    ctx.setTransform(e, 0, 0, e, 0, 0);
    petit.width = Math.max(8, Math.round(W / REDUCTION)); petit.height = Math.max(8, Math.round(H / REDUCTION));
  }

  function lireCouleurs() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, d) => (s.getPropertyValue(n) || '').trim() || d;
    c = { fond: v('--or-fond', '#2a1f04'), clair: v('--or-clair', '#c99a06'), sombre: v('--or-sombre', '#120d02'),
          fil: v('--or-fil', '#fff3a6'), halo: v('--or-halo', '#ffd84a') };
  }

  // Grandes vagues floues : alternance de bandes claires et sombres qui ondulent lentement.
  function vagues() {
    const w = petit.width, h = petit.height;
    // Base : sombre en haut et en bas, lumineuse au milieu (là où passent les fils).
    const base = pctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, c.sombre); base.addColorStop(0.5, c.clair); base.addColorStop(1, c.fond);
    pctx.filter = 'none';
    pctx.globalAlpha = 1; pctx.fillStyle = c.fond; pctx.fillRect(0, 0, w, h);
    pctx.globalAlpha = 0.75; pctx.fillStyle = base; pctx.fillRect(0, 0, w, h);
    pctx.filter = `blur(${Math.max(2, Math.round(h * 0.06))}px)`; // les bandes deviennent de la soie
    const bandes = [
      { y: 0.16, coul: c.sombre, ep: 0.22, a: 0.45, amp: 0.06, f: 1.1, v: 0.5 },
      { y: 0.42, coul: c.clair, ep: 0.30, a: 0.55, amp: 0.05, f: 0.9, v: -0.4 },
      { y: 0.55, coul: c.clair, ep: 0.16, a: 0.45, amp: 0.04, f: 1.3, v: 0.6 },
      { y: 0.74, coul: c.sombre, ep: 0.20, a: 0.45, amp: 0.07, f: 0.8, v: 0.35 },
      { y: 0.92, coul: c.clair, ep: 0.22, a: 0.35, amp: 0.06, f: 1.0, v: -0.3 },
    ];
    pctx.lineCap = 'round';
    for (const b of bandes) {
      pctx.globalAlpha = b.a; pctx.strokeStyle = b.coul; pctx.lineWidth = b.ep * h;
      pctx.beginPath();
      for (let x = -4; x <= w + 4; x += 2) {
        const y = h * (b.y + b.amp * Math.sin((x / w) * Math.PI * 2 * b.f + t * b.v) + 0.02 * Math.sin((x / w) * 9 - t * 0.7));
        if (x === -4) pctx.moveTo(x, y); else pctx.lineTo(x, y);
      }
      pctx.stroke();
    }
    pctx.globalAlpha = 1; pctx.filter = 'none';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(petit, 0, 0, W, H); // agrandi : flou naturel
  }

  // Faisceau de fils lumineux au milieu, qui se croisent.
  function fils() {
    const centre = H * 0.5;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ph = i * 1.3, amp = H * (0.035 + i * 0.008), f = 1.6 + i * 0.22, dec = (i - 2) * H * 0.012;
      const yDe = x => centre + dec
        + amp * Math.sin((x / W) * Math.PI * f + t * (0.6 + i * 0.07) + ph)
        + H * 0.012 * Math.sin((x / W) * Math.PI * 4 - t * 0.9 + i);
      const tracer = () => {
        ctx.beginPath();
        for (let x = -10; x <= W + 10; x += 8) { const y = yDe(x); if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      };
      ctx.save();
      // Halo large et doux, puis le fil lui-même.
      ctx.globalAlpha = 0.18; ctx.strokeStyle = c.halo; ctx.lineWidth = 9; tracer();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = c.fil; ctx.lineWidth = 1.3 + (i % 2) * 0.6;
      ctx.shadowColor = c.halo; ctx.shadowBlur = 10; tracer();
      ctx.restore();
    }
  }

  function dessiner() {
    if (!c) lireCouleurs();
    vagues();
    fils();
  }

  let derniere = 0, image = 0;
  function boucle(ms) {
    // ~24 images par seconde suffisent pour un mouvement aussi lent.
    if (!document.hidden && ms - derniere > 40) {
      derniere = ms; t += 0.012;
      if (++image % 20 === 0) lireCouleurs();
      dessiner();
    }
    requestAnimationFrame(boucle);
  }

  mesurer(); lireCouleurs(); dessiner();
  if (!lent) requestAnimationFrame(boucle);
  addEventListener('resize', () => { mesurer(); dessiner(); });
  return { redessiner() { lireCouleurs(); dessiner(); } };
}
