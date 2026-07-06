/* ============================================================
   Bébé en Voyage — écran TV : salle, connexions téléphones (PeerJS),
   lancement du jeu et révélation finale.
   ============================================================ */

const $ = id => document.getElementById(id);

// ---------- état ----------
const roomCode = makeCode(4);
const players = new Map(); // id -> {id, name, color, conn|null}
let reveal = null;         // 'garcon' | 'fille'
let peer = null;
let game = null;
let keyboardPlayerAdded = false;

// ---------- salle PeerJS ----------
function makeCode(n) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans caractères ambigus
  let c = '';
  for (let i = 0; i < n; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function initPeer() {
  // window.PEER_OPTS permet de pointer vers un serveur PeerJS local (tests)
  peer = new Peer('bebe-voyage-' + roomCode, window.PEER_OPTS || undefined);
  peer.on('open', () => {
    $('connStatus').textContent = '✅ Salle ouverte, en attente des joueurs';
    $('connStatus').classList.add('ok');
    showJoinInfo();
  });
  peer.on('connection', conn => {
    conn.on('data', msg => handleMessage(conn, msg));
    conn.on('close', () => dropConnection(conn));
    conn.on('error', () => dropConnection(conn));
  });
  peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      location.reload(); // code déjà pris, on retente avec un nouveau
    } else if (err.type !== 'peer-unavailable') {
      $('connStatus').textContent = '⚠️ Erreur réseau (' + err.type + '), rechargez la page';
    }
  });
}

