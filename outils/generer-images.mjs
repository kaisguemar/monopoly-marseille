// Génère les images SVG de la vue 3D : textures des maisons et des hôtels, icônes de la vue
// à plat, vagues de la mer et panorama de la Corniche.
//
// Les images produites sont versionnées dans assets/ : le jeu n'a besoin d'aucune étape de
// construction. Après une modification de ce fichier, relancez :
//   node outils/generer-images.mjs
//
// Les murs des bâtiments sont laissés transparents : la couleur du propriétaire, posée en fond
// par le CSS, apparaît à travers (seuls la pierre, les tuiles, les portes et les fenêtres sont peints).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dimensions des bâtiments (en centièmes d'em), identiques à celles de src/styles/vue3d.css.
export const MAISON = { longueur: 125, profondeur: 120, hauteur: 110, pente: 35, debord: 6 };
MAISON.faitage = Math.round(MAISON.hauteur + (MAISON.profondeur / 2) * Math.tan((MAISON.pente * Math.PI) / 180));
MAISON.rampant = Math.round((MAISON.profondeur / 2) / Math.cos((MAISON.pente * Math.PI) / 180) + MAISON.debord);
export const HOTEL = { longueur: 260, profondeur: 140, hauteur: 210 };

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

// Générateur pseudo-aléatoire déterministe (mulberry32) : chaque génération donne les mêmes images.
function hasard(graine) {
  let etat = graine >>> 0;
  const suivant = () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    suivant,
    entre: (min, max) => min + (max - min) * suivant(),
    choix: (liste) => liste[Math.floor(suivant() * liste.length)]
  };
}

// Coordonnées arrondies au dixième : fichiers plus légers.
const f = (x) => Number(x.toFixed(1));
const o = (x) => Number(x.toFixed(2));

const rect = (x, y, l, h, attributs = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(l)}" height="${f(h)}" ${attributs}/>`;
const cercle = (x, y, r, attributs = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${attributs}/>`;
const chemin = (d, attributs = '') => `<path d="${d}" ${attributs}/>`;

function svg(largeur, hauteur, contenu, defs = '', ajustement = 'none') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" preserveAspectRatio="${ajustement}">\n`
    + (defs ? `<defs>${defs}</defs>\n` : '')
    + `${contenu}\n</svg>\n`;
}

// Chaque face d'un bâtiment est dessinée « debout », vue de face, puis retournée pour apparaître
// à l'endroit une fois posée en 3D par le CSS (voir les transformations des faces dans vue3d.css).
const POSE = {
  // Façade avant : le haut de l'image se trouve au pied du mur.
  avant: (l, h) => `matrix(1 0 0 -1 0 ${h})`,
  // Façade arrière, vue de derrière : retournement complet.
  arriere: (l, h) => `matrix(-1 0 0 -1 ${l} ${h})`,
  // Pignons et côtés : l'axe horizontal de l'image suit la hauteur du mur.
  cote: (p, h) => `matrix(0 -1 -1 0 ${h} ${p})`,
  // Pan de toit arrière, vu de derrière.
  retourne: (l, h) => `matrix(-1 0 0 -1 ${l} ${h})`
};
const poser = (pose, l, h, contenu) => `<g transform="${POSE[pose](l, h)}">${contenu}</g>`;

// ---------------------------------------------------------------------------
// Matières communes : crépi, salissures, pierre, vitres, tuiles
// ---------------------------------------------------------------------------

const PIERRE = 'fill="#ece3cf" stroke="#a8987a" stroke-width=".6"';
const PIERRE_SOMBRE = 'fill="#ddd1b6" stroke="#a8987a" stroke-width=".5"';
const TUILES = ['#b9582c', '#c4642f', '#ad4f28', '#c96f38', '#a8492a', '#bf6a3c', '#b45f33'];

function defsMurs(graine) {
  const rng = hasard(graine);
  let grains = '';
  for (let i = 0; i < 34; i++) {
    const clair = rng.suivant() < 0.55;
    grains += cercle(rng.entre(0, 24), rng.entre(0, 24), rng.entre(0.35, 1.25),
      `fill="${clair ? '#fff' : '#3a2410'}" fill-opacity="${o(rng.entre(0.05, clair ? 0.16 : 0.12))}"`);
  }
  return `<pattern id="crepi" width="24" height="24" patternUnits="userSpaceOnUse">${grains}</pattern>`
    + '<linearGradient id="salissure" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#2a1a0a" stop-opacity="0"/><stop offset="1" stop-color="#2a1a0a" stop-opacity=".24"/></linearGradient>'
    + '<linearGradient id="ombre-haut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1208" stop-opacity=".34"/><stop offset="1" stop-color="#1e1208" stop-opacity="0"/></linearGradient>'
    + '<linearGradient id="vitre" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#1f3546"/><stop offset=".55" stop-color="#3d6079"/><stop offset="1" stop-color="#6f93ab"/></linearGradient>'
    + '<linearGradient id="bois" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5e3a20"/><stop offset=".5" stop-color="#7a4d2b"/><stop offset="1" stop-color="#5a371e"/></linearGradient>'
    + '<linearGradient id="dore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8dc7e"/><stop offset="1" stop-color="#b8892a"/></linearGradient>';
}

// Grain du crépi et salissures en bas du mur, sur toute la face.
const crepi = (l, h) => rect(0, 0, l, h, 'fill="url(#crepi)"') + rect(0, 0, l, h, 'fill="url(#salissure)"');

// Pierres d'angle (chaînage) le long d'une arête verticale ; sens 1 : vers la droite, -1 : vers la gauche.
function chainage(x, y0, y1, sens) {
  let s = '';
  let long = true;
  for (let y = y0; y < y1 - 1; y += 7) {
    const h = Math.min(7, y1 - y);
    const l = long ? 9 : 6;
    s += rect(sens > 0 ? x : x - l, y + 0.35, l, h - 0.7, 'fill="#ece3cf" fill-opacity=".9" stroke="#b3a383" stroke-width=".4"');
    long = !long;
  }
  return s;
}

// Soubassement : bande plus sombre et plus rugueuse au pied du mur.
const soubassement = (l, y, h) => rect(0, y, l, h, 'fill="#3b2a18" fill-opacity=".2"')
  + chemin(`M0 ${y}H${l}`, 'stroke="#2e2010" stroke-opacity=".35" stroke-width=".8"');

// Génoise : deux rangs de tuiles rondes sous l'avant-toit, typiques des maisons provençales.
function genoise(l, y) {
  let s = rect(0, y, l, 12, 'fill="#e6d8bc"');
  for (let rang = 0; rang < 2; rang++) {
    const base = y + 6 + rang * 5.5;
    for (let x = -9 + rang * 4.5; x < l; x += 9) {
      s += chemin(`M${f(x)} ${f(base)}a4 4 0 0 1 8 0z`, 'fill="#b65a2e" stroke="#7a3518" stroke-width=".4"');
      s += chemin(`M${f(x + 1.7)} ${f(base)}a2.3 2.3 0 0 1 4.6 0z`, 'fill="#4f2410"');
    }
  }
  return s + rect(0, y + 12, l, 9, 'fill="url(#ombre-haut)"');
}

function volet(x, y, l, h) {
  let s = rect(x, y, l, h, 'fill="#efe7d5" stroke="#9c8d71" stroke-width=".6"');
  for (let yy = y + 2.2; yy < y + h - 1; yy += 2.4) s += chemin(`M${f(x + 1)} ${f(yy)}H${f(x + l - 1)}`, 'stroke="#b5a688" stroke-width=".55"');
  return s;
}

function jardiniere(x, y, l) {
  let s = '';
  for (let k = 0; k < l - 1; k += 3.1) {
    s += cercle(x + k + 1.6, y - 0.6, 1.7, 'fill="#4f8a3a"');
    if (Math.round(k / 3.1) % 2 === 0) s += cercle(x + k + 1.2, y - 2.3, 1.15, 'fill="#e0446a"');
  }
  return s + rect(x, y, l, 4.5, 'fill="#b0532a" stroke="#7a3518" stroke-width=".5"');
}

