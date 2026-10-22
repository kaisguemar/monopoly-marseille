// Contrôleur de l'interface : relie le moteur (Partie) à l'affichage.
// Chaque action passe par `agir()`, qui exécute l'action dans le moteur,
// rejoue les événements produits (dés, déplacements, cartes) puis redessine.
//
// En ligne (option `reseau`), le serveur fait autorité : `agir()` lui envoie l'action,
// et chaque mise à jour reçue (`recevoirMessage()`) remplace l'état local puis est animée.
// Seul le joueur de cet écran (`moi`) peut alors agir.
import { el, euros, attendre, appliquerTheme } from './utilitaires.js';
import { VuePlateau } from './plateau.js';
import { animerDes, afficherDes } from './des.js';
import { creerScene } from './vue3d.js';
import { rendreTable } from './joueurs3d.js';
import { rendrePanneaux } from './panneaux.js';
import { ficheCase } from './fiche.js';
import { ouvrirModale, fermerModale, modaleEstOuverte } from './modale.js';
import { AMENDE_PRISON } from '../moteur/regles.js';
import { Partie } from '../moteur/partie.js';
import { REGLES_PASTIS, AVERTISSEMENT_PASTIS, libelleBoisson, listeNoms, plusGrosBuveur } from '../moteur/pastis.js';

const DUREE_PAS = 140;
const ACTIONS_GESTION = ['construire', 'vendreConstruction', 'hypothequer', 'leverHypotheque'];

export class Controleur {
  constructor(partie, racine, { surQuitter, surFinDeTour, facteurAnimation = 1, reseau = null } = {}) {
    this.partie = partie;
    this.plateau = partie.plateau;
    this.occupe = false;
    this.positions = {};
    this.surQuitter = surQuitter;
    this.surFinDeTour = surFinDeTour;
    this.facteur = facteurAnimation;
    // Mode en ligne : { client, moi, salon, version }.
    this.reseau = reseau;
    this.moi = reseau?.moi ?? null;
    this.salon = reseau?.salon ?? null;
    this.version = reseau?.version ?? 0;
    this.connexion = 'connecte';
    this.fileMessages = Promise.resolve();
    this.attentesVersion = [];
    this.envoi = false;
    this.pastis = !!partie.etat.options.pastis;
    appliquerTheme(this.pastis);
    this.construireDom(racine);
    this.vue = new VuePlateau(this.elPlateau, this.plateau, { surClicCase: (i) => this.montrerFiche(i), pastis: this.pastis });
    afficherDes(this.vue.zoneDes, partie.etat.des);
    this.rafraichir();
    // Laisse le temps aux extensions (ordinateur, sauvegarde) d'être prêtes.
    setTimeout(() => this.apresAction(), 0);
  }

