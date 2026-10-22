// Serveur du jeu : sert les fichiers du jeu et l'API du mode en ligne.
// Uniquement des modules intégrés à Node.js (aucune dépendance).
//
// Lancement : node serveur/serveur.js   (port 8080, ou variable d'environnement PORT)
//
// API (JSON) :
//   GET  /api/sante                         le serveur répond
//   POST /api/salons                        { nom, pion } → { code, jeton, place }
//   GET  /api/salons/:code                  informations publiques du salon
//   POST /api/salons/:code/rejoindre        { nom, pion, jeton? } → { code, jeton, place }
//   POST /api/salons/:code/ordinateur       { jeton } (hôte) ajoute un ordinateur
//   POST /api/salons/:code/retirer          { jeton, place } (hôte)
//   POST /api/salons/:code/options          { jeton, options } (hôte)
//   POST /api/salons/:code/demarrer         { jeton } (hôte)
//   POST /api/salons/:code/action           { jeton, action } → { ok, erreur?, version }
//   POST /api/salons/:code/remplacer        { jeton, place } confie un absent à l'ordinateur
//   POST /api/salons/:code/quitter          { jeton }
//   GET  /api/salons/:code/flux?jeton=…     flux Server-Sent Events des mises à jour
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GestionnaireSalons, ErreurSalon } from './salons.js';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TAILLE_MAX_CORPS = 64 * 1024;
// Seuls ces fichiers et dossiers sont servis (jamais le serveur, ni sa sauvegarde, ni .git).
const PUBLICS = ['index.html', 'src', 'data', 'assets', 'docs'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};

export function chargerDonnees(racine = RACINE) {
  const lire = (f) => JSON.parse(readFileSync(join(racine, 'data', f), 'utf8'));
  return { plateau: lire('plateau.json'), cartes: lire('cartes.json') };
}

function repondre(res, statut, corps) {
  const texte = JSON.stringify(corps);
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(texte);
}

function lireCorps(req) {
  return new Promise((resoudre, rejeter) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (m) => {
      taille += m.length;
      if (taille > TAILLE_MAX_CORPS) {
        rejeter(new ErreurSalon('Requête trop volumineuse.', 413));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on('end', () => {
      if (!morceaux.length) return resoudre({});
      try {
        const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        resoudre(corps && typeof corps === 'object' ? corps : {});
      } catch {
        rejeter(new ErreurSalon('JSON invalide.'));
      }
    });
    req.on('error', rejeter);
  });
}

async function servirFichier(req, res, racine) {
  const url = new URL(req.url, 'http://localhost');
  let chemin = decodeURIComponent(url.pathname);
  if (chemin === '/' || chemin === '') chemin = '/index.html';
  const relatif = chemin.replace(/^\/+/, '');
  const premier = relatif.split('/')[0];
  const absolu = resolve(racine, relatif);
  if (!PUBLICS.includes(premier) || !absolu.startsWith(racine + sep) || relatif.split('/').some((s) => s.startsWith('.'))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
    return;
  }
  try {
    const contenu = await readFile(absolu);
    res.writeHead(200, { 'Content-Type': TYPES[extname(absolu)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
  }
}

// Flux Server-Sent Events : le navigateur (EventSource) se reconnecte tout seul en cas de coupure.
function ouvrirFlux(req, res, salons, code, jeton) {
  let desabonner = null;
  const fermer = () => {
    clearInterval(battement);
    desabonner?.();
    if (!res.writableEnded) res.end();
  };
  const envoyer = (message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
  // Vérifie le salon et le jeton avant d'ouvrir le flux (sinon : réponse d'erreur JSON).
  salons.place(salons.salon(code), jeton);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 1500\n\n');
  const battement = setInterval(() => res.write(': ping\n\n'), 15000);
  desabonner = salons.abonner(code, jeton, envoyer, fermer);
  req.on('close', fermer);
}

async function traiterApi(req, res, salons) {
  const url = new URL(req.url, 'http://localhost');
  const morceaux = url.pathname.split('/').filter(Boolean); // ['api', 'salons', code, verbe]
  if (morceaux[1] === 'sante') return repondre(res, 200, { ok: true });
  if (morceaux[1] !== 'salons') throw new ErreurSalon('Route inconnue.', 404);
  const [, , code, verbe] = morceaux;

  if (req.method === 'GET') {
    if (code && verbe === 'flux') return ouvrirFlux(req, res, salons, code, url.searchParams.get('jeton'));
    if (code && !verbe) return repondre(res, 200, salons.infos(code));
    throw new ErreurSalon('Route inconnue.', 404);
  }
  if (req.method !== 'POST') throw new ErreurSalon('Méthode non autorisée.', 405);
  const corps = await lireCorps(req);
  if (!code) return repondre(res, 201, salons.creer(corps));
  switch (verbe) {
    case 'rejoindre': return repondre(res, 200, salons.rejoindre(code, corps));
    case 'ordinateur': salons.ajouterOrdinateur(code, corps.jeton); break;
    case 'retirer': salons.retirer(code, corps.jeton, Number(corps.place)); break;
    case 'options': salons.modifierOptions(code, corps.jeton, corps.options); break;
    case 'demarrer': salons.demarrer(code, corps.jeton); break;
    case 'action': return repondre(res, 200, salons.agir(code, corps.jeton, corps.action));
    case 'remplacer': salons.remplacerParIA(code, corps.jeton, Number(corps.place)); break;
    case 'quitter': salons.quitter(code, corps.jeton); break;
    default: throw new ErreurSalon('Route inconnue.', 404);
  }
  return repondre(res, 200, { ok: true });
}

// Crée le serveur. Options : port, hote, racine, fichier (sauvegarde des salons), et les réglages
// du GestionnaireSalons (delaiIA, facteurAnimation, delaiDeconnexion, delaiAbsence).
export function creerServeur(options = {}) {
  const racine = options.racine ?? RACINE;
  const salons = new GestionnaireSalons(chargerDonnees(racine), options);
  const serveur = createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) await traiterApi(req, res, salons);
      else if (req.method === 'GET' || req.method === 'HEAD') await servirFichier(req, res, racine);
      else repondre(res, 405, { ok: false, erreur: 'Méthode non autorisée.' });
    } catch (err) {
      const statut = err instanceof ErreurSalon ? err.statut : 500;
      if (statut === 500) console.error(err);
      if (!res.headersSent) repondre(res, statut, { ok: false, erreur: statut === 500 ? 'Erreur interne du serveur.' : err.message });
      else res.end();
    }
  });
  const nettoyage = setInterval(() => salons.nettoyer(), 3600 * 1000);
  nettoyage.unref();
  return {
    serveur,
    salons,
    ecouter: (port = options.port ?? 8080, hote = options.hote) => new Promise((ok) => serveur.listen(port, hote, () => ok(serveur.address().port))),
    fermer: () => new Promise((ok) => {
      clearInterval(nettoyage);
      salons.fermer();
      serveur.closeAllConnections?.();
      serveur.close(() => ok());
    })
  };
}

// Lancement en ligne de commande.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  const { ecouter, fermer } = creerServeur({ fichier: process.env.SAUVEGARDE ?? join(RACINE, 'serveur', 'salons.json') });
  ecouter(port, process.env.HOTE).then((p) => {
    console.log(`Monopoly Marseille : http://localhost:${p}`);
    console.log('Pour jouer à plusieurs, partagez l\'adresse de cette machine sur le réseau (ex. http://192.168.x.x:' + p + ').');
  });
  const arreter = () => fermer().then(() => process.exit(0));
  process.on('SIGINT', arreter);
  process.on('SIGTERM', arreter);
}