// Fenêtre à petits bois, encadrement de pierre, volets ouverts, fermés ou absents.
function fenetre(x, y, l, h, { volets = 'ouverts', fleurs = false, appui = true } = {}) {
  const c = 2.6;
  let s = '';
  if (volets === 'ouverts') s += volet(x - c - l / 2 - 0.4, y - c, l / 2, h + 2 * c) + volet(x + l + c + 0.4, y - c, l / 2, h + 2 * c);
  s += rect(x - c, y - c, l + 2 * c, h + 2 * c, PIERRE);
  s += rect(x, y, l, h, 'fill="url(#vitre)"');
  s += chemin(`M${f(x + l * 0.12)} ${f(y + h)}L${f(x + l * 0.52)} ${f(y)}H${f(x + l * 0.74)}L${f(x + l * 0.34)} ${f(y + h)}Z`, 'fill="#fff" fill-opacity=".16"');
  s += chemin(`M${f(x + l / 2)} ${f(y)}V${f(y + h)}M${f(x)} ${f(y + h * 0.42)}H${f(x + l)}`, 'stroke="#f2ede2" stroke-width="1.5"');
  if (volets === 'fermes') s += volet(x, y, l / 2, h) + volet(x + l / 2, y, l / 2, h);
  if (appui) s += rect(x - c - 1.5, y + h + c - 0.5, l + 2 * c + 3, 3, PIERRE_SOMBRE);
  if (fleurs) s += jardiniere(x - 1, y + h + c + 2.5, l + 2);
  return s;
}

// Porte de bois à planches, imposte vitrée, encadrement de pierre et marche.
function porte(x, y, l, h) {
  const c = 3;
  let s = rect(x - c, y - c, l + 2 * c, h + c, PIERRE)
    + rect(x - c - 1.2, y - c - 2.6, l + 2 * c + 2.4, 3, PIERRE_SOMBRE)
    + rect(x, y, l, h, 'fill="url(#bois)"');
  for (let k = 4.6; k < l - 1; k += 4.6) s += chemin(`M${f(x + k)} ${f(y)}V${f(y + h)}`, 'stroke="#3f2512" stroke-width=".7" stroke-opacity=".7"');
  s += rect(x + 2.5, y + 3, l - 5, h * 0.17, 'fill="url(#vitre)" stroke="#3f2512" stroke-width=".9"')
    + rect(x + 2, y + h * 0.58, l - 4, 1.5, 'fill="#3f2512" fill-opacity=".55"')
    + cercle(x + l - 4.5, y + h * 0.55, 1.3, 'fill="#d9b65a"')
    + rect(x - c - 2, y + h, l + 2 * c + 4, 4, PIERRE_SOMBRE);
  return s;
}

// ---------------------------------------------------------------------------
// Maison : un cabanon marseillais (rez-de-chaussée, génoise, toit de tuiles canal)
// ---------------------------------------------------------------------------

function maisonFacade() {
  const { longueur: l, hauteur: h } = MAISON;
  const dessin = crepi(l, h)
    + chainage(0, 12, h - 9, 1) + chainage(l, 12, h - 9, -1)
    + soubassement(l, h - 9, 9)
    + porte(14, 46, 28, 56)
    + fenetre(74, 37, 24, 32, { fleurs: true })
    // Plaque de numéro émaillée bleue, comme dans les rues de Marseille.
    + rect(48, 51, 7, 5, 'rx=".8" fill="#2456a6" stroke="#fff" stroke-width=".6"')
    + chemin('M104 80l2 5-1.5 4 2.5 6', 'fill="none" stroke="#3a2a1a" stroke-opacity=".28" stroke-width=".6"')
    + genoise(l, 0);
  return svg(l, h, poser('avant', l, h, dessin), defsMurs(11));
}

function maisonArriere() {
  const { longueur: l, hauteur: h } = MAISON;
  const dessin = crepi(l, h)
    + chainage(0, 12, h - 9, 1) + chainage(l, 12, h - 9, -1)
    + soubassement(l, h - 9, 9)
    + fenetre(20, 40, 22, 30)
    + fenetre(83, 40, 22, 30, { volets: 'fermes' })
    // Descente d'eau de pluie.
    + rect(61, 12, 2.4, h - 14, 'fill="#8b8b82" stroke="#5e5e57" stroke-width=".4"')
    + rect(59.5, 40, 5.4, 1.6, 'fill="#5e5e57"') + rect(59.5, 80, 5.4, 1.6, 'fill="#5e5e57"')
    + genoise(l, 0);
  return svg(l, h, poser('arriere', l, h, dessin), defsMurs(12));
}

// Pignon : mur en pentagone (le CSS le découpe), œil-de-bœuf et petite fenêtre aux volets clos.
function maisonPignon() {
  const { profondeur: p, hauteur: h, faitage: H } = MAISON;
  const toit = H - h;
  const dessin = crepi(p, H)
    + chemin(`M0 ${toit}L${p / 2} 0L${p} ${toit}V${toit + 11}L${p / 2} 11L0 ${toit + 11}Z`, 'fill="#1e1208" fill-opacity=".24"')
    + chainage(0, toit, H - 9, 1) + chainage(p, toit, H - 9, -1)
    + soubassement(p, H - 9, 9)
    + cercle(p / 2, toit * 0.62, 8.5, PIERRE) + cercle(p / 2, toit * 0.62, 5.6, 'fill="url(#vitre)"')
    + chemin(`M${p / 2} ${f(toit * 0.62 - 5.6)}V${f(toit * 0.62 + 5.6)}M${p / 2 - 5.6} ${f(toit * 0.62)}H${p / 2 + 5.6}`, 'stroke="#f2ede2" stroke-width="1.2"')
    + fenetre(p / 2 - 11, toit + 32, 22, 28, { volets: 'fermes' });
  return svg(H, p, poser('cote', p, H, dessin), defsMurs(13));
}

// Pan de toit en tuiles canal, faîtage en haut et égout en bas.
function toitTuiles(graine) {
  const rng = hasard(graine);
  const l = MAISON.longueur + 2 * MAISON.debord;
  const L = MAISON.rampant;
  const colonnes = 12;
  const cw = l / colonnes;
  const rangs = 6;
  const rh = (L - 7) / rangs;
  let s = rect(0, 0, l, L, 'fill="#6e2e15"');
  for (let c = 0; c < colonnes; c++) s += rect(c * cw + cw * 0.06, 0, cw * 0.88, L, 'fill="url(#canal)"');
  // Les rangs du bas d'abord : chaque tuile recouvre le bout de celle du dessous.
  for (let r = rangs - 1; r >= 0; r--) {
    const y = 7 + r * rh;
    for (let c = 0; c < colonnes; c++) {
      const cx = c * cw + cw / 2;
      s += chemin(`M${f(cx - cw * 0.38)} ${f(y + rh + 0.6)}a${f(cw * 0.38)} 1.6 0 0 0 ${f(cw * 0.76)} 0z`, 'fill="#2f1408" fill-opacity=".5"');
      s += rect(cx - cw * 0.4, y - 1.4, cw * 0.8, rh + 2, `rx="${f(cw * 0.32)}" fill="${rng.choix(TUILES)}"`);
      s += rect(cx - cw * 0.4, y - 1.4, cw * 0.8, rh + 2, `rx="${f(cw * 0.32)}" fill="url(#tuile)"`);
      if (rng.suivant() < 0.18) s += cercle(cx + rng.entre(-2, 2), y + rng.entre(2, rh - 2), rng.entre(0.8, 1.8), 'fill="#c9b46a" fill-opacity=".35"');
    }
  }
  // Faîtage : tuiles posées en long, scellées au mortier.
  s += rect(0, 0, l, 7, 'fill="#a9502a"');
  for (let x = -4; x < l; x += 13) s += rect(x, 0.6, 12, 5.4, 'rx="2.6" fill="url(#faitiere)"');
  s += rect(0, 6.4, l, 1.2, 'fill="#d8c8a8"');
  // Égout : la bouche des tuiles.
  for (let c = 0; c < colonnes; c++) s += chemin(`M${f(c * cw + cw * 0.18)} ${f(L)}a${f(cw * 0.32)} 1.8 0 0 1 ${f(cw * 0.64)} 0z`, 'fill="#3a170a"');
  const defs = '<linearGradient id="tuile" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0f04" stop-opacity=".45"/><stop offset=".38" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#2a0f04" stop-opacity=".5"/></linearGradient>'
    + '<linearGradient id="canal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a230f"/><stop offset=".5" stop-color="#8e3d1d"/><stop offset="1" stop-color="#5a230f"/></linearGradient>'
    + '<linearGradient id="faitiere" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d27a45"/><stop offset=".5" stop-color="#b65a2e"/><stop offset="1" stop-color="#7c3517"/></linearGradient>';
  return { l, L, s, defs };
}

