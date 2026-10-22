// Panneaux des joueurs : argent, propriétés par quartier, constructions, hypothèques, cartes.
import { el, euros, texteSur } from './utilitaires.js';
import { svgPion, COULEURS_JOUEURS, pionParId } from './pions.js';
import { proprietesDe, HOTEL } from '../moteur/regles.js';

export function rendrePanneaux(racine, partie, { surClicCase }) {
  const { etat, plateau } = partie;
  const actif = partie.joueurActif();
  racine.replaceChildren(...etat.joueurs.map((j) => {
    const proprietes = proprietesDe(etat, j.id);
    // Regroupement par quartier / gares / compagnies, dans l'ordre du plateau.
    const groupes = new Map();
    for (const i of proprietes) {
      const c = plateau.cases[i];
      const cle = c.type === 'propriete' ? c.groupe : c.type;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(c);
    }
    const listes = [...groupes.entries()].map(([cle, cases]) => {
      const g = plateau.groupes[cle];
      const libelle = g ? g.nom : cle === 'gare' ? 'Gares' : 'Compagnies';
      const couleur = g ? g.couleur : '#5f6b73';
      return el('li', { class: 'groupe-joueur' },
        el('span', { class: 'puce-groupe', style: { background: couleur, color: texteSur(couleur) } }, libelle),
        el('ul', {}, cases.map((c) => {
          const p = etat.proprietes[c.index];
          const details = [];
          if (p.maisons === HOTEL) details.push('🏨 hôtel');
          else if (p.maisons) details.push(`🏠 × ${p.maisons}`);
          if (p.hypotheque) details.push('hypothéquée');
          return el('li', {},
            el('button', { type: 'button', class: `lien-case ${p.hypotheque ? 'hypothequee' : ''}`, onclick: () => surClicCase(c.index) }, c.nom),
            details.length ? el('span', { class: 'details' }, ` (${details.join(', ')})`) : null);
        })));
    });
    const statut = [];
    if (j.faillite) statut.push('En faillite');
    else if (j.enPrison) statut.push("Aux Baumettes");
    if (j.ia) statut.push('Ordinateur');
    return el('section', {
      class: `panneau-joueur ${j.id === etat.courant ? 'courant' : ''} ${j.id === actif ? 'actif' : ''} ${j.faillite ? 'faillite' : ''}`,
      style: { borderColor: COULEURS_JOUEURS[j.id] },
      'aria-label': `Joueur ${j.nom}`
    },
      el('header', {},
        el('span', { class: 'avatar', style: { borderColor: COULEURS_JOUEURS[j.id] }, html: svgPion(j.pion, 32), title: pionParId(j.pion).nom }),
        el('span', { class: 'nom-joueur' }, j.nom),
        el('span', { class: 'argent' }, euros(j.argent))),
      statut.length ? el('p', { class: 'statut' }, statut.join(' · ')) : null,
      j.cartesSortie.length ? el('p', { class: 'cartes-speciales' }, `🎟️ ${j.cartesSortie.length} carte(s) « sortie des Baumettes »`) : null,
      listes.length ? el('ul', { class: 'proprietes-joueur' }, listes) : el('p', { class: 'vide' }, 'Aucune propriété'));
  }));
}
