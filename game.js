/* ============================================================
   Bébé en Voyage — moteur de jeu façon "dino de Chrome"
   Les bébés courent et sautent par-dessus les jouets.
   Deux modes :
     - 'host'   : la TV simule la physique et diffuse l'état
     - 'remote' : le téléphone affiche le jeu reçu du host
   ============================================================ */

const GameConfig = {
  lengths: {
    court: { obstacles: 12 },
    moyen: { obstacles: 22 },
    long:  { obstacles: 36 },
  },
  difficulties: {
    facile:    { speed: 380, spacingMin: 560, spacingVar: 320, size: 0.85 },
    moyen:     { speed: 470, spacingMin: 480, spacingVar: 280, size: 1.0 },
    difficile: { speed: 570, spacingMin: 430, spacingVar: 240, size: 1.12 },
  },
};

const PLAYER_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#a78bfa',
                       '#f97316', '#22c55e', '#ec4899', '#38bdf8'];

const H = 900;                 // hauteur logique du monde
const GROUND_Y = H - 130;      // sol
const GRAVITY = 3000;
const JUMP_V = -1180;
const BABY_W = 58, BABY_H = 66; // boîte de collision du bébé

// Obstacles jouets : hauteur [min,max], largeur = h * wr * répétitions
const OBSTACLE_KINDS = [
  { e: '🧸', h: [75, 105], wr: 1.0, repeat: 1 },
  { e: '🦆', h: [55, 70],  wr: 0.95, repeat: 3 },
  { e: '🍼', h: [85, 115], wr: 0.75, repeat: 1 },
  { e: '🎁', h: [70, 100], wr: 1.0, repeat: 1 },
  { e: '🚂', h: [70, 95],  wr: 1.5, repeat: 1 },
  { e: '🪁', h: [60, 80],  wr: 1.0, repeat: 2 },
];

