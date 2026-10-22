// Rendu du plateau : 40 cases en grille 11 × 11, centre (logo, pioches, dés, journal) et pions.
import { el, texteSur, euros } from './utilitaires.js';
import { svgPion, COULEURS_JOUEURS } from './pions.js';
import { HOTEL } from '../moteur/regles.js';

const ICONES = {
  depart: '⟵', chance: '?', communaute: '⚓', taxe: '💶', gare: '🚆', prison: '🏰',
  parc: '🏖️', allez_prison: '⛵', eau: '💧', electricite: '⚡'
};

// Position (ligne, colonne) dans la grille 11 × 11 et côté du plateau.
function placement(index) {
  if (index <= 10) return { ligne: 11, colonne: 11 - index, cote: 'bas' };
  if (index <= 20) return { ligne: 11 - (index - 10), colonne: 1, cote: 'gauche' };
  if (index <= 30) return { ligne: 1, colonne: 1 + (index - 20), cote: 'haut' };
  return { ligne: 1 + (index - 30), colonne: 11, cote: 'droite' };
}

function icone(c) {
  if (c.type === 'compagnie') return c.nom.includes('Eaux') ? ICONES.eau : ICONES.electricite;
  return ICONES[c.type] ?? '';
}

export function etiquetteCase(c, plateau) {
  if (c.type === 'propriete') return `${c.nom}, quartier ${plateau.groupes[c.groupe].nom}, ${euros(c.prix)}`;
  if (c.prix) return `${c.nom}, ${euros(c.prix)}`;
  return c.nom;
}

export class VuePlateau {
  constructor(racine, plateau, { surClicCase }) {
    this.plateau = plateau;
    this.cases = [];
    this.racine = racine;
    racine.replaceChildren();

    for (const c of plateau.cases) {
      const { ligne, colonne, cote } = placement(c.index);
      const coin = c.index % 10 === 0;
      const noeud = el('button', {
        type: 'button',
        class: `case case-${c.type} cote-${cote} ${coin ? 'coin' : ''}`,
        style: { gridRow: ligne, gridColumn: colonne },
        'aria-label': etiquetteCase(c, plateau),
        'data-index': c.index,
        onclick: () => surClicCase(c.index)
      });
      if (c.type === 'propriete') {
        const g = plateau.groupes[c.groupe];
        noeud.append(el('span', { class: 'bandeau', style: { background: g.couleur, color: texteSur(g.couleur) } },
          el('span', { class: 'bandeau-nom' }, g.nomCourt),
          el('span', { class: 'constructions' })));
      }
      const contenu = el('span', { class: 'contenu' });
      if (c.type !== 'propriete') contenu.append(el('span', { class: `icone ${coin ? 'icone-coin' : ''}`, 'aria-hidden': 'true' }, icone(c)));
      contenu.append(el('span', { class: 'nom' }, c.type === 'prison' ? "Château d'If" : c.nom));
      if (c.prix) contenu.append(el('span', { class: 'prix' }, euros(c.prix)));
      if (c.montant) contenu.append(el('span', { class: 'prix' }, `Payez ${euros(c.montant)}`));
      if (c.type === 'prison') contenu.append(el('span', { class: 'prix' }, 'Simple visite'));
      noeud.append(contenu);
      if (c.prix) noeud.append(el('span', { class: 'marque-proprietaire', 'aria-hidden': 'true', hidden: true }));
      noeud.append(el('span', { class: 'pions' }));
      this.cases.push(noeud);
      racine.append(noeud);
    }

    this.centre = el('div', { class: 'centre' },
      el('div', { class: 'logo', 'aria-hidden': 'true' },
        el('span', { class: 'logo-soleil' }),
        el('span', { class: 'logo-titre' }, 'Monopoly'),
        el('span', { class: 'logo-ville' }, 'Marseille'),
        el('span', { class: 'logo-vagues' }, '〰〰〰')),
      el('div', { class: 'pioches' },
        el('div', { class: 'pioche pioche-chance' }, el('span', { class: 'pioche-icone', 'aria-hidden': 'true' }, '?'), 'Chance'),
        el('div', { class: 'pioche pioche-communaute' }, el('span', { class: 'pioche-icone', 'aria-hidden': 'true' }, '⚓'), 'Caisse de communauté')),
      this.zoneDes = el('div', { class: 'zone-des', 'aria-live': 'polite' }),
      this.cagnotte = el('div', { class: 'cagnotte', hidden: true }),
      el('section', { class: 'journal', 'aria-label': 'Journal de la partie' },
        el('h2', {}, 'Journal'),
        this.journal = el('ol', { class: 'journal-liste' })));
    racine.append(this.centre);
  }

  // Met à jour propriétaires, constructions et hypothèques.
  majProprietes(etat) {
    for (const [index, p] of Object.entries(etat.proprietes)) {
      const noeud = this.cases[index];
      const marque = noeud.querySelector('.marque-proprietaire');
      const proprio = p.proprietaire === null ? null : etat.joueurs[p.proprietaire];
      marque.hidden = !proprio;
      if (proprio) marque.style.background = COULEURS_JOUEURS[proprio.id];
      marque.title = proprio ? `Propriété de ${proprio.nom}` : '';
      noeud.classList.toggle('hypothequee', p.hypotheque);
      const cons = noeud.querySelector('.constructions');
      if (cons) cons.textContent = p.maisons === HOTEL ? '🏨' : '🏠'.repeat(p.maisons);
      const c = this.plateau.cases[index];
      let etiquette = etiquetteCase(c, this.plateau);
      if (proprio) etiquette += `, propriété de ${proprio.nom}`;
      if (p.maisons === HOTEL) etiquette += ', avec un hôtel';
      else if (p.maisons) etiquette += `, ${p.maisons} maison(s)`;
      if (p.hypotheque) etiquette += ', hypothéquée';
      noeud.setAttribute('aria-label', etiquette);
    }
  }

  // Place les pions ; `positions` permet d'imposer une position d'affichage (animations).
  majPions(etat, positions = {}) {
    for (const noeud of this.cases) noeud.querySelector('.pions').replaceChildren();
    for (const j of etat.joueurs) {
      if (j.faillite) continue;
      const pos = positions[j.id] ?? j.position;
      const pion = el('span', {
        class: `pion ${j.id === etat.courant ? 'pion-actif' : ''} ${j.enPrison ? 'pion-prison' : ''}`,
        style: { borderColor: COULEURS_JOUEURS[j.id] },
        title: j.nom,
        html: svgPion(j.pion)
      });
      this.cases[pos].querySelector('.pions').append(pion);
    }
  }

  majCagnotte(etat) {
    this.cagnotte.hidden = !etat.options.parcGratuit;
    this.cagnotte.textContent = `Cagnotte du Parc gratuit : ${euros(etat.cagnotte)}`;
  }

  majJournal(lignes) {
    const derniers = lignes.slice(-60);
    this.journal.replaceChildren(...derniers.map((l) => el('li', {}, l)));
    this.journal.scrollTop = this.journal.scrollHeight;
  }

  surbrillance(index) {
    this.cases.forEach((n, i) => n.classList.toggle('surbrillance', i === index));
  }
}
