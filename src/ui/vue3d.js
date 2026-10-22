// Vue 3D du plateau : une caméra que l'on fait tourner, incliner, zoomer et glisser, la mer animée
// autour du plateau, la Corniche à l'horizon, et des maisons et hôtels en volume, texturés,
// aux couleurs de leur propriétaire.
// La vue à plat reste la vue par défaut ; le choix de la vue et la position de la caméra sont
// mémorisés dans le navigateur.
import { el } from './utilitaires.js';
import {
  ECRAN, cameraParDefaut, bornerCamera, orbiter, deplacer, zoomer, interpoler, azimutDeFace,
  projeter, horizon, lireCamera, ecrireCamera
} from './camera3d.js';

const CLE_VUE = 'monopoly-marseille-vue3d';
const CLE_CAMERA = 'monopoly-marseille-camera3d';
const CLE_AIDE = 'monopoly-marseille-aide3d';

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

// Caméra de la partie affichée : sa position est enregistrée quand on quitte la page, même
// au milieu du délai d'enregistrement.
let cameraAffichee = null;
window.addEventListener('pagehide', () => cameraAffichee?.enregistrer(true));

// Point de vue de la vue à plat (plateau vu du dessus) : la vue 3D s'ouvre et se referme depuis lui.
const POSE_A_PLAT = Object.freeze({ inclinaison: 0, zoom: 1 / ECRAN.echelle, decalageX: 0, decalageY: -ECRAN.decalageY });

// Construit la scène dans `conteneur`. Renvoie l'élément qui accueillera le plateau
// et le bouton de bascule entre vue à plat et vue 3D, à placer dans l'interface.
export function creerScene(conteneur) {
  const plateau = el('div', { class: 'plateau' });
  // Horizon, mer et plateau sont trois calques peints l'un sur l'autre : mêlés dans une même
  // scène 3D, la mer et les cases se trient mal et des cases deviennent transparentes.
  const ciel = el('div', { class: 'horizon', 'aria-hidden': 'true' }, el('div', { class: 'nuages' }), mouettes());
  const sceneDecor = el('div', { class: 'scene scene-decor', 'aria-hidden': 'true' }, decor());
  const scene = el('div', { class: 'scene scene-plateau' },
    ...['avant', 'arriere', 'gauche', 'droite'].map((cote) => el('div', { class: `tranche tranche-${cote}`, 'aria-hidden': 'true' })),
    plateau);
  const camera = el('div', { class: 'camera' }, ciel, sceneDecor, scene);
  conteneur.prepend(camera);
  const controle = new Camera3D(conteneur, camera, { ciel, sceneDecor, scene });
  conteneur.append(controle.commandes, controle.aide);
  return { plateau, bouton: controle.bouton };
}

// Pilotage de la caméra : souris, doigts, molette et boutons. `camera` est la position voulue
// (mémorisée), `vue` celle qui est affichée (elles diffèrent pendant une animation).
class Camera3D {
  constructor(conteneur, elCamera, calques) {
    this.conteneur = conteneur;
    this.elCamera = elCamera;
    this.calques = calques;
    this.pointeurs = new Map();
    this.dims = { largeur: 0, hauteur: 0 };
    this.resolution = 1;
    this.camera = lireCamera(lire(CLE_CAMERA)) ?? cameraParDefaut(window.innerWidth);
    this.vue = { ...this.camera };
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
    new ResizeObserver(() => {
      this.mesurer();
      this.rendre();
    }).observe(elCamera);
    this.afficher(lire(CLE_VUE) === '1', false);
  }

  get actif() {
    return this.conteneur.classList.contains('vue-3d');
  }

  creerCommandes() {
    const bouton = (texte, titre, action) => el('button', { type: 'button', class: 'btn-camera', title: titre, 'aria-label': titre, onclick: action }, texte);
    const vers = (modif) => () => this.animerVers(bornerCamera({ ...this.camera, ...modif(this.camera) }));
    return el('div', { class: 'commandes-3d', role: 'toolbar', 'aria-label': 'Caméra de la vue 3D' },
      bouton('↺', 'Tourner le plateau vers la gauche', vers((c) => ({ azimut: c.azimut - 45 }))),
      bouton('↻', 'Tourner le plateau vers la droite', vers((c) => ({ azimut: c.azimut + 45 }))),
      bouton('▲', 'Incliner le plateau (vue plus rasante)', vers((c) => ({ inclinaison: c.inclinaison + 8 }))),
      bouton('▼', 'Redresser le plateau (vue plus plongeante)', vers((c) => ({ inclinaison: c.inclinaison - 8 }))),
      bouton('+', 'Zoomer', () => this.animerVers(zoomer(this.camera, 1.3, this.viseCentreVue()))),
      bouton('−', 'Dézoomer', () => this.animerVers(zoomer(this.camera, 1 / 1.3, this.viseCentreVue()))),
      bouton('⌖', 'Recentrer la vue', () => this.animerVers({ ...cameraParDefaut(window.innerWidth), azimut: azimutDeFace(this.camera.azimut) })));
  }

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  mesurer() {
    this.dims = { largeur: this.elCamera.clientWidth, hauteur: this.elCamera.clientHeight };
  }

