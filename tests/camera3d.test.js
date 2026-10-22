// Tests de la caméra de la vue 3D : limites, gestes, projection et horizon, mémorisation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECRAN, LIMITES, CAMERA_DEFAUT, cameraParDefaut, bornerCamera, orbiter, deplacer, zoomer,
  azimutDeFace, azimutVers, vueJoueur, interpoler, projeter, horizon, lireCamera, ecrireCamera
} from '../src/ui/camera3d.js';
import { placesTable, coinsTapis } from '../src/ui/table3d.js';

const HAUTEUR = 0.84; // proportions de la vue 3D sur grand écran
const proche = (a, b, marge = 1e-9) => Math.abs(a - b) <= marge;

describe('limites de la caméra', () => {
  test('inclinaison et zoom restent dans leurs bornes', () => {
    const c = bornerCamera({ azimut: 400, inclinaison: 95, zoom: 9, decalageX: 0, decalageY: 0 });
    assert.equal(c.inclinaison, LIMITES.inclinaison[1]);
    assert.equal(c.zoom, LIMITES.zoom[1]);
    assert.equal(c.azimut, 400, "l'azimut n'est pas borné : on peut faire plusieurs tours");
    assert.equal(bornerCamera({ inclinaison: -10, zoom: 0.01 }).inclinaison, LIMITES.inclinaison[0]);
    assert.equal(bornerCamera({ inclinaison: -10, zoom: 0.01 }).zoom, LIMITES.zoom[0]);
  });

  test('le décalage permis grandit avec le zoom', () => {
    assert.equal(bornerCamera({ zoom: 1, decalageX: 5 }).decalageX, LIMITES.decalage);
    assert.equal(bornerCamera({ zoom: 2, decalageX: -5 }).decalageX, -2 * LIMITES.decalage);
  });

  test('valeurs manquantes ou invalides : valeurs par défaut', () => {
    assert.deepEqual(bornerCamera({ azimut: 'nord', inclinaison: NaN, zoom: null }), { ...CAMERA_DEFAUT });
    assert.deepEqual(bornerCamera(), { ...CAMERA_DEFAUT });
  });

  test('vue de départ moins inclinée sur téléphone', () => {
    assert.ok(cameraParDefaut(390).inclinaison < cameraParDefaut(1300).inclinaison);
  });
});

describe('gestes', () => {
  test('glisser vers la droite tourne le plateau, vers le haut le couche', () => {
    const c = orbiter(CAMERA_DEFAUT, 0.25, -0.1);
    assert.equal(c.azimut, -45, 'un quart de largeur = 45°');
    assert.ok(c.inclinaison > CAMERA_DEFAUT.inclinaison);
    assert.equal(orbiter(CAMERA_DEFAUT, 0, 5).inclinaison, LIMITES.inclinaison[0]);
  });

  test('déplacer fait glisser le plateau sans le tourner', () => {
    const c = deplacer(CAMERA_DEFAUT, 0.1, -0.05);
    assert.deepEqual([c.decalageX, c.decalageY, c.azimut, c.zoom], [0.1, -0.05, 0, CAMERA_DEFAUT.zoom]);
  });

  test('zoomer sur le centre du plateau ne le déplace pas', () => {
    const c = zoomer(CAMERA_DEFAUT, 1.5);
    assert.ok(Math.abs(c.zoom - CAMERA_DEFAUT.zoom * 1.5) < 1e-12);
    assert.deepEqual([c.decalageX, c.decalageY], [0, 0]);
  });

  test('zoomer garde (presque) immobile le point visé, malgré la perspective', () => {
    for (const point of [{ x: 0.3, y: 0.25 }, { x: -0.4, y: -0.3 }, { x: 0.45, y: -0.45 }]) {
      const avant = projeter(CAMERA_DEFAUT, point, HAUTEUR);
      const centre = projeter(CAMERA_DEFAUT, { x: 0, y: 0 }, HAUTEUR);
      const c = zoomer(CAMERA_DEFAUT, 1.6, { x: avant.x - centre.x, y: avant.y - centre.y });
      const apres = projeter(c, point, HAUTEUR);
      assert.ok(Math.hypot(apres.x - avant.x, apres.y - avant.y) < 0.06, JSON.stringify({ point, avant, apres }));
    }
  });

  test('revenir de face par le plus court chemin', () => {
    assert.equal(azimutDeFace(350), 360);
    assert.equal(azimutDeFace(170), 0);
    assert.equal(azimutDeFace(-200), -360);
  });

  test('interpolation entre deux caméras', () => {
    const b = { azimut: 90, inclinaison: 30, zoom: 2, decalageX: 0.2, decalageY: -0.2 };
    assert.deepEqual(interpoler(CAMERA_DEFAUT, b, 0), { ...CAMERA_DEFAUT });
    assert.deepEqual(interpoler(CAMERA_DEFAUT, b, 1), b);
    assert.equal(interpoler(CAMERA_DEFAUT, b, 0.5).azimut, 45);
  });
});

