// Tests du mode Pastis (jeu à boire) : gorgées, cartes remplacées, parties complètes, salons en ligne.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { donnees, cartes, plateau, creerPartie, ok, donner, piocherEnPremier } from './aide.js';
import { Partie } from '../src/moteur/partie.js';
import { deciderAction } from '../src/moteur/ia.js';
import { validerCartes } from '../src/moteur/donnees.js';
import { boissonLoyer, ciblesBoisson, listeNoms, piochesPastis, CUL_SEC } from '../src/moteur/pastis.js';
import { GestionnaireSalons } from '../serveur/salons.js';
import { clientDirect, attendreQue, actionDuRobot } from './aide-reseau.js';

const pastis = (n = 3, options = {}) => creerPartie(n, { pastis: true, ...options });
const gorgees = (p) => p.etat.joueurs.map((j) => j.gorgees);
const boissons = (p) => p.extraireEvenements().filter((e) => e.type === 'boire');

describe('cartes du mode Pastis', () => {
  test('cinq cartes à boire par pioche, valides, qui remplacent des cartes ordinaires', () => {
    assert.deepEqual(validerCartes(cartes), []);
    assert.equal(cartes.pastis.chance.length, 5);
    assert.equal(cartes.pastis.communaute.length, 5);
    const pioches = piochesPastis(cartes);
    for (const pioche of ['chance', 'communaute']) {
      assert.equal(pioches[pioche].length, 16);
      assert.equal(new Set(pioches[pioche]).size, 16);
      assert.equal(pioches[pioche].filter((id) => id.startsWith('pastis-')).length, 5);
      // Les cartes « sortie des Baumettes » sont toujours là.
      assert.ok(pioches[pioche].some((id) => cartes[pioche].find((c) => c.id === id)?.effet.type === 'sortie_prison'));
    }
  });

  test('une carte Pastis qui remplace une carte inconnue est refusée', () => {
    const casse = structuredClone(cartes);
    casse.pastis.chance[0].remplace = 'chance-08'; // carte « sortie des Baumettes »
    casse.pastis.communaute[0].effet = { type: 'boire', cible: 'voisin', gorgees: 2 };
    assert.equal(validerCartes(casse).length, 2);
  });

  test('les pioches ne contiennent les cartes à boire qu\'en mode Pastis', () => {
    const classique = creerPartie(2);
    const avecPastis = pastis(2);
    const toutes = (p) => [...p.etat.pioches.chance, ...p.etat.pioches.communaute];
    assert.ok(toutes(classique).every((id) => !id.startsWith('pastis-')));
    assert.equal(toutes(avecPastis).filter((id) => id.startsWith('pastis-')).length, 10);
  });

  test('carte « tous » : tout le monde boit ; « suivant » et « précédent » visent les voisins', () => {
    const p = pastis(3);
    p.etat.joueurs[0].position = 4;
    piocherEnPremier(p, 'chance', 'pastis-chance-04');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] }); // case 7 : Chance
    assert.deepEqual(gorgees(p), [1, 1, 1]);
    const p2 = pastis(3);
    p2.etat.joueurs[0].position = 4;
    piocherEnPremier(p2, 'chance', 'pastis-chance-03');
    ok(p2, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.deepEqual(gorgees(p2), [0, 2, 0]);
    assert.deepEqual(ciblesBoisson(p2.etat, 0, 'precedent'), [2]);
    p2.etat.joueurs[2].faillite = true;
    assert.deepEqual(ciblesBoisson(p2.etat, 0, 'precedent'), [1]);
  });

  test('carte cul sec : compte pour 5 gorgées', () => {
    const p = pastis(2);
    p.etat.joueurs[0].position = 4;
    piocherEnPremier(p, 'chance', 'pastis-chance-02');
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].gorgees, CUL_SEC);
    assert.equal(p.etat.joueurs[0].culsSecs, 1);
    assert.ok(p.etat.journal.at(-1).includes('J1 boit cul sec (carte)'));
  });
});

