// Joueurs de la vue 3D, assis autour du plateau. Sur le tapis de chacun : ses jetons de casino
// (son argent), ses cartes de propriété et, en mode Pastis, les verres qu'il a bus. Une étiquette
// accrochée à sa place, toujours lisible, donne son nom, son argent exact et son statut.
// La disposition (places, piles, verres, colonnes de cartes) est calculée par table3d.js.
import { el, euros, texteSur } from './utilitaires.js';
import { svgPion, COULEURS_JOUEURS } from './pions.js';
import { proprietesDe } from '../moteur/regles.js';
import { placesTable, jetons, dispositionObjets, colonnesCartes, abscissesColonnes, CARTE } from './table3d.js';

// Longueur en largeurs de plateau → unités de la table (100cqi = la largeur du plateau).
const cqi = (x) => `${(x * 100).toFixed(2)}cqi`;

// Rend (ou met à jour) la table. `table` est posée sur le ponton, dans la scène 3D du décor ;
// `etiquettes` est par-dessus la vue. Seules les parties qui ont changé sont redessinées.
// Renvoie les places des joueurs (voir placesTable).
export function rendreTable(table, etiquettes, partie, options = {}) {
  const { etat, plateau } = partie;
  const { moi = null, salon = null } = options;
  // Chaque joueur a deux éléments, sur deux calques : son tapis, à plat avec ses cartes, et ce qui
  // s'y tient debout (jetons, verres), peint après tous les tapis.
  const calqueTapis = table.querySelector('.tapis-joueurs');
  const calqueObjets = table.querySelector('.objets-joueurs');
  const places = placesTable(etat.joueurs.length, moi ?? 0);
  const actif = partie.joueurActif();
  for (const place of places) {
    const j = etat.joueurs[place.joueur];
    const tapis = trouver(calqueTapis, 'tapis', j.id, () => el('div', { class: 'tapis', 'data-joueur': j.id, role: 'group' }));
    const objets = trouver(calqueObjets, 'objets-joueur', j.id, () => el('div', { class: 'objets-joueur', 'data-joueur': j.id },
      el('div', { class: 'jetons-joueur' }),
      el('div', { class: 'verres-joueur' })));
    tapis.style.setProperty('--couleur', COULEURS_JOUEURS[j.id]);
    tapis.setAttribute('aria-label', `Propriétés de ${j.nom}`);
    tapis.classList.toggle('actif', j.id === actif);
    tapis.classList.toggle('courant', j.id === etat.courant && !etat.terminee);
    tapis.classList.toggle('faillite', j.faillite);
    majPlace(tapis, place);
    majPlace(objets, place);
    majCartes(tapis, place, j, etat, plateau, options);
    majObjets(objets, place, j.argent, etat.options.pastis ? j : null);
    majEtiquette(trouver(etiquettes, 'etiquette-joueur', j.id, () => el('div', { class: 'etiquette-joueur', 'data-joueur': j.id })),
      place, j, partie, { actif, salon, ...options });
  }
  // Joueurs en trop (nouvelle partie avec moins de joueurs) : on retire leurs éléments.
  for (const conteneur of [calqueTapis, calqueObjets, etiquettes]) {
    for (const enfant of [...conteneur.children]) if (Number(enfant.dataset.joueur) >= etat.joueurs.length) enfant.remove();
  }
  return places;
}

function trouver(conteneur, classe, id, creer) {
  let element = conteneur.querySelector(`.${classe}[data-joueur="${id}"]`);
  if (!element) {
    element = creer();
    conteneur.append(element);
  }
  return element;
}

// Ne redessine une partie de la zone que si sa clé a changé.
function changement(element, nom, cle) {
  if (element.dataset[nom] === cle) return false;
  element.dataset[nom] = cle;
  return true;
}

