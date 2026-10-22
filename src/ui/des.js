// Dés dessinés en CSS et animation de lancer.
import { el, attendre } from './utilitaires.js';

const POINTS = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
};

export function dessinerDe(valeur) {
  const de = el('span', { class: 'de', role: 'img', 'aria-label': `Dé : ${valeur}` });
  for (let i = 1; i <= 9; i++) de.append(el('span', { class: POINTS[valeur].includes(i) ? 'point' : 'vide' }));
  return de;
}

export function afficherDes(zone, valeurs) {
  zone.replaceChildren(...(valeurs ? valeurs.map(dessinerDe) : []));
}

// Fait « rouler » les dés quelques instants avant d'afficher le résultat.
export async function animerDes(zone, valeurs, duree = 650) {
  const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduit) {
    const fin = performance.now() + duree;
    while (performance.now() < fin) {
      afficherDes(zone, [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      zone.classList.add('roule');
      await attendre(80);
    }
  }
  zone.classList.remove('roule');
  afficherDes(zone, valeurs);
}
