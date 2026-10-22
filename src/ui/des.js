// Dés en 3D (CSS) et animation de lancer : les dés sont jetés, tournoient, rebondissent
// puis s'immobilisent sur la bonne face.
import { el, attendre } from './utilitaires.js';

const POINTS = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
};

// Rotation du cube (en degrés) qui amène chaque face vers l'avant.
const ORIENTATIONS = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };

function face(valeur) {
  const f = el('span', { class: `face face-${valeur}` });
  for (let i = 1; i <= 9; i++) f.append(el('span', { class: POINTS[valeur].includes(i) ? 'point' : 'vide' }));
  return f;
}

function creerDe() {
  const cube = el('span', { class: 'cube' }, [1, 2, 3, 4, 5, 6].map(face));
  const de = el('span', { class: 'de3d', role: 'img' }, cube, el('span', { class: 'ombre-de' }));
  de.tours = 0;
  return de;
}

function orienter(de, valeur, tours = 0, transition = '') {
  const [x, y] = ORIENTATIONS[valeur];
  const cube = de.querySelector('.cube');
  cube.style.transition = transition;
  cube.style.transform = `rotateX(${x + 360 * tours}deg) rotateY(${y + 360 * tours}deg)`;
  de.setAttribute('aria-label', `Dé : ${valeur}`);
  de.dataset.valeur = valeur;
}

// S'assure que la zone contient deux dés et les retourne.
function des(zone) {
  let liste = [...zone.querySelectorAll('.de3d')];
  if (liste.length !== 2) {
    liste = [creerDe(), creerDe()];
    zone.replaceChildren(...liste);
  }
  return liste;
}

export function afficherDes(zone, valeurs) {
  if (!valeurs) {
    zone.replaceChildren();
    return;
  }
  des(zone).forEach((de, i) => orienter(de, valeurs[i]));
}

// Lance les dés : chaque dé fait plusieurs tours complets (et un tour de plus que le précédent
// lancer, pour toujours tourner dans le même sens) avant de montrer sa valeur.
export async function animerDes(zone, valeurs, duree = 1100) {
  const liste = des(zone);
  const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduit || duree < 50) {
    liste.forEach((de, i) => orienter(de, valeurs[i]));
    return;
  }
  zone.style.setProperty('--duree-lancer', `${duree}ms`);
  zone.classList.remove('lance');
  void zone.offsetWidth; // relance l'animation CSS de rebond
  zone.classList.add('lance');
  liste.forEach((de, i) => {
    de.tours += 2 + i;
    orienter(de, valeurs[i], de.tours, `transform ${duree}ms cubic-bezier(.15, .7, .3, 1)`);
  });
  await attendre(duree);
  zone.classList.remove('lance');
}
