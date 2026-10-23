// Tests de la table de la vue 3D : places des joueurs, jetons de casino, verres et cartes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plateau } from './aide.js';
import {
  TABLE, CARTE, PILE_MAX, VERRES, OBJETS, placesTable, coinsTapis, jetons, verres, dispositionObjets, colonnesCartes, abscissesColonnes
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
  test('chacun face à un côté du plateau, le premier joueur devant, dans le sens du jeu', () => {
    for (let n = 1; n <= 6; n++) {
      const places = placesTable(n);
      assert.equal(places.length, n);
      assert.equal(places[0].angle, 0);
      assert.ok(places[0].centre.y > 0 && Math.abs(places[0].centre.x) < 1e-9, 'devant = vers la caméra');
      for (const p of places) assert.ok([0, 90, 180, 270].includes(p.angle), `${n} joueurs : face à un côté`);
      // Sens du jeu : devant, à gauche, au fond, à droite (sens des aiguilles d'une montre vu du dessus).
      for (let i = 1; i < n; i++) assert.ok(places[i].angle >= places[i - 1].angle, `${n} joueurs`);
    }
    assert.deepEqual(placesTable(2).map((p) => p.angle), [0, 180]);
    assert.deepEqual(placesTable(3).map((p) => p.angle), [0, 90, 270]);
    const attendu = [[0, 0.73], [-0.73, 0], [0, -0.73], [0.73, 0]];
    placesTable(4).forEach((p, i) => {
      assert.ok(Math.abs(p.centre.x - attendu[i][0]) < 1e-9 && Math.abs(p.centre.y - attendu[i][1]) < 1e-9, JSON.stringify(p.centre));
    });
  });

  test('à cinq et six, deux joueurs partagent un côté, et le jeu passe à gauche', () => {
    assert.deepEqual(placesTable(5).map((p) => p.angle), [0, 90, 180, 180, 270]);
    const six = placesTable(6);
    assert.deepEqual(six.map((p) => p.angle), [0, 90, 90, 180, 270, 270]);
    for (const p of six) assert.equal(p.largeur, p.angle % 180 ? TABLE.largeurPartagee : TABLE.largeur);
    // À gauche du plateau : le premier des deux est à droite de son voisin (vu de leur côté),
    // c'est-à-dire plus près de la place de devant, qui vient de jouer.
    const [, premier, second] = six;
    assert.ok(premier.decalage > 0 && second.decalage < 0);
    assert.ok(premier.centre.y > second.centre.y);
    // L'étiquette suit son tapis le long du côté.
    assert.ok(Math.abs(premier.ancre.y - premier.centre.y) < 1e-9 && premier.ancre.x < premier.centre.x);
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
});

describe('objets debout sur les tapis', () => {
  const bords = (positions, largeur) => positions.map((p) => [p.x - largeur / 2, p.x + largeur / 2]);

  test('piles de jetons à gauche, verres à droite, tout reste sur le tapis', () => {
    for (const largeur of [TABLE.largeur, TABLE.largeurPartagee]) {
      for (let piles = 0; piles <= 20; piles++) {
        for (const boisson of [null, { gorgees: 0, culsSecs: 0 }, { gorgees: 7, culsSecs: 1 }, { gorgees: 90, culsSecs: 9 }]) {
          const d = dispositionObjets(largeur, piles, boisson);
          const cas = `${largeur} / ${piles} piles / ${JSON.stringify(boisson)}`;
          assert.equal(d.piles.length, piles);
          const jetons = bords(d.piles, OBJETS.pile);
          const lesVerres = [...bords(d.petits, OBJETS.verre), ...bords(d.grands, OBJETS.grandVerre)];
          for (const [g, dr] of [...jetons, ...lesVerres]) assert.ok(g >= 0.02 && dr <= largeur - 0.02, cas);
          const finJetons = Math.max(0, ...jetons.map(([, dr]) => dr));
          const debutVerres = Math.min(largeur, ...lesVerres.map(([g]) => g));
          assert.ok(finJetons < debutVerres, cas);
          if (d.reste) assert.ok(d.reste.x > finJetons && d.reste.x < debutVerres, cas);
        }
      }
    }
  });

  test('chaque gorgée est un verre posé ou comptée à part ; les tapis étroits ont des rangées plus courtes', () => {
    for (const largeur of [TABLE.largeur, TABLE.largeurPartagee]) {
      const boisson = { gorgees: 53 + CUL_SEC * 6, culsSecs: 6 };
      const d = dispositionObjets(largeur, 1, boisson);
      assert.equal(d.petits.length + CUL_SEC * d.grands.length + (d.reste?.nombre ?? 0), boisson.gorgees);
    }
    const etroit = dispositionObjets(TABLE.largeurPartagee, 1, { gorgees: 40, culsSecs: 0 });
    const large = dispositionObjets(TABLE.largeur, 1, { gorgees: 40, culsSecs: 0 });
    assert.equal(large.petits.length, VERRES.petitsMax);
    assert.ok(etroit.petits.length < large.petits.length);
    assert.equal(dispositionObjets(TABLE.largeur, 3).petits.length, 0, 'pas de verres hors du mode Pastis');
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
