import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { creerPartie, ok, ko, donner, piocherEnPremier, donnees } from './aide.js';
import { Partie } from '../src/moteur/partie.js';
import { calculerLoyer } from '../src/moteur/regles.js';

describe('création et sérialisation', () => {
  test('état initial', () => {
    const p = creerPartie(3);
    assert.equal(p.etat.joueurs.length, 3);
    assert.ok(p.etat.joueurs.every((j) => j.argent === 1500 && j.position === 0));
    assert.equal(p.etat.banque.maisons, 32);
    assert.equal(p.etat.banque.hotels, 12);
    assert.equal(Object.keys(p.etat.proprietes).length, 28);
    assert.equal(p.etat.pioches.chance.length, 16);
  });

  test('refuse moins de 2 ou plus de 6 joueurs', () => {
    assert.throws(() => creerPartie(1));
    assert.throws(() => creerPartie(7));
  });

  test("l'état est sérialisable et restaurable à l'identique", () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [3, 4] });
    const json = p.serialiser();
    const q = Partie.restaurer(donnees, json);
    assert.deepEqual(q.etat, JSON.parse(json));
    // Même graine → mêmes dés ensuite.
    const r = Partie.restaurer(donnees, json);
    if (q.etat.attente) { ok(q, { type: 'refuserAchat', joueur: 0 }); ok(r, { type: 'refuserAchat', joueur: 0 }); }
    ok(q, { type: 'finirTour', joueur: 0 });
    ok(r, { type: 'finirTour', joueur: 0 });
    ok(q, { type: 'lancer', joueur: 1 });
    ok(r, { type: 'lancer', joueur: 1 });
    assert.deepEqual(q.etat.des, r.etat.des);
  });

  test('refuse une sauvegarde invalide', () => {
    assert.throws(() => Partie.restaurer(donnees, '{"version":99}'));
  });
});

describe('dés et déplacements', () => {
  test('déplacement simple et fin de tour', () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [2, 3] });
    assert.equal(p.etat.joueurs[0].position, 5);
    assert.equal(p.etat.attente.type, 'achat');
    ko(p, { type: 'finirTour', joueur: 0 });
    ok(p, { type: 'refuserAchat', joueur: 0 });
    ko(p, { type: 'lancer', joueur: 0 });
    ok(p, { type: 'finirTour', joueur: 0 });
    assert.equal(p.etat.courant, 1);
    ko(p, { type: 'lancer', joueur: 0 });
  });

  test('passage par la case Départ : +200 €', () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].position = 38;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].position, 1);
    assert.equal(p.etat.joueurs[0].argent, 1700);
  });

  test('arrêt pile sur Départ : 200 € (400 € avec l\'option)', () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].position = 36;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(p.etat.joueurs[0].argent, 1700);
    const q = creerPartie(2, { doubleDepart: true });
    q.etat.joueurs[0].position = 36;
    ok(q, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(q.etat.joueurs[0].argent, 1900);
  });

  test('un double permet de rejouer', () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [3, 3] });
    assert.equal(p.etat.joueurs[0].position, 6);
    ok(p, { type: 'refuserAchat', joueur: 0 });
    ko(p, { type: 'finirTour', joueur: 0 });
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].position, 9);
    ok(p, { type: 'refuserAchat', joueur: 0 });
    ok(p, { type: 'finirTour', joueur: 0 });
  });

  test('trois doubles d\'affilée : prison', () => {
    const p = creerPartie(2);
    piocherEnPremier(p, 'communaute', 'communaute-08');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 1] }); // Caisse de communauté (2)
    ok(p, { type: 'lancer', joueur: 0, des: [2, 2] });
    if (p.etat.attente) ok(p, { type: 'refuserAchat', joueur: 0 });
    ok(p, { type: 'lancer', joueur: 0, des: [5, 5] });
    const j = p.etat.joueurs[0];
    assert.equal(j.position, 10);
    assert.equal(j.enPrison, true);
    assert.equal(p.etat.peutRejouer, false);
    ok(p, { type: 'finirTour', joueur: 0 });
  });

  test('case « Allez en prison »', () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].position = 25;
    ok(p, { type: 'lancer', joueur: 0, des: [2, 3] });
    assert.equal(p.etat.joueurs[0].position, 10);
    assert.ok(p.etat.joueurs[0].enPrison);
    assert.equal(p.etat.joueurs[0].argent, 1500, 'pas de salaire');
  });

  test('les événements de déplacement listent les cases traversées', () => {
    const p = creerPartie(2);
    p.extraireEvenements();
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    const dep = p.extraireEvenements().find((e) => e.type === 'deplacement');
    assert.deepEqual(dep.chemin, [1, 2, 3]);
  });
});

