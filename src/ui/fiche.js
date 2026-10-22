// Fiche détaillée d'une case (titre de propriété).
import { el, euros, texteSur } from './utilitaires.js';
import { coutLevee, HOTEL } from '../moteur/regles.js';

export function ficheCase(c, etat, plateau) {
  const p = etat.proprietes[c.index];
  const lignes = [];
  const ligne = (libelle, valeur) => lignes.push(el('tr', {}, el('th', { scope: 'row' }, libelle), el('td', {}, valeur)));

  let entete;
  if (c.type === 'propriete') {
    const g = plateau.groupes[c.groupe];
    entete = el('div', { class: 'fiche-entete', style: { background: g.couleur, color: texteSur(g.couleur) } },
      el('small', {}, `Quartier ${g.nom}`), el('strong', {}, c.nom));
    ligne('Loyer terrain nu', euros(c.loyers[0]));
    ligne('Avec le quartier complet', euros(c.loyers[0] * 2));
    for (let m = 1; m <= 4; m++) ligne(`Avec ${m} maison${m > 1 ? 's' : ''}`, euros(c.loyers[m]));
    ligne('Avec un hôtel', euros(c.loyers[5]));
    ligne('Prix d\'une maison / d\'un hôtel', euros(c.prixMaison));
  } else if (c.type === 'gare') {
    entete = el('div', { class: 'fiche-entete fiche-neutre' }, el('small', {}, 'Gare'), el('strong', {}, c.nom));
    c.loyers.forEach((l, i) => ligne(`Avec ${i + 1} gare${i ? 's' : ''}`, euros(l)));
  } else if (c.type === 'compagnie') {
    entete = el('div', { class: 'fiche-entete fiche-neutre' }, el('small', {}, c.description ?? 'Compagnie'), el('strong', {}, c.nom));
    ligne('Avec 1 établissement', `${c.multiplicateurs[0]} × le total des dés`);
    ligne('Avec Chez Jeannot et le Viaghji', `${c.multiplicateurs[1]} × le total des dés`);
  } else {
    const descriptions = {
      depart: 'Recevez 200 € à chaque passage.',
      taxe: `Payez ${euros(c.montant ?? 0)} à la banque.`,
      chance: 'Tirez une carte Chance.',
      communaute: 'Tirez une carte Caisse de communauté.',
      prison: 'Simple visite, ou séjour forcé aux Baumettes.',
      parc: 'Stationnement gratuit sur le trottoir du Jarret. Avec la règle de la maison, ramassez la cagnotte !',
      allez_prison: 'Allez directement aux Baumettes, sans passer par la case Départ.'
    };
    return el('div', { class: 'fiche' },
      el('div', { class: 'fiche-entete fiche-neutre' }, el('strong', {}, c.nom)),
      el('p', {}, descriptions[c.type] ?? ''));
  }
  ligne('Prix d\'achat', euros(c.prix));
  ligne('Valeur hypothécaire', euros(c.hypotheque));
  ligne('Levée d\'hypothèque', euros(coutLevee(c)));

  const proprio = p.proprietaire === null ? 'La banque (à vendre)' : etat.joueurs[p.proprietaire].nom;
  const statut = [];
  if (p.maisons === HOTEL) statut.push('1 hôtel');
  else if (p.maisons) statut.push(`${p.maisons} maison(s)`);
  if (p.hypotheque) statut.push('hypothéquée');

  return el('div', { class: 'fiche' },
    entete,
    el('table', { class: 'fiche-loyers' }, el('tbody', {}, lignes)),
    el('p', { class: 'fiche-proprio' }, el('strong', {}, 'Propriétaire : '), proprio, statut.length ? ` — ${statut.join(', ')}` : ''));
}
