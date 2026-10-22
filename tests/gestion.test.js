import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { creerPartie, ok, ko, donner } from './aide.js';
import { patrimoine, valeurLiquidable } from '../src/moteur/regles.js';

describe('constructions', () => {
  const avecQuartier = () => {
    const p = creerPartie(2);
    donner(p, 1, 0);
    donner(p, 3, 0);
    return p;
  };

  test('groupe complet requis', () => {
    const p = creerPartie(2);
    donner(p, 1, 0);
    ko(p, { type: 'construire', joueur: 0, case: 1 });
    donner(p, 3, 0);
    ok(p, { type: 'construire', joueur: 0, case: 1 });
    assert.equal(p.etat.proprietes[1].maisons, 1);
    assert.equal(p.etat.joueurs[0].argent, 1450);
    assert.equal(p.etat.banque.maisons, 31);
  });

  test('pas de construction sur une gare ni sur la propriété d\'un autre', () => {
    const p = creerPartie(2);
    donner(p, 5, 0);
    ko(p, { type: 'construire', joueur: 0, case: 5 });
    donner(p, 1, 1);
    donner(p, 3, 1);
    ko(p, { type: 'construire', joueur: 0, case: 1 });
  });

  test('construction uniforme', () => {
    const p = avecQuartier();
    ok(p, { type: 'construire', joueur: 0, case: 1 });
    ko(p, { type: 'construire', joueur: 0, case: 1 });
    ok(p, { type: 'construire', joueur: 0, case: 3 });
    ok(p, { type: 'construire', joueur: 0, case: 1 });
  });

  test("hôtel après 4 maisons : rend 4 maisons à la banque", () => {
    const p = avecQuartier();
    for (let k = 0; k < 4; k++) {
      ok(p, { type: 'construire', joueur: 0, case: 1 });
      ok(p, { type: 'construire', joueur: 0, case: 3 });
    }
    assert.equal(p.etat.banque.maisons, 24);
    ok(p, { type: 'construire', joueur: 0, case: 1 });
    assert.equal(p.etat.proprietes[1].maisons, 5);
    assert.equal(p.etat.banque.maisons, 28);
    assert.equal(p.etat.banque.hotels, 11);
    ko(p, { type: 'construire', joueur: 0, case: 1 });
  });

  test('stock limité de maisons et d\'hôtels', () => {
    const p = avecQuartier();
    p.etat.banque.maisons = 0;
    const r = ko(p, { type: 'construire', joueur: 0, case: 1 });
    assert.match(r.erreur, /plus de maison/);
    Object.assign(p.etat.proprietes[1], { maisons: 4 });
    Object.assign(p.etat.proprietes[3], { maisons: 4 });
    p.etat.banque.hotels = 0;
    assert.match(ko(p, { type: 'construire', joueur: 0, case: 1 }).erreur, /plus d'hôtel/);
  });

  test("pas de construction si une propriété du groupe est hypothéquée, ni sans argent", () => {
    const p = avecQuartier();
    p.etat.proprietes[3].hypotheque = true;
    ko(p, { type: 'construire', joueur: 0, case: 1 });
    p.etat.proprietes[3].hypotheque = false;
    p.etat.joueurs[0].argent = 10;
    ko(p, { type: 'construire', joueur: 0, case: 1 });
  });

  test('revente à moitié prix, uniforme', () => {
    const p = avecQuartier();
    ok(p, { type: 'construire', joueur: 0, case: 1 });
    ok(p, { type: 'construire', joueur: 0, case: 3 });
    ok(p, { type: 'construire', joueur: 0, case: 1 });
    ko(p, { type: 'vendreConstruction', joueur: 0, case: 3 });
    ok(p, { type: 'vendreConstruction', joueur: 0, case: 1 });
    assert.equal(p.etat.joueurs[0].argent, 1500 - 150 + 25);
    assert.equal(p.etat.banque.maisons, 30);
  });

  test("revente d'un hôtel : redevient 4 maisons (ou terrain nu en cas de pénurie)", () => {
    const p = avecQuartier();
    Object.assign(p.etat.proprietes[1], { maisons: 5 });
    Object.assign(p.etat.proprietes[3], { maisons: 5 });
    p.etat.banque = { maisons: 32, hotels: 10 };
    ok(p, { type: 'vendreConstruction', joueur: 0, case: 1 });
    assert.equal(p.etat.proprietes[1].maisons, 4);
    assert.deepEqual(p.etat.banque, { maisons: 28, hotels: 11 });
    // Pénurie de maisons : l'hôtel part avec ses 4 maisons.
    p.etat.banque.maisons = 2;
    const avant = p.etat.joueurs[0].argent;
    ok(p, { type: 'vendreConstruction', joueur: 0, case: 3 });
    assert.equal(p.etat.proprietes[3].maisons, 0);
    assert.equal(p.etat.joueurs[0].argent, avant + 125);
    assert.deepEqual(p.etat.banque, { maisons: 2, hotels: 12 });
  });
});

describe('hypothèques', () => {
  test('hypothèque à la valeur hypothécaire, levée à +10 %', () => {
    const p = creerPartie(2);
    donner(p, 39, 0);
    ok(p, { type: 'hypothequer', joueur: 0, case: 39 });
    assert.equal(p.etat.joueurs[0].argent, 1700);
    ko(p, { type: 'hypothequer', joueur: 0, case: 39 });
    ok(p, { type: 'leverHypotheque', joueur: 0, case: 39 });
    assert.equal(p.etat.joueurs[0].argent, 1700 - 220);
    assert.equal(p.etat.proprietes[39].hypotheque, false);
  });

  test('levée arrondie à l\'euro supérieur', () => {
    const p = creerPartie(2);
    donner(p, 37, 0);
    ok(p, { type: 'hypothequer', joueur: 0, case: 37 });
    ok(p, { type: 'leverHypotheque', joueur: 0, case: 37 });
    assert.equal(p.etat.joueurs[0].argent, 1500 + 175 - 193);
  });

  test("pas d'hypothèque s'il reste des constructions dans le groupe", () => {
    const p = creerPartie(2);
    donner(p, 1, 0);
    donner(p, 3, 0, 1);
    ko(p, { type: 'hypothequer', joueur: 0, case: 1 });
    p.etat.proprietes[3].maisons = 0;
    ok(p, { type: 'hypothequer', joueur: 0, case: 1 });
  });

  test("levée impossible sans l'argent nécessaire", () => {
    const p = creerPartie(2);
    donner(p, 39, 0);
    p.etat.proprietes[39].hypotheque = true;
    p.etat.joueurs[0].argent = 100;
    ko(p, { type: 'leverHypotheque', joueur: 0, case: 39 });
  });
});

describe('enchères', () => {
  // Enchère sur Marché des Capucins, comme pour un bien repris par la banque.
  const ouvrir = (n = 3) => {
    const p = creerPartie(n);
    p.etat.encheresEnAttente.push(3);
    p.progresser();
    assert.equal(p.etat.attente.type, 'enchere');
    return p;
  };

  test("refuser d'acheter n'ouvre pas d'enchère : la propriété reste à la banque", () => {
    const p = creerPartie(3);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    ok(p, { type: 'refuserAchat', joueur: 0 });
    assert.equal(p.etat.attente, null);
    assert.equal(p.etat.proprietes[3].proprietaire, null);
    ok(p, { type: 'finirTour', joueur: 0 });
  });

  test('une enchère se joue entre tous les joueurs', () => {
    const p = ouvrir();
    assert.deepEqual(p.etat.attente.participants, [0, 1, 2]);
    assert.equal(p.joueurActif(), 0);
  });

  test('le plus offrant remporte la propriété', () => {
    const p = ouvrir();
    ok(p, { type: 'encherir', joueur: 0, montant: 10 });
    ok(p, { type: 'encherir', joueur: 1, montant: 30 });
    ok(p, { type: 'passerEnchere', joueur: 2 });
    ok(p, { type: 'encherir', joueur: 0, montant: 40 });
    ok(p, { type: 'passerEnchere', joueur: 1 });
    assert.equal(p.etat.attente, null);
    assert.equal(p.etat.proprietes[3].proprietaire, 0);
    assert.equal(p.etat.joueurs[0].argent, 1460);
  });

  test('offre invalide : trop basse ou au-delà de son argent', () => {
    const p = ouvrir();
    ok(p, { type: 'encherir', joueur: 0, montant: 50 });
    ko(p, { type: 'encherir', joueur: 1, montant: 50 });
    ko(p, { type: 'encherir', joueur: 1, montant: 5000 });
    ko(p, { type: 'encherir', joueur: 2, montant: 60 });
  });

  test('si tout le monde passe, la propriété reste à la banque', () => {
    const p = ouvrir(2);
    ok(p, { type: 'passerEnchere', joueur: 0 });
    ok(p, { type: 'passerEnchere', joueur: 1 });
    assert.equal(p.etat.attente, null);
    assert.equal(p.etat.proprietes[3].proprietaire, null);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
  });

  test('le dernier joueur restant peut encore enchérir', () => {
    const p = ouvrir(2);
    ok(p, { type: 'passerEnchere', joueur: 0 });
    assert.equal(p.joueurActif(), 1);
    ok(p, { type: 'encherir', joueur: 1, montant: 1 });
    assert.equal(p.etat.proprietes[3].proprietaire, 1);
    assert.equal(p.etat.joueurs[1].argent, 1499);
  });

  test('pas de gestion des biens pendant une enchère', () => {
    const p = ouvrir();
    donner(p, 39, 0);
    ko(p, { type: 'hypothequer', joueur: 0, case: 39 });
  });
});

describe('échanges', () => {
  test('échange de propriétés, d\'argent et de cartes', () => {
    const p = creerPartie(2);
    donner(p, 1, 0);
    donner(p, 3, 1);
    p.etat.joueurs[1].cartesSortie = ['chance'];
    ok(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { proprietes: [1], argent: 100 }, recoit: { proprietes: [3], cartes: 1 } } });
    assert.equal(p.joueurActif(), 1);
    ok(p, { type: 'repondreEchange', joueur: 1, accepter: true });
    assert.equal(p.etat.proprietes[1].proprietaire, 1);
    assert.equal(p.etat.proprietes[3].proprietaire, 0);
    assert.equal(p.etat.joueurs[0].argent, 1400);
    assert.equal(p.etat.joueurs[1].argent, 1600);
    assert.deepEqual(p.etat.joueurs[0].cartesSortie, ['chance']);
    assert.equal(p.joueurActif(), 0);
  });

  test('échange refusé : rien ne change', () => {
    const p = creerPartie(2);
    donner(p, 1, 0);
    ok(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { proprietes: [1] }, recoit: { argent: 500 } } });
    ok(p, { type: 'repondreEchange', joueur: 1, accepter: false });
    assert.equal(p.etat.proprietes[1].proprietaire, 0);
    assert.equal(p.etat.joueurs[0].argent, 1500);
  });

  test('les propriétés hypothéquées sont échangées avec leur hypothèque', () => {
    const p = creerPartie(2);
    donner(p, 5, 0);
    p.etat.proprietes[5].hypotheque = true;
    ok(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { proprietes: [5] }, recoit: { argent: 50 } } });
    ok(p, { type: 'repondreEchange', joueur: 1, accepter: true });
    assert.equal(p.etat.proprietes[5].proprietaire, 1);
    assert.equal(p.etat.proprietes[5].hypotheque, true);
  });

  test('échanges invalides refusés', () => {
    const p = creerPartie(3);
    donner(p, 1, 0);
    donner(p, 3, 0, 1);
    donner(p, 39, 1);
    ko(p, { type: 'proposerEchange', joueur: 0, offre: { a: 0, donne: { argent: 10 } } });
    ko(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { proprietes: [39] } } });
    ko(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { proprietes: [1] } } }, 'constructions dans le quartier');
    ko(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { argent: 99999 } } });
    ko(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1, donne: { cartes: 1 } } });
    ko(p, { type: 'proposerEchange', joueur: 0, offre: { a: 1 } });
    ko(p, { type: 'proposerEchange', joueur: 1, offre: { a: 0, donne: { argent: 10 } } }, 'pas son tour');
  });
});

