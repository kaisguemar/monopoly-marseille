# Monopoly Marseille

Version marseillaise du Monopoly, jouable entièrement dans le navigateur, en français. De 2 à 6 joueurs, sur le même écran ou chacun chez soi en ligne, humains ou ordinateurs. De Saint-Loup au Vieux-Port, en passant par le Cours Julien, la Canebière et la Corniche Kennedy : achetez Marseille quartier par quartier !

- Règles du Monopoly français (constructions uniformes, hypothèques, échanges, faillite), sans enchère quand on refuse d'acheter.
- 40 cases marseillaises et 32 cartes réécrites avec le mistral, l'OM, la Bonne Mère, les calanques…
- **Multijoueur en ligne** : salons avec code d'invitation, reconnexion automatique après une coupure.
- Joueurs ordinateur, sauvegarde automatique, règles de la maison facultatives, dés animés en 3D.
- HTML, CSS et JavaScript (modules ES) sans framework ; serveur en Node.js pur. Aucune dépendance, aucune étape de build.

## Lancer le jeu

Depuis la racine du dépôt, **une seule commande** (Node.js 18 ou plus récent) :

```sh
npm start
```

puis ouvrir <http://localhost:8080>. Cette commande lance le serveur du jeu (`node serveur/serveur.js`), qui sert les pages **et** gère le mode en ligne. Le port se change avec la variable `PORT` (`PORT=3000 npm start`).

Pour jouer **uniquement sur un même écran**, n'importe quel serveur statique suffit, par exemple `python3 -m http.server 8000` (le mode en ligne est alors indisponible). Ouvrir `index.html` directement en `file://` ne fonctionne pas, car le jeu charge ses données avec `fetch`.

### Jouer en ligne

1. Lancez `npm start` sur une machine que les autres joueurs peuvent joindre : un ordinateur du même réseau local (les autres ouvrent `http://<adresse-de-la-machine>:8080`) ou un serveur accessible sur Internet.
2. Sur l'écran d'accueil, **Créer un salon** : vous obtenez un code de 5 caractères et un lien d'invitation à partager.
3. Vos amis ouvrent le lien (ou saisissent le code dans **Rejoindre un salon**). L'hôte peut ajouter des ordinateurs, choisir les règles de la maison, puis **Lancer la partie**.

En cas de coupure réseau, de rechargement ou de fermeture de la page, il suffit de revenir sur le jeu : le navigateur garde un jeton secret qui redonne au joueur sa place, et la partie reprend là où elle en était. Sur un autre appareil, rejoindre le salon avec **le même nom** permet aussi de reprendre sa place. Les parties en cours sont sauvegardées par le serveur dans `serveur/salons.json` et survivent à un redémarrage.

## Lancer les tests

```sh
node --test
```

(ou `npm test`). Les tests utilisent uniquement le lanceur intégré de Node.js (version 18 ou plus récente) et couvrent :

