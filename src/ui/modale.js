// Fenêtres modales accessibles : piège de focus, Échap pour fermer si autorisé.
import { el } from './utilitaires.js';

let modaleOuverte = null;

export const modaleEstOuverte = () => modaleOuverte !== null;

// Ouvre une modale et retourne une promesse résolue avec la valeur du bouton choisi.
// options : { titre, contenu (Node | texte), boutons: [{ libelle, valeur, principal, desactive }],
//             fermable (Échap / bouton ✕ → valeur null), classe }
export function ouvrirModale({ titre, contenu, boutons = [{ libelle: 'OK', valeur: true, principal: true }], fermable = false, classe = '' }) {
  fermerModale();
  return new Promise((resoudre) => {
    const precedent = document.activeElement;
    const titreId = `modale-titre-${Date.now()}`;
    const terminer = (valeur) => {
      if (modaleOuverte?.fond !== fond) return;
      fond.remove();
      document.removeEventListener('keydown', clavier, true);
      modaleOuverte = null;
      if (precedent instanceof HTMLElement && document.contains(precedent)) precedent.focus();
      resoudre(valeur);
    };
    const pied = el('div', { class: 'modale-boutons' },
      boutons.map((b) => el('button', {
        type: 'button',
        class: `btn ${b.principal ? 'btn-principal' : ''} ${b.classe ?? ''}`,
        disabled: b.desactive,
        title: b.aide,
        onclick: () => terminer(typeof b.valeur === 'function' ? b.valeur() : b.valeur)
      }, b.libelle)));
    const boite = el('div', { class: `modale ${classe}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titreId },
      el('div', { class: 'modale-entete' },
        el('h2', { id: titreId }, titre),
        fermable ? el('button', { type: 'button', class: 'btn-fermer', 'aria-label': 'Fermer', onclick: () => terminer(null) }, '✕') : null),
      el('div', { class: 'modale-contenu' }, contenu instanceof Node ? contenu : el('p', {}, contenu ?? '')),
      boutons.length ? pied : null);
    const fond = el('div', { class: 'modale-fond' }, boite);
    const clavier = (ev) => {
      if (ev.key === 'Escape' && fermable) { ev.preventDefault(); terminer(null); }
      if (ev.key === 'Tab') {
        const focusables = [...boite.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')];
        if (!focusables.length) return;
        const premier = focusables[0], dernier = focusables.at(-1);
        if (ev.shiftKey && document.activeElement === premier) { ev.preventDefault(); dernier.focus(); }
        else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier.focus(); }
      }
    };
    document.addEventListener('keydown', clavier, true);
    document.body.append(fond);
    modaleOuverte = { fond, terminer };
    const cible = boite.querySelector('[autofocus]') ?? boite.querySelector('.btn-principal:not([disabled])') ?? boite.querySelector('button:not([disabled]), input');
    cible?.focus();
  });
}

// Ferme la modale courante (sa promesse est résolue avec `undefined`).
export function fermerModale() {
  modaleOuverte?.terminer(undefined);
}