function showJoinInfo() {
  const url = new URL('controller.html', location.href);
  url.searchParams.set('room', roomCode);
  $('roomCodeLabel').textContent = roomCode;
  $('joinUrlLabel').textContent = url.href.replace(/^https?:\/\//, '');
  const qr = qrcode(0, 'M');
  qr.addData(url.href);
  qr.make();
  $('qrcode').innerHTML = qr.createImgTag(5, 8);
}

function handleMessage(conn, msg) {
  if (msg.type === 'join') {
    if (game && game.phase !== 'idle' && game.phase !== 'won') {
      conn.send({ type: 'rejected', reason: 'Partie en cours, attendez la fin !' });
      return;
    }
    if (players.size >= 8) {
      conn.send({ type: 'rejected', reason: 'La salle est pleine (8 joueurs max) !' });
      return;
    }
    const color = PLAYER_COLORS[players.size % PLAYER_COLORS.length];
    const name = String(msg.name || 'Bébé').slice(0, 12);
    players.set(conn.peer, { id: conn.peer, name, color, conn });
    conn.send({ type: 'joined', name, color });
    refreshLobby();
  } else if (msg.type === 'jump') {
    if (game) game.jump(conn.peer);
  }
}

function dropConnection(conn) {
  if (!players.has(conn.peer)) return;
  const p = players.get(conn.peer);
  players.delete(conn.peer);
  if (game && game.phase !== 'idle') {
    game.removePlayer(conn.peer);
    broadcast({ type: 'course', course: game.serializeCourse() });
    showBanner('📵 ' + p.name + ' a quitté la partie', 2500);
  }
  refreshLobby();
}

function broadcast(msg) {
  for (const p of players.values()) {
    if (p.conn && p.conn.open) p.conn.send(msg);
  }
}

// ---------- lobby ----------
function refreshLobby() {
  $('playerCount').textContent = players.size;
  const ul = $('playerList');
  ul.innerHTML = '';
  for (const p of players.values()) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span> 👶 ${escapeHtml(p.name)}`;
    ul.appendChild(li);
  }
  updateStartButton();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateStartButton() {
  $('startBtn').disabled = !(players.size >= 1 && reveal);
}

$('setReveal').addEventListener('input', e => {
  const v = e.target.value.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (v === 'garcon' || v === 'boy') reveal = 'garcon';
  else if (v === 'fille' || v === 'girl') reveal = 'fille';
  else reveal = null;
  $('revealStatus').textContent = reveal ? '✅ Surprise enregistrée 🤫' : '❌ Surprise non définie';
  $('revealStatus').classList.toggle('ok', !!reveal);
  updateStartButton();
});

$('addTestPlayer').addEventListener('click', () => {
  if (keyboardPlayerAdded) return;
  keyboardPlayerAdded = true;
  players.set('local', { id: 'local', name: 'Clavier', color: PLAYER_COLORS[players.size % PLAYER_COLORS.length], conn: null });
  refreshLobby();
});

window.addEventListener('keydown', e => {
  if (e.code === 'Space' && game) { e.preventDefault(); game.jump('local'); }
});

// ---------- déroulement de la partie ----------
$('startBtn').addEventListener('click', startGame);

let stateTimer = null;

function startGame() {
  $('lobby').classList.add('hidden');
  $('reveal').classList.add('hidden');
  $('game').classList.remove('hidden');

  if (!game) {
    game = new Game($('gameCanvas'), 'host');
    game.onRoundFailed = onRoundFailed;
    game.onGameWon = onGameWon;
    game.onPhase = sendPhase;
    game.resize();
  }
  const infos = [...players.values()].map(p => ({ id: p.id, name: p.name, color: p.color }));
  game.setup($('setLength').value, $('setDifficulty').value, infos);
  broadcast({ type: 'course', course: game.serializeCourse() });
  sendPhase(game.phase);

  // diffusion de l'état aux téléphones (~25 Hz)
  clearInterval(stateTimer);
  stateTimer = setInterval(() => {
    if (game.phase === 'playing' || game.phase === 'countdown') {
      broadcast({ type: 'st', st: game.snapshot() });
    }
  }, 40);
}

function sendPhase(phase) {
  const msg = { type: 'phase', phase };
  if (phase === 'countdown') {
    msg.t = Math.max(0, Math.round(game.countdownEnd - performance.now()));
    broadcast({ type: 'course', course: game.serializeCourse() });
  }
  if (phase === 'failed' && game.failedPlayer) msg.name = game.failedPlayer.name;
  broadcast(msg);
}

function onRoundFailed(player) {
  showBanner('💥 Oh non, <strong>' + escapeHtml(player.name) + '</strong> est tombé·e !<br>Tout le monde recommence… 🍼', 2800);
  const p = players.get(player.id);
  if (p && p.conn && p.conn.open) p.conn.send({ type: 'youDied' });
}

function onGameWon() {
  showBanner('🎉 Tous les bébés sont arrivés ! 🎉', 2200);
  setTimeout(showReveal, 2400);
}

let bannerTimer = null;
function showBanner(html, ms) {
  const b = $('banner');
  b.innerHTML = html;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}

// ---------- révélation ----------
function showReveal() {
  $('game').classList.add('hidden');
  $('reveal').classList.remove('hidden');
  $('revealDrum').classList.remove('hidden');
  $('revealAnswer').classList.add('hidden');
  $('replayBtn').classList.add('hidden');
  document.body.classList.remove('boy', 'girl');

  // roulement de tambour puis réponse
  let dots = 0;
  const drum = setInterval(() => {
    dots = (dots + 1) % 4;
    $('revealDrum').textContent = 'Le bébé sera' + '.'.repeat(dots + 1);
  }, 400);

  setTimeout(() => {
    clearInterval(drum);
    $('revealDrum').classList.add('hidden');
    const boy = reveal === 'garcon';
    const ans = $('revealAnswer');
    ans.innerHTML = boy ? 'UN GARÇON&nbsp;! 💙' : 'UNE FILLE&nbsp;! 🩷';
    ans.classList.remove('hidden');
    document.body.classList.add(boy ? 'boy' : 'girl');
    broadcast({ type: 'reveal', answer: reveal });
    startConfetti(boy ? ['#7ec3f0', '#3b82f6', '#bfdbfe', '#ffffff']
                      : ['#f9a8d4', '#ec4899', '#fbcfe8', '#ffffff']);
    setTimeout(() => $('replayBtn').classList.remove('hidden'), 3000);
  }, 3500);
}

$('replayBtn').addEventListener('click', () => {
  stopConfetti();
  clearInterval(stateTimer);
  document.body.classList.remove('boy', 'girl');
  $('reveal').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  if (game) game.phase = 'idle';
  broadcast({ type: 'phase', phase: 'lobby' });
  refreshLobby();
});

// ---------- confettis ----------
let confettiRunning = false;
function startConfetti(colors) {
  const canvas = $('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const parts = [];
  for (let i = 0; i < 220; i++) {
    parts.push({
      x: Math.random() * canvas.width, y: -Math.random() * canvas.height,
      w: 8 + Math.random() * 10, h: 12 + Math.random() * 12,
      vy: 90 + Math.random() * 160, vx: (Math.random() - 0.5) * 60,
      rot: Math.random() * 7, vr: (Math.random() - 0.5) * 6,
      color: colors[i % colors.length],
    });
  }
  confettiRunning = true;
  let last = performance.now();
  (function tick(now) {
    if (!confettiRunning) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt;
      if (p.y > canvas.height + 30) { p.y = -30; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(tick);
  })(last);
}
function stopConfetti() { confettiRunning = false; }

// ---------- démarrage ----------
initPeer();