function maisonToit(arriere = false) {
  const { l, L, s, defs } = toitTuiles(arriere ? 22 : 21);
  return svg(l, L, arriere ? poser('retourne', l, L, s) : s, defs);
}

// Icône de la vue à plat : façade en pentagone (le CSS la découpe), murs à la couleur du propriétaire.
function maisonIcone() {
  let toit = chemin('M-4 48L50 1L104 48Z', 'fill="#b9582c" stroke="#7a3518" stroke-width="2"');
  for (const y of [17, 29, 40]) {
    const demi = ((y - 1) / 47) * 54;
    toit += chemin(`M${f(50 - demi)} ${y}H${f(50 + demi)}`, 'stroke="#8e3f1e" stroke-width="2"');
  }
  const dessin = toit
    + rect(4, 48, 92, 6, 'fill="#e6d8bc"')
    + rect(4, 54, 92, 5, 'fill="#1e1208" fill-opacity=".25"')
    + rect(15, 63, 24, 37, 'fill="#ece3cf"') + rect(18, 66, 18, 34, 'fill="url(#bois)"')
    + rect(53, 60, 32, 24, 'fill="#ece3cf"') + rect(56, 63, 26, 18, 'fill="url(#vitre)"')
    + chemin('M69 63V81M56 70H82', 'stroke="#f2ede2" stroke-width="2"')
    + rect(0, 93, 100, 7, 'fill="#1e1208" fill-opacity=".22"')
    + chemin('M0 46V100H100V46', 'fill="none" stroke="#1e1208" stroke-opacity=".35" stroke-width="5"');
  return svg(100, 100, dessin, defsMurs(14));
}

// ---------------------------------------------------------------------------
// Hôtel : immeuble marseillais à trois niveaux, balcons en fer forgé, toit-terrasse
// ---------------------------------------------------------------------------

// Porte-fenêtre à deux battants, persiennes repliées, clé de voûte et balcon éventuel.
function fenetreHotel(x, y, l, h, { balcon = false, volets = 'ouverts' } = {}) {
  const c = 3;
  let s = '';
  if (volets === 'ouverts') {
    for (const vx of [x - c - 6.6, x + l + c + 0.6]) {
      s += rect(vx, y - c, 6, h + c, 'fill="#dfe6df" stroke="#8e9a8e" stroke-width=".5"');
      for (let yy = y - c + 2; yy < y + h - 1; yy += 2.3) s += chemin(`M${f(vx + 0.8)} ${f(yy)}H${f(vx + 5.2)}`, 'stroke="#a9b4a9" stroke-width=".5"');
    }
  }
  s += rect(x - c, y - c, l + 2 * c, h + c, PIERRE) + rect(x, y, l, h, 'fill="url(#vitre)"')
    + chemin(`M${f(x + l * 0.1)} ${f(y + h)}L${f(x + l * 0.5)} ${f(y)}H${f(x + l * 0.7)}L${f(x + l * 0.3)} ${f(y + h)}Z`, 'fill="#fff" fill-opacity=".14"')
    + chemin(`M${f(x + l / 2)} ${f(y)}V${f(y + h)}M${f(x)} ${f(y + h * 0.27)}H${f(x + l)}`, 'stroke="#f2ede2" stroke-width="1.4"')
    // Clé de voûte.
    + chemin(`M${f(x + l / 2 - 3.5)} ${f(y - c - 1.5)}h7l-1.6 6h-3.8z`, PIERRE_SOMBRE);
  if (volets === 'fermes') {
    s += rect(x, y, l, h, 'fill="#dfe6df" stroke="#8e9a8e" stroke-width=".5"');
    for (let yy = y + 2; yy < y + h - 1; yy += 2.3) s += chemin(`M${f(x + 0.8)} ${f(yy)}H${f(x + l - 0.8)}`, 'stroke="#a9b4a9" stroke-width=".5"');
    s += chemin(`M${f(x + l / 2)} ${f(y)}V${f(y + h)}`, 'stroke="#8e9a8e" stroke-width=".6"');
  }
  if (balcon) s += garde_corps(x - 6, y + h - 11, l + 12, 11) + rect(x - 8, y + h, l + 16, 3.2, PIERRE_SOMBRE);
  return s;
}

// Garde-corps en fer forgé : lisses et barreaux, volutes discrètes.
function garde_corps(x, y, l, h) {
  let s = rect(x, y, l, 1.6, 'fill="#262626"') + rect(x, y + h - 1.4, l, 1.4, 'fill="#262626"');
  for (let k = 1.6; k < l - 1; k += 2.8) s += chemin(`M${f(x + k)} ${f(y + 1.4)}V${f(y + h - 1.2)}`, 'stroke="#262626" stroke-width=".7"');
  for (let k = 6; k < l - 4; k += 11) s += cercle(x + k, y + h / 2, 1.9, 'fill="none" stroke="#262626" stroke-width=".6"');
  return s;
}

// Rez-de-chaussée en pierre de taille à refends.
function rezDeChaussee(l, y, h) {
  let s = rect(0, y, l, h, 'fill="#e7dcc5"');
  let decale = false;
  for (let yy = y + 10; yy < y + h - 4; yy += 10) {
    s += chemin(`M0 ${yy}H${l}`, 'stroke="#c4b693" stroke-width=".8"');
    for (let x = decale ? 12 : 0; x < l; x += 24) s += chemin(`M${x} ${yy - 10}v10`, 'stroke="#cdbf9e" stroke-width=".6"');
    decale = !decale;
  }
  return s + rect(0, y + h - 6, l, 6, 'fill="#b9ab8e" fill-opacity=".55"');
}

// Corniche moulurée et denticules en haut de façade.
function corniche(l) {
  let s = rect(0, 0, l, 14, PIERRE) + chemin(`M0 9.5H${l}M0 12H${l}`, 'stroke="#b9aa8a" stroke-width=".8"');
  for (let x = 2; x < l - 2; x += 5.5) s += rect(x, 14, 3, 3.6, 'fill="#d9cdb2"');
  return s + rect(0, 17.6, l, 9, 'fill="url(#ombre-haut)"');
}

// Baie cintrée du rez-de-chaussée.
function baieCintree(cx, haut, bas, demi, attributs) {
  return chemin(`M${f(cx - demi)} ${bas}V${f(haut + demi)}A${demi} ${demi} 0 0 1 ${f(cx + demi)} ${f(haut + demi)}V${bas}Z`, attributs);
}

function hotelFacade() {
  const { longueur: l, hauteur: h } = HOTEL;
  const colonnes = [30, 80, 130, 180, 230];
  let dessin = crepi(l, h) + corniche(l)
    + chainage(0, 18, 148, 1) + chainage(l, 18, 148, -1)
    + rect(0, 80, l, 3.4, PIERRE_SOMBRE);
  for (const cx of colonnes) dessin += fenetreHotel(cx - 12, 31, 24, 38, { balcon: true });
  for (const cx of colonnes) dessin += fenetreHotel(cx - 12, 90, 24, 42);
  // Balcon filant du premier étage.
  dessin += garde_corps(4, 120, l - 8, 13) + rect(2, 133, l - 4, 3.6, PIERRE_SOMBRE);
  dessin += rezDeChaussee(l, 150, 60);
  // Bandeau et enseigne.
  dessin += rect(0, 146, l, 11, PIERRE)
    + `<text x="${l / 2}" y="155" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="9" letter-spacing="2.2" fill="url(#dore)" stroke="#5a4313" stroke-width=".3">HÔTEL</text>`;
  for (const cx of colonnes) {
    if (cx === 130) continue;
    dessin += baieCintree(cx, 166, 202, 11, PIERRE) + baieCintree(cx, 169, 202, 8.4, 'fill="url(#vitre)"')
      + chemin(`M${cx} 169V202`, 'stroke="#f2ede2" stroke-width="1.2"') + rect(cx - 13, 202, 26, 2.6, PIERRE_SOMBRE);
  }
  // Entrée : porte vitrée cintrée, marquise de verre et de fer, lanternes et plantes.
  dessin += baieCintree(130, 163, 206, 17, PIERRE) + baieCintree(130, 166, 206, 14, 'fill="#1b2a35"')
    + chemin('M123 206V178M137 206V178M116 182H144', 'stroke="#c9a23a" stroke-width="1.2"')
    + baieCintree(130, 166, 206, 14, 'fill="url(#vitre)" fill-opacity=".55"')
    + chemin('M106 160H154L149 166H111Z', 'fill="#2b2b2b"') + chemin('M109 160H151L148 163.5H112Z', 'fill="#cfe3ec" fill-opacity=".7"')
    + rect(108, 206, 44, 4, PIERRE_SOMBRE);
  for (const x of [102, 158]) {
    dessin += rect(x - 0.6, 170, 1.2, 6, 'fill="#2b2b2b"') + chemin(`M${x - 2.6} 176h5.2l-1 6h-3.2z`, 'fill="#f6d27a" stroke="#2b2b2b" stroke-width=".6"');
  }
  for (const x of [96, 164]) dessin += rect(x - 3.5, 199, 7, 7, 'fill="#9a4a25"') + cercle(x, 194, 6, 'fill="#3f7a3a"') + cercle(x - 1.6, 192, 2.4, 'fill="#5d9a4e"');
  return svg(l, h, poser('avant', l, h, dessin), defsMurs(31));
}

