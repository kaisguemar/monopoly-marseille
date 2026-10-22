// Outils des tests du mode en ligne : clients simulés et attente de conditions.
import { Partie } from '../src/moteur/partie.js';
import { deciderAction } from '../src/moteur/ia.js';
import { donnees } from './aide.js';

// Attend qu'une condition devienne vraie (sondage toutes les 5 ms).
export async function attendreQue(condition, delai = 5000, message = 'condition') {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Délai dépassé en attendant : ${message}`);
}

// Client branché directement sur le GestionnaireSalons (sans HTTP).
export function clientDirect(salons, code, jeton) {
  const client = { messages: [], ferme: false };
  client.desabonner = salons.abonner(code, jeton, (m) => client.messages.push(structuredClone(m)), () => { client.ferme = true; });
  client.dernier = () => client.messages.at(-1);
  client.fermer = () => client.desabonner();
  return client;
}

// Client SSE réel : lit le flux /flux avec fetch et décode les messages.
export async function clientFlux(base, code, jeton) {
  const controleur = new AbortController();
  const reponse = await fetch(`${base}/api/salons/${code}/flux?jeton=${jeton}`, { signal: controleur.signal });
  const client = { statut: reponse.status, messages: [], ferme: false };
  if (reponse.status !== 200) {
    client.erreur = await reponse.json();
    return client;
  }
  (async () => {
    const lecteur = reponse.body.getReader();
    const decodeur = new TextDecoder();
    let tampon = '';
    try {
      for (;;) {
        const { value, done } = await lecteur.read();
        if (done) break;
        tampon += decodeur.decode(value, { stream: true });
        let fin;
        while ((fin = tampon.indexOf('\n\n')) >= 0) {
          const bloc = tampon.slice(0, fin);
          tampon = tampon.slice(fin + 2);
          const data = bloc.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
          if (data) client.messages.push(JSON.parse(data));
        }
      }
    } catch {
      // flux interrompu
    }
    client.ferme = true;
  })();
  client.dernier = () => client.messages.at(-1);
  client.fermer = () => controleur.abort();
  return client;
}

export async function poster(base, chemin, corps) {
  const reponse = await fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps ?? {})
  });
  return { statut: reponse.status, corps: await reponse.json() };
}

// Action que jouerait un humain « robot » à partir du dernier état reçu (null si ce n'est pas à lui).
export function actionDuRobot(message) {
  if (!message?.etat || message.etat.terminee) return null;
  const partie = Partie.restaurer(donnees, message.etat);
  if (partie.joueurActif() !== message.moi) return null;
  const { joueur, ...action } = deciderAction(partie);
  return action;
}
