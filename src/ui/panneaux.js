// Panneaux des joueurs : argent, propriétés par quartier, constructions, hypothèques, cartes.
import { el, euros, texteSur } from './utilitaires.js';
import { svgPion, COULEURS_JOUEURS, pionParId } from './pions.js';
import { proprietesDe, HOTEL } from '../moteur/regles.js';

// En ligne, `salon` donne la présence de chaque joueur et `moi` la place de cet écran.
export function rendrePanneaux(racine, partie, { surClicCase, moi = null, salon = null, surRemplacer }) {
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
      const libelle = g ? g.nom : cle === 'gare' ? 'Stations de métro' : 'Compagnies';
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
    const place = salon?.places[j.id];
    if (j.faillite) statut.push('En faillite');
    else if (j.enPrison) statut.push('Aux Baumettes');
    if (place?.abandon) statut.push('A quitté la partie (ordinateur)');
    else if (place?.remplaceParIA) statut.push("Déconnecté — l'ordinateur joue à sa place");
    else if (j.ia) statut.push('Ordinateur');
    else if (place && !place.connecte) statut.push('🔌 Déconnecté');
    const peutRemplacer = place && !j.ia && !place.connecte && !j.faillite && !partie.etat.terminee && surRemplacer;
    return el('section', {
      class: `panneau-joueur ${j.id === etat.courant ? 'courant' : ''} ${j.id === actif ? 'actif' : ''} ${j.faillite ? 'faillite' : ''}`,
      style: { borderColor: COULEURS_JOUEURS[j.id] },
      'aria-label': `Joueur ${j.nom}`
    },
      el('header', {},
        el('span', { class: 'avatar', style: { borderColor: COULEURS_JOUEURS[j.id] }, html: svgPion(j.pion, 32), title: pionParId(j.pion).nom }),
        el('span', { class: 'nom-joueur' }, j.nom, j.id === moi ? el('small', {}, ' (vous)') : null),
        el('span', { class: 'argent' }, euros(j.argent))),
      statut.length ? el('p', { class: 'statut' }, statut.join(' · ')) : null,
      peutRemplacer ? el('button', { type: 'button', class: 'btn btn-petit', onclick: () => surRemplacer(j.id) }, "🤖 Faire jouer l'ordinateur à sa place") : null,
      j.cartesSortie.length ? el('p', { class: 'cartes-speciales' }, `🎟️ ${j.cartesSortie.length} carte(s) « sortie des Baumettes »`) : null,
      listes.length ? el('ul', { class: 'proprietes-joueur' }, listes) : el('p', { class: 'vide' }, 'Aucune propriété'));
  }));
}
