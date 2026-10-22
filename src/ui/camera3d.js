// Caméra de la vue 3D : orientation du plateau (azimut), inclinaison, zoom et décalage.
// Module pur, sans DOM : ses calculs sont testés avec Node (tests/camera3d.test.js).
//
// Les distances sont exprimées en largeurs de vue. Les constantes d'ÉCRAN reprennent celles
// de src/styles/vue3d.css (perspective, position et taille du plateau) : les garder accordées.

export const ECRAN = Object.freeze({
  perspective: 2.4,            // distance de la caméra (perspective: 240cqi)
  origineY: 0.2,               // point de fuite à 20 % de la hauteur de la vue
  echelle: 0.74,               // taille du plateau au zoom 1
  decalageY: 0.02,             // position verticale du plateau
  rayonMer: 0.8,               // rayon du disque de mer autour du centre du plateau
  panorama: 0.2,               // hauteur du panorama de la Corniche
  rapportPanorama: 3600 / 220, // largeur / hauteur de l'image du panorama (un tour complet)
  recouvrement: 0.13           // part basse du panorama (la mer) recouverte par la mer du plateau
});

export const LIMITES = Object.freeze({ inclinaison: [15, 72], zoom: [0.6, 2.6], decalage: 0.55 });

export const CAMERA_DEFAUT = Object.freeze({ azimut: 0, inclinaison: 54, zoom: 1, decalageX: 0, decalageY: 0 });

const RAD = Math.PI / 180;
const borner = (x, min, max) => Math.min(max, Math.max(min, x));
const nombre = (x, defaut) => (typeof x === 'number' && Number.isFinite(x) ? x : defaut);

// Caméra de départ : un peu moins inclinée sur les petits écrans, pour garder les cases lisibles.
export function cameraParDefaut(largeurEcran = 1000) {
  return { ...CAMERA_DEFAUT, inclinaison: largeurEcran < 600 ? 50 : CAMERA_DEFAUT.inclinaison };
}

// Ramène une caméra dans les limites autorisées (valeurs manquantes ou invalides : par défaut).
// Le décalage permis grandit avec le zoom, pour pouvoir aller voir chaque coin du plateau.
export function bornerCamera(c = {}) {
  const zoom = borner(nombre(c.zoom, CAMERA_DEFAUT.zoom), ...LIMITES.zoom);
  const decalageMax = LIMITES.decalage * zoom;
  return {
    azimut: nombre(c.azimut, CAMERA_DEFAUT.azimut),
    inclinaison: borner(nombre(c.inclinaison, CAMERA_DEFAUT.inclinaison), ...LIMITES.inclinaison),
    zoom,
    decalageX: borner(nombre(c.decalageX, 0), -decalageMax, decalageMax),
    decalageY: borner(nombre(c.decalageY, 0), -decalageMax, decalageMax)
  };
}

// Glisser (dx, dy en largeurs de vue) : toute la largeur fait tourner le plateau d'un demi-tour,
// le pousser vers le haut le couche davantage (vue plus rasante).
export function orbiter(c, dx, dy) {
  return bornerCamera({ ...c, azimut: c.azimut - dx * 180, inclinaison: c.inclinaison - dy * 90 });
}

// Faire glisser le plateau sans le tourner.
export function deplacer(c, dx, dy) {
  return bornerCamera({ ...c, decalageX: c.decalageX + dx, decalageY: c.decalageY + dy });
}

// Zoom de `facteur` en gardant immobile le point visé : position à l'écran relative au centre
// du plateau (le point sous la souris, ou entre les deux doigts).
export function zoomer(c, facteur, vise = { x: 0, y: 0 }) {
  const zoom = borner(c.zoom * facteur, ...LIMITES.zoom);
  const recul = 1 - zoom / c.zoom;
  return bornerCamera({ ...c, zoom, decalageX: c.decalageX + vise.x * recul, decalageY: c.decalageY + vise.y * recul });
}

// Azimut « de face » le plus proche : revenir à la vue de départ sans faire de tour inutile.
export const azimutDeFace = (azimut) => Math.round(azimut / 360) * 360;

// Position intermédiaire entre deux caméras (animations), t de 0 à 1.
export function interpoler(a, b, t) {
  const milieu = (cle) => a[cle] + (b[cle] - a[cle]) * t;
  return {
    azimut: milieu('azimut'),
    inclinaison: milieu('inclinaison'),
    zoom: milieu('zoom'),
    decalageX: milieu('decalageX'),
    decalageY: milieu('decalageY')
  };
}

// Position à l'écran d'un point du plateau ({ x, y, z } depuis son centre, en largeurs de vue),
// selon les transformations CSS de la scène : décalage, rotateX(inclinaison), rotateZ(azimut),
// mise à l'échelle, puis perspective. `hauteurVue` : hauteur de la vue / largeur.
export function projeter(c, { x, y, z = 0 }, hauteurVue) {
  const k = ECRAN.echelle * c.zoom;
  const az = c.azimut * RAD;
  const inc = c.inclinaison * RAD;
  const rx = k * (x * Math.cos(az) - y * Math.sin(az));
  const ry = k * (x * Math.sin(az) + y * Math.cos(az));
  const rz = k * z;
  const X = 0.5 + rx + c.decalageX;
  const Y = 0.5 + ry * Math.cos(inc) - rz * Math.sin(inc) + c.decalageY + ECRAN.decalageY;
  const Z = ry * Math.sin(inc) + rz * Math.cos(inc);
  const fuite = ECRAN.perspective / (ECRAN.perspective - Z);
  const oy = ECRAN.origineY * hauteurVue;
  return { x: 0.5 + (X - 0.5) * fuite, y: oy + (Y - oy) * fuite };
}

// Horizon : le bas du panorama de la Corniche se pose sur le bord lointain de la mer, et l'image
// défile quand le plateau tourne (un tour complet = toute la largeur du panorama).
export function horizon(c, hauteurVue) {
  const az = c.azimut * RAD;
  const r = ECRAN.rayonMer;
  const bord = projeter(c, { x: -r * Math.sin(az), y: -r * Math.cos(az) }, hauteurVue);
  return {
    y: bord.y + ECRAN.recouvrement * ECRAN.panorama,
    decalage: (c.azimut / 360) * ECRAN.panorama * ECRAN.rapportPanorama
  };
}

// Lecture et écriture de la caméra mémorisée (null si absente ou illisible).
export function lireCamera(texte) {
  if (!texte) return null;
  try {
    const c = JSON.parse(texte);
    return c && typeof c === 'object' ? bornerCamera(c) : null;
  } catch {
    return null;
  }
}

export function ecrireCamera(c) {
  const arrondi = (x, n = 3) => Number(x.toFixed(n));
  const azimut = ((c.azimut % 360) + 540) % 360 - 180;
  return JSON.stringify({
    azimut: arrondi(azimut, 1),
    inclinaison: arrondi(c.inclinaison, 1),
    zoom: arrondi(c.zoom),
    decalageX: arrondi(c.decalageX),
    decalageY: arrondi(c.decalageY)
  });
}
