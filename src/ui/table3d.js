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
  marge: 0.1         // distance entre le bord extérieur du tapis et l'étiquette du joueur
});

// Largeur d'un tapis selon le nombre de joueurs : les places se resserrent à 5 ou 6.
const LARGEURS = [0.9, 0.9, 0.9, 0.9, 0.9, 0.72, 0.62];

const RAD = Math.PI / 180;

// Direction d'une place : angle 0 devant, puis dans le sens des aiguilles d'une montre vu du dessus
// (comme le sens du jeu autour d'une vraie table).
export const direction = (angle) => ({ x: -Math.sin(angle * RAD), y: Math.cos(angle * RAD) });

// Demi-étendue du plateau carré dans une direction : un tapis posé au-delà ne le touche pas.
export const etendueCarre = (angle) => 0.5 * (Math.abs(Math.sin(angle * RAD)) + Math.abs(Math.cos(angle * RAD)));

// Places des `nombre` joueurs, réparties régulièrement autour du plateau ; le joueur `premier`
// (celui de l'écran en ligne, le premier sinon) est devant, les suivants dans l'ordre du jeu.
export function placesTable(nombre, premier = 0) {
  const largeur = LARGEURS[Math.min(nombre, LARGEURS.length - 1)];
  return Array.from({ length: nombre }, (_, joueur) => {
    const rang = (((joueur - premier) % nombre) + nombre) % nombre;
    const angle = rang * (360 / nombre);
    const d = direction(angle);
    const distance = etendueCarre(angle) + TABLE.ecart + TABLE.profondeur / 2;
    const exterieur = distance + TABLE.profondeur / 2 + TABLE.marge;
    return {
      joueur,
      angle,
      distance,
      largeur,
      profondeur: TABLE.profondeur,
      centre: { x: d.x * distance, y: d.y * distance },
      ancre: { x: d.x * exterieur, y: d.y * exterieur }
    };
  });
}

// Coins d'un tapis sur la table (pour vérifier qu'il ne chevauche rien).
export function coinsTapis(place) {
  const a = place.angle * RAD;
  const tangente = { x: Math.cos(a), y: Math.sin(a) };
  const d = direction(place.angle);
  const l = place.largeur / 2;
  const p = place.profondeur / 2;
  return [[-l, -p], [l, -p], [l, p], [-l, p]].map(([u, v]) => ({
    x: place.centre.x + u * tangente.x + v * d.x,
    y: place.centre.y + u * tangente.y + v * d.y
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
// (qui compte pour CUL_SEC gorgées). Au-delà de la place disponible, `reste` gorgées non montrées.
export function verres(gorgees = 0, culsSecs = 0) {
  const grandsTotal = Math.max(0, Math.floor(culsSecs) || 0);
  const petitsTotal = Math.max(0, (Math.floor(gorgees) || 0) - CUL_SEC * grandsTotal);
  const grands = Math.min(grandsTotal, VERRES.grandsMax);
  const petits = Math.min(petitsTotal, VERRES.petitsMax);
  return { petits, grands, reste: petitsTotal - petits + CUL_SEC * (grandsTotal - grands) };
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
