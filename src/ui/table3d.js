// Table de la vue 3D : places des joueurs autour du plateau, jetons de casino, verres et cartes.
// Module pur, sans DOM : ses calculs sont testés avec Node (tests/table3d.test.js).
//
// Les longueurs sont en largeurs de plateau. L'origine est le centre du plateau ; l'axe y pointe
// vers la place de devant (face à la caméra de départ) et x vers la droite.
import { CUL_SEC } from '../moteur/pastis.js';

export const TABLE = Object.freeze({
  rayon: 1.25,       // rayon du ponton sur lequel est posé le plateau
  ecart: 0.06,       // espace entre le plateau et les tapis des joueurs
  profondeur: 0.34,  // profondeur d'un tapis
  marge: 0.1,        // distance entre le bord extérieur du tapis et l'étiquette du joueur
  largeur: 0.9,      // largeur d'un tapis seul face à un côté du plateau
  largeurPartagee: 0.47, // largeur de chacun des deux tapis d'un côté partagé
  ecartPartage: 0.06 // espace entre les deux tapis d'un côté partagé
});

// Côtés du plateau, dans l'ordre du jeu (le sens des aiguilles d'une montre vu du dessus, comme
// autour d'une vraie table) : devant, à gauche, au fond, à droite.
const COTES = [0, 90, 180, 270];
// Nombre de joueurs assis face à chaque côté (dans l'ordre de COTES), selon le nombre de joueurs.
// Chacun voit ainsi le plateau bien en face ; à 5 et 6, deux joueurs partagent un côté.
const REPARTITION = [[1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 0, 1], [1, 1, 1, 1], [1, 1, 2, 1], [1, 2, 1, 2]];

const RAD = Math.PI / 180;

// Direction d'une place, depuis le centre du plateau : angle 0 devant, 90 à gauche, 180 au fond…
export const direction = (angle) => ({ x: -Math.sin(angle * RAD), y: Math.cos(angle * RAD) });
// Droite d'un joueur assis à la place d'angle `angle`, face au plateau.
export const tangente = (angle) => ({ x: Math.cos(angle * RAD), y: Math.sin(angle * RAD) });

// Places des `nombre` joueurs, face aux côtés du plateau ; le joueur `premier` (celui de l'écran
// en ligne, le premier sinon) est devant, les suivants dans l'ordre du jeu. `decalage` : position
// du tapis le long de son côté, vers la droite de qui y est assis.
export function placesTable(nombre, premier = 0) {
  const sieges = [];
  REPARTITION[Math.min(Math.max(nombre, 1), REPARTITION.length) - 1].forEach((n, cote) => {
    const largeur = n > 1 ? TABLE.largeurPartagee : TABLE.largeur;
    for (let k = 0; k < n; k++) {
      // Sur un côté partagé, le premier dans l'ordre du jeu est à droite : le jeu passe à gauche.
      const decalage = n > 1 ? (k === 0 ? 1 : -1) * (largeur + TABLE.ecartPartage) / 2 : 0;
      sieges.push({ angle: COTES[cote], decalage, largeur });
    }
  });
  const distance = 0.5 + TABLE.ecart + TABLE.profondeur / 2;
  const exterieur = distance + TABLE.profondeur / 2 + TABLE.marge;
  return Array.from({ length: nombre }, (_, joueur) => {
    const rang = (((joueur - premier) % nombre) + nombre) % nombre;
    const { angle, decalage, largeur } = sieges[rang];
    const d = direction(angle);
    const t = tangente(angle);
    const point = (r) => ({ x: d.x * r + t.x * decalage, y: d.y * r + t.y * decalage });
    return { joueur, angle, decalage, distance, largeur, profondeur: TABLE.profondeur, centre: point(distance), ancre: point(exterieur) };
  });
}

// Coins d'un tapis sur la table (pour vérifier qu'il ne chevauche rien).
export function coinsTapis(place) {
  const t = tangente(place.angle);
  const d = direction(place.angle);
  const l = place.largeur / 2;
  const p = place.profondeur / 2;
  return [[-l, -p], [l, -p], [l, p], [-l, p]].map(([u, v]) => ({
    x: place.centre.x + u * t.x + v * d.x,
    y: place.centre.y + u * t.y + v * d.y
  }));
}

// ---------------------------------------------------------------------------
// Jetons de casino
// ---------------------------------------------------------------------------

// Couleurs habituelles des jetons de casino.
export const JETONS = Object.freeze([
  { valeur: 500, couleur: '#6c2d91', bord: '#f3e3ff' },
  { valeur: 100, couleur: '#24262b', bord: '#f2f2f2' },
  { valeur: 20, couleur: '#1e8449', bord: '#f2f2f2' },
  { valeur: 5, couleur: '#c0392b', bord: '#f2f2f2' },
  { valeur: 1, couleur: '#f4f1ea', bord: '#2a6fb5' }
]);
export const PILE_MAX = 10;        // jetons par pile
export const PILES_PAR_VALEUR = 4; // au-delà, la pile la plus haute suffit à montrer la fortune

// Piles de jetons représentant `montant` : les jetons de 500 € n'apparaissent qu'au-delà de 1 000 €,
// pour garder des piles de 100 € bien visibles ; chaque pile compte au plus 10 jetons.
export function jetons(montant) {
  let reste = Math.max(0, Math.floor(Number(montant) || 0));
  const comptes = new Map();
  const n500 = reste >= 1000 ? Math.floor((reste - 500) / 500) : 0;
  comptes.set(500, n500);
  reste -= n500 * 500;
  for (const valeur of [100, 20, 5, 1]) {
    comptes.set(valeur, Math.floor(reste / valeur));
    reste -= comptes.get(valeur) * valeur;
  }
  const piles = [];
  for (const jeton of JETONS) {
    let n = comptes.get(jeton.valeur);
    for (let k = 0; n > 0 && k < PILES_PAR_VALEUR; k++) {
      const pile = Math.min(PILE_MAX, n);
      piles.push({ ...jeton, nombre: pile });
      n -= pile;
    }
  }
  return piles;
}

