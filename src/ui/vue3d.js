// Vue 3D du plateau, en plein écran : le plateau posé sur un ponton au milieu de la mer, face à
// la Corniche, les joueurs installés tout autour (voir joueurs3d.js), et une caméra que l'on fait
// tourner, incliner, zoomer et glisser. Maisons et hôtels sont en volume, texturés, aux couleurs
// de leur propriétaire.
// La vue à plat reste la vue par défaut ; le choix de la vue et la position de la caméra sont
// mémorisés dans le navigateur.
import { el } from './utilitaires.js';
import {
  ECRAN, cameraParDefaut, bornerCamera, orbiter, deplacer, zoomer, interpoler, azimutDeFace, azimutVers,
  vueJoueur, projeter, horizon, cadreScene, lireCamera, ecrireCamera
} from './camera3d.js';

const CLE_VUE = 'monopoly-marseille-vue3d';
// Changée avec la vue de départ : chacun la découvre, au lieu d'une caméra réglée pour l'ancienne.
const CLE_CAMERA = 'monopoly-marseille-camera3d-v3';
const CLE_AIDE = 'monopoly-marseille-aide3d';
const CLE_SUIVI = 'monopoly-marseille-suivi3d';

function lire(cle) {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible : le choix ne sera simplement pas retenu.
  }
}

