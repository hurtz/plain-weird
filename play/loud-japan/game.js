(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('scoreValue');
  const comboEl = document.getElementById('comboValue');
  const ballEl = document.getElementById('ballValue');
  const meterEl = document.getElementById('meterBar');
  const meterLabelEl = document.getElementById('meterLabel');
  const announcerEl = document.getElementById('announcer');
  const eventLogEl = document.getElementById('eventLog');
  const shockBurstEl = document.getElementById('shockBurst');
  const launchButton = document.getElementById('launchButton');
  const voiceButton = document.getElementById('voiceButton');
  const resetButton = document.getElementById('resetButton');

  const COLORS = {
    ink: '#120816',
    deep: '#21102c',
    pink: '#ff2aa8',
    hot: '#ff5a28',
    acid: '#d7ff32',
    cyan: '#42e9ff',
    violet: '#812aff',
    paper: '#f7f2e7',
    muted: '#9e8da7'
  };

  const state = {
    score: 0,
    combo: 0,
    ballNumber: 1,
    ballsLeft: 3,
    running: false,
    ready: true,
    gameOver: false,
    voiceEnabled: false,
    shake: 0,
    flash: 0,
    meter: 5,
    lastTime: 0,
    launchCooldown: 0,
    events: [],
    particles: [],
    sparks: [],
    flippers: { left: 0, right: 0 },
    flipperPressed: { left: false, right: false }
  };

  const ball = {
    x: 476,
    y: 770,
    vx: 0,
    vy: 0,
    r: 9,
    active: false,
    trail: []
  };

  const bumpers = [
    { x: 146, y: 263, r: 38, color: COLORS.pink, label: 'Neko', glyph: '猫', points: 1000 },
    { x: 293, y: 220, r: 42, color: COLORS.acid, label: 'Panda', glyph: '熊猫', points: 1250 },
    { x: 398, y: 302, r: 35, color: COLORS.cyan, label: 'Mochi', glyph: '餅', points: 800 }
  ];

  const targets = [
    { x: 102, y: 387, w: 36, h: 78, label: '祭', color: COLORS.hot, points: 1600 },
    { x: 202, y: 397, w: 36, h: 92, label: '萌', color: COLORS.pink, points: 2000 },
    { x: 352, y: 389, w: 36, h: 92, label: '愛', color: COLORS.cyan, points: 1800 },
    { x: 438, y: 386, w: 36, h: 78, label: '爆', color: COLORS.acid, points: 2400 }
  ];

  const ramps = [
    { x: 65, y: 180, w: 51, h: 330, color: COLORS.cyan, label: 'NEON' },
    { x: 426, y: 171, w: 50, h: 340, color: COLORS.pink, label: '東京' }
  ];

  const flipperGeometry = {
    left: { pivot: { x: 191, y: 754 }, rest: -0.3, active: -0.82, length: 96, color: COLORS.cyan },
    right: { pivot: { x: 349, y: 754 }, rest: Math.PI + 0.3, active: Math.PI + 0.82, length: 96, color: COLORS.pink }
  };

  function resizeCanvasForDpr() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    canvas.style.aspectRatio = `${W} / ${H}`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function resetBall() {
    ball.x = 476;
    ball.y = 770;
    ball.vx = 0;
    ball.vy = 0;
    ball.active = false;
    ball.trail = [];
    state.ready = true;
    state.running = false;
    state.launchCooldown = 0;
  }

  function resetTable() {
    state.score = 0;
    state.combo = 0;
    state.ballNumber = 1;
    state.ballsLeft = 3;
    state.gameOver = false;
    state.meter = 5;
    state.events = [];
    state.particles = [];
    state.sparks = [];
    state.shake = 0;
    state.flash = 0;
    state.flipperPressed.left = false;
    state.flipperPressed.right = false;
    resetBall();
    logEvent('TABLE RE-ARMED', '✓');
    announce('INSERT BALL. EMBRACE CONFUSION.', COLORS.paper, false);
    updateHud();
  }

  function launch() {
    if (!state.ready || state.gameOver || state.launchCooldown > 0) return;
    state.voiceEnabled = true;
    voiceButton.innerHTML = '<span class="speaker-icon">◖◖</span> ANNOUNCER VOICE: ON';
    state.ready = false;
    state.running = true;
    state.launchCooldown = 0.25;
    ball.active = true;
    ball.vx = -1.9;
    ball.vy = -18.5;
    state.combo = 0;
    announce('ITADAKIMASU! BALL DEPLOYED!', COLORS.acid, true);
    logEvent('BALL DEPLOYED', '↗');
    chirp(280, 0.08, 'square');
  }

  function updateHud() {
    scoreEl.textContent = String(state.score).padStart(7, '0');
    comboEl.textContent = `x${String(state.combo).padStart(2, '0')}`;
    ballEl.textContent = String(state.ballNumber).padStart(2, '0');
    meterEl.style.width = `${Math.max(4, Math.min(100, state.meter))}%`;
    meterLabelEl.textContent = state.gameOver ? 'GAME OVER' : state.meter > 80 ? 'CRITICAL' : state.meter > 35 ? 'RISING' : 'WAITING';
  }

  function logEvent(message, symbol) {
    const stamp = new Date().toTimeString().slice(3, 8);
    state.events.unshift({ stamp, message, symbol });
    state.events = state.events.slice(0, 4);
    eventLogEl.innerHTML = state.events.map((event) => `<p><span>${event.stamp}</span> ${event.message} <b>${event.symbol}</b></p>`).join('');
  }

  function announce(message, color = COLORS.paper, speak = true) {
    announcerEl.textContent = message;
    announcerEl.style.background = color;
    announcerEl.classList.remove('pulse');
    void announcerEl.offsetWidth;
    announcerEl.classList.add('pulse');
    if (speak) triggerShock(message);
    if (speak && state.voiceEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = /[ぁ-んァ-ン一-龯]/.test(message) ? 'ja-JP' : 'en-US';
      utterance.rate = 0.82;
      utterance.pitch = 0.72;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  function triggerShock(message) {
    if (!shockBurstEl) return;
    const kanaEl = shockBurstEl.querySelector('.shock-kana');
    const wordEl = shockBurstEl.querySelector('.shock-word');
    const kana = message.includes('PANDA') ? '熊' : message.includes('MOCHI') ? '餅' : message.includes('BALL') ? '玉' : message.includes('GAME') ? '終' : '爆';
    kanaEl.textContent = kana;
    wordEl.textContent = message.replace(/!/g, '!!').slice(0, 20);
    shockBurstEl.classList.remove('active');
    void shockBurstEl.offsetWidth;
    shockBurstEl.classList.add('active');
  }

  let audioContext;
  function chirp(frequency, duration, type = 'sawtooth') {
    if (!state.voiceEnabled) return;
    try {
      audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.8, audioContext.currentTime + duration);
      gain.gain.setValueAtTime(0.04, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      // Audio is an enhancement; the table remains playable if the browser blocks it.
    }
  }

  function addScore(points, label, color, x, y) {
    const multiplier = Math.max(1, state.combo);
    const total = points * multiplier;
    state.score += total;
    state.combo = Math.min(99, state.combo + 1);
    state.meter = Math.min(100, state.meter + 8 + multiplier * 0.6);
    state.shake = Math.min(12, state.shake + 4);
    state.flash = 1;
    burst(x, y, color, 12);
    addFloatingText(`${label} +${total}`, x, y, color);
    updateHud();
  }

  function hitBumper(bumper) {
    const dx = ball.x - bumper.x;
    const dy = ball.y - bumper.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = bumper.x + nx * (bumper.r + ball.r + 2);
    ball.y = bumper.y + ny * (bumper.r + ball.r + 2);
    const speed = Math.max(9, Math.hypot(ball.vx, ball.vy) * 1.08);
    ball.vx = nx * speed + (Math.random() - 0.5) * 2;
    ball.vy = ny * speed - 1;
    addScore(bumper.points, bumper.glyph === '熊猫' ? 'PANDA SMASH' : `${bumper.glyph} IMPACT`, bumper.color, bumper.x, bumper.y);
    announce(bumper.glyph === '猫' ? 'KAWAII IMPACT!' : bumper.glyph === '熊猫' ? 'PANDA PANIC!!!' : 'MOCHI BONK!!!', bumper.color, true);
    logEvent(`${bumper.label.toUpperCase()} IMPACT`, '★');
    chirp(180 + bumper.points / 10, 0.12);
  }

  function hitTarget(target) {
    ball.vx *= -0.92;
    ball.vy = Math.abs(ball.vy) * -0.75 - 1;
    addScore(target.points, `${target.label} HIT`, target.color, target.x + target.w / 2, target.y);
    announce(target.label === '爆' ? 'BAKU! BAKU! BAKU!' : 'JAPANESE SYMBOL DETECTED!', target.color, true);
    logEvent(`${target.label} TARGET LIT`, '◆');
    chirp(320 + target.points / 8, 0.1, 'triangle');
  }

  function handleFlipperCollision(side) {
    const shape = flipperGeometry[side];
    const angle = state.flippers[side];
    const endX = shape.pivot.x + Math.cos(angle) * shape.length;
    const endY = shape.pivot.y + Math.sin(angle) * shape.length;
    const vx = endX - shape.pivot.x;
    const vy = endY - shape.pivot.y;
    const lenSq = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(1, ((ball.x - shape.pivot.x) * vx + (ball.y - shape.pivot.y) * vy) / lenSq));
    const cx = shape.pivot.x + t * vx;
    const cy = shape.pivot.y + t * vy;
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < ball.r + 12) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      ball.x = cx + nx * (ball.r + 13);
      ball.y = cy + ny * (ball.r + 13);
      const kick = state.flipperPressed[side] ? 14 : 8;
      ball.vx = nx * kick + (side === 'left' ? 1 : -1) * 2;
      ball.vy = ny * kick - 8;
      if (state.flipperPressed[side]) {
        state.combo = Math.min(99, state.combo + 1);
        state.meter = Math.min(100, state.meter + 3);
        burst(ball.x, ball.y, shape.color, 6);
        chirp(side === 'left' ? 230 : 280, 0.07, 'square');
        updateHud();
      }
    }
  }

  function loseBall() {
    if (!ball.active) return;
    ball.active = false;
    state.running = false;
    state.combo = 0;
    state.meter = Math.max(0, state.meter - 18);
    state.ballsLeft -= 1;
    if (state.ballsLeft <= 0) {
      state.gameOver = true;
      announce('GAME OVER. VERY JAPAN. TRY AGAIN.', COLORS.pink, true);
      logEvent('CULTURE SHOCK COMPLETE', '×');
    } else {
      state.ballNumber += 1;
      announce('BALL LOST. REGROUP, SAMURAI.', COLORS.hot, true);
      logEvent('BALL DRAINED', '↓');
      setTimeout(resetBall, 620);
    }
    updateHud();
  }

  function update(dt) {
    state.launchCooldown = Math.max(0, state.launchCooldown - dt);
    state.shake *= 0.9;
    state.flash *= 0.84;
    state.flippers.left += (state.flipperPressed.left ? flipperGeometry.left.active : flipperGeometry.left.rest - 0.02 - state.flippers.left) * Math.min(1, dt * 18);
    state.flippers.right += (state.flipperPressed.right ? flipperGeometry.right.active : flipperGeometry.right.rest + 0.02 - state.flippers.right) * Math.min(1, dt * 18);
    state.particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.life -= dt; particle.vy += 8 * dt; });
    state.particles = state.particles.filter((particle) => particle.life > 0);
    state.sparks.forEach((spark) => { spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.life -= dt; });
    state.sparks = state.sparks.filter((spark) => spark.life > 0);
    floatingTextState.items.forEach((item) => { item.y -= 25 * dt; item.life -= dt; });
    floatingTextState.items = floatingTextState.items.filter((item) => item.life > 0);

    if (!ball.active) return;

    ball.trail.push({ x: ball.x, y: ball.y, life: 1 });
    if (ball.trail.length > 12) ball.trail.shift();
    ball.trail.forEach((point) => { point.life -= dt * 4; });

    ball.vy += 24 * dt;
    ball.vx *= 0.999;
    ball.vy *= 0.999;
    ball.x += ball.vx * dt * 17;
    ball.y += ball.vy * dt * 17;

    if (ball.x < 44 + ball.r) { ball.x = 44 + ball.r; ball.vx = Math.abs(ball.vx) * 0.93; spark(ball.x, ball.y, COLORS.cyan); }
    if (ball.x > W - 44 - ball.r) { ball.x = W - 44 - ball.r; ball.vx = -Math.abs(ball.vx) * 0.93; spark(ball.x, ball.y, COLORS.pink); }
    if (ball.y < 124 + ball.r) { ball.y = 124 + ball.r; ball.vy = Math.abs(ball.vy) * 0.92; spark(ball.x, ball.y, COLORS.acid); }

    bumpers.forEach((bumper) => {
      if (Math.hypot(ball.x - bumper.x, ball.y - bumper.y) < bumper.r + ball.r) hitBumper(bumper);
    });
    targets.forEach((target) => {
      const nearX = Math.max(target.x, Math.min(ball.x, target.x + target.w));
      const nearY = Math.max(target.y, Math.min(ball.y, target.y + target.h));
      if (Math.hypot(ball.x - nearX, ball.y - nearY) < ball.r + 4) hitTarget(target);
    });
    handleFlipperCollision('left');
    handleFlipperCollision('right');

    if (ball.y > H + 30 || (ball.y > 850 && ball.x > 135 && ball.x < 405)) loseBall();
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function draw() {
    ctx.save();
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    ctx.translate(shakeX, shakeY);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawTable();
    drawDecor();
    drawMegaStickers();
    drawRamps();
    drawTargets();
    drawBumpers();
    drawFlippers();
    drawParticles();
    drawBall();
    drawFloatingText();
    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.08})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawTable() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#25102c');
    bg.addColorStop(0.55, '#130a1a');
    bg.addColorStop(1, '#08070c');
    ctx.fillStyle = bg;
    roundedRect(0, 0, W, H, 4);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = COLORS.violet;
    ctx.lineWidth = 1;
    for (let y = 126; y < H; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = 20; x < W; x += 25) { ctx.beginPath(); ctx.moveTo(x, 116); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.restore();

    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = COLORS.cyan;
    roundedRect(17, 17, W - 34, H - 34, 12);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = COLORS.pink;
    ctx.lineWidth = 1;
    roundedRect(29, 29, W - 58, H - 58, 8);
    ctx.stroke();

    const marquee = ctx.createLinearGradient(55, 42, 485, 105);
    marquee.addColorStop(0, COLORS.pink);
    marquee.addColorStop(0.5, COLORS.violet);
    marquee.addColorStop(1, COLORS.cyan);
    ctx.fillStyle = marquee;
    roundedRect(51, 48, 438, 66, 7);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(58, 55, 424, 52);
    ctx.fillStyle = COLORS.paper;
    ctx.font = '700 34px "Black Han Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOUD JAPAN', W / 2, 91);
    ctx.fillStyle = COLORS.acid;
    ctx.font = '10px "DM Mono", monospace';
    ctx.fillText('文化ショック / CULTURE SHOCK PINBALL', W / 2, 105);

    ctx.fillStyle = COLORS.hot;
    ctx.font = '700 17px "Black Han Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('大', 58, 145);
    ctx.fillStyle = COLORS.cyan;
    ctx.textAlign = 'right';
    ctx.fillText('音', 482, 145);
    ctx.textAlign = 'left';
  }

  function drawDecor() {
    // Torii-inspired arch.
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 90, 40, 0.7)';
    ctx.lineWidth = 8;
    ctx.shadowBlur = 16;
    ctx.shadowColor = COLORS.hot;
    ctx.beginPath();
    ctx.moveTo(167, 168); ctx.lineTo(167, 124); ctx.lineTo(370, 124); ctx.lineTo(370, 168);
    ctx.moveTo(153, 132); ctx.lineTo(384, 132);
    ctx.stroke();
    ctx.restore();

    // Sakura bursts and capsule labels.
    for (let i = 0; i < 9; i += 1) {
      const x = 70 + ((i * 83) % 402);
      const y = 150 + ((i * 41) % 75);
      drawFlower(x, y, i % 2 ? COLORS.pink : COLORS.paper, 4 + (i % 2));
    }
    ctx.fillStyle = COLORS.acid;
    ctx.font = '9px "DM Mono", monospace';
    ctx.fillText('NEON // NEKO // PANDA // CHAOS', 64, 565);

    // Lower warning stripes.
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = COLORS.hot;
    for (let i = 0; i < 13; i += 1) {
      ctx.save();
      ctx.translate(80 + i * 31, 820);
      ctx.rotate(-0.65);
      ctx.fillRect(-7, -7, 14, 48);
      ctx.restore();
    }
    ctx.restore();

    ctx.fillStyle = COLORS.paper;
    ctx.font = '700 10px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ PLAY RESPONSIBLY / PLAY VERY LOUD ⚠', W / 2, 835);
    ctx.textAlign = 'left';
  }

  function drawMegaStickers() {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(88, 602);
    ctx.rotate(-0.08);
    ctx.fillStyle = COLORS.hot;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 5;
    roundedRect(-34, -17, 112, 35, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.paper;
    ctx.font = '700 17px "Black Han Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OHAYO!', 22, 7);
    ctx.restore();

    ctx.save();
    ctx.translate(440, 585);
    ctx.rotate(0.13);
    ctx.fillStyle = COLORS.pink;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const angle = (Math.PI * 2 * i) / 16;
      const radius = i % 2 === 0 ? 39 : 27;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 13px "Black Han Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WTF?', 0, 5);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = COLORS.acid;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(106 + i * 28, 540);
      ctx.lineTo(116 + i * 28, 568);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFlower(x, y, color, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.88;
    for (let i = 0; i < 5; i += 1) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.9, size * 0.62, size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.acid;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRamps() {
    ramps.forEach((ramp) => {
      const gradient = ctx.createLinearGradient(ramp.x, ramp.y, ramp.x + ramp.w, ramp.y);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.45, ramp.color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.3;
      roundedRect(ramp.x, ramp.y, ramp.w, ramp.h, 18);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ramp.color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = ramp.color;
      roundedRect(ramp.x + 7, ramp.y, ramp.w - 14, ramp.h, 14);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.translate(ramp.x + ramp.w / 2, ramp.y + ramp.h - 30);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = ramp.color;
      ctx.font = '9px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${ramp.label} RAMP`, 0, 0);
      ctx.restore();
    });
  }

  function drawTargets() {
    targets.forEach((target, index) => {
      const glow = ctx.createLinearGradient(target.x, target.y, target.x + target.w, target.y + target.h);
      glow.addColorStop(0, target.color);
      glow.addColorStop(1, COLORS.violet);
      ctx.fillStyle = glow;
      ctx.shadowBlur = 14;
      ctx.shadowColor = target.color;
      roundedRect(target.x, target.y, target.w, target.h, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.ink;
      roundedRect(target.x + 4, target.y + 4, target.w - 8, target.h - 8, 3);
      ctx.fill();
      ctx.fillStyle = target.color;
      ctx.font = '700 24px "Black Han Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(target.label, target.x + target.w / 2, target.y + target.h / 2 + 8);
      ctx.font = '8px "DM Mono", monospace';
      ctx.fillText(`0${index + 1}`, target.x + target.w / 2, target.y + 14);
      ctx.textAlign = 'left';
    });
  }

  function drawBumpers() {
    bumpers.forEach((bumper, index) => {
      ctx.save();
      ctx.translate(bumper.x, bumper.y);
      const pulse = 1 + Math.sin(performance.now() / 180 + index) * 0.03;
      ctx.scale(pulse, pulse);
      ctx.shadowBlur = 24;
      ctx.shadowColor = bumper.color;
      ctx.fillStyle = bumper.color;
      ctx.beginPath(); ctx.arc(0, 0, bumper.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath(); ctx.arc(0, 0, bumper.r - 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = bumper.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, bumper.r - 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = bumper.color;
      ctx.font = bumper.glyph === '熊猫' ? '17px sans-serif' : '700 28px "Black Han Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bumper.glyph, 0, 1);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    });
  }

  function drawFlippers() {
    Object.entries(flipperGeometry).forEach(([side, shape]) => {
      const angle = state.flippers[side];
      const endX = shape.pivot.x + Math.cos(angle) * shape.length;
      const endY = shape.pivot.y + Math.sin(angle) * shape.length;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = 24;
      ctx.strokeStyle = shape.color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = shape.color;
      ctx.beginPath(); ctx.moveTo(shape.pivot.x, shape.pivot.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 14;
      ctx.strokeStyle = COLORS.ink;
      ctx.beginPath(); ctx.moveTo(shape.pivot.x, shape.pivot.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.fillStyle = shape.color;
      ctx.beginPath(); ctx.arc(shape.pivot.x, shape.pivot.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath(); ctx.arc(shape.pivot.x, shape.pivot.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawBall() {
    ball.trail.forEach((point, index) => {
      if (point.life <= 0) return;
      ctx.fillStyle = `rgba(215, 255, 50, ${point.life * (index / ball.trail.length) * 0.22})`;
      ctx.beginPath(); ctx.arc(point.x, point.y, ball.r * (index / ball.trail.length), 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 23;
    ctx.shadowColor = COLORS.acid;
    const gradient = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r + 3);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.4, COLORS.acid);
    gradient.addColorStop(1, COLORS.hot);
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (state.ready && !state.gameOver) {
      ctx.fillStyle = COLORS.acid;
      ctx.font = '9px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS LAUNCH', ball.x - 6, ball.y + 29);
      ctx.textAlign = 'left';
    }
  }

  function drawParticles() {
    state.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    state.sparks.forEach((spark) => {
      ctx.globalAlpha = Math.max(0, spark.life);
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(spark.x, spark.y); ctx.lineTo(spark.x - spark.vx * 3, spark.y - spark.vy * 3); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  const floatingTextState = { items: [] };
  function drawFloatingText() {
    floatingTextState.items.forEach((item) => {
      ctx.globalAlpha = Math.max(0, item.life);
      ctx.fillStyle = item.color;
      ctx.font = '700 12px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.text, item.x, item.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function addFloatingText(text, x, y, color) {
    floatingTextState.items.push({ text, x, y, color, life: 1 });
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 120;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, size: 2 + Math.random() * 4, life: 0.5 + Math.random() * 0.55 });
    }
  }

  function spark(x, y, color) {
    for (let i = 0; i < 2; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      state.sparks.push({ x, y, vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40, color, life: 0.45 });
    }
  }

  function setFlipper(side, pressed) {
    state.flipperPressed[side] = pressed;
    document.querySelector(`[data-flipper="${side}"]`).classList.toggle('active', pressed);
  }

  function handlePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (W / rect.width);
    if (event.type === 'pointerdown') {
      if (x < W / 2) setFlipper('left', true);
      else setFlipper('right', true);
    } else if (event.type === 'pointerup' || event.type === 'pointercancel' || event.type === 'pointerleave') {
      setFlipper('left', false);
      setFlipper('right', false);
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') { event.preventDefault(); launch(); }
    if (event.code === 'ArrowLeft' || event.key.toLowerCase() === 'a') { event.preventDefault(); setFlipper('left', true); }
    if (event.code === 'ArrowRight' || event.key.toLowerCase() === 'd') { event.preventDefault(); setFlipper('right', true); }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.key.toLowerCase() === 'a') setFlipper('left', false);
    if (event.code === 'ArrowRight' || event.key.toLowerCase() === 'd') setFlipper('right', false);
  });
  canvas.addEventListener('pointerdown', handlePointer);
  canvas.addEventListener('pointerup', handlePointer);
  canvas.addEventListener('pointercancel', handlePointer);
  canvas.addEventListener('pointerleave', handlePointer);
  document.querySelectorAll('.flipper-button').forEach((button) => {
    const side = button.dataset.flipper;
    button.addEventListener('pointerdown', () => setFlipper(side, true));
    button.addEventListener('pointerup', () => setFlipper(side, false));
    button.addEventListener('pointerleave', () => setFlipper(side, false));
  });
  launchButton.addEventListener('click', launch);
  resetButton.addEventListener('click', resetTable);
  voiceButton.addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    voiceButton.innerHTML = state.voiceEnabled ? '<span class="speaker-icon">◖◖</span> ANNOUNCER VOICE: ON' : '<span class="speaker-icon">◖</span> ENABLE ANNOUNCER VOICE';
    if (state.voiceEnabled) {
      if (audioContext?.state === 'suspended') audioContext.resume();
      announce('音量最大! LETS GO!', COLORS.acid, true);
      chirp(220, 0.15);
    }
  });

  function frame(timestamp) {
    const dt = Math.min(0.035, (timestamp - state.lastTime) / 1000 || 0);
    state.lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resizeCanvasForDpr();
  window.addEventListener('resize', resizeCanvasForDpr);
  resetTable();
  requestAnimationFrame(frame);
})();
