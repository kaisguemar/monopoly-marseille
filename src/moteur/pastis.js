// Mode Pastis : variante « jeu à boire » activée par l'option `pastis`.
// Ce module est pur : il calcule les gorgées, le moteur (partie.js) les distribue.
//
// Une boisson est { gorgees } (1 à 5) ou { culSec: true }. Dans le total de chaque joueur,
// un cul sec compte pour CUL_SEC gorgées.
import { possedeGroupe, HOTEL } from './regles.js';

export const CUL_SEC = 5;

// Cibles possibles d'une carte « boire ».
export const CIBLES_BOISSON = ['moi', 'autres', 'tous', 'suivant', 'precedent'];

export const AVERTISSEMENT_PASTIS = 'Jeu réservé aux adultes. Une gorgée peut être d\'eau, de sirop ou de pastis bien allongé : buvez avec modération, et ne prenez pas le volant après la partie.';

// Règles affichées à l'accueil, dans le salon et pendant la partie.
export const REGLES_PASTIS = [
  'Payer un loyer : 1 gorgée sur un terrain nu, 2 si le propriétaire a tout le quartier, 1 de plus par maison, et cul sec sur un hôtel.',
  'Stations de métro : autant de gorgées que de stations possédées par le propriétaire. Chez Jeannot : 2 gorgées. Le Viaghji : 3 gorgées.',
  'Faire un double : les autres joueurs boivent 1 gorgée. Trois doubles d\'affilée : cul sec et direction les Baumettes.',
  'Partir aux Baumettes : 3 gorgées. Chaque essai raté pour en sortir : 1 gorgée.',
  'Station Total : 2 gorgées. Tunnel Prado-Carénage : 1 gorgée.',
  'S\'arrêter pile sur Départ : les autres joueurs boivent 1 gorgée.',
  'Trottoir gratuit du Jarret : tournée générale, tout le monde boit 1 gorgée.',
  'Compléter un quartier : on arrose ça, les autres joueurs boivent 2 gorgées.',
  'Faire faillite : cul sec.',
  'Certaines cartes Chance et Caisse de communauté sont remplacées par des cartes à boire.'
];

// Boisson due par le joueur qui paie le loyer de la case `index`.
export function boissonLoyer(etat, plateau, index) {
  const c = plateau.cases[index];
  const p = etat.proprietes[index];
  if (c.type === 'gare') {
    const nb = plateau.cases.filter((k) => k.type === 'gare' && etat.proprietes[k.index].proprietaire === p.proprietaire).length;
    return { gorgees: nb };
  }
  if (c.type === 'compagnie') return { gorgees: c.description === 'Bar' ? 3 : 2 };
  if (p.maisons === HOTEL) return { culSec: true };
  if (p.maisons > 0) return { gorgees: Math.min(5, p.maisons + 1) };
  return { gorgees: possedeGroupe(etat, plateau, p.proprietaire, c.groupe) ? 2 : 1 };
}

// Taxe : 1 gorgée par tranche de 100 € (Station Total : 2, Tunnel : 1).
export const boissonTaxe = (montant) => ({ gorgees: Math.max(1, Math.min(5, Math.round(montant / 100))) });

// Joueurs visés par une carte « boire », dans l'ordre du jeu, parmi les joueurs encore en jeu.
export function ciblesBoisson(etat, joueurId, cible) {
  const enJeu = etat.joueurs.filter((j) => !j.faillite).map((j) => j.id);
  const rang = enJeu.indexOf(joueurId);
  switch (cible) {
    case 'moi': return [joueurId];
    case 'autres': return enJeu.filter((id) => id !== joueurId);
    case 'tous': return enJeu;
    case 'suivant': return [enJeu[(rang + 1) % enJeu.length]];
    case 'precedent': return [enJeu[(rang - 1 + enJeu.length) % enJeu.length]];
    default: return [];
  }
}

// « 2 gorgées », « 1 gorgée », « cul sec ».
export const libelleBoisson = ({ gorgees, culSec }) => (culSec ? 'cul sec' : `${gorgees} gorgée${gorgees > 1 ? 's' : ''}`);

// « Marius », « Marius et Fanny », « Marius, Fanny et César ».
export function listeNoms(noms) {
  return noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}`;
}

// Pioches d'une partie en mode Pastis : certaines cartes sont remplacées par leur version « à boire ».
export function piochesPastis(cartes) {
  const pioches = {};
  for (const pioche of ['chance', 'communaute']) {
    const remplacements = new Map((cartes.pastis?.[pioche] ?? []).map((c) => [c.remplace, c.id]));
    pioches[pioche] = cartes[pioche].map((c) => remplacements.get(c.id) ?? c.id);
  }
  return pioches;
}

// Le plus gros buveur de la partie (ou null si personne n'a bu).
export function plusGrosBuveur(etat) {
  const tries = [...etat.joueurs].sort((a, b) => (b.gorgees ?? 0) - (a.gorgees ?? 0));
  return tries[0]?.gorgees ? tries[0] : null;
}