// ---------------------------------------------------------------------------
// Verres du mode Pastis
// ---------------------------------------------------------------------------

export const VERRES = Object.freeze({ petitsMax: 20, grandsMax: 4, parRangee: 5 });

// Verres bus par un joueur : un verre à shooter par gorgée, un grand verre par cul sec
// (qui compte pour CUL_SEC gorgées). Au-delà de la place disponible (`petitsMax` verres à
// shooter), `reste` gorgées non montrées.
export function verres(gorgees = 0, culsSecs = 0, petitsMax = VERRES.petitsMax) {
  const grandsTotal = Math.max(0, Math.floor(culsSecs) || 0);
  const petitsTotal = Math.max(0, (Math.floor(gorgees) || 0) - CUL_SEC * grandsTotal);
  const grands = Math.min(grandsTotal, VERRES.grandsMax);
  const petits = Math.min(petitsTotal, petitsMax);
  return { petits, grands, reste: petitsTotal - petits + CUL_SEC * (grandsTotal - grands) };
}

// ---------------------------------------------------------------------------
// Objets debout sur un tapis
// ---------------------------------------------------------------------------

// Largeurs (en largeurs de plateau) des objets debout, et rangées où ils sont posés (profondeur
// depuis le bord du tapis côté plateau) : les cartes occupent le haut du tapis.
export const OBJETS = Object.freeze({
  pile: 0.046, verre: 0.025, grandVerre: 0.031,
  rangeeJetons: 0.3, rangeesVerres: [0.215, 0.245, 0.275, 0.305], rangeesGrands: [0.245, 0.305],
  pasPiles: 0.055, pasVerres: 0.028, pasGrands: 0.042
});

// Disposition des objets debout sur un tapis de largeur `largeur` (abscisses depuis le bord gauche
// du tapis, vu de la place) : les piles de jetons à gauche et, en mode Pastis (`boisson` : gorgées
// et culs secs du joueur), les verres à droite, grands verres au bout. Sur un tapis étroit, les
// rangées de verres sont plus courtes et les piles se serrent.
export function dispositionObjets(largeur, nbPiles, boisson = null) {
  const o = OBJETS;
  const resultat = { piles: [], petits: [], grands: [], reste: null };
  let limite = largeur - 0.04; // bord droit des piles de jetons
  if (boisson) {
    const parRangee = largeur >= 0.6 ? VERRES.parRangee : 3;
    const v = verres(boisson.gorgees, boisson.culsSecs, parRangee * o.rangeesVerres.length);
    const colonneGrands = (k) => largeur - 0.045 - k * o.pasGrands;
    const debut = colonneGrands(1) - 0.068 - (parRangee - 1) * o.pasVerres;
    for (let k = 0; k < v.petits; k++) {
      resultat.petits.push({ x: debut + (k % parRangee) * o.pasVerres, y: o.rangeesVerres[Math.floor(k / parRangee)] });
    }
    for (let k = 0; k < v.grands; k++) {
      resultat.grands.push({ x: colonneGrands(Math.floor(k / 2)), y: o.rangeesGrands[k % 2] });
    }
    if (v.reste) resultat.reste = { x: debut - 0.03, y: o.rangeeJetons, nombre: v.reste };
    limite = debut - 0.055;
  }
  const premiere = 0.06;
  const derniere = limite - o.pile / 2;
  const pas = nbPiles > 1 ? Math.min(o.pasPiles, Math.max(0, derniere - premiere) / (nbPiles - 1)) : 0;
  for (let k = 0; k < nbPiles; k++) resultat.piles.push({ x: premiere + k * pas, y: o.rangeeJetons });
  return resultat;
}

// ---------------------------------------------------------------------------
// Cartes de propriété
// ---------------------------------------------------------------------------

export const CARTE = Object.freeze({ largeur: 0.075, hauteur: 0.1, decalage: 0.028 });

// Une colonne de cartes par quartier (ou par famille : stations, compagnies), dans l'ordre du plateau.
export function colonnesCartes(indices, plateau) {
  const colonnes = new Map();
  for (const index of [...indices].sort((a, b) => a - b)) {
    const c = plateau.cases[index];
    const cle = c.type === 'propriete' ? c.groupe : c.type;
    if (!colonnes.has(cle)) colonnes.set(cle, []);
    colonnes.get(cle).push(index);
  }
  return [...colonnes.entries()].map(([cle, cases]) => ({ cle, cases }));
}

// Abscisse (le long du tapis, depuis son bord gauche) de chaque colonne : écartées d'au plus
// une carte et demie, resserrées (en se chevauchant) s'il y en a beaucoup, centrées sur le tapis.
export function abscissesColonnes(nombre, largeurTapis) {
  if (!nombre) return [];
  const utile = largeurTapis - 0.04 - CARTE.largeur;
  const pas = nombre > 1 ? Math.min(CARTE.largeur * 1.15, utile / (nombre - 1)) : 0;
  const debut = (largeurTapis - pas * (nombre - 1) - CARTE.largeur) / 2;
  return Array.from({ length: nombre }, (_, k) => debut + k * pas);
}
