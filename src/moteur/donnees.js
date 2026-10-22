// Validation des données du jeu (plateau et cartes).
// Ce module est pur : il ne lit aucun fichier, il vérifie des objets déjà chargés.
import { CIBLES_BOISSON } from './pastis.js';

export const TYPES_CASES = ['depart', 'propriete', 'gare', 'compagnie', 'taxe', 'chance', 'communaute', 'prison', 'parc', 'allez_prison'];

export const TYPES_EFFETS = {
  aller_a: (e) => Number.isInteger(e.case) && e.case >= 0 && e.case < 40,
  reculer: (e) => Number.isInteger(e.cases) && e.cases > 0,
  prison: () => true,
  sortie_prison: () => true,
  reparations: (e) => Number.isInteger(e.maison) && Number.isInteger(e.hotel),
  payer: (e) => Number.isInteger(e.montant) && e.montant > 0,
  recevoir: (e) => Number.isInteger(e.montant) && e.montant > 0,
  anniversaire: (e) => Number.isInteger(e.montant) && e.montant > 0,
  amende_ou_chance: (e) => Number.isInteger(e.montant) && e.montant > 0,
  // Mode Pastis uniquement : des gorgées (1 à 5) ou un cul sec.
  boire: (e) => CIBLES_BOISSON.includes(e.cible) && (e.culSec === true || (Number.isInteger(e.gorgees) && e.gorgees >= 1 && e.gorgees <= 5))
};

// Retourne la liste des erreurs trouvées dans le plateau (vide si tout va bien).
export function validerPlateau(plateau) {
  const erreurs = [];
  if (!plateau || !Array.isArray(plateau.cases)) return ['Le plateau doit contenir un tableau « cases ».'];
  if (plateau.cases.length !== 40) erreurs.push(`Le plateau doit contenir 40 cases (trouvé : ${plateau.cases.length}).`);
  plateau.cases.forEach((c, i) => {
    if (c.index !== i) erreurs.push(`Case ${i} : index incorrect (${c.index}).`);
    if (!TYPES_CASES.includes(c.type)) erreurs.push(`Case ${i} : type inconnu « ${c.type} ».`);
    if (typeof c.nom !== 'string' || !c.nom.trim()) erreurs.push(`Case ${i} : nom manquant.`);
    if (c.type === 'propriete') {
      if (!plateau.groupes?.[c.groupe]) erreurs.push(`Case ${i} : groupe inconnu « ${c.groupe} ».`);
      if (!Array.isArray(c.loyers) || c.loyers.length !== 6) erreurs.push(`Case ${i} : 6 loyers attendus.`);
      if (!(c.prixMaison > 0)) erreurs.push(`Case ${i} : prix de maison manquant.`);
    }
    if (['propriete', 'gare', 'compagnie'].includes(c.type)) {
      if (!(c.prix > 0)) erreurs.push(`Case ${i} : prix manquant.`);
      if (c.hypotheque !== c.prix / 2) erreurs.push(`Case ${i} : valeur hypothécaire incorrecte.`);
    }
    if (c.type === 'taxe' && !(c.montant > 0)) erreurs.push(`Case ${i} : montant de taxe manquant.`);
  });
  return erreurs;
}

// Retourne la liste des erreurs trouvées dans les cartes (vide si tout va bien).
export function validerCartes(cartes) {
  const erreurs = [];
  const ids = new Set();
  for (const pioche of ['chance', 'communaute']) {
    const liste = cartes?.[pioche];
    if (!Array.isArray(liste)) { erreurs.push(`Pioche « ${pioche} » manquante.`); continue; }
    if (liste.length !== 16) erreurs.push(`La pioche « ${pioche} » doit contenir 16 cartes (trouvé : ${liste.length}).`);
    for (const carte of liste) {
      if (!carte.id || ids.has(carte.id)) erreurs.push(`Identifiant de carte manquant ou dupliqué : « ${carte.id} ».`);
      ids.add(carte.id);
      verifierCarte(carte, erreurs);
    }
  }
  // Cartes du mode Pastis : chacune remplace une carte de la même pioche (jamais une carte « sortie de prison »).
  for (const pioche of ['chance', 'communaute']) {
    const liste = cartes?.pastis?.[pioche] ?? [];
    const remplacees = new Set();
    for (const carte of liste) {
      if (!carte.id || ids.has(carte.id)) erreurs.push(`Identifiant de carte manquant ou dupliqué : « ${carte.id} ».`);
      ids.add(carte.id);
      verifierCarte(carte, erreurs);
      const cible = cartes[pioche]?.find((c) => c.id === carte.remplace);
      if (!cible || cible.effet.type === 'sortie_prison' || remplacees.has(carte.remplace)) {
        erreurs.push(`Carte ${carte.id} : carte remplacée invalide « ${carte.remplace} ».`);
      }
      remplacees.add(carte.remplace);
    }
  }
  return erreurs;
}

function verifierCarte(carte, erreurs) {
  if (typeof carte.texte !== 'string' || carte.texte.length < 10) erreurs.push(`Carte ${carte.id} : texte manquant.`);
  const verif = TYPES_EFFETS[carte.effet?.type];
  if (!verif) erreurs.push(`Carte ${carte.id} : type d'effet inconnu « ${carte.effet?.type} ».`);
  else if (!verif(carte.effet)) erreurs.push(`Carte ${carte.id} : paramètres d'effet invalides.`);
}
