// Tests de la logique des salons en ligne (sans couche HTTP).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { donnees } from './aide.js';
import { attendreQue, clientDirect, actionDuRobot } from './aide-reseau.js';
import { GestionnaireSalons, dureeAnimations } from '../serveur/salons.js';

const gestionnaires = [];
function nouveau(options = {}) {
  const g = new GestionnaireSalons(donnees, { delaiIA: 0, facteurAnimation: 0, delaiDeconnexion: 10, delaiAbsence: 60_000, ...options });
  gestionnaires.push(g);
  return g;
}
afterEach(() => {
  while (gestionnaires.length) gestionnaires.pop().fermer();
});

// Salon avec deux humains (Marius hôte, Fanny), et leurs clients abonnés.
function salonADeux(g, options) {
  const a = g.creer({ nom: 'Marius', pion: 'pointu' });
  const b = g.rejoindre(a.code, { nom: 'Fanny', pion: 'pointu' });
  if (options) g.modifierOptions(a.code, a.jeton, options);
  return { code: a.code, a, b };
}

describe('salon d\'attente', () => {
  test('création, code lisible et pions uniques', () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(a.place, 0);
    assert.equal(b.place, 1);
    assert.notEqual(a.jeton, b.jeton);
    const infos = g.infos(code);
    assert.deepEqual(infos.places.map((p) => p.nom), ['Marius', 'Fanny']);
    assert.equal(infos.places[1].pion, 'ballon', 'le pion déjà pris est remplacé');
    assert.equal(infos.hote, 0);
  });

  test('le code est insensible à la casse et un salon inconnu renvoie 404', () => {
    const g = nouveau();
    const { code } = salonADeux(g);
    assert.equal(g.infos(code.toLowerCase()).code, code);
    assert.throws(() => g.infos('ZZZZZ'), (e) => e.statut === 404);
  });

  test('6 joueurs au maximum', () => {
    const g = nouveau();
    const { code, a } = salonADeux(g);
    for (let i = 0; i < 4; i++) g.ajouterOrdinateur(code, a.jeton);
    assert.throws(() => g.rejoindre(code, { nom: 'Septième' }), (e) => e.statut === 409);
    assert.throws(() => g.ajouterOrdinateur(code, a.jeton), (e) => e.statut === 409);
    assert.equal(new Set(g.infos(code).places.map((p) => p.pion)).size, 6);
  });

  test("seul l'hôte gère le salon", () => {
    const g = nouveau();
    const { code, b } = salonADeux(g);
    for (const f of [
      () => g.ajouterOrdinateur(code, b.jeton),
      () => g.modifierOptions(code, b.jeton, { parcGratuit: true }),
      () => g.demarrer(code, b.jeton),
      () => g.retirer(code, b.jeton, 0)
    ]) assert.throws(f, (e) => e.statut === 403);
    assert.throws(() => g.demarrer(code, 'faux-jeton'), (e) => e.statut === 403);
  });

  test("options validées par l'hôte", () => {
    const g = nouveau();
    const { code, a } = salonADeux(g);
    g.modifierOptions(code, a.jeton, { parcGratuit: 1, partieRapide: true, toursMax: 3, inconnu: true });
    const o = g.infos(code).options;
    assert.equal(o.parcGratuit, true);
    assert.equal(o.toursMax, 5);
    assert.equal('inconnu' in o, false);
  });

  test("retirer un joueur, quitter le salon et transmission du rôle d'hôte", () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    g.ajouterOrdinateur(code, a.jeton);
    g.retirer(code, a.jeton, 2);
    assert.equal(g.infos(code).places.length, 2);
    g.quitter(code, a.jeton);
    const infos = g.infos(code);
    assert.deepEqual(infos.places.map((p) => p.nom), ['Fanny']);
    assert.equal(infos.hote, 0);
    g.ajouterOrdinateur(code, b.jeton);
    g.quitter(code, b.jeton);
    assert.throws(() => g.infos(code), (e) => e.statut === 404, 'salon supprimé sans humain');
  });

  test('il faut au moins 2 joueurs pour démarrer, et on ne rejoint plus une partie commencée', () => {
    const g = nouveau();
    const a = g.creer({ nom: 'Seul' });
    assert.throws(() => g.demarrer(a.code, a.jeton));
    g.rejoindre(a.code, { nom: 'Fanny' });
    g.demarrer(a.code, a.jeton);
    assert.throws(() => g.rejoindre(a.code, { nom: 'Retardataire' }), (e) => e.statut === 409);
    assert.throws(() => g.ajouterOrdinateur(a.code, a.jeton), (e) => e.statut === 409);
  });
});

