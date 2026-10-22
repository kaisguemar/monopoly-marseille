// Tests des images générées (outils/generer-images.mjs) : à jour, bien formées, aux bonnes proportions.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { genererImages, MAISON, HOTEL, PANORAMA } from '../outils/generer-images.mjs';

const images = genererImages();
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const viewBox = (svg) => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);

// Vérification simple de la structure XML : chaque balise ouverte est refermée dans l'ordre.
function balisesEquilibrees(svg) {
  const pile = [];
  for (const [, fermante, nom, autoFermante] of svg.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) {
    if (autoFermante) continue;
    if (!fermante) pile.push(nom);
    else if (pile.pop() !== nom) return false;
  }
  return pile.length === 0;
}

describe('images de la vue 3D', () => {
  test('les fichiers versionnés sont à jour (node outils/generer-images.mjs)', () => {
    for (const [chemin, contenu] of Object.entries(images)) assert.equal(lire(chemin), contenu, chemin);
  });

  test('chaque image est un SVG bien formé', () => {
    for (const [chemin, contenu] of Object.entries(images)) {
      assert.match(contenu, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/, chemin);
      assert.ok(balisesEquilibrees(contenu), `${chemin} : balises mal fermées`);
      assert.doesNotMatch(contenu, /NaN|undefined|Infinity/, chemin);
    }
  });

  test('les faces ont les proportions des bâtiments en 3D', () => {
    const { longueur: l, profondeur: p, hauteur: h, faitage } = MAISON;
    assert.deepEqual(viewBox(images['assets/batiments/maison-facade.svg']), [l, h]);
    assert.deepEqual(viewBox(images['assets/batiments/maison-arriere.svg']), [l, h]);
    // Pignons et côtés sont couchés : l'axe horizontal de l'image suit la hauteur du mur.
    assert.deepEqual(viewBox(images['assets/batiments/maison-pignon.svg']), [faitage, p]);
    assert.deepEqual(viewBox(images['assets/batiments/hotel-facade.svg']), [HOTEL.longueur, HOTEL.hauteur]);
    assert.deepEqual(viewBox(images['assets/batiments/hotel-cote.svg']), [HOTEL.hauteur, HOTEL.profondeur]);
    assert.deepEqual(viewBox(images['assets/batiments/hotel-toit.svg']), [HOTEL.longueur, HOTEL.profondeur]);
    // Le toit déborde des murs ; pente de 35° comme dans vue3d.css.
    const [lt, rampant] = viewBox(images['assets/batiments/maison-toit.svg']);
    assert.equal(lt, l + 2 * MAISON.debord);
    assert.equal(rampant, Math.round(p / 2 / Math.cos((35 * Math.PI) / 180) + MAISON.debord));
  });

  test('les proportions de vue3d.css correspondent à celles des images', () => {
    const css = lire('src/styles/vue3d.css');
    assert.match(css, new RegExp(`--l: ${l100(MAISON.longueur)}em; --p: ${l100(MAISON.profondeur)}em; --h: ${l100(MAISON.hauteur)}em; --H: ${l100(MAISON.faitage)}em; --pente: ${MAISON.pente}deg`));
    assert.match(css, new RegExp(`\\.hotel \\{ --l: ${l100(HOTEL.longueur)}em; --p: ${l100(HOTEL.profondeur)}em; --h: ${l100(HOTEL.hauteur)}em`));
    const pignon = ((MAISON.hauteur / MAISON.faitage) * 100).toFixed(1);
    assert.match(css, new RegExp(`polygon\\(0 0, ${pignon}% 0, 100% 50%, ${pignon}% 100%, 0 100%\\)`));
  });

  test('les murs restent transparents pour montrer la couleur du propriétaire', () => {
    // Aucune face de mur n'a de fond opaque couvrant toute l'image.
    for (const nom of ['maison-facade', 'maison-arriere', 'maison-pignon', 'hotel-facade', 'hotel-cote']) {
      const svg = images[`assets/batiments/${nom}.svg`];
      const [l, h] = viewBox(svg);
      const fondsPleins = [...svg.matchAll(/<rect x="0" y="0" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{3,6})"/g)]
        .filter(([, w, hh]) => Number(w) >= Math.min(l, h) && Number(hh) >= Math.min(l, h));
      assert.equal(fondsPleins.length, 0, nom);
    }
  });

  test('le panorama de la Corniche fait le tour de l\'horizon', () => {
    const svg = images['assets/decor/corniche.svg'];
    assert.deepEqual(viewBox(svg), [PANORAMA.largeur, PANORAMA.hauteur]);
    // Son bas est la mer, de la couleur du large autour du plateau.
    assert.match(svg, /stop-color="#1b5f92"/);
    assert.match(lire('src/styles/vue3d.css'), /background: #1b5f92;/);
  });
});

function l100(x) {
  return String(x / 100).replace(/\.?0+$/, '');
}
