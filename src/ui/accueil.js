// Écran d'accueil : configuration des joueurs, des règles et lancement / reprise de partie.
import { el } from './utilitaires.js';
import { PIONS, svgPion, COULEURS_JOUEURS } from './pions.js';
import { stockageDisponible } from './sauvegarde.js';

const NOMS = ['Marius', 'Fanny', 'César', 'Honorine', 'Panisse', 'Escartefigue'];

// Affiche l'accueil. `sauvegarde` : sauvegarde existante ou null.
// Callbacks : surNouvellePartie({ joueurs, options, vitesse }), surReprendre(), surEffacer().
// enLigne : { disponible, session, code, message, surCreer(nom, pion), surRejoindre(code, nom, pion), surReprendre() }
// (les fonctions du mode en ligne retournent une promesse ; une erreur est affichée sous le formulaire).
export function afficherAccueil(racine, { sauvegarde, surNouvellePartie, surReprendre, surEffacer, enLigne = {} }) {
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
    el('h2', { id: 'titre-config' }, 'Nouvelle partie sur cet écran'),
    el('fieldset', {},
      el('legend', {}, 'Joueurs'),
      el('label', { class: 'champ champ-ligne' }, el('span', {}, 'Nombre de joueurs '),
        el('select', { onchange: (ev) => { config.nombre = Number(ev.target.value); dessinerJoueurs(); } },
          [2, 3, 4, 5, 6].map((n) => el('option', { value: n, selected: n === config.nombre }, n)))),
      listeJoueurs),
    el('fieldset', {},
      el('legend', {}, 'Règles de la maison (facultatives)'),
      caseOption('parcGratuit', 'Cagnotte du Trottoir gratuit', 'Taxes et amendes s\'accumulent sur le trottoir du Jarret ; qui s\'y arrête ramasse tout.'),
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

  const blocEnLigne = sectionEnLigne(enLigne);

  racine.replaceChildren(el('div', { class: 'accueil' },
    el('header', { class: 'accueil-entete' },
      el('div', { class: 'logo logo-accueil', 'aria-hidden': 'true' },
        el('span', { class: 'logo-soleil' }), el('span', { class: 'logo-titre' }, 'Monopoly'), el('span', { class: 'logo-ville' }, 'Marseille'), el('span', { class: 'logo-vagues' }, '〰〰〰')),
      el('h1', { class: 'visuellement-cache' }, 'Monopoly Marseille'),
      el('p', { class: 'accroche' }, 'Du Panier à la Corniche, achetez Marseille quartier par quartier ! De 2 à 6 joueurs, sur le même écran ou à distance, humains ou ordinateurs.'),
      el('div', { class: 'pions-accueil', 'aria-hidden': 'true' }, PIONS.map((p) => el('span', { class: 'avatar', title: p.nom, html: svgPion(p.id, 36) })))),
    enLigne.message ? el('p', { class: 'alerte', role: 'alert' }, enLigne.message) : null,
    blocReprise,
    enLigne.code ? blocEnLigne : null,
    formulaire,
    enLigne.code ? null : blocEnLigne,
    stockageDisponible() ? null : el('p', { class: 'alerte' }, 'Le stockage du navigateur est indisponible : la partie ne pourra pas être sauvegardée, mais vous pouvez jouer normalement.'),
    el('p', { class: 'pied-accueil' }, el('a', { href: 'docs/REGLES.md', target: '_blank', rel: 'noopener' }, 'Lire les règles du jeu'))));
  dessinerJoueurs();
  const cibleFocus = (enLigne.code && blocEnLigne.querySelector('#nom-rejoindre'))
    || (enLigne.session && blocEnLigne.querySelector('.reprise button'))
    || blocReprise?.querySelector('button')
    || formulaire.querySelector('input');
  cibleFocus?.focus();
}

// Section « Jouer en ligne » : créer un salon, en rejoindre un, ou reprendre sa place.
function sectionEnLigne({ disponible, session, code, surCreer, surRejoindre, surReprendre }) {
  if (!disponible) {
    return el('section', { class: 'formulaire-accueil en-ligne', 'aria-labelledby': 'titre-en-ligne' },
      el('h2', { id: 'titre-en-ligne' }, 'Jouer en ligne'),
      el('p', {}, 'Pour jouer à distance, lancez le jeu avec son serveur : ', el('code', {}, 'npm start'), ' (voir le README), puis ouvrez l\'adresse indiquée.'));
  }
  const erreur = el('p', { class: 'alerte', role: 'alert', hidden: true });
  const occupe = (formulaire, actif) => formulaire.querySelectorAll('button').forEach((b) => { b.disabled = actif; });
  const traiter = (formulaire, promesse) => {
    erreur.hidden = true;
    occupe(formulaire, true);
    promesse.catch((err) => {
      erreur.textContent = err.message;
      erreur.hidden = false;
      occupe(formulaire, false);
    });
  };
  const choixPion = (id) => el('select', { id }, PIONS.map((p) => el('option', { value: p.id }, p.nom)));

  const creer = el('form', { class: 'colonne-en-ligne' },
    el('h3', {}, 'Créer un salon'),
    el('label', { class: 'champ' }, el('span', {}, 'Votre nom'), el('input', { type: 'text', id: 'nom-creer', maxlength: 20, required: true, value: 'Marius' })),
    el('label', { class: 'champ' }, el('span', {}, 'Votre pion'), choixPion('pion-creer')),
    el('button', { type: 'submit', class: 'btn btn-principal' }, 'Créer le salon'));
  creer.addEventListener('submit', (ev) => {
    ev.preventDefault();
    traiter(creer, surCreer(creer.querySelector('#nom-creer').value, creer.querySelector('#pion-creer').value));
  });

  const rejoindre = el('form', { class: 'colonne-en-ligne' },
    el('h3', {}, 'Rejoindre un salon'),
    el('label', { class: 'champ' }, el('span', {}, 'Code du salon'), el('input', { type: 'text', id: 'code-rejoindre', maxlength: 8, required: true, value: code ?? '', autocomplete: 'off', style: { textTransform: 'uppercase' } })),
    el('label', { class: 'champ' }, el('span', {}, 'Votre nom'), el('input', { type: 'text', id: 'nom-rejoindre', maxlength: 20, required: true })),
    el('label', { class: 'champ' }, el('span', {}, 'Votre pion'), choixPion('pion-rejoindre')),
    el('button', { type: 'submit', class: code ? 'btn btn-principal' : 'btn' }, 'Rejoindre'),
    el('p', { class: 'aide' }, 'Déjà dans une partie commencée ? Saisissez le même nom pour reprendre votre place.'));
  rejoindre.addEventListener('submit', (ev) => {
    ev.preventDefault();
    traiter(rejoindre, surRejoindre(
      rejoindre.querySelector('#code-rejoindre').value,
      rejoindre.querySelector('#nom-rejoindre').value,
      rejoindre.querySelector('#pion-rejoindre').value));
  });

  const reprise = session
    ? el('div', { class: 'reprise' },
      el('p', {}, `Vous étiez dans le salon ${session.code}.`),
      el('button', { type: 'button', class: 'btn btn-principal', onclick: (ev) => { ev.currentTarget.disabled = true; surReprendre().catch((err) => { erreur.textContent = err.message; erreur.hidden = false; }); } }, '🔄 Revenir dans la partie en ligne'))
    : null;

  return el('section', { class: 'formulaire-accueil en-ligne', 'aria-labelledby': 'titre-en-ligne' },
    el('h2', { id: 'titre-en-ligne' }, 'Jouer en ligne'),
    el('p', {}, 'Chacun sur son appareil : créez un salon et partagez son code, ou rejoignez celui d\'un ami. Si votre connexion coupe, revenez simplement sur cette page : vous retrouverez votre place.'),
    reprise,
    el('div', { class: 'colonnes-en-ligne' }, creer, rejoindre),
    erreur);
}
