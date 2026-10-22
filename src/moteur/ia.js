// Intelligence artificielle des joueurs ordinateur.
// `deciderAction(partie)` retourne la prochaine action du joueur actif (s'il est ordinateur),
// sans modifier l'état : c'est le contrôleur qui l'exécute via `partie.executer()`.
import {
  AMENDE_PRISON, HOTEL, casesDuGroupe, casesSoeurs, possedeGroupe, proprietesDe, coutLevee
} from './regles.js';

const RESERVE_ACHAT = 120;      // argent gardé de côté après un achat ordinaire
const RESERVE_CONSTRUCTION = 250;
const RESERVE_LEVEE = 400;

// Nombre de propriétés d'un groupe (ou de gares / compagnies) possédées par un joueur.
function nbPossedees(etat, plateau, joueurId, index) {
  return casesSoeurs(plateau, index).filter((i) => etat.proprietes[i].proprietaire === joueurId).length;
}

// Une case compléterait-elle un groupe si le joueur l'obtenait ?
function completeGroupe(etat, plateau, joueurId, index) {
  const soeurs = casesSoeurs(plateau, index);
  return soeurs.every((i) => i === index || etat.proprietes[i].proprietaire === joueurId);
}

// Valeur estimée d'une propriété pour un joueur.
export function valeurPour(etat, plateau, joueurId, index) {
  const c = plateau.cases[index];
  let valeur = etat.proprietes[index].hypotheque ? c.prix - c.hypotheque * 1.1 : c.prix;
  if (completeGroupe(etat, plateau, joueurId, index)) valeur *= c.type === 'propriete' ? 1.8 : 1.3;
  else if (nbPossedees(etat, plateau, joueurId, index) > 0) valeur *= 1.2;
  // Bloquer un adversaire qui compléterait son groupe vaut aussi quelque chose.
  const autres = etat.joueurs.filter((j) => !j.faillite && j.id !== joueurId);
  if (autres.some((j) => completeGroupe(etat, plateau, j.id, index))) valeur *= 1.25;
  return valeur;
}

// Poids donnés aux quartiers complets dans l'évaluation d'un échange :
// compléter un de ses quartiers vaut cher, en offrir un à l'adversaire coûte un peu moins.
const POIDS_MES_QUARTIERS = 1.5;
const POIDS_QUARTIERS_ADVERSES = 0.7;
const SEUIL_ACCEPTATION = 20;

// Somme des prix des quartiers complets d'un joueur.
function valeurQuartiers(etat, plateau, joueurId) {
  return Object.keys(plateau.groupes)
    .filter((g) => possedeGroupe(etat, plateau, joueurId, g))
    .reduce((somme, g) => somme + casesDuGroupe(plateau, g).reduce((s, i) => s + plateau.cases[i].prix, 0), 0);
}

const valeurBrute = (etat, plateau, i) => {
  const c = plateau.cases[i];
  return etat.proprietes[i].hypotheque ? c.prix - Math.ceil(c.hypotheque * 1.1) : c.prix;
};

// Évalue un échange du point de vue du joueur `moi` (positif = favorable).
export function evaluerEchange(etat, plateau, echange, moi) {
  const jeRecois = echange.a === moi ? echange.donne : echange.recoit;
  const jeDonne = echange.a === moi ? echange.recoit : echange.donne;
  const autre = echange.a === moi ? echange.de : echange.a;
  const simulation = { ...etat, proprietes: structuredClone(etat.proprietes) };
  for (const i of jeRecois.proprietes) simulation.proprietes[i].proprietaire = moi;
  for (const i of jeDonne.proprietes) simulation.proprietes[i].proprietaire = autre;
  let gain = (jeRecois.argent ?? 0) - (jeDonne.argent ?? 0) + ((jeRecois.cartes ?? 0) - (jeDonne.cartes ?? 0)) * 40;
  for (const i of jeRecois.proprietes) gain += valeurBrute(etat, plateau, i);
  for (const i of jeDonne.proprietes) gain -= valeurBrute(etat, plateau, i);
  gain += POIDS_MES_QUARTIERS * (valeurQuartiers(simulation, plateau, moi) - valeurQuartiers(etat, plateau, moi));
  gain -= POIDS_QUARTIERS_ADVERSES * (valeurQuartiers(simulation, plateau, autre) - valeurQuartiers(etat, plateau, autre));
  return gain;
}

// Montant maximal qu'un ordinateur accepte de payer pour une propriété aux enchères.
export function limiteEnchere(etat, plateau, joueurId, index) {
  const j = etat.joueurs[joueurId];
  const valeur = valeurPour(etat, plateau, joueurId, index);
  return Math.floor(Math.min(valeur, j.argent - 50));
}