  // Applique une position de caméra. Les transformations sont posées sur chaque calque, et
  // l'orientation « face à la caméra » sur les seuls éléments debout (pions, bateaux) : une
  // variable posée plus haut obligerait le navigateur à recalculer tout le plateau à chaque image.
  rendre(c = this.vue) {
    if (!this.actif) return;
    const { ciel, sceneDecor, scene } = this.calques;
    const transformation = (echelle) => `translate(${(c.decalageX * 100).toFixed(3)}cqi, ${((c.decalageY + ECRAN.decalageY) * 100).toFixed(3)}cqi) `
      + `rotateX(${c.inclinaison.toFixed(2)}deg) rotateZ(${c.azimut.toFixed(2)}deg) scale3d(${echelle}, ${echelle}, ${echelle})`;
    const echelle = ECRAN.echelle * c.zoom;
    sceneDecor.style.transform = transformation(echelle.toFixed(4));
    scene.style.transform = transformation((echelle / this.resolution).toFixed(4));
    const face = `rotateZ(${(-c.azimut).toFixed(2)}deg) rotateX(${(-c.inclinaison).toFixed(2)}deg)`;
    for (const debout of this.conteneur.querySelectorAll('.pions, .accessoire')) debout.style.setProperty('--face-camera', face);
    this.ajusterResolution(c.zoom);
    const { largeur, hauteur } = this.dims;
    if (!largeur) return;
    const h = horizon(c, hauteur / largeur);
    ciel.style.setProperty('--horizon-y', `${(h.y * largeur).toFixed(1)}px`);
    ciel.style.setProperty('--panorama-x', `${(h.decalage * largeur).toFixed(1)}px`);
  }

  // Résolution du plateau selon le zoom (voir .scene-plateau dans vue3d.css), avec une marge
  // pour ne pas basculer sans cesse. Elle change une fois la caméra immobile : remettre le plateau
  // en page prend un instant, mieux vaut ne pas le faire en plein geste.
  ajusterResolution(zoom) {
    const voulue = zoom > 1.5 ? 2 : zoom < 1.3 ? 1 : this.resolution;
    clearTimeout(this.minuteurResolution);
    if (voulue === this.resolution) return;
    this.minuteurResolution = setTimeout(() => {
      this.resolution = voulue;
      this.calques.scene.style.setProperty('--resolution', String(voulue));
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
      this.conteneur.classList.add('vue-3d');
      this.mesurer();
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
          this.conteneur.classList.remove('vue-3d');
          this.vue = { ...this.camera };
        }
      });
    } else {
      this.conteneur.classList.remove('vue-3d');
    }
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

  surAppui(e) {
    if (!this.actif || e.target.closest('.commandes-3d, .bulle-boisson')) return;
    if (e.pointerType === 'mouse' && e.button > 2) return;
    // Une animation en cours s'arrête là où elle en est.
    if (this.animation) {
      cancelAnimationFrame(this.animation);
      this.animation = null;
      this.camera = bornerCamera(this.vue);
    }
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
// Décor : la mer animée, l'écume autour du plateau et des bateaux qui tanguent
// ---------------------------------------------------------------------------

function decor() {
  // Chaque bateau se tient debout face à la caméra ; son flotteur tangue.
  const bateau = (classe, svg) => el('div', { class: `accessoire bateau ${classe}` }, el('div', { class: 'flotteur', html: svg }));
  return el('div', { class: 'decor' },
    el('div', { class: 'mer' },
      el('div', { class: 'vagues vagues-larges' }),
      el('div', { class: 'vagues vagues-fines' }),
      el('div', { class: 'reflets' })),
    el('div', { class: 'ombre-plateau' }),
    el('div', { class: 'ecume' }),
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