function hotelArriere() {
  const { longueur: l, hauteur: h } = HOTEL;
  let dessin = crepi(l, h) + corniche(l)
    + chainage(0, 18, 148, 1) + chainage(l, 18, 148, -1)
    + rect(0, 80, l, 3.4, PIERRE_SOMBRE);
  const fermees = new Set([1, 6, 8]);
  [30, 80, 130, 180, 230].forEach((cx, i) => {
    dessin += fenetreHotel(cx - 12, 31, 24, 38, { balcon: i % 2 === 0, volets: fermees.has(i) ? 'fermes' : 'ouverts' });
    dessin += fenetreHotel(cx - 12, 90, 24, 42, { balcon: true, volets: fermees.has(i + 5) ? 'fermes' : 'ouverts' });
  });
  dessin += rezDeChaussee(l, 150, 60);
  for (const cx of [30, 80, 180, 230]) dessin += fenetre(cx - 10, 166, 20, 24, { volets: 'aucun' });
  dessin += porte(118, 164, 24, 42);
  return svg(l, h, poser('arriere', l, h, dessin), defsMurs(32));
}

function hotelCote() {
  const { profondeur: p, hauteur: h } = HOTEL;
  let dessin = crepi(p, h) + corniche(p)
    + chainage(0, 18, 148, 1) + chainage(p, 18, 148, -1)
    + rect(0, 80, p, 3.4, PIERRE_SOMBRE);
  for (const cx of [42, 98]) dessin += fenetreHotel(cx - 12, 31, 24, 38) + fenetreHotel(cx - 12, 90, 24, 42, { balcon: true });
  dessin += rezDeChaussee(p, 150, 60)
    + baieCintree(70, 166, 202, 13, PIERRE) + baieCintree(70, 169, 202, 10, 'fill="url(#vitre)"')
    + chemin('M70 169V202', 'stroke="#f2ede2" stroke-width="1.2"');
  return svg(h, p, poser('cote', p, h, dessin), defsMurs(33));
}

// Toit-terrasse vu du dessus : tomettes, acrotère, cage d'escalier, parasol et emblème « H »
// dont le disque est transparent, donc à la couleur du propriétaire.
function hotelToit() {
  const { longueur: l, profondeur: p } = HOTEL;
  const rng = hasard(34);
  const ex = 196, ey = 70, er = 33;
  const rayon = 5.2;
  const lh = Math.sqrt(3) * rayon;
  const hexagone = (cx, cy) => {
    let d = '';
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      d += `${k ? 'L' : 'M'}${f(cx + rayon * Math.cos(a))} ${f(cy + rayon * Math.sin(a))}`;
    }
    return `${d}Z`;
  };
  let tomettes = '';
  for (let ligne = 0, cy = 0; cy < p + rayon; ligne++, cy += rayon * 1.5) {
    for (let cx = (ligne % 2) * (lh / 2); cx < l + lh; cx += lh) {
      if (Math.hypot(cx - ex, cy - ey) < er + rayon) continue;
      tomettes += chemin(hexagone(cx, cy), `fill="${rng.choix(['#b8572e', '#c06135', '#ad4f29', '#b9603a', '#a94d2b'])}"`);
    }
  }
  const disque = `M${ex - er} ${ey}a${er} ${er} 0 1 0 ${2 * er} 0a${er} ${er} 0 1 0 ${-2 * er} 0Z`;
  let dessin = chemin(`M0 0H${l}V${p}H0Z${disque}`, 'fill="#8c3d1f" fill-rule="evenodd"')
    + `<g stroke="#7a3518" stroke-width=".5">${tomettes}</g>`
    // Ombre portée et cage d'escalier.
    + rect(22, 22, 48, 34, 'fill="#1e1208" fill-opacity=".3"') + rect(16, 16, 48, 34, PIERRE)
    + rect(20, 20, 40, 26, 'fill="#e2d7bf"') + rect(52, 26, 6, 14, 'fill="#6b4427"')
    // Conduits de cheminée.
    + rect(82, 16, 12, 9, 'fill="#d9cdb2" stroke="#8a7a5a" stroke-width=".6"') + rect(84.5, 18, 7, 5, 'fill="#3a2a1a"')
    + rect(100, 16, 12, 9, 'fill="#d9cdb2" stroke="#8a7a5a" stroke-width=".6"') + rect(102.5, 18, 7, 5, 'fill="#3a2a1a"');
  // Parasol rayé et transats.
  dessin += cercle(112, 102, 17, 'fill="#1e1208" fill-opacity=".28"');
  for (let k = 0; k < 8; k++) {
    const a0 = (Math.PI / 4) * k;
    const a1 = a0 + Math.PI / 4;
    dessin += chemin(`M108 98L${f(108 + 17 * Math.cos(a0))} ${f(98 + 17 * Math.sin(a0))}A17 17 0 0 1 ${f(108 + 17 * Math.cos(a1))} ${f(98 + 17 * Math.sin(a1))}Z`, `fill="${k % 2 ? '#fdfaf2' : '#2b6cb0'}"`);
  }
  dessin += cercle(108, 98, 1.8, 'fill="#c9a23a"')
    + rect(70, 112, 9, 18, 'rx="2" fill="#fdfaf2" stroke="#9c8d71" stroke-width=".6"') + rect(140, 112, 9, 18, 'rx="2" fill="#fdfaf2" stroke="#9c8d71" stroke-width=".6"');
  // Plantes en pots aux angles.
  for (const [x, y] of [[14, 124], [150, 16], [246, 16], [246, 124]]) {
    dessin += cercle(x + 2, y + 2, 7.5, 'fill="#1e1208" fill-opacity=".25"') + cercle(x, y, 7, 'fill="#3f7a3a"') + cercle(x - 2, y - 2, 3.2, 'fill="#5d9a4e"');
  }
  // Emblème : anneau et « H » blancs sur disque transparent.
  dessin += cercle(ex, ey, er, 'fill="none" stroke="#fdfaf2" stroke-width="4"')
    + rect(ex - 15, ey - 18, 8, 36, 'fill="#fdfaf2"') + rect(ex + 7, ey - 18, 8, 36, 'fill="#fdfaf2"') + rect(ex - 7, ey - 4, 14, 8, 'fill="#fdfaf2"');
  // Acrotère tout autour, avec son ombre vers l'intérieur.
  dessin += chemin(`M0 0H${l}V${p}H0ZM8 8V${p - 8}H${l - 8}V8Z`, 'fill="#ece3cf" fill-rule="evenodd" stroke="#a8987a" stroke-width=".8"')
    + chemin(`M8 8H${l - 8}V12H12V${p - 8}H8Z`, 'fill="#1e1208" fill-opacity=".28"');
  return svg(l, p, dessin);
}

