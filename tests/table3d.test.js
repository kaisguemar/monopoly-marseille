// Tests de la table de la vue 3D : places des joueurs, jetons de casino, verres et cartes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plateau } from './aide.js';
import {
  TABLE, CARTE, PILE_MAX, VERRES, placesTable, coinsTapis, etendueCarre, jetons, verres, colonnesCartes, abscissesColonnes
} from '../src/ui/table3d.js';
import { CUL_SEC } from '../src/moteur/pastis.js';

const PLATEAU = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];

// Deux polygones convexes se chevauchent-ils ? (théorème de l'axe séparateur)
function seChevauchent(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axe = { x: q.y - p.y, y: p.x - q.x };
      const projeter = (points) => points.map((pt) => pt.x * axe.x + pt.y * axe.y);
      const [pa, pb] = [projeter(a), projeter(b)];
      if (Math.max(...pa) < Math.min(...pb) + 1e-9 || Math.max(...pb) < Math.min(...pa) + 1e-9) return false;
    }
  }
  return true;
}

describe('places autour du plateau', () => {
  test('réparties régulièrement, le premier joueur devant', () => {
    for (let n = 1; n <= 6; n++) {
      const places = placesTable(n);
      assert.equal(places.length, n);
      places.forEach((p, i) => assert.ok(Math.abs(p.angle - (i * 360) / n) < 1e-9));
      assert.equal(places[0].angle, 0);
      assert.ok(places[0].centre.y > 0 && Math.abs(places[0].centre.x) < 1e-9, 'devant = vers la caméra');
    }
    // À deux, face à face ; à quatre, un par côté, dans le sens du jeu (devant, gauche, fond, droite).
    assert.deepEqual(placesTable(2).map((p) => p.angle), [0, 180]);
    const attendu = [[0, 0.73], [-0.73, 0], [0, -0.73], [0.73, 0]];
    placesTable(4).forEach((p, i) => {
      assert.ok(Math.abs(p.centre.x - attendu[i][0]) < 1e-9 && Math.abs(p.centre.y - attendu[i][1]) < 1e-9, JSON.stringify(p.centre));
    });
  });

  test('le joueur de l\'écran est devant, les autres suivent dans l\'ordre du jeu', () => {
    const places = placesTable(4, 2);
    assert.equal(places[2].angle, 0);
    assert.equal(places[3].angle, 90);
    assert.equal(places[0].angle, 180);
    assert.equal(places[1].angle, 270);
  });

  test('aucun tapis ne touche le plateau ni un autre tapis, tous tiennent sur le ponton', () => {
    for (let n = 1; n <= 6; n++) {
      const tapis = placesTable(n).map(coinsTapis);
      tapis.forEach((coins, i) => {
        assert.ok(!seChevauchent(coins, PLATEAU), `${n} joueurs : le tapis ${i} touche le plateau`);
        for (const c of coins) assert.ok(Math.hypot(c.x, c.y) < TABLE.rayon - 0.02, `${n} joueurs : le tapis ${i} déborde du ponton`);
        for (let k = i + 1; k < tapis.length; k++) assert.ok(!seChevauchent(coins, tapis[k]), `${n} joueurs : tapis ${i} et ${k}`);
      });
      for (const p of placesTable(n)) assert.ok(Math.hypot(p.ancre.x, p.ancre.y) < TABLE.rayon, 'étiquette sur le ponton');
    }
  });

  test('un tapis en biais s\'écarte davantage du coin du plateau', () => {
    assert.equal(etendueCarre(0), 0.5);
    assert.ok(Math.abs(etendueCarre(45) - Math.SQRT1_2) < 1e-12);
    const [, biais] = placesTable(3);
    assert.ok(biais.distance > placesTable(4)[0].distance);
  });
});

describe('jetons de casino', () => {
  const total = (piles) => piles.reduce((s, p) => s + p.valeur * p.nombre, 0);

  test('les piles valent exactement la somme, dix jetons au plus par pile', () => {
    for (let montant = 0; montant <= 20000; montant += 37) {
      const piles = jetons(montant);
      assert.equal(total(piles), montant, `${montant} €`);
      for (const p of piles) assert.ok(p.nombre >= 1 && p.nombre <= PILE_MAX);
    }
  });

  test('de l\'argent de départ en grosses et moyennes coupures', () => {
    assert.deepEqual(jetons(1500).map((p) => [p.valeur, p.nombre]), [[500, 2], [100, 5]]);
    assert.deepEqual(jetons(85).map((p) => [p.valeur, p.nombre]), [[20, 4], [5, 1]]);
    assert.deepEqual(jetons(0), []);
    assert.deepEqual(jetons(-50), []);
  });

  test('une immense fortune reste raisonnable à dessiner', () => {
    const piles = jetons(1_000_000);
    assert.ok(piles.length <= 8);
    assert.ok(total(piles) < 1_000_000);
  });
});

describe('verres du mode Pastis', () => {
  test('un verre à shooter par gorgée, un grand verre par cul sec', () => {
    assert.deepEqual(verres(0, 0), { petits: 0, grands: 0, reste: 0 });
    assert.deepEqual(verres(7, 0), { petits: 7, grands: 0, reste: 0 });
    assert.deepEqual(verres(3 + CUL_SEC * 2, 2), { petits: 3, grands: 2, reste: 0 });
  });

  test('au-delà de la place disponible, le reste est compté', () => {
    const v = verres(VERRES.petitsMax + 7 + CUL_SEC * (VERRES.grandsMax + 1), VERRES.grandsMax + 1);
    assert.equal(v.petits, VERRES.petitsMax);
    assert.equal(v.grands, VERRES.grandsMax);
    assert.equal(v.reste, 7 + CUL_SEC);
  });
});

describe('cartes de propriété', () => {
  test('une colonne par quartier, stations et compagnies à part, dans l\'ordre du plateau', () => {
    const colonnes = colonnesCartes([39, 5, 1, 12, 3, 37, 15], plateau);
    assert.deepEqual(colonnes.map((c) => c.cle), ['marron', 'gare', 'compagnie', 'bleu-fonce']);
    assert.deepEqual(colonnes[0].cases, [1, 3]);
    assert.deepEqual(colonnes[1].cases, [5, 15]);
    assert.deepEqual(colonnes.at(-1).cases, [37, 39]);
  });

  test('les colonnes restent sur le tapis, même nombreuses', () => {
    for (const largeur of [0.62, 0.72, 0.9]) {
      for (let n = 1; n <= 10; n++) {
        const xs = abscissesColonnes(n, largeur);
        assert.equal(xs.length, n);
        assert.ok(xs[0] >= 0.02 - 1e-9 && xs.at(-1) + CARTE.largeur <= largeur - 0.02 + 1e-9, `${n} colonnes sur ${largeur}`);
        for (let k = 1; k < n; k++) assert.ok(xs[k] - xs[k - 1] <= CARTE.largeur * 1.15 + 1e-9);
      }
    }
  });
});
