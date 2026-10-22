# Cahier des charges — Monopoly Marseille

Ce document est la référence complète pour développer le jeu de A à Z. Lis-le entièrement avant de commencer, puis réalise les phases dans l'ordre, avec au moins un commit par phase.

## 1. Objectif

Un Monopoly version Marseille, jouable entièrement dans le navigateur, en français, de 2 à 6 joueurs sur le même écran (tour par tour), avec des joueurs ordinateur optionnels. Le jeu doit être agréable, lisible et fidèle aux règles du Monopoly français.

## 2. Contraintes techniques

- **HTML, CSS et JavaScript vanilla (modules ES)**, sans framework ni étape de build obligatoire : le jeu doit fonctionner en ouvrant `index.html` via un petit serveur statique (`npx serve` ou `python3 -m http.server`).
- Aucune dépendance externe à l'exécution (pas de CDN, polices système ou incluses dans `assets/`).
- Le code de logique du jeu (règles, état, calculs) doit être **séparé de l'affichage** et testable sans navigateur.
- Tests unitaires avec le lanceur intégré de Node (`node --test`), sans dépendance.
- Code et commentaires en français, noms de variables en français ou anglais mais cohérents dans tout le projet.
- Responsive : jouable sur un ordinateur portable et sur une tablette ; sur téléphone, au minimum consultable.

## 3. Structure attendue

```
index.html
src/
  main.js            point d'entrée, branche la logique et l'affichage
  moteur/            logique pure (état de partie, règles, dés, enchères, faillite, IA)
  ui/                rendu du plateau, panneaux, modales, animations
  styles/            CSS
data/
  plateau.json       les 40 cases
  cartes.json        16 cartes Chance + 16 cartes Caisse de communauté
assets/              images, icônes, polices éventuelles
tests/               tests unitaires du moteur
docs/                ce cahier des charges, règles de la maison
README.md
```

## 4. Contenu marseillais