// Icône de la vue à plat : façade d'hôtel, murs à la couleur du propriétaire.
function hotelIcone() {
  let dessin = rect(0, 0, 200, 14, 'fill="#ece3cf"')
    + rect(0, 14, 200, 6, 'fill="#1e1208" fill-opacity=".22"');
  for (const cx of [20, 60, 140, 180]) dessin += rect(cx - 11, 30, 22, 26, 'fill="#ece3cf"') + rect(cx - 8, 33, 16, 23, 'fill="url(#vitre)"');
  for (const cx of [20, 60, 100, 140, 180]) dessin += rect(cx - 11, 64, 22, 24, 'fill="#ece3cf"') + rect(cx - 8, 67, 16, 21, 'fill="url(#vitre)"');
  dessin += rect(4, 86, 192, 4, 'fill="#262626"')
    + rect(0, 94, 200, 36, 'fill="#e7dcc5"') + chemin('M0 112H200', 'stroke="#c4b693" stroke-width="1.5"')
    + baieCintree(100, 98, 130, 13, 'fill="#1b2a35"') + baieCintree(40, 100, 124, 9, 'fill="url(#vitre)"') + baieCintree(160, 100, 124, 9, 'fill="url(#vitre)"')
    // Enseigne « H ».
    + rect(76, 2, 48, 46, 'rx="5" fill="#1d3a6e" stroke="#f4d77a" stroke-width="3"')
    + rect(87, 10, 8, 30, 'fill="#fff"') + rect(105, 10, 8, 30, 'fill="#fff"') + rect(95, 21, 10, 8, 'fill="#fff"')
    + rect(0, 0, 200, 130, 'fill="none" stroke="#1e1208" stroke-opacity=".35" stroke-width="6"');
  return svg(200, 130, dessin, defsMurs(35));
}

// ---------------------------------------------------------------------------
// Mer : crêtes de vagues et reflets, en motifs raccordables
// ---------------------------------------------------------------------------

// Place un dessin et ses copies décalées d'une période, pour que le motif se raccorde sur ses bords.
function raccorder(x, y, marge, periodeX, periodeY, dessin) {
  let s = '';
  for (const dx of [0, -periodeX, periodeX]) {
    for (const dy of [0, -periodeY, periodeY]) {
      if ((dx && (x + dx < -marge || x + dx > periodeX + marge)) || (dy && (y + dy < -marge || y + dy > periodeY + marge))) continue;
      s += dessin(x + dx, y + dy);
    }
  }
  return s;
}

// Crêtes de vagues : croissants d'écume effilés, posés sur un creux plus sombre.
function vagues() {
  const rng = hasard(41);
  const taille = 240;
  const croissant = (x, y, l, h, e) => `M${f(x)} ${f(y)}q${f(l / 2)} ${f(-h)} ${f(l)} 0q${f(-l / 2)} ${f(-h + 2 * e)} ${f(-l)} 0z`;
  let s = '';
  for (let i = 0; i < 40; i++) {
    const x = rng.entre(0, taille);
    const y = rng.entre(0, taille);
    const l = rng.entre(16, 42);
    const h = rng.entre(2.6, 5.5);
    const e = rng.entre(1, 2.1);
    const opacite = rng.entre(0.2, 0.4);
    s += raccorder(x, y, l + 6, taille, taille, (xx, yy) => chemin(croissant(xx, yy + 2.2, l, h, e * 1.3), `fill="#0b3b63" fill-opacity="${o(opacite * 0.45)}"`)
      + chemin(croissant(xx, yy, l, h, e), `fill="#fff" fill-opacity="${o(opacite)}"`));
  }
  return svg(taille, taille, s, '', 'xMidYMid meet');
}

function reflets() {
  const rng = hasard(42);
  const taille = 240;
  let s = '';
  for (let i = 0; i < 26; i++) {
    const x = rng.entre(0, taille);
    const y = rng.entre(0, taille);
    const r = rng.entre(0.8, 2.2);
    const opacite = rng.entre(0.5, 0.95);
    s += raccorder(x, y, 6, taille, taille, (xx, yy) => chemin(`M${f(xx - r * 2.4)} ${f(yy)}Q${f(xx)} ${f(yy)} ${f(xx)} ${f(yy - r * 2.4)}Q${f(xx)} ${f(yy)} ${f(xx + r * 2.4)} ${f(yy)}Q${f(xx)} ${f(yy)} ${f(xx)} ${f(yy + r * 2.4)}Q${f(xx)} ${f(yy)} ${f(xx - r * 2.4)} ${f(yy)}Z`,
      `fill="#fff" fill-opacity="${o(opacite)}"`));
  }
  return svg(taille, taille, s, '', 'xMidYMid meet');
}

// ---------------------------------------------------------------------------
// Ponton de bois sur lequel est posé le plateau, et feutre des tapis des joueurs
// ---------------------------------------------------------------------------

// Ponton rond vu du dessus : planches clouées sur des lambourdes, rebord, bittes d'amarrage et cordage.
function ponton() {
  const rng = hasard(51);
  const T = 1000;
  const C = T / 2;
  const BOIS = ['#b8895a', '#c29467', '#ad7e50', '#bb8d5f', '#a87a4e', '#c79c6e', '#b48456'];
  const LAMBOURDES = [140, 320, 500, 680, 860];
  let planches = '';
  const nombre = 19;
  const hauteur = T / nombre;
  for (let k = 0; k < nombre; k++) {
    const y = k * hauteur;
    // Chaque rangée est faite d'une ou deux planches, aboutées sur une lambourde.
    const joint = rng.suivant() < 0.6 ? rng.choix(LAMBOURDES.slice(1, -1)) : null;
    const morceaux = joint ? [[0, joint], [joint, T]] : [[0, T]];
    for (const [x0, x1] of morceaux) {
      planches += rect(x0, y, x1 - x0, hauteur - 3, `fill="${rng.choix(BOIS)}"`);
      for (let v = 0; v < 5; v++) {
        const yy = y + rng.entre(5, hauteur - 8);
        const ondule = rng.entre(-3, 3);
        planches += chemin(`M${f(x0 + 4)} ${f(yy)}Q${f((x0 + x1) / 2)} ${f(yy + ondule)} ${f(x1 - 4)} ${f(yy + rng.entre(-2, 2))}`,
          `fill="none" stroke="#5a3a1c" stroke-opacity="${o(rng.entre(0.12, 0.28))}" stroke-width="${f(rng.entre(0.8, 2))}"`);
      }
      if (rng.suivant() < 0.35) {
        const nx = rng.entre(x0 + 30, x1 - 30);
        planches += `<ellipse cx="${f(nx)}" cy="${f(y + hauteur / 2)}" rx="${f(rng.entre(7, 13))}" ry="${f(rng.entre(3, 6))}" fill="#6b4626" fill-opacity=".55"/>`;
      }
      if (joint) planches += rect(joint - 1.5, y, 3, hauteur - 3, 'fill="#3a2614"');
    }
    for (const x of LAMBOURDES) {
      for (const dy of [hauteur * 0.28, hauteur * 0.66]) planches += cercle(x + (x === joint ? 6 : 0), y + dy, 2.6, 'fill="#3b3b3b"') + cercle(x - 0.8, y + dy - 0.8, 1, 'fill="#9a9a9a"');
    }
  }
  let dessin = cercle(C, C, C, 'fill="#3a2614"')
    + `<g clip-path="url(#disque)">${planches}</g>`
    + cercle(C, C, 486, 'fill="url(#volume)"')
    // Rebord en planches cintrées.
    + cercle(C, C, 491, 'fill="none" stroke="#7a5230" stroke-width="18"')
    + cercle(C, C, 499, 'fill="none" stroke="#4a301a" stroke-width="3"')
    + cercle(C, C, 482, 'fill="none" stroke="#2e1d0e" stroke-opacity=".5" stroke-width="2"');
  for (let a = 0; a < 360; a += 15) {
    const r = (a * Math.PI) / 180;
    dessin += cercle(C + 491 * Math.cos(r), C + 491 * Math.sin(r), 2.4, 'fill="#3b3b3b"');
  }
  // Bittes d'amarrage en fonte et un rouleau de cordage.
  for (const a of [45, 135, 225, 315]) {
    const r = (a * Math.PI) / 180;
    const x = C + 462 * Math.cos(r);
    const y = C + 462 * Math.sin(r);
    dessin += cercle(x + 4, y + 5, 15, 'fill="#000" fill-opacity=".3"') + cercle(x, y, 14, 'fill="#2f3337"') + cercle(x - 4, y - 4, 5, 'fill="#5b636b"');
  }
  let spirale = '';
  for (let t = 0; t < 4 * Math.PI; t += 0.25) spirale += `${t ? 'L' : 'M'}${f(C + 300 + Math.cos(t) * (6 + t * 3.4))} ${f(C - 300 + Math.sin(t) * (6 + t * 3.4))}`;
  dessin += chemin(spirale, 'fill="none" stroke="#d9c7a0" stroke-width="7" stroke-linecap="round"')
    + chemin(spirale, 'fill="none" stroke="#a88d5c" stroke-width="2" stroke-dasharray="3 5"');
  const defs = `<clipPath id="disque"><circle cx="${C}" cy="${C}" r="486"/></clipPath>`
    + '<radialGradient id="volume"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>';
  return svg(T, T, dessin, defs, 'xMidYMid meet');
}

