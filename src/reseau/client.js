// Client du mode en ligne : requêtes vers l'API du serveur et flux de mises à jour (Server-Sent Events).
//
// La session (code du salon + jeton secret) est gardée dans sessionStorage (propre à l'onglet,
// survit au rechargement) et dans localStorage (survit à la fermeture du navigateur) :
// un joueur déconnecté par erreur retrouve automatiquement sa place.

const CLE_SESSION = 'monopoly-marseille:en-ligne';

function lireStockage(stockage) {
  try {
    const brut = window[stockage].getItem(CLE_SESSION);
    const session = brut && JSON.parse(brut);
    return session?.code && session?.jeton ? session : null;
  } catch {
    return null;
  }
}

// Session de cet onglet uniquement (rechargement de la page).
export function sessionOnglet() {
  return lireStockage('sessionStorage');
}

export function sessionEnregistree() {
  return lireStockage('sessionStorage') ?? lireStockage('localStorage');
}

function enregistrerSession(session) {
  for (const stockage of ['sessionStorage', 'localStorage']) {
    try {
      window[stockage].setItem(CLE_SESSION, JSON.stringify({ code: session.code, jeton: session.jeton }));
    } catch {
      // stockage indisponible : la reconnexion automatique ne sera pas possible
    }
  }
}

export function oublierSession() {
  for (const stockage of ['sessionStorage', 'localStorage']) {
    try {
      window[stockage].removeItem(CLE_SESSION);
    } catch {
      // rien à faire
    }
  }
}

export class ErreurReseau extends Error {
  constructor(message, statut = 0) {
    super(message);
    this.statut = statut;
  }
}

async function requete(methode, chemin, corps) {
  let reponse;
  try {
    reponse = await fetch(chemin, {
      method: methode,
      headers: corps ? { 'Content-Type': 'application/json' } : undefined,
      body: corps ? JSON.stringify(corps) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw new ErreurReseau('Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  let donnees = null;
  try {
    donnees = await reponse.json();
  } catch {
    // réponse sans JSON
  }
  if (!reponse.ok) throw new ErreurReseau(donnees?.erreur ?? `Erreur du serveur (${reponse.status}).`, reponse.status);
  return donnees;
}

// Le jeu est-il servi par le serveur Node (mode en ligne disponible) ?
export async function serveurDisponible() {
  try {
    return (await requete('GET', 'api/sante'))?.ok === true;
  } catch {
    return false;
  }
}

export class ClientEnLigne {
  constructor({ code, jeton }) {
    this.code = code;
    this.jeton = jeton;
    this.source = null;
    this.ferme = false;
  }

  static async creer(nom, pion) {
    const session = await requete('POST', 'api/salons', { nom, pion });
    enregistrerSession(session);
    return new ClientEnLigne(session);
  }

  static async rejoindre(code, { nom, pion, jeton } = {}) {
    const propre = String(code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(propre)) throw new ErreurReseau('Code de salon invalide.');
    const session = await requete('POST', `api/salons/${propre}/rejoindre`, { nom, pion, jeton });
    enregistrerSession(session);
    return new ClientEnLigne(session);
  }

  // Reconnexion à une session enregistrée (après un rechargement ou une coupure).
  static async reprendre(session) {
    return ClientEnLigne.rejoindre(session.code, { jeton: session.jeton });
  }

  envoyer(verbe, corps = {}) {
    return requete('POST', `api/salons/${this.code}/${verbe}`, { ...corps, jeton: this.jeton });
  }

  // Retourne { ok, erreur?, version } ; ne lève pas d'exception pour une action refusée par les règles.
  async envoyerAction(action) {
    const { joueur, ...sansJoueur } = action;
    try {
      return await this.envoyer('action', { action: sansJoueur });
    } catch (err) {
      return { ok: false, erreur: err.message };
    }
  }

  // Ouvre le flux de mises à jour. surConnexion reçoit 'connecte', 'reconnexion', 'introuvable' ou 'refuse'.
  connecter({ surMessage, surConnexion }) {
    this.surMessage = surMessage;
    this.surConnexion = surConnexion;
    this.ouvrirFlux();
  }

  ouvrirFlux() {
    if (this.ferme) return;
    this.source?.close();
    const source = new EventSource(`api/salons/${this.code}/flux?jeton=${encodeURIComponent(this.jeton)}`);
    this.source = source;
    source.onopen = () => this.surConnexion?.('connecte');
    source.onmessage = (ev) => {
      try {
        this.surMessage?.(JSON.parse(ev.data));
      } catch (err) {
        console.error('Message du serveur illisible :', err);
      }
    };
    source.onerror = () => {
      if (this.ferme || source !== this.source) return;
      if (source.readyState !== EventSource.CLOSED) {
        // Coupure réseau : EventSource se reconnecte tout seul.
        this.surConnexion?.('reconnexion');
        return;
      }
      // Le serveur a refusé le flux : salon disparu, place perdue, ou serveur injoignable.
      this.diagnostiquer();
    };
  }

  async diagnostiquer() {
    try {
      await requete('GET', `api/salons/${this.code}`);
      // Le salon existe : soit notre place n'existe plus, soit le refus était passager.
      try {
        await ClientEnLigne.rejoindre(this.code, { jeton: this.jeton });
        this.surConnexion?.('reconnexion');
        setTimeout(() => this.ouvrirFlux(), 1000);
      } catch (err) {
        if (err.statut) this.surConnexion?.('refuse');
        else setTimeout(() => this.ouvrirFlux(), 2000);
      }
    } catch (err) {
      if (err.statut === 404) {
        this.surConnexion?.('introuvable');
        return;
      }
      // Serveur injoignable : on réessaie régulièrement.
      this.surConnexion?.('reconnexion');
      setTimeout(() => this.ouvrirFlux(), 2000);
    }
  }

  fermer() {
    this.ferme = true;
    this.source?.close();
  }
}