### Plateau (`data/plateau.json`)
- 40 cases dans l'ordre exact du Monopoly français : Départ, 22 propriétés réparties en 8 groupes de couleur, 4 gares, 2 compagnies, Impôts sur le revenu, Taxe de luxe, 3 Chance, 3 Caisse de communauté, Prison / Simple visite, Parc gratuit, Allez en prison.
- Remplace les rues par des rues, places, quartiers et lieux emblématiques de Marseille, avec une progression cohérente : groupes les moins chers = quartiers populaires, groupes les plus chers = lieux prestigieux (Corniche Kennedy, Vieux-Port, Prado, etc.). Regroupe les lieux par proximité géographique quand c'est possible.
- Gares : 4 gares ou stations marseillaises (par exemple Saint-Charles, Blancarde, et stations de métro emblématiques).
- Compagnies : équivalents marseillais de l'eau et de l'électricité (par exemple la Société des Eaux de Marseille et une compagnie d'électricité fictive à nom marseillais).
- Taxes renommées avec humour local.
- Pour chaque propriété : nom, groupe, couleur, prix d'achat, loyer nu, loyers avec 1 à 4 maisons et hôtel, prix d'une maison, valeur hypothécaire — en reprenant **les valeurs du Monopoly français classique** (en euros).
- Vérifie les noms : ils doivent correspondre à de vrais lieux de Marseille, orthographiés correctement.

### Cartes (`data/cartes.json`)
- 16 cartes Chance et 16 cartes Caisse de communauté, avec les **mêmes effets** que le jeu original (avancer, reculer, payer, recevoir, réparations par maison et hôtel, carte « sortie de prison », etc.).
- Textes réécrits avec une ambiance marseillaise : clins d'œil au mistral, à l'OM, à la bouillabaisse, aux calanques, au Vélodrome, à la Bonne Mère… Humour bienvenu, jamais vulgaire ni stigmatisant envers un quartier ou une population.
- Chaque carte a un identifiant, un texte et un effet décrit de façon structurée (type d'action + paramètres), interprété par le moteur.

## 5. Règles du jeu (moteur)

Implémente les règles officielles du Monopoly français :
- 2 à 6 joueurs, 1 500 € de départ chacun, répartition gérée par la banque.
- Lancer de deux dés ; double = rejouer ; trois doubles d'affilée = prison.
- Passage par la case Départ : +200 €.
- Achat d'une propriété libre ; si le joueur refuse, **enchère** entre tous les joueurs.
- Loyers : terrain nu, loyer doublé si le groupe complet est possédé sans construction, loyers avec maisons et hôtel ; gares (25/50/100/200 € selon le nombre possédé) ; compagnies (4× ou 10× le total des dés).
- Constructions : groupe complet requis, construction **uniforme** au sein du groupe, stock limité à 32 maisons et 12 hôtels, revente à moitié prix.
- Hypothèques : à la valeur hypothécaire, levée à +10 %, pas de loyer sur une propriété hypothéquée, pas d'hypothèque s'il reste des constructions dans le groupe.
- Prison : sortie en faisant un double (3 essais), en payant 50 €, ou avec une carte « sortie de prison » ; simple visite sans effet.
- Échanges entre joueurs : propriétés, argent et cartes « sortie de prison ».
- Faillite : vente des constructions et hypothèques pour payer ; sinon faillite, les biens reviennent au créancier (ou à la banque, remis aux enchères).
- Fin de partie : dernier joueur non en faillite, ou mode « partie rapide » optionnel avec limite de tours et victoire au patrimoine le plus élevé.
- Options de règles de la maison désactivées par défaut et activables au lancement : argent des taxes et amendes sur le Parc gratuit, double gain sur la case Départ.

Le moteur doit exposer un état de partie sérialisable en JSON et des actions explicites (lancer les dés, acheter, enchérir, construire, hypothéquer, échanger, finir le tour…), chacune validée par les règles.

## 6. Joueurs ordinateur

- Chaque joueur peut être humain ou ordinateur.
- Une IA simple mais crédible : achète selon sa trésorerie et la valeur du groupe, construit quand elle complète un groupe, enchérit jusqu'à une limite raisonnable, gère la prison, hypothèque pour éviter la faillite, accepte ou refuse les échanges selon une évaluation simple.
- Les actions de l'IA sont légèrement temporisées pour que les humains puissent suivre.

## 7. Interface

- Écran d'accueil : titre, choix du nombre de joueurs, noms, pions, humain ou ordinateur, options de règles, bouton « Nouvelle partie » et « Reprendre la partie » s'il existe une sauvegarde.
- Plateau carré de 40 cases, centre du plateau avec le logo du jeu, les pioches de cartes et le journal de partie.
- Pions marseillais (par exemple : un bateau de pêche, un ballon, une cigale, un savon de Marseille, une navette, une sardine) dessinés en SVG ou CSS.
- Animation du lancer de dés et du déplacement des pions case par case.
- Panneau par joueur : argent, propriétés regroupées par couleur, constructions, hypothèques, cartes spéciales.
- Fiche de propriété au clic sur une case (prix, loyers, propriétaire).
- Modales claires pour : achat, enchère, carte tirée, prison, construction, hypothèque, échange, faillite, fin de partie.
- Journal des événements de la partie.
- Identité visuelle marseillaise : couleurs méditerranéennes (bleu mer, blanc calcaire, ocre), sans copier l'identité visuelle officielle du Monopoly (pas de logo, mascotte ni typographie de la marque).
- Accessibilité : contrastes suffisants, navigation au clavier sur les boutons principaux, couleurs de groupe toujours accompagnées du nom du groupe.

## 8. Sauvegarde

- Sauvegarde automatique de la partie dans `localStorage` à chaque fin de tour, avec gestion des erreurs (le jeu fonctionne même si le stockage est indisponible).
- Bouton pour abandonner la partie et effacer la sauvegarde.

## 9. Tests et qualité

- Tests unitaires du moteur couvrant au minimum : déplacements et passage par Départ, doubles et prison, calcul de tous les types de loyers, construction uniforme et stock limité, hypothèques, enchères, effets de chaque type de carte, faillite et transfert des biens.
- Vérification que `data/plateau.json` contient bien 40 cases et `data/cartes.json` 16 + 16 cartes valides.
- Tous les tests passent avec `node --test` avant la fin de chaque phase.

## 10. Phases de réalisation

1. **Données** : `plateau.json` et `cartes.json` complets et validés par des tests.
2. **Moteur** : état de partie, dés, déplacements, achats, loyers, cartes, prison, avec tests.
3. **Plateau** : affichage du plateau et des pions, lancer de dés et déplacement animé, partie jouable en mode simple.
4. **Gestion avancée** : constructions, hypothèques, enchères, échanges, faillite, fin de partie.
5. **Joueurs ordinateur**.
6. **Finitions** : écran d'accueil, sauvegarde, options de règles, responsive, accessibilité, journal.
7. **Documentation** : README à jour (présentation, lancement, règles spécifiques, structure du code, feuille de route cochée) et `docs/REGLES.md` avec les règles du jeu en français.

## 11. Critères de fin

- Une partie complète peut être jouée du début à la fin, à plusieurs humains et contre l'ordinateur, sans erreur dans la console.
- Tous les tests passent.
- Le README explique comment lancer le jeu en une commande.