// Grain du feutre des tapis, en motif raccordable (la couleur du joueur est posée dessous).
function feutre() {
  const rng = hasard(52);
  const taille = 48;
  let s = '';
  for (let i = 0; i < 70; i++) {
    const x = rng.entre(0, taille);
    const y = rng.entre(0, taille);
    const clair = rng.suivant() < 0.5;
    const attributs = `fill="${clair ? '#fff' : '#000'}" fill-opacity="${o(rng.entre(0.05, 0.12))}"`;
    const r = rng.entre(0.3, 0.9);
    s += raccorder(x, y, 2, taille, taille, (xx, yy) => cercle(xx, yy, r, attributs));
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.entre(0, taille);
    const y = rng.entre(0, taille);
    const a = rng.entre(0, Math.PI);
    const attributs = `stroke="#000" stroke-opacity="${o(rng.entre(0.05, 0.1))}" stroke-width=".5"`;
    s += raccorder(x, y, 4, taille, taille, (xx, yy) => chemin(`M${f(xx)} ${f(yy)}l${f(Math.cos(a) * 3)} ${f(Math.sin(a) * 3)}`, attributs));
  }
  return svg(taille, taille, s, '', 'xMidYMid meet');
}

// ---------------------------------------------------------------------------
// Panorama de la Corniche (raccordable à gauche et à droite : il fait le tour de l'horizon)
// ---------------------------------------------------------------------------

export const PANORAMA = { largeur: 3600, hauteur: 220 };

