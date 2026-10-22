// Vue 3D du plateau : scène inclinée, décor marseillais autour du plateau,
// maisons et hôtels en volume aux couleurs de leur propriétaire.
// La vue à plat reste la vue par défaut ; le choix est mémorisé dans le navigateur.
import { el } from './utilitaires.js';

const CLE_VUE = 'monopoly-marseille-vue3d';

function lireChoix() {
  try {
    return localStorage.getItem(CLE_VUE) === '1';
  } catch {
    return false;
  }
}

function memoriserChoix(actif) {
  try {
    localStorage.setItem(CLE_VUE, actif ? '1' : '0');
  } catch {
    // Stockage indisponible : le choix ne sera simplement pas retenu.
  }
}

// Construit la scène dans `conteneur`. Renvoie l'élément qui accueillera le plateau
// et le bouton de bascule entre vue à plat et vue 3D, à placer dans l'interface.
export function creerScene(conteneur) {
  const plateau = el('div', { class: 'plateau' });
  // Le décor a sa propre scène, peinte derrière celle du plateau : mêlés dans une même
  // scène 3D, la mer et les cases se trient mal et des cases deviennent transparentes.
  const sceneDecor = el('div', { class: 'scene scene-decor', 'aria-hidden': 'true' }, decor());
  const scene = el('div', { class: 'scene' }, el('div', { class: 'tranche', 'aria-hidden': 'true' }), plateau);
  const bouton = el('button', { type: 'button', class: 'btn btn-petit bouton-vue' });
  const appliquer = (actif) => {
    conteneur.classList.toggle('vue-3d', actif);
    bouton.setAttribute('aria-pressed', String(actif));
    bouton.textContent = actif ? '🗺️ Vue à plat' : '🧊 Vue 3D';
    bouton.title = actif ? 'Revenir au plateau vu de dessus' : 'Voir le plateau en 3D, avec son décor';
  };
  bouton.addEventListener('click', () => {
    const actif = !conteneur.classList.contains('vue-3d');
    memoriserChoix(actif);
    appliquer(actif);
  });
  appliquer(lireChoix());
  conteneur.prepend(sceneDecor, scene);
  return { plateau, bouton };
}

// Décor autour du plateau (visible en 3D) : la mer, la côte et ses silhouettes.
// Les éléments « debout » font face à la caméra.
function decor() {
  const debout = (classe, svg) => el('div', { class: `accessoire ${classe}`, html: svg });
  return el('div', { class: 'decor' },
    el('div', { class: 'sol' }),
    el('div', { class: 'cote' }),
    debout('bonne-mere', SVG_BONNE_MERE),
    debout('immeubles', SVG_IMMEUBLES),
    debout('pins pins-1', SVG_PINS),
    debout('pins pins-2', SVG_PINS),
    debout('calanque calanque-g', SVG_CALANQUE),
    debout('calanque calanque-d', SVG_CALANQUE),
    debout('phare', SVG_PHARE),
    debout('bateau bateau-1', SVG_POINTU),
    debout('bateau bateau-2', SVG_POINTU),
    debout('bateau bateau-3', SVG_VOILIER),
    debout('soleil-decor', SVG_SOLEIL));
}

// Maison ou hôtel : un volume dont chaque face est un élément (murs, toit).
// À plat, seul le contour de la maison est dessiné (voir plateau.css).
export function construction(hotel, couleur) {
  const face = (nom, contenu) => el('span', { class: `pan ${nom}` }, contenu);
  const faces = hotel
    ? [face('avant'), face('arriere'), face('gauche'), face('droite'), face('dessus', 'H')]
    : [face('avant'), face('arriere'), face('gauche'), face('droite'), face('toit-avant'), face('toit-arriere')];
  const batiment = el('span', { class: hotel ? 'batiment hotel' : 'batiment maison' }, ...faces);
  batiment.style.setProperty('--c', couleur);
  return batiment;
}

const SVG_BONNE_MERE = `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 150 C10 110 30 95 60 92 C90 95 110 110 120 150Z" fill="#9b8b5e"/>
  <path d="M8 150 C20 118 38 104 60 102 C82 104 100 118 112 150Z" fill="#6f8f4e"/>
  <rect x="34" y="70" width="52" height="30" fill="#e9dcc0" stroke="#8a7a5a"/>
  <path d="M30 72 L60 58 L90 72Z" fill="#c9b994"/>
  <rect x="52" y="30" width="16" height="42" fill="#efe3c6" stroke="#8a7a5a"/>
  <path d="M52 30 L60 18 L68 30Z" fill="#d8c8a0"/>
  <rect x="58" y="4" width="4" height="14" fill="#e7b416"/>
  <circle cx="60" cy="4" r="3" fill="#f5cc2a"/>
  <g fill="#7a6a4a"><rect x="40" y="80" width="6" height="10" rx="3"/><rect x="74" y="80" width="6" height="10" rx="3"/><rect x="57" y="40" width="6" height="9" rx="3"/></g>
</svg>`;

