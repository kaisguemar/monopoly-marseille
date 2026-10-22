// Petits outils DOM partagés par l'interface.

// Crée un élément : el('button', { class: 'btn', onclick: f }, 'Texte', autreNoeud)
export function el(tag, attributs = {}, ...enfants) {
  const noeud = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attributs ?? {})) {
    if (valeur === undefined || valeur === null || valeur === false) continue;
    if (cle.startsWith('on') && typeof valeur === 'function') noeud.addEventListener(cle.slice(2), valeur);
    else if (cle === 'html') noeud.innerHTML = valeur;
    else if (cle === 'style' && typeof valeur === 'object') Object.assign(noeud.style, valeur);
    else noeud.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    noeud.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return noeud;
}

export const euros = (n) => `${n.toLocaleString('fr-FR')} €`;

export const attendre = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));

// Couleur de texte lisible (noir ou blanc) sur un fond donné.
export function texteSur(couleurHex) {
  const h = couleurHex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? '#1b1b1b' : '#ffffff';
}

// Échappe un texte destiné à innerHTML.
export function echapper(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Thème du mode Pastis (couleurs jaune et bleu) appliqué à toute la page.
export function appliquerTheme(pastis) {
  document.body.classList.toggle('theme-pastis', !!pastis);
}