function panoramaCorniche() {
  const { largeur: W, hauteur: H } = PANORAMA;
  const rng = hasard(2026);
  const periodique = (x, termes) => termes.reduce((y, [amplitude, k, phase]) => y + amplitude * Math.sin((2 * Math.PI * k * x) / W + phase), 0);
  const ecart = (x, x0) => { const d = Math.abs(x - x0) % W; return Math.min(d, W - d); };
  const bosse = (x, x0, largeur, hauteur) => hauteur * Math.exp(-((ecart(x, x0) / largeur) ** 2));
  const placer = (x, marge, dessin) => [0, -W, W].filter((dx) => x + dx > -marge && x + dx < W + marge).map((dx) => dessin(x + dx)).join('');

  const ND = 2250;          // Notre-Dame de la Garde, sur sa colline
  const VALLON = 1350;      // Vallon des Auffes et son viaduc
  const MONUMENT = 440;     // Monument aux morts de l'Armée d'Orient
  const PLAGE = 3140;       // plage et parasols
  const ROUTE = 157;        // niveau de la route de la Corniche
  const montagnes = (x) => 84 + periodique(x, [[12, 2, 0.4], [8, 5, 1.3], [5, 9, 2.2], [2.5, 21, 0.7]]);
  const contreforts = (x) => 108 + periodique(x, [[7, 4, 2.1], [4, 11, 0.6], [2, 27, 1.9]]);
  const colline = (x) => 130 + periodique(x, [[5, 3, 1.1], [3.5, 7, 2.6], [2, 15, 0.3]]) - bosse(x, ND, 230, 56) - bosse(x, MONUMENT + 300, 420, 10);
  const contour = (fonction) => {
    let d = `M0 ${H}`;
    for (let x = 0; x <= W; x += 8) d += `L${x} ${f(fonction(x))}`;
    return `${d}L${W} ${H}Z`;
  };
  const ville = (x) => 0.35 + 0.6 * Math.exp(-((ecart(x, ND) / 650) ** 2)) - 0.25 * Math.exp(-((ecart(x, PLAGE) / 260) ** 2));
  const enProche = (x, centre, demi) => ecart(x, centre) < demi;

  const ENDUITS = ['#f4e6cc', '#efd9b4', '#f7efe2', '#e9c7a0', '#f2dcc0', '#e3bd94', '#f9f3e8', '#ecd0ad', '#f0e2c6', '#e6d3bd', '#f2c9a8'];
  let s = '';

  // Montagnes au loin, voilées par la brume, puis la colline de la ville.
  s += chemin(contour(montagnes), 'fill="url(#montagnes)"');
  s += chemin(contour(montagnes).replace(/^M0 220/, '').replace(/L3600 220Z$/, '').replace(/^L/, 'M'), 'fill="none" stroke="#dfe6ec" stroke-width="1.3" stroke-opacity=".8"');
  s += chemin(contour(contreforts), 'fill="url(#contreforts)"');
  s += chemin(contour(colline), 'fill="url(#colline)"');
  for (let i = 0; i < 260; i++) {
    const x = rng.entre(0, W);
    const y = colline(x) + rng.entre(1, 24);
    if (y > 150) continue;
    s += placer(x, 6, (xx) => cercle(xx, y, rng.entre(1.8, 4.2), `fill="${rng.choix(['#4d7a45', '#5d8a4e', '#43703f'])}"`));
  }

  // Maisons lointaines sur les pentes.
  for (let x = 0; x < W; x += rng.entre(6, 13)) {
    if (rng.suivant() > ville(x)) continue;
    const y = Math.min(150, colline(x) + rng.entre(10, 30));
    const l = rng.entre(6, 12);
    const h = rng.entre(4, 9);
    const enduit = rng.choix(ENDUITS);
    s += placer(x, 14, (xx) => rect(xx, y - h, l, h, `fill="${enduit}" fill-opacity=".85"`) + rect(xx - 0.5, y - h - 1.4, l + 1, 1.6, 'fill="#c27a55" fill-opacity=".8"'));
  }

  // Notre-Dame de la Garde : rempart, nef et coupole rayées, clocher et Bonne Mère dorée.
  const nd = colline(ND) + 2;
  s += chemin(`M${ND - 48} ${nd + 8}L${ND + 48} ${nd + 8}L${ND + 41} ${nd - 7}L${ND - 41} ${nd - 7}Z`, 'fill="#d8cdb6" stroke="#b4a585" stroke-width=".6"');
  for (let x = ND - 40; x < ND + 40; x += 6) s += rect(x, nd - 10, 3.4, 3.4, 'fill="#d8cdb6"');
  s += rect(ND - 31, nd - 24, 37, 17, 'fill="url(#rayures)" stroke="#a9a08a" stroke-width=".5"')
    + chemin(`M${ND - 23} ${nd - 24}a10 9 0 0 1 20 0z`, 'fill="url(#rayures)" stroke="#a9a08a" stroke-width=".5"')
    + rect(ND - 14.5, nd - 37, 3, 4, 'fill="#efe6d2"') + chemin(`M${ND - 13} ${nd - 41}v4M${ND - 14.6} ${nd - 39.4}h3.2`, 'stroke="#c9a23a" stroke-width=".9"');
  for (const x of [ND - 27, ND - 19, ND - 3]) s += chemin(`M${x} ${nd - 9}v-6a2 2 0 0 1 4 0v6z`, 'fill="#4a4f52"');
  s += rect(ND + 6, nd - 47, 15, 40, 'fill="url(#rayures)" stroke="#a9a08a" stroke-width=".5"')
    + chemin(`M${ND + 8.5} ${nd - 33}v-7a2.5 2.5 0 0 1 5 0v7zM${ND + 14} ${nd - 33}v-7a2.5 2.5 0 0 1 5 0v7z`, 'fill="#4a4f52"')
    + rect(ND + 9.5, nd - 53, 8, 6, 'fill="#e2d7bf" stroke="#a9a08a" stroke-width=".5"')
    + cercle(ND + 13.5, nd - 60, 9, 'fill="url(#halo)"')
    + chemin(`M${ND + 11} ${nd - 53}L${ND + 12.3} ${nd - 63}H${ND + 14.7}L${ND + 16} ${nd - 53}Z`, 'fill="url(#dore)"')
    + cercle(ND + 13.5, nd - 64.5, 1.8, 'fill="url(#dore)"');

  // Immeubles et villas au-dessus de la route.
  for (let x = 0; x < W; x += rng.entre(9, 20)) {
    if (enProche(x, VALLON, 120) || rng.suivant() > ville(x) + 0.15) continue;
    const proche = enProche(x, ND, 700);
    const l = rng.entre(12, proche ? 28 : 22);
    const h = rng.entre(10, proche ? 34 : 22);
    const base = ROUTE - rng.entre(0, 8);
    const enduit = rng.choix(ENDUITS);
    const toitPlat = rng.suivant() < (proche ? 0.6 : 0.3);
    s += placer(x, 32, (xx) => {
      let b = rect(xx, base - h, l, h, `fill="${enduit}"`) + rect(xx + l - 2.4, base - h, 2.4, h, 'fill="#3b2a18" fill-opacity=".13"');
      b += toitPlat ? rect(xx - 0.6, base - h - 1.4, l + 1.2, 1.6, 'fill="#e6dccb" stroke="#b9ad96" stroke-width=".3"')
        : chemin(`M${f(xx - 1.4)} ${f(base - h)}L${f(xx + l / 2)} ${f(base - h - 4)}L${f(xx + l + 1.4)} ${f(base - h)}Z`, 'fill="#b9603a"');
      if (h > 9 && l > 9) b += rect(xx + 2, base - h + 2.6, l - 4.6, h - 6.4, 'fill="url(#fenetres)"');
      return b;
    });
  }

  // Pins parasols, cyprès et palmiers.
  const pin = (x, y, t) => rect(x - 0.7, y - 9 * t, 1.4, 9 * t, 'fill="#6b4a2b"') + chemin(`M${f(x - 8 * t)} ${f(y - 8 * t)}q${f(8 * t)} ${f(-7 * t)} ${f(16 * t)} 0q${f(-8 * t)} ${f(3 * t)} ${f(-16 * t)} 0z`, 'fill="#2f5d34"') + chemin(`M${f(x - 5 * t)} ${f(y - 10.5 * t)}q${f(5 * t)} ${f(-4 * t)} ${f(10 * t)} 0z`, 'fill="#3d7442"');
  const cypres = (x, y, t) => chemin(`M${f(x)} ${f(y - 22 * t)}q${f(4 * t)} ${f(10 * t)} ${f(2.6 * t)} ${f(22 * t)}h${f(-5.2 * t)}q${f(-1.4 * t)} ${f(-12 * t)} ${f(2.6 * t)} ${f(-22 * t)}z`, 'fill="#2c4f2e"');
  const palmier = (x, y, t) => chemin(`M${f(x)} ${f(y)}q${f(-1.5 * t)} ${f(-10 * t)} ${f(1 * t)} ${f(-20 * t)}`, `fill="none" stroke="#7a5a36" stroke-width="${f(1.4 * t)}"`)
    + [[-9, -2], [-7, 3], [8, -1], [7, 4], [0, -6]].map(([dx, dy]) => chemin(`M${f(x + t)} ${f(y - 20 * t)}q${f(dx * 0.5 * t)} ${f((dy - 4) * t)} ${f(dx * t)} ${f(dy * t)}`, `fill="none" stroke="#3f7a3a" stroke-width="${f(1.6 * t)}" stroke-linecap="round"`)).join('');
  for (let x = 0; x < W; x += rng.entre(26, 70)) {
    if (enProche(x, VALLON, 110)) continue;
    const t = rng.entre(0.8, 1.25);
    const y = ROUTE - rng.entre(0, 6);
    const espece = rng.suivant();
    s += placer(x, 20, (xx) => (espece < 0.45 ? pin(xx, y, t) : espece < 0.7 ? cypres(xx, y, t) : palmier(xx, y, t)));
  }

  // Vallon des Auffes : l'anse, ses cabanons colorés et ses pointus, derrière le viaduc.
  s += rect(VALLON - 112, 170, 224, 16, 'fill="#2f80b3"');
  for (const [base, decal] of [[170, 0], [180, 5]]) {
    for (let x = VALLON - 118 + decal; x < VALLON + 112; x += rng.entre(9, 13)) {
      const h = rng.entre(8, 13);
      const l = rng.entre(8, 12);
      const couleur = rng.choix(['#e8553f', '#3d8fd6', '#f2c53d', '#fdfaf2', '#58b36b', '#ff8c42', '#f0a3b5']);
      s += rect(x, base - h, l, h, `fill="${couleur}" stroke="#7a6a55" stroke-width=".3"`) + rect(x - 0.5, base - h - 1, l + 1, 1.6, 'fill="#b9603a"')
        + rect(x + l / 2 - 1.2, base - h + 3, 2.4, 3.4, 'fill="#4f6577"');
    }
  }
  for (let x = VALLON - 96; x < VALLON + 96; x += rng.entre(16, 26)) s += chemin(`M${f(x)} 184h9l-1.6 2.6h-5.8z`, `fill="${rng.choix(['#1f6fb5', '#e8553f', '#f2c53d', '#2e8b57'])}"`);

  // Route de la Corniche : mur de soutènement (interrompu par le viaduc), chaussée, balustrade et réverbères.
  const mur = (x0, x1) => {
    let m = rect(x0, ROUTE + 3, x1 - x0, 14, 'fill="#d6c9ae"');
    for (let y = ROUTE + 7; y < ROUTE + 17; y += 4.6) m += chemin(`M${f(x0)} ${f(y)}H${f(x1)}`, 'stroke="#bfb193" stroke-width=".5"');
    return m;
  };
  s += mur(0, VALLON - 114) + mur(VALLON + 114, W);
  s += rect(0, ROUTE, W, 3, 'fill="#8f8f8a"')
    + rect(0, ROUTE - 6.6, W, 6, 'fill="url(#balustres)"')
    + rect(0, ROUTE - 8.4, W, 2.6, 'fill="#faf8f2" stroke="#cfc8b8" stroke-width=".4"')
    + rect(0, ROUTE - 1.4, W, 1.6, 'fill="#efebe2"');
  for (let x = 40; x < W; x += 150) {
    s += rect(x - 0.6, ROUTE - 26, 1.2, 26, 'fill="#3c3f44"') + chemin(`M${x} ${ROUTE - 26}q0 -3 4 -3`, 'fill="none" stroke="#3c3f44" stroke-width="1"')
      + chemin(`M${x + 2.5} ${ROUTE - 29}h3l-.6 3h-1.8z`, 'fill="#f6e7b0" stroke="#3c3f44" stroke-width=".5"');
  }

  // Viaduc du Vallon des Auffes : trois arches de pierre au-dessus de l'anse.
  const v0 = VALLON - 116;
  const v1 = VALLON + 116;
  const ARCHES = [[VALLON - 80, 22, 174], [VALLON, 40, 168], [VALLON + 80, 22, 174]];
  let arches = '';
  for (const [cx, demi, naissance] of ARCHES) arches += `M${cx - demi} 188V${naissance}A${demi} ${f(naissance - ROUTE - 6)} 0 0 1 ${cx + demi} ${naissance}V188Z`;
  s += chemin(`M${v0} ${ROUTE + 3}H${v1}V188H${v0}Z${arches}`, 'fill="#d4c4a0" fill-rule="evenodd" stroke="#a8987a" stroke-width=".6"');
  for (const [cx, demi, naissance] of ARCHES) s += chemin(`M${cx - demi} ${naissance}A${demi} ${f(naissance - ROUTE - 6)} 0 0 1 ${cx + demi} ${naissance}`, 'fill="none" stroke="#bba985" stroke-width="2.4"');

  s += rect(0, 184, W, H - 184, 'fill="url(#mer)"');

  // Rochers calcaires au pied de la route, et écume.
  const rochers = (x) => 172 + periodique(x, [[1.6, 37, 0.2], [1.1, 83, 1.4], [0.8, 151, 2.9]]);
  const sansRochers = (x) => enProche(x, VALLON, 118) || enProche(x, PLAGE, 205);
  // Rochers par tronçons (interrompus par le viaduc et la plage) : dessus et pied irréguliers.
  // Le contour ne suit que le dessus, pour que le raccord des bords du panorama reste invisible.
  const piedRochers = (x) => 188.5 + periodique(x, [[0.9, 53, 0.8], [0.6, 127, 2.2]]);
  const troncons = [];
  for (let x = 0; x <= W; x += 6) {
    if (sansRochers(x)) continue;
    const dernier = troncons.at(-1);
    if (dernier && dernier.at(-1) === x - 6) dernier.push(x);
    else troncons.push([x]);
  }
  for (const xs of troncons) {
    const dessus = xs.map((x) => `${x} ${f(rochers(x))}`);
    const pied = [...xs].reverse().map((x) => `${x} ${f(piedRochers(x))}`);
    s += chemin(`M${dessus.join('L')}L${pied.join('L')}Z`, 'fill="url(#rocs)"')
      + chemin(`M${dessus.join('L')}`, 'fill="none" stroke="#b7ab93" stroke-width=".5"');
  }
  for (let i = 0; i < 160; i++) {
    const x = rng.entre(0, W);
    if (sansRochers(x)) continue;
    s += chemin(`M${f(x)} ${f(rochers(x) + 2)}l${f(rng.entre(-3, 3))} ${f(rng.entre(3, 8))}`, 'stroke="#b7ab93" stroke-width=".6"');
  }

  // Malmousque : gros rochers blancs ; plage aux parasols colorés.
  for (let x = 2790; x < 2930; x += rng.entre(12, 22)) {
    const h = rng.entre(8, 16);
    s += chemin(`M${f(x - 10)} 186L${f(x - 4)} ${f(186 - h)}L${f(x + 3)} ${f(186 - h + 3)}L${f(x + 10)} 186Z`, 'fill="#ece6d8" stroke="#b8ae98" stroke-width=".6"');
  }
  s += chemin(`M${PLAGE - 206} ${ROUTE + 16}H${PLAGE + 206}V187Q${PLAGE} 195 ${PLAGE - 206} 187Z`, 'fill="#efd9a6"')
    + chemin(`M${PLAGE - 206} 185.6Q${PLAGE} 193 ${PLAGE + 206} 185.6`, 'fill="none" stroke="#d6b97f" stroke-width="2.2"')
    + chemin(`M${PLAGE - 206} 187Q${PLAGE} 195 ${PLAGE + 206} 187`, 'fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4"');
  for (let x = PLAGE - 160; x < PLAGE + 160; x += rng.entre(18, 32)) {
    const y = 176 + Math.abs(x - PLAGE) / 40;
    const couleur = rng.choix(['#e8553f', '#2b6cb0', '#f2c53d', '#2e8b57', '#ff8c42']);
    s += rect(x - 0.4, y - 4, 0.8, 7, 'fill="#5a4a3a"') + chemin(`M${f(x - 6)} ${f(y - 3.5)}q6 -6 12 0z`, `fill="${couleur}"`) + chemin(`M${f(x - 2)} ${f(y - 4.8)}q2 -1.6 4 0`, 'fill="none" stroke="#fff" stroke-width="1.2"');
  }

  // Monument aux morts de l'Armée d'Orient : grande arche face à la mer, sur son promontoire.
  const m = MONUMENT;
  s += chemin(`M${m - 52} 188L${m - 42} 172H${m + 42}L${m + 52} 188Z`, 'fill="#d9d0bd" stroke="#b7ab93" stroke-width=".6"')
    + rect(m - 36, 166, 72, 6, PIERRE_SOMBRE) + rect(m - 31, 161, 62, 5, PIERRE)
    + chemin(`M${m - 25} 161V110H${m + 25}V161ZM${m - 10} 161V131A10 10 0 0 1 ${m + 10} 131V161Z`, 'fill="#ece4d2" fill-rule="evenodd" stroke="#a8987a" stroke-width=".6"')
    + rect(m - 29, 104, 58, 6, PIERRE) + rect(m - 21, 94, 42, 10, PIERRE)
    + chemin(`M${m - 14} 98H${m + 14}M${m - 11} 101H${m + 11}`, 'stroke="#8a7a5a" stroke-width=".6"')
    + chemin(`M${m - 4} 94L${m - 2.4} 84L${m - 1.4} 80.5H${m + 1.4}L${m + 2.4} 84L${m + 4} 94Z`, 'fill="#6a5d48"')
    + cercle(m, 78.6, 1.9, 'fill="#6a5d48"') + chemin(`M${m + 1.2} 81.5L${m + 6} 73`, 'stroke="#6a5d48" stroke-width="1.6" stroke-linecap="round"');

  // Écume le long du rivage, petits bateaux et mer qui se fond avec celle du plateau.
  for (const xs of troncons) {
    s += chemin(`M${xs.map((x) => `${x} ${f(piedRochers(x) - 0.4 + Math.sin(x / 9) * 0.6)}`).join('L')}`, 'fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6"');
  }
  for (let i = 0; i < 70; i++) {
    const x = rng.entre(0, W);
    const y = rng.entre(192, 214);
    s += placer(x, 12, (xx) => chemin(`M${f(xx)} ${f(y)}h${f(rng.entre(3, 10))}`, `stroke="#fff" stroke-opacity="${o(rng.entre(0.12, 0.3))}" stroke-width="1"`));
  }
  for (let i = 0; i < 9; i++) {
    const x = rng.entre(0, W);
    if (sansRochers(x)) continue;
    const y = rng.entre(190, 196);
    const coque = rng.choix(['#fdfaf2', '#1f6fb5', '#e8553f']);
    s += placer(x, 12, (xx) => chemin(`M${f(xx)} ${f(y)}h10l-1.8 2.6h-6.4z`, `fill="${coque}"`) + (rng.suivant() < 0.5 ? chemin(`M${f(xx + 5)} ${f(y - 0.4)}v-8l4.5 7.6z`, 'fill="#fdfaf2"') : ''));
  }

  const defs = '<linearGradient id="montagnes" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#a9b9c8"/><stop offset=".7" stop-color="#c3cfd8"/></linearGradient>'
    + '<linearGradient id="contreforts" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#9aab9c"/><stop offset=".7" stop-color="#b3c0b0"/></linearGradient>'
    + '<linearGradient id="rocs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eee7d7"/><stop offset=".7" stop-color="#d3c8b0"/><stop offset="1" stop-color="#a49a84"/></linearGradient>'
    + '<linearGradient id="colline" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="#7f9a68"/><stop offset=".75" stop-color="#a5b484"/></linearGradient>'
    + '<linearGradient id="mer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d8fc1"/><stop offset=".45" stop-color="#2876ab"/><stop offset="1" stop-color="#1b5f92"/></linearGradient>'
    + '<linearGradient id="dore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#c9952a"/></linearGradient>'
    + '<radialGradient id="halo"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".7"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>'
    + '<pattern id="rayures" width="4" height="3.2" patternUnits="userSpaceOnUse"><rect width="4" height="3.2" fill="#efe6d2"/><rect y="2.1" width="4" height="1.1" fill="#8f9b88"/></pattern>'
    + '<pattern id="fenetres" width="4.6" height="5.5" patternUnits="userSpaceOnUse"><rect x=".6" y="1" width="2.2" height="3" fill="#4f6577" fill-opacity=".8"/></pattern>'
    + '<pattern id="balustres" width="3.4" height="6" patternUnits="userSpaceOnUse"><rect x="1" width="1.5" height="6" fill="#f3f0e8"/></pattern>';
  return svg(W, H, s, defs, 'xMidYMax meet');
}