  construireDom(racine) {
    racine.replaceChildren(
      el('div', { class: 'jeu' },
        this.elConteneur = el('div', { class: 'plateau-conteneur' },
          // Bulle « Untel boit 2 gorgées » du mode Pastis, fermée par le bouton « Santé ! ».
          this.elBoisson = el('div', { class: 'bulle-boisson', role: 'alertdialog', 'aria-labelledby': 'texte-boisson', hidden: true })),
        this.elBarre = el('aside', { class: 'barre-laterale' },
          el('section', { class: 'commandes', 'aria-label': 'Actions du tour' },
            this.elConnexion = el('p', { class: 'alerte bandeau-connexion', role: 'status', hidden: true }),
            this.reseau ? el('p', { class: 'info-salon' }, `Partie en ligne — salon ${this.salon.code}`) : null,
            this.elTour = el('p', { class: 'tour-info', 'aria-live': 'polite' }),
            this.elActions = el('div', { class: 'actions' })),
          this.elPanneaux = el('div', { class: 'panneaux' }))),
      this.elNotif = el('div', { class: 'notification', role: 'status', 'aria-live': 'polite' }),
      // Annonce des événements du journal pour les lecteurs d'écran.
      this.elAnnonce = el('div', { class: 'visuellement-cache', 'aria-live': 'polite' }));
    // Scène (vue à plat ou en 3D avec son décor et ses joueurs) qui accueille le plateau.
    const { plateau, bouton, table, etiquettes, camera3d } = creerScene(this.elConteneur, { panneau: this.elBarre });
    this.elPlateau = plateau;
    this.scene3d = { table, etiquettes, camera3d };
    // En entrant en vue 3D, les joueurs s'installent autour du plateau.
    camera3d.surBascule = (actif) => { if (actif && this.vue) this.rafraichir(); };
    this.elTour.after(bouton);
  }

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  rafraichir() {
    const { etat } = this.partie;
    this.vue.majProprietes(etat);
    this.vue.majPions(etat, this.positions);
    this.vue.majCagnotte(etat);
    this.vue.majJournal(etat.journal);
    const options = {
      surClicCase: (i) => this.montrerFiche(i),
      moi: this.moi,
      salon: this.salon,
      surRemplacer: (id) => this.remplacerParIA(id)
    };
    rendrePanneaux(this.elPanneaux, this.partie, options);
    // En vue 3D, les mêmes informations sont autour du plateau : jetons, cartes, verres, étiquettes.
    const { table, etiquettes, camera3d } = this.scene3d;
    if (camera3d.actif) {
      rendreTable(table, etiquettes, this.partie, { ...options, surClicJoueur: (angle) => camera3d.tournerVers(angle) });
      camera3d.rendre();
    }
    this.rendreActions();
  }

  rendreActions() {
    const { etat } = this.partie;
    const actif = this.partie.joueurActif();
    const courant = etat.joueurs[etat.courant];
    this.elTour.textContent = etat.terminee
      ? 'Partie terminée'
      : `Tour ${etat.tour}${etat.options.partieRapide ? ` / ${etat.options.toursMax}` : ''} — au tour de ${courant.nom}`;
    const boutons = [];
    if (actif !== null && etat.joueurs[actif].ia) {
      boutons.push(el('p', { class: 'reflexion' }, `🤖 ${etat.joueurs[actif].nom} réfléchit…`));
    } else if (actif !== null && !this.estLocal(actif)) {
      const absent = this.salon && !this.salon.places[actif]?.connecte;
      boutons.push(el('p', { class: 'reflexion' }, `⏳ En attente de ${etat.joueurs[actif].nom}…${absent ? ' (déconnecté, en attente de son retour)' : ''}`));
    }
    if (actif !== null && !this.occupe && !this.envoi && this.estLocal(actif)) {
      const possibles = this.partie.actionsPossibles();
      const bouton = (libelle, action, principal = false) => boutons.push(el('button', {
        type: 'button', class: `btn ${principal ? 'btn-principal' : ''}`, onclick: action
      }, libelle));
      if (possibles.includes('lancer')) bouton(etat.peutRejouer ? '🎲 Relancer (double !)' : '🎲 Lancer les dés', () => this.agir({ type: 'lancer' }), true);
      if (possibles.includes('payerPrison')) bouton(`Payer ${AMENDE_PRISON} € pour sortir`, () => this.agir({ type: 'payerPrison' }));
      if (possibles.includes('utiliserCarteSortie')) bouton('Utiliser la carte « sortie »', () => this.agir({ type: 'utiliserCarteSortie' }));
      if (possibles.includes('finirTour')) bouton('Finir le tour ➜', () => this.agir({ type: 'finirTour' }), true);
      if (etat.attente || etat.dettes.length || etat.echange) bouton('Voir la décision en attente', () => this.demanderDecision());
      for (const b of this.boutonsGestion(possibles)) boutons.push(b);
    }
    if (this.pastis) {
      boutons.push(el('button', { type: 'button', class: 'btn btn-discret', onclick: () => this.montrerReglesPastis() }, '🥃 Règles du mode Pastis'));
    }
    if (this.surQuitter) {
      boutons.push(el('button', { type: 'button', class: 'btn btn-discret', onclick: () => this.quitter() }, this.reseau ? 'Quitter la partie en ligne' : 'Abandonner la partie'));
    }
    this.elActions.replaceChildren(...boutons);
    // Navigation au clavier : le bouton principal reçoit le focus quand c'est à un humain de jouer.
    const principal = this.elActions.querySelector('.btn-principal');
    if (principal && !modaleEstOuverte() && (document.activeElement === document.body || !document.contains(document.activeElement))) {
      principal.focus({ preventScroll: true });
    }
  }

