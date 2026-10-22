// Écran d'accueil : configuration des joueurs, des règles et lancement / reprise de partie.
import { el } from './utilitaires.js';
import { PIONS, svgPion, COULEURS_JOUEURS } from './pions.js';
import { stockageDisponible } from './sauvegarde.js';

const NOMS = ['Marius', 'Fanny', 'César', 'Honorine', 'Panisse', 'Escartefigue'];

// Affiche l'accueil. `sauvegarde` : sauvegarde existante ou null.
// Callbacks : surNouvellePartie({ joueurs, options, vitesse }), surReprendre(), surEffacer().
export function afficherAccueil(racine, { sauvegarde, surNouvellePartie, surReprendre, surEffacer }) {
  const config = {
    joueurs: NOMS.map((nom, i) => ({ nom, pion: PIONS[i].id, ia: i > 0 })),
    nombre: 2,
    options: { parcGratuit: false, doubleDepart: false, partieRapide: false, toursMax: 20 },
    vitesse: 'normale'
  };

  const listeJoueurs = el('ol', { class: 'liste-joueurs' });

  const dessinerJoueurs = () => {
    listeJoueurs.replaceChildren(...config.joueurs.slice(0, config.nombre).map((j, i) => {
      const apercu = el('span', { class: 'avatar', style: { borderColor: COULEURS_JOUEURS[i] }, html: svgPion(j.pion, 32) });
      return el('li', { class: 'ligne-joueur', style: { borderColor: COULEURS_JOUEURS[i] } },
        apercu,
        el('label', { class: 'champ' }, el('span', {}, `Nom du joueur ${i + 1}`),
          el('input', { type: 'text', value: j.nom, maxlength: 20, required: true, oninput: (ev) => { j.nom = ev.target.value; } })),
        el('label', { class: 'champ' }, el('span', {}, 'Pion'),
          el('select', { onchange: (ev) => choisirPion(i, ev.target.value) },
            PIONS.map((p) => el('option', { value: p.id, selected: p.id === j.pion }, p.nom)))),
        el('label', { class: 'champ' }, el('span', {}, 'Contrôlé par'),
          el('select', { onchange: (ev) => { j.ia = ev.target.value === 'ia'; } },
            el('option', { value: 'humain', selected: !j.ia }, 'Humain'),
            el('option', { value: 'ia', selected: j.ia }, 'Ordinateur'))));
    }));
  };

  // Chaque pion est unique : le joueur qui l'avait récupère l'ancien pion de l'autre.
  const choisirPion = (i, pion) => {
    const autre = config.joueurs.find((j, k) => k !== i && j.pion === pion);
    if (autre) autre.pion = config.joueurs[i].pion;
    config.joueurs[i].pion = pion;
    dessinerJoueurs();
  };

  const caseOption = (cle, libelle, aide) => el('label', { class: 'option' },
    el('input', { type: 'checkbox', checked: config.options[cle], onchange: (ev) => { config.options[cle] = ev.target.checked; majTours(); } }),
    el('span', {}, el('strong', {}, libelle), el('br'), el('small', {}, aide)));

  const champTours = el('input', {
    type: 'number', min: 5, max: 200, value: config.options.toursMax, id: 'tours-max', disabled: true,
    oninput: (ev) => { config.options.toursMax = Math.max(5, Math.min(200, Number(ev.target.value) || 20)); }
  });
  const majTours = () => { champTours.disabled = !config.options.partieRapide; };

  const formulaire = el('form', { class: 'formulaire-accueil', 'aria-labelledby': 'titre-config' },
    el('h2', { id: 'titre-config' }, 'Nouvelle partie'),
    el('fieldset', {},
      el('legend', {}, 'Joueurs'),
      el('label', { class: 'champ champ-ligne' }, el('span', {}, 'Nombre de joueurs '),
        el('select', { onchange: (ev) => { config.nombre = Number(ev.target.value); dessinerJoueurs(); } },
          [2, 3, 4, 5, 6].map((n) => el('option', { value: n, selected: n === config.nombre }, n)))),
      listeJoueurs),
    el('fieldset', {},
      el('legend', {}, 'Règles de la maison (facultatives)'),
      caseOption('parcGratuit', 'Cagnotte du Parc gratuit', 'Taxes et amendes vont sur la plage des Catalans ; qui s\'y arrête ramasse tout.'),
      caseOption('doubleDepart', 'Double salaire sur Départ', 'S\'arrêter pile sur Départ rapporte 400 € au lieu de 200 €.'),
      caseOption('partieRapide', 'Partie rapide', 'La partie s\'arrête après un nombre de tours ; le plus gros patrimoine l\'emporte.'),
      el('label', { class: 'champ champ-ligne', for: 'tours-max' }, el('span', {}, 'Nombre de tours de la partie rapide '), champTours)),
    el('fieldset', {},
      el('legend', {}, 'Confort'),
      el('label', { class: 'champ champ-ligne' }, el('span', {}, 'Vitesse des animations et de l\'ordinateur '),
        el('select', { onchange: (ev) => { config.vitesse = ev.target.value; } },
          el('option', { value: 'lente' }, 'Lente'),
          el('option', { value: 'normale', selected: true }, 'Normale'),
          el('option', { value: 'rapide' }, 'Rapide')))),
    el('div', { class: 'boutons-accueil' },
      el('button', { type: 'submit', class: 'btn btn-principal btn-grand' }, '⛵ Nouvelle partie')));

  formulaire.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const joueurs = config.joueurs.slice(0, config.nombre).map((j, i) => ({ ...j, nom: j.nom.trim() || NOMS[i] }));
    surNouvellePartie({ joueurs, options: { ...config.options }, vitesse: config.vitesse });
  });

  const blocReprise = sauvegarde
    ? el('section', { class: 'reprise', 'aria-label': 'Partie sauvegardée' },
      el('p', {}, `Une partie est en cours (${sauvegarde.etat.joueurs.map((j) => j.nom).join(', ')} — tour ${sauvegarde.etat.tour}), sauvegardée le ${new Date(sauvegarde.date).toLocaleString('fr-FR')}.`),
      el('div', { class: 'boutons-accueil' },
        el('button', { type: 'button', class: 'btn btn-principal btn-grand', onclick: surReprendre }, '▶ Reprendre la partie'),
        el('button', { type: 'button', class: 'btn btn-danger', onclick: surEffacer }, 'Effacer la sauvegarde')))
    : null;

  racine.replaceChildren(el('div', { class: 'accueil' },
    el('header', { class: 'accueil-entete' },
      el('div', { class: 'logo logo-accueil', 'aria-hidden': 'true' },
        el('span', { class: 'logo-soleil' }), el('span', { class: 'logo-titre' }, 'Monopoly'), el('span', { class: 'logo-ville' }, 'Marseille'), el('span', { class: 'logo-vagues' }, '〰〰〰')),
      el('h1', { class: 'visuellement-cache' }, 'Monopoly Marseille'),
      el('p', { class: 'accroche' }, 'Du Panier à la Corniche, achetez Marseille quartier par quartier ! De 2 à 6 joueurs sur le même écran, humains ou ordinateurs.'),
      el('div', { class: 'pions-accueil', 'aria-hidden': 'true' }, PIONS.map((p) => el('span', { class: 'avatar', title: p.nom, html: svgPion(p.id, 36) })))),
    blocReprise,
    formulaire,
    stockageDisponible() ? null : el('p', { class: 'alerte' }, 'Le stockage du navigateur est indisponible : la partie ne pourra pas être sauvegardée, mais vous pouvez jouer normalement.'),
    el('p', { class: 'pied-accueil' }, el('a', { href: 'docs/REGLES.md', target: '_blank', rel: 'noopener' }, 'Lire les règles du jeu'))));
  dessinerJoueurs();
  (blocReprise?.querySelector('button') ?? formulaire.querySelector('input'))?.focus();
}
