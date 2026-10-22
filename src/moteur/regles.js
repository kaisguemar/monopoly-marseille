// Calculs purs dérivés de l'état : loyers, groupes, patrimoine.
// Aucune fonction de ce module ne modifie l'état.

export const ARGENT_INITIAL = 1500;
export const SALAIRE_DEPART = 200;
export const AMENDE_PRISON = 50;
export const STOCK_MAISONS = 32;
export const STOCK_HOTELS = 12;
export const CASE_PRISON = 10;
export const HOTEL = 5; // niveau de construction représentant un hôtel

export const estAchetable = (c) => c.type === 'propriete' || c.type === 'gare' || c.type === 'compagnie';

// Indices des cases d'un même groupe de couleur.
export function casesDuGroupe(plateau, groupe) {
  return plateau.cases.filter((c) => c.type === 'propriete' && c.groupe === groupe).map((c) => c.index);
}

// Indices des cases « sœurs » d'une case achetable (même groupe, ou toutes les gares, ou les compagnies).
export function casesSoeurs(plateau, index) {
  const c = plateau.cases[index];
  if (c.type === 'propriete') return casesDuGroupe(plateau, c.groupe);
  return plateau.cases.filter((x) => x.type === c.type).map((x) => x.index);
}

export function possedeGroupe(etat, plateau, joueurId, groupe) {
  return casesDuGroupe(plateau, groupe).every((i) => etat.proprietes[i].proprietaire === joueurId);
}

export function proprietesDe(etat, joueurId) {
  return Object.keys(etat.proprietes).map(Number).filter((i) => etat.proprietes[i].proprietaire === joueurId);
}

// Loyer dû en arrivant sur la case `index` (0 si libre ou hypothéquée).
export function calculerLoyer(etat, plateau, index, totalDes = 0) {
  const c = plateau.cases[index];
  const p = etat.proprietes[index];
  if (!p || p.proprietaire === null || p.hypotheque) return 0;
  const nbPossedees = casesSoeurs(plateau, index).filter((i) => etat.proprietes[i].proprietaire === p.proprietaire).length;
  if (c.type === 'gare') return c.loyers[nbPossedees - 1];
  if (c.type === 'compagnie') return c.multiplicateurs[nbPossedees - 1] * totalDes;
  if (p.maisons > 0) return c.loyers[p.maisons];
  return possedeGroupe(etat, plateau, p.proprietaire, c.groupe) ? c.loyers[0] * 2 : c.loyers[0];
}

// Nombre de maisons et d'hôtels possédés par un joueur.
export function compterConstructions(etat, joueurId) {
  let maisons = 0, hotels = 0;
  for (const p of Object.values(etat.proprietes)) {
    if (p.proprietaire !== joueurId) continue;
    if (p.maisons === HOTEL) hotels++;
    else maisons += p.maisons;
  }
  return { maisons, hotels };
}

// Coût de levée d'une hypothèque : valeur hypothécaire + 10 %, arrondi à l'euro supérieur.
export const coutLevee = (c) => Math.ceil(c.hypotheque * 1.1);

// Patrimoine : argent + valeur des propriétés (nette d'hypothèque) + constructions au prix d'achat.
export function patrimoine(etat, plateau, joueurId) {
  const j = etat.joueurs[joueurId];
  let total = j.argent;
  for (const i of proprietesDe(etat, joueurId)) {
    const c = plateau.cases[i];
    const p = etat.proprietes[i];
    total += p.hypotheque ? c.prix - c.hypotheque : c.prix;
    if (p.maisons) total += p.maisons * c.prixMaison;
  }
  return total;
}

// Argent qu'un joueur peut réunir en vendant toutes ses constructions et en hypothéquant tout.
export function valeurLiquidable(etat, plateau, joueurId) {
  let total = etat.joueurs[joueurId].argent;
  for (const i of proprietesDe(etat, joueurId)) {
    const c = plateau.cases[i];
    const p = etat.proprietes[i];
    if (p.maisons) total += (p.maisons * c.prixMaison) / 2;
    if (!p.hypotheque) total += c.hypotheque;
  }
  return Math.floor(total);
}
