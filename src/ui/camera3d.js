// Caméra de la vue 3D : orientation du plateau (azimut), inclinaison, zoom et décalage.
// Module pur, sans DOM : ses calculs sont testés avec Node (tests/camera3d.test.js).
//
// Les distances sont exprimées en largeurs de « scène » : le cadre de référence de la caméra,
// de proportions fixes, au milieu de l'écran (voir cadreScene ; le décor déborde tout autour).
// Les constantes d'ÉCRAN reprennent celles de src/styles/vue3d.css : les garder accordées.

export const ECRAN = Object.freeze({
  hauteurVue: 0.84,            // hauteur de la scène / largeur
  perspective: 2.4,            // distance de la caméra (perspective : 2,4 largeurs de scène)
  origineY: 0.2,               // point de fuite à 20 % de la hauteur de la scène
  echelle: 0.74,               // taille du plateau au zoom 1
  decalageY: 0,                // position verticale du plateau
  rayonMer: 1.7,               // rayon du disque de mer autour du centre du plateau (en plateaux)
  panorama: 0.18,              // hauteur du panorama de la Corniche
  rapportPanorama: 3600 / 220, // largeur / hauteur de l'image du panorama (un tour complet)
  recouvrement: 0.13           // part basse du panorama (la mer) recouverte par la mer du plateau
});

export const LIMITES = Object.freeze({ inclinaison: [15, 72], zoom: [0.4, 2.6], decalage: 0.55 });

// Cadrage de la vue de départ, qui est aussi celle de chaque joueur quand la caméra suit la partie :
// le plateau au milieu de l'écran, assez près pour lire les noms des rues de la rangée de devant,
// et devant soi le tapis du joueur, ses cartes et ses jetons. La Corniche est alors hors champ :
// on la retrouve en dézoomant.
// Sur téléphone, l'écran est étroit : le plateau reste un peu plus loin, pour que les étiquettes
// des joueurs de gauche et de droite n'en cachent pas trop, et la Corniche reste visible.
export const CADRAGE = Object.freeze({ inclinaison: 60, zoom: 1, decalageY: -0.145 });
export const CADRAGE_TELEPHONE = Object.freeze({ inclinaison: 58, zoom: 0.82, decalageY: 0.06 });
export const LARGEUR_TELEPHONE = 700; // même seuil que la mise en page pour téléphone (vue3d.css)

export const CAMERA_DEFAUT = Object.freeze({ azimut: 0, decalageX: 0, ...CADRAGE });

const RAD = Math.PI / 180;
const borner = (x, min, max) => Math.min(max, Math.max(min, x));
const nombre = (x, defaut) => (typeof x === 'number' && Number.isFinite(x) ? x : defaut);

export const cadrage = (largeurEcran = 1000) => (largeurEcran <= LARGEUR_TELEPHONE ? CADRAGE_TELEPHONE : CADRAGE);