export function deciderAction(partie) {
  const { etat, plateau } = partie;
  const id = partie.joueurActif();
  if (id === null) return null;
  const j = etat.joueurs[id];
  const a = etat.attente;

  // Enchère : surenchérir jusqu'à sa limite.
  if (a?.type === 'enchere') {
    const limite = limiteEnchere(etat, plateau, id, a.case);
    if (a.meilleur !== id && a.mise < limite) {
      const pas = a.mise < 100 ? 10 : 20;
      return { type: 'encherir', joueur: id, montant: Math.min(limite, a.mise + pas) };
    }
    return { type: 'passerEnchere', joueur: id };
  }

  // Échange proposé : accepter s'il est favorable.
  if (etat.echange) {
    const gain = evaluerEchange(etat, plateau, etat.echange, id);
    return { type: 'repondreEchange', joueur: id, accepter: gain > SEUIL_ACCEPTATION };
  }

  // Dette : payer, sinon vendre / hypothéquer, sinon faillite.
  if (etat.dettes.length) {
    const d = etat.dettes[0];
    if (j.argent >= d.montant) return { type: 'payerDette', joueur: id };
    return actionLiquidation(etat, plateau, id) ?? { type: 'declarerFaillite', joueur: id };
  }

  if (a?.type === 'achat') {
    const c = plateau.cases[a.case];
    const strategique = completeGroupe(etat, plateau, id, a.case) || nbPossedees(etat, plateau, id, a.case) > 0;
    const reserve = strategique ? 0 : RESERVE_ACHAT;
    if (j.argent - c.prix >= reserve) return { type: 'acheter', joueur: id };
    // Hypothéquer une propriété isolée pour compléter un groupe.
    if (completeGroupe(etat, plateau, id, a.case) && c.type === 'propriete') {
      const hyp = actionHypotheque(etat, plateau, id, true, casesSoeurs(plateau, a.case));
      if (hyp) return hyp;
    }
    return { type: 'refuserAchat', joueur: id };
  }

  if (a?.type === 'choix_amende') {
    return { type: 'choisirAmende', joueur: id, choix: j.argent >= a.montant + 100 ? 'payer' : 'chance' };
  }

  // Tour normal.
  if (j.enPrison && !etat.aLance) {
    const libres = Object.values(etat.proprietes).filter((p) => p.proprietaire === null).length;
    const debutDePartie = libres > 8;
    if (debutDePartie && j.cartesSortie.length) return { type: 'utiliserCarteSortie', joueur: id };
    if (debutDePartie && j.argent >= AMENDE_PRISON + 200) return { type: 'payerPrison', joueur: id };
    return { type: 'lancer', joueur: id };
  }

  const gestion = actionLevee(etat, plateau, id) ?? actionConstruction(etat, plateau, id) ?? actionEchange(partie, id);
  if (gestion) return gestion;

  if (!etat.aLance || etat.peutRejouer) return { type: 'lancer', joueur: id };
  return { type: 'finirTour', joueur: id };
}

// Vend une construction (sur le terrain le plus bâti) ou hypothèque une propriété.
function actionLiquidation(etat, plateau, id) {
  let meilleure = null;
  for (const i of proprietesDe(etat, id)) {
    const p = etat.proprietes[i];
    if (!p.maisons) continue;
    const c = plateau.cases[i];
    const max = Math.max(...casesDuGroupe(plateau, c.groupe).map((k) => etat.proprietes[k].maisons));
    if (p.maisons !== max) continue;
    if (!meilleure || p.maisons > etat.proprietes[meilleure].maisons) meilleure = i;
  }
  if (meilleure !== null) return { type: 'vendreConstruction', joueur: id, case: meilleure };
  return actionHypotheque(etat, plateau, id, false);
}

// Hypothèque la propriété la moins utile (hors groupes complets si possible).
function actionHypotheque(etat, plateau, id, seulementIsolees, exclues = []) {
  const candidates = proprietesDe(etat, id).filter((i) => {
    if (exclues.includes(i)) return false;
    const p = etat.proprietes[i];
    const c = plateau.cases[i];
    if (p.hypotheque) return false;
    if (c.type === 'propriete' && casesDuGroupe(plateau, c.groupe).some((k) => etat.proprietes[k].maisons)) return false;
    return true;
  });
  const score = (i) => {
    const c = plateau.cases[i];
    const complet = c.type === 'propriete' && possedeGroupe(etat, plateau, id, c.groupe);
    return (complet ? 10000 : 0) + nbPossedees(etat, plateau, id, i) * 500 + c.prix;
  };
  candidates.sort((x, y) => score(x) - score(y));
  const choix = candidates[0];
  if (choix === undefined) return null;
  if (seulementIsolees && score(choix) >= 1000) return null;
  return { type: 'hypothequer', joueur: id, case: choix };
}

