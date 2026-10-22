// Moteur de partie : état sérialisable et actions validées par les règles.
//
// Utilisation :
//   const partie = Partie.nouvelle(donnees, { joueurs: [...], options: {...} });
//   const resultat = partie.executer({ type: 'lancer', joueur: 0 });
//   if (!resultat.ok) console.log(resultat.erreur);
//   const evenements = partie.extraireEvenements(); // pour les animations
//
// L'état (`partie.etat`) est un objet JSON pur : il peut être sauvegardé puis
// restauré avec `Partie.restaurer(donnees, etat)`.

import { graineAleatoire, lancerDe, melanger } from './alea.js';
import {
  ARGENT_INITIAL, SALAIRE_DEPART, AMENDE_PRISON, STOCK_MAISONS, STOCK_HOTELS, CASE_PRISON, HOTEL,
  estAchetable, calculerLoyer, compterConstructions, casesDuGroupe, casesSoeurs, possedeGroupe,
  proprietesDe, coutLevee, patrimoine, valeurLiquidable
} from './regles.js';

export class ErreurRegle extends Error {}

const refuser = (message) => { throw new ErreurRegle(message); };

const MAX_JOURNAL = 300;

export const OPTIONS_PAR_DEFAUT = {
  parcGratuit: false,   // taxes et amendes déposées sur le Parc gratuit
  doubleDepart: false,  // 400 € en s'arrêtant pile sur Départ
  partieRapide: false,  // limite de tours, victoire au patrimoine
  toursMax: 20
};

export class Partie {
  constructor(donnees, etat) {
    this.plateau = donnees.plateau;
    this.cartes = donnees.cartes;
    this.cartesParId = new Map([...donnees.cartes.chance, ...donnees.cartes.communaute].map((c) => [c.id, c]));
    this.etat = etat;
    this.evenements = [];
  }

  // Crée une nouvelle partie. config.joueurs : [{ nom, pion, ia }] (2 à 6).
  static nouvelle(donnees, config) {
    const liste = config.joueurs ?? [];
    if (liste.length < 2 || liste.length > 6) refuser('Il faut entre 2 et 6 joueurs.');
    const proprietes = {};
    for (const c of donnees.plateau.cases) {
      if (estAchetable(c)) proprietes[c.index] = { proprietaire: null, maisons: 0, hypotheque: false };
    }
    const etat = {
      version: 1,
      graine: (config.graine ?? graineAleatoire()) >>> 0,
      options: { ...OPTIONS_PAR_DEFAUT, ...config.options },
      joueurs: liste.map((j, id) => ({
        id,
        nom: (j.nom || `Joueur ${id + 1}`).trim(),
        pion: j.pion ?? null,
        ia: !!j.ia,
        argent: ARGENT_INITIAL,
        position: 0,
        enPrison: false,
        toursPrison: 0,
        cartesSortie: [],
        faillite: false
      })),
      proprietes,
      banque: { maisons: STOCK_MAISONS, hotels: STOCK_HOTELS },
      pioches: {
        chance: donnees.cartes.chance.map((c) => c.id),
        communaute: donnees.cartes.communaute.map((c) => c.id)
      },
      cagnotte: 0,
      courant: 0,
      tour: 1,
      des: null,
      doubles: 0,
      aLance: false,
      peutRejouer: false,
      attente: null,
      dettes: [],
      encheresEnAttente: [],
      echange: null,
      echangesProposes: 0,
      derniereCarte: null,
      terminee: false,
      gagnant: null,
      journal: []
    };
    melanger(etat, etat.pioches.chance);
    melanger(etat, etat.pioches.communaute);
    const partie = new Partie(donnees, etat);
    partie.log(`La partie commence ! ${etat.joueurs.map((j) => j.nom).join(', ')} prennent place autour du Vieux-Port.`);
    return partie;
  }

  static restaurer(donnees, etat) {
    const copie = typeof etat === 'string' ? JSON.parse(etat) : structuredClone(etat);
    if (copie?.version !== 1 || !Array.isArray(copie.joueurs)) refuser('Sauvegarde invalide.');
    return new Partie(donnees, copie);
  }

