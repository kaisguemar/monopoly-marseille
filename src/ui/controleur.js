// Contrôleur de l'interface : relie le moteur (Partie) à l'affichage.
// Chaque action passe par `agir()`, qui exécute l'action dans le moteur,
// rejoue les événements produits (dés, déplacements, cartes) puis redessine.
import { el, euros, attendre } from './utilitaires.js';
import { VuePlateau } from './plateau.js';
import { animerDes, afficherDes } from './des.js';
import { rendrePanneaux } from './panneaux.js';
import { ficheCase } from './fiche.js';
import { ouvrirModale, fermerModale, modaleEstOuverte } from './modale.js';
import { AMENDE_PRISON } from '../moteur/regles.js';

const DUREE_PAS = 140;
const ACTIONS_GESTION = ['construire', 'vendreConstruction', 'hypothequer', 'leverHypotheque'];

export class Controleur {
  constructor(partie, racine, { surQuitter } = {}) {
    this.partie = partie;
    this.plateau = partie.plateau;
    this.occupe = false;
    this.positions = {};
    this.surQuitter = surQuitter;
    this.construireDom(racine);
    this.vue = new VuePlateau(this.elPlateau, this.plateau, { surClicCase: (i) => this.montrerFiche(i) });
    afficherDes(this.vue.zoneDes, partie.etat.des);
    this.rafraichir();
  }

  construireDom(racine) {
    racine.replaceChildren(
      el('div', { class: 'jeu' },
        el('div', { class: 'plateau-conteneur' }, this.elPlateau = el('div', { class: 'plateau' })),
        el('aside', { class: 'barre-laterale' },
          el('section', { class: 'commandes', 'aria-label': 'Actions du tour' },
            this.elTour = el('p', { class: 'tour-info', 'aria-live': 'polite' }),
            this.elActions = el('div', { class: 'actions' })),
          this.elPanneaux = el('div', { class: 'panneaux' }))),
      this.elNotif = el('div', { class: 'notification', role: 'status', 'aria-live': 'polite' }));
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
    rendrePanneaux(this.elPanneaux, this.partie, { surClicCase: (i) => this.montrerFiche(i) });
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
    if (actif !== null && !this.occupe && !etat.joueurs[actif].ia) {
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
    if (this.surQuitter) {
      boutons.push(el('button', { type: 'button', class: 'btn btn-discret', onclick: () => this.quitter() }, 'Abandonner la partie'));
    }
    this.elActions.replaceChildren(...boutons);
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
    await this.jouerEvenements(this.partie.extraireEvenements());
    this.positions = {};
    this.occupe = false;
    this.rafraichir();
    this.apresAction(action);
    return true;
  }

  async jouerEvenements(evenements) {
    const { etat } = this.partie;
    // Le journal se dévoile au rythme des animations.
    let lignesVisibles = Math.max(0, etat.journal.length - evenements.filter((e) => e.type === 'journal').length);
    for (const ev of evenements) {
      switch (ev.type) {
        case 'des':
          await animerDes(this.vue.zoneDes, ev.des);
          break;
        case 'deplacement':
          for (const pos of ev.chemin) {
            this.positions[ev.joueur] = pos;
            this.vue.majPions(etat, this.positions);
            await attendre(DUREE_PAS);
          }
          break;
        case 'teleportation':
          await attendre(250);
          this.positions[ev.joueur] = ev.vers;
          this.vue.majPions(etat, this.positions);
          await attendre(250);
          break;
        case 'carte':
          await this.montrerCarte(ev);
          break;
        case 'faillite':
          this.notifier(`${etat.joueurs[ev.joueur].nom} fait faillite !`);
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
    if (this.partie.etat.joueurs[ev.joueur].ia) {
      const promesse = ouvrirModale({ titre, contenu, boutons: [{ libelle: 'OK', valeur: true, principal: true }] });
      await Promise.race([promesse, attendre(this.delaiIA ? this.delaiIA * 3 : 1800)]);
      if (modaleEstOuverte()) fermerModale();
    } else {
      await ouvrirModale({ titre, contenu, boutons: [{ libelle: 'Compris !', valeur: true, principal: true }] });
    }
  }

  // Après chaque action : fin de partie, décision à demander, ou tour de l'ordinateur.
  apresAction(action) {
    const { etat } = this.partie;
    if (etat.terminee) {
      this.finDePartie();
      return;
    }
    const actif = this.partie.joueurActif();
    if (etat.joueurs[actif].ia) {
      this.jouerOrdinateur?.();
      return;
    }
    // Après une action de gestion, c'est la fenêtre de gestion qui se rouvre.
    if (ACTIONS_GESTION.includes(action?.type)) return;
    if (etat.attente || etat.dettes.length || etat.echange) this.demanderDecision();
  }

  // Ouvre la modale correspondant à la décision en attente pour le joueur humain actif.
  async demanderDecision() {
    const { etat, plateau } = this.partie;
    const actif = this.partie.joueurActif();
    const j = etat.joueurs[actif];
    if (j.ia || this.occupe) return;
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
      contenu: el('p', { class: 'victoire' }, gagnant ? `🏆 ${gagnant.nom} remporte la partie !` : 'La partie est terminée.'),
      boutons: [{ libelle: 'Retour à l\'accueil', valeur: true, principal: true }]
    });
    this.surQuitter?.(true);
  }

  async quitter() {
    const ok = await ouvrirModale({
      titre: 'Abandonner la partie ?',
      contenu: 'La partie en cours et sa sauvegarde seront effacées.',
      fermable: true,
      boutons: [{ libelle: 'Abandonner', valeur: true, classe: 'btn-danger' }, { libelle: 'Continuer à jouer', valeur: false, principal: true }]
    });
    if (ok) this.surQuitter?.(true);
  }
}
