// Pions marseillais dessinés en SVG (viewBox 0 0 40 40).

export const PIONS = [
  {
    id: 'pointu', nom: 'Pointu (bateau de pêche)', couleur: '#1565a8',
    svg: `<path d="M4 24 L36 24 L31 32 L9 32 Z" fill="#1565a8" stroke="#0b2f52" stroke-width="1.5"/>
      <path d="M8 24 L32 24" stroke="#f2c14e" stroke-width="2"/>
      <path d="M20 6 L20 24" stroke="#5b3a1e" stroke-width="2"/>
      <path d="M21 7 L31 21 L21 21 Z" fill="#fdfaf2" stroke="#8a7a5c" stroke-width="1"/>`
  },
  {
    id: 'ballon', nom: 'Ballon', couleur: '#2aa7df',
    svg: `<circle cx="20" cy="20" r="14" fill="#fdfdfd" stroke="#0b2f52" stroke-width="1.8"/>
      <path d="M20 12 L26 16 L24 23 L16 23 L14 16 Z" fill="#2aa7df" stroke="#0b2f52" stroke-width="1"/>
      <path d="M20 12 L20 7 M26 16 L32 14 M24 23 L28 29 M16 23 L12 29 M14 16 L8 14" stroke="#0b2f52" stroke-width="1.2"/>`
  },
  {
    id: 'cigale', nom: 'Cigale', couleur: '#5d7b2f',
    svg: `<ellipse cx="20" cy="22" rx="6" ry="12" fill="#5d4a2a" stroke="#2e2414" stroke-width="1.2"/>
      <path d="M19 14 C8 16 6 30 13 34 C16 30 18 24 19 18 Z" fill="#cde8d6" fill-opacity=".85" stroke="#4d6b3a"/>
      <path d="M21 14 C32 16 34 30 27 34 C24 30 22 24 21 18 Z" fill="#cde8d6" fill-opacity=".85" stroke="#4d6b3a"/>
      <circle cx="20" cy="10" r="4.5" fill="#5d7b2f" stroke="#2e2414"/>
      <circle cx="17.5" cy="9" r="1.3" fill="#1b1b1b"/><circle cx="22.5" cy="9" r="1.3" fill="#1b1b1b"/>`
  },
  {
    id: 'savon', nom: 'Savon de Marseille', couleur: '#7f9a3c',
    svg: `<path d="M6 16 L20 9 L34 16 L20 23 Z" fill="#b7c96a" stroke="#4f6020" stroke-width="1.2"/>
      <path d="M6 16 L6 27 L20 34 L20 23 Z" fill="#8fa646" stroke="#4f6020" stroke-width="1.2"/>
      <path d="M34 16 L34 27 L20 34 L20 23 Z" fill="#7f9a3c" stroke="#4f6020" stroke-width="1.2"/>
      <path d="M11 18 L18 21.5 M12 21 L17 23.5" stroke="#4f6020" stroke-width="1"/>`
  },
  {
    id: 'navette', nom: 'Navette', couleur: '#d9a441',
    svg: `<path d="M4 21 C10 11 30 11 36 21 C30 29 10 29 4 21 Z" fill="#e7b964" stroke="#8a5a1a" stroke-width="1.5"/>
      <path d="M9 21 C15 18 25 18 31 21" stroke="#8a5a1a" stroke-width="1.8" fill="none"/>`
  },
  {
    id: 'sardine', nom: 'Sardine', couleur: '#6b8fa8',
    svg: `<path d="M5 20 C11 11 25 11 31 20 C25 28 11 28 5 20 Z" fill="#9db8cc" stroke="#33536b" stroke-width="1.5"/>
      <path d="M30 20 L37 13 L37 27 Z" fill="#6b8fa8" stroke="#33536b" stroke-width="1.3"/>
      <circle cx="11" cy="19" r="1.6" fill="#1b1b1b"/>
      <path d="M14 15 C16 18 16 22 14 25" stroke="#33536b" fill="none"/>`
  }
];

export const pionParId = (id) => PIONS.find((p) => p.id === id) ?? PIONS[0];

// Couleurs d'identification des joueurs (bordure du pion, panneau).
export const COULEURS_JOUEURS = ['#c0392b', '#1f6fb5', '#2e8b57', '#8e44ad', '#d35400', '#34495e'];

export function svgPion(id, taille = 40) {
  const pion = pionParId(id);
  return `<svg viewBox="0 0 40 40" width="${taille}" height="${taille}" aria-hidden="true" focusable="false">${pion.svg}</svg>`;
}
