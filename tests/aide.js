// Outils partagés par les tests : chargement des données depuis le disque.
import { readFileSync } from 'node:fs';

const lire = (chemin) => JSON.parse(readFileSync(new URL(`../data/${chemin}`, import.meta.url), 'utf8'));

export const plateau = lire('plateau.json');
export const cartes = lire('cartes.json');
export const donnees = { plateau, cartes };