- les données, le moteur de règles et l'IA, y compris des parties complètes simulées entre ordinateurs ;
- le **mode en ligne** : salon d'attente et droits de l'hôte, impossibilité de jouer à la place d'un autre, diffusion des mises à jour, déconnexion et reconnexion (rechargement, coupure, autre appareil), remplacement par l'ordinateur et retour du joueur, sauvegarde et redémarrage du serveur ;
- le **mode Pastis** : gorgées de chaque règle, cartes à boire et remplacement des cartes, parties complètes entre ordinateurs, et partie en ligne où tous les écrans reçoivent les mêmes gorgées ;
- la **caméra de la vue 3D** (limites, gestes, zoom qui garde le point visé, horizon de la Corniche qui suit l'inclinaison et défile quand on tourne), la **table des joueurs** (places réparties selon le nombre de joueurs sans que les tapis se touchent, jetons de casino qui valent exactement l'argent du joueur, verres du mode Pastis, colonnes de cartes) et les **images générées** (à jour, bien formées, aux proportions des bâtiments en 3D) ;
- le **serveur HTTP réel** : fichiers servis (et ceux qui ne doivent pas l'être), API, flux SSE, et des parties complètes jouées de bout en bout par des clients qui ne communiquent que par HTTP, avec coupures réseau en cours de partie.

## Comment jouer

1. Sur l'écran d'accueil, choisissez le **mode de jeu** : **Classique** ou **Pastis** (voir plus bas). Pour une partie sur un même écran, choisissez ensuite le nombre de joueurs, leurs noms, leurs pions (pointu, ballon, cigale, savon de Marseille, navette, sardine) et s'ils sont humains ou ordinateurs. Cochez éventuellement des règles de la maison et la vitesse d'animation.
2. Cliquez sur **Nouvelle partie** (ou **Reprendre la partie** si une sauvegarde existe).
3. À votre tour : **Lancer les dés**, puis répondez aux fenêtres (achat, carte, dette…), et **Finir le tour**. Les boutons de la colonne de droite permettent de construire, d'hypothéquer et de proposer des échanges.
4. Cliquez sur une case du plateau (ou sur une propriété dans un panneau joueur) pour afficher sa fiche : prix, loyers, propriétaire.
5. Le bouton **🧊 Vue 3D** (sous « Tour… », à droite) passe en plein écran : le plateau est posé sur un ponton de bois au milieu de la mer, face à la **Corniche** : la route et sa longue balustrade blanche, le monument aux morts de l'Armée d'Orient, le viaduc du Vallon des Auffes et ses cabanons, la plage, et Notre-Dame de la Garde sur sa colline. La mer est animée (vagues et reflets du soleil emportés par un lent courant autour du ponton, écume contre son bord, bateaux qui tanguent, mouettes et nuages). Le panneau des actions flotte par-dessus (à droite, ou en bas sur téléphone). **🗺️ Vue à plat** revient au plateau vu de dessus ; le choix est retenu par le navigateur.
6. En 3D, les joueurs sont **assis autour du plateau**, répartis selon leur nombre (face à face à deux, un par côté à quatre…). Chacun a devant lui un tapis de feutre à sa couleur (celui qui a la main s'illumine), avec :
   - son **argent en jetons de casino** : violet 500 €, noir 100 €, vert 20 €, rouge 5 €, blanc 1 € ;
   - ses **titres de propriété**, posés en colonnes par quartier ; une carte hypothéquée est retournée. Cliquer sur une carte ouvre sa fiche ;
   - en mode Pastis, un **verre à shooter** par gorgée bue et un grand verre par cul sec.

   Une étiquette accrochée à sa place donne son nom, son argent exact, ses gorgées et son statut (Baumettes, ordinateur, déconnecté…). Cliquer sur le nom tourne la table pour amener ce joueur devant soi. En ligne, sa propre place est devant.
7. La caméra se déplace librement :
   - **glisser** fait tourner la table (de gauche à droite) et l'incline (de haut en bas) ; la Corniche défile tout autour de la baie ;
   - **molette** ou **pincer à deux doigts** : zoom, vers le point visé ;
   - **Maj + glisser**, clic droit ou deux doigts : déplacer la vue ;
   - les boutons en bas à gauche (en haut sur téléphone) font la même chose au clavier (tourner, incliner, zoomer) et **⌖** recentre la vue. Un simple clic sur une case ou sur une carte ouvre toujours sa fiche. La position de la caméra est retenue par le navigateur.

Les maisons sont de petits cabanons marseillais (crépi, génoise, volets, toit de tuiles canal) et les hôtels des immeubles à balcons de fer forgé, avec leur enseigne et un toit-terrasse marqué d'un « H ». Dans les deux vues, leurs murs prennent la couleur du joueur qui les possède, à la place du nom du quartier sur le bandeau de couleur.

Le jeu se joue entièrement au clavier : le bouton d'action principal reçoit le focus à chaque tour (Entrée pour lancer les dés), les fenêtres gardent le focus et se ferment avec Échap quand c'est possible.

Les règles complètes sont dans [`docs/REGLES.md`](docs/REGLES.md).

### Le mode Pastis (jeu à boire)

Un mode de jeu pour les adultes, à choisir avant de lancer la partie, sur l'accueil comme dans un salon en ligne (c'est l'hôte qui choisit). Le plateau passe en jaune soleil et bleu roi, avec les mêmes noms de cases et les mêmes règles de Monopoly, auxquelles s'ajoutent des gorgées :

- loyer : 1 gorgée sur un terrain nu, 2 si le propriétaire a tout le quartier, 1 de plus par maison, cul sec sur un hôtel ; stations de métro : autant de gorgées que de stations du propriétaire ; Chez Jeannot : 2 ; Le Viaghji : 3 ;
- double : les autres boivent 1 gorgée ; trois doubles : cul sec et Baumettes ;
- Baumettes : 3 gorgées en y entrant, 1 par essai raté pour en sortir ;
- Station Total : 2 gorgées, Tunnel Prado-Carénage : 1 ;
- pile sur Départ : les autres boivent 1 gorgée ; Trottoir gratuit du Jarret : tournée générale, 1 gorgée pour tout le monde ;
- compléter un quartier : les autres boivent 2 gorgées ; faillite : cul sec ;
- 5 cartes Chance et 5 cartes Caisse de communauté sont remplacées par des cartes à boire (tournée générale, cul sec, le joueur suivant ou précédent boit…).

Chaque gorgée s'affiche dans une bulle au centre du plateau, qui reste jusqu'à ce qu'on clique sur **Santé !** (ou qu'on appuie sur Entrée ou Échap), et s'inscrit dans le journal. Chaque joueur a son compteur, et la fin de partie annonce la « plus grosse descente ». Le jeu rappelle qu'une gorgée peut être d'eau ou de sirop, et qu'on ne prend pas le volant après.

## Le plateau marseillais

| Quartier (couleur) | Propriétés | Prix |
| --- | --- | --- |
| Charbon Sud (marron) | Château Saint-Loup, Benza | 60 € |
| Charbon Nord (bleu ciel) | Fond Vert, Frais-Vallon, Malpassé | 100–120 € |
| Troubadour (violet) | Notre-Dame-du-Mont, Cours Julien, La Plaine | 140–160 € |
| Centre-ville (orange) | Rue de Rome, Rue Saint-Ferréol, La Canebière | 180–200 € |
| Endoume (rouge) | Rue d'Endoume, Vallon des Auffes, Malmousque | 220–240 € |
| Prado – Castellane (jaune) | Place Castellane, Avenue du Prado, Parc Borély | 260–280 € |
| Roucas-Blanc – Périer (vert) | Boulevard Périer, Chemin du Roucas-Blanc, Rue Paradis | 300–320 € |
| Bord de mer (bleu foncé) | Corniche Kennedy, Vieux-Port | 350–400 € |

- **Stations de métro** : Station Saint-Charles, Station Dromel, Station Joliette, Station Rond-Point du Prado.
- **Compagnies** : le bar Le Viaghji (à la place de la compagnie d'électricité) et le restaurant Chez Jeannot (à la place de la compagnie des eaux).
- **Taxes** : Station Total (200 €, à la place des impôts sur le revenu), Tunnel Prado-Carénage (100 €, à la place de la taxe de luxe).
- **Coins** : Départ, Les Baumettes / Simple visite, Trottoir gratuit du Jarret (le Parc gratuit), Allez aux Baumettes.

Les prix, loyers, prix des maisons et valeurs hypothécaires sont ceux du Monopoly français classique, case pour case.

## Règles spécifiques et choix d'interprétation

Le cahier des charges laisse quelques points ouverts. Voici les choix retenus, les plus proches possible des règles officielles :

**Structure et contenu**
- `index.html` a été déplacé de `src/` vers la racine, comme le demande la structure attendue du cahier des charges.
- La prison est **Les Baumettes** et le Parc gratuit le **Trottoir gratuit du Jarret**. Les quartiers regroupent des lieux voisins ; les deux premiers groupes sont le « Charbon Sud » (Château Saint-Loup, Benza) et le « Charbon Nord » (Fond Vert, Frais-Vallon, Malpassé), et le plateau monte jusqu'au bord de mer.
- Les cartes qui envoient vers une case précise sont transposées case pour case : Avenue Henri-Martin → Malmousque, Boulevard de la Villette → Notre-Dame-du-Mont, Gare de Lyon → Station Dromel, Rue de la Paix → Vieux-Port, Boulevard de Belleville → Château Saint-Loup.
- Le logo « Monopoly Marseille » est dessiné avec des polices système (aucun logo, mascotte ni typographie de la marque).

**Règles de jeu**
- **Pas d'enchère au refus d'achat** (choix de la maison) : une propriété qu'un joueur refuse d'acheter reste à la banque, et le prochain joueur qui s'y arrête peut l'acheter.
- **Enchères** : elles n'ont lieu que pour les propriétés reprises par la banque après une faillite. Elles commencent par le joueur dont c'est le tour, puis suivent l'ordre de jeu. Chaque offre doit dépasser la précédente d'au moins 1 € sans dépasser l'argent du joueur ; qui passe est éliminé. Si personne n'enchérit, la propriété reste à la banque. On ne peut pas hypothéquer ni construire pendant une enchère.
- **Levée d'hypothèque** : valeur hypothécaire + 10 %, arrondie à l'euro supérieur (par exemple 193 € pour la Corniche Kennedy).
- **Loyer doublé** : un terrain nu rapporte double dès que le quartier entier appartient au même joueur, même si un autre terrain du quartier est hypothéqué (règle officielle).
- **Compagnies** : le loyer se calcule sur le total du lancer en cours, y compris quand on y arrive par une carte.
- **Pénurie de maisons** : revendre un hôtel le remplace par 4 maisons. Si la banque n'a pas 4 maisons en stock, l'hôtel est revendu avec ses 4 maisons (soit 5 × la moitié du prix d'une maison) et le terrain redevient nu. Cela évite qu'un joueur endetté se retrouve bloqué.
- **Faillite** : elle n'est possible que si le joueur ne peut pas payer, même en revendant toutes ses constructions et en hypothéquant tout. Ses constructions sont revendues à la banque à moitié prix. Envers un joueur, celui-ci récupère l'argent, les propriétés (hypothèques comprises, **sans les 10 % d'intérêts** exigés par la règle officielle, par simplification) et les cartes. Envers la banque, les propriétés sont libérées de leur hypothèque et remises aux enchères une par une.
- **Échanges** : le joueur qui a la main (ou qui doit régler une dette) peut proposer un échange à tout moment de son tour, sauf pendant une enchère. Les terrains d'un quartier bâti ne s'échangent pas. Les propriétés hypothéquées restent hypothéquées.
- **Prison** : au troisième essai sans double, le joueur paie 50 € puis avance du total des dés. Une carte « sortie » utilisée retourne sous sa pioche.
- **Carte « amende ou Chance »** : le joueur choisit entre payer 10 € et tirer une carte Chance.

**Règles de la maison**
- **Cagnotte du Trottoir gratuit** : reçoit les taxes, les paiements des cartes (amendes, réparations, frais) et les 50 € de sortie de prison, mais pas les loyers.
- **Double salaire** : 400 € seulement en s'arrêtant pile sur Départ, que ce soit aux dés ou par une carte.
- **Partie rapide** : la partie s'arrête à la fin du tour de table qui atteint la limite (20 tours par défaut, réglable de 5 à 200). Le patrimoine compte l'argent, le prix des propriétés (moins la valeur hypothécaire si elles sont hypothéquées) et les constructions au prix d'achat.

**Mode en ligne**
- Le serveur fait autorité : il détient la partie, exécute chaque action et fait jouer les ordinateurs. Le joueur qui agit est déterminé par son jeton secret, jamais par ce qu'envoie le navigateur : impossible de jouer à la place d'un autre.
- Un joueur absent n'est déclaré déconnecté qu'après 4 secondes (un simple rechargement de page passe inaperçu). Si c'est son tour et qu'il ne revient pas au bout de 90 secondes, l'ordinateur joue à sa place ; les autres joueurs peuvent aussi le confier à l'ordinateur immédiatement. Dès son retour, il reprend la main.
- « Quitter la partie en ligne » laisse définitivement la place à l'ordinateur ; si l'hôte part, un autre joueur humain devient hôte. Un salon sans plus aucun humain est supprimé, et les salons inactifs depuis 6 heures sont nettoyés.
- On ne peut plus rejoindre une partie commencée, sauf pour reprendre sa propre place (même jeton, ou même nom si le joueur est déconnecté).
- Le serveur attend la fin des animations (dés, déplacements, cartes) avant de faire rejouer un ordinateur, pour que tout le monde puisse suivre.

**Mode Pastis**
- Le thème reprend les couleurs de l'apéritif marseillais (jaune et bleu, soleil rayonnant), sans logo ni nom de marque.
- Les couleurs des quartiers ne changent pas, pour que le plateau reste lisible.
- Les gorgées sont calculées par le moteur, comme l'argent : elles sont identiques sur tous les écrans en ligne et sauvegardées avec la partie. Un cul sec compte pour 5 gorgées dans le total.
- Les ordinateurs « boivent » aussi : leurs compteurs servent à animer la partie, à chacun de décider si un humain boit pour eux.
- Les gorgées ne demandent aucune décision de jeu, mais chaque bulle attend son « Santé ! » : la partie reprend sur cet écran une fois la bulle fermée (les ordinateurs d'une partie locale attendent aussi). En ligne, chacun ferme les bulles sur son propre écran ; le serveur continue de jouer, et les mises à jour reçues entre-temps s'affichent ensuite dans l'ordre.

**Vue 3D**
- Tout est en CSS 3D, sans bibliothèque : chaque mur, pignon et pan de toit est un élément habillé d'une image SVG. Les murs des images sont transparents, et la couleur du propriétaire est posée dessous.
- Les images (façades, toits, icônes, vagues, panorama) sont **générées par un script** sans dépendance, `outils/generer-images.mjs`, et versionnées dans `assets/` : le jeu n'a toujours aucune étape de construction. Un test vérifie que les fichiers sont à jour.
- Le panorama de la Corniche fait le tour de l'horizon : ses deux bords se raccordent, et il défile quand le plateau tourne. C'est une évocation dessinée, pas une vue géographiquement exacte.
- Sous une perspective, le navigateur dessine le plateau à sa taille de mise en page, puis l'agrandit : il deviendrait flou en zoomant. Au-delà d'un zoom de 1,5, le plateau et la table des joueurs sont donc mis en page en double taille et réduits d'autant, une fois le geste terminé. À l'inverse, la mer et le ponton sont dessinés en plus petit, ce qui ménage la mémoire graphique, et la mer tient en un seul disque, sans découpe : en plein écran, chaque grand calque se paie à chaque image.
- La vue 3D occupe tout l'écran : la scène se cadre dans l'espace que laisse le panneau des actions, la mer et le ciel couvrent le reste. Les panneaux des joueurs de la vue à plat laissent la place à la table.
- Les places, les piles de jetons, les verres et les colonnes de cartes sont calculés par un module sans DOM, testé (`table3d.js`). Les jetons de 500 € n'apparaissent qu'au-delà de 1 000 €, pour garder des piles de 100 € bien visibles ; une pile compte au plus 10 jetons et une valeur au plus 4 piles, au-delà l'étiquette donne le montant exact. De même, au plus 20 verres à shooter et 4 grands verres, puis « +N ».
- La table est peinte avec le décor, sur le ponton : d'abord les tapis à plat (cartes comprises), puis les jetons et les verres, debout. Dans une même scène 3D, Chromium découpe les surfaces selon le plan des éléments dressés (tranches du plateau, pions) et des morceaux de tapis disparaissaient.
- Les étiquettes des joueurs sont du HTML posé par-dessus la scène, à l'endroit calculé par la caméra : toujours nettes, elles restent entières à l'écran (celle d'une place hors champ attend au bord).
- La caméra est propre à chaque écran (y compris en ligne) et n'a aucun effet sur la partie. Avec le réglage « réduire les animations » du système, la mer, les bateaux, les mouettes et le tapis du joueur actif restent immobiles et la caméra change de position sans animation.
- En vue 3D, glisser un doigt n'importe où sur la scène la fait tourner : seul le panneau des actions défile.

**Ordinateurs et interface**
- L'IA propose au plus un échange par tour, et seulement un tour sur trois, pour ne pas harceler les humains.
- Les actions de l'ordinateur sont temporisées (de 0,25 s à 1,2 s selon la vitesse choisie) et attendent qu'une fenêtre ouverte par un humain soit fermée.
- La sauvegarde a lieu à chaque fin de tour : en rechargeant la page, on reprend au début du tour en cours. Une partie terminée n'est pas conservée.
- Les dés utilisent un générateur pseudo-aléatoire dont la graine fait partie de l'état sauvegardé : une partie reprise continue avec la même suite de tirages.
- Sur téléphone, le jeu reste consultable et jouable, mais le plateau est petit : une tablette ou un ordinateur est recommandé.

## Structure du code

```
index.html              page unique du jeu
package.json            scripts « npm start » (serveur) et « npm test »
serveur/                mode en ligne (Node.js, modules intégrés uniquement)
  serveur.js            serveur HTTP : fichiers du jeu, API JSON, flux Server-Sent Events
  salons.js             salons, joueurs et jetons, partie faisant autorité, IA, présence, sauvegarde
src/
  main.js               point d'entrée : chargement, accueil, partie locale ou en ligne, reconnexion
  moteur/               logique pure, sans DOM, testable avec Node (partagée par le serveur)
    partie.js           classe Partie : état JSON sérialisable et actions validées
    regles.js           calculs : loyers, quartiers, patrimoine, constantes
    alea.js             dés et mélange déterministes (graine dans l'état)
    ia.js               décisions des joueurs ordinateur
    donnees.js          validation de plateau.json et cartes.json
    pastis.js           mode Pastis : calcul des gorgées, cartes à boire, règles affichées
  reseau/
    client.js           client du mode en ligne : API, flux SSE, session et reconnexion
  ui/                   affichage
    controleur.js       relie le moteur (local) ou le serveur (en ligne) à l'interface, rejoue les animations
    plateau.js          plateau 11 × 11, centre, pions
    des.js              dés 3D animés
    vue3d.js            vue 3D : scène, mer et horizon, gestes de la caméra, maisons et hôtels en volume
    camera3d.js         calculs de la caméra 3D (limites, gestes, projection, horizon), sans DOM
    joueurs3d.js        joueurs autour du plateau en 3D : tapis, jetons, cartes, verres, étiquettes
    table3d.js          calculs de la table (places, jetons, verres, colonnes de cartes), sans DOM
    panneaux.js         panneaux des joueurs (et présence en ligne)
    fiche.js            fiche de propriété
    gestion.js          constructions, hypothèques, enchères, échanges, faillite
    ordinateur.js       tour des joueurs ordinateur (partie locale)
    accueil.js          écran d'accueil (local et en ligne)
    salon.js            salon d'attente en ligne
    sauvegarde.js       sauvegarde localStorage (partie locale)
    modale.js           fenêtres modales accessibles
    pions.js            pions marseillais en SVG
    utilitaires.js      outils DOM
  styles/               base.css, plateau.css, interface.css, vue3d.css, pastis.css (choix du mode et thème Pastis)
data/
  plateau.json          les 40 cases et les 8 quartiers
  cartes.json           16 cartes Chance + 16 cartes Caisse de communauté, et les 10 cartes du mode Pastis
assets/                 icône du jeu ; images générées de la vue 3D :
  batiments/            façades, pignons, toits et icônes des maisons et des hôtels
  decor/                panorama de la Corniche, vagues et reflets de la mer, ponton de bois, feutre des tapis
outils/
  generer-images.mjs    génère les images de assets/ (node outils/generer-images.mjs)
tests/                  tests unitaires et d'intégration (node --test)
docs/                   cahier des charges et règles du jeu
```

### Le mode en ligne

Le navigateur envoie ses actions en `POST` et reçoit l'état de la partie en direct par un flux [Server-Sent Events](https://developer.mozilla.org/fr/docs/Web/API/Server-sent_events), qui se reconnecte tout seul après une coupure. À chaque reconnexion, le serveur renvoie l'état complet. Chaque mise à jour porte un numéro de version, les événements à animer et la présence des joueurs.

| Requête | Rôle |
| --- | --- |
| `POST /api/salons` `{ nom, pion }` | crée un salon → `{ code, jeton, place }` |
| `POST /api/salons/:code/rejoindre` `{ nom, pion, jeton? }` | rejoint, ou reprend sa place |
| `POST /api/salons/:code/ordinateur`, `retirer`, `options`, `demarrer` | réglages de l'hôte |
| `POST /api/salons/:code/action` `{ jeton, action }` | joue une action → `{ ok, erreur?, version }` |
| `POST /api/salons/:code/remplacer` `{ jeton, place }` | confie un joueur déconnecté à l'ordinateur |
| `POST /api/salons/:code/quitter` `{ jeton }` | quitte le salon ou la partie |
| `GET /api/salons/:code/flux?jeton=…` | flux des mises à jour |

Seuls `index.html`, `src/`, `data/`, `assets/` et `docs/` sont servis : ni le code du serveur ni sa sauvegarde (qui contient les jetons) ne sont accessibles.

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

Évolutions :

- [x] Renommages marseillais : Les Baumettes, Trottoir gratuit du Jarret, Station Total, Tunnel Prado-Carénage, Le Viaghji, Chez Jeannot, La Plaine, Charbon Sud et Charbon Nord, Troubadour, Château Saint-Loup, Benza, Station Dromel
- [x] Pas d'enchère quand on refuse d'acheter
- [x] Animation 3D du lancer de dés
- [x] Multijoueur en ligne avec reconnexion
- [x] Mode Pastis : thème jaune et bleu, gorgées et cartes à boire, en local comme en ligne
- [x] Vue 3D avec décor, maisons et hôtels aux couleurs du propriétaire
- [x] Vue 3D : caméra libre (tourner, incliner, zoomer, déplacer), mer animée, Corniche à l'horizon, maisons et hôtels illustrés
- [x] Vue 3D en plein écran, joueurs assis autour du plateau : jetons de casino, titres de propriété, verres à shooter du mode Pastis

Idées pour la suite : sons (cigales, sirène du port), statistiques de fin de partie, chat dans le salon.
