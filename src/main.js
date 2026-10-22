// Point d'entrée : charge les données, affiche l'accueil, lance ou reprend une partie.
import { Partie } from './moteur/partie.js';
import { validerPlateau, validerCartes } from './moteur/donnees.js';
import { Controleur } from './ui/controleur.js';
import './ui/gestion.js';
import { VITESSES_IA } from './ui/ordinateur.js';
import { afficherAccueil } from './ui/accueil.js';
import { sauvegarder, chargerSauvegarde, effacerSauvegarde } from './ui/sauvegarde.js';
import { el } from './ui/utilitaires.js';

const app = document.getElementById('app');

// Facteur appliqué à la durée des animations selon la vitesse choisie.
const FACTEURS_ANIMATION = { lente: 1.4, normale: 1, rapide: 0.35 };

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

function accueil(donnees) {
  document.title = 'Monopoly Marseille';
  afficherAccueil(app, {
    sauvegarde: chargerSauvegarde(),
    surNouvellePartie: ({ joueurs, options, vitesse }) => {
      lancerPartie(donnees, Partie.nouvelle(donnees, { joueurs, options }), { vitesse });
    },
    surReprendre: () => {
      const sauvegarde = chargerSauvegarde();
      try {
        lancerPartie(donnees, Partie.restaurer(donnees, sauvegarde.etat), sauvegarde.reglages ?? {});
      } catch (err) {
        console.warn('Sauvegarde illisible, elle est effacée :', err);
        effacerSauvegarde();
        accueil(donnees);
      }
    },
    surEffacer: () => {
      effacerSauvegarde();
      accueil(donnees);
    }
  });
}

function lancerPartie(donnees, partie, reglages) {
  const vitesse = reglages.vitesse in VITESSES_IA ? reglages.vitesse : 'normale';
  document.title = 'Partie en cours — Monopoly Marseille';
  const controleur = new Controleur(partie, app, {
    facteurAnimation: FACTEURS_ANIMATION[vitesse],
    surFinDeTour: () => sauvegarder(partie, { vitesse }),
    surQuitter: () => {
      effacerSauvegarde();
      accueil(donnees);
    }
  });
  controleur.delaiIA = VITESSES_IA[vitesse];
  sauvegarder(partie, { vitesse });
  // Exposé pour le débogage depuis la console du navigateur.
  window.monopoly = controleur;
}

chargerDonnees()
  .then(accueil)
  .catch((err) => {
    console.error(err);
    app.replaceChildren(el('p', { class: 'erreur' }, `Le jeu n'a pas pu démarrer : ${err.message}. Lancez-le via un serveur local (voir le README).`));
  });