describe('faillite', () => {
  // J1 doit un loyer énorme sur le Vieux-Port de J2 (hôtel : 2 000 €).
  const ruine = (n = 2) => {
    const p = creerPartie(n);
    donner(p, 37, 1, 5);
    donner(p, 39, 1, 5);
    p.etat.joueurs[0].position = 35;
    return p;
  };

  test("faillite refusée tant qu'on peut payer en liquidant ses biens", () => {
    const p = ruine();
    donner(p, 1, 0);
    p.etat.joueurs[0].argent = 1980;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(p.etat.dettes.length, 1);
    ko(p, { type: 'declarerFaillite', joueur: 0 });
    ok(p, { type: 'hypothequer', joueur: 0, case: 1 });
    ok(p, { type: 'payerDette', joueur: 0 });
    assert.equal(p.etat.joueurs[1].argent, 3500);
  });

  test('faillite envers un joueur : il récupère argent, propriétés (hypothéquées) et cartes', () => {
    const p = ruine(3);
    donner(p, 1, 0, 0);
    donner(p, 3, 0, 0);
    donner(p, 6, 0);
    p.etat.proprietes[6].hypotheque = true;
    Object.assign(p.etat.proprietes[1], { maisons: 2 });
    Object.assign(p.etat.proprietes[3], { maisons: 2 });
    p.etat.banque.maisons = 28;
    p.etat.joueurs[0].cartesSortie = ['communaute'];
    p.etat.joueurs[0].argent = 100;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    ok(p, { type: 'declarerFaillite', joueur: 0 });
    const [j0, j1] = p.etat.joueurs;
    assert.equal(j0.faillite, true);
    assert.equal(j0.argent, 0);
    assert.equal(j1.argent, 1500 + 100 + 4 * 25, 'argent + constructions revendues à moitié prix');
    assert.equal(p.etat.banque.maisons, 32);
    for (const i of [1, 3, 6]) assert.equal(p.etat.proprietes[i].proprietaire, 1);
    assert.equal(p.etat.proprietes[6].hypotheque, true);
    assert.deepEqual(j1.cartesSortie, ['communaute']);
    assert.equal(p.etat.courant, 1, 'le tour passe au joueur suivant');
    assert.equal(p.etat.terminee, false);
  });

  test('faillite envers la banque : les propriétés sont remises aux enchères', () => {
    const p = creerPartie(3);
    donner(p, 1, 0);
    donner(p, 3, 0);
    p.etat.proprietes[3].hypotheque = true;
    p.etat.joueurs[0].argent = 10;
    p.etat.joueurs[0].cartesSortie = ['chance'];
    p.etat.pioches.chance = p.etat.pioches.chance.filter((id) => id !== 'chance-08');
    p.etat.joueurs[0].position = 1;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] }); // Station Total : 200 €
    ok(p, { type: 'declarerFaillite', joueur: 0 });
    assert.equal(p.etat.attente.type, 'enchere');
    assert.equal(p.etat.attente.case, 1);
    assert.deepEqual(p.etat.attente.participants, [1, 2]);
    assert.equal(p.etat.proprietes[3].hypotheque, false);
    assert.equal(p.etat.encheresEnAttente.length, 1);
    assert.ok(p.etat.pioches.chance.includes('chance-08'));
    ok(p, { type: 'encherir', joueur: 1, montant: 20 });
    ok(p, { type: 'passerEnchere', joueur: 2 });
    assert.equal(p.etat.proprietes[1].proprietaire, 1);
    assert.equal(p.etat.attente.case, 3);
    ok(p, { type: 'passerEnchere', joueur: 1 });
    ok(p, { type: 'passerEnchere', joueur: 2 });
    assert.equal(p.etat.courant, 1);
    assert.equal(p.joueurActif(), 1);
  });

  test('le dernier joueur non en faillite gagne', () => {
    const p = ruine(2);
    p.etat.joueurs[0].argent = 10;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    ok(p, { type: 'declarerFaillite', joueur: 0 });
    assert.equal(p.etat.terminee, true);
    assert.equal(p.etat.gagnant, 1);
    ko(p, { type: 'lancer', joueur: 1 });
  });

  test("faillite d'un joueur qui doit pour un anniversaire", () => {
    const p = creerPartie(3);
    p.etat.joueurs[2].argent = 5;
    const id = 'communaute-09';
    const liste = p.etat.pioches.communaute;
    liste.splice(liste.indexOf(id), 1);
    liste.unshift(id);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 1] });
    assert.equal(p.joueurActif(), 2);
    ok(p, { type: 'declarerFaillite', joueur: 2 });
    assert.equal(p.etat.joueurs[0].argent, 1500 + 10 + 5);
    assert.equal(p.joueurActif(), 0);
    assert.equal(p.etat.peutRejouer, true);
  });
});

describe('fin de partie et patrimoine', () => {
  test('patrimoine et valeur liquidable', () => {
    const p = creerPartie(2);
    donner(p, 1, 0, 2);
    donner(p, 5, 0);
    p.etat.proprietes[5].hypotheque = true;
    assert.equal(patrimoine(p.etat, p.plateau, 0), 1500 + 60 + 100 + 100);
    assert.equal(valeurLiquidable(p.etat, p.plateau, 0), 1500 + 50 + 30);
  });

  test('partie rapide : victoire au patrimoine après la limite de tours', () => {
    const p = creerPartie(2, { partieRapide: true, toursMax: 1 });
    donner(p, 39, 1);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    ok(p, { type: 'finirTour', joueur: 0 });
    ok(p, { type: 'lancer', joueur: 1, des: [1, 3] });
    ok(p, { type: 'finirTour', joueur: 1 });
    assert.equal(p.etat.terminee, true);
    assert.equal(p.etat.gagnant, 1);
  });
});
