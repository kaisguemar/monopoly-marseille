// Gestion des salons de jeu en ligne : logique pure, indépendante du protocole HTTP.
//
// Le serveur fait autorité : il détient la Partie, valide chaque action selon le jeton
// du joueur qui l'envoie, fait jouer les ordinateurs et diffuse l'état à tous les abonnés.
// Chaque joueur possède un jeton secret qui lui permet de se reconnecter à sa place.
import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { Partie, OPTIONS_PAR_DEFAUT } from '../src/moteur/partie.js';
import { deciderAction, actionsDeSecours } from '../src/moteur/ia.js';

export const PIONS = ['pointu', 'ballon', 'cigale', 'savon', 'navette', 'sardine'];
const NOMS_ORDINATEURS = ['César', 'Honorine', 'Panisse', 'Escartefigue', 'Fanny', 'Marius'];
const LETTRES_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 (ambigus)
const MAX_JOUEURS = 6;

// Durée approximative des animations d'un lot d'événements côté client (ms) :
// le serveur attend ce temps avant de faire rejouer un ordinateur.
export function dureeAnimations(evenements = []) {
  let total = 0;
  for (const e of evenements) {
    if (e.type === 'des') total += 1100;
    else if (e.type === 'deplacement') total += 140 * e.chemin.length;
    else if (e.type === 'teleportation') total += 500;
    else if (e.type === 'carte') total += 2200;
    else if (e.type === 'boire') total += 1300;
  }
  return total;
}

export class ErreurSalon extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.statut = statut;
  }
}

const refuser = (message, statut) => { throw new ErreurSalon(message, statut); };

