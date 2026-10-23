// Tests de la caméra de la vue 3D : limites, gestes, projection et horizon, cadrage de la vue de
// départ et de celle de chaque joueur, place de la scène à l'écran, mémorisation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECRAN, LIMITES, CADRAGE, CADRAGE_TELEPHONE, CAMERA_DEFAUT, HAUTEUR_PANNEAU, cadrage, cameraParDefaut, bornerCamera,
  orbiter, deplacer, zoomer, azimutDeFace, azimutVers, vueJoueur, interpoler, projeter, horizon, bordDroit, cadreScene,
  lireCamera, ecrireCamera
} from '../src/ui/camera3d.js';
import { placesTable, coinsTapis, tangente, direction, OBJETS } from '../src/ui/table3d.js';

const HAUTEUR = 0.84; // proportions de la vue 3D sur grand écran
const proche = (a, b, marge = 1e-9) => Math.abs(a - b) <= marge;
const COINS = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, y]) => ({ x, y }));

// Rangée de jetons d'un tapis (voir dispositionObjets) : ses deux bouts, sur la table.
function rangeeJetons(place) {
  const t = tangente(place.angle);
  const d = direction(place.angle);
  const v = OBJETS.rangeeJetons - place.profondeur / 2; // depuis le milieu du tapis, vers sa place
  return [-1, 1].map((sens) => {
    const u = sens * (place.largeur / 2 - 0.04);
    return { x: place.centre.x + u * t.x + v * d.x, y: place.centre.y + u * t.y + v * d.y };
  });
}

// Taille à l'écran (largeur, hauteur, en largeurs de scène) des noms de la rangée de devant :
// 1,2 % de la largeur du plateau (font-size: 1.2cqi dans plateau.css), vers le milieu de ses cases.
function taillesNomsDevant(c) {
  const police = 0.012;
  const largeur = (projeter(c, { x: 0.05, y: 0.44 }).x - projeter(c, { x: -0.05, y: 0.44 }).x) * 10 * police;
  const hauteur = (projeter(c, { x: 0, y: 0.465 }).y - projeter(c, { x: 0, y: 0.415 }).y) * 20 * police;
  return { largeur, hauteur };
}

// Panneau des actions tel que le dessine vue3d.css : en haut à droite (300 px de large, ici au tour
// d'un ordinateur), ou en bas sur téléphone (38 % de la hauteur au plus).
const panneauOrdinateur = (largeur) => ({ gauche: largeur - 316, haut: 16, droite: largeur - 16, bas: 210 });
const panneauTelephone = (largeur, hauteur) => ({ gauche: 8, haut: hauteur * 0.62 - 8, droite: largeur - 8, bas: hauteur - 8 });

