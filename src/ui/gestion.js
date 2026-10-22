// Interface de la gestion avancée : constructions, hypothèques, enchères, échanges, faillite.
// Ces méthodes complètent le Controleur.
import { Controleur } from './controleur.js';
import { el, euros, texteSur } from './utilitaires.js';
import { ouvrirModale, fermerModale, modaleEstOuverte } from './modale.js';
import { ficheCase } from './fiche.js';
import {
  proprietesDe, casesSoeurs, possedeGroupe, coutLevee, valeurLiquidable, HOTEL
} from '../moteur/regles.js';

// Pastille « couleur + nom du quartier » (la couleur n'est jamais seule).
function pastille(c, plateau) {
  if (c.type !== 'propriete') return el('span', { class: 'puce-groupe puce-neutre' }, c.type === 'gare' ? 'Gare' : 'Compagnie');
  const g = plateau.groupes[c.groupe];
  return el('span', { class: 'puce-groupe', style: { background: g.couleur, color: texteSur(g.couleur) } }, g.nomCourt);
}

const niveau = (p) => (p.maisons === HOTEL ? '1 hôtel' : p.maisons ? `${p.maisons} maison${p.maisons > 1 ? 's' : ''}` : '—');

Object.assign(Controleur.prototype, {
  boutonsGestion(possibles) {
    const id = this.partie.joueurActif();
    const aDesBiens = proprietesDe(this.partie.etat, id).length > 0;
    const liste = [];
    if (possibles.includes('construire') && aDesBiens) {
      liste.push(el('button', { type: 'button', class: 'btn', onclick: () => this.ouvrirGestion('construction') }, '🏠 Construire / vendre'));
      liste.push(el('button', { type: 'button', class: 'btn', onclick: () => this.ouvrirGestion('hypotheque') }, '🏦 Hypothèques'));
    }
    if (possibles.includes('proposerEchange')) {
      liste.push(el('button', { type: 'button', class: 'btn', onclick: () => this.ouvrirEchange() }, '🤝 Proposer un échange'));
    }
    return liste;
  },

  libelleRefusAchat() {
    return 'Ne pas acheter';
  },

  // Les actions de gestion ne relancent pas la modale de décision : la fenêtre de gestion se rouvre.
  async agirGestion(action, mode) {
    fermerModale();
    await this.agir(action);
    if (!modaleEstOuverte()) this.ouvrirGestion(mode);
  },

  async ouvrirGestion(mode) {
    const { etat, plateau } = this.partie;
    const id = this.partie.joueurActif();
    const j = etat.joueurs[id];
    const lignes = [];
    for (const i of proprietesDe(etat, id)) {
      const c = plateau.cases[i];
      const p = etat.proprietes[i];
      const actions = [];
      const bouton = (libelle, action, aide) => actions.push(el('button', {
        type: 'button', class: 'btn btn-petit', title: aide, 'aria-label': `${libelle} — ${c.nom}`,
        onclick: () => this.agirGestion({ ...action, case: i }, mode)
      }, libelle));
      if (mode === 'construction') {
        if (c.type !== 'propriete' || !possedeGroupe(etat, plateau, id, c.groupe)) continue;
        if (p.maisons < HOTEL) bouton(p.maisons === 4 ? `+ Hôtel (${euros(c.prixMaison)})` : `+ Maison (${euros(c.prixMaison)})`, { type: 'construire' });
        if (p.maisons > 0) bouton(`− Vendre (${euros(c.prixMaison / 2)})`, { type: 'vendreConstruction' });
      } else if (p.hypotheque) {
        bouton(`Lever (${euros(coutLevee(c))})`, { type: 'leverHypotheque' });
      } else {
        bouton(`Hypothéquer (+${euros(c.hypotheque)})`, { type: 'hypothequer' });
      }
      lignes.push(el('tr', {},
        el('td', {}, pastille(c, plateau)),
        el('th', { scope: 'row' }, c.nom),
        el('td', {}, mode === 'construction' ? niveau(p) : p.hypotheque ? 'Hypothéquée' : 'Libre'),
        el('td', { class: 'cellule-actions' }, actions)));
    }
    const intro = mode === 'construction'
      ? `Construisez uniformément sur les quartiers complets. Stock de la banque : ${etat.banque.maisons} maison(s), ${etat.banque.hotels} hôtel(s).`
      : 'Hypothéquer rapporte la moitié du prix ; la levée coûte cette somme + 10 %. Il faut d\'abord vendre les constructions du quartier.';
    const dette = etat.dettes[0];
    const choix = await ouvrirModale({
      titre: `${mode === 'construction' ? 'Constructions' : 'Hypothèques'} — ${j.nom} (${euros(j.argent)})`,
      classe: 'modale-large',
      fermable: true,
      contenu: el('div', {},
        el('p', {}, intro),
        dette ? el('p', { class: 'alerte' }, `Dette à régler : ${euros(dette.montant)} (${dette.motif}).`) : null,
        lignes.length
          ? el('table', { class: 'table-gestion' }, el('tbody', {}, lignes))
          : el('p', { class: 'vide' }, mode === 'construction' ? 'Aucun quartier complet pour l\'instant.' : 'Aucune propriété.')),
      boutons: [
        dette ? { libelle: `Payer la dette (${euros(dette.montant)})`, valeur: 'payerDette', principal: true, desactive: j.argent < dette.montant } : null,
        { libelle: mode === 'construction' ? 'Voir les hypothèques' : 'Voir les constructions', valeur: 'basculer' },
        { libelle: 'Fermer', valeur: null, principal: !dette }
      ].filter(Boolean)
    });
    if (choix === 'basculer') this.ouvrirGestion(mode === 'construction' ? 'hypotheque' : 'construction');
    else if (choix === 'payerDette') this.agir({ type: 'payerDette' });
    else if (choix === null && (etat.attente || etat.dettes.length)) this.demanderDecision();
  },

  // ---------------------------------------------------------------------------
  // Enchères
  // ---------------------------------------------------------------------------

  async demanderDecisionAvancee() {
    const { etat } = this.partie;
    if (etat.attente?.type === 'enchere') return this.demanderEnchere();
    if (etat.echange) return this.demanderReponseEchange();
  },

  async demanderEnchere() {
    const { etat, plateau } = this.partie;
    const a = etat.attente;
    const j = etat.joueurs[this.partie.joueurActif()];
    const c = plateau.cases[a.case];
    const minimum = a.mise + 1;
    const peut = j.argent >= minimum;
    const champ = el('input', {
      type: 'number', min: minimum, max: j.argent, step: 1, value: Math.min(j.argent, Math.max(minimum, a.mise + 10)),
      id: 'montant-enchere', inputmode: 'numeric', disabled: !peut, autofocus: peut
    });
    const ajuster = (delta) => { champ.value = Math.min(j.argent, Math.max(minimum, Number(champ.value || 0) + delta)); };
    const meilleur = a.meilleur === null ? 'aucune offre' : `${euros(a.mise)} par ${etat.joueurs[a.meilleur].nom}`;
    const choix = await ouvrirModale({
      titre: `Enchères : ${c.nom}`,
      contenu: el('div', {},
        ficheCase(c, etat, plateau),
        el('p', { class: 'enchere-etat' }, `Meilleure offre : ${meilleur}. Encore en lice : ${a.participants.map((id) => etat.joueurs[id].nom).join(', ')}.`),
        el('p', {}, el('strong', {}, `${j.nom}`), `, à vous ! Vous avez ${euros(j.argent)}.`),
        peut ? el('div', { class: 'enchere-saisie' },
          el('label', { for: 'montant-enchere' }, 'Votre offre (€) '), champ,
          ...[1, 10, 50, 100].map((d) => el('button', { type: 'button', class: 'btn btn-petit', onclick: () => ajuster(d) }, `+${d}`)))
          : el('p', {}, 'Vous n\'avez pas assez d\'argent pour surenchérir.')),
      boutons: [
        { libelle: 'Enchérir', valeur: () => ({ type: 'encherir', montant: Math.floor(Number(champ.value)) }), principal: true, desactive: !peut },
        { libelle: 'Passer', valeur: { type: 'passerEnchere' } }
      ]
    });
    if (choix) {
      const reussi = await this.agir(choix);
      if (!reussi) this.demanderEnchere();
    }
  },

  // ---------------------------------------------------------------------------
  // Échanges
  // ---------------------------------------------------------------------------

  async ouvrirEchange(cibleInitiale) {
    const { etat, plateau } = this.partie;
    const id = this.partie.joueurActif();
    const moi = etat.joueurs[id];
    const autres = etat.joueurs.filter((x) => !x.faillite && x.id !== id);
    let cible = etat.joueurs[cibleInitiale ?? autres[0].id];

    const echangeables = (joueurId) => proprietesDe(etat, joueurId)
      .filter((i) => !casesSoeurs(plateau, i).some((k) => etat.proprietes[k].maisons));

    const colonne = (joueur, prefixe) => {
      const cases = echangeables(joueur.id).map((i) => {
        const c = plateau.cases[i];
        return el('label', { class: 'option-echange' },
          el('input', { type: 'checkbox', name: `${prefixe}-prop`, value: i }),
          pastille(c, plateau), ` ${c.nom}${etat.proprietes[i].hypotheque ? ' (hyp.)' : ''}`);
      });
      return el('fieldset', { class: 'colonne-echange' },
        el('legend', {}, prefixe === 'donne' ? `${joueur.nom} donne` : `${joueur.nom} donne en retour`),
        cases.length ? cases : el('p', { class: 'vide' }, 'Aucune propriété échangeable.'),
        el('label', {}, `Argent (max ${euros(joueur.argent)}) `,
          el('input', { type: 'number', name: `${prefixe}-argent`, min: 0, max: joueur.argent, step: 1, value: 0, inputmode: 'numeric' })),
        joueur.cartesSortie.length
          ? el('label', {}, 'Cartes « sortie de prison » ', el('input', { type: 'number', name: `${prefixe}-cartes`, min: 0, max: joueur.cartesSortie.length, value: 0 }))
          : null);
    };

    const formulaire = el('form', { class: 'formulaire-echange', onsubmit: (ev) => ev.preventDefault() });
    const dessiner = () => {
      const selection = el('select', { id: 'cible-echange', onchange: (ev) => { cible = etat.joueurs[Number(ev.target.value)]; dessiner(); } },
        autres.map((x) => el('option', { value: x.id, selected: x.id === cible.id }, x.nom)));
      formulaire.replaceChildren(
        el('p', {}, el('label', { for: 'cible-echange' }, 'Échanger avec : '), selection),
        el('div', { class: 'colonnes-echange' }, colonne(moi, 'donne'), colonne(cible, 'recoit')),
        el('p', { class: 'aide' }, 'Les terrains d\'un quartier bâti ne peuvent pas être échangés. Les propriétés hypothéquées restent hypothéquées.'));
    };
    dessiner();

    const lire = (prefixe) => ({
      proprietes: [...formulaire.querySelectorAll(`input[name="${prefixe}-prop"]:checked`)].map((x) => Number(x.value)),
      argent: Math.floor(Number(formulaire.elements[`${prefixe}-argent`]?.value || 0)),
      cartes: Math.floor(Number(formulaire.elements[`${prefixe}-cartes`]?.value || 0))
    });
    const offre = await ouvrirModale({
      titre: `Proposer un échange — ${moi.nom}`,
      classe: 'modale-large',
      fermable: true,
      contenu: formulaire,
      boutons: [
        { libelle: 'Proposer', valeur: () => ({ a: cible.id, donne: lire('donne'), recoit: lire('recoit') }), principal: true },
        { libelle: 'Annuler', valeur: null }
      ]
    });
    if (offre) {
      const reussi = await this.agir({ type: 'proposerEchange', offre });
      if (!reussi) this.ouvrirEchange(offre.a);
    }
  },

  // Description lisible d'un côté d'échange.
  decrireCote(cote, joueur) {
    const { plateau } = this.partie;
    const morceaux = cote.proprietes.map((i) => plateau.cases[i].nom);
    if (cote.argent) morceaux.push(euros(cote.argent));
    if (cote.cartes) morceaux.push(`${cote.cartes} carte(s) « sortie de prison »`);
    return el('li', {}, el('strong', {}, `${joueur.nom} donne : `), morceaux.length ? morceaux.join(', ') : 'rien');
  },

  async demanderReponseEchange() {
    const { etat } = this.partie;
    const ech = etat.echange;
    const de = etat.joueurs[ech.de];
    const a = etat.joueurs[ech.a];
    const choix = await ouvrirModale({
      titre: `${a.nom}, ${de.nom} vous propose un échange`,
      contenu: el('div', {},
        el('ul', { class: 'resume-echange' }, this.decrireCote(ech.donne, de), this.decrireCote(ech.recoit, a)),
        el('p', { class: 'aide' }, 'Cliquez sur une case du plateau après coup pour consulter les fiches.')),
      boutons: [
        { libelle: 'Accepter', valeur: 'oui', principal: true },
        { libelle: 'Refuser', valeur: 'non' }
      ]
    });
    if (choix) this.agir({ type: 'repondreEchange', accepter: choix === 'oui' });
  },

  // ---------------------------------------------------------------------------
  // Faillite
  // ---------------------------------------------------------------------------

  boutonsFaillite() {
    const { etat, plateau } = this.partie;
    const d = etat.dettes[0];
    const possible = valeurLiquidable(etat, plateau, d.debiteur) < d.montant;
    return [{
      libelle: 'Déclarer faillite', valeur: 'declarerFaillite', classe: 'btn-danger', desactive: !possible,
      aide: possible ? undefined : 'Vous pouvez encore payer en vendant ou en hypothéquant.'
    }];
  },

  async confirmerFaillite() {
    const { etat } = this.partie;
    const d = etat.dettes[0];
    const creancier = typeof d.creancier === 'number' ? etat.joueurs[d.creancier].nom : 'la banque';
    const ok = await ouvrirModale({
      titre: 'Déclarer faillite ?',
      contenu: `Tous vos biens iront à ${creancier}. Vous quitterez la partie. Peuchère, c'est dur !`,
      boutons: [{ libelle: 'Je fais faillite', valeur: true, classe: 'btn-danger' }, { libelle: 'Revenir', valeur: false, principal: true }]
    });
    if (ok) this.agir({ type: 'declarerFaillite' });
    else this.demanderDette();
  }
});

