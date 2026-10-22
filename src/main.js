// Point d'entrée : charge les données, affiche l'accueil, lance ou reprend une partie.
import { Partie } from './moteur/partie.js';
import { validerPlateau, validerCartes } from './moteur/donnees.js';
import { Controleur } from './ui/controleur.js';
import './ui/gestion.js';
import { VITESSES_IA } from './ui/ordinateur.js';
import { afficherAccueil } from './ui/accueil.js';
import { sauvegarder, chargerSauvegarde, effacerSauvegarde } from './ui/sauvegarde.js';
import { afficherSalon } from './ui/salon.js';
import { ClientEnLigne, serveurDisponible, sessionEnregistree, sessionOnglet, oublierSession } from './reseau/client.js';
import { el } from './ui/utilitaires.js';

const app = document.getElementById('app');
const parametres = new URLSearchParams(location.search);
let enLigneDisponible = false;

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

function accueil(donnees, message = null) {
  document.title = 'Monopoly Marseille';
  const session = sessionEnregistree();
  afficherAccueil(app, {
    enLigne: {
      disponible: enLigneDisponible,
      session,
      code: parametres.get('salon'),
      message,
      surCreer: async (nom, pion) => entrerEnLigne(donnees, await ClientEnLigne.creer(nom, pion)),
      surRejoindre: async (code, nom, pion) => entrerEnLigne(donnees, await ClientEnLigne.rejoindre(code, { nom, pion })),
      surReprendre: async () => entrerEnLigne(donnees, await ClientEnLigne.reprendre(session))
    },
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

// ---------------------------------------------------------------------------
// Mode en ligne : salon d'attente puis partie, pilotés par les messages du serveur.
// ---------------------------------------------------------------------------

function entrerEnLigne(donnees, client) {
  history.replaceState(null, '', `?salon=${client.code}`);
  parametres.set('salon', client.code);
  let controleur = null;
  let dernier = null;
  let connexion = 'connecte';
  const quitter = (message = null) => {
    client.fermer();
    oublierSession();
    history.replaceState(null, '', location.pathname);
    parametres.delete('salon');
    window.monopoly = null;
    accueil(donnees, message);
  };
  const dessinerSalon = () => afficherSalon(app, { message: dernier, client, connexion, surQuitter: () => quitter() });
  app.replaceChildren(el('p', { class: 'chargement' }, `Connexion au salon ${client.code}…`));
  client.connecter({
    surMessage: (m) => {
      dernier = m;
      if (!m.etat) {
        document.title = `Salon ${m.salon.code} — Monopoly Marseille`;
        dessinerSalon();
        return;
      }
      if (controleur) {
        controleur.recevoirMessage(m);
        return;
      }
      document.title = `Partie en ligne ${m.salon.code} — Monopoly Marseille`;
      controleur = new Controleur(new Partie(donnees, m.etat), app, {
        reseau: { client, moi: m.moi, salon: m.salon, version: m.version },
        surQuitter: () => quitter()
      });
      // Exposé pour le débogage depuis la console du navigateur.
      window.monopoly = controleur;
    },
    surConnexion: (etat) => {
      connexion = etat;
      if (controleur) {
        controleur.etatConnexion(etat);
        return;
      }
      if (etat === 'introuvable') quitter('Ce salon n\'existe plus.');
      else if (etat === 'refuse') quitter('Vous ne faites plus partie de ce salon.');
      else if (dernier) dessinerSalon();
    }
  });
}

async function demarrer(donnees) {
  enLigneDisponible = await serveurDisponible();
  // Rechargement de la page pendant une partie en ligne : on retrouve directement sa place.
  const session = sessionOnglet() ?? (parametres.get('salon') && sessionEnregistree());
  const code = parametres.get('salon')?.toUpperCase();
  if (enLigneDisponible && session && (!code || code === session.code)) {
    try {
      entrerEnLigne(donnees, await ClientEnLigne.reprendre(session));
      return;
    } catch (err) {
      if (err.statut) oublierSession();
      accueil(donnees, `Impossible de revenir dans le salon ${session.code} : ${err.message}`);
      return;
    }
  }
  accueil(donnees);
}

chargerDonnees()
  .then(demarrer)
  .catch((err) => {
    console.error(err);
    app.replaceChildren(el('p', { class: 'erreur' }, `Le jeu n'a pas pu démarrer : ${err.message}. Lancez-le via un serveur local (voir le README).`));
  });
