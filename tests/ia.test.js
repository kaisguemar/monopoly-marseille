import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { donnees, creerPartie, ok, donner } from './aide.js';
import { Partie } from '../src/moteur/partie.js';
import { deciderAction, evaluerEchange, actionsDeSecours } from '../src/moteur/ia.js';

const ordinateurs = (n, options = {}, graine = 1) => Partie.nouvelle(donnees, {
  joueurs: Array.from({ length: n }, (_, i) => ({ nom: `IA${i + 1}`, ia: true })),
  options,
  graine
});

// Joue la partie avec l'IA ; chaque décision doit être acceptée par le moteur.
function simuler(partie, maxActions = 30000) {
  let actions = 0;
  while (!partie.etat.terminee && actions < maxActions) {
    const action = deciderAction(partie);
    const r = partie.executer(action);
    assert.ok(r.ok, `action IA refusée (${JSON.stringify(action)}) : ${r.erreur}`);
    partie.extraireEvenements();
    actions++;
  }
  return actions;
}

describe('décisions de l\'ordinateur', () => {
  test('achète une propriété abordable', () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(deciderAction(p).type, 'acheter');
  });

  test("refuse un achat qui le mettrait à sec, sauf s'il complète un groupe", () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].argent = 100;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(deciderAction(p).type, 'refuserAchat');
    donner(p, 1, 0);
    assert.equal(deciderAction(p).type, 'acheter');
  });

  test('hypothèque une propriété isolée pour compléter un groupe', () => {
    const p = creerPartie(2);
    donner(p, 1, 0);
    donner(p, 15, 0);
    p.etat.joueurs[0].argent = 40;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.deepEqual(deciderAction(p), { type: 'hypothequer', joueur: 0, case: 15 });
  });

  test('enchérit jusqu\'à une limite raisonnable puis passe', () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    ok(p, { type: 'refuserAchat', joueur: 0 });
    const action = deciderAction(p);
    assert.equal(action.type, 'encherir');
    assert.equal(action.montant, 10);
    ok(p, { type: 'encherir', joueur: 0, montant: 70 });
    assert.equal(deciderAction(p).type, 'passerEnchere', 'au-delà de la valeur de 60 €');
  });

  test('construit quand il possède un groupe complet', () => {
    const p = creerPartie(2);
    donner(p, 37, 0);
    donner(p, 39, 0);
    assert.deepEqual(deciderAction(p), { type: 'construire', joueur: 0, case: 37 });
  });

  test('ne construit pas sans réserve suffisante', () => {
    const p = creerPartie(2);
    donner(p, 37, 0);
    donner(p, 39, 0);
    p.etat.joueurs[0].argent = 300;
    assert.equal(deciderAction(p).type, 'lancer');
  });

  test('gère la prison : paie en début de partie, reste plus tard', () => {
    const p = creerPartie(2);
    Object.assign(p.etat.joueurs[0], { enPrison: true, position: 10 });
    assert.equal(deciderAction(p).type, 'payerPrison');
    p.etat.joueurs[0].cartesSortie = ['chance'];
    assert.equal(deciderAction(p).type, 'utiliserCarteSortie');
    for (const prop of Object.values(p.etat.proprietes)) prop.proprietaire = 1;
    assert.equal(deciderAction(p).type, 'lancer');
  });

  test('vend et hypothèque pour éviter la faillite, puis paie', () => {
    const p = creerPartie(2);
    donner(p, 1, 0, 1);
    donner(p, 3, 0, 1);
    donner(p, 39, 1, 5);
    Object.assign(p.etat.joueurs[0], { position: 35, argent: 1350 });
    p.etat.proprietes[39].maisons = 3; // loyer 1 400 €
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    const vus = [];
    while (p.etat.dettes.length) {
      const action = deciderAction(p);
      vus.push(action.type);
      ok(p, action);
    }
    assert.deepEqual(vus, ['vendreConstruction', 'vendreConstruction', 'payerDette']);
  });

  test('déclare faillite quand plus rien ne peut être vendu', () => {
    const p = creerPartie(2);
    donner(p, 39, 1, 5);
    Object.assign(p.etat.joueurs[0], { position: 35, argent: 100 });
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(deciderAction(p).type, 'declarerFaillite');
  });

  test('évalue les échanges : accepte une bonne affaire, refuse de compléter le groupe adverse', () => {
    const p = creerPartie(2);
    donner(p, 39, 1);
    donner(p, 37, 0);
    // J1 rachète la Corniche à J0 pour 600 € : J1 complèterait son groupe.
    const vendre = { de: 1, a: 0, donne: { proprietes: [], argent: 600, cartes: 0 }, recoit: { proprietes: [37], argent: 0, cartes: 0 } };
    assert.ok(evaluerEchange(p.etat, p.plateau, vendre, 0) < 0);
    // J1 cède une gare isolée contre 300 € : bonne affaire pour J1.
    donner(p, 5, 1);
    const gare = { de: 0, a: 1, donne: { proprietes: [], argent: 300, cartes: 0 }, recoit: { proprietes: [5], argent: 0, cartes: 0 } };
    assert.ok(evaluerEchange(p.etat, p.plateau, gare, 1) > 0);
  });

  test("propose de racheter la propriété qui lui manque", () => {
    const p = creerPartie(2);
    p.etat.tour = 3;
    donner(p, 37, 0);
    donner(p, 39, 1);
    const action = deciderAction(p);
    assert.equal(action.type, 'proposerEchange');
    assert.deepEqual(action.offre.recoit.proprietes, [39]);
    ok(p, action);
    assert.equal(deciderAction(p).type, 'repondreEchange');
  });

  test('actions de secours toujours disponibles', () => {
    const p = creerPartie(2);
    assert.deepEqual(actionsDeSecours(p).map((a) => a.type), ['lancer']);
  });
});

describe('parties complètes entre ordinateurs', () => {
  test('des parties rapides se terminent sans action refusée', () => {
    for (let graine = 1; graine <= 12; graine++) {
      const p = ordinateurs(2 + (graine % 5), { partieRapide: true, toursMax: 40, parcGratuit: graine % 2 === 0, doubleDepart: graine % 3 === 0 }, graine);
      simuler(p);
      assert.ok(p.etat.terminee, `graine ${graine}`);
      assert.notEqual(p.etat.gagnant, null);
      // Cohérence : stock de constructions et argent positif.
      let maisons = 0, hotels = 0;
      for (const prop of Object.values(p.etat.proprietes)) {
        if (prop.maisons === 5) hotels++; else maisons += prop.maisons;
      }
      assert.equal(maisons + p.etat.banque.maisons, 32);
      assert.equal(hotels + p.etat.banque.hotels, 12);
      assert.ok(p.etat.joueurs.every((j) => j.argent >= 0));
    }
  });

  test('des parties classiques vont jusqu\'à la victoire par faillite', () => {
    for (let graine = 100; graine < 112; graine++) {
      const p = ordinateurs(2 + (graine % 5), {}, graine);
      simuler(p, 20000);
      assert.ok(p.etat.terminee, `graine ${graine} : partie non terminée`);
      assert.equal(p.etat.joueurs.filter((j) => !j.faillite).length, 1);
    }
  });
});
