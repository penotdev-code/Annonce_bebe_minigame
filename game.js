/* ============================================================
   Bébé en Voyage — moteur de jeu (tourne sur l'écran TV)
   Flappy multijoueur : tous les bébés doivent atteindre l'arrivée.
   ============================================================ */

const GameConfig = {
  lengths: {
    court:  { obstacles: 8  },
    moyen:  { obstacles: 16 },
    long:   { obstacles: 30 },
  },
  difficulties: {
    facile:    { speed: 180, gap: 310, spacing: 460, gravity: 1050, flap: -380 },
    moyen:     { speed: 230, gap: 255, spacing: 400, gravity: 1300, flap: -420 },
    difficile: { speed: 290, gap: 210, spacing: 350, gravity: 1550, flap: -460 },
  },
};

const PLAYER_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#a78bfa',
                       '#f97316', '#22c55e', '#ec4899', '#38bdf8'];

const H = 900;               // hauteur logique du monde
const GROUND_H = 90;
const BABY_R = 26;           // rayon de collision du bébé

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = [];       // {id, name, color, y, vy, alive, finished, deadAt}
    this.phase = 'idle';     // idle | countdown | playing | failed | won
    this.onRoundFailed = null;
    this.onGameWon = null;
    this.onPhase = null;
    this.lastTime = 0;
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      this.clouds.push({ x: Math.random() * 2200, y: 60 + Math.random() * 500,
                         s: 0.6 + Math.random() * 0.9, v: 12 + Math.random() * 18 });
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

  setup(lengthKey, difficultyKey, playerInfos) {
    const len = GameConfig.lengths[lengthKey] || GameConfig.lengths.moyen;
    this.diff = GameConfig.difficulties[difficultyKey] || GameConfig.difficulties.moyen;
    // Parcours identique à chaque tentative de la même partie
    this.obstacles = [];
    const startX = 1500;
    for (let i = 0; i < len.obstacles; i++) {
      const margin = this.diff.gap / 2 + 90;
      const gapY = margin + Math.random() * (H - GROUND_H - 2 * margin);
      this.obstacles.push({ x: startX + i * this.diff.spacing, gapY, kind: i % 2 });
    }
    this.finishX = startX + len.obstacles * this.diff.spacing + 500;
    this.players = playerInfos.map((p, i) => ({
      ...p, xOffset: 240 + i * 44, y: 0, vy: 0, alive: true, finished: false, deadAt: 0,
    }));
    this.resetRound();
  }

  resetRound() {
    this.worldX = 0;
    this.failedPlayer = null;
    for (const p of this.players) {
      p.y = H / 2 + (Math.random() - 0.5) * 60;
      p.vy = 0;
      p.alive = true;
      p.finished = false;
    }
    this.startCountdown();
  }

  startCountdown() {
    this.phase = 'countdown';
    this.countdownEnd = performance.now() + 3200;
    this.emitPhase();
  }

  emitPhase() { if (this.onPhase) this.onPhase(this.phase); }

  flap(playerId) {
    if (this.phase !== 'playing') return;
    const p = this.players.find(p => p.id === playerId);
    if (p && p.alive && !p.finished) p.vy = this.diff.flap;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    if (this.phase === 'playing' && this.players.length &&
        this.players.every(p => p.finished)) this.win();
  }

  // ---------- boucle ----------
  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    this.update(dt, t);
    this.draw(t);
    requestAnimationFrame(tt => this.loop(tt));
  }

  update(dt, now) {
    for (const c of this.clouds) {
      c.x -= c.v * dt;
      if (c.x < -300) c.x = this.W + 300;
    }
    if (this.phase === 'countdown' && now >= this.countdownEnd) {
      this.phase = 'playing';
      this.emitPhase();
    }
    if (this.phase !== 'playing') return;

    this.worldX += this.diff.speed * dt;

    for (const p of this.players) {
      if (!p.alive || p.finished) continue;
      p.vy += this.diff.gravity * dt;
      p.y += p.vy * dt;
      const px = this.worldX + p.xOffset;

      if (px > this.finishX) { p.finished = true; continue; }

      // sol et plafond
      if (p.y > H - GROUND_H - BABY_R || p.y < BABY_R) { this.kill(p); return; }

      // obstacles (paires de piliers avec un trou)
      for (const o of this.obstacles) {
        if (Math.abs(o.x - px) > 60 + BABY_R) continue;
        const half = this.diff.gap / 2;
        if (p.y - BABY_R < o.gapY - half || p.y + BABY_R > o.gapY + half) {
          this.kill(p); return;
        }
      }
    }

    if (this.players.length && this.players.every(p => p.finished)) this.win();
  }

  kill(player) {
    player.alive = false;
    player.deadAt = performance.now();
    this.failedPlayer = player;
    this.phase = 'failed';
    this.emitPhase();
    if (this.onRoundFailed) this.onRoundFailed(player);
    // tout le monde recommence après une petite pause
    setTimeout(() => { if (this.phase === 'failed') this.resetRound(); }, 3000);
  }

  win() {
    this.phase = 'won';
    this.emitPhase();
    if (this.onGameWon) this.onGameWon();
  }

  // ---------- dessin ----------
  draw(now) {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const W = this.W;

    // ciel
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#8ed6ff');
    sky.addColorStop(0.7, '#cdeeff');
    sky.addColorStop(1, '#fff6d8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // soleil
    ctx.font = '90px serif';
    ctx.fillText('🌞', W - 160, 120);

    // nuages
    for (const c of this.clouds) this.drawCloud(c.x, c.y, c.s);

    if (this.phase !== 'idle') {
      this.drawObstacles();
      this.drawFinish();
    }

    // sol : bande de nuages moelleux
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
    ctx.fillStyle = '#e8f4ff';
    for (let x = -((this.worldX * 0.5) % 90); x < W + 90; x += 90) {
      ctx.beginPath();
      ctx.arc(x, H - GROUND_H, 45, 0, Math.PI, true);
      ctx.fill();
    }

    if (this.phase !== 'idle') {
      this.drawPlayers(now);
      this.drawProgress();
    }
    if (this.phase === 'countdown') this.drawCountdown(now);
  }

  drawCloud(x, y, s) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 40 * s, 0, 7);
    ctx.arc(x + 45 * s, y - 15 * s, 50 * s, 0, 7);
    ctx.arc(x + 100 * s, y, 40 * s, 0, 7);
    ctx.fill();
  }

  drawObstacles() {
    const { ctx } = this;
    for (const o of this.obstacles) {
      const sx = o.x - this.worldX;
      if (sx < -100 || sx > this.W + 100) continue;
      const half = this.diff.gap / 2;
      this.drawPillar(sx, 0, o.gapY - half, true, o.kind);
      this.drawPillar(sx, o.gapY + half, H - GROUND_H, false, o.kind);
    }
  }

  // Piliers thème bébé : biberons et tours de cubes pastel
  drawPillar(cx, y1, y2, fromTop, kind) {
    const { ctx } = this;
    const w = 92;
    const x = cx - w / 2;
    const hgt = y2 - y1;
    if (hgt <= 0) return;
    if (kind === 0) {
      // biberon
      ctx.fillStyle = '#ffe1ec';
      ctx.strokeStyle = '#f7a8c4';
      ctx.lineWidth = 5;
      roundRect(ctx, x, y1, w, hgt, 18);
      ctx.fill(); ctx.stroke();
      // graduations
      ctx.strokeStyle = 'rgba(247,168,196,.7)';
      ctx.lineWidth = 3;
      for (let gy = y1 + 40; gy < y2 - 30; gy += 55) {
        ctx.beginPath(); ctx.moveTo(x + 12, gy); ctx.lineTo(x + w - 32, gy); ctx.stroke();
      }
      // tétine au bout côté trou
      const tipY = fromTop ? y2 : y1;
      ctx.fillStyle = '#ffb86b';
      ctx.beginPath();
      ctx.ellipse(cx, tipY, 26, 20, 0, 0, 7);
      ctx.fill();
    } else {
      // tour de cubes
      const letters = 'BÉBÉ';
      const cube = 92;
      const n = Math.ceil(hgt / cube);
      for (let i = 0; i < n; i++) {
        const cy = fromTop ? y2 - (i + 1) * cube : y1 + i * cube;
        const ch = Math.min(cube, fromTop ? cy + cube - y1 : y2 - cy);
        const cyc = fromTop ? Math.max(cy, y1) : cy;
        ctx.fillStyle = i % 2 ? '#cde8ff' : '#d9f7e2';
        ctx.strokeStyle = i % 2 ? '#7ec3f0' : '#7fd39a';
        ctx.lineWidth = 5;
        roundRect(ctx, x, cyc, w, ch, 10);
        ctx.fill(); ctx.stroke();
        if (ch > 60) {
          ctx.fillStyle = i % 2 ? '#5a9fd0' : '#4faa6e';
          ctx.font = 'bold 40px "Comic Sans MS", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(letters[i % letters.length], cx, cyc + ch / 2 + 14);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  drawFinish() {
    const { ctx } = this;
    const sx = this.finishX - this.worldX;
    if (sx > this.W + 200) return;
    // banderole d'arrivée
    ctx.strokeStyle = '#ff9db8';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H - GROUND_H); ctx.stroke();
    ctx.setLineDash([28, 22]);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H - GROUND_H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '70px serif';
    ctx.fillText('🏁', sx + 15, 90);
    ctx.fillText('🛏️', sx + 40, H - GROUND_H - 20);
  }

  drawPlayers(now) {
    const { ctx } = this;
    for (const p of this.players) {
      let sx = p.xOffset, sy = p.y;
      if (p.finished) {
        // le bébé arrivé s'envole doucement avec son ballon
        const t = (now % 2000) / 2000;
        sx = this.finishX - this.worldX + 120;
        sy = 200 + this.players.indexOf(p) * 90 + Math.sin(t * Math.PI * 2) * 12;
      }
      if (!p.alive) {
        const dt = (now - p.deadAt) / 1000;
        sy = Math.min(p.y + 600 * dt * dt, H - GROUND_H - 20);
        ctx.font = '52px serif';
        ctx.fillText('💫', sx - 20, sy - 45);
      }
      // ballon au-dessus du bébé
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(sx, sy - BABY_R); ctx.lineTo(sx + 10, sy - BABY_R - 34); ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(sx + 12, sy - BABY_R - 48, 16, 20, 0, 0, 7); ctx.fill();
      // bulle colorée + bébé
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(sx, sy, BABY_R + 7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx, sy, BABY_R + 7, 0, 7); ctx.stroke();
      ctx.font = '44px serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.alive ? '👶' : '😵', sx, sy + 16);
      // prénom
      ctx.font = 'bold 24px "Comic Sans MS", sans-serif';
      ctx.fillStyle = '#1e3a5f';
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 5;
      ctx.strokeText(p.name, sx, sy - BABY_R - 78);
      ctx.fillText(p.name, sx, sy - BABY_R - 78);
      ctx.textAlign = 'left';
    }
  }

  drawProgress() {
    const { ctx } = this;
    const margin = 120;
    const barW = this.W - margin * 2;
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    roundRect(ctx, margin, 24, barW, 26, 13);
    ctx.fill();
    ctx.font = '34px serif';
    ctx.fillText('🏠', margin - 50, 52);
    ctx.fillText('🏁', margin + barW + 14, 52);
    for (const p of this.players) {
      const prog = Math.max(0, Math.min(1, (this.worldX + p.xOffset) / this.finishX));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(margin + prog * barW, 37, 13, 0, 7);
      ctx.fill();
    }
  }

  drawCountdown(now) {
    const { ctx } = this;
    const remain = (this.countdownEnd - now) / 1000;
    const txt = remain > 3 ? 'Prêts ?' : remain > 0 ? String(Math.ceil(remain)) : 'GO !';
    ctx.font = 'bold 190px "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.strokeStyle = '#ff9db8';
    ctx.lineWidth = 12;
    ctx.strokeText(txt, this.W / 2, H / 2);
    ctx.fillText(txt, this.W / 2, H / 2);
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