  serialiser() {
    return JSON.stringify(this.etat);
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  log(message) {
    this.etat.journal.push(message);
    if (this.etat.journal.length > MAX_JOURNAL) this.etat.journal.shift();
    this.evenements.push({ type: 'journal', message });
  }

  emettre(evenement) {
    this.evenements.push(evenement);
  }

  extraireEvenements() {
    const e = this.evenements;
    this.evenements = [];
    return e;
  }

  joueur(id) {
    return this.etat.joueurs[id];
  }

  nomCase(index) {
    return this.plateau.cases[index].nom;
  }

  joueursEnJeu() {
    return this.etat.joueurs.filter((j) => !j.faillite);
  }

  // Joueur qui doit agir maintenant (celui dont l'interface ou l'IA attend une décision).
  joueurActif() {
    const e = this.etat;
    if (e.terminee) return null;
    if (e.attente?.type === 'enchere') return e.attente.participants[e.attente.actif];
    if (e.echange) return e.echange.a;
    if (e.dettes.length) return e.dettes[0].debiteur;
    if (e.attente) return e.attente.joueur;
    return e.courant;
  }

  // ---------------------------------------------------------------------------
  // Point d'entrée unique des actions
  // ---------------------------------------------------------------------------

  executer(action) {
    try {
      if (this.etat.terminee) refuser('La partie est terminée.');
      const methode = ACTIONS[action?.type];
      if (!methode) refuser(`Action inconnue : ${action?.type}`);
      if (action.joueur !== this.joueurActif()) refuser("Ce n'est pas à ce joueur d'agir.");
      this[methode](action);
      this.progresser();
      return { ok: true };
    } catch (err) {
      if (err instanceof ErreurRegle) return { ok: false, erreur: err.message };
      throw err;
    }
  }

  // Liste des types d'actions actuellement possibles pour le joueur actif (aide pour l'interface et l'IA).
  actionsPossibles() {
    const e = this.etat;
    const id = this.joueurActif();
    if (id === null) return [];
    if (e.attente?.type === 'enchere') return ['encherir', 'passerEnchere'];
    if (e.echange) return ['repondreEchange'];
    const gestion = ['construire', 'vendreConstruction', 'hypothequer', 'leverHypotheque', 'proposerEchange'];
    if (e.dettes.length) return ['payerDette', 'declarerFaillite', ...gestion];
    if (e.attente?.type === 'achat') return ['acheter', 'refuserAchat', ...gestion];
    if (e.attente?.type === 'choix_amende') return ['choisirAmende', ...gestion];
    const j = this.joueur(id);
    const liste = [];
    if (!e.aLance || e.peutRejouer) {
      liste.push('lancer');
      if (j.enPrison) {
        if (j.argent >= AMENDE_PRISON) liste.push('payerPrison');
        if (j.cartesSortie.length) liste.push('utiliserCarteSortie');
      }
    } else {
      liste.push('finirTour');
    }
    return [...liste, ...gestion];
  }

  // Enchaînements automatiques après chaque action.
  progresser() {
    const e = this.etat;
    if (e.terminee) return;
    if (this.joueursEnJeu().length <= 1) {
      this.terminer(this.joueursEnJeu()[0]?.id ?? null);
      return;
    }
    if (!e.attente && !e.dettes.length && !e.echange && e.encheresEnAttente.length) {
      this.demarrerEnchere(e.encheresEnAttente.shift());
      return;
    }
    if (!e.attente && !e.dettes.length && !e.echange && this.joueur(e.courant).faillite) {
      this.joueurSuivant();
    }
  }

  terminer(gagnantId) {
    const e = this.etat;
    e.terminee = true;
    e.gagnant = gagnantId;
    e.attente = null;
    e.echange = null;
    this.log(gagnantId === null ? 'La partie est terminée.' : `🏆 ${this.joueur(gagnantId).nom} remporte la partie ! Fan de chichourle, quel champion !`);
    this.emettre({ type: 'fin', gagnant: gagnantId });
  }

  // Partie rapide : victoire au patrimoine le plus élevé.
  terminerAuPatrimoine() {
    const classement = this.classement();
    this.log(`Fin de la partie rapide après ${this.etat.options.toursMax} tours. Place au décompte des patrimoines !`);
    for (const { joueur, valeur } of classement) this.log(`${joueur.nom} : ${valeur} €.`);
    this.terminer(classement[0].joueur.id);
  }

  // Joueurs encore en jeu triés par patrimoine décroissant.
  classement() {
    return this.joueursEnJeu()
      .map((joueur) => ({ joueur, valeur: patrimoine(this.etat, this.plateau, joueur.id) }))
      .sort((x, y) => y.valeur - x.valeur);
  }

  // ---------------------------------------------------------------------------
  // Argent
  // ---------------------------------------------------------------------------

  // Destination de l'argent des taxes et amendes : la banque, ou la cagnotte du Parc gratuit (option).
  get destinationAmendes() {
    return this.etat.options.parcGratuit ? 'cagnotte' : 'banque';
  }

  crediter(destinataire, montant) {
    if (destinataire === 'cagnotte') this.etat.cagnotte += montant;
    else if (destinataire !== 'banque') this.joueur(destinataire).argent += montant;
  }

  // Fait payer un joueur. S'il n'a pas assez d'argent, une dette est enregistrée :
  // il devra vendre, hypothéquer ou échanger avant de la régler, ou faire faillite.
  payer(debiteurId, montant, creancier, motif) {
    if (montant <= 0) return true;
    const j = this.joueur(debiteurId);
    if (j.argent >= montant) {
      j.argent -= montant;
      this.crediter(creancier, montant);
      this.emettre({ type: 'argent', joueur: debiteurId, montant: -montant });
      return true;
    }
    this.etat.dettes.push({ debiteur: debiteurId, creancier, montant, motif });
    this.log(`${j.nom} doit ${montant} € (${motif}) mais n'a que ${j.argent} €. Il faut trouver des sous !`);
    return false;
  }

  recevoir(joueurId, montant) {
    this.joueur(joueurId).argent += montant;
    this.emettre({ type: 'argent', joueur: joueurId, montant });
  }

  // ---------------------------------------------------------------------------
  // Dés, déplacements et prison
  // ---------------------------------------------------------------------------

  aLancer({ joueur, des }) {
    const e = this.etat;
    if (e.attente || e.dettes.length) refuser('Une décision est en attente.');
    if (e.aLance && !e.peutRejouer) refuser('Vous avez déjà lancé les dés.');
    const j = this.joueur(joueur);
    const [d1, d2] = des ?? [lancerDe(e), lancerDe(e)];
    if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) refuser('Valeurs de dés invalides.');
    const double = d1 === d2;
    e.des = [d1, d2];
    e.aLance = true;
    e.peutRejouer = false;
    this.emettre({ type: 'des', joueur, des: [d1, d2] });
    this.log(`${j.nom} lance les dés : ${d1} + ${d2} = ${d1 + d2}${double ? ' (double !)' : ''}.`);

    if (j.enPrison) {
      if (double) {
        this.sortirDePrison(j, 'grâce à un double');
      } else {
        j.toursPrison++;
        if (j.toursPrison < 3) {
          this.log(`${j.nom} reste au Château d'If (essai ${j.toursPrison}/3).`);
          return;
        }
        this.log(`${j.nom} a raté son troisième essai : ${AMENDE_PRISON} € à payer pour sortir.`);
        this.payer(joueur, AMENDE_PRISON, this.destinationAmendes, 'sortie du Château d\'If');
        this.sortirDePrison(j, 'après trois essais');
      }
      // On ne rejoue pas après une sortie de prison.
      this.deplacer(joueur, d1 + d2);
      return;
    }

    if (double) {
      e.doubles++;
      if (e.doubles === 3) {
        this.log(`Trois doubles d'affilée ! ${j.nom} file au Château d'If.`);
        this.envoyerEnPrison(joueur);
        return;
      }
      e.peutRejouer = true;
    }
    this.deplacer(joueur, d1 + d2);
  }