  // Le joueur `id` est-il contrôlé depuis cet écran ?
  estLocal(id) {
    if (this.reseau) return id === this.moi;
    return !this.partie.etat.joueurs[id].ia;
  }

  // Boutons de gestion des biens (complétés par la phase « gestion avancée »).
  boutonsGestion() {
    return [];
  }

  notifier(message) {
    this.elNotif.textContent = message;
    this.elNotif.classList.add('visible');
    clearTimeout(this.minuteurNotif);
    this.minuteurNotif = setTimeout(() => this.elNotif.classList.remove('visible'), 3500);
  }

  montrerFiche(index) {
    const c = this.plateau.cases[index];
    this.vue.surbrillance(index);
    ouvrirModale({ titre: c.nom, contenu: ficheCase(c, this.partie.etat, this.plateau), fermable: true, boutons: [{ libelle: 'Fermer', valeur: null, principal: true }] })
      .then(() => this.vue.surbrillance(-1));
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // Exécute une action pour le joueur actif et rejoue ses effets.
  async agir(action) {
    if (this.reseau) return this.agirEnLigne(action);
    if (this.occupe) return false;
    this.occupe = true;
    const joueur = action.joueur ?? this.partie.joueurActif();
    const avant = Object.fromEntries(this.partie.etat.joueurs.map((j) => [j.id, j.position]));
    const resultat = this.partie.executer({ ...action, joueur });
    if (!resultat.ok) {
      this.occupe = false;
      this.notifier(resultat.erreur);
      this.rafraichir();
      return false;
    }
    this.positions = avant;
    this.rendreActions();
    const evenements = this.partie.extraireEvenements();
    await this.jouerEvenements(evenements);
    this.annoncer(evenements);
    if (evenements.some((e) => e.type === 'tour')) this.surFinDeTour?.();
    this.positions = {};
    this.occupe = false;
    this.rafraichir();
    this.apresAction(action);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mode en ligne
  // ---------------------------------------------------------------------------

  async agirEnLigne(action) {
    if (this.occupe || this.envoi) return false;
    this.envoi = true;
    this.rendreActions();
    const resultat = await this.reseau.client.envoyerAction(action);
    this.envoi = false;
    // La mise à jour du serveur arrive parfois avant la réponse à la requête :
    // on redessine les boutons, masqués pendant l'envoi.
    if (!this.occupe) this.rendreActions();
    if (!resultat.ok) {
      this.notifier(resultat.erreur);
      return false;
    }
    // L'action est validée : on attend que sa mise à jour soit reçue et animée.
    await this.attendreVersion(resultat.version);
    return true;
  }

  attendreVersion(version) {
    if (this.version >= version) return Promise.resolve();
    return new Promise((resoudre) => {
      const attente = { version, resoudre };
      this.attentesVersion.push(attente);
      // Filet de sécurité : la reconnexion du flux renverra de toute façon l'état complet.
      setTimeout(() => {
        this.attentesVersion = this.attentesVersion.filter((a) => a !== attente);
        resoudre();
      }, 8000);
    });
  }

  // Les messages du serveur sont traités un par un, au rythme des animations.
  recevoirMessage(message) {
    this.fileMessages = this.fileMessages
      .then(() => this.traiterMessage(message))
      .catch((err) => console.error('Mise à jour impossible :', err));
  }

  async traiterMessage(m) {
    if (this.arrete || (m.version <= this.version && m.changement !== 'initial')) return;
    this.salon = m.salon;
    this.moi = m.moi;
    const avant = Object.fromEntries(this.partie.etat.joueurs.map((j) => [j.id, j.position]));
    this.partie = new Partie({ plateau: this.plateau, cartes: this.partie.cartes }, m.etat);
    this.version = m.version;
    if (m.changement === 'partie' && m.evenements.length) {
      this.positions = avant;
      this.occupe = true;
      this.rendreActions();
      await this.jouerEvenements(m.evenements);
      this.annoncer(m.evenements);
      this.positions = {};
      this.occupe = false;
    }
    if (m.changement === 'initial') afficherDes(this.vue.zoneDes, m.etat.des);
    this.rafraichir();
    const prets = this.attentesVersion.filter((a) => a.version <= this.version);
    this.attentesVersion = this.attentesVersion.filter((a) => a.version > this.version);
    prets.forEach((a) => a.resoudre());
    if (m.changement !== 'presence' && m.changement !== 'salon') this.apresAction(m.action);
  }

  // État de la connexion au serveur : 'connecte', 'reconnexion', 'introuvable' ou 'refuse'.
  async etatConnexion(etat) {
    this.connexion = etat;
    this.elConnexion.hidden = etat === 'connecte';
    this.elConnexion.textContent = 'Connexion au serveur perdue… reconnexion en cours. Votre place vous attend.';
    if (etat === 'introuvable' || etat === 'refuse') {
      this.arreter();
      await ouvrirModale({
        titre: 'Partie indisponible',
        contenu: etat === 'introuvable' ? 'Cette partie n\'existe plus sur le serveur.' : 'Votre place dans cette partie n\'existe plus.',
        boutons: [{ libelle: 'Retour à l\'accueil', valeur: true, principal: true }]
      });
      this.surQuitter?.(true);
    }
  }

  async remplacerParIA(id) {
    try {
      await this.reseau.client.envoyer('remplacer', { place: id });
    } catch (err) {
      this.notifier(err.message);
    }
  }

  annoncer(evenements) {
    const lignes = evenements.filter((e) => e.type === 'journal').map((e) => e.message);
    if (lignes.length) this.elAnnonce.textContent = lignes.slice(-3).join(' ');
  }

  async jouerEvenements(evenements) {
    const { etat } = this.partie;
    // Le journal se dévoile au rythme des animations.
    let lignesVisibles = Math.max(0, etat.journal.length - evenements.filter((e) => e.type === 'journal').length);
    for (const ev of evenements) {
      switch (ev.type) {
        case 'des':
          await animerDes(this.vue.zoneDes, ev.des, 1100 * this.facteur);
          break;
        case 'deplacement':
          for (const pos of ev.chemin) {
            this.positions[ev.joueur] = pos;
            this.vue.majPions(etat, this.positions);
            await attendre(DUREE_PAS * this.facteur);
          }
          break;
        case 'teleportation':
          await attendre(250 * this.facteur);
          this.positions[ev.joueur] = ev.vers;
          this.vue.majPions(etat, this.positions);
          await attendre(250 * this.facteur);
          break;
        case 'carte':
          await this.montrerCarte(ev);
          break;
        case 'faillite':
          this.notifier(`${etat.joueurs[ev.joueur].nom} fait faillite !`);
          break;
        case 'boire':
          await this.montrerBoisson(ev);
          break;
        case 'journal':
          this.vue.majJournal(etat.journal.slice(0, ++lignesVisibles));
          break;
        default:
          break;
      }
    }
  }

  async montrerCarte(ev) {
    const titre = ev.pioche === 'chance' ? 'Chance' : 'Caisse de communauté';
    const contenu = el('div', { class: `carte-tiree carte-${ev.pioche}` },
      el('p', { class: 'carte-joueur' }, `${this.partie.etat.joueurs[ev.joueur].nom} tire une carte :`),
      el('p', { class: 'carte-texte' }, ev.carte.texte));
    if (!this.estLocal(ev.joueur)) {
      const promesse = ouvrirModale({ titre, contenu, boutons: [{ libelle: 'OK', valeur: true, principal: true }] });
      await Promise.race([promesse, attendre(2200 * this.facteur)]);
      if (modaleEstOuverte()) fermerModale();
    } else {
      await ouvrirModale({ titre, contenu, boutons: [{ libelle: 'Compris !', valeur: true, principal: true }] });
    }
  }

  // Mode Pastis : bulle au-dessus du plateau, qui reste affichée jusqu'au clic sur « Santé ! »
  // (ou Entrée / Échap). La partie reprend ensuite.
  montrerBoisson(ev) {
    const noms = ev.joueurs.map((id) => this.partie.etat.joueurs[id].nom);
    const verbe = noms.length > 1 ? 'boivent' : 'boit';
    const texte = `${listeNoms(noms)} ${verbe} ${libelleBoisson(ev)} !`;
    const focusAvant = document.activeElement;
    return new Promise((resoudre) => {
      const fermer = () => {
        document.removeEventListener('keydown', surTouche);
        this.elBoisson.hidden = true;
        this.elBoisson.replaceChildren();
        if (focusAvant && document.contains(focusAvant)) focusAvant.focus({ preventScroll: true });
        resoudre();
      };
      const surTouche = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          fermer();
        }
      };
      const bouton = el('button', { type: 'button', class: 'btn btn-sante', onclick: fermer }, ev.culSec ? 'Cul sec ! 🥃' : 'Santé ! 🥃');
      this.elBoisson.className = `bulle-boisson ${ev.culSec ? 'cul-sec' : ''}`;
      this.elBoisson.replaceChildren(
        el('span', { class: 'verre', 'aria-hidden': 'true' }, ev.culSec ? '🥃💥' : '🥃'),
        el('strong', { id: 'texte-boisson' }, texte),
        el('small', {}, ev.raison),
        bouton);
      this.elBoisson.hidden = false;
      document.addEventListener('keydown', surTouche);
      bouton.focus({ preventScroll: true });
    });
  }