// Lève une hypothèque quand la trésorerie est confortable (groupes complets d'abord).
function actionLevee(etat, plateau, id) {
  const j = etat.joueurs[id];
  const hypothequees = proprietesDe(etat, id).filter((i) => etat.proprietes[i].hypotheque);
  hypothequees.sort((x, y) => nbPossedees(etat, plateau, id, y) - nbPossedees(etat, plateau, id, x));
  for (const i of hypothequees) {
    if (j.argent - coutLevee(plateau.cases[i]) >= RESERVE_LEVEE) return { type: 'leverHypotheque', joueur: id, case: i };
  }
  return null;
}

// Construit sur les groupes complets, en commençant par le terrain le moins bâti du groupe le plus rentable.
function actionConstruction(etat, plateau, id) {
  const j = etat.joueurs[id];
  let choix = null;
  for (const g of Object.keys(plateau.groupes)) {
    if (!possedeGroupe(etat, plateau, id, g)) continue;
    const cases = casesDuGroupe(plateau, g);
    if (cases.some((i) => etat.proprietes[i].hypotheque)) continue;
    const min = Math.min(...cases.map((i) => etat.proprietes[i].maisons));
    if (min >= HOTEL) continue;
    const cible = cases.find((i) => etat.proprietes[i].maisons === min);
    const c = plateau.cases[cible];
    if (j.argent - c.prixMaison < RESERVE_CONSTRUCTION) continue;
    if (min === 4 ? etat.banque.hotels === 0 : etat.banque.maisons === 0) continue;
    if (!choix || c.prixMaison > plateau.cases[choix].prixMaison) choix = cible;
  }
  return choix === null ? null : { type: 'construire', joueur: id, case: choix };
}

// La seule case d'un quartier qui manque à un joueur (ou null).
function caseManquante(etat, plateau, joueurId, groupe) {
  const cases = casesDuGroupe(plateau, groupe);
  const manquantes = cases.filter((i) => etat.proprietes[i].proprietaire !== joueurId);
  return manquantes.length === 1 ? manquantes[0] : null;
}

const quartierBati = (etat, plateau, i) => casesSoeurs(plateau, i).some((k) => etat.proprietes[k].maisons);

// Propose d'obtenir la case qui lui manque pour compléter un quartier : en échange d'une case
// qui complète un quartier de l'adversaire si possible, avec un complément en argent si nécessaire.
// Un essai tous les 3 tours au plus, avant de lancer les dés.
function actionEchange(partie, id) {
  const { etat, plateau } = partie;
  if (etat.echangesProposes > 0 || (etat.tour + id) % 3 !== 0 || etat.aLance) return null;
  const j = etat.joueurs[id];
  for (const g of Object.keys(plateau.groupes)) {
    const cible = caseManquante(etat, plateau, id, g);
    if (cible === null) continue;
    const proprio = etat.proprietes[cible].proprietaire;
    if (proprio === null || proprio === id || etat.joueurs[proprio].faillite || quartierBati(etat, plateau, cible)) continue;
    // Contrepartie : une de mes cases qui complèterait un quartier de l'adversaire.
    const contreparties = Object.keys(plateau.groupes)
      .filter((h) => h !== g)
      .map((h) => caseManquante(etat, plateau, proprio, h))
      .filter((i) => i !== null && etat.proprietes[i].proprietaire === id && !quartierBati(etat, plateau, i));
    for (const donnees of [contreparties.slice(0, 1), []]) {
      const offre = { a: proprio, donne: { proprietes: donnees, argent: 0, cartes: 0 }, recoit: { proprietes: [cible], argent: 0, cartes: 0 } };
      const echange = { de: id, ...offre };
      const gainCible = evaluerEchange(etat, plateau, echange, proprio);
      if (gainCible <= SEUIL_ACCEPTATION) offre.donne.argent = Math.ceil((SEUIL_ACCEPTATION + 10 - gainCible) / 10) * 10;
      if (j.argent - offre.donne.argent < RESERVE_CONSTRUCTION) continue;
      if (evaluerEchange(etat, plateau, echange, id) <= 0) continue;
      return { type: 'proposerEchange', joueur: id, offre };
    }
  }
  return null;
}

// Actions de secours si une décision de l'IA était refusée (ne devrait pas arriver).
export function actionsDeSecours(partie) {
  const id = partie.joueurActif();
  const possibles = partie.actionsPossibles();
  const ordre = [
    { type: 'passerEnchere' }, { type: 'repondreEchange', accepter: false }, { type: 'refuserAchat' },
    { type: 'choisirAmende', choix: 'chance' }, { type: 'payerDette' }, { type: 'declarerFaillite' },
    { type: 'lancer' }, { type: 'finirTour' }
  ];
  return ordre.filter((a) => possibles.includes(a.type)).map((a) => ({ ...a, joueur: id }));
}