  sortirDePrison(j, comment) {
    j.enPrison = false;
    j.toursPrison = 0;
    this.log(`${j.nom} quitte le Château d'If ${comment}.`);
  }

  envoyerEnPrison(joueurId) {
    const e = this.etat;
    const j = this.joueur(joueurId);
    const depart = j.position;
    j.position = CASE_PRISON;
    j.enPrison = true;
    j.toursPrison = 0;
    e.peutRejouer = false;
    e.doubles = 0;
    this.emettre({ type: 'teleportation', joueur: joueurId, de: depart, vers: CASE_PRISON });
    this.log(`${j.nom} part au Château d'If.`);
  }

  aPayerPrison({ joueur }) {
    const j = this.joueur(joueur);
    if (!j.enPrison) refuser("Ce joueur n'est pas en prison.");
    if (this.etat.aLance) refuser('Il faut payer avant de lancer les dés.');
    if (j.argent < AMENDE_PRISON) refuser(`Il faut ${AMENDE_PRISON} € pour sortir.`);
    this.payer(joueur, AMENDE_PRISON, this.destinationAmendes, 'sortie du Château d\'If');
    this.sortirDePrison(j, `en payant ${AMENDE_PRISON} €`);
  }

  aUtiliserCarteSortie({ joueur }) {
    const j = this.joueur(joueur);
    if (!j.enPrison) refuser("Ce joueur n'est pas en prison.");
    if (this.etat.aLance) refuser('Il faut utiliser la carte avant de lancer les dés.');
    if (!j.cartesSortie.length) refuser("Ce joueur n'a pas de carte « sortie de prison ».");
    this.rendreCarteSortie(j.cartesSortie.pop());
    this.sortirDePrison(j, 'avec une carte « sortie de prison »');
  }

