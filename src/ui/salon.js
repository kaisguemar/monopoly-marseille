// Salon d'attente du mode en ligne : code à partager, joueurs connectés, réglages de l'hôte.
import { el } from './utilitaires.js';
import { svgPion, COULEURS_JOUEURS } from './pions.js';
import { choixModeDeJeu } from './accueil.js';

// Affiche (ou redessine) le salon à partir du dernier message du serveur.
// client : ClientEnLigne ; surQuitter() : retour à l'accueil.
export function afficherSalon(racine, { message, client, surQuitter, connexion = 'connecte' }) {
  const { salon, moi } = message;
  const estHote = salon.hote === moi;
  const lien = `${location.origin}${location.pathname}?salon=${salon.code}`;
  const zoneErreur = el('p', { class: 'alerte', role: 'alert', hidden: true });

  const action = async (verbe, corps) => {
    zoneErreur.hidden = true;
    try {
      await client.envoyer(verbe, corps);
    } catch (err) {
      zoneErreur.textContent = err.message;
      zoneErreur.hidden = false;
    }
  };

  const copier = async (bouton) => {
    try {
      await navigator.clipboard.writeText(lien);
      bouton.textContent = 'Lien copié ✓';
    } catch {
      bouton.textContent = 'Copie impossible : sélectionnez le lien';
    }
  };

  const ligne = (p) => {
    const etiquettes = [];
    if (p.id === moi) etiquettes.push('vous');
    if (p.id === salon.hote) etiquettes.push('hôte');
    const statut = p.ia ? '🤖 Ordinateur' : p.connecte ? '🟢 Connecté' : '⚪ Déconnecté';
    return el('li', { class: 'ligne-salon', style: { borderColor: COULEURS_JOUEURS[p.id] } },
      el('span', { class: 'avatar', style: { borderColor: COULEURS_JOUEURS[p.id] }, html: svgPion(p.pion, 30) }),
      el('span', { class: 'nom-joueur' }, p.nom, etiquettes.length ? el('small', {}, ` (${etiquettes.join(', ')})`) : null),
      el('span', { class: 'statut-salon' }, statut),
      estHote && p.id !== salon.hote
        ? el('button', { type: 'button', class: 'btn btn-petit', 'aria-label': `Retirer ${p.nom}`, onclick: () => action('retirer', { place: p.id }) }, 'Retirer')
        : null);
  };

  const option = (cle, libelle) => el('label', { class: 'option' },
    el('input', {
      type: 'checkbox', checked: salon.options[cle], disabled: !estHote,
      onchange: (ev) => action('options', { options: { [cle]: ev.target.checked } })
    }),
    el('span', {}, libelle));

  const complet = salon.places.length >= 6;
  racine.replaceChildren(el('div', { class: 'accueil salon' },
    el('header', { class: 'accueil-entete' },
      el('h1', {}, 'Salon en ligne'),
      el('p', { class: 'code-salon' }, 'Code : ', el('strong', {}, salon.code))),
    connexion !== 'connecte' ? el('p', { class: 'alerte', role: 'status' }, 'Connexion au serveur perdue… reconnexion en cours.') : null,
    el('section', { class: 'formulaire-accueil' },
      el('h2', {}, 'Invitez vos amis'),
      el('p', {}, 'Envoyez-leur ce lien, ou donnez-leur le code du salon à saisir sur l\'écran d\'accueil :'),
      el('p', { class: 'lien-salon' },
        el('input', { type: 'text', readonly: true, value: lien, 'aria-label': 'Lien d\'invitation', onfocus: (ev) => ev.target.select() }),
        el('button', { type: 'button', class: 'btn', onclick: (ev) => copier(ev.currentTarget) }, 'Copier le lien')),
      el('h2', {}, `Joueurs (${salon.places.length}/6)`),
      el('ul', { class: 'liste-salon' }, salon.places.map(ligne)),
      estHote && !complet
        ? el('button', { type: 'button', class: 'btn', onclick: () => action('ordinateur') }, '🤖 Ajouter un ordinateur')
        : null,
      choixModeDeJeu(!!salon.options.pastis, (pastis) => action('options', { options: { pastis } }), estHote),
      el('h2', {}, 'Règles de la maison'),
      option('parcGratuit', 'Cagnotte du Trottoir gratuit'),
      option('doubleDepart', 'Double salaire sur Départ'),
      option('partieRapide', 'Partie rapide'),
      salon.options.partieRapide ? el('label', { class: 'champ champ-ligne' }, el('span', {}, 'Nombre de tours '),
        el('input', {
          type: 'number', min: 5, max: 200, value: salon.options.toursMax, disabled: !estHote,
          onchange: (ev) => action('options', { options: { toursMax: Number(ev.target.value) } })
        })) : null,
      zoneErreur,
      el('div', { class: 'boutons-accueil' },
        estHote
          ? el('button', { type: 'button', class: 'btn btn-principal btn-grand', disabled: salon.places.length < 2, onclick: () => action('demarrer') },
            salon.places.length < 2 ? 'En attente d\'un deuxième joueur…' : '⛵ Lancer la partie')
          : el('p', { class: 'reflexion' }, `En attente du lancement par ${salon.places[salon.hote]?.nom ?? 'l\'hôte'}…`),
        el('button', {
          type: 'button', class: 'btn btn-danger',
          onclick: async () => {
            await action('quitter');
            surQuitter();
          }
        }, 'Quitter le salon')))));
}