// Position à l'écran (px) d'un point de la table, pour une scène placée par cadreScene.
const aLEcran = (c, cadre, p) => {
  const e = projeter(c, p);
  return { x: cadre.gauche + e.x * cadre.largeur, y: cadre.haut + e.y * cadre.largeur };
};

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

  test('cadrage propre au téléphone, avec la même mise en page (panneau des actions en bas)', () => {
    assert.equal(cadrage(390), CADRAGE_TELEPHONE);
    assert.equal(cadrage(700), CADRAGE_TELEPHONE);
    assert.equal(cadrage(701), CADRAGE);
    assert.deepEqual(cameraParDefaut(1300), { ...CAMERA_DEFAUT });
    assert.ok(cameraParDefaut(390).zoom < cameraParDefaut(1300).zoom, 'sur téléphone, le plateau reste un peu plus loin');
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
    assert.deepEqual([c.decalageX, c.azimut, c.zoom], [0.1, 0, CAMERA_DEFAUT.zoom]);
    assert.ok(proche(c.decalageY, CAMERA_DEFAUT.decalageY - 0.05));
  });

  test('zoomer sur le centre du plateau ne le déplace pas', () => {
    const c = zoomer(CAMERA_DEFAUT, 1.5);
    assert.ok(Math.abs(c.zoom - CAMERA_DEFAUT.zoom * 1.5) < 1e-12);
    assert.deepEqual([c.decalageX, c.decalageY], [CAMERA_DEFAUT.decalageX, CAMERA_DEFAUT.decalageY]);
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

  test('vue de départ : le plateau entier, et devant lui le tapis du joueur avec ses jetons', () => {
    for (const { x, y } of COINS.map((p) => projeter(CAMERA_DEFAUT, p, HAUTEUR))) {
      assert.ok(x > 0.02 && x < 0.98 && y > 0.1 && y < HAUTEUR - 0.02, JSON.stringify({ x, y }));
    }
    for (const p of rangeeJetons(placesTable(4)[0])) {
      const e = projeter(CAMERA_DEFAUT, p, HAUTEUR);
      assert.ok(e.x > 0 && e.x < 1 && e.y < HAUTEUR - 0.01, JSON.stringify(e));
    }
  });

  test('vue de départ : les noms des rues de la rangée de devant se lisent', () => {
    // Sur un écran de 1920 × 1080, la scène mesure 1080 / 0,84 px de large.
    const px = 1080 / HAUTEUR;
    const { largeur, hauteur } = taillesNomsDevant(CAMERA_DEFAUT);
    assert.ok(largeur * px >= 12.5, `${(largeur * px).toFixed(1)} px de large`);
    assert.ok(hauteur * px >= 8, `${(hauteur * px).toFixed(1)} px de haut (texte vu de biais)`);
  });

  test('la Corniche, hors champ dans la vue de départ, revient quand on dézoome', () => {
    assert.ok(horizon(CAMERA_DEFAUT, HAUTEUR).y < 0);
    const recul = zoomer(zoomer(CAMERA_DEFAUT, 1 / 1.3), 1 / 1.3); // deux fois « − »
    const h = horizon(recul, HAUTEUR);
    assert.ok(h.y > 0.03, 'la Corniche apparaît en haut de l\'écran');
    assert.ok(h.y < Math.min(...COINS.map((p) => projeter(recul, p, HAUTEUR).y)), 'la côte est derrière le plateau');
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
  test('la table tourne par le plus court chemin', () => {
    assert.equal(azimutVers(0, 90), -90);
    assert.equal(azimutVers(-90, 180), -180);
    assert.equal(azimutVers(-270, 0), -360, 'on continue dans le même sens plutôt que de revenir en arrière');
    assert.equal(azimutVers(350, 0), 360);
  });

  test('vue de chaque joueur : sa place devant, le plateau entier au milieu, ses cartes et ses jetons', () => {
    for (let n = 1; n <= 6; n++) {
      for (const place of placesTable(n)) {
        const c = vueJoueur(place, { ...CAMERA_DEFAUT, azimut: 37 });
        const cas = `${n} joueurs, place ${place.joueur}`;
        assert.equal((((c.azimut + place.angle) % 360) + 360) % 360, 0, `${cas} : sa place devant soi, plateau bien en face`);
        assert.ok(proche(projeter(c, { x: 0, y: 0 }, HAUTEUR).x, 0.5), `${cas} : le plateau au milieu, même sur un côté partagé`);
        for (const p of COINS) {
          const e = projeter(c, p, HAUTEUR);
          assert.ok(e.x > 0.02 && e.x < 0.98 && e.y > 0.1 && e.y < HAUTEUR - 0.02, `${cas} : coin ${JSON.stringify(p)} → ${JSON.stringify(e)}`);
        }
        // Le tapis dans la largeur de la scène, jusqu'à sa rangée de jetons.
        for (const p of [...coinsTapis(place), ...rangeeJetons(place)]) {
          const e = projeter(c, p, HAUTEUR);
          assert.ok(e.x > 0.005 && e.x < 0.995, `${cas} : tapis ${JSON.stringify(p)} → ${JSON.stringify(e)}`);
        }
        for (const p of rangeeJetons(place)) {
          assert.ok(projeter(c, p, HAUTEUR).y < HAUTEUR - 0.01, `${cas} : jetons à l'écran`);
        }
      }
    }
  });

  test('même cadrage que la vue de départ, sur grand écran comme sur téléphone', () => {
    assert.deepEqual(vueJoueur(placesTable(4)[0]), { ...CAMERA_DEFAUT });
    const c = vueJoueur(placesTable(4)[1], CAMERA_DEFAUT, 390);
    assert.deepEqual([c.inclinaison, c.zoom, c.decalageY, c.decalageX], [CADRAGE_TELEPHONE.inclinaison, CADRAGE_TELEPHONE.zoom, CADRAGE_TELEPHONE.decalageY, 0]);
  });
});

describe('place de la scène à l\'écran', () => {
  const placer = (largeur, hauteur, panneau = panneauOrdinateur(largeur)) =>
    cadreScene({ largeur, hauteur }, panneau, cameraParDefaut(largeur));

  test('sans panneau, la scène est au milieu de l\'écran, aussi grande que possible', () => {
    const cadre = cadreScene({ largeur: 1200, hauteur: 600 });
    assert.ok(proche(cadre.largeur, 600 / HAUTEUR));
    assert.ok(proche(cadre.gauche, (1200 - cadre.largeur) / 2));
    assert.ok(proche(cadre.haut, 0));
  });

  test('sur un écran large (télévision, ordinateur), le plateau est au milieu de l\'écran malgré le panneau des actions', () => {
    for (const [largeur, hauteur] of [[1920, 1080], [2560, 1440], [1536, 864], [1366, 768], [1680, 1050]]) {
      const cadre = placer(largeur, hauteur);
      const centre = aLEcran(CAMERA_DEFAUT, cadre, { x: 0, y: 0 });
      assert.ok(proche(centre.x, largeur / 2, 0.5), `${largeur} × ${hauteur} : centre du plateau à ${centre.x.toFixed(1)} px`);
    }
  });

  test('le plateau ne passe pas sous le panneau : la scène s\'en écarte juste ce qu\'il faut', () => {
    for (const [largeur, hauteur] of [[1920, 1080], [1440, 900], [1280, 800], [1280, 720], [1024, 768]]) {
      const panneau = panneauOrdinateur(largeur);
      const cadre = placer(largeur, hauteur, panneau);
      const bas = (panneau.haut + HAUTEUR_PANNEAU - cadre.haut) / cadre.largeur;
      const droite = cadre.gauche + bordDroit(CAMERA_DEFAUT, bas) * cadre.largeur;
      const cas = `${largeur} × ${hauteur}`;
      assert.ok(droite <= panneau.gauche - 12 + 1e-6, `${cas} : bord du plateau à ${droite.toFixed(1)} px`);
      const centre = aLEcran(CAMERA_DEFAUT, cadre, { x: 0, y: 0 }).x;
      assert.ok(proche(centre, largeur / 2, 0.5) || proche(droite, panneau.gauche - 12, 0.5), `${cas} : écarté de trop`);
      assert.ok(largeur / 2 - centre < largeur * 0.09, `${cas} : le plateau reste près du milieu`);
    }
  });

  test('sur téléphone, la scène occupe la largeur, au-dessus du panneau ; la Corniche reste visible', () => {
    for (const [largeur, hauteur] of [[390, 844], [360, 740], [412, 915]]) {
      const cadre = placer(largeur, hauteur, panneauTelephone(largeur, hauteur));
      const c = cameraParDefaut(largeur);
      const cas = `${largeur} × ${hauteur}`;
      assert.ok(proche(cadre.largeur, largeur) && proche(cadre.gauche, 0), cas);
      for (const p of COINS) {
        const e = aLEcran(c, cadre, p);
        assert.ok(e.x > 0 && e.x < largeur, `${cas} : le plateau tient dans la largeur`);
      }
      for (const p of rangeeJetons(placesTable(4)[0])) {
        assert.ok(aLEcran(c, cadre, p).y < hauteur * 0.6, `${cas} : les jetons au-dessus du panneau`);
      }
      assert.ok(cadre.haut + horizon(c).y * cadre.largeur > 40, `${cas} : la Corniche au-dessus de la table`);
    }
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