describe('partie en ligne', () => {
  test('démarrage : chaque abonné reçoit l\'état et sa propre place', () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    const cb = clientDirect(g, code, b.jeton);
    assert.equal(ca.dernier().changement, 'presence');
    g.demarrer(code, a.jeton);
    assert.equal(ca.dernier().changement, 'partie');
    assert.equal(ca.dernier().moi, 0);
    assert.equal(cb.dernier().moi, 1);
    assert.deepEqual(ca.dernier().etat.joueurs.map((j) => j.nom), ['Marius', 'Fanny']);
    assert.equal(ca.dernier().version, cb.dernier().version);
  });

  test('les jetons ne sont jamais diffusés', () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    g.demarrer(code, a.jeton);
    const tout = JSON.stringify(ca.messages);
    assert.ok(!tout.includes(a.jeton) && !tout.includes(b.jeton));
  });

  test('le joueur est déterminé par le jeton : impossible de jouer à la place d\'un autre', () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    g.demarrer(code, a.jeton);
    const r = g.agir(code, b.jeton, { type: 'lancer', joueur: 0 });
    assert.equal(r.ok, false);
    assert.match(r.erreur, /pas à ce joueur/);
    assert.throws(() => g.agir(code, 'inconnu', { type: 'lancer' }), (e) => e.statut === 403);
    assert.throws(() => g.agir(code, a.jeton, null), (e) => e.statut === 400);
    assert.equal(g.agir(code, a.jeton, { type: 'lancer' }).ok, true);
  });

  test('chaque action est diffusée à tous avec ses événements', () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    const cb = clientDirect(g, code, b.jeton);
    g.demarrer(code, a.jeton);
    const r = g.agir(code, a.jeton, { type: 'lancer' });
    for (const c of [ca, cb]) {
      const m = c.dernier();
      assert.equal(m.version, r.version);
      assert.deepEqual(m.action, { type: 'lancer', joueur: 0 });
      assert.ok(m.evenements.some((e) => e.type === 'des'));
      assert.ok(m.evenements.some((e) => e.type === 'deplacement'));
      assert.equal(m.etat.aLance, true);
    }
  });

  test('une action refusée ne change rien', () => {
    const g = nouveau();
    const { code, a } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    g.demarrer(code, a.jeton);
    const avant = ca.messages.length;
    const r = g.agir(code, a.jeton, { type: 'finirTour' });
    assert.equal(r.ok, false);
    assert.equal(ca.messages.length, avant);
  });

  test("les ordinateurs jouent tout seuls jusqu'au tour d'un humain", async () => {
    const g = nouveau();
    const a = g.creer({ nom: 'Marius' });
    g.ajouterOrdinateur(a.code, a.jeton);
    g.ajouterOrdinateur(a.code, a.jeton);
    const ca = clientDirect(g, a.code, a.jeton);
    g.demarrer(a.code, a.jeton);
    // Marius joue son premier tour.
    while (ca.dernier().etat.courant === 0) {
      const action = actionDuRobot(ca.dernier());
      if (action) g.agir(a.code, a.jeton, action);
      else await new Promise((r) => setTimeout(r, 5));
    }
    await attendreQue(() => ca.dernier().etat.courant === 0, 5000, 'retour au tour de Marius');
    const journal = ca.dernier().etat.journal.join('\n');
    assert.match(journal, /César lance les dés/);
    assert.match(journal, /Honorine lance les dés/);
  });

  test('pause entre deux coups de l\'ordinateur selon les animations', () => {
    assert.equal(dureeAnimations([{ type: 'des' }, { type: 'deplacement', chemin: [1, 2, 3] }, { type: 'carte' }]), 1100 + 420 + 2200);
  });
});

