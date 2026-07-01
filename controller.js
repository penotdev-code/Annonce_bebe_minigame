/* ============================================================
   Bébé en Voyage — manette téléphone
   ============================================================ */

const $ = id => document.getElementById(id);

let peer = null;
let conn = null;
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

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myColor = msg.color;
      $('padName').textContent = '👶 ' + msg.name;
      $('flapBtn').style.background = myColor;
      document.body.style.background = myColor + '33';
      $('joinScreen').classList.add('hidden');
      $('padScreen').classList.remove('hidden');
      setPadStatus('En attente du lancement… 🕐');
      requestWakeLock();
      break;
    case 'rejected':
      backToJoin(msg.reason);
      break;
    case 'phase':
      onPhase(msg.phase);
      break;
    case 'youDied':
      setPadStatus('💥 Tu es tombé·e ! Tout le monde recommence…');
      vibrate([120, 60, 120]);
      $('padBaby').textContent = '😵';
      break;
    case 'reveal':
      setPadStatus(msg.answer === 'garcon' ? "C'EST UN GARÇON ! 💙" : "C'EST UNE FILLE ! 🩷");
      document.body.style.background = msg.answer === 'garcon' ? '#bfdbfe' : '#fbcfe8';
      $('padBaby').textContent = '🎉';
      vibrate([80, 50, 80, 50, 200]);
      break;
  }
}

function onPhase(phase) {
  switch (phase) {
    case 'lobby':
      setPadStatus('En attente du lancement… 🕐');
      $('padBaby').textContent = '👶';
      document.body.style.background = myColor + '33';
      break;
    case 'countdown':
      setPadStatus('Prépare-toi… 3, 2, 1 !');
      $('padBaby').textContent = '👶';
      vibrate(60);
      break;
    case 'playing':
      setPadStatus('VOLE ! Appuie pour sauter ⬆️');
      $('padBaby').textContent = '👶';
      break;
    case 'failed':
      setPadStatus('💥 Quelqu’un est tombé… on recommence !');
      break;
    case 'won':
      setPadStatus('🎉 Tout le monde est arrivé !');
      $('padBaby').textContent = '🥳';
      break;
  }
}

// gros bouton SAUTER
const flapBtn = $('flapBtn');
function flap(e) {
  e.preventDefault();
  if (conn && conn.open) conn.send({ type: 'flap' });
  vibrate(25);
  flapBtn.classList.add('pressed');
}
flapBtn.addEventListener('touchstart', flap, { passive: false });
flapBtn.addEventListener('mousedown', flap);
flapBtn.addEventListener('touchend', () => flapBtn.classList.remove('pressed'));
flapBtn.addEventListener('mouseup', () => flapBtn.classList.remove('pressed'));

function setPadStatus(t) { $('padStatus').textContent = t; }
function setJoinStatus(t) { $('joinStatus').textContent = t; }

function backToJoin(message) {
  if (peer) { peer.destroy(); peer = null; conn = null; }
  $('padScreen').classList.add('hidden');
  $('joinScreen').classList.remove('hidden');
  $('joinBtn').disabled = false;
  document.body.style.background = '';
  setJoinStatus(message || '');
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// empêcher l'écran de s'éteindre pendant la partie
async function requestWakeLock() {
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (e) { /* pas grave */ }
}