describe('règles du mode Pastis', () => {
  test('loyer : gorgées selon le terrain, le quartier et les constructions', () => {
    const p = pastis(2);
    donner(p, 1, 1);
    assert.deepEqual(boissonLoyer(p.etat, plateau, 1), { gorgees: 1 });
    donner(p, 3, 1);
    assert.deepEqual(boissonLoyer(p.etat, plateau, 1), { gorgees: 2 });
    donner(p, 1, 1, 3);
    assert.deepEqual(boissonLoyer(p.etat, plateau, 1), { gorgees: 4 });
    donner(p, 1, 1, 5);
    assert.deepEqual(boissonLoyer(p.etat, plateau, 1), { culSec: true });
    donner(p, 5, 1);
    donner(p, 15, 1);
    assert.deepEqual(boissonLoyer(p.etat, plateau, 5), { gorgees: 2 });
    donner(p, 12, 1);
    donner(p, 28, 1);
    assert.deepEqual(boissonLoyer(p.etat, plateau, 12), { gorgees: 3 }); // Le Viaghji, le bar
    assert.deepEqual(boissonLoyer(p.etat, plateau, 28), { gorgees: 2 }); // Chez Jeannot
  });

  test('payer un loyer fait boire le locataire', () => {
    const p = pastis(2);
    donner(p, 6, 1, 2);
    donner(p, 8, 1, 2);
    donner(p, 9, 1, 2);
    ok(p, { type: 'lancer', joueur: 0, des: [2, 4] });
    assert.deepEqual(gorgees(p), [3, 0]);
    const [b] = boissons(p);
    assert.deepEqual({ joueurs: b.joueurs, gorgees: b.gorgees, culSec: b.culSec }, { joueurs: [0], gorgees: 3, culSec: false });
  });

  test('un double fait boire les autres ; trois doubles : cul sec et Baumettes', () => {
    const p = pastis(3);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 1] }); // Caisse de communauté : on neutralise la carte
    p.etat.attente = null;
    assert.deepEqual(gorgees(p).slice(1), [1, 1]);
    for (const j of p.etat.joueurs) j.gorgees = 0;
    p.etat.joueurs[0].position = 20;
    ok(p, { type: 'lancer', joueur: 0, des: [2, 2] });
    p.etat.attente = null;
    p.etat.joueurs[0].gorgees = 0;
    ok(p, { type: 'lancer', joueur: 0, des: [3, 3] });
    assert.equal(p.etat.joueurs[0].enPrison, true);
    assert.equal(p.etat.joueurs[0].gorgees, CUL_SEC, 'cul sec, sans les 3 gorgées de la prison en plus');
  });

  test('Baumettes : 3 gorgées à l\'arrivée, 1 par essai raté', () => {
    const p = pastis(2);
    p.etat.joueurs[0].position = 27;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] }); // case 30 : Allez aux Baumettes
    assert.equal(p.etat.joueurs[0].gorgees, 3);
    ok(p, { type: 'finirTour', joueur: 0 });
    ok(p, { type: 'lancer', joueur: 1, des: [1, 2] });
    ok(p, { type: 'refuserAchat', joueur: 1 });
    ok(p, { type: 'finirTour', joueur: 1 });
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    assert.equal(p.etat.joueurs[0].gorgees, 4);
  });

  test('taxes, Départ et Trottoir gratuit du Jarret', () => {
    const p = pastis(3);
    ok(p, { type: 'lancer', joueur: 0, des: [1, 3] }); // Station Total
    assert.deepEqual(gorgees(p), [2, 0, 0]);
    ok(p, { type: 'finirTour', joueur: 0 });
    p.etat.joueurs[1].position = 17;
    ok(p, { type: 'lancer', joueur: 1, des: [1, 2] }); // Trottoir gratuit
    assert.deepEqual(gorgees(p), [3, 1, 1]);
    ok(p, { type: 'finirTour', joueur: 1 });
    p.etat.joueurs[2].position = 36;
    ok(p, { type: 'lancer', joueur: 2, des: [1, 3] }); // pile sur Départ
    assert.deepEqual(gorgees(p), [4, 2, 1]);
  });

  test('compléter un quartier : les autres arrosent ça', () => {
    const p = pastis(3);
    donner(p, 1, 0);
    p.etat.joueurs[0].position = 1;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 1] }); // case 3 : Benza
    ok(p, { type: 'acheter', joueur: 0 });
    assert.deepEqual(gorgees(p), [0, 1 + 2, 1 + 2]); // double (1) puis quartier complété (2)
  });

  test('faillite : cul sec', () => {
    const p = pastis(3);
    donner(p, 39, 1, 5);
    p.etat.joueurs[0].argent = 10;
    p.etat.joueurs[0].position = 36;
    ok(p, { type: 'lancer', joueur: 0, des: [1, 2] });
    ok(p, { type: 'declarerFaillite', joueur: 0 });
    assert.equal(p.etat.joueurs[0].faillite, true);
    assert.equal(p.etat.joueurs[0].gorgees, 2 * CUL_SEC); // hôtel du Vieux-Port, puis faillite
  });

  test('hors mode Pastis, personne ne boit', () => {
    const p = creerPartie(3);
    donner(p, 6, 1);
    ok(p, { type: 'lancer', joueur: 0, des: [2, 4] });
    assert.deepEqual(gorgees(p), [0, 0, 0]);
    assert.equal(boissons(p).length, 0);
    assert.ok(!p.etat.journal.some((l) => l.includes('🥃')));
  });

  test('anciennes sauvegardes sans compteur de gorgées', () => {
    const p = pastis(2);
    for (const j of p.etat.joueurs) { delete j.gorgees; delete j.culsSecs; }
    const r = Partie.restaurer(donnees, p.serialiser());
    ok(r, { type: 'lancer', joueur: 0, des: [1, 3] });
    assert.equal(r.etat.joueurs[0].gorgees, 2);
  });

  test('noms au pluriel', () => {
    assert.equal(listeNoms(['Marius']), 'Marius');
    assert.equal(listeNoms(['Marius', 'Fanny', 'César']), 'Marius, Fanny et César');
  });
});

