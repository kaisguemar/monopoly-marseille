import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateau, cartes } from './aide.js';
import { validerPlateau, validerCartes } from '../src/moteur/donnees.js';

const compter = (type) => plateau.cases.filter((c) => c.type === type).length;

test('le plateau est valide et contient 40 cases', () => {
  assert.deepEqual(validerPlateau(plateau), []);
  assert.equal(plateau.cases.length, 40);
});

test('le plateau respecte la composition du Monopoly français', () => {
  assert.equal(compter('propriete'), 22);
  assert.equal(compter('gare'), 4);
  assert.equal(compter('compagnie'), 2);
  assert.equal(compter('taxe'), 2);
  assert.equal(compter('chance'), 3);
  assert.equal(compter('communaute'), 3);
  assert.equal(Object.keys(plateau.groupes).length, 8);
  const types = (indices) => indices.map((i) => plateau.cases[i].type);
  assert.deepEqual(types([0, 10, 20, 30]), ['depart', 'prison', 'parc', 'allez_prison']);
  assert.deepEqual(types([5, 15, 25, 35]), ['gare', 'gare', 'gare', 'gare']);
  assert.deepEqual(types([12, 28]), ['compagnie', 'compagnie']);
  assert.deepEqual(types([7, 22, 36]), ['chance', 'chance', 'chance']);
  assert.deepEqual(types([2, 17, 33]), ['communaute', 'communaute', 'communaute']);
  assert.equal(plateau.cases[4].montant, 200);
  assert.equal(plateau.cases[38].montant, 100);
});

test('les valeurs reprennent celles du Monopoly français classique', () => {
  const attendus = {
    1: [60, [2, 10, 30, 90, 160, 250], 50], 3: [60, [4, 20, 60, 180, 320, 450], 50],
    9: [120, [8, 40, 100, 300, 450, 600], 50], 14: [160, [12, 60, 180, 500, 700, 900], 100],
    19: [200, [16, 80, 220, 600, 800, 1000], 100], 24: [240, [20, 100, 300, 750, 925, 1100], 150],
    29: [280, [24, 120, 360, 850, 1025, 1200], 150], 34: [320, [28, 150, 450, 1000, 1200, 1400], 200],
    37: [350, [35, 175, 500, 1100, 1300, 1500], 200], 39: [400, [50, 200, 600, 1400, 1700, 2000], 200]
  };
  for (const [i, [prix, loyers, maison]] of Object.entries(attendus)) {
    const c = plateau.cases[i];
    assert.equal(c.prix, prix, c.nom);
    assert.deepEqual(c.loyers, loyers, c.nom);
    assert.equal(c.prixMaison, maison, c.nom);
    assert.equal(c.hypotheque, prix / 2, c.nom);
  }
});

test('les groupes vont du moins cher au plus cher et sont contigus', () => {
  const proprietes = plateau.cases.filter((c) => c.type === 'propriete');
  for (let i = 1; i < proprietes.length; i++) assert.ok(proprietes[i].prix >= proprietes[i - 1].prix);
  const ordre = [...new Set(proprietes.map((c) => c.groupe))];
  assert.equal(ordre.length, 8, 'chaque groupe forme un bloc continu');
  assert.equal(plateau.cases[39].nom, 'Vieux-Port');
  assert.equal(plateau.cases[37].nom, 'Corniche Kennedy');
});

test('les noms de cases sont uniques (hors Chance / Caisse)', () => {
  const noms = plateau.cases.filter((c) => !['chance', 'communaute'].includes(c.type)).map((c) => c.nom);
  assert.equal(new Set(noms).size, noms.length);
});

test('les cartes sont valides : 16 Chance + 16 Caisse de communauté', () => {
  assert.deepEqual(validerCartes(cartes), []);
  assert.equal(cartes.chance.length, 16);
  assert.equal(cartes.communaute.length, 16);
});

test('chaque pioche contient une carte « sortie de prison » et une carte « prison »', () => {
  for (const pioche of ['chance', 'communaute']) {
    const types = cartes[pioche].map((c) => c.effet.type);
    assert.equal(types.filter((t) => t === 'sortie_prison').length, 1);
    assert.equal(types.filter((t) => t === 'prison').length, 1);
  }
});

test('la validation détecte les données incorrectes', () => {
  assert.ok(validerPlateau({ cases: [] }).length > 0);
  const casse = structuredClone(cartes);
  casse.chance[0].effet = { type: 'inconnu' };
  casse.communaute.pop();
  assert.equal(validerCartes(casse).length, 2);
});