// Le tapis (ou ce qui est posé dessus) est centré sur le plateau, tourné vers sa place, puis écarté
// jusqu'à elle, et glissé le long de son côté s'il le partage.
function majPlace(element, place) {
  if (!changement(element, 'place', `${place.angle}|${place.distance}|${place.decalage}|${place.largeur}`)) return;
  // L'angle sert aussi à la caméra : ce qui est debout sur le tapis compense sa rotation.
  element.dataset.angle = String(place.angle);
  Object.assign(element.style, {
    width: cqi(place.largeur),
    height: cqi(place.profondeur),
    marginLeft: cqi(-place.largeur / 2),
    marginTop: cqi(-place.profondeur / 2),
    transform: `rotateZ(${place.angle}deg) translate(${cqi(place.decalage)}, ${cqi(place.distance)})`
  });
}

// Cartes posées sur le tapis du joueur, une colonne par quartier, chacune recouvrant en partie la
// précédente ; hypothéquées, elles sont retournées.
function majCartes(tapis, place, j, etat, plateau, { surClicCase }) {
  const indices = proprietesDe(etat, j.id);
  const cle = `${place.largeur}|${indices.map((i) => `${i}${etat.proprietes[i].hypotheque ? 'h' : ''}`).join(',')}|${j.cartesSortie.join(',')}`;
  if (!changement(tapis, 'cartes', cle)) return;
  const colonnes = colonnesCartes(indices, plateau);
  if (j.cartesSortie.length) colonnes.push({ cle: 'sortie', sorties: j.cartesSortie });
  const abscisses = abscissesColonnes(colonnes.length, place.largeur);
  const cartes = [];
  colonnes.forEach((colonne, k) => {
    const elements = colonne.sorties
      ? colonne.sorties.map((pioche) => carteSortie(pioche))
      : colonne.cases.map((index) => carteTitre(plateau.cases[index], plateau, etat.proprietes[index].hypotheque, j.nom, surClicCase));
    elements.forEach((carte, rang) => {
      Object.assign(carte.style, {
        left: cqi(abscisses[k]),
        top: cqi(0.016 + rang * CARTE.decalage),
        width: cqi(CARTE.largeur),
        height: cqi(CARTE.hauteur)
      });
      cartes.push(carte);
    });
  });
  tapis.replaceChildren(...cartes);
}

function carteTitre(c, plateau, hypothequee, proprietaire, surClicCase) {
  const groupe = plateau.groupes[c.groupe];
  const couleur = groupe?.couleur ?? (c.type === 'gare' ? '#2f3a44' : '#6d5d4b');
  const icone = c.type === 'gare' ? '🚇' : c.type === 'compagnie' ? (c.description === 'Restaurant' ? '🍕' : '🍹') : '';
  const carte = el('button', {
    type: 'button',
    class: `carte-3d ${hypothequee ? 'hypothequee' : ''}`,
    'aria-label': `${c.nom}, propriété de ${proprietaire}${hypothequee ? ', hypothéquée' : ''}`,
    onclick: () => surClicCase?.(c.index)
  },
    el('span', { class: 'carte-bande', 'aria-hidden': 'true' }, icone || el('small', {}, 'Titre de propriété')),
    el('span', { class: 'carte-nom' }, c.nom),
    el('span', { class: 'carte-prix' }, hypothequee ? 'Hypothéquée' : euros(c.prix)));
  // Les variables CSS ne passent pas par style.x = … : setProperty.
  carte.style.setProperty('--bande', couleur);
  carte.style.setProperty('--texte-bande', texteSur(couleur));
  return carte;
}

function carteSortie(pioche) {
  return el('span', { class: `carte-3d carte-sortie carte-${pioche}`, role: 'img', 'aria-label': 'Carte « sortie des Baumettes »' },
    el('span', { class: 'carte-bande', 'aria-hidden': 'true' }, pioche === 'chance' ? '?' : '⚓'),
    el('span', { class: 'carte-nom' }, 'Sortie des Baumettes'));
}

