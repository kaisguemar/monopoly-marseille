// Sauvegarde de la partie dans localStorage, avec repli silencieux si le stockage est indisponible
// (navigation privée, quota dépassé, stockage désactivé…).

const CLE = 'monopoly-marseille:sauvegarde';

function stockage() {
  try {
    const s = window.localStorage;
    const test = `${CLE}:test`;
    s.setItem(test, '1');
    s.removeItem(test);
    return s;
  } catch {
    return null;
  }
}

export const stockageDisponible = () => stockage() !== null;

// Retourne true si la sauvegarde a réussi.
export function sauvegarder(partie, reglages = {}) {
  try {
    const s = stockage();
    if (!s) return false;
    s.setItem(CLE, JSON.stringify({ version: 1, date: new Date().toISOString(), reglages, etat: partie.etat }));
    return true;
  } catch (err) {
    console.warn('Sauvegarde impossible :', err);
    return false;
  }
}

// Retourne { etat, date, reglages } ou null si aucune sauvegarde exploitable.
export function chargerSauvegarde() {
  try {
    const brut = stockage()?.getItem(CLE);
    if (!brut) return null;
    const donnees = JSON.parse(brut);
    if (donnees?.version !== 1 || !donnees.etat || donnees.etat.terminee) return null;
    return donnees;
  } catch {
    return null;
  }
}

export function effacerSauvegarde() {
  try {
    stockage()?.removeItem(CLE);
  } catch {
    // Rien à faire : le stockage est indisponible.
  }
}
