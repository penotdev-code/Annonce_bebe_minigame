/* ============================================================
   Bébé en Voyage — téléphone joueur
   Affiche le jeu en direct (reçu de la TV) et saute quand on
   touche l'écran. À jouer en mode paysage.
   ============================================================ */

const $ = id => document.getElementById(id);

let peer = null;
let conn = null;
let remoteGame = null;
let myColor = '#ff6b6b';

// pré-remplissage depuis le QR code (?room=XXXX)
const params = new URLSearchParams(location.search);
if (params.get('room')) {
  $('roomInput').value = params.get('room').toUpperCase();
}
const savedName = localStorage.getItem('bebe-name');
if (savedName) $('nameInput').value = savedName;

$('joinBtn').addEventListener('click', join);
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

function join() {
  const code = $('roomInput').value.trim().toUpperCase();
  const name = $('nameInput').value.trim() || 'Bébé';
  if (code.length !== 4) { setJoinStatus('Entre le code à 4 lettres affiché sur la TV'); return; }
  localStorage.setItem('bebe-name', name);
  setJoinStatus('Connexion…');
  $('joinBtn').disabled = true;
  goLandscapeFullscreen(); // doit être déclenché par le geste de l'utilisateur

  peer = new Peer(window.PEER_OPTS || undefined);
  peer.on('open', () => {
    conn = peer.connect('bebe-voyage-' + code, { reliable: true });
    conn.on('open', () => conn.send({ type: 'join', name }));
    conn.on('data', handleMessage);
    conn.on('close', () => backToJoin('Connexion perdue, réessaie !'));
  });
  peer.on('error', err => {
    if (err.type === 'peer-unavailable') backToJoin('Salle introuvable, vérifie le code !');
    else backToJoin('Erreur réseau (' + err.type + '), réessaie !');
  });
}

async function goLandscapeFullscreen() {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) { /* iOS ne le permet pas : l'indice "tourne ton téléphone" prend le relais */ }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myColor = msg.color;
      $('hudName').textContent = '👶 ' + msg.name;
      $('hudName').style.background = myColor;
      $('joinScreen').classList.add('hidden');
      $('playScreen').classList.remove('hidden');
      if (!remoteGame) {
        remoteGame = new Game($('playCanvas'), 'remote');
        remoteGame.selfId = peer.id;
        remoteGame.resize();
      }
      setStatus('En attente du lancement… 🕐');
      requestWakeLock();
      break;
    case 'rejected':
      backToJoin(msg.reason);
      break;
    case 'course':
      if (remoteGame) remoteGame.setCourse(msg.course);
      break;
    case 'st':
      if (remoteGame) remoteGame.applyState(msg.st);
      break;
    case 'phase':
      onPhase(msg);
      break;
    case 'youDied':
      setStatus('💥 Tu es tombé·e !');
      vibrate([120, 60, 120]);
      break;
    case 'reveal':
      showReveal(msg.answer);
      break;
  }
}

function onPhase(msg) {
  if (remoteGame) remoteGame.setPhase(msg.phase, msg);
  hideBanner();
  switch (msg.phase) {
    case 'lobby':
      setStatus('En attente du lancement… 🕐');
      $('phoneReveal').classList.add('hidden');
      document.body.style.background = '';
      break;
    case 'countdown':
      setStatus('Prépare-toi…');
      $('phoneReveal').classList.add('hidden');
      vibrate(60);
      break;
    case 'playing':
      setStatus('COURS ! Touche l’écran pour sauter ⬆️');
      break;
    case 'failed':
      setStatus('On recommence…');
      showBanner('💥 ' + (msg.name ? '<strong>' + escapeHtml(msg.name) + '</strong> est tombé·e !' : 'Quelqu’un est tombé !') + '<br>Tout le monde recommence 🍼');
      break;
    case 'won':
      setStatus('🎉 Tout le monde est arrivé !');
      break;
  }
}

// ---------- saut : toucher l'écran (ou espace au clavier) ----------
function jump(e) {
  if (e) e.preventDefault();
  if (conn && conn.open) conn.send({ type: 'jump' });
  vibrate(20);
}
$('playScreen').addEventListener('touchstart', jump, { passive: false });
$('playScreen').addEventListener('mousedown', jump);
window.addEventListener('keydown', e => { if (e.code === 'Space') jump(e); });

// ---------- révélation ----------
function showReveal(answer) {
  const boy = answer === 'garcon';
  $('phoneRevealText').innerHTML = boy ? "C'EST UN<br>GARÇON&nbsp;! 💙" : "C'EST UNE<br>FILLE&nbsp;! 🩷";
  $('phoneReveal').style.background = boy ? '#bfdbfe' : '#fbcfe8';
  $('phoneReveal').classList.remove('hidden');
  vibrate([80, 50, 80, 50, 200]);
}

// ---------- petites aides ----------
function setStatus(t) { $('hudStatus').textContent = t; }
function setJoinStatus(t) { $('joinStatus').textContent = t; }

let bannerTimer = null;
function showBanner(html) {
  const b = $('phoneBanner');
  b.innerHTML = html;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, 2800);
}
function hideBanner() { $('phoneBanner').classList.add('hidden'); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function backToJoin(message) {
  if (peer) { peer.destroy(); peer = null; conn = null; }
  $('playScreen').classList.add('hidden');
  $('joinScreen').classList.remove('hidden');
  $('joinBtn').disabled = false;
  setJoinStatus(message || '');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// empêcher l'écran de s'éteindre pendant la partie
async function requestWakeLock() {
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (e) { /* pas grave */ }
}