// Debout sur le tapis, face à la caméra : les piles de jetons de casino (son argent) et, en mode
// Pastis (`joueur` donné), un verre à shooter par gorgée bue et un grand verre par cul sec.
function majObjets(objets, place, argent, joueur) {
  const boisson = joueur ? { gorgees: joueur.gorgees ?? 0, culsSecs: joueur.culsSecs ?? 0 } : null;
  if (!changement(objets, 'objets', `${place.largeur}|${argent}|${boisson ? `${boisson.gorgees}|${boisson.culsSecs}` : ''}`)) return;
  const piles = jetons(argent);
  const position = dispositionObjets(place.largeur, piles.length, boisson);
  const debout = (classe, { x, y }, svg) => el('div', { class: `debout ${classe}`, style: { left: cqi(x), top: cqi(y) }, html: svg });
  objets.querySelector('.jetons-joueur').replaceChildren(...piles.map((pile, k) => debout('pile-jetons', position.piles[k], svgPile(pile))));
  const { reste } = position;
  objets.querySelector('.verres-joueur').replaceChildren(
    ...position.petits.map((p) => debout('verre', p, SVG_VERRE)),
    ...position.grands.map((p) => debout('verre grand-verre', p, SVG_GRAND_VERRE)),
    ...(reste ? [el('span', { class: 'debout verres-reste', style: { left: cqi(reste.x), top: cqi(reste.y) } }, `+${reste.nombre}`)] : []));
}

// Étiquette du joueur, accrochée à sa place (la caméra la positionne à chaque image).
function majEtiquette(etiquette, place, j, partie, { actif, salon, moi, surRemplacer, surClicJoueur }) {
  const { etat } = partie;
  etiquette.dataset.ancreX = place.ancre.x.toFixed(4);
  etiquette.dataset.ancreY = place.ancre.y.toFixed(4);
  etiquette.style.setProperty('--couleur', COULEURS_JOUEURS[j.id]);
  etiquette.classList.toggle('actif', j.id === actif);
  etiquette.classList.toggle('courant', j.id === etat.courant && !etat.terminee);
  etiquette.classList.toggle('faillite', j.faillite);
  const statut = [];
  const presence = salon?.places[j.id];
  if (j.faillite) statut.push('En faillite');
  else if (j.enPrison) statut.push('Aux Baumettes');
  if (presence?.abandon) statut.push('A quitté la partie');
  else if (presence?.remplaceParIA) statut.push("Déconnecté, l'ordinateur joue");
  else if (j.ia) statut.push('Ordinateur');
  else if (presence && !presence.connecte) statut.push('🔌 Déconnecté');
  const peutRemplacer = presence && !j.ia && !presence.connecte && !j.faillite && !etat.terminee && surRemplacer;
  const nbProprietes = proprietesDe(etat, j.id).length;
  etiquette.setAttribute('aria-label', `${j.nom}${j.id === moi ? ' (vous)' : ''} : ${euros(j.argent)}, ${nbProprietes} propriété${nbProprietes > 1 ? 's' : ''}`
    + `${etat.options.pastis ? `, ${j.gorgees ?? 0} gorgée${(j.gorgees ?? 0) > 1 ? 's' : ''}` : ''}${statut.length ? `, ${statut.join(', ')}` : ''}`);
  etiquette.setAttribute('role', 'group');
  etiquette.replaceChildren(...[
    el('button', { type: 'button', class: 'etiquette-tete', title: `Tourner la table vers ${j.nom}`, onclick: () => surClicJoueur?.(place.angle) },
      el('span', { class: 'avatar', html: svgPion(j.pion, 26) }),
      el('span', { class: 'etiquette-nom' }, j.nom, j.id === moi ? el('small', {}, ' (vous)') : null)),
    el('span', { class: 'etiquette-argent' }, euros(j.argent)),
    etat.options.pastis ? el('span', { class: 'etiquette-gorgees' }, `🥃 ${j.gorgees ?? 0}${j.culsSecs ? ` · ${j.culsSecs} cul${j.culsSecs > 1 ? 's' : ''} sec${j.culsSecs > 1 ? 's' : ''}` : ''}`) : null,
    statut.length ? el('span', { class: 'etiquette-statut' }, statut.join(' · ')) : null,
    peutRemplacer ? el('button', { type: 'button', class: 'btn btn-petit', onclick: () => surRemplacer(j.id) }, "🤖 Faire jouer l'ordinateur") : null
  ].filter(Boolean));
}