const SVG_IMMEUBLES = `<svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#8a7055" stroke-width="1">
    <rect x="2" y="30" width="30" height="50" fill="#f0d9b5"/><rect x="34" y="18" width="26" height="62" fill="#e8c39a"/>
    <rect x="62" y="36" width="34" height="44" fill="#f4e4c8"/><rect x="98" y="22" width="28" height="58" fill="#e3b98d"/>
    <rect x="128" y="34" width="30" height="46" fill="#f2d3ab"/>
  </g>
  <g fill="#b5532f"><path d="M0 30 L17 22 L34 30Z"/><path d="M60 36 L79 27 L98 36Z"/><path d="M126 34 L143 26 L160 34Z"/></g>
  <g fill="#5d7f99" opacity=".8">
    <rect x="8" y="40" width="6" height="8"/><rect x="20" y="40" width="6" height="8"/><rect x="8" y="56" width="6" height="8"/><rect x="20" y="56" width="6" height="8"/>
    <rect x="40" y="26" width="6" height="8"/><rect x="50" y="26" width="5" height="8"/><rect x="40" y="44" width="6" height="8"/><rect x="50" y="44" width="5" height="8"/>
    <rect x="68" y="46" width="7" height="8"/><rect x="82" y="46" width="7" height="8"/><rect x="104" y="32" width="6" height="8"/><rect x="115" y="32" width="6" height="8"/>
    <rect x="104" y="50" width="6" height="8"/><rect x="115" y="50" width="6" height="8"/><rect x="134" y="44" width="6" height="8"/><rect x="146" y="44" width="6" height="8"/>
  </g>
</svg>`;

const SVG_PINS = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
  <rect x="17" y="34" width="4" height="36" fill="#6b4a2b"/><rect x="40" y="40" width="4" height="30" fill="#6b4a2b"/>
  <ellipse cx="19" cy="28" rx="18" ry="11" fill="#2f6b3a"/><ellipse cx="22" cy="22" rx="12" ry="8" fill="#3d8248"/>
  <ellipse cx="42" cy="36" rx="16" ry="9" fill="#2f6b3a"/><ellipse cx="44" cy="31" rx="10" ry="6" fill="#3d8248"/>
</svg>`;

const SVG_CALANQUE = `<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 70 L8 34 L22 20 L34 30 L48 8 L62 24 L74 16 L90 36 L104 30 L120 70Z" fill="#ece6d8" stroke="#b8ae98" stroke-width="1.5"/>
  <path d="M22 20 L28 46 L18 70M48 8 L52 40 L44 70M74 16 L80 44 L72 70" stroke="#c9c0ab" stroke-width="2" fill="none"/>
  <g fill="#4f7f45"><circle cx="34" cy="31" r="4"/><circle cx="62" cy="26" r="4"/><circle cx="96" cy="34" r="3.5"/></g>
</svg>`;

const SVG_PHARE = `<svg viewBox="0 0 40 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 100 L10 84 L30 84 L36 100Z" fill="#9c9483"/>
  <path d="M13 84 L16 26 L24 26 L27 84Z" fill="#fff" stroke="#9aa5ad"/>
  <path d="M14 70 L26 70 L26.5 60 L13.5 60Z M15 46 L25 46 L25.4 38 L14.6 38Z" fill="#c0392b"/>
  <rect x="13" y="16" width="14" height="10" fill="#f6d27a" stroke="#555"/>
  <path d="M11 16 L20 6 L29 16Z" fill="#c0392b"/>
</svg>`;

const SVG_POINTU = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="38" y="6" width="2.5" height="30" fill="#6b4a2b"/>
  <path d="M41 8 L62 34 L41 34Z" fill="#fff6e0" stroke="#c9b994"/>
  <path d="M2 34 L78 34 L68 46 L12 46Z" fill="#1f6fb5"/>
  <path d="M2 34 L78 34 L76 38 L4 38Z" fill="#f2c94c"/>
  <path d="M0 30 L6 34 L2 34Z M80 30 L74 34 L78 34Z" fill="#1f6fb5"/>
</svg>`;

const SVG_VOILIER = `<svg viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
  <rect x="33" y="2" width="2.5" height="52" fill="#555"/>
  <path d="M36 4 L64 52 L36 52Z" fill="#fff" stroke="#ccc"/>
  <path d="M32 12 L10 52 L32 52Z" fill="#f2f2f2" stroke="#ccc"/>
  <path d="M4 54 L66 54 L58 64 L12 64Z" fill="#fff" stroke="#9aa5ad"/>
</svg>`;

const SVG_SOLEIL = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="22" fill="#f6c343"/>
  <g stroke="#f6c343" stroke-width="5" stroke-linecap="round">
    <path d="M50 8 V20 M50 80 V92 M8 50 H20 M80 50 H92 M20 20 L28 28 M72 72 L80 80 M80 20 L72 28 M20 80 L28 72"/>
  </g>
</svg>`;
