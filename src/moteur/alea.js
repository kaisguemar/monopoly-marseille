// Générateur pseudo-aléatoire déterministe (mulberry32).
// Sa graine est stockée dans l'état de partie : une partie sauvegardée puis
// restaurée continue donc exactement avec la même suite de tirages.

export function graineAleatoire() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

// Fait avancer la graine de l'état et retourne un nombre dans [0, 1[.
export function suivant(etat) {
  etat.graine = (etat.graine + 0x6d2b79f5) >>> 0;
  let t = etat.graine;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function lancerDe(etat) {
  return 1 + Math.floor(suivant(etat) * 6);
}

// Mélange de Fisher-Yates, sur place.
export function melanger(etat, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(suivant(etat) * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}