export function cameraParDefaut(largeurEcran = 1000) {
  return { ...CAMERA_DEFAUT, ...cadrage(largeurEcran) };
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
    decalageX: borner(nombre(c.decalageX, CAMERA_DEFAUT.decalageX), -decalageMax, decalageMax),
    decalageY: borner(nombre(c.decalageY, CAMERA_DEFAUT.decalageY), -decalageMax, decalageMax)
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

// Azimut le plus proche de `actuel` qui amène devant soi la place d'angle `angle` (voir table3d.js) :
// la table tourne par le plus court chemin.
export function azimutVers(actuel, angle) {
  return actuel + ((((-angle - actuel) % 360) + 540) % 360) - 180;
}

// Vue d'un joueur, quand la caméra suit la partie (sur un même écran) : le cadrage de la vue de
// départ, tourné pour amener sa place devant soi. Le plateau reste au milieu, même pour qui
// partage un côté avec un autre joueur.
export function vueJoueur(place, actuelle = CAMERA_DEFAUT, largeurEcran = 1000) {
  return { ...cameraParDefaut(largeurEcran), azimut: azimutVers(actuelle.azimut, place.angle) };
}

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

// Position dans la scène d'un point du plateau ({ x, y, z } depuis son centre, en largeurs de
// plateau), selon les transformations CSS : décalage, rotateX(inclinaison), rotateZ(azimut),
// mise à l'échelle, puis perspective. `fuite` : grossissement dû à la perspective en ce point.
export function projeter(c, { x, y, z = 0 }, hauteurVue = ECRAN.hauteurVue) {
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
  return { x: 0.5 + (X - 0.5) * fuite, y: oy + (Y - oy) * fuite, fuite };
}

// Horizon : le bas du panorama de la Corniche se pose sur le bord lointain de la mer, et l'image
// défile quand le plateau tourne (un tour complet = toute la largeur du panorama).
export function horizon(c, hauteurVue = ECRAN.hauteurVue) {
  const az = c.azimut * RAD;
  const r = ECRAN.rayonMer;
  const bord = projeter(c, { x: -r * Math.sin(az), y: -r * Math.cos(az) }, hauteurVue);
  return {
    y: bord.y + ECRAN.recouvrement * ECRAN.panorama,
    decalage: (c.azimut / 360) * ECRAN.panorama * ECRAN.rapportPanorama
  };
}

// Bord droit du plateau à l'écran, au-dessus de la hauteur `yMax` (en largeurs de scène ; -Infinity
// si le plateau est tout entier plus bas).
export function bordDroit(c, yMax, hauteurVue = ECRAN.hauteurVue) {
  const coins = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => projeter(c, { x, y }, hauteurVue));
  let droite = -Infinity;
  coins.forEach((a, k) => {
    const b = coins[(k + 1) % coins.length];
    if (a.y <= yMax) droite = Math.max(droite, a.x);
    if ((a.y - yMax) * (b.y - yMax) < 0) droite = Math.max(droite, a.x + ((b.x - a.x) * (yMax - a.y)) / (b.y - a.y));
  });
  return droite;
}

const MARGE_PANNEAU = 12; // px entre la scène et le panneau des actions
// Hauteur du panneau des actions au tour d'un joueur (le tour, ses quatre boutons, l'abandon) :
// la scène s'écarte de lui d'après cette hauteur, et ne bouge donc pas quand il s'allonge ou
// raccourcit d'un tour à l'autre.
export const HAUTEUR_PANNEAU = 380;

// Cadre de la scène dans l'écran (en px) : la plus grande scène aux proportions de ECRAN qui tienne
// dans l'espace laissé libre par le panneau des actions (`panneau` : son rectangle, ou null), à
// droite sur grand écran, en bas sur téléphone. Elle se place au milieu de l'écran, pour que le
// plateau y soit centré : le panneau n'en occupe que le coin en haut à droite. Si, dans la vue de
// départ (`camera`), le plateau passait sous le panneau, elle s'en écarte juste ce qu'il faut, au
// plus jusqu'au milieu de l'espace libre.
export function cadreScene(ecran, panneau = null, camera = CAMERA_DEFAUT) {
  const libre = { gauche: 0, haut: 0, droite: ecran.largeur, bas: ecran.hauteur };
  const aDroite = Boolean(panneau) && panneau.gauche > ecran.largeur / 2;
  if (aDroite) libre.droite = Math.max(ecran.largeur / 2, panneau.gauche - MARGE_PANNEAU);
  else if (panneau && panneau.haut > ecran.hauteur * 0.35) libre.bas = ecran.hauteur * 0.6;
  const largeurLibre = libre.droite - libre.gauche;
  const hauteurLibre = libre.bas - libre.haut;
  const largeur = Math.max(160, Math.min(largeurLibre, hauteurLibre / ECRAN.hauteurVue));
  const haut = libre.haut + (hauteurLibre - largeur * ECRAN.hauteurVue) / 2;
  let gauche = (ecran.largeur - largeur) / 2;
  if (aDroite) {
    const bas = (panneau.haut + HAUTEUR_PANNEAU - haut) / largeur;
    const auMilieuDuLibre = libre.gauche + (largeurLibre - largeur) / 2;
    gauche = Math.max(auMilieuDuLibre, Math.min(gauche, libre.droite - bordDroit(camera, bas) * largeur));
  }
  return { largeur, hauteur: largeur * ECRAN.hauteurVue, gauche, haut };
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