function nettoyerNom(nom, defaut) {
  const propre = String(nom ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return propre || defaut;
}

export class GestionnaireSalons {
  // options :
  //  delaiIA            pause de base avant chaque action d'un ordinateur (ms)
  //  facteurAnimation   part du temps d'animation des clients à attendre (0 dans les tests)
  //  delaiDeconnexion   délai de grâce avant de considérer un joueur déconnecté (ms)
  //  delaiAbsence       délai avant que l'ordinateur remplace un joueur absent dont c'est le tour (ms)
  //  fichier            chemin de sauvegarde des salons (facultatif)
  constructor(donnees, options = {}) {
    this.donnees = donnees;
    this.delaiIA = options.delaiIA ?? 900;
    this.facteurAnimation = options.facteurAnimation ?? 1;
    this.delaiDeconnexion = options.delaiDeconnexion ?? 4000;
    this.delaiAbsence = options.delaiAbsence ?? 90000;
    this.fichier = options.fichier ?? null;
    this.salons = new Map();
    if (this.fichier) this.charger();
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  salon(code) {
    const s = this.salons.get(String(code ?? '').toUpperCase());
    if (!s) refuser('Salon introuvable.', 404);
    return s;
  }

  place(salon, jeton) {
    const p = salon.places.find((x) => x.jeton && x.jeton === jeton);
    if (!p) refuser('Jeton invalide pour ce salon.', 403);
    return p;
  }

  nouveauCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => LETTRES_CODE[randomInt(LETTRES_CODE.length)]).join('');
    } while (this.salons.has(code));
    return code;
  }

  pionLibre(salon, souhait) {
    const pris = new Set(salon.places.map((p) => p.pion));
    if (PIONS.includes(souhait) && !pris.has(souhait)) return souhait;
    return PIONS.find((p) => !pris.has(p));
  }

  nouvellePlace(salon, { nom, pion, ia = false }) {
    return {
      nom: nettoyerNom(nom, `Joueur ${salon.places.length + 1}`),
      pion: this.pionLibre(salon, pion),
      ia,
      jeton: ia ? null : randomBytes(16).toString('hex'),
      connexions: 0,
      connecte: false,
      deconnecteDepuis: null,
      remplaceParIA: false,
      abandon: false
    };
  }

  idPlace(salon, place) {
    return salon.places.indexOf(place);
  }

  verifierHote(salon, jeton) {
    const p = this.place(salon, jeton);
    if (this.idPlace(salon, p) !== salon.hote) refuser("Seul l'hôte du salon peut faire cela.", 403);
    return p;
  }

  verifierAvantPartie(salon) {
    if (salon.partie) refuser('La partie a déjà commencé.', 409);
  }

  // ---------------------------------------------------------------------------
  // Salon d'attente
  // ---------------------------------------------------------------------------

  creer({ nom, pion } = {}) {
    const salon = {
      code: this.nouveauCode(),
      creeLe: Date.now(),
      activite: Date.now(),
      hote: 0,
      places: [],
      options: { ...OPTIONS_PAR_DEFAUT },
      partie: null,
      version: 0,
      abonnes: new Set(),
      minuteurIA: null,
      minuteurAbsence: null,
      derniersEvenements: []
    };
    const place = this.nouvellePlace(salon, { nom, pion });
    salon.places.push(place);
    this.salons.set(salon.code, salon);
    this.changement(salon, 'salon');
    return { code: salon.code, jeton: place.jeton, place: 0 };
  }

  // Rejoindre un salon. Avec un jeton connu : reconnexion à sa place.
  // Partie commencée : on peut reprendre la place d'un joueur humain déconnecté qui porte le même nom.
  rejoindre(code, { nom, pion, jeton } = {}) {
    const salon = this.salon(code);
    if (jeton) {
      const existante = salon.places.find((p) => p.jeton === jeton);
      if (!existante) refuser("Votre place dans ce salon n'existe plus.", 403);
      return { code: salon.code, jeton: existante.jeton, place: this.idPlace(salon, existante) };
    }
    if (salon.partie) {
      const cible = nettoyerNom(nom, '').toLowerCase();
      const libre = salon.places.find((p) => p.jeton && !p.abandon && !p.connecte && p.nom.toLowerCase() === cible);
      if (!libre) refuser('La partie a déjà commencé. Pour reprendre votre place, utilisez exactement le même nom que dans la partie.', 409);
      return { code: salon.code, jeton: libre.jeton, place: this.idPlace(salon, libre) };
    }
    if (salon.places.length >= MAX_JOUEURS) refuser('Le salon est complet (6 joueurs).', 409);
    const place = this.nouvellePlace(salon, { nom, pion });
    salon.places.push(place);
    this.changement(salon, 'salon');
    return { code: salon.code, jeton: place.jeton, place: this.idPlace(salon, place) };
  }

  ajouterOrdinateur(code, jeton) {
    const salon = this.salon(code);
    this.verifierHote(salon, jeton);
    this.verifierAvantPartie(salon);
    if (salon.places.length >= MAX_JOUEURS) refuser('Le salon est complet (6 joueurs).', 409);
    const pris = new Set(salon.places.map((p) => p.nom));
    const nom = NOMS_ORDINATEURS.find((n) => !pris.has(n)) ?? `Ordinateur ${salon.places.length + 1}`;
    salon.places.push(this.nouvellePlace(salon, { nom, ia: true }));
    this.changement(salon, 'salon');
  }

  retirer(code, jeton, idPlace) {
    const salon = this.salon(code);
    this.verifierHote(salon, jeton);
    this.verifierAvantPartie(salon);
    if (idPlace === salon.hote) refuser("L'hôte ne peut pas se retirer lui-même : utilisez « Quitter le salon ».");
    if (!salon.places[idPlace]) refuser('Place inconnue.');
    const [retiree] = salon.places.splice(idPlace, 1);
    if (salon.hote > idPlace) salon.hote--;
    for (const abonne of salon.abonnes) if (abonne.place === retiree) abonne.fermer?.();
    this.changement(salon, 'salon');
  }

  modifierOptions(code, jeton, options = {}) {
    const salon = this.salon(code);
    this.verifierHote(salon, jeton);
    this.verifierAvantPartie(salon);
    const o = salon.options;
    for (const cle of ['parcGratuit', 'doubleDepart', 'partieRapide', 'pastis']) {
      if (cle in options) o[cle] = !!options[cle];
    }
    if ('toursMax' in options) o.toursMax = Math.max(5, Math.min(200, Math.floor(Number(options.toursMax)) || 20));
    this.changement(salon, 'salon');
  }

  demarrer(code, jeton) {
    const salon = this.salon(code);
    this.verifierHote(salon, jeton);
    this.verifierAvantPartie(salon);
    if (salon.places.length < 2) refuser('Il faut au moins 2 joueurs pour commencer.');
    salon.partie = Partie.nouvelle(this.donnees, {
      joueurs: salon.places.map((p) => ({ nom: p.nom, pion: p.pion, ia: p.ia })),
      options: salon.options
    });
    this.changement(salon, 'partie', salon.partie.extraireEvenements());
  }

  // Un joueur quitte : avant la partie, sa place est libérée ; pendant, l'ordinateur le remplace définitivement.
  quitter(code, jeton) {
    const salon = this.salon(code);
    const place = this.place(salon, jeton);
    const id = this.idPlace(salon, place);
    if (!salon.partie) {
      salon.places.splice(id, 1);
      for (const abonne of salon.abonnes) if (abonne.place === place) abonne.fermer?.();
      if (!salon.places.some((p) => !p.ia)) {
        this.supprimer(salon);
        return;
      }
      if (salon.hote === id) salon.hote = salon.places.findIndex((p) => !p.ia);
      else if (salon.hote > id) salon.hote--;
      this.changement(salon, 'salon');
      return;
    }
    place.abandon = true;
    place.jeton = null;
    place.connecte = false;
    for (const abonne of salon.abonnes) if (abonne.place === place) abonne.fermer?.();
    const joueur = salon.partie.etat.joueurs[id];
    if (!joueur.faillite && !salon.partie.etat.terminee) {
      joueur.ia = true;
      salon.partie.log(`${place.nom} quitte la partie : l'ordinateur prend sa place.`);
    }
    if (salon.hote === id) {
      const autre = salon.places.findIndex((p) => p.jeton);
      if (autre >= 0) salon.hote = autre;
    }
    if (!salon.places.some((p) => p.jeton)) {
      this.supprimer(salon);
      return;
    }
    this.changement(salon, 'partie', salon.partie.extraireEvenements());
  }

  supprimer(salon) {
    clearTimeout(salon.minuteurIA);
    clearTimeout(salon.minuteurAbsence);
    for (const abonne of salon.abonnes) abonne.fermer?.();
    this.salons.delete(salon.code);
    this.planifierSauvegarde();
  }

  // ---------------------------------------------------------------------------
  // Partie
  // ---------------------------------------------------------------------------

  // Exécute l'action d'un joueur humain. Le joueur est déterminé par le jeton, jamais par le client.
  agir(code, jeton, action) {
    const salon = this.salon(code);
    const place = this.place(salon, jeton);
    if (!salon.partie) refuser("La partie n'a pas encore commencé.", 409);
    if (!action || typeof action.type !== 'string') refuser('Action invalide.');
    const id = this.idPlace(salon, place);
    const resultat = salon.partie.executer({ ...action, joueur: id });
    if (!resultat.ok) return { ok: false, erreur: resultat.erreur, version: salon.version };
    this.changement(salon, 'partie', salon.partie.extraireEvenements(), { type: action.type, joueur: id });
    return { ok: true, version: salon.version };
  }

  // Confie un joueur humain déconnecté à l'ordinateur (il reprend la main à son retour).
  remplacerParIA(code, jeton, idPlace) {
    const salon = this.salon(code);
    this.place(salon, jeton);
    if (!salon.partie) refuser("La partie n'a pas encore commencé.", 409);
    const cible = salon.places[idPlace];
    if (!cible || cible.ia) refuser('Ce joueur est déjà un ordinateur.');
    if (cible.connecte) refuser('Ce joueur est connecté.');
    this.confierAIA(salon, idPlace);
  }

  confierAIA(salon, idPlace) {
    const cible = salon.places[idPlace];
    const joueur = salon.partie.etat.joueurs[idPlace];
    if (cible.remplaceParIA || joueur.faillite || salon.partie.etat.terminee) return;
    cible.remplaceParIA = true;
    joueur.ia = true;
    salon.partie.log(`${cible.nom} a perdu la connexion : l'ordinateur joue à sa place en attendant son retour.`);
    this.changement(salon, 'partie', salon.partie.extraireEvenements());
  }

  // Programme le prochain coup de l'ordinateur, ou la surveillance d'un joueur absent.
  planifier(salon) {
    clearTimeout(salon.minuteurIA);
    clearTimeout(salon.minuteurAbsence);
    const partie = salon.partie;
    if (!partie || partie.etat.terminee) return;
    const actif = partie.joueurActif();
    if (actif === null) return;
    if (partie.etat.joueurs[actif].ia) {
      const delai = this.delaiIA + this.facteurAnimation * dureeAnimations(salon.derniersEvenements);
      salon.minuteurIA = setTimeout(() => this.jouerOrdinateur(salon), delai);
      return;
    }
    const place = salon.places[actif];
    if (!place.connecte && place.deconnecteDepuis !== null) {
      const reste = Math.max(0, place.deconnecteDepuis + this.delaiAbsence - Date.now());
      salon.minuteurAbsence = setTimeout(() => {
        if (!place.connecte && salon.partie.joueurActif() === actif) this.confierAIA(salon, actif);
      }, reste);
    }
  }

  jouerOrdinateur(salon) {
    const partie = salon.partie;
    if (!this.salons.has(salon.code) || partie.etat.terminee) return;
    const actif = partie.joueurActif();
    if (actif === null || !partie.etat.joueurs[actif].ia) return;
    let action = deciderAction(partie);
    let resultat = partie.executer(action);
    for (const secours of actionsDeSecours(partie)) {
      if (resultat.ok) break;
      action = secours;
      resultat = partie.executer(secours);
    }
    if (!resultat.ok) return;
    this.changement(salon, 'partie', partie.extraireEvenements(), { type: action.type, joueur: actif });
  }

  // ---------------------------------------------------------------------------
  // Connexions et diffusion
  // ---------------------------------------------------------------------------

  // Abonne un client au flux du salon. `envoyer(message)` est appelé à chaque changement.
  // Retourne une fonction à appeler à la déconnexion.
  abonner(code, jeton, envoyer, fermer) {
    const salon = this.salon(code);
    const place = this.place(salon, jeton);
    const abonne = { place, envoyer, fermer };
    salon.abonnes.add(abonne);
    place.connexions++;
    const revenu = !place.connecte;
    place.connecte = true;
    place.deconnecteDepuis = null;
    salon.activite = Date.now();
    envoyer(this.message(salon, abonne, { changement: 'initial', evenements: [] }));
    if (revenu) this.retour(salon, place);
    let actif = true;
    return () => {
      if (!actif) return;
      actif = false;
      salon.abonnes.delete(abonne);
      place.connexions--;
      setTimeout(() => this.verifierDeconnexion(salon, place), this.delaiDeconnexion).unref?.();
    };
  }

  retour(salon, place) {
    const id = this.idPlace(salon, place);
    if (salon.partie && place.remplaceParIA) {
      place.remplaceParIA = false;
      salon.partie.etat.joueurs[id].ia = false;
      salon.partie.log(`${place.nom} est de retour et reprend la main !`);
      this.changement(salon, 'partie', salon.partie.extraireEvenements());
      return;
    }
    this.changement(salon, 'presence');
  }

  verifierDeconnexion(salon, place) {
    if (place.connexions > 0 || !place.connecte || !this.salons.has(salon.code)) return;
    place.connecte = false;
    place.deconnecteDepuis = Date.now();
    this.changement(salon, 'presence');
  }

  // Vue publique du salon (sans les jetons).
  vueSalon(salon) {
    return {
      code: salon.code,
      hote: salon.hote,
      demarre: !!salon.partie,
      options: salon.options,
      places: salon.places.map((p, id) => ({
        id, nom: p.nom, pion: p.pion, ia: p.ia,
        connecte: p.ia || p.connecte, remplaceParIA: p.remplaceParIA, abandon: p.abandon
      }))
    };
  }

  infos(code) {
    return this.vueSalon(this.salon(code));
  }

  message(salon, abonne, { changement, evenements, action = null }) {
    return {
      type: 'maj',
      changement,
      version: salon.version,
      moi: this.idPlace(salon, abonne.place),
      salon: this.vueSalon(salon),
      etat: salon.partie ? salon.partie.etat : null,
      evenements,
      action
    };
  }

  // Enregistre un changement : nouvelle version, diffusion à tous, IA, sauvegarde.
  changement(salon, changement, evenements = [], action = null) {
    salon.version++;
    salon.activite = Date.now();
    if (changement === 'partie') salon.derniersEvenements = evenements;
    for (const abonne of [...salon.abonnes]) {
      try {
        abonne.envoyer(this.message(salon, abonne, { changement, evenements, action }));
      } catch {
        salon.abonnes.delete(abonne);
      }
    }
    this.planifier(salon);
    this.planifierSauvegarde();
  }

  // Supprime les salons inactifs depuis longtemps.
  nettoyer(ageMax = 6 * 3600 * 1000) {
    const limite = Date.now() - ageMax;
    for (const salon of [...this.salons.values()]) {
      if (salon.abonnes.size === 0 && salon.activite < limite) this.supprimer(salon);
    }
  }

  // ---------------------------------------------------------------------------
  // Sauvegarde sur disque (pour survivre à un redémarrage du serveur)
  // ---------------------------------------------------------------------------

  exporter() {
    return {
      version: 1,
      salons: [...this.salons.values()].map((s) => ({
        code: s.code, creeLe: s.creeLe, activite: s.activite, hote: s.hote, options: s.options, version: s.version,
        places: s.places.map(({ nom, pion, ia, jeton, remplaceParIA, abandon }) => ({ nom, pion, ia, jeton, remplaceParIA, abandon })),
        etat: s.partie ? s.partie.etat : null
      }))
    };
  }

  importer(donnees) {
    for (const s of donnees?.salons ?? []) {
      const salon = {
        ...s,
        places: s.places.map((p) => ({ ...p, connexions: 0, connecte: false, deconnecteDepuis: Date.now() })),
        partie: s.etat ? Partie.restaurer(this.donnees, s.etat) : null,
        abonnes: new Set(),
        minuteurIA: null,
        minuteurAbsence: null,
        derniersEvenements: []
      };
      delete salon.etat;
      this.salons.set(salon.code, salon);
      this.planifier(salon);
    }
  }

  charger() {
    try {
      if (existsSync(this.fichier)) this.importer(JSON.parse(readFileSync(this.fichier, 'utf8')));
    } catch (err) {
      console.warn(`Sauvegarde des salons illisible (${err.message}), on repart de zéro.`);
    }
  }

  planifierSauvegarde() {
    if (!this.fichier || this.minuteurSauvegarde) return;
    this.minuteurSauvegarde = setTimeout(() => this.sauvegarder(), 500);
    this.minuteurSauvegarde.unref?.();
  }

  sauvegarder() {
    clearTimeout(this.minuteurSauvegarde);
    this.minuteurSauvegarde = null;
    if (!this.fichier) return;
    try {
      const temporaire = `${this.fichier}.tmp`;
      writeFileSync(temporaire, JSON.stringify(this.exporter()));
      renameSync(temporaire, this.fichier);
    } catch (err) {
      console.warn(`Impossible de sauvegarder les salons : ${err.message}`);
    }
  }

  // Arrête tous les minuteurs (fin du serveur, tests).
  fermer() {
    this.sauvegarder();
    for (const salon of this.salons.values()) {
      clearTimeout(salon.minuteurIA);
      clearTimeout(salon.minuteurAbsence);
      for (const abonne of salon.abonnes) abonne.fermer?.();
    }
  }
}