  // Remet une carte « sortie de prison » sous sa pioche d'origine.
  rendreCarteSortie(pioche) {
    const id = this.cartes[pioche].find((c) => c.effet.type === 'sortie_prison').id;
    if (!this.etat.pioches[pioche].includes(id)) this.etat.pioches[pioche].push(id);
  }

  // Avance un joueur de `pas` cases (négatif pour reculer) puis applique la case d'arrivée.
  deplacer(joueurId, pas) {
    const j = this.joueur(joueurId);
    const depart = j.position;
    const chemin = [];
    const sens = Math.sign(pas);
    for (let k = 1; k <= Math.abs(pas); k++) chemin.push((((depart + k * sens) % 40) + 40) % 40);
    j.position = chemin.at(-1) ?? depart;
    this.emettre({ type: 'deplacement', joueur: joueurId, de: depart, chemin });
    if (sens > 0 && depart + pas >= 40) this.toucherSalaire(joueurId, j.position === 0);
    this.arriverSur(joueurId);
  }

  // Déplacement vers une case précise (cartes) : en avançant, sauf si `recul`.
  deplacerVers(joueurId, cible, recul = false) {
    const j = this.joueur(joueurId);
    if (recul) this.deplacer(joueurId, -((j.position - cible + 40) % 40));
    else this.deplacer(joueurId, (cible - j.position + 40) % 40 || 40);
  }

  toucherSalaire(joueurId, pileSurDepart) {
    const montant = pileSurDepart && this.etat.options.doubleDepart ? SALAIRE_DEPART * 2 : SALAIRE_DEPART;
    this.recevoir(joueurId, montant);
    this.log(`${this.joueur(joueurId).nom} passe par la case Départ et reçoit ${montant} €.`);
  }

