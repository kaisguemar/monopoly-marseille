// Tour des joueurs ordinateur : leurs décisions sont temporisées pour que les humains puissent suivre.
import { Controleur } from './controleur.js';
import { modaleEstOuverte } from './modale.js';
import { deciderAction, actionsDeSecours } from '../moteur/ia.js';

export const VITESSES_IA = { lente: 1200, normale: 700, rapide: 250 };

Object.assign(Controleur.prototype, {
  delaiIA: VITESSES_IA.normale,

  jouerOrdinateur() {
    clearTimeout(this.minuteurIA);
    this.minuteurIA = setTimeout(() => this.actionOrdinateur(), this.delaiIA);
  },

  async actionOrdinateur() {
    if (this.arrete) return;
    // Attend que l'humain ait fermé sa fenêtre (fiche consultée, confirmation…).
    if (this.occupe || modaleEstOuverte()) {
      this.jouerOrdinateur();
      return;
    }
    const actif = this.partie.joueurActif();
    if (actif === null || !this.partie.etat.joueurs[actif].ia) return;
    if (await this.agir(deciderAction(this.partie))) return;
    // Ne devrait pas arriver : on se rabat sur une action toujours valable.
    for (const secours of actionsDeSecours(this.partie)) {
      if (await this.agir(secours)) return;
    }
  },

  arreter() {
    this.arrete = true;
    clearTimeout(this.minuteurIA);
    this.reseau?.client.fermer();
  }
});