  montrerReglesPastis() {
    ouvrirModale({
      titre: '🥃 Règles du mode Pastis',
      contenu: el('div', {}, el('ul', { class: 'liste-regles' }, REGLES_PASTIS.map((r) => el('li', {}, r))), el('p', { class: 'avertissement' }, AVERTISSEMENT_PASTIS)),
      fermable: true,
      boutons: [{ libelle: 'Santé !', valeur: null, principal: true }]
    });
  }

  // Après chaque action : fin de partie, décision à demander, ou tour de l'ordinateur.
  apresAction(action) {
    const { etat } = this.partie;
    if (etat.terminee) {
      this.finDePartie();
      return;
    }
    const actif = this.partie.joueurActif();
    if (!this.reseau && etat.joueurs[actif].ia) {
      this.jouerOrdinateur?.();
      return;
    }
    if (!this.estLocal(actif)) return;
    // Après une action de gestion, c'est la fenêtre de gestion qui se rouvre.
    if (ACTIONS_GESTION.includes(action?.type) && (!this.reseau || action.joueur === this.moi)) return;
    if (etat.attente || etat.dettes.length || etat.echange) this.demanderDecision();
  }

  // Ouvre la modale correspondant à la décision en attente pour le joueur humain actif.
  async demanderDecision() {
    const { etat, plateau } = this.partie;
    const actif = this.partie.joueurActif();
    const j = etat.joueurs[actif];
    if (!this.estLocal(actif) || this.occupe) return;
    const a = etat.attente;
    if (etat.dettes.length) return this.demanderDette();
    if (a?.type === 'achat') {
      const c = plateau.cases[a.case];
      const choix = await ouvrirModale({
        titre: `${j.nom}, acheter ${c.nom} ?`,
        contenu: el('div', {}, ficheCase(c, etat, plateau), el('p', {}, `Vous avez ${euros(j.argent)}.`)),
        boutons: [
          { libelle: `Acheter pour ${euros(c.prix)}`, valeur: 'acheter', principal: true, desactive: j.argent < c.prix },
          { libelle: this.libelleRefusAchat(), valeur: 'refuserAchat' },
          { libelle: 'Gérer mes biens d\'abord', valeur: null }
        ]
      });
      if (choix) this.agir({ type: choix });
      return;
    }
    if (a?.type === 'choix_amende') {
      const choix = await ouvrirModale({
        titre: 'Amende ou Chance ?',
        contenu: `${j.nom}, payez ${euros(a.montant)} d'amende ou tentez votre chance avec une carte Chance.`,
        boutons: [
          { libelle: `Payer ${euros(a.montant)}`, valeur: 'payer', principal: true },
          { libelle: 'Tirer une carte Chance', valeur: 'chance' }
        ]
      });
      if (choix) this.agir({ type: 'choisirAmende', choix });
      return;
    }
    return this.demanderDecisionAvancee?.();
  }