class Game {
  constructor(canvas, mode) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = mode || 'host';
    this.players = [];   // {id,name,color,xOffset,y,vy,alive,finished,deadAt}
    this.obstacles = []; // {x,w,h,e}
    this.phase = 'idle'; // idle | countdown | playing | failed | won
    this.worldX = 0;
    this.speed = 0;
    this.finishX = 1;
    this.selfId = null;  // sur téléphone : id du joueur local à mettre en avant
    this.onRoundFailed = null;
    this.onGameWon = null;
    this.onPhase = null;
    this.lastTime = 0;
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      this.clouds.push({ x: Math.random() * 2400, y: 50 + Math.random() * 380,
                         s: 0.5 + Math.random() * 0.9, v: 12 + Math.random() * 18 });
    }
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame(t => this.loop(t));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.scale = this.canvas.height / H;
    this.W = this.canvas.width / this.scale; // largeur logique
  }

  // ---------- côté host : création du parcours ----------
  setup(lengthKey, difficultyKey, playerInfos) {
    const len = GameConfig.lengths[lengthKey] || GameConfig.lengths.moyen;
    const diff = GameConfig.difficulties[difficultyKey] || GameConfig.difficulties.moyen;
    this.speed = diff.speed;
    this.obstacles = [];
    let x = 1400;
    for (let i = 0; i < len.obstacles; i++) {
      const k = OBSTACLE_KINDS[Math.floor(Math.random() * OBSTACLE_KINDS.length)];
      const h = Math.round((k.h[0] + Math.random() * (k.h[1] - k.h[0])) * diff.size);
      const n = 1 + Math.floor(Math.random() * k.repeat);
      const w = Math.round(h * k.wr * n);
      this.obstacles.push({ x, w, h, e: k.e, n });
      x += diff.spacingMin + Math.random() * diff.spacingVar + w;
    }
    this.finishX = x + 500;
    this.players = playerInfos.map((p, i) => ({
      ...p, xOffset: 180 + i * 64, y: GROUND_Y, vy: 0,
      alive: true, finished: false, deadAt: 0,
    }));
    this.resetRound();
  }

  resetRound() {
    this.worldX = 0;
    this.failedPlayer = null;
    for (const p of this.players) {
      p.y = GROUND_Y; p.vy = 0; p.alive = true; p.finished = false;
    }
    this.startCountdown();
  }

  startCountdown() {
    this.phase = 'countdown';
    this.countdownEnd = performance.now() + 3200;
    this.emitPhase();
  }

  emitPhase() { if (this.onPhase) this.onPhase(this.phase); }

  jump(playerId) {
    if (this.phase !== 'playing') return;
    const p = this.players.find(p => p.id === playerId);
    if (p && p.alive && !p.finished && p.y >= GROUND_Y - 1) p.vy = JUMP_V;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    if (this.phase === 'playing' && this.players.length &&
        this.players.every(p => p.finished)) this.win();
  }

  // ---------- synchro réseau ----------
  serializeCourse() {
    return {
      obstacles: this.obstacles.map(o => [o.x, o.w, o.h, o.e]),
      finishX: this.finishX,
      speed: this.speed,
      players: this.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
    };
  }

  setCourse(c) { // téléphone
    this.obstacles = c.obstacles.map(a => ({ x: a[0], w: a[1], h: a[2], e: a[3] }));
    this.finishX = c.finishX;
    this.speed = c.speed;
    const old = new Map(this.players.map(p => [p.id, p]));
    this.players = c.players.map((p, i) => {
      const prev = old.get(p.id);
      return { ...p, xOffset: 180 + i * 64,
               y: prev ? prev.y : GROUND_Y, ty: prev ? prev.ty : GROUND_Y,
               vy: 0, alive: prev ? prev.alive : true,
               finished: prev ? prev.finished : false, deadAt: prev ? prev.deadAt : 0 };
    });
  }

  snapshot() { // host → téléphones (~25 Hz)
    const p = {};
    for (const pl of this.players) {
      p[pl.id] = [Math.round(pl.y), pl.alive ? (pl.finished ? 2 : 0) : 1];
    }
    return { w: Math.round(this.worldX), p };
  }

  applyState(st) { // téléphone
    this.targetWorldX = st.w;
    for (const pl of this.players) {
      const s = st.p[pl.id];
      if (!s) continue;
      pl.ty = s[0];
      const wasAlive = pl.alive;
      pl.alive = s[1] !== 1;
      pl.finished = s[1] === 2;
      if (wasAlive && !pl.alive) pl.deadAt = performance.now();
    }
  }

  setPhase(phase, extra) { // téléphone
    this.phase = phase;
    if (phase === 'countdown') {
      this.countdownEnd = performance.now() + (extra && extra.t ? extra.t : 3200);
      this.worldX = 0; this.targetWorldX = 0;
      for (const p of this.players) {
        p.y = GROUND_Y; p.ty = GROUND_Y; p.alive = true; p.finished = false;
      }
    }
  }

  // ---------- boucle ----------
  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    if (this.mode === 'host') this.update(dt, t);
    else this.remoteUpdate(dt, t);
    this.draw(t);
    requestAnimationFrame(tt => this.loop(tt));
  }

  update(dt, now) {
    this.moveClouds(dt);
    if (this.phase === 'countdown' && now >= this.countdownEnd) {
      this.phase = 'playing';
      this.emitPhase();
    }
    if (this.phase !== 'playing') return;

    this.worldX += this.speed * dt;

    for (const p of this.players) {
      if (!p.alive || p.finished) continue;
      // physique du saut
      if (p.y < GROUND_Y || p.vy < 0) {
        p.vy += GRAVITY * dt;
        p.y = Math.min(p.y + p.vy * dt, GROUND_Y);
        if (p.y >= GROUND_Y) p.vy = 0;
      }
      const px = this.worldX + p.xOffset;
      if (px > this.finishX) { p.finished = true; continue; }

      // collision (boîte du bébé un peu réduite pour être sympa)
      const bx1 = px - BABY_W / 2 + 8, bx2 = px + BABY_W / 2 - 8;
      const by1 = p.y - BABY_H + 6;
      for (const o of this.obstacles) {
        if (o.x + o.w - 12 < bx1 || o.x + 12 > bx2) continue;
        if (p.y > GROUND_Y - o.h + 10 && by1 < GROUND_Y) { this.kill(p); return; }
      }
    }

    if (this.players.length && this.players.every(p => p.finished)) this.win();
  }

  remoteUpdate(dt, now) {
    this.moveClouds(dt);
    if (this.phase === 'countdown' && now >= this.countdownEnd) this.phase = 'playing';
    if (this.phase !== 'playing' && this.phase !== 'failed') return;
    // prédiction + recalage doux vers l'état reçu
    if (this.phase === 'playing') this.worldX += this.speed * dt;
    if (this.targetWorldX !== undefined) {
      this.worldX += (this.targetWorldX + (this.phase === 'playing' ? this.speed * 0.04 : 0) - this.worldX) * 0.12;
    }
    for (const p of this.players) {
      if (p.ty !== undefined) p.y += (p.ty - p.y) * 0.45;
    }
  }

  moveClouds(dt) {
    for (const c of this.clouds) {
      c.x -= c.v * dt;
      if (c.x < -300) c.x = this.W + 300 + Math.random() * 200;
    }
  }

  kill(player) {
    player.alive = false;
    player.deadAt = performance.now();
    this.failedPlayer = player;
    this.phase = 'failed';
    this.emitPhase();
    if (this.onRoundFailed) this.onRoundFailed(player);
    setTimeout(() => { if (this.phase === 'failed') this.resetRound(); }, 3000);
  }

  win() {
    this.phase = 'won';
    this.emitPhase();
    if (this.onGameWon) this.onGameWon();
  }

  // ---------- dessin (commun TV / téléphone) ----------
  draw(now) {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const W = this.W;

    // ciel
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#8ed6ff');
    sky.addColorStop(0.72, '#d9f1ff');
    sky.addColorStop(1, '#fff3cf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '80px serif';
    ctx.fillText('🌞', W - 150, 110);

    for (const c of this.clouds) this.drawCloud(c.x, c.y, c.s);

    // sol : chemin pastel avec pointillés qui défilent
    ctx.fillStyle = '#ffe9c7';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#f5c98a';
    ctx.fillRect(0, GROUND_Y, W, 8);
    ctx.fillStyle = '#f7d9a8';
    for (let x = -((this.worldX) % 120); x < W + 120; x += 120) {
      ctx.fillRect(x, GROUND_Y + 52, 60, 10);
    }
    // petites fleurs fixes du décor qui défilent lentement
    ctx.font = '26px serif';
    for (let x = -((this.worldX * 0.5) % 340); x < W + 340; x += 340) {
      ctx.fillText('🌼', x, GROUND_Y + 105);
    }

    if (this.phase !== 'idle') {
      this.drawObstacles();
      this.drawFinish();
      this.drawPlayers(now);
      this.drawProgress();
    }
    if (this.phase === 'countdown') this.drawCountdown(now);
  }

  drawCloud(x, y, s) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 38 * s, 0, 7);
    ctx.arc(x + 44 * s, y - 14 * s, 48 * s, 0, 7);
    ctx.arc(x + 96 * s, y, 38 * s, 0, 7);
    ctx.fill();
  }

  drawObstacles() {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const o of this.obstacles) {
      const sx = o.x - this.worldX;
      if (sx + o.w < -60 || sx > this.W + 60) continue;
      // ombre douce
      ctx.fillStyle = 'rgba(0,0,0,.10)';
      ctx.beginPath();
      ctx.ellipse(sx + o.w / 2, GROUND_Y + 8, o.w / 2 + 6, 10, 0, 0, 7);
      ctx.fill();
      // l'emoji est répété pour remplir la largeur
      ctx.font = o.h + 'px serif';
      const unit = Math.max(1, Math.round(o.w / o.h));
      const uw = o.w / unit;
      ctx.fillStyle = '#000';
      for (let i = 0; i < unit; i++) {
        ctx.fillText(o.e, sx + uw * (i + 0.5), GROUND_Y + 8);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawFinish() {
    const { ctx } = this;
    const sx = this.finishX - this.worldX;
    if (sx > this.W + 200) return;
    ctx.strokeStyle = '#ff9db8';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(sx, 130); ctx.lineTo(sx, GROUND_Y); ctx.stroke();
    ctx.setLineDash([26, 20]);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(sx, 130); ctx.lineTo(sx, GROUND_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '64px serif';
    ctx.fillText('🏁', sx + 14, 190);
    ctx.font = '90px serif';
    ctx.fillText('🛏️', sx + 60, GROUND_Y);
  }

  drawPlayers(now) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    for (const p of this.players) {
      let sx = p.xOffset, sy = p.y;
      if (p.finished) {
        // le bébé arrivé flotte avec son ballon derrière la ligne
        const t = (now % 2200) / 2200;
        sx = this.finishX - this.worldX + 150;
        sy = 260 + this.players.indexOf(p) * 85 + Math.sin(t * Math.PI * 2) * 12;
        this.drawBalloon(sx, sy, p.color);
      } else if (!p.alive) {
        const dt = (now - p.deadAt) / 1000;
        sy = GROUND_Y;
        ctx.font = '46px serif';
        ctx.fillText('💫', sx + 14, sy - BABY_H - 18 + Math.sin(dt * 6) * 6);
      } else if (this.phase === 'playing' && sy >= GROUND_Y - 1) {
        // petit rebond de course
        sy += Math.abs(Math.sin(this.worldX / 34)) * -7;
      }
      // ombre
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath();
      const air = Math.max(0, (GROUND_Y - sy) / 240);
      ctx.ellipse(sx, GROUND_Y + 8, 30 * (1 - air * 0.4), 8 * (1 - air * 0.4), 0, 0, 7);
      if (!p.finished) ctx.fill();
      // halo coloré
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.30;
      ctx.beginPath(); ctx.arc(sx, sy - BABY_H / 2, BABY_H / 2 + 12, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      if (p.id === this.selfId) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy - BABY_H / 2, BABY_H / 2 + 12, 0, 7); ctx.stroke();
      }
      // bébé
      ctx.font = '58px serif';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#000';
      ctx.fillText(p.alive ? '👶' : '😵', sx, sy + 4);
      ctx.textBaseline = 'alphabetic';
      // prénom (avec flèche sur soi-même côté téléphone)
      ctx.font = 'bold 24px "Comic Sans MS", sans-serif';
      const label = (p.id === this.selfId ? '⬇ ' : '') + p.name;
      ctx.fillStyle = '#1e3a5f';
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 5;
      ctx.strokeText(label, sx, sy - BABY_H - 26);
      ctx.fillText(label, sx, sy - BABY_H - 26);
    }
    ctx.textAlign = 'left';
  }

  drawBalloon(sx, sy, color) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx, sy - BABY_H); ctx.lineTo(sx + 10, sy - BABY_H - 34); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(sx + 12, sy - BABY_H - 48, 16, 20, 0, 0, 7); ctx.fill();
  }

  drawProgress() {
    const { ctx } = this;
    const margin = Math.min(120, this.W * 0.08);
    const barW = this.W - margin * 2;
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    roundRect(ctx, margin, 24, barW, 26, 13);
    ctx.fill();
    ctx.font = '32px serif';
    ctx.fillText('🏠', margin - 46, 52);
    ctx.fillText('🏁', margin + barW + 12, 52);
    for (const p of this.players) {
      const prog = Math.max(0, Math.min(1, (this.worldX + p.xOffset) / this.finishX));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(margin + prog * barW, 37, p.id === this.selfId ? 16 : 12, 0, 7);
      ctx.fill();
    }
  }

  drawCountdown(now) {
    const { ctx } = this;
    const remain = (this.countdownEnd - now) / 1000;
    const txt = remain > 3 ? 'Prêts ?' : remain > 0 ? String(Math.ceil(remain)) : 'GO !';
    ctx.font = 'bold 170px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.strokeStyle = '#ff9db8';
    ctx.lineWidth = 12;
    ctx.strokeText(txt, this.W / 2, H / 2 - 60);
    ctx.fillText(txt, this.W / 2, H / 2 - 60);
    ctx.textAlign = 'left';
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