// ---------------------------------------------------------------------------
// Génération des fichiers
// ---------------------------------------------------------------------------

export function genererImages() {
  return {
    'assets/batiments/maison-facade.svg': maisonFacade(),
    'assets/batiments/maison-arriere.svg': maisonArriere(),
    'assets/batiments/maison-pignon.svg': maisonPignon(),
    'assets/batiments/maison-toit.svg': maisonToit(),
    'assets/batiments/maison-toit-arriere.svg': maisonToit(true),
    'assets/batiments/maison-icone.svg': maisonIcone(),
    'assets/batiments/hotel-facade.svg': hotelFacade(),
    'assets/batiments/hotel-arriere.svg': hotelArriere(),
    'assets/batiments/hotel-cote.svg': hotelCote(),
    'assets/batiments/hotel-toit.svg': hotelToit(),
    'assets/batiments/hotel-icone.svg': hotelIcone(),
    'assets/decor/vagues.svg': vagues(),
    'assets/decor/reflets.svg': reflets(),
    'assets/decor/corniche.svg': panoramaCorniche(),
    'assets/decor/ponton.svg': ponton(),
    'assets/decor/feutre.svg': feutre()
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [chemin, contenu] of Object.entries(genererImages())) {
    const cible = join(RACINE, chemin);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu);
    console.log(`${chemin} (${(contenu.length / 1024).toFixed(1)} Ko)`);
  }
}