describe('parties complètes en mode Pastis', () => {
  test('entre ordinateurs, jusqu\'au bout, avec un plus gros buveur annoncé', () => {
    for (let graine = 1; graine <= 8; graine++) {
      const p = Partie.nouvelle(donnees, {
        joueurs: Array.from({ length: 2 + (graine % 5) }, (_, i) => ({ nom: `IA${i + 1}`, ia: true })),
        options: { pastis: true, partieRapide: graine % 2 === 0, toursMax: 40, parcGratuit: graine % 3 === 0 },
        graine
      });
      let actions = 0;
      while (!p.etat.terminee && actions++ < 30000) {
        const action = deciderAction(p);
        const r = p.executer(action);
        assert.ok(r.ok, `graine ${graine} : ${r.erreur}`);
        p.extraireEvenements();
      }
      assert.ok(p.etat.terminee, `graine ${graine}`);
      assert.ok(p.etat.joueurs.some((j) => j.gorgees > 0));
      assert.ok(p.etat.journal.some((l) => l.startsWith('🥃 Plus grosse descente')));
      // Le total de chaque joueur correspond aux boissons annoncées.
      for (const j of p.etat.joueurs) assert.ok(Number.isInteger(j.gorgees) && j.gorgees >= j.culsSecs * CUL_SEC);
    }
  });
});

describe('mode Pastis en ligne', () => {
  const gestionnaires = [];
  afterEach(() => { while (gestionnaires.length) gestionnaires.pop().fermer(); });

  test('l\'hôte active le mode, tous les écrans reçoivent les gorgées, la partie va au bout', async () => {
    const g = new GestionnaireSalons(donnees, { delaiIA: 0, facteurAnimation: 0, delaiDeconnexion: 10, delaiAbsence: 60_000 });
    gestionnaires.push(g);
    const a = g.creer({ nom: 'Marius' });
    const b = g.rejoindre(a.code, { nom: 'Fanny' });
    assert.throws(() => g.modifierOptions(a.code, b.jeton, { pastis: true }));
    g.modifierOptions(a.code, a.jeton, { pastis: true, partieRapide: true, toursMax: 12 });
    g.ajouterOrdinateur(a.code, a.jeton);
    const clients = [a, b].map((j) => clientDirect(g, a.code, j.jeton));
    assert.equal(clients[1].dernier().salon.options.pastis, true);
    g.demarrer(a.code, a.jeton);
    assert.ok(clients[1].dernier().etat.options.pastis);
    let actions = 0;
    while (!clients[0].dernier().etat.terminee) {
      let joue = false;
      for (const [k, j] of [a, b].entries()) {
        const action = actionDuRobot(clients[k].dernier());
        if (!action) continue;
        const r = g.agir(a.code, j.jeton, action);
        assert.ok(r.ok, `${JSON.stringify(action)} : ${r.erreur}`);
        actions++;
        joue = true;
      }
      if (!joue) await new Promise((r) => setTimeout(r, 2));
      assert.ok(actions < 20000, 'la partie ne se termine pas');
    }
    await attendreQue(() => clients[1].dernier().etat.terminee);
    const fin = clients[0].dernier().etat;
    assert.equal(fin.terminee, true);
    for (const c of clients) {
      assert.ok(c.messages.some((m) => m.evenements?.some((e) => e.type === 'boire')), 'des événements « boire » ont été diffusés');
    }
    assert.deepEqual(clients[1].dernier().etat.joueurs.map((j) => j.gorgees), fin.joueurs.map((j) => j.gorgees));
  });
});
