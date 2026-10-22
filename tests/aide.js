// Outils partagés par les tests : chargement des données et création de parties.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Partie } from '../src/moteur/partie.js';

const lire = (chemin) => JSON.parse(readFileSync(new URL(`../data/${chemin}`, import.meta.url), 'utf8'));

export const plateau = lire('plateau.json');
export const cartes = lire('cartes.json');
export const donnees = { plateau, cartes };

// Crée une partie déterministe à `n` joueurs humains.
export function creerPartie(n = 2, options = {}, graine = 42) {
  const joueurs = Array.from({ length: n }, (_, i) => ({ nom: `J${i + 1}` }));
  return Partie.nouvelle(donnees, { joueurs, options, graine });
}

// Exécute une action et vérifie qu'elle est acceptée.
export function ok(partie, action) {
  const r = partie.executer(action);
  assert.ok(r.ok, `action ${action.type} refusée : ${r.erreur}`);
  return r;
}

// Exécute une action et vérifie qu'elle est refusée.
export function ko(partie, action) {
  const r = partie.executer(action);
  assert.equal(r.ok, false, `action ${action.type} aurait dû être refusée`);
  return r;
}

// Donne une propriété à un joueur.
export function donner(partie, index, joueur, maisons = 0) {
  Object.assign(partie.etat.proprietes[index], { proprietaire: joueur, maisons });
}

// Place une carte précise en haut d'une pioche.
export function piocherEnPremier(partie, pioche, id) {
  const liste = partie.etat.pioches[pioche];
  liste.splice(liste.indexOf(id), 1);
  liste.unshift(id);
}