describe('prison', () => {
  const enPrison = () => {
    const p = creerPartie(2);
    Object.assign(p.etat.joueurs[0], { position: 10, enPrison: true });
    return p;
  };

  test('sortie avec un double, sans rejouer', () => {
    const p = enPrison();
    ok(p, { type: 'lancer', joueur: 0, des: [4, 4] });
    const j = p.etat.joueurs[0];
    assert.equal(j.enPrison, false);
    assert.equal(j.position, 18);
    assert.equal(p.etat.peutRejouer, false);
  });

  test('reste en prison sans double, sortie forcée au 3e essai avec 50 €', () => {
    const p = enPrison();
    for (let essai = 1; essai <= 2; essai++) {
      ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
      assert.equal(p.etat.joueurs[0].position, 10);
      ok(p, { type: 'finirTour', joueur: 0 });
      ok(p, { type: 'lancer', joueur: 1, des: [1, 2] });
      ok(p, { type: 'refuserAchat', joueur: 1 });
      ok(p, { type: 'finirTour', joueur: 1 });
    }
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    const j = p.etat.joueurs[0];
    assert.equal(j.enPrison, false);
    assert.equal(j.position, 13);
    assert.equal(j.argent, 1450);
  });

  test('sortie en payant 50 €', () => {
    const p = enPrison();
    ok(p, { type: 'payerPrison', joueur: 0 });
    assert.equal(p.etat.joueurs[0].argent, 1450);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].position, 13);
  });

  test('sortie avec une carte, qui retourne sous la pioche', () => {
    const p = enPrison();
    ko(p, { type: 'utiliserCarteSortie', joueur: 0 });
    p.etat.pioches.chance = p.etat.pioches.chance.filter((id) => id !== 'chance-08');
    p.etat.joueurs[0].cartesSortie.push('chance');
    ok(p, { type: 'utiliserCarteSortie', joueur: 0 });
    assert.equal(p.etat.joueurs[0].enPrison, false);
    assert.equal(p.etat.pioches.chance.at(-1), 'chance-08');
  });

  test('simple visite sans effet', () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].position = 7;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].enPrison, false);
    assert.equal(p.etat.joueurs[0].argent, 1500);
  });

  test('on ne peut pas payer après avoir lancé', () => {
    const p = enPrison();
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    ko(p, { type: 'payerPrison', joueur: 0 });
  });
});

