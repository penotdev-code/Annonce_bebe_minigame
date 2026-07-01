# 👶✈️ Bébé en Voyage — mini-jeu d'annonce

Un mini-jeu multijoueur façon *Flappy Bird* pour annoncer le sexe du bébé :
le jeu s'affiche sur une TV, et chaque invité contrôle son bébé volant
depuis son téléphone avec un gros bouton **SAUTER**.

- 🛋️ **Écran TV** : ouvre la salle, affiche le QR code, les réglages et le jeu.
- 📱 **Téléphones** : scannent le QR code et servent de manettes.
- 🏁 Si **tous** les joueurs arrivent au bout du voyage → 🎉 révélation : **garçon 💙 ou fille 🩷**.
- 💥 Si **un seul** joueur tombe → tout le monde recommence !

Aucun serveur nécessaire : le site est 100 % statique (hébergeable sur GitHub Pages),
la synchronisation entre la TV et les téléphones passe par WebRTC (PeerJS).

## 🚀 Mise en ligne sur GitHub Pages

1. Sur GitHub, va dans **Settings → Pages** du dépôt.
2. Dans **Source**, choisis **GitHub Actions**.
3. Pousse (ou merge) sur la branche `main` : le workflow `.github/workflows/pages.yml`
   déploie automatiquement le site.
4. Le jeu est alors accessible sur `https://<ton-user>.github.io/Annonce_bebe_minigame/`.

## 🎮 Comment jouer

1. **Sur la TV** (ou un ordi branché à la TV) : ouvre l'URL du site → c'est l'écran de jeu.
2. Chaque invité **scanne le QR code** avec son téléphone (ou tape le code à 4 lettres
   sur `…/controller.html`), entre son prénom et rejoint.
3. Sur la TV, règle :
   - **Longueur du voyage** : court / moyen / long ;
   - **Difficulté** : facile / moyen / difficile ;
   - **La surprise 🤫** : tape `garcon` ou `fille` (champ masqué, personne ne le voit à l'écran).
4. Clique sur **🚀 Lancer le voyage !**
5. Chaque joueur appuie sur son bouton pour faire voler son bébé entre les biberons
   et les cubes. Si quelqu'un tombe, tout le monde repart du début. Quand tout le
   monde franchit la ligne d'arrivée… 🥁 la révélation s'affiche avec les confettis !

Astuce : le bouton « + Joueur clavier » sur l'écran TV ajoute un joueur contrôlé
avec la barre **Espace**, pratique pour tester tout seul.

## 🔧 Détails techniques

| Fichier | Rôle |
|---|---|
| `index.html` + `host.js` | Écran TV : salle, lobby, réglages, révélation |
| `game.js` | Moteur du jeu (physique, obstacles, rendu canvas) |
| `controller.html` + `controller.js` | Manette téléphone |
| `style.css` | Styles communs |
| `vendor/` | Librairies embarquées (PeerJS, générateur de QR code) — aucun CDN requis |

- Jusqu'à **8 joueurs** simultanés.
- La connexion utilise le serveur de signalisation public gratuit de
  [PeerJS](https://peerjs.com) ; ensuite les données passent en direct (WebRTC).
- TV et téléphones doivent avoir accès à Internet (pas besoin d'être sur le même Wi-Fi,
  mais c'est plus fluide si c'est le cas).