describe('projection et horizon', () => {
  test('vue de face : le plateau est centré et symétrique', () => {
    const gauche = projeter(CAMERA_DEFAUT, { x: -0.5, y: 0.5 }, HAUTEUR);
    const droite = projeter(CAMERA_DEFAUT, { x: 0.5, y: 0.5 }, HAUTEUR);
    assert.ok(proche(gauche.x + droite.x, 1));
    assert.ok(proche(gauche.y, droite.y));
    // Le bord proche paraît plus large que le bord lointain (perspective).
    const loinG = projeter(CAMERA_DEFAUT, { x: -0.5, y: -0.5 }, HAUTEUR);
    const loinD = projeter(CAMERA_DEFAUT, { x: 0.5, y: -0.5 }, HAUTEUR);
    assert.ok(droite.x - gauche.x > loinD.x - loinG.x);
    assert.ok(loinG.y < gauche.y);
  });

  test('le plateau entier tient dans la vue de départ, sous la Corniche', () => {
    const coins = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, y]) => projeter(CAMERA_DEFAUT, { x, y }, HAUTEUR));
    for (const { x, y } of coins) {
      assert.ok(x > 0 && x < 1 && y > 0 && y < HAUTEUR, JSON.stringify({ x, y }));
    }
    const h = horizon(CAMERA_DEFAUT, HAUTEUR);
    const hautPanorama = h.y - ECRAN.panorama;
    assert.ok(hautPanorama > -0.03, 'le panorama de la Corniche est visible en entier');
    assert.ok(h.y < Math.min(...coins.map((c) => c.y)), 'la côte est derrière le plateau');
  });

  test("l'horizon descend quand la vue devient rasante et monte quand on zoome", () => {
    const base = horizon(CAMERA_DEFAUT, HAUTEUR).y;
    assert.ok(horizon({ ...CAMERA_DEFAUT, inclinaison: 68 }, HAUTEUR).y > base);
    assert.ok(horizon({ ...CAMERA_DEFAUT, inclinaison: 20 }, HAUTEUR).y < base);
    assert.ok(horizon({ ...CAMERA_DEFAUT, zoom: 2 }, HAUTEUR).y < base);
  });

  test('tourner le plateau fait défiler la Corniche, sans changer la hauteur de l\'horizon', () => {
    const face = horizon(CAMERA_DEFAUT, HAUTEUR);
    const quart = horizon({ ...CAMERA_DEFAUT, azimut: 90 }, HAUTEUR);
    const tour = horizon({ ...CAMERA_DEFAUT, azimut: 360 }, HAUTEUR);
    assert.ok(proche(quart.y, face.y, 1e-9));
    assert.ok(quart.decalage > face.decalage);
    assert.ok(proche(tour.decalage - face.decalage, ECRAN.panorama * ECRAN.rapportPanorama), 'un tour = toute la largeur du panorama');
  });
});

describe('caméra qui suit les joueurs', () => {
  const COINS = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, y]) => ({ x, y }));
  const largeurBord = (c, y) => projeter(c, { x: 0.5, y }, HAUTEUR).x - projeter(c, { x: -0.5, y }, HAUTEUR).x;

  test('la table tourne par le plus court chemin', () => {
    assert.equal(azimutVers(0, 90), -90);
    assert.equal(azimutVers(-90, 180), -180);
    assert.equal(azimutVers(-270, 0), -360, 'on continue dans le même sens plutôt que de revenir en arrière');
    assert.equal(azimutVers(350, 0), 360);
  });

  test('vue de chaque joueur : sa place devant, le plateau bien en face, son tapis entier, la Corniche au loin', () => {
    for (let n = 1; n <= 6; n++) {
      for (const place of placesTable(n)) {
        const c = vueJoueur(place, { ...CAMERA_DEFAUT, azimut: 37 });
        const cas = `${n} joueurs, place ${place.joueur}`;
        assert.equal((((c.azimut + place.angle) % 360) + 360) % 360, 0, `${cas} : sa place devant soi, plateau bien en face`);
        for (const p of [...COINS, ...coinsTapis(place)]) {
          const e = projeter(c, p, HAUTEUR);
          assert.ok(e.x > 0.02 && e.x < 0.98 && e.y > 0.02 && e.y < HAUTEUR - 0.02, `${cas} : ${JSON.stringify(p)} → ${JSON.stringify(e)}`);
        }
        assert.ok(horizon(c, HAUTEUR).y > 0.09, `${cas} : la Corniche reste visible`);
      }
    }
  });

  test('le plateau y paraît plus grand que dans la vue de départ', () => {
    const c = vueJoueur(placesTable(4)[0]);
    assert.ok(largeurBord(c, -0.5) > largeurBord(CAMERA_DEFAUT, -0.5) * 1.15, 'bord lointain');
    assert.ok(largeurBord(c, 0.5) > largeurBord(CAMERA_DEFAUT, 0.5) * 1.15, 'bord proche');
  });
});

describe('mémorisation', () => {
  test('aller-retour, azimut ramené entre -180° et 180°', () => {
    const c = { azimut: 405.25, inclinaison: 61.04, zoom: 1.7, decalageX: 0.12345, decalageY: -0.2 };
    const relue = lireCamera(ecrireCamera(c));
    assert.equal(relue.azimut, 45.3);
    assert.equal(relue.inclinaison, 61);
    assert.equal(relue.zoom, 1.7);
    assert.equal(relue.decalageX, 0.123);
  });

  test('caméra absente, illisible ou hors limites', () => {
    assert.equal(lireCamera(null), null);
    assert.equal(lireCamera('{pas du json'), null);
    assert.equal(lireCamera('42'), null);
    assert.equal(lireCamera(JSON.stringify({ zoom: 50, inclinaison: 3 })).zoom, LIMITES.zoom[1]);
  });
});
