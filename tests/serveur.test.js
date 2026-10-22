// Tests du serveur HTTP réel : fichiers statiques, API, flux SSE, reconnexion, parties complètes.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creerServeur } from '../serveur/serveur.js';
import { attendreQue, clientFlux, poster, actionDuRobot } from './aide-reseau.js';

const REGLAGES = { delaiIA: 0, facteurAnimation: 0, delaiDeconnexion: 30, delaiAbsence: 60_000 };

async function demarrerServeur(options = {}) {
  const instance = creerServeur({ ...REGLAGES, ...options });
  const port = await instance.ecouter(0, '127.0.0.1');
  return { ...instance, base: `http://127.0.0.1:${port}` };
}

describe('fichiers statiques', () => {
  let srv;
  before(async () => { srv = await demarrerServeur(); });
  after(() => srv.fermer());

  test('sert le jeu', async () => {
    const page = await fetch(`${srv.base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /Monopoly Marseille/);
    const js = await fetch(`${srv.base}/src/main.js`);
    assert.match(js.headers.get('content-type'), /javascript/);
    const plateau = await (await fetch(`${srv.base}/data/plateau.json`)).json();
    assert.equal(plateau.cases.length, 40);
  });

  test('ne sert ni le serveur, ni ses sauvegardes, ni les fichiers cachés', async () => {
    for (const chemin of ['/serveur/salons.js', '/serveur/salons.json', '/package.json', '/.git/config', '/src/../serveur/serveur.js', '/%2e%2e/package.json', '/data/.hidden']) {
      const r = await fetch(`${srv.base}${chemin}`);
      assert.equal(r.status, 404, chemin);
    }
  });

  test('API : santé, routes inconnues, JSON invalide', async () => {
    assert.deepEqual(await (await fetch(`${srv.base}/api/sante`)).json(), { ok: true });
    assert.equal((await fetch(`${srv.base}/api/inconnu`)).status, 404);
    assert.equal((await fetch(`${srv.base}/api/salons/ABCDE`)).status, 404);
    const r = await fetch(`${srv.base}/api/salons`, { method: 'POST', body: '{pas du json' });
    assert.equal(r.status, 400);
    assert.equal((await fetch(`${srv.base}/api/salons`, { method: 'PUT' })).status, 405);
    const gros = await fetch(`${srv.base}/api/salons`, { method: 'POST', body: JSON.stringify({ nom: 'x'.repeat(70000) }) }).catch(() => ({ status: 413 }));
    assert.equal(gros.status, 413);
  });
});

describe('API du mode en ligne', () => {
  let srv;
  before(async () => { srv = await demarrerServeur(); });
  after(() => srv.fermer());

  test('créer, rejoindre, régler, démarrer et jouer via HTTP et SSE', async () => {
    const a = await poster(srv.base, '/api/salons', { nom: 'Marius', pion: 'savon' });
    assert.equal(a.statut, 201);
    const { code } = a.corps;
    const b = await poster(srv.base, `/api/salons/${code}/rejoindre`, { nom: 'Fanny' });
    assert.equal(b.statut, 200);
    const fa = await clientFlux(srv.base, code, a.corps.jeton);
    const fb = await clientFlux(srv.base, code, b.corps.jeton);
    await attendreQue(() => fa.dernier()?.salon.places.length === 2 && fb.dernier(), 2000, 'messages initiaux');
    assert.equal(fb.messages[0].changement, 'initial');
    assert.equal(fb.messages[0].moi, 1);

    assert.equal((await poster(srv.base, `/api/salons/${code}/options`, { jeton: b.corps.jeton, options: { parcGratuit: true } })).statut, 403);
    assert.equal((await poster(srv.base, `/api/salons/${code}/options`, { jeton: a.corps.jeton, options: { parcGratuit: true } })).statut, 200);
    assert.equal((await poster(srv.base, `/api/salons/${code}/ordinateur`, { jeton: a.corps.jeton })).statut, 200);
    assert.equal((await poster(srv.base, `/api/salons/${code}/retirer`, { jeton: a.corps.jeton, place: 2 })).statut, 200);
    assert.equal((await poster(srv.base, `/api/salons/${code}/demarrer`, { jeton: a.corps.jeton })).statut, 200);
    await attendreQue(() => fb.dernier()?.etat, 2000, 'partie démarrée');
    assert.equal(fb.dernier().etat.options.parcGratuit, true);

    const refus = await poster(srv.base, `/api/salons/${code}/action`, { jeton: b.corps.jeton, action: { type: 'lancer' } });
    assert.deepEqual([refus.statut, refus.corps.ok], [200, false]);
    const action = await poster(srv.base, `/api/salons/${code}/action`, { jeton: a.corps.jeton, action: { type: 'lancer' } });
    assert.equal(action.corps.ok, true);
    await attendreQue(() => fb.dernier().version === action.corps.version, 2000, 'diffusion du lancer');
    assert.ok(fb.dernier().evenements.some((e) => e.type === 'des'));

    const infos = await (await fetch(`${srv.base}/api/salons/${code}`)).json();
    assert.equal(infos.demarre, true);
    assert.ok(!JSON.stringify(infos).includes(a.corps.jeton));
    fa.fermer();
    fb.fermer();
  });

  test('le flux refuse un jeton invalide ou un salon inconnu', async () => {
    const a = await poster(srv.base, '/api/salons', { nom: 'Marius' });
    assert.equal((await clientFlux(srv.base, a.corps.code, 'faux')).statut, 403);
    assert.equal((await clientFlux(srv.base, 'ZZZZZ', a.corps.jeton)).statut, 404);
  });

  test('reconnexion après une coupure du flux', async () => {
    const a = await poster(srv.base, '/api/salons', { nom: 'Marius' });
    const { code } = a.corps;
    const b = await poster(srv.base, `/api/salons/${code}/rejoindre`, { nom: 'Fanny' });
    const fa = await clientFlux(srv.base, code, a.corps.jeton);
    let fb = await clientFlux(srv.base, code, b.corps.jeton);
    await poster(srv.base, `/api/salons/${code}/demarrer`, { jeton: a.corps.jeton });
    await attendreQue(() => fb.dernier()?.etat, 2000, 'démarrage');
    fb.fermer();
    await attendreQue(() => fa.dernier().salon.places[1].connecte === false, 3000, 'Fanny vue déconnectée');
    // Marius continue à jouer pendant l'absence de Fanny.
    const r = await poster(srv.base, `/api/salons/${code}/action`, { jeton: a.corps.jeton, action: { type: 'lancer' } });
    assert.equal(r.corps.ok, true);
    // Fanny recharge sa page : même jeton, elle retrouve sa place et l'état à jour.
    const retour = await poster(srv.base, `/api/salons/${code}/rejoindre`, { jeton: b.corps.jeton });
    assert.equal(retour.corps.place, 1);
    fb = await clientFlux(srv.base, code, b.corps.jeton);
    await attendreQue(() => fb.dernier(), 2000, 'état initial');
    assert.equal(fb.messages[0].changement, 'initial');
    assert.equal(fb.messages[0].version, r.corps.version);
    assert.equal(fb.messages[0].etat.aLance, true);
    await attendreQue(() => fa.dernier().salon.places[1].connecte === true, 2000, 'Fanny vue reconnectée');
    fa.fermer();
    fb.fermer();
  });

  test('partie complète entre deux humains et un ordinateur, entièrement via HTTP', async () => {
    const a = await poster(srv.base, '/api/salons', { nom: 'Marius' });
    const { code } = a.corps;
    const b = await poster(srv.base, `/api/salons/${code}/rejoindre`, { nom: 'Fanny' });
    await poster(srv.base, `/api/salons/${code}/ordinateur`, { jeton: a.corps.jeton });
    await poster(srv.base, `/api/salons/${code}/options`, { jeton: a.corps.jeton, options: { partieRapide: true, toursMax: 12 } });
    const joueurs = [a.corps, b.corps];
    const flux = await Promise.all(joueurs.map((j) => clientFlux(srv.base, code, j.jeton)));
    await poster(srv.base, `/api/salons/${code}/demarrer`, { jeton: a.corps.jeton });
    await attendreQue(() => flux.every((f) => f.dernier()?.etat), 2000, 'démarrage');
    let actions = 0;
    const deja = new Set();
    while (!flux[0].dernier().etat.terminee) {
      let joue = false;
      for (const [k, j] of joueurs.entries()) {
        const m = flux[k].dernier();
        // On ne rejoue pas deux fois sur la même version (la réponse SSE peut arriver après).
        if (deja.has(`${k}:${m.version}`)) continue;
        const action = actionDuRobot(m);
        if (!action) continue;
        deja.add(`${k}:${m.version}`);
        const r = await poster(srv.base, `/api/salons/${code}/action`, { jeton: j.jeton, action });
        assert.ok(r.corps.ok, `${JSON.stringify(action)} : ${r.corps.erreur}`);
        actions++;
        joue = true;
      }
      if (!joue) await new Promise((r) => setTimeout(r, 5));
      assert.ok(actions < 5000, 'trop d\'actions');
    }
    await attendreQue(() => flux[1].dernier().etat.terminee, 2000, 'fin reçue par tous');
    assert.deepEqual(flux[1].dernier().etat, flux[0].dernier().etat);
    assert.notEqual(flux[0].dernier().etat.gagnant, null);
    flux.forEach((f) => f.fermer());
  });
});

describe('redémarrage du serveur', () => {
  test('les joueurs retrouvent leur partie après un redémarrage', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'monopoly-'));
    const fichier = join(dossier, 'salons.json');
    try {
      let srv = await demarrerServeur({ fichier });
      const a = await poster(srv.base, '/api/salons', { nom: 'Marius' });
      const { code } = a.corps;
      const b = await poster(srv.base, `/api/salons/${code}/rejoindre`, { nom: 'Fanny' });
      await poster(srv.base, `/api/salons/${code}/demarrer`, { jeton: a.corps.jeton });
      const r = await poster(srv.base, `/api/salons/${code}/action`, { jeton: a.corps.jeton, action: { type: 'lancer' } });
      const fa = await clientFlux(srv.base, code, a.corps.jeton);
      await attendreQue(() => fa.dernier(), 2000, 'flux');
      const etat = fa.dernier().etat;
      await srv.fermer();
      await attendreQue(() => fa.ferme, 2000, 'flux coupé par l\'arrêt');

      srv = await demarrerServeur({ fichier });
      const fb = await clientFlux(srv.base, code, b.corps.jeton);
      await attendreQue(() => fb.dernier(), 2000, 'reconnexion');
      assert.deepEqual(fb.dernier().etat, etat);
      assert.ok(fb.dernier().version >= r.corps.version);
      fb.fermer();
      await srv.fermer();
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