describe('déconnexion et reconnexion', () => {
  test('présence : déconnexion signalée aux autres après le délai de grâce', async () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    const cb = clientDirect(g, code, b.jeton);
    assert.equal(ca.dernier().salon.places[1].connecte, true);
    cb.fermer();
    await attendreQue(() => ca.dernier().salon.places[1].connecte === false, 1000, 'Fanny déconnectée');
    assert.equal(ca.dernier().changement, 'presence');
  });

  test('une coupure brève (rechargement de page) passe inaperçue', async () => {
    const g = nouveau({ delaiDeconnexion: 80 });
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    const premier = clientDirect(g, code, b.jeton);
    const depuis = ca.messages.length;
    assert.equal(ca.dernier().salon.places[1].connecte, true);
    premier.fermer();
    clientDirect(g, code, b.jeton);
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(ca.messages.slice(depuis).every((m) => m.salon.places[1].connecte === true));
  });

  test("reconnexion avec le jeton : on retrouve sa place et l'état complet", () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    g.demarrer(code, a.jeton);
    g.agir(code, a.jeton, { type: 'lancer' });
    const cb = clientDirect(g, code, b.jeton);
    cb.fermer();
    assert.deepEqual(g.rejoindre(code, { jeton: b.jeton }), { code, jeton: b.jeton, place: 1 });
    const retour = clientDirect(g, code, b.jeton);
    const initial = retour.messages[0];
    assert.equal(initial.changement, 'initial');
    assert.equal(initial.moi, 1);
    assert.equal(initial.etat.aLance, true);
  });

  test("reprise de sa place par son nom (autre appareil), seulement si le joueur est déconnecté", async () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    g.demarrer(code, a.jeton);
    const cb = clientDirect(g, code, b.jeton);
    assert.throws(() => g.rejoindre(code, { nom: 'fanny' }), (e) => e.statut === 409, 'Fanny est connectée');
    cb.fermer();
    await attendreQue(() => g.infos(code).places[1].connecte === false, 1000, 'déconnexion');
    assert.equal(g.rejoindre(code, { nom: '  fanny ' }).jeton, b.jeton);
    assert.throws(() => g.rejoindre(code, { nom: 'Inconnu' }), (e) => e.statut === 409);
  });

  test("absent à son tour : l'ordinateur prend le relais, puis rend la main au retour", async () => {
    const g = nouveau({ delaiAbsence: 30 });
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    const cb = clientDirect(g, code, b.jeton);
    g.demarrer(code, a.jeton);
    // Marius joue son tour, Fanny se déconnecte juste avant le sien.
    cb.fermer();
    while (ca.dernier().etat.courant === 0) {
      const action = actionDuRobot(ca.dernier());
      assert.ok(action);
      g.agir(code, a.jeton, action);
    }
    await attendreQue(() => ca.dernier().etat.joueurs[1].ia === true, 2000, "remplacement par l'ordinateur");
    assert.equal(ca.dernier().salon.places[1].remplaceParIA, true);
    await attendreQue(() => ca.dernier().etat.courant === 0, 5000, "l'ordinateur a joué le tour de Fanny");
    clientDirect(g, code, b.jeton);
    const m = ca.dernier();
    assert.equal(m.etat.joueurs[1].ia, false);
    assert.equal(m.salon.places[1].remplaceParIA, false);
    assert.match(m.etat.journal.at(-1), /Fanny est de retour/);
  });

  test("un joueur connecté peut confier un absent à l'ordinateur", async () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    clientDirect(g, code, a.jeton);
    const cb = clientDirect(g, code, b.jeton);
    g.demarrer(code, a.jeton);
    assert.throws(() => g.remplacerParIA(code, a.jeton, 1), /connecté/);
    cb.fermer();
    await attendreQue(() => g.infos(code).places[1].connecte === false, 1000, 'déconnexion');
    g.remplacerParIA(code, a.jeton, 1);
    assert.equal(g.infos(code).places[1].remplaceParIA, true);
  });

  test("quitter en cours de partie : l'ordinateur remplace définitivement le joueur", () => {
    const g = nouveau();
    const { code, a, b } = salonADeux(g);
    const ca = clientDirect(g, code, a.jeton);
    g.demarrer(code, a.jeton);
    g.quitter(code, b.jeton);
    assert.equal(ca.dernier().etat.joueurs[1].ia, true);
    assert.equal(ca.dernier().salon.places[1].abandon, true);
    assert.throws(() => g.agir(code, b.jeton, { type: 'lancer' }), (e) => e.statut === 403);
    assert.throws(() => g.rejoindre(code, { nom: 'Fanny' }), (e) => e.statut === 409);
    assert.throws(() => g.rejoindre(code, { jeton: b.jeton }), (e) => e.statut === 403, 'son ancien jeton ne vaut plus rien');
  });

  test("l'hôte qui quitte la partie transmet son rôle", () => {
    const g = nouveau();
    const { code, a } = salonADeux(g);
    g.demarrer(code, a.jeton);
    g.quitter(code, a.jeton);
    assert.equal(g.infos(code).hote, 1);
  });
});