const mouvementReduit = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Entre `min` et `max` ; s'il n'y a pas la place, contre `min` (le bord gauche ou le haut de l'écran).
const borner = (valeur, min, max) => Math.max(min, Math.min(max, valeur));
const MARGE_ETIQUETTE = 6; // px entre une étiquette et le bord de l'écran

// Caméra de la partie affichée : sa position est enregistrée quand on quitte la page, même
// au milieu du délai d'enregistrement.
let cameraAffichee = null;
window.addEventListener('pagehide', () => cameraAffichee?.enregistrer(true));

// Point de vue de la vue à plat (plateau vu du dessus) : la vue 3D s'ouvre et se referme depuis lui.
const POSE_A_PLAT = Object.freeze({ inclinaison: 0, zoom: 1 / ECRAN.echelle, decalageX: 0, decalageY: -ECRAN.decalageY });

// Construit la scène dans `conteneur`. `panneau` : le panneau des actions, qui flotte par-dessus
// la vue 3D (le plateau ne passe pas dessous). Renvoie l'élément qui accueillera le plateau, le
// bouton de bascule entre vue à plat et vue 3D, la table où s'installent les joueurs (posée sur le
// ponton), le calque de leurs étiquettes et la caméra.
export function creerScene(conteneur, { panneau = null } = {}) {
  const plateau = el('div', { class: 'plateau' });
  // Table des joueurs : leurs tapis, à plat avec les cartes posées dessus, puis ce qui s'y tient debout.
  const table = el('div', { class: 'table-joueurs' },
    el('div', { class: 'tapis-joueurs' }),
    el('div', { class: 'objets-joueurs', 'aria-hidden': 'true' }));
  // Horizon, mer et plateau sont trois calques peints l'un sur l'autre : mêlés dans une même
  // scène 3D, la mer et les cases se trient mal et des cases deviennent transparentes.
  // La table est dans le décor : dans la scène du plateau, le navigateur découpait les tapis selon
  // le plan des tranches et des pions, et des morceaux de tapis disparaissaient.
  const ciel = el('div', { class: 'horizon', 'aria-hidden': 'true' }, el('div', { class: 'nuages' }), mouettes());
  const sceneDecor = el('div', { class: 'scene scene-decor' }, decor(table));
  const scene = el('div', { class: 'scene scene-plateau' },
    ...['avant', 'arriere', 'gauche', 'droite'].map((cote) => el('div', { class: `tranche tranche-${cote}`, 'aria-hidden': 'true' })),
    plateau);
  const camera = el('div', { class: 'camera' }, sceneDecor, scene);
  const etiquettes = el('div', { class: 'etiquettes-joueurs' });
  conteneur.prepend(ciel, camera);
  const controle = new Camera3D(conteneur, camera, { ciel, sceneDecor, scene, etiquettes }, panneau);
  conteneur.append(etiquettes, controle.commandes, controle.aide);
  return { plateau, bouton: controle.bouton, table, etiquettes, camera3d: controle };
}

// Pilotage de la caméra : souris, doigts, molette et boutons. `camera` est la position voulue
// (mémorisée), `vue` celle qui est affichée (elles diffèrent pendant une animation).
class Camera3D {
  constructor(conteneur, elCamera, calques, panneau) {
    this.conteneur = conteneur;
    this.elCamera = elCamera;
    this.calques = calques;
    this.panneau = panneau;
    // Appelée quand on entre en vue 3D ou qu'on en sort (le contrôleur y installe les joueurs).
    this.surBascule = null;
    this.pointeurs = new Map();
    this.dims = { largeur: 0, hauteur: 0 };
    this.ecran = { largeur: 0, hauteur: 0 };
    this.obstacles = [];
    this.resolution = 1;
    this.camera = lireCamera(lire(CLE_CAMERA)) ?? cameraParDefaut(window.innerWidth);
    this.vue = { ...this.camera };
    // Suivi du joueur dont c'est le tour (parties sur un même écran) : `place` est la sienne, `cle`
    // celle où la caméra s'est placée en dernier (elle ne bouge que quand la main passe).
    this.suivi = { disponible: false, actif: lire(CLE_SUIVI) !== '0', place: null, cle: null, enAttente: false };
    cameraAffichee = this;
    this.bouton = el('button', { type: 'button', class: 'btn btn-petit bouton-vue', onclick: () => this.basculer() });
    this.commandes = this.creerCommandes();
    this.aide = el('p', { class: 'aide-3d', 'aria-hidden': 'true' }, window.matchMedia?.('(pointer: coarse)').matches
      ? 'Glissez pour tourner le plateau · pincez pour zoomer'
      : 'Glissez pour tourner le plateau · molette pour zoomer · Maj + glisser pour le déplacer');

    conteneur.addEventListener('pointerdown', (e) => this.surAppui(e));
    conteneur.addEventListener('pointermove', (e) => this.surMouvement(e));
    conteneur.addEventListener('pointerup', (e) => this.surRelache(e));
    conteneur.addEventListener('pointercancel', (e) => this.surRelache(e));
    conteneur.addEventListener('wheel', (e) => this.surMolette(e), { passive: false });
    conteneur.addEventListener('click', (e) => this.surClic(e), true);
    conteneur.addEventListener('contextmenu', (e) => { if (this.actif) e.preventDefault(); });
    // Le panneau des actions change de taille selon ce qu'on peut faire : les étiquettes le contournent.
    const observateur = new ResizeObserver(() => {
      this.mesurer();
      this.rendre();
    });
    observateur.observe(conteneur);
    if (panneau) observateur.observe(panneau);
    this.afficher(lire(CLE_VUE) === '1', false);
  }

  get actif() {
    return this.conteneur.classList.contains('vue-3d');
  }

  creerCommandes() {
    const bouton = (texte, titre, action) => el('button', { type: 'button', class: 'btn-camera', title: titre, 'aria-label': titre, onclick: action }, texte);
    const vers = (modif) => () => this.animerVers(bornerCamera({ ...this.camera, ...modif(this.camera) }));
    this.boutonSuivi = bouton('🎥', 'Suivre le joueur dont c\'est le tour', () => this.basculerSuivi());
    this.boutonSuivi.hidden = true;
    this.boutonSuivi.setAttribute('aria-pressed', String(this.suivi.actif));
    return el('div', { class: 'commandes-3d', role: 'toolbar', 'aria-label': 'Caméra de la vue 3D' },
      this.boutonSuivi,
      bouton('↺', 'Tourner le plateau vers la gauche', vers((c) => ({ azimut: c.azimut - 45 }))),
      bouton('↻', 'Tourner le plateau vers la droite', vers((c) => ({ azimut: c.azimut + 45 }))),
      bouton('▲', 'Incliner le plateau (vue plus rasante)', vers((c) => ({ inclinaison: c.inclinaison + 8 }))),
      bouton('▼', 'Redresser le plateau (vue plus plongeante)', vers((c) => ({ inclinaison: c.inclinaison - 8 }))),
      bouton('+', 'Zoomer', () => this.animerVers(zoomer(this.camera, 1.3, this.viseCentreVue()))),
      bouton('−', 'Dézoomer', () => this.animerVers(zoomer(this.camera, 1 / 1.3, this.viseCentreVue()))),
      bouton('⌖', 'Recentrer la vue', () => this.recentrer()));
  }

  // ---------------------------------------------------------------------------
  // Suivi du joueur dont c'est le tour
  // ---------------------------------------------------------------------------

  // Le suivi n'a de sens que sur un écran partagé (partie locale) : son bouton n'apparaît qu'alors.
  proposerSuivi(disponible) {
    this.suivi.disponible = disponible;
    this.boutonSuivi.hidden = !disponible;
  }

  basculerSuivi() {
    this.suivi.actif = !this.suivi.actif;
    ecrire(CLE_SUIVI, this.suivi.actif ? '1' : '0');
    this.boutonSuivi.setAttribute('aria-pressed', String(this.suivi.actif));
    this.suivi.cle = null;
    if (this.suivi.actif) this.suivreJoueur(this.suivi.place);
  }

  // Appelée à chaque mise à jour de la partie avec la place du joueur dont c'est le tour : quand la
  // main passe, la caméra se place face à son côté du plateau. Entre-temps, on peut regarder
  // ailleurs ; la caméra ne reviendra qu'au tour suivant (ou avec ⌖).
  suivreJoueur(place) {
    this.suivi.place = place;
    if (!this.actif || !this.suivi.disponible || !this.suivi.actif || !place) return;
    const cle = `${place.angle}|${place.decalage}`;
    if (cle === this.suivi.cle) return;
    this.suivi.cle = cle;
    this.allerVersJoueur();
  }

  allerVersJoueur() {
    // En plein geste, la caméra attend que le doigt (ou la souris) se lève.
    this.suivi.enAttente = this.pointeurs.size > 0;
    if (!this.suivi.enAttente) this.animerVers(vueJoueur(this.suivi.place, this.camera, window.innerWidth), { duree: 900 });
  }

  // ⌖ : retour à la vue du joueur suivi, ou à la vue de départ.
  recentrer() {
    if (this.suivi.disponible && this.suivi.actif && this.suivi.place) this.allerVersJoueur();
    else this.animerVers({ ...cameraParDefaut(window.innerWidth), azimut: azimutDeFace(this.camera.azimut) });
  }

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  // Cadre de la scène, au milieu de l'écran, à l'écart du panneau des actions (voir cadreScene).
  // Le décor, lui, couvre tout l'écran ; les étiquettes vont partout, sauf sous le panneau et la
  // barre de la caméra.
  mesurer() {
    if (!this.actif) return;
    const ecran = this.conteneur.getBoundingClientRect();
    const rectangle = (element) => {
      const r = element?.getBoundingClientRect();
      return r?.width ? { gauche: r.left - ecran.left, haut: r.top - ecran.top, droite: r.right - ecran.left, bas: r.bottom - ecran.top } : null;
    };
    const panneau = rectangle(this.panneau);
    this.ecran = { largeur: ecran.width, hauteur: ecran.height };
    this.dims = cadreScene(this.ecran, panneau, cameraParDefaut(ecran.width));
    this.obstacles = [rectangle(this.commandes), panneau].filter(Boolean);
    const { largeur, gauche, haut } = this.dims;
    const style = this.conteneur.style;
    style.setProperty('--scene-s', `${largeur.toFixed(1)}px`);
    style.setProperty('--scene-gauche', `${gauche.toFixed(1)}px`);
    style.setProperty('--scene-haut', `${haut.toFixed(1)}px`);
  }

  // Applique une position de caméra. Les transformations sont posées sur chaque calque, et
  // l'orientation « face à la caméra » sur les seuls éléments debout (pions, bateaux) : une
  // variable posée plus haut obligerait le navigateur à recalculer tout le plateau à chaque image.
  rendre(c = this.vue) {
    if (!this.actif || !this.dims.largeur) return;
    const { largeur, gauche, haut } = this.dims;
    const { ciel, sceneDecor, scene } = this.calques;
    const transformation = (echelle) => `translate(${(c.decalageX * largeur).toFixed(1)}px, ${((c.decalageY + ECRAN.decalageY) * largeur).toFixed(1)}px) `
      + `rotateX(${c.inclinaison.toFixed(2)}deg) rotateZ(${c.azimut.toFixed(2)}deg) scale3d(${echelle}, ${echelle}, ${echelle})`;
    const echelle = ECRAN.echelle * c.zoom;
    sceneDecor.style.transform = transformation(echelle.toFixed(4));
    scene.style.transform = transformation((echelle / this.resolution).toFixed(4));
    // Sur un tapis tourné vers sa place, il faut aussi compenser l'angle de la place.
    for (const debout of this.conteneur.querySelectorAll('.pions, .accessoire, .objets-joueur')) {
      const angle = c.azimut + (Number(debout.dataset.angle) || 0);
      debout.style.setProperty('--face-camera', `rotateZ(${(-angle).toFixed(2)}deg) rotateX(${(-c.inclinaison).toFixed(2)}deg)`);
    }
    this.ajusterResolution(c.zoom);
    // Le centre du plateau (journal, dés, pioches) se tourne vers le côté le plus proche de la
    // caméra, avec un peu de marge pour ne pas hésiter entre deux côtés.
    const vise = -c.azimut;
    if (this.tourCentre === undefined || Math.abs(vise - this.tourCentre) > 50) {
      this.tourCentre = Math.round(vise / 90) * 90;
      scene.querySelector('.centre')?.style.setProperty('--tour-centre', `${this.tourCentre}deg`);
    }
    // L'horizon couvre toute la largeur de l'écran, posé sur le bord lointain de la mer.
    const h = horizon(c);
    ciel.style.setProperty('--horizon-y', `${(haut + h.y * largeur).toFixed(1)}px`);
    ciel.style.setProperty('--panorama-x', `${(gauche + h.decalage * largeur).toFixed(1)}px`);
    this.placerEtiquettes(c);
  }

  // Les étiquettes des joueurs suivent leur place sur la table (data-ancre-x/y, en plateaux) ;
  // elles restent nettes et lisibles, un peu plus grandes de près, et entières à l'écran : celle
  // d'une place hors champ attend au bord. Sur le panneau des actions ou la barre de la caméra,
  // elle passe au-dessous (au-dessus s'ils sont en bas de l'écran).
  placerEtiquettes(c = this.vue) {
    if (!this.actif || !this.dims.largeur) return;
    const { largeur, gauche, haut } = this.dims;
    const etiquettes = [...this.calques.etiquettes.children];
    // Toutes les mesures avant toutes les écritures : une seule mise en page.
    const tailles = etiquettes.map((etiquette) => ({ largeur: etiquette.offsetWidth, hauteur: etiquette.offsetHeight }));
    etiquettes.forEach((etiquette, k) => {
      const x = Number(etiquette.dataset.ancreX);
      const y = Number(etiquette.dataset.ancreY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const p = projeter(c, { x, y, z: 0.02 });
      const taille = Math.min(1.15, Math.max(0.72, 0.5 + 0.7 * c.zoom * p.fuite));
      const demiLargeur = (tailles[k].largeur * taille) / 2 + MARGE_ETIQUETTE;
      const demiHauteur = (tailles[k].hauteur * taille) / 2 + MARGE_ETIQUETTE;
      const ex = borner(gauche + p.x * largeur, demiLargeur, this.ecran.largeur - demiLargeur);
      let ey = borner(haut + p.y * largeur, demiHauteur, this.ecran.hauteur - demiHauteur);
      for (const o of this.obstacles) {
        if (ex + demiLargeur > o.gauche && ex - demiLargeur < o.droite && ey + demiHauteur > o.haut && ey - demiHauteur < o.bas) {
          ey = o.haut > this.ecran.hauteur / 2 ? o.haut - demiHauteur : o.bas + demiHauteur;
        }
      }
      etiquette.style.transform = `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) translate(-50%, -50%) scale(${taille.toFixed(3)})`;
    });
  }

  // Tourne la table pour amener devant soi la place d'angle `angle` (vue du dessus).
  tournerVers(angle) {
    this.animerVers(bornerCamera({ ...this.camera, azimut: azimutVers(this.camera.azimut, angle) }), { duree: 650 });
  }

  // Résolution du plateau et de la table selon le zoom (voir .scene-plateau et .table-joueurs dans
  // vue3d.css), avec une marge pour ne pas basculer sans cesse. Elle change une fois la caméra
  // immobile : remettre le plateau en page prend un instant, mieux vaut ne pas le faire en plein geste.
  ajusterResolution(zoom) {
    const voulue = zoom > 1.2 ? 2 : zoom < 1.1 ? 1 : this.resolution;
    clearTimeout(this.minuteurResolution);
    if (voulue === this.resolution) return;
    this.minuteurResolution = setTimeout(() => {
      this.resolution = voulue;
      this.elCamera.style.setProperty('--resolution', String(voulue));
      this.rendre();
    }, 200);
  }

  planifierRendu() {
    if (this.rendu) return;
    this.rendu = requestAnimationFrame(() => {
      this.rendu = null;
      this.rendre();
    });
  }

  // Animation douce de la vue jusqu'à `cible`, puis `fin()`. Sauf avis contraire, la cible
  // devient la nouvelle position mémorisée de la caméra.
  animerVers(cible, { duree = 450, fin = null, memoriser = true } = {}) {
    cancelAnimationFrame(this.animation);
    this.animation = null;
    if (memoriser) {
      this.camera = bornerCamera(cible);
      this.enregistrer();
    }
    if (mouvementReduit() || duree <= 0) {
      this.vue = { ...cible };
      this.rendre();
      fin?.();
      return;
    }
    const depart = { ...this.vue };
    const debut = performance.now();
    const etape = (instant) => {
      const t = Math.min(1, (instant - debut) / duree);
      this.vue = interpoler(depart, cible, 1 - (1 - t) ** 3);
      this.rendre();
      if (t < 1) {
        this.animation = requestAnimationFrame(etape);
      } else {
        this.animation = null;
        fin?.();
      }
    };
    this.animation = requestAnimationFrame(etape);
  }

  basculer() {
    const actif = !this.actif;
    ecrire(CLE_VUE, actif ? '1' : '0');
    this.afficher(actif, true);
  }

  // Passe en vue 3D (ou revient à plat), avec une petite animation depuis le plateau vu du dessus.
  afficher(actif, anime) {
    this.bouton.setAttribute('aria-pressed', String(actif));
    this.bouton.textContent = actif ? '🗺️ Vue à plat' : '🧊 Vue 3D';
    this.bouton.title = actif ? 'Revenir au plateau vu de dessus' : 'Voir le plateau en 3D, sur la mer, face à la Corniche';
    if (actif) {
      this.pleinEcran(true);
      this.mesurer();
      // La caméra rejoindra le joueur suivi (le contrôleur rappelle suivreJoueur).
      this.suivi.cle = null;
      this.surBascule?.(true);
      if (anime) {
        this.vue = { ...POSE_A_PLAT, azimut: azimutDeFace(this.camera.azimut) };
        this.rendre();
        this.animerVers(this.camera, { duree: 750 });
        this.montrerAide();
      } else {
        this.vue = { ...this.camera };
        this.rendre();
      }
    } else if (anime && this.actif) {
      this.animerVers({ ...POSE_A_PLAT, azimut: azimutDeFace(this.vue.azimut) }, {
        memoriser: false,
        fin: () => {
          this.pleinEcran(false);
          this.vue = { ...this.camera };
          this.surBascule?.(false);
        }
      });
    } else {
      this.pleinEcran(false);
    }
  }

  // La vue 3D occupe tout l'écran ; le panneau des actions flotte par-dessus.
  pleinEcran(actif) {
    this.conteneur.classList.toggle('vue-3d', actif);
    this.conteneur.closest('.jeu')?.classList.toggle('en-3d', actif);
  }

  enregistrer(maintenant = false) {
    clearTimeout(this.minuteurEnregistrement);
    if (maintenant) ecrire(CLE_CAMERA, ecrireCamera(this.camera));
    else this.minuteurEnregistrement = setTimeout(() => ecrire(CLE_CAMERA, ecrireCamera(this.camera)), 300);
  }

  montrerAide() {
    if (lire(CLE_AIDE) === 'vu') return;
    this.aide.classList.remove('visible');
    void this.aide.offsetWidth;
    this.aide.classList.add('visible');
  }

  // ---------------------------------------------------------------------------
  // Souris et doigts
  // ---------------------------------------------------------------------------

  // Point de l'écran (coordonnées de la page) relatif au centre du plateau affiché, en largeurs de vue.
  viseEcran(clientX, clientY) {
    const cadre = this.elCamera.getBoundingClientRect();
    const centre = projeter(this.camera, { x: 0, y: 0 }, this.dims.hauteur / this.dims.largeur);
    return { x: (clientX - cadre.left) / this.dims.largeur - centre.x, y: (clientY - cadre.top) / this.dims.largeur - centre.y };
  }

  viseCentreVue() {
    const cadre = this.elCamera.getBoundingClientRect();
    return this.viseEcran(cadre.left + cadre.width / 2, cadre.top + cadre.height / 2);
  }

  // Un geste peut commencer sur une étiquette de joueur (elles couvrent une bonne part d'un petit
  // écran) : un simple toucher sur son nom reste un clic.
  surAppui(e) {
    if (!this.actif || e.target.closest('.commandes-3d, .bulle-boisson')) return;
    if (e.pointerType === 'mouse' && e.button > 2) return;
    if (!this.pointeurs.size) this.glisse = false;
    this.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    this.mode = e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey ? 'deplacer' : 'orbiter';
  }

  surMouvement(e) {
    const p = this.pointeurs.get(e.pointerId);
    if (!p) return;
    if (e.pointerType === 'mouse' && !e.buttons) {
      this.surRelache(e);
      return;
    }
    if (!this.glisse) {
      // Un simple clic sur une case doit rester un clic : on ne tourne qu'au-delà de quelques pixels.
      if (this.pointeurs.size < 2 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) return;
      this.glisse = true;
      // Une animation en cours (la table qui tourne vers le joueur suivant…) s'arrête là où elle en
      // est ; un simple clic, lui, la laisse finir.
      if (this.animation) {
        cancelAnimationFrame(this.animation);
        this.animation = null;
        this.camera = bornerCamera(this.vue);
      }
      this.conteneur.classList.add('manipulation');
      for (const id of this.pointeurs.keys()) {
        try {
          this.conteneur.setPointerCapture(id);
        } catch {
          // Pointeur déjà relâché.
        }
      }
    }
    const largeur = this.dims.largeur || 1;
    if (this.pointeurs.size >= 2) {
      // Deux doigts : pincer pour zoomer, glisser pour déplacer.
      const [a, b] = [...this.pointeurs.values()];
      const ecart = () => Math.hypot(a.x - b.x, a.y - b.y);
      const avant = { d: ecart(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      p.x = e.clientX;
      p.y = e.clientY;
      const apres = { d: ecart(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (avant.d > 0 && apres.d > 0) this.camera = zoomer(this.camera, apres.d / avant.d, this.viseEcran(apres.x, apres.y));
      this.camera = deplacer(this.camera, (apres.x - avant.x) / largeur, (apres.y - avant.y) / largeur);
    } else {
      const dx = (e.clientX - p.x) / largeur;
      const dy = (e.clientY - p.y) / largeur;
      p.x = e.clientX;
      p.y = e.clientY;
      this.camera = this.mode === 'deplacer' ? deplacer(this.camera, dx, dy) : orbiter(this.camera, dx, dy);
    }
    this.vue = { ...this.camera };
    this.planifierRendu();
  }

  surRelache(e) {
    if (!this.pointeurs.delete(e.pointerId) || this.pointeurs.size) return;
    this.conteneur.classList.remove('manipulation');
    if (this.suivi.enAttente) this.allerVersJoueur();
    if (!this.glisse) return;
    // Le clic qui suit un glisser ne doit pas ouvrir la fiche de la case survolée.
    this.clicBloque = true;
    setTimeout(() => { this.clicBloque = false; }, 0);
    this.enregistrer();
    ecrire(CLE_AIDE, 'vu');
    this.aide.classList.remove('visible');
  }

  surClic(e) {
    if (!this.clicBloque) return;
    this.clicBloque = false;
    e.stopPropagation();
    e.preventDefault();
  }

  surMolette(e) {
    if (!this.actif) return;
    e.preventDefault();
    const pas = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.camera = zoomer(this.camera, Math.exp(-pas * 0.0015), this.viseEcran(e.clientX, e.clientY));
    if (!this.animation) {
      this.vue = { ...this.camera };
      this.planifierRendu();
    }
    this.enregistrer();
  }
}

// ---------------------------------------------------------------------------
// Décor : la mer animée, le ponton et son écume, des bateaux qui tanguent
// ---------------------------------------------------------------------------

// Ordre de peinture : ce qui est à plat d'abord, de la mer à la table des joueurs, puis ce qui se
// tient debout. Une surface peinte après un élément debout serait découpée par son plan.
function decor(table) {
  // Chaque bateau se tient debout face à la caméra ; son flotteur tangue.
  const bateau = (classe, svg) => el('div', { class: `accessoire bateau ${classe}`, 'aria-hidden': 'true' }, el('div', { class: 'flotteur', html: svg }));
  return el('div', { class: 'decor' },
    el('div', { class: 'mer' },
      el('div', { class: 'vagues' }),
      el('div', { class: 'reflets' })),
    el('div', { class: 'ponton' }),
    el('div', { class: 'ombre-plateau' }),
    table,
    bateau('bateau-1', SVG_POINTU),
    bateau('bateau-2', SVG_VOILIER),
    bateau('bateau-3', SVG_POINTU.replace('#1f6fb5', '#c0392b').replace('#1f6fb5', '#c0392b')),
    bateau('bateau-4', SVG_VOILIER));
}

// Mouettes qui passent au-dessus de la Corniche.
function mouettes() {
  const mouette = (classe) => el('span', { class: `mouette ${classe}`, html: SVG_MOUETTE });
  return el('div', { class: 'mouettes' }, mouette('mouette-1'), mouette('mouette-2'), mouette('mouette-3'));
}

// Maison ou hôtel : un volume dont chaque face est un élément (murs, pignons, pans de toit) habillé
// d'une image ; les murs, transparents, laissent voir la couleur du propriétaire.
// À plat, la façade seule est dessinée (voir vue3d.css).
export function construction(hotel, couleur) {
  const face = (nom) => el('span', { class: `pan ${nom}` });
  const faces = hotel
    ? ['avant', 'arriere', 'gauche', 'droite', 'dessus'].map(face)
    : ['avant', 'arriere', 'gauche', 'droite', 'toit-avant', 'toit-arriere'].map(face);
  const batiment = el('span', { class: hotel ? 'batiment hotel' : 'batiment maison' }, ...faces);
  batiment.style.setProperty('--c', couleur);
  return batiment;
}

const SVG_POINTU = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="38" y="6" width="2.5" height="30" fill="#6b4a2b"/>
  <path d="M41 8 L62 34 L41 34Z" fill="#fff6e0" stroke="#c9b994"/>
  <path d="M2 34 L78 34 L68 46 L12 46Z" fill="#1f6fb5"/>
  <path d="M2 34 L78 34 L76 38 L4 38Z" fill="#f2c94c"/>
  <path d="M0 30 L6 34 L2 34Z M80 30 L74 34 L78 34Z" fill="#1f6fb5"/>
  <path d="M10 47 Q40 51 70 47" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
</svg>`;

const SVG_VOILIER = `<svg viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
  <rect x="33" y="2" width="2.5" height="52" fill="#555"/>
  <path d="M36 4 L64 52 L36 52Z" fill="#fff" stroke="#ccc"/>
  <path d="M32 12 L10 52 L32 52Z" fill="#f2f2f2" stroke="#ccc"/>
  <path d="M4 54 L66 54 L58 64 L12 64Z" fill="#fff" stroke="#9aa5ad"/>
  <path d="M10 65 Q35 69 60 65" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
</svg>`;

const SVG_MOUETTE = `<svg viewBox="0 0 40 16" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 10 Q11 1 20 9 Q29 1 38 10 Q29 5 20 12 Q11 5 2 10Z" fill="#fdfdfd" stroke="#6b7680" stroke-width="1"/>
</svg>`;
