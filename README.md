# Monopoly Marseille

Version marseillaise du Monopoly, jouable entièrement dans le navigateur, en français. De 2 à 6 joueurs sur le même écran, chacun humain ou ordinateur. Du Cours Belsunce au Vieux-Port, en passant par le Panier, la Canebière et la Corniche Kennedy : achetez Marseille quartier par quartier !

- Règles officielles du Monopoly français (enchères, constructions uniformes, hypothèques, échanges, faillite).
- 40 cases marseillaises et 32 cartes réécrites avec le mistral, l'OM, la Bonne Mère, les calanques…
- Joueurs ordinateur, sauvegarde automatique, règles de la maison facultatives.
- HTML, CSS et JavaScript (modules ES) sans framework, sans dépendance ni étape de build.

## Lancer le jeu

Le jeu charge ses données avec `fetch` : il faut le servir avec un petit serveur statique (l'ouvrir directement en `file://` ne fonctionne pas). Depuis la racine du dépôt, **une seule commande** :

```sh
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

Alternative avec Node.js : `npx serve .` (ou `npm start`, qui sert le jeu sur <http://localhost:8080>).

## Lancer les tests

```sh
node --test
```

(ou `npm test`). Les tests utilisent uniquement le lanceur intégré de Node.js (version 18 ou plus récente) et couvrent les données, le moteur de règles et l'IA, y compris des parties complètes simulées entre ordinateurs.

## Comment jouer

1. Sur l'écran d'accueil, choisissez le nombre de joueurs, leurs noms, leurs pions (pointu, ballon, cigale, savon de Marseille, navette, sardine) et s'ils sont humains ou ordinateurs. Cochez éventuellement des règles de la maison et la vitesse d'animation.
2. Cliquez sur **Nouvelle partie** (ou **Reprendre la partie** si une sauvegarde existe).
3. À votre tour : **Lancer les dés**, puis répondez aux fenêtres (achat, enchère, carte, dette…), et **Finir le tour**. Les boutons de la colonne de droite permettent de construire, d'hypothéquer et de proposer des échanges.
4. Cliquez sur une case du plateau (ou sur une propriété dans un panneau joueur) pour afficher sa fiche : prix, loyers, propriétaire.

Le jeu se joue entièrement au clavier : le bouton d'action principal reçoit le focus à chaque tour (Entrée pour lancer les dés), les fenêtres gardent le focus et se ferment avec Échap quand c'est possible.

Les règles complètes sont dans [`docs/REGLES.md`](docs/REGLES.md).

## Le plateau marseillais

| Quartier (couleur) | Propriétés | Prix |
| --- | --- | --- |
| Belsunce – Noailles (marron) | Cours Belsunce, Marché des Capucins | 60 € |
| Le Panier (bleu ciel) | Place de Lenche, Montée des Accoules, Rue du Panier | 100–120 € |
| La Plaine – Cours Julien (violet) | Rue des Trois-Mages, Cours Julien, Place Jean-Jaurès | 140–160 € |
| Centre-ville (orange) | Rue de Rome, Rue Saint-Ferréol, La Canebière | 180–200 € |
| Endoume (rouge) | Rue d'Endoume, Vallon des Auffes, Malmousque | 220–240 € |
| Prado – Castellane (jaune) | Place Castellane, Avenue du Prado, Parc Borély | 260–280 € |
| Roucas-Blanc – Périer (vert) | Boulevard Périer, Chemin du Roucas-Blanc, Rue Paradis | 300–320 € |
| Bord de mer (bleu foncé) | Corniche Kennedy, Vieux-Port | 350–400 € |

- **Gares** : Gare Saint-Charles, Gare de la Blancarde, Station Joliette, Station Rond-Point du Prado.
- **Compagnies** : Compagnie Électrique du Mistral (fictive), Société des Eaux de Marseille.
- **Taxes** : Impôt sur la sardine (200 €), Taxe bouillabaisse (100 €).
- **Coins** : Départ, Château d'If / Simple visite, Parc gratuit – Plage des Catalans, Allez au Château d'If.

Les prix, loyers, prix des maisons et valeurs hypothécaires sont ceux du Monopoly français classique, case pour case.

## Règles spécifiques et choix d'interprétation

Le cahier des charges laisse quelques points ouverts. Voici les choix retenus, les plus proches possible des règles officielles :

**Structure et contenu**
- `index.html` a été déplacé de `src/` vers la racine, comme le demande la structure attendue du cahier des charges.
- La prison est le **Château d'If** et le Parc gratuit la **plage des Catalans**. Les quartiers regroupent des lieux voisins ; le plateau va des quartiers populaires du centre (Belsunce, Noailles) jusqu'au bord de mer.
- Les cartes qui envoient vers une case précise sont transposées case pour case : Avenue Henri-Martin → Malmousque, Boulevard de la Villette → Rue des Trois-Mages, Gare de Lyon → Gare de la Blancarde, Rue de la Paix → Vieux-Port, Boulevard de Belleville → Cours Belsunce.
- Le logo « Monopoly Marseille » est dessiné avec des polices système (aucun logo, mascotte ni typographie de la marque).

**Règles de jeu**
- **Enchères** : elles commencent par le joueur dont c'est le tour, puis suivent l'ordre de jeu. Chaque offre doit dépasser la précédente d'au moins 1 € sans dépasser l'argent du joueur ; qui passe est éliminé. Si personne n'enchérit, la propriété reste à la banque. On ne peut pas hypothéquer ni construire pendant une enchère.
- **Levée d'hypothèque** : valeur hypothécaire + 10 %, arrondie à l'euro supérieur (par exemple 193 € pour la Corniche Kennedy).
- **Loyer doublé** : un terrain nu rapporte double dès que le quartier entier appartient au même joueur, même si un autre terrain du quartier est hypothéqué (règle officielle).
- **Compagnies** : le loyer se calcule sur le total du lancer en cours, y compris quand on y arrive par une carte.
- **Pénurie de maisons** : revendre un hôtel le remplace par 4 maisons. Si la banque n'a pas 4 maisons en stock, l'hôtel est revendu avec ses 4 maisons (soit 5 × la moitié du prix d'une maison) et le terrain redevient nu. Cela évite qu'un joueur endetté se retrouve bloqué.
- **Faillite** : elle n'est possible que si le joueur ne peut pas payer, même en revendant toutes ses constructions et en hypothéquant tout. Ses constructions sont revendues à la banque à moitié prix. Envers un joueur, celui-ci récupère l'argent, les propriétés (hypothèques comprises, **sans les 10 % d'intérêts** exigés par la règle officielle, par simplification) et les cartes. Envers la banque, les propriétés sont libérées de leur hypothèque et remises aux enchères une par une.
- **Échanges** : le joueur qui a la main (ou qui doit régler une dette) peut proposer un échange à tout moment de son tour, sauf pendant une enchère. Les terrains d'un quartier bâti ne s'échangent pas. Les propriétés hypothéquées restent hypothéquées.
- **Prison** : au troisième essai sans double, le joueur paie 50 € puis avance du total des dés. Une carte « sortie » utilisée retourne sous sa pioche.
- **Carte « amende ou Chance »** : le joueur choisit entre payer 10 € et tirer une carte Chance.

**Règles de la maison**
- **Cagnotte du Parc gratuit** : reçoit les taxes, les paiements des cartes (amendes, réparations, frais) et les 50 € de sortie de prison, mais pas les loyers.
- **Double salaire** : 400 € seulement en s'arrêtant pile sur Départ, que ce soit aux dés ou par une carte.
- **Partie rapide** : la partie s'arrête à la fin du tour de table qui atteint la limite (20 tours par défaut, réglable de 5 à 200). Le patrimoine compte l'argent, le prix des propriétés (moins la valeur hypothécaire si elles sont hypothéquées) et les constructions au prix d'achat.

**Ordinateurs et interface**
- L'IA propose au plus un échange par tour, et seulement un tour sur trois, pour ne pas harceler les humains.
- Les actions de l'ordinateur sont temporisées (de 0,25 s à 1,2 s selon la vitesse choisie) et attendent qu'une fenêtre ouverte par un humain soit fermée.
- La sauvegarde a lieu à chaque fin de tour : en rechargeant la page, on reprend au début du tour en cours. Une partie terminée n'est pas conservée.
- Les dés utilisent un générateur pseudo-aléatoire dont la graine fait partie de l'état sauvegardé : une partie reprise continue avec la même suite de tirages.
- Sur téléphone, le jeu reste consultable et jouable, mais le plateau est petit : une tablette ou un ordinateur est recommandé.

## Structure du code

```
index.html              page unique du jeu
src/
  main.js               point d'entrée : chargement des données, accueil, lancement / reprise
  moteur/               logique pure, sans DOM, testable avec Node
    partie.js           classe Partie : état JSON sérialisable et actions validées
    regles.js           calculs : loyers, quartiers, patrimoine, constantes
    alea.js             dés et mélange déterministes (graine dans l'état)
    ia.js               décisions des joueurs ordinateur
    donnees.js          validation de plateau.json et cartes.json
  ui/                   affichage
    controleur.js       relie le moteur à l'interface, rejoue les animations
    plateau.js          plateau 11 × 11, centre, pions
    des.js              dés animés
    panneaux.js         panneaux des joueurs
    fiche.js            fiche de propriété
    gestion.js          constructions, hypothèques, enchères, échanges, faillite
    ordinateur.js       tour des joueurs ordinateur
    accueil.js          écran d'accueil
    sauvegarde.js       sauvegarde localStorage
    modale.js           fenêtres modales accessibles
    pions.js            pions marseillais en SVG
    utilitaires.js      outils DOM
  styles/               base.css, plateau.css, interface.css
data/
  plateau.json          les 40 cases et les 8 quartiers
  cartes.json           16 cartes Chance + 16 cartes Caisse de communauté
assets/                 icône du jeu
tests/                  tests unitaires (node --test)
docs/                   cahier des charges et règles du jeu
```

### Le moteur

Le moteur (`src/moteur/`) ne dépend pas du navigateur. On crée une partie, puis on lui soumet des actions, chacune validée par les règles :

```js
import { Partie } from './src/moteur/partie.js';

const partie = Partie.nouvelle({ plateau, cartes }, {
  joueurs: [{ nom: 'Marius' }, { nom: 'Fanny', ia: true }],
  options: { parcGratuit: true }
});
partie.executer({ type: 'lancer', joueur: 0 });   // → { ok: true }
partie.executer({ type: 'acheter', joueur: 0 });  // → { ok: false, erreur: '…' } si impossible
const json = partie.serialiser();                  // état complet en JSON
const reprise = Partie.restaurer({ plateau, cartes }, json);
```

Actions disponibles : `lancer`, `acheter`, `refuserAchat`, `encherir`, `passerEnchere`, `payerPrison`, `utiliserCarteSortie`, `choisirAmende`, `construire`, `vendreConstruction`, `hypothequer`, `leverHypotheque`, `proposerEchange`, `repondreEchange`, `payerDette`, `declarerFaillite`, `finirTour`. `partie.joueurActif()` indique qui doit agir, et `partie.actionsPossibles()` ce qu'il peut faire. Les effets des cartes sont décrits dans `cartes.json` (`aller_a`, `reculer`, `prison`, `sortie_prison`, `payer`, `recevoir`, `reparations`, `anniversaire`, `amende_ou_chance`) et interprétés par le moteur. L'interface récupère les événements produits (dés, déplacements, cartes…) avec `partie.extraireEvenements()` pour les animer.

## Feuille de route

- [x] Phase 1 — Données : `plateau.json` (40 cases) et `cartes.json` (16 + 16 cartes), validés par des tests
- [x] Phase 2 — Moteur : état de partie, dés, déplacements, achats, loyers, cartes, prison
- [x] Phase 3 — Plateau : affichage, pions, dés et déplacement animés, partie jouable
- [x] Phase 4 — Gestion avancée : constructions, hypothèques, enchères, échanges, faillite, fin de partie
- [x] Phase 5 — Joueurs ordinateur
- [x] Phase 6 — Finitions : accueil, sauvegarde, options de règles, responsive, accessibilité, journal
- [x] Phase 7 — Documentation : README et `docs/REGLES.md`

Idées pour la suite : sons (cigales, sirène du port), statistiques de fin de partie, jeu en réseau.