  libelleRefusAchat() {
    return 'Ne pas acheter';
  }

  async demanderDette() {
    const { etat } = this.partie;
    const d = etat.dettes[0];
    const j = etat.joueurs[d.debiteur];
    const choix = await ouvrirModale({
      titre: `${j.nom} doit ${euros(d.montant)}`,
      contenu: el('div', {},
        el('p', {}, `Motif : ${d.motif}. Vous avez ${euros(j.argent)}.`),
        j.argent < d.montant ? el('p', {}, 'Vendez des constructions, hypothéquez ou échangez des biens pour réunir la somme.') : null),
      boutons: [
        { libelle: `Payer ${euros(d.montant)}`, valeur: 'payerDette', principal: true, desactive: j.argent < d.montant },
        { libelle: 'Gérer mes biens', valeur: null },
        ...this.boutonsFaillite()
      ]
    });
    if (choix === 'declarerFaillite') this.confirmerFaillite();
    else if (choix) this.agir({ type: choix });
  }

  boutonsFaillite() {
    return [];
  }

  async finDePartie() {
    const { etat } = this.partie;
    const gagnant = etat.gagnant === null ? null : etat.joueurs[etat.gagnant];
    await ouvrirModale({
      titre: 'Fin de partie',
      contenu: el('div', {},
        el('p', { class: 'victoire' }, gagnant ? `🏆 ${gagnant.nom} remporte la partie !` : 'La partie est terminée.'),
        this.pastis && plusGrosBuveur(etat) ? el('p', {}, `🥃 Plus grosse descente : ${plusGrosBuveur(etat).nom}, avec ${plusGrosBuveur(etat).gorgees} gorgées.`) : null),
      boutons: [{ libelle: 'Retour à l\'accueil', valeur: true, principal: true }]
    });
    this.arreter?.();
    this.surQuitter?.(true);
  }

  async quitter() {
    const ok = await ouvrirModale({
      titre: this.reseau ? 'Quitter la partie en ligne ?' : 'Abandonner la partie ?',
      contenu: this.reseau
        ? 'L\'ordinateur prendra définitivement votre place. (Si vous fermez simplement la page, vous pourrez revenir.)'
        : 'La partie en cours et sa sauvegarde seront effacées.',
      fermable: true,
      boutons: [{ libelle: 'Abandonner', valeur: true, classe: 'btn-danger' }, { libelle: 'Continuer à jouer', valeur: false, principal: true }]
    });
    if (ok) {
      if (this.reseau) await this.reseau.client.envoyer('quitter').catch(() => {});
      this.arreter?.();
      this.surQuitter?.(true);
    }
  }
}