describe('achats et loyers', () => {
  test('achat d\'une propriété libre', () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    ok(p, { type: 'acheter', joueur: 0 });
    assert.equal(p.etat.proprietes[3].proprietaire, 0);
    assert.equal(p.etat.joueurs[0].argent, 1440);
  });

  test("achat refusé faute d'argent", () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].argent = 50;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    ko(p, { type: 'acheter', joueur: 0 });
  });

  test('loyer terrain nu, doublé si groupe complet, avec maisons et hôtel', () => {
    const p = creerPartie(2);
    const e = p.etat, pl = p.plateau;
    donner(p, 1, 0);
    assert.equal(calculerLoyer(e, pl, 1), 2);
    donner(p, 3, 0);
    assert.equal(calculerLoyer(e, pl, 1), 4);
    for (let m = 1; m <= 5; m++) {
      e.proprietes[1].maisons = m;
      assert.equal(calculerLoyer(e, pl, 1), pl.cases[1].loyers[m]);
    }
    assert.equal(calculerLoyer(e, pl, 1), 250, 'hôtel');
  });

  test('loyers des gares : 25 / 50 / 100 / 200', () => {
    const p = creerPartie(2);
    const attendus = [25, 50, 100, 200];
    [5, 15, 25, 35].forEach((g, k) => {
      donner(p, g, 0);
      assert.equal(calculerLoyer(p.etat, p.plateau, 5), attendus[k]);
    });
  });

  test('loyers des compagnies : 4× ou 10× les dés', () => {
    const p = creerPartie(2);
    donner(p, 12, 0);
    assert.equal(calculerLoyer(p.etat, p.plateau, 12, 7), 28);
    donner(p, 28, 0);
    assert.equal(calculerLoyer(p.etat, p.plateau, 12, 7), 70);
  });

  test('pas de loyer sur une propriété hypothéquée', () => {
    const p = creerPartie(2);
    donner(p, 3, 1);
    p.etat.proprietes[3].hypotheque = true;
    assert.equal(calculerLoyer(p.etat, p.plateau, 3), 0);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].argent, 1500);
  });

  test('paiement du loyer au propriétaire, y compris compagnie selon les dés', () => {
    const p = creerPartie(2);
    donner(p, 12, 1);
    p.etat.joueurs[0].position = 7;
    piocherEnPremier(p, 'chance', 'chance-16');
    ok(p, { type: 'lancer', joueur: 0, des: [2, 3] });
    assert.equal(p.etat.joueurs[0].argent, 1480);
    assert.equal(p.etat.joueurs[1].argent, 1520);
  });

  test('taxes payées à la banque, ou sur le Parc gratuit avec l\'option', () => {
    const p = creerPartie(2);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(p.etat.joueurs[0].argent, 1300);
    assert.equal(p.etat.cagnotte, 0);
    const q = creerPartie(2, { parcGratuit: true });
    ok(q, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(q.etat.cagnotte, 200);
    ok(q, { type: 'finirTour', joueur: 0 });
    q.etat.joueurs[1].position = 15;
    ok(q, { type: 'lancer', joueur: 1, des: [2, 3] });
    assert.equal(q.etat.joueurs[1].argent, 1700);
    assert.equal(q.etat.cagnotte, 0);
  });

  test("dette quand l'argent manque, puis règlement", () => {
    const p = creerPartie(2);
    donner(p, 39, 1, 5);
    p.etat.joueurs[0].position = 35;
    p.etat.joueurs[0].argent = 1000;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(p.etat.dettes.length, 1);
    assert.equal(p.joueurActif(), 0);
    ko(p, { type: 'payerDette', joueur: 0 });
    ko(p, { type: 'finirTour', joueur: 0 });
    p.etat.joueurs[0].argent = 2500;
    ok(p, { type: 'payerDette', joueur: 0 });
    assert.equal(p.etat.joueurs[1].argent, 3500);
    ok(p, { type: 'finirTour', joueur: 0 });
  });
});