describe('sauvegarde des salons sur disque', () => {
  test('un redémarrage du serveur ne perd ni les salons ni les parties', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'monopoly-'));
    try {
      const fichier = join(dossier, 'salons.json');
      const g1 = nouveau({ fichier });
      const { code, a, b } = salonADeux(g1);
      g1.demarrer(code, a.jeton);
      g1.agir(code, a.jeton, { type: 'lancer', des: undefined });
      const etatAvant = structuredClone(g1.salons.get(code).partie.etat);
      g1.fermer();

      const g2 = nouveau({ fichier });
      assert.deepEqual(g2.salons.get(code).partie.etat, etatAvant);
      assert.equal(g2.rejoindre(code, { jeton: b.jeton }).place, 1);
      const ca = clientDirect(g2, code, a.jeton);
      assert.equal(ca.messages[0].etat.aLance, true);
      const action = actionDuRobot(ca.dernier());
      assert.equal(g2.agir(code, a.jeton, action).ok, true);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('parties complètes en ligne', () => {
  // Chaque humain est un « robot » qui ne voit que les messages reçus par son propre client.
  async function jouerJusquaLaFin(g, code, joueurs, clients, { coupures = false } = {}) {
    let actions = 0;
    let deconnexions = 0;
    while (!clients[0].dernier().etat.terminee) {
      let joue = false;
      for (const [k, j] of joueurs.entries()) {
        const action = actionDuRobot(clients[k].dernier());
        if (!action) continue;
        // Coupure réseau de temps en temps : le joueur se reconnecte avec son jeton.
        if (coupures && actions % 97 === 13) {
          clients[k].fermer();
          clients[k] = clientDirect(g, code, g.rejoindre(code, { jeton: j.jeton }).jeton);
          deconnexions++;
        }
        const r = g.agir(code, j.jeton, action);
        assert.ok(r.ok, `${JSON.stringify(action)} : ${r.erreur}`);
        actions++;
        joue = true;
      }
      if (!joue) await new Promise((r) => setTimeout(r, 2));
      assert.ok(actions < 20000, 'la partie ne se termine pas');
    }
    return { actions, deconnexions };
  }

  test('trois humains jouent une partie complète jusqu\'à la faillite de tous sauf un', async () => {
    const g = nouveau();
    const a = g.creer({ nom: 'Marius' });
    const joueurs = [a, g.rejoindre(a.code, { nom: 'Fanny' }), g.rejoindre(a.code, { nom: 'César' })];
    const clients = joueurs.map((j) => clientDirect(g, a.code, j.jeton));
    g.demarrer(a.code, a.jeton);
    const { actions } = await jouerJusquaLaFin(g, a.code, joueurs, clients);
    const fin = clients[0].dernier().etat;
    assert.equal(fin.joueurs.filter((j) => !j.faillite).length, 1);
    assert.ok(actions > 50);
    // Tous les clients ont la même vision finale.
    for (const c of clients) assert.deepEqual(c.dernier().etat, fin);
  });

  test('humains et ordinateurs mélangés, avec coupures réseau et options, en partie rapide', async () => {
    const g = nouveau();
    const a = g.creer({ nom: 'Marius' });
    const joueurs = [a, g.rejoindre(a.code, { nom: 'Fanny' })];
    g.ajouterOrdinateur(a.code, a.jeton);
    g.ajouterOrdinateur(a.code, a.jeton);
    g.modifierOptions(a.code, a.jeton, { partieRapide: true, toursMax: 15, parcGratuit: true, doubleDepart: true });
    const clients = joueurs.map((j) => clientDirect(g, a.code, j.jeton));
    g.demarrer(a.code, a.jeton);
    const { deconnexions } = await jouerJusquaLaFin(g, a.code, joueurs, clients, { coupures: true });
    const fin = clients[0].dernier().etat;
    assert.equal(fin.terminee, true);
    assert.notEqual(fin.gagnant, null);
    assert.ok(deconnexions > 0, 'des reconnexions ont eu lieu');
    assert.deepEqual(clients[1].dernier().etat, fin);
  });
});
