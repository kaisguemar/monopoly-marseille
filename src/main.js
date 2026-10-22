// Point d'entrée : charge les données, affiche l'accueil et lance la partie.
import { Partie } from './moteur/partie.js';
import { validerPlateau, validerCartes } from './moteur/donnees.js';
import { Controleur } from './ui/controleur.js';
import './ui/gestion.js';
import { el } from './ui/utilitaires.js';
import { PIONS } from './ui/pions.js';

const app = document.getElementById('app');

async function chargerDonnees() {
  const lire = async (fichier) => {
    const reponse = await fetch(`data/${fichier}`);
    if (!reponse.ok) throw new Error(`Impossible de charger ${fichier} (${reponse.status})`);
    return reponse.json();
  };
  const [plateau, cartes] = await Promise.all([lire('plateau.json'), lire('cartes.json')]);
  const erreurs = [...validerPlateau(plateau), ...validerCartes(cartes)];
  if (erreurs.length) throw new Error(`Données invalides : ${erreurs.join(' ')}`);
  return { plateau, cartes };
}

function afficherAccueil(donnees) {
  const formulaire = el('form', { class: 'accueil-simple' },
    el('h1', {}, 'Monopoly Marseille'),
    el('label', {}, 'Joueur 1 ', el('input', { name: 'j1', value: 'Marius' })),
    el('label', {}, 'Joueur 2 ', el('input', { name: 'j2', value: 'Fanny' })),
    el('button', { class: 'btn btn-principal', type: 'submit' }, 'Nouvelle partie'));
  formulaire.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const joueurs = [formulaire.j1.value, formulaire.j2.value].map((nom, i) => ({ nom, pion: PIONS[i].id }));
    lancerPartie(donnees, Partie.nouvelle(donnees, { joueurs }));
  });
  app.replaceChildren(formulaire);
}

function lancerPartie(donnees, partie) {
  // Exposé pour le débogage depuis la console du navigateur.
  window.monopoly = new Controleur(partie, app, { surQuitter: () => afficherAccueil(donnees) });
}

chargerDonnees()
  .then(afficherAccueil)
  .catch((err) => {
    console.error(err);
    app.replaceChildren(el('p', { class: 'erreur' }, `Le jeu n'a pas pu démarrer : ${err.message}. Lancez-le via un serveur local (voir le README).`));
  });