describe('cartes', () => {
  const surChance = (id, position = 7) => {
    const p = creerPartie(3);
    p.etat.joueurs[0].position = position - 3;
    piocherEnPremier(p, 'chance', id);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    return p;
  };

  test('aller_a : avance avec salaire si passage par Départ', () => {
    const p = surChance('chance-03', 22); // vers Rue des Trois-Mages (11)
    assert.equal(p.etat.joueurs[0].position, 11);
    assert.equal(p.etat.joueurs[0].argent, 1700);
    assert.equal(p.etat.attente.type, 'achat');
  });

  test('aller_a : sans salaire si pas de passage', () => {
    const p = surChance('chance-05', 36); // Vieux-Port
    assert.equal(p.etat.joueurs[0].position, 39);
    assert.equal(p.etat.joueurs[0].argent, 1500);
  });

  test('aller_a Départ : 200 €', () => {
    const p = surChance('chance-01');
    assert.equal(p.etat.joueurs[0].position, 0);
    assert.equal(p.etat.joueurs[0].argent, 1700);
  });

  test('aller_a avec recul : retour en arrière sans salaire', () => {
    const p = creerPartie(2);
    p.etat.joueurs[0].position = 14;
    piocherEnPremier(p, 'communaute', 'communaute-07');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].position, 1);
    assert.equal(p.etat.joueurs[0].argent, 1500);
  });

  test('reculer de 3 cases, et la case d\'arrivée s\'applique', () => {
    const p = surChance('chance-06', 7);
    assert.equal(p.etat.joueurs[0].position, 4);
    assert.equal(p.etat.joueurs[0].argent, 1300, 'impôt de la case 4');
  });

  test('prison', () => {
    const p = surChance('chance-07');
    assert.equal(p.etat.joueurs[0].position, 10);
    assert.ok(p.etat.joueurs[0].enPrison);
  });

  test('sortie de prison : conservée et retirée de la pioche', () => {
    const p = surChance('chance-08');
    assert.deepEqual(p.etat.joueurs[0].cartesSortie, ['chance']);
    assert.equal(p.etat.pioches.chance.length, 15);
    assert.ok(!p.etat.pioches.chance.includes('chance-08'));
  });

  test('les cartes ordinaires retournent sous la pioche', () => {
    const p = surChance('chance-16');
    assert.equal(p.etat.pioches.chance.at(-1), 'chance-16');
    assert.equal(p.etat.pioches.chance.length, 16);
  });

  test('réparations par maison et hôtel', () => {
    const p = creerPartie(2);
    donner(p, 1, 0, 3);
    donner(p, 3, 0, 5);
    p.etat.joueurs[0].position = 4;
    piocherEnPremier(p, 'chance', 'chance-10');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].argent, 1500 - (3 * 40 + 115));
  });

  test('payer et recevoir', () => {
    assert.equal(surChance('chance-12').etat.joueurs[0].argent, 1350);
    assert.equal(surChance('chance-15').etat.joueurs[0].argent, 1650);
  });

  test('payer une carte alimente la cagnotte avec l\'option Parc gratuit', () => {
    const p = creerPartie(2, { parcGratuit: true });
    p.etat.joueurs[0].position = 4;
    piocherEnPremier(p, 'chance', 'chance-12');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.cagnotte, 150);
  });

  test('anniversaire : chaque joueur donne 10 €', () => {
    const p = creerPartie(3);
    piocherEnPremier(p, 'communaute', 'communaute-09');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 1] });
    assert.deepEqual(p.etat.joueurs.map((j) => j.argent), [1520, 1490, 1490]);
  });

  test('amende ou carte Chance', () => {
    const p = creerPartie(2);
    piocherEnPremier(p, 'communaute', 'communaute-12');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 1] });
    assert.equal(p.etat.attente.type, 'choix_amende');
    ok(p, { type: 'choisirAmende', joueur: 0, choix: 'payer' });
    assert.equal(p.etat.joueurs[0].argent, 1490);

    const q = creerPartie(2);
    piocherEnPremier(q, 'communaute', 'communaute-12');
    piocherEnPremier(q, 'chance', 'chance-16');
    ok(q, { type: 'lancer', joueur: 0, des: [1, 1] });
    ok(q, { type: 'choisirAmende', joueur: 0, choix: 'chance' });
    assert.equal(q.etat.joueurs[0].argent, 1600);
  });

  test('toutes les cartes peuvent être tirées sans erreur', () => {
    for (const pioche of ['chance', 'communaute']) {
      for (const carte of donnees.cartes[pioche]) {
        const p = creerPartie(3);
        p.etat.joueurs[0].position = pioche === 'chance' ? 4 : 30;
        piocherEnPremier(p, pioche, carte.id);
        ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
        assert.ok(p.etat.journal.some((l) => l.includes(carte.texte)), carte.id);
      }
    }
  });
});

describe('validation des actions', () => {
  test("refuse l'action d'un joueur qui n'a pas la main", () => {
    const p = creerPartie(2);
    const r = ko(p, { type: 'lancer', joueur: 1 });
    assert.match(r.erreur, /pas à ce joueur/);
  });

  test('refuse une action inconnue', () => {
    const p = creerPartie(2);
    ko(p, { type: 'tricher', joueur: 0 });
  });

  test('actionsPossibles reflète la situation', () => {
    const p = creerPartie(2);
    assert.ok(p.actionsPossibles().includes('lancer'));
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.ok(p.actionsPossibles().includes('acheter'));
  });
});