  // Applique l'effet de la case où se trouve le joueur.
  arriverSur(joueurId) {
    const e = this.etat;
    const j = this.joueur(joueurId);
    const c = this.plateau.cases[j.position];
    switch (c.type) {
      case 'propriete':
      case 'gare':
      case 'compagnie': {
        const p = e.proprietes[c.index];
        if (p.proprietaire === null) {
          e.attente = { type: 'achat', joueur: joueurId, case: c.index };
          this.log(`${j.nom} arrive sur ${c.nom}, à vendre pour ${c.prix} €.`);
        } else if (p.proprietaire === joueurId) {
          this.log(`${j.nom} arrive sur sa propriété, ${c.nom}.`);
        } else if (p.hypotheque) {
          this.log(`${j.nom} arrive sur ${c.nom}, hypothéquée : pas de loyer.`);
        } else {
          const total = (e.des?.[0] ?? 0) + (e.des?.[1] ?? 0);
          const loyer = calculerLoyer(e, this.plateau, c.index, total);
          const proprio = this.joueur(p.proprietaire);
          this.log(`${j.nom} arrive sur ${c.nom} et doit ${loyer} € de loyer à ${proprio.nom}.`);
          this.payer(joueurId, loyer, proprio.id, `loyer de ${c.nom}`);
        }
        break;
      }
      case 'taxe':
        this.log(`${j.nom} tombe sur « ${c.nom} » : ${c.montant} € à payer.`);
        this.payer(joueurId, c.montant, this.destinationAmendes, c.nom);
        break;
      case 'chance':
      case 'communaute':
        this.tirerCarte(joueurId, c.type);
        break;
      case 'allez_prison':
        this.envoyerEnPrison(joueurId);
        break;
      case 'parc':
        if (e.options.parcGratuit && e.cagnotte > 0) {
          const gain = e.cagnotte;
          e.cagnotte = 0;
          this.recevoir(joueurId, gain);
          this.log(`${j.nom} se pose à la plage des Catalans et ramasse la cagnotte : ${gain} € !`);
        } else {
          this.log(`${j.nom} se repose à la plage des Catalans.`);
        }
        break;
      case 'prison':
        this.log(`${j.nom} est en simple visite au Château d'If.`);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Cartes
  // ---------------------------------------------------------------------------

  tirerCarte(joueurId, pioche) {
    const e = this.etat;
    const id = e.pioches[pioche].shift();
    const carte = this.cartesParId.get(id);
    if (carte.effet.type !== 'sortie_prison') e.pioches[pioche].push(id);
    e.derniereCarte = { pioche, id, joueur: joueurId };
    this.emettre({ type: 'carte', joueur: joueurId, pioche, carte });
    this.log(`${this.joueur(joueurId).nom} tire une carte ${pioche === 'chance' ? 'Chance' : 'Caisse de communauté'} : « ${carte.texte} »`);
    this.appliquerEffet(joueurId, carte.effet, pioche);
  }

  appliquerEffet(joueurId, effet, pioche) {
    const j = this.joueur(joueurId);
    switch (effet.type) {
      case 'aller_a':
        this.deplacerVers(joueurId, effet.case, !!effet.recul);
        break;
      case 'reculer':
        this.deplacer(joueurId, -effet.cases);
        break;
      case 'prison':
        this.envoyerEnPrison(joueurId);
        break;
      case 'sortie_prison':
        j.cartesSortie.push(pioche);
        break;
      case 'reparations': {
        const { maisons, hotels } = compterConstructions(this.etat, joueurId);
        const montant = maisons * effet.maison + hotels * effet.hotel;
        this.log(`${j.nom} a ${maisons} maison(s) et ${hotels} hôtel(s) : ${montant} € de réparations.`);
        this.payer(joueurId, montant, this.destinationAmendes, 'réparations');
        break;
      }
      case 'payer':
        this.payer(joueurId, effet.montant, this.destinationAmendes, 'carte');
        break;
      case 'recevoir':
        this.recevoir(joueurId, effet.montant);
        break;
      case 'anniversaire':
        for (const autre of this.joueursEnJeu()) {
          if (autre.id !== joueurId) this.payer(autre.id, effet.montant, joueurId, `anniversaire de ${j.nom}`);
        }
        break;
      case 'amende_ou_chance':
        this.etat.attente = { type: 'choix_amende', joueur: joueurId, montant: effet.montant };
        break;
      default:
        refuser(`Effet de carte inconnu : ${effet.type}`);
    }
  }

  aChoisirAmende({ joueur, choix }) {
    const a = this.etat.attente;
    if (a?.type !== 'choix_amende') refuser('Aucun choix en attente.');
    this.etat.attente = null;
    if (choix === 'chance') {
      this.log(`${this.joueur(joueur).nom} préfère tenter sa chance.`);
      this.tirerCarte(joueur, 'chance');
    } else {
      this.payer(joueur, a.montant, this.destinationAmendes, 'amende');
      this.log(`${this.joueur(joueur).nom} paie l'amende de ${a.montant} €.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Achat
  // ---------------------------------------------------------------------------

  aAcheter({ joueur }) {
    const a = this.etat.attente;
    if (a?.type !== 'achat') refuser('Aucun achat en attente.');
    const c = this.plateau.cases[a.case];
    const j = this.joueur(joueur);
    if (j.argent < c.prix) refuser(`Il faut ${c.prix} € pour acheter ${c.nom}.`);
    j.argent -= c.prix;
    this.etat.proprietes[c.index].proprietaire = joueur;
    this.etat.attente = null;
    this.emettre({ type: 'argent', joueur, montant: -c.prix });
    this.log(`${j.nom} achète ${c.nom} pour ${c.prix} €.`);
  }

  aRefuserAchat({ joueur }) {
    const a = this.etat.attente;
    if (a?.type !== 'achat') refuser('Aucun achat en attente.');
    this.etat.attente = null;
    this.log(`${this.joueur(joueur).nom} ne veut pas de ${this.nomCase(a.case)} : place aux enchères !`);
    this.etat.encheresEnAttente.unshift(a.case);
  }

  // ---------------------------------------------------------------------------
  // Enchères : chacun à son tour surenchérit ou passe ; celui qui passe est éliminé.
  // ---------------------------------------------------------------------------

  demarrerEnchere(index) {
    const e = this.etat;
    const n = e.joueurs.length;
    const participants = [];
    for (let k = 0; k < n; k++) {
      const j = e.joueurs[(e.courant + k) % n];
      if (!j.faillite) participants.push(j.id);
    }
    e.attente = { type: 'enchere', case: index, participants, actif: 0, mise: 0, meilleur: null };
    this.emettre({ type: 'enchere', case: index });
    this.log(`Enchères ouvertes pour ${this.nomCase(index)} (valeur ${this.plateau.cases[index].prix} €).`);
  }

  aEncherir({ joueur, montant }) {
    const a = this.etat.attente;
    if (a?.type !== 'enchere') refuser('Aucune enchère en cours.');
    if (!Number.isInteger(montant) || montant <= a.mise) refuser(`L'offre doit dépasser ${a.mise} €.`);
    if (montant > this.joueur(joueur).argent) refuser("Vous n'avez pas assez d'argent pour cette offre.");
    a.mise = montant;
    a.meilleur = joueur;
    this.log(`${this.joueur(joueur).nom} offre ${montant} €.`);
    a.actif = (a.actif + 1) % a.participants.length;
    this.verifierFinEnchere();
  }

  aPasserEnchere({ joueur }) {
    const a = this.etat.attente;
    if (a?.type !== 'enchere') refuser('Aucune enchère en cours.');
    a.participants.splice(a.actif, 1);
    if (a.actif >= a.participants.length) a.actif = 0;
    this.log(`${this.joueur(joueur).nom} passe.`);
    this.verifierFinEnchere();
  }

  verifierFinEnchere() {
    const e = this.etat;
    const a = e.attente;
    if (!a.participants.length) {
      e.attente = null;
      this.log(`Personne ne veut de ${this.nomCase(a.case)} : elle reste à la banque.`);
      return;
    }
    if (a.meilleur !== null && a.participants[a.actif] === a.meilleur) {
      e.attente = null;
      const j = this.joueur(a.meilleur);
      j.argent -= a.mise;
      e.proprietes[a.case].proprietaire = j.id;
      this.emettre({ type: 'argent', joueur: j.id, montant: -a.mise });
      this.log(`Adjugé ! ${j.nom} remporte ${this.nomCase(a.case)} pour ${a.mise} €.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Constructions et hypothèques
  // ---------------------------------------------------------------------------

  verifierGestion(joueur, index) {
    const e = this.etat;
    if (e.attente?.type === 'enchere' || e.echange) refuser('Impossible pendant une enchère ou un échange.');
    const c = this.plateau.cases[index];
    const p = e.proprietes[index];
    if (!c || !p) refuser('Case invalide.');
    if (p.proprietaire !== joueur) refuser('Cette propriété ne vous appartient pas.');
    return { c, p };
  }

  aConstruire({ joueur, case: index }) {
    const e = this.etat;
    const { c, p } = this.verifierGestion(joueur, index);
    if (c.type !== 'propriete') refuser('On ne construit que sur les terrains.');
    if (!possedeGroupe(e, this.plateau, joueur, c.groupe)) refuser('Il faut posséder tout le quartier pour construire.');
    const groupe = casesDuGroupe(this.plateau, c.groupe);
    if (groupe.some((i) => e.proprietes[i].hypotheque)) refuser('Une propriété du quartier est hypothéquée.');
    if (p.maisons >= HOTEL) refuser('Il y a déjà un hôtel.');
    if (p.maisons > Math.min(...groupe.map((i) => e.proprietes[i].maisons))) refuser('Construisez uniformément : les autres terrains du quartier d\'abord.');
    const hotel = p.maisons === 4;
    if (hotel && e.banque.hotels === 0) refuser('La banque n\'a plus d\'hôtel disponible.');
    if (!hotel && e.banque.maisons === 0) refuser('La banque n\'a plus de maison disponible.');
    const j = this.joueur(joueur);
    if (j.argent < c.prixMaison) refuser(`Il faut ${c.prixMaison} € pour construire.`);
    j.argent -= c.prixMaison;
    if (hotel) { e.banque.hotels--; e.banque.maisons += 4; } else e.banque.maisons--;
    p.maisons++;
    this.emettre({ type: 'argent', joueur, montant: -c.prixMaison });
    this.log(`${j.nom} construit ${hotel ? 'un hôtel' : 'une maison'} sur ${c.nom}.`);
  }

  aVendreConstruction({ joueur, case: index }) {
    const e = this.etat;
    const { c, p } = this.verifierGestion(joueur, index);
    if (!p.maisons) refuser('Aucune construction à vendre ici.');
    const groupe = casesDuGroupe(this.plateau, c.groupe);
    if (p.maisons < Math.max(...groupe.map((i) => e.proprietes[i].maisons))) refuser('Vendez uniformément : les terrains les plus construits d\'abord.');
    const nom = this.joueur(joueur).nom;
    if (p.maisons === HOTEL && e.banque.maisons < 4) {
      // Pénurie de maisons : l'hôtel est revendu avec ses 4 maisons, le terrain redevient nu.
      e.banque.hotels++;
      p.maisons = 0;
      this.recevoir(joueur, (HOTEL * c.prixMaison) / 2);
      this.log(`Pénurie de maisons : ${nom} revend l'hôtel de ${c.nom} et tout ce qu'il contient pour ${(HOTEL * c.prixMaison) / 2} €.`);
      return;
    }
    const hotel = p.maisons === HOTEL;
    if (hotel) {
      e.banque.maisons -= 4;
      e.banque.hotels++;
    } else {
      e.banque.maisons++;
    }
    p.maisons--;
    this.recevoir(joueur, c.prixMaison / 2);
    this.log(`${nom} revend ${hotel ? 'un hôtel' : 'une maison'} de ${c.nom} pour ${c.prixMaison / 2} €.`);
  }

  aHypothequer({ joueur, case: index }) {
    const e = this.etat;
    const { c, p } = this.verifierGestion(joueur, index);
    if (p.hypotheque) refuser('Déjà hypothéquée.');
    if (c.type === 'propriete' && casesDuGroupe(this.plateau, c.groupe).some((i) => e.proprietes[i].maisons)) {
      refuser('Vendez d\'abord les constructions du quartier.');
    }
    p.hypotheque = true;
    this.recevoir(joueur, c.hypotheque);
    this.log(`${this.joueur(joueur).nom} hypothèque ${c.nom} et reçoit ${c.hypotheque} €.`);
  }

  aLeverHypotheque({ joueur, case: index }) {
    const { c, p } = this.verifierGestion(joueur, index);
    if (!p.hypotheque) refuser("Cette propriété n'est pas hypothéquée.");
    const cout = coutLevee(c);
    const j = this.joueur(joueur);
    if (j.argent < cout) refuser(`Il faut ${cout} € pour lever l'hypothèque.`);
    j.argent -= cout;
    p.hypotheque = false;
    this.emettre({ type: 'argent', joueur, montant: -cout });
    this.log(`${j.nom} lève l'hypothèque de ${c.nom} pour ${cout} €.`);
  }

  // ---------------------------------------------------------------------------
  // Échanges
  // offre : { a, donne: { proprietes, argent, cartes }, recoit: { proprietes, argent, cartes } }
  // ---------------------------------------------------------------------------

  aProposerEchange({ joueur, offre }) {
    const e = this.etat;
    if (e.attente?.type === 'enchere' || e.echange) refuser('Un échange ou une enchère est déjà en cours.');
    const cible = e.joueurs[offre?.a];
    if (!cible || cible.faillite || cible.id === joueur) refuser("Choisissez un autre joueur pour l'échange.");
    const normaliser = (cote) => ({
      proprietes: [...new Set(cote?.proprietes ?? [])].map(Number),
      argent: cote?.argent ?? 0,
      cartes: cote?.cartes ?? 0
    });
    const donne = normaliser(offre.donne);
    const recoit = normaliser(offre.recoit);
    this.verifierCoteEchange(joueur, donne);
    this.verifierCoteEchange(cible.id, recoit);
    const vide = (x) => !x.proprietes.length && !x.argent && !x.cartes;
    if (vide(donne) && vide(recoit)) refuser("L'échange est vide.");
    e.echange = { de: joueur, a: cible.id, donne, recoit };
    e.echangesProposes++;
    this.log(`${this.joueur(joueur).nom} propose un échange à ${cible.nom}.`);
  }

  verifierCoteEchange(id, cote) {
    const e = this.etat;
    const j = this.joueur(id);
    for (const i of cote.proprietes) {
      if (e.proprietes[i]?.proprietaire !== id) refuser(`${this.plateau.cases[i]?.nom ?? 'Cette case'} n'appartient pas à ${j.nom}.`);
      if (casesSoeurs(this.plateau, i).some((k) => e.proprietes[k].maisons)) refuser(`Vendez d'abord les constructions du quartier de ${this.nomCase(i)}.`);
    }
    if (!Number.isInteger(cote.argent) || cote.argent < 0 || cote.argent > j.argent) refuser(`${j.nom} ne dispose pas de cette somme.`);
    if (!Number.isInteger(cote.cartes) || cote.cartes < 0 || cote.cartes > j.cartesSortie.length) refuser(`${j.nom} n'a pas ces cartes.`);
  }

  aRepondreEchange({ joueur, accepter }) {
    const e = this.etat;
    const ech = e.echange;
    if (!ech) refuser('Aucun échange en attente.');
    e.echange = null;
    const de = this.joueur(ech.de);
    const a = this.joueur(joueur);
    if (!accepter) {
      this.log(`${a.nom} refuse l'échange proposé par ${de.nom}.`);
      return;
    }
    const transferer = (source, cible, cote) => {
      for (const i of cote.proprietes) e.proprietes[i].proprietaire = cible.id;
      source.argent -= cote.argent;
      cible.argent += cote.argent;
      for (let k = 0; k < cote.cartes; k++) cible.cartesSortie.push(source.cartesSortie.pop());
    };
    transferer(de, a, ech.donne);
    transferer(a, de, ech.recoit);
    this.log(`${a.nom} accepte l'échange avec ${de.nom}. Tope là !`);
  }

  // ---------------------------------------------------------------------------
  // Faillite
  // ---------------------------------------------------------------------------

  aDeclarerFaillite({ joueur }) {
    const d = this.etat.dettes[0];
    if (!d || d.debiteur !== joueur) refuser('Aucune dette à régler.');
    if (valeurLiquidable(this.etat, this.plateau, joueur) >= d.montant) {
      refuser('Vous pouvez encore payer en vendant des constructions ou en hypothéquant.');
    }
    this.faillite(joueur, d.creancier);
  }

  // Met un joueur en faillite : ses biens vont au créancier (joueur), ou à la banque qui les remet aux enchères.
  faillite(id, creancier) {
    const e = this.etat;
    const j = this.joueur(id);
    // Les constructions sont revendues à la banque à moitié prix.
    for (const i of proprietesDe(e, id)) {
      const p = e.proprietes[i];
      if (!p.maisons) continue;
      if (p.maisons === HOTEL) e.banque.hotels++;
      else e.banque.maisons += p.maisons;
      j.argent += (p.maisons * this.plateau.cases[i].prixMaison) / 2;
      p.maisons = 0;
    }
    const heritier = typeof creancier === 'number' && !this.joueur(creancier).faillite ? this.joueur(creancier) : null;
    if (heritier) {
      heritier.argent += j.argent;
      for (const i of proprietesDe(e, id)) e.proprietes[i].proprietaire = heritier.id;
      heritier.cartesSortie.push(...j.cartesSortie);
      this.log(`💥 ${j.nom} fait faillite ! Ses biens reviennent à ${heritier.nom}.`);
    } else {
      if (creancier === 'cagnotte') e.cagnotte += j.argent;
      for (const i of proprietesDe(e, id)) {
        Object.assign(e.proprietes[i], { proprietaire: null, hypotheque: false, maisons: 0 });
        e.encheresEnAttente.push(i);
      }
      for (const pioche of j.cartesSortie) this.rendreCarteSortie(pioche);
      this.log(`💥 ${j.nom} fait faillite ! Ses propriétés reviennent à la banque et seront mises aux enchères.`);
    }
    Object.assign(j, { argent: 0, cartesSortie: [], faillite: true, enPrison: false });
    e.dettes = e.dettes
      .filter((d) => d.debiteur !== id)
      .map((d) => (d.creancier === id ? { ...d, creancier: 'banque' } : d));
    if (e.echange && (e.echange.de === id || e.echange.a === id)) e.echange = null;
    if (e.attente && e.attente.joueur === id) e.attente = null;
    this.emettre({ type: 'faillite', joueur: id });
  }

  // ---------------------------------------------------------------------------
  // Dettes
  // ---------------------------------------------------------------------------

  aPayerDette({ joueur }) {
    const d = this.etat.dettes[0];
    const j = this.joueur(joueur);
    if (j.argent < d.montant) refuser(`Il manque ${d.montant - j.argent} € pour régler cette dette.`);
    this.etat.dettes.shift();
    j.argent -= d.montant;
    this.crediter(d.creancier, d.montant);
    this.emettre({ type: 'argent', joueur, montant: -d.montant });
    this.log(`${j.nom} règle sa dette de ${d.montant} € (${d.motif}).`);
  }

  // ---------------------------------------------------------------------------
  // Fin de tour
  // ---------------------------------------------------------------------------

  aFinirTour() {
    const e = this.etat;
    if (e.attente || e.dettes.length || e.echange) refuser('Une décision est en attente.');
    if (!e.aLance) refuser("Il faut d'abord lancer les dés.");
    if (e.peutRejouer) refuser('Vous avez fait un double : relancez les dés !');
    this.joueurSuivant();
  }

  joueurSuivant() {
    const e = this.etat;
    const n = e.joueurs.length;
    let suivant = e.courant;
    do {
      suivant = (suivant + 1) % n;
      if (suivant === 0) e.tour++;
    } while (e.joueurs[suivant].faillite);
    if (e.options.partieRapide && e.tour > e.options.toursMax) {
      this.terminerAuPatrimoine();
      return;
    }
    e.courant = suivant;
    e.des = null;
    e.doubles = 0;
    e.aLance = false;
    e.peutRejouer = false;
    e.echangesProposes = 0;
    this.emettre({ type: 'tour', joueur: suivant });
  }
}

// Correspondance type d'action → méthode.
const ACTIONS = {
  lancer: 'aLancer',
  payerPrison: 'aPayerPrison',
  utiliserCarteSortie: 'aUtiliserCarteSortie',
  choisirAmende: 'aChoisirAmende',
  acheter: 'aAcheter',
  refuserAchat: 'aRefuserAchat',
  payerDette: 'aPayerDette',
  declarerFaillite: 'aDeclarerFaillite',
  encherir: 'aEncherir',
  passerEnchere: 'aPasserEnchere',
  construire: 'aConstruire',
  vendreConstruction: 'aVendreConstruction',
  hypothequer: 'aHypothequer',
  leverHypotheque: 'aLeverHypotheque',
  proposerEchange: 'aProposerEchange',
  repondreEchange: 'aRepondreEchange',
  finirTour: 'aFinirTour'
};