// Pile de jetons vue légèrement de dessus : tranches à liserés, face du dessus avec sa valeur.
function svgPile({ couleur, bord, nombre, valeur }) {
  const ry = 7;
  const e = 4.2;
  const h = 2 * ry + nombre * e + 2;
  let s = `<svg viewBox="0 0 40 ${h}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="20" cy="${h - ry}" rx="19.5" ry="${ry}" fill="#000" fill-opacity=".35"/>`;
  for (let k = 0; k < nombre; k++) {
    const y = h - ry - 1 - k * e;
    s += `<path d="M1 ${y - e}V${y}A19 ${ry} 0 0 0 39 ${y}V${y - e}Z" fill="${couleur}"/>`;
    for (const x of [7, 16, 24, 33]) s += `<rect x="${x - 1.6}" y="${(y - e + 0.7).toFixed(1)}" width="3.2" height="${(e - 1.4).toFixed(1)}" fill="${bord}" fill-opacity=".9"/>`;
    s += `<path d="M1 ${y}A19 ${ry} 0 0 0 39 ${y}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".7"/>`;
  }
  const yt = h - ry - 1 - nombre * e;
  return `${s}<ellipse cx="20" cy="${yt}" rx="19" ry="${ry}" fill="${couleur}" stroke="#000" stroke-opacity=".2" stroke-width=".5"/>`
    + `<ellipse cx="20" cy="${yt}" rx="15" ry="${ry * 0.78}" fill="none" stroke="${bord}" stroke-width="1.8" stroke-dasharray="3.4 2.6"/>`
    + `<ellipse cx="20" cy="${yt}" rx="10.5" ry="${ry * 0.55}" fill="${couleur}" stroke="${bord}" stroke-opacity=".7" stroke-width=".6"/>`
    + `<text transform="translate(20 ${yt + 2.1}) scale(1 .6)" text-anchor="middle" font-size="9" font-weight="800" fill="${bord}" font-family="system-ui, sans-serif">${valeur}</text></svg>`;
}

// Verre à shooter, vide, avec un fond de pastis.
const SVG_VERRE = `<svg viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="10" cy="24.2" rx="7" ry="1.8" fill="#000" fill-opacity=".3"/>
  <path d="M2 3L18 3L15.6 23.4L4.4 23.4Z" fill="#e6f5fa" fill-opacity=".45" stroke="#fff" stroke-opacity=".95" stroke-width=".8"/>
  <path d="M4.15 20.6H15.85L15.6 23.4H4.4Z" fill="#f2d65c" fill-opacity=".8"/>
  <ellipse cx="10" cy="3" rx="8" ry="1.6" fill="#fff" fill-opacity=".3" stroke="#fff" stroke-width=".7"/>
  <path d="M5 6L6.1 19" stroke="#fff" stroke-opacity=".85" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;

// Grand verre à pastis (un cul sec), avec un reste de pastis trouble et un glaçon.
const SVG_GRAND_VERRE = `<svg viewBox="0 0 24 42" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="12" cy="40" rx="9" ry="2" fill="#000" fill-opacity=".3"/>
  <path d="M3 3L21 3L19.5 39.4L4.5 39.4Z" fill="#e6f5fa" fill-opacity=".4" stroke="#fff" stroke-opacity=".95" stroke-width=".8"/>
  <path d="M4.05 28H19.95L19.5 39.4H4.5Z" fill="#f4e19a" fill-opacity=".85"/>
  <rect x="8" y="24" width="7" height="6" rx="1.4" fill="#fff" fill-opacity=".7" transform="rotate(-12 11.5 27)"/>
  <ellipse cx="12" cy="3" rx="9" ry="1.8" fill="#fff" fill-opacity=".3" stroke="#fff" stroke-width=".7"/>
  <path d="M6 6L7 35" stroke="#fff" stroke-opacity=".85" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;
