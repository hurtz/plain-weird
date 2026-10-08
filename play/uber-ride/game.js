const $ = (selector) => document.querySelector(selector);

const startScreen = $("#startScreen");
const startButton = $("#startButton");
const game = $("#game");
const gameStage = $("#gameStage");
const canvas = $("#roadCanvas");
const ctx = canvas.getContext("2d");
const fareValue = $("#fareValue");
const distanceLabel = $("#distanceLabel");
const distanceValue = $("#distanceValue");
const timerLabel = $("#timerLabel");
const timerValue = $("#timerValue");
const healthValue = $("#healthValue");
const pressureName = $("#pressureName");
const pressureValue = $("#pressureValue");
const pressureTrack = $("#pressureTrack");
const pressureFill = $("#pressureFill");
const soundButton = $("#soundButton");
const soundLabel = $("#soundLabel");
const routeCard = $("#routeCard");
const routeKicker = $("#routeKicker");
const routeInstruction = $("#routeInstruction");
const routeSubtext = $("#routeSubtext");
const mirrorShell = $("#mirrorShell");
const passengerState = $("#passengerState");
const bark = $("#bark");
const barkSpeaker = $("#barkSpeaker");
const barkText = $("#barkText");
const phoneSos = $("#phoneSos");
const phoneTimer = $("#phoneTimer");
const eventFlash = $("#eventFlash");
const killButton = $("#killButton");
const killWarning = $("#killWarning");
const killSmall = $("#killSmall");
const killText = $("#killText");
const countdown = $("#countdown");
const outcome = $("#outcome");
const outcomeCard = $("#outcomeCard");
const outcomeKicker = $("#outcomeKicker");
const outcomeTitle = $("#outcomeTitle");
const outcomeCopy = $("#outcomeCopy");
const results = $("#results");
const restartButton = $("#restartButton");
const touchButtons = [...document.querySelectorAll("[data-control]")];

const LANES = [-0.58, 0, 0.58];
const HOTEL_DISTANCE = 950;
const START_ETA = 78;
const KILL_HOLD_MS = 780;
const MAX_HEALTH = 5;
const PLAYER_DEPTH = 0.84;
const keys = new Set();
const touchInput = { left: false, right: false, brake: false, boost: false };

let viewWidth = 1280;
let viewHeight = 720;
let pixelRatio = 1;
let animationFrame = 0;
let lastFrame = performance.now();
let killFrame = 0;
let killStartedAt = 0;
let barkTimer = 0;
let flashTimer = 0;
let countdownTimers = [];
let muted = false;

const state = {
  mode: "idle",
  seed: 71827,
  elapsed: 0,
  distance: 0,
  distanceGoal: HOTEL_DISTANCE,
  disposalRemaining: 0,
  disposalLane: 0,
  eta: START_ETA,
  x: 0,
  vx: 0,
  speed: 0,
  targetSpeed: 13,
  nerves: 0,
  heat: 0,
  health: MAX_HEALTH,
  fareBonus: 0,
  farePenalty: 0,
  nearMisses: 0,
  collisions: 0,
  wrongTurns: 0,
  correctTurns: 0,
  hotelMisses: 0,
  obstacles: [],
  particles: [],
  spawnTimer: 0.7,
  nextAmbient: 4,
  shake: 0,
  crashCooldown: 0,
  silenceTimer: 0,
  murdered: false,
  holdingKill: false,
  steeringRecently: 0,
  brakeRecently: 0,
  boostRecently: 0,
  routeEvents: [],
  activeRoute: null,
  resultShown: false,
};

class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.engine = null;
    this.heartbeatGain = null;
    this.heartbeat = null;
  }

  start() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = muted ? 0 : 0.42;
    this.master.connect(this.context.destination);

    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0.035;
    this.engineGain.connect(this.master);
    this.engine = this.context.createOscillator();
    this.engine.type = "sawtooth";
    this.engine.frequency.value = 55;
    this.engine.connect(this.engineGain);
    this.engine.start();

    this.heartbeatGain = this.context.createGain();
    this.heartbeatGain.gain.value = 0;
    this.heartbeatGain.connect(this.master);
    this.heartbeat = this.context.createOscillator();
    this.heartbeat.type = "sine";
    this.heartbeat.frequency.value = 42;
    this.heartbeat.connect(this.heartbeatGain);
    this.heartbeat.start();
  }

  update() {
    if (!this.context || !this.engine) return;
    const now = this.context.currentTime;
    const engineFrequency = 42 + state.speed * 2.8;
    this.engine.frequency.setTargetAtTime(engineFrequency, now, 0.04);
    const pressure = state.mode === "disposal" ? state.heat : state.nerves;
    const heartbeat = pressure > 70 ? (pressure - 70) / 30 : 0;
    this.heartbeatGain.gain.setTargetAtTime(heartbeat * 0.028, now, 0.08);
  }

  tone(frequency = 300, duration = 0.08, volume = 0.06, type = "square") {
    if (!this.context || !this.master || muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      this.context.currentTime + duration,
    );
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  noise(duration = 0.18, volume = 0.18) {
    if (!this.context || !this.master || muted) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const decay = 1 - index / length;
      channel[index] = (Math.random() * 2 - 1) * decay * decay;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  setMuffled(amount) {
    if (!this.context || !this.engineGain) return;
    const target = 0.035 * (1 - amount * 0.78);
    this.engineGain.gain.setTargetAtTime(target, this.context.currentTime, 0.03);
  }

  silence() {
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setValueAtTime(0, this.context.currentTime);
  }

  restore() {
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(
      muted ? 0 : 0.42,
      this.context.currentTime + 0.35,
    );
    this.setMuffled(0);
  }

  setMuted(value) {
    muted = value;
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      muted ? 0 : 0.42,
      this.context.currentTime,
      0.03,
    );
  }
}

const audio = new GameAudio();

function random() {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function randomChoice(items) {
  return items[Math.floor(random() * items.length)];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function nearestLane(value = state.x) {
  let best = 0;
  let bestDistance = Infinity;
  LANES.forEach((lane, index) => {
    const distance = Math.abs(value - lane);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function laneName(index) {
  return ["left", "center", "right"][index];
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function projectedFare() {
  return Math.max(
    0,
    18.4 +
      state.fareBonus +
      state.nearMisses * 0.35 -
      state.farePenalty -
      state.collisions * 1.25 -
      state.wrongTurns * 2,
  );
}

function resizeCanvas() {
  const rect = gameStage.getBoundingClientRect();
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  viewWidth = Math.max(320, rect.width);
  viewHeight = Math.max(320, rect.height);
  canvas.width = Math.round(viewWidth * pixelRatio);
  canvas.height = Math.round(viewHeight * pixelRatio);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function resetState() {
  Object.assign(state, {
    mode: "countdown",
    seed: 71827,
    elapsed: 0,
    distance: 0,
    distanceGoal: HOTEL_DISTANCE,
    disposalRemaining: 0,
    disposalLane: 0,
    eta: START_ETA,
    x: 0,
    vx: 0,
    speed: 0,
    targetSpeed: 13,
    nerves: 4,
    heat: 0,
    health: MAX_HEALTH,
    fareBonus: 0,
    farePenalty: 0,
    nearMisses: 0,
    collisions: 0,
    wrongTurns: 0,
    correctTurns: 0,
    hotelMisses: 0,
    obstacles: [],
    particles: [],
    spawnTimer: 0.7,
    nextAmbient: 4,
    shake: 0,
    crashCooldown: 0,
    silenceTimer: 0,
    murdered: false,
    holdingKill: false,
    steeringRecently: 0,
    brakeRecently: 0,
    boostRecently: 0,
    activeRoute: null,
    resultShown: false,
    routeEvents: [
      { at: 285, lane: 0, trentLane: 2, announced: false, resolved: false },
      { at: 625, lane: 2, trentLane: 0, announced: false, resolved: false },
    ],
  });

  keys.clear();
  Object.keys(touchInput).forEach((key) => {
    touchInput[key] = false;
  });
  touchButtons.forEach((button) => button.classList.remove("is-down"));
  countdownTimers.forEach(clearTimeout);
  countdownTimers = [];
  bark.hidden = true;
  barkTimer = 0;
  phoneSos.hidden = true;
  game.className = "game";
  killButton.disabled = false;
  killButton.className = "kill-button";
  killButton.style.setProperty("--button-scale", "1");
  document.documentElement.style.setProperty("--hold-angle", "0deg");
  passengerState.textContent = "Trent · 4.92 ★";
  mirrorShell.style.transform = "translateX(-50%)";
  killSmall.textContent = "Do not hold";
  killText.textContent = "Kill Trent";
  killWarning.textContent = "You need the fare.";
  routeCard.classList.remove("is-urgent");
  eventFlash.textContent = "";
  outcome.hidden = true;
  updateHud();
}

function beginCountdown() {
  countdown.hidden = false;
  countdown.textContent = "3";
  [2, 1, "GO"].forEach((value, index) => {
    countdownTimers.push(
      window.setTimeout(() => {
        countdown.textContent = String(value);
        audio.tone(value === "GO" ? 720 : 360 + index * 80, 0.09, 0.05);
      }, 620 * (index + 1)),
    );
  });
  countdownTimers.push(
    window.setTimeout(() => {
      countdown.hidden = true;
      state.mode = "ride";
      showBark("This is the premium car?", "TRENT", true);
    }, 620 * 4),
  );
}

function startGame() {
  audio.start();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  startScreen.hidden = true;
  game.hidden = false;
  resetState();
  resizeCanvas();
  beginCountdown();
}

function showBark(text, speaker = "TRENT", speak = true) {
  if (state.mode === "silence" || state.mode === "disposal" || state.mode === "finished") {
    return;
  }
  barkSpeaker.textContent = speaker;
  barkText.textContent = text;
  bark.hidden = false;
  barkTimer = clamp(1.6 + text.length * 0.022, 1.8, 2.8);
  bark.style.animation = "none";
  void bark.offsetWidth;
  bark.style.animation = "";

  if (
    speak &&
    !muted &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  ) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ""));
    utterance.rate = 1.12;
    utterance.pitch = 0.82;
    utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
  }
}

function flash(text, tone = "good") {
  eventFlash.textContent = text;
  eventFlash.style.color = tone === "bad" ? "var(--red)" : "var(--acid)";
  eventFlash.classList.remove("pop");
  void eventFlash.offsetWidth;
  eventFlash.classList.add("pop");
  flashTimer = 0.7;
}

function addNerves(amount) {
  state.nerves = clamp(state.nerves + amount, 0, 100);
}

function updateInput(dt) {
  const steeringLeft = keys.has("ArrowLeft") || keys.has("KeyA") || touchInput.left;
  const steeringRight = keys.has("ArrowRight") || keys.has("KeyD") || touchInput.right;
  const braking =
    keys.has("ArrowDown") ||
    keys.has("KeyS") ||
    keys.has("Space") ||
    touchInput.brake;
  const boosting = keys.has("ArrowUp") || keys.has("KeyW") || touchInput.boost;

  const steer = (steeringRight ? 1 : 0) - (steeringLeft ? 1 : 0);
  const steeringPower = state.mode === "disposal" ? 2.45 : 3.05;
  state.vx += steer * steeringPower * dt;
  state.vx *= Math.exp(-5.6 * dt);
  state.x += state.vx * dt * (0.72 + state.speed / 18);
  state.x = clamp(state.x, -0.91, 0.91);

  if (steer !== 0) state.steeringRecently = 0.65;
  if (braking) state.brakeRecently = 0.45;
  if (boosting) state.boostRecently = 0.45;

  const cruising = state.mode === "disposal" ? 14 : 13;
  const target = braking ? 7 : boosting ? 17.5 : cruising;
  state.targetSpeed = target;
  state.speed += (target - state.speed) * Math.min(1, 3.8 * dt);

  if (state.mode === "ride") {
    addNerves(1.05 * dt);
    if (boosting) addNerves(0.55 * dt);
    if (braking) addNerves(-15 * dt);
  }

  state.steeringRecently = Math.max(0, state.steeringRecently - dt);
  state.brakeRecently = Math.max(0, state.brakeRecently - dt);
  state.boostRecently = Math.max(0, state.boostRecently - dt);
}

function spawnObstacle() {
  const density = state.mode === "disposal" ? 0.28 : 0.12 + state.elapsed / 520;
  const laneIndexes = [0, 1, 2].sort(() => random() - 0.5);
  const count = random() < density ? 2 : 1;
  const typePool =
    state.mode === "disposal"
      ? ["police", "camera", "traffic", "traffic"]
      : ["traffic", "traffic", "traffic", "van", "pothole", "cones"];

  laneIndexes.slice(0, count).forEach((laneIndex, index) => {
    state.obstacles.push({
      lane: laneIndex,
      x: LANES[laneIndex] + (random() - 0.5) * 0.08,
      p: -index * 0.12,
      type: randomChoice(typePool),
      color: randomChoice(["#66777c", "#874d42", "#446063", "#9b8c6b"]),
      hit: false,
      passed: false,
      wobble: random() * Math.PI * 2,
    });
  });
}

function addCrashParticles(x, y, color = "#f0a640") {
  for (let index = 0; index < 16; index += 1) {
    state.particles.push({
      x,
      y,
      vx: (random() - 0.5) * 230,
      vy: -random() * 170,
      life: 0.45 + random() * 0.4,
      color,
    });
  }
}

function collide(obstacle) {
  if (state.crashCooldown > 0 || obstacle.hit) return;
  obstacle.hit = true;
  state.crashCooldown = 0.8;
  state.collisions += 1;
  state.health -= 1;
  state.speed *= 0.5;
  state.vx *= -0.6;
  state.shake = 16;
  state.farePenalty += 0.8;

  if (state.mode === "ride") {
    addNerves(obstacle.type === "pothole" ? 12 : 18);
    showBark(
      obstacle.type === "pothole"
        ? "Oh, good. You found it."
        : "Do you do this professionally?",
    );
  } else {
    state.heat = clamp(state.heat + (obstacle.type === "camera" ? 28 : 22), 0, 100);
  }

  const obstaclePoint = obstacleScreenPoint(obstacle);
  addCrashParticles(obstaclePoint.x, obstaclePoint.y);
  audio.noise(0.18, 0.23);
  audio.tone(92, 0.18, 0.08, "sawtooth");
  flash(state.mode === "ride" ? "-CAR • +NERVES" : "+HEAT", "bad");

  if (navigator.vibrate) navigator.vibrate(70);
  if (state.health <= 0) finishRun("wrecked");
}

function updateObstacles(dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnObstacle();
    const pressure = state.mode === "disposal" ? 0.62 : state.elapsed / 180;
    state.spawnTimer = clamp(1.35 - pressure + random() * 0.48, 0.72, 1.6);
  }

  const playerThreshold = state.mode === "disposal" ? 0.24 : 0.22;
  state.obstacles.forEach((obstacle) => {
    obstacle.p += dt * (state.speed / 13) * (obstacle.type === "police" ? 0.34 : 0.29);
    obstacle.wobble += dt * 2;

    if (
      !obstacle.hit &&
      Math.abs(obstacle.p - PLAYER_DEPTH) < 0.052 &&
      Math.abs(obstacle.x - state.x) < playerThreshold
    ) {
      collide(obstacle);
    }

    if (!obstacle.passed && obstacle.p > PLAYER_DEPTH + 0.09) {
      obstacle.passed = true;
      const separation = Math.abs(obstacle.x - state.x);
      if (!obstacle.hit && separation < 0.39) {
        state.nearMisses += 1;
        if (state.mode === "ride") addNerves(2);
        audio.tone(510, 0.045, 0.035);
        if (state.nearMisses % 2 === 0) flash("NEAR MISS +$0.35");
      }
    }
  });

  state.obstacles = state.obstacles.filter((obstacle) => obstacle.p < 1.16);
}

function updateParticles(dt) {
  state.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 310 * dt;
    particle.life -= dt;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function updateRouteEvents() {
  const upcoming = state.routeEvents.find((event) => !event.resolved);
  state.activeRoute = null;
  if (!upcoming) return;

  const gateProgress = (state.distance - (upcoming.at - 135)) / 135;
  if (gateProgress >= 0 && gateProgress < 0.84) {
    state.activeRoute = { ...upcoming, progress: gateProgress };
    if (!upcoming.announced) {
      upcoming.announced = true;
      showBark(
        `${laneName(upcoming.trentLane).toUpperCase()}. ${laneName(upcoming.trentLane).toUpperCase()}. ${laneName(upcoming.trentLane).toUpperCase()}.`,
      );
      addNerves(5);
    }
  }

  if (gateProgress >= 0.84 && !upcoming.resolved) {
    upcoming.resolved = true;
    state.activeRoute = null;
    if (nearestLane() === upcoming.lane) {
      state.correctTurns += 1;
      state.fareBonus += 1.5;
      addNerves(3);
      flash("ROUTE +$1.50");
      audio.tone(690, 0.11, 0.05);
      showBark("Great. My driver’s an algorithm.");
    } else {
      state.wrongTurns += 1;
      state.distanceGoal += 85;
      state.farePenalty += 1.1;
      addNerves(15);
      flash("WRONG WAY +85 m", "bad");
      audio.tone(130, 0.24, 0.07, "sawtooth");
      showBark("You missed it.");
    }
  }
}

function updatePassenger(dt) {
  state.nextAmbient -= dt;
  if (state.nextAmbient > 0) return;

  let line;
  if (state.brakeRecently > 0) {
    line = randomChoice(["Are we moving?", "Commit to something.", "You can go, you know."]);
  } else if (state.boostRecently > 0) {
    line = randomChoice(["I can see the speedometer.", "Are you trying to kill me?"]);
  } else if (state.steeringRecently > 0) {
    line = randomChoice(["Pick a lane.", "Was the swerving necessary?"]);
  } else {
    line = randomChoice([
      "Is that smell permanent?",
      "So all the smells are yours.",
      "How long have you been stuck doing this?",
      "Don’t answer. Watch the road.",
      "This lane is obviously slower.",
      "One star feels generous.",
    ]);
  }

  showBark(line);
  addNerves(4.5);
  const progress = state.distance / state.distanceGoal;
  state.nextAmbient = lerp(6.2, 3.1, clamp(progress, 0, 1)) + random() * 1.2;
}

function updateRide(dt) {
  updateInput(dt);
  state.elapsed += dt;
  state.eta -= dt;
  state.distance += state.speed * dt;
  state.crashCooldown = Math.max(0, state.crashCooldown - dt);
  state.shake = Math.max(0, state.shake - dt * 24);

  updateObstacles(dt);
  updateParticles(dt);
  updateRouteEvents();
  updatePassenger(dt);

  const remaining = state.distanceGoal - state.distance;
  if (remaining <= 125) {
    state.activeRoute = {
      lane: 1,
      trentLane: 0,
      progress: clamp(1 - remaining / 125, 0, 1),
      destination: true,
    };
    if (remaining < 95 && state.hotelMisses === 0 && state.nextAmbient > 1.2) {
      state.nextAmbient = 1.2;
    }
  }

  if (remaining <= 16) {
    if (nearestLane() === 1 || state.hotelMisses >= 1) {
      finishRun("delivered");
      return;
    }
    state.hotelMisses += 1;
    state.distanceGoal += 125;
    state.eta -= 4;
    state.farePenalty += 1.5;
    addNerves(14);
    flash("MISSED HOTEL +125 m", "bad");
    showBark("You missed it.");
  }

  if (state.nerves >= 100) {
    finishRun("snapped");
  } else if (state.eta <= 0) {
    finishRun("late");
  }
}

function startDisposal() {
  state.mode = "disposal";
  state.disposalRemaining = Math.max(360, 550 - state.distance * 0.22);
  state.disposalLane = Math.floor(random() * 3);
  state.heat = 16;
  state.obstacles = [];
  state.spawnTimer = 1.4;
  state.speed = 12;
  state.silenceTimer = 0;
  phoneSos.hidden = false;
  routeCard.classList.add("is-urgent");
  audio.restore();
  audio.tone(880, 0.22, 0.06);
  flash("PHONE SOS • FIND THE ALLEY", "bad");
}

function updateSilence(dt) {
  state.silenceTimer -= dt;
  state.distance += Math.max(8, state.speed) * dt;
  state.speed += (13 - state.speed) * Math.min(1, 3 * dt);
  updateParticles(dt);
  if (state.silenceTimer <= 0) startDisposal();
}

function updateDisposal(dt) {
  updateInput(dt);
  state.elapsed += dt;
  state.disposalRemaining -= state.speed * dt;
  state.heat = clamp(state.heat + 1.55 * dt, 0, 100);
  state.crashCooldown = Math.max(0, state.crashCooldown - dt);
  state.shake = Math.max(0, state.shake - dt * 24);

  updateObstacles(dt);
  updateParticles(dt);

  const approachProgress = clamp(1 - state.disposalRemaining / 130, 0, 1);
  state.activeRoute = {
    lane: state.disposalLane,
    progress: approachProgress,
    disposal: true,
  };

  if (state.disposalRemaining <= 18 && nearestLane() === state.disposalLane) {
    finishRun("disposed");
  } else if (state.disposalRemaining <= 0 || state.heat >= 100) {
    finishRun("caught");
  }
}

function update(dt) {
  if (barkTimer > 0) {
    barkTimer -= dt;
    if (barkTimer <= 0) bark.hidden = true;
  }
  if (flashTimer > 0) {
    flashTimer -= dt;
    if (flashTimer <= 0) eventFlash.classList.remove("pop");
  }

  const gameDt = state.holdingKill ? dt * 0.28 : dt;
  if (state.mode === "ride") updateRide(gameDt);
  if (state.mode === "silence") updateSilence(dt);
  if (state.mode === "disposal") updateDisposal(gameDt);

  audio.update();
  updateHud();
}

function updateHud() {
  const pressure = state.mode === "disposal" ? state.heat : state.nerves;
  const pressureLabel = state.mode === "disposal" ? "Heat" : "Nerves";
  pressureName.textContent = pressureLabel;
  pressureValue.textContent = `${Math.round(pressure)}%`;
  pressureFill.style.width = `${pressure}%`;
  pressureTrack.setAttribute("aria-label", pressureLabel);
  pressureTrack.setAttribute("aria-valuenow", String(Math.round(pressure)));

  fareValue.textContent = state.murdered ? "$187.00" : `$${projectedFare().toFixed(2)}`;
  healthValue.textContent = `${"● ".repeat(Math.max(0, state.health))}${"○ ".repeat(Math.max(0, MAX_HEALTH - state.health))}`.trim();
  healthValue.setAttribute("aria-label", `${state.health} health remaining`);

  if (state.mode === "disposal") {
    distanceLabel.textContent = "Alley";
    distanceValue.textContent = `${Math.max(0, Math.ceil(state.disposalRemaining))} m`;
    timerLabel.textContent = "Phone SOS";
    timerValue.textContent = `${Math.max(0, Math.ceil((100 - state.heat) / 1.55))} s`;
    phoneTimer.textContent = `${Math.round(state.heat)}% traced`;
    routeKicker.textContent = "Dispose";
    routeInstruction.textContent = `${laneName(state.disposalLane)} lane`;
    routeSubtext.textContent = `${Math.max(0, Math.ceil(state.disposalRemaining))} m · police alerted`;
  } else {
    const remaining = Math.max(0, state.distanceGoal - state.distance);
    distanceLabel.textContent = "Hotel";
    distanceValue.textContent = `${Math.ceil(remaining)} m`;
    timerLabel.textContent = "ETA";
    timerValue.textContent = formatTime(state.eta);

    if (state.activeRoute && !state.activeRoute.disposal) {
      routeKicker.textContent = state.activeRoute.destination ? "Hotel entrance" : "GPS route";
      routeInstruction.textContent = `${laneName(state.activeRoute.lane)} lane`;
      routeSubtext.textContent = state.activeRoute.destination
        ? "Park in the center lane"
        : "Trent says something else";
    } else {
      routeKicker.textContent = "GPS";
      routeInstruction.textContent = "Stay on route";
      routeSubtext.textContent = `Hotel · ${Math.ceil(remaining)} m`;
    }
  }

  const buttonPressure = state.mode === "ride" ? state.nerves : 0;
  const buttonScale = 1 + buttonPressure * 0.0028;
  killButton.style.setProperty("--button-scale", buttonScale.toFixed(3));
  killButton.classList.toggle("is-tempting", buttonPressure >= 68 && !state.holdingKill);
  game.classList.toggle(
    "is-critical",
    (state.mode === "ride" && state.nerves >= 82) ||
      (state.mode === "disposal" && state.heat >= 78),
  );

  if (state.mode === "ride") {
    if (state.nerves < 45) killWarning.textContent = "You need the fare.";
    else if (state.nerves < 72) killWarning.textContent = "Just keep driving.";
    else if (state.nerves < 90) killWarning.textContent = "Do not make this worse.";
    else killWarning.textContent = "You are about to snap.";
  }
}

function roadHalfWidth(depth) {
  return lerp(viewWidth * 0.105, viewWidth * 0.48, clamp(depth, 0, 1));
}

function roadPoint(xNormalized, depth) {
  const curve = Math.sin((state.distance * 0.0025 + depth) * 2.4) * viewWidth * 0.018;
  const eased = Math.pow(clamp(depth, 0, 1), 1.52);
  return {
    x: viewWidth / 2 + curve + xNormalized * roadHalfWidth(depth),
    y: viewHeight * 0.17 + eased * viewHeight * 0.86,
  };
}

function obstacleScreenPoint(obstacle) {
  return roadPoint(obstacle.x, obstacle.p);
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
  gradient.addColorStop(0, "#101b20");
  gradient.addColorStop(0.52, "#0d171a");
  gradient.addColorStop(1, "#040606");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  ctx.fillStyle = "rgba(240, 166, 64, 0.11)";
  ctx.beginPath();
  ctx.arc(viewWidth * 0.52, viewHeight * 0.2, viewWidth * 0.16, 0, Math.PI * 2);
  ctx.fill();

  const horizon = viewHeight * 0.2;
  for (let index = 0; index < 22; index += 1) {
    const x = (index / 21) * viewWidth;
    const width = viewWidth / 18 + (index % 3) * 5;
    const height = 45 + ((index * 37) % 115);
    ctx.fillStyle = index % 2 ? "#111719" : "#0c1214";
    ctx.fillRect(x - 8, horizon - height, width, height);
    ctx.fillStyle = "rgba(240, 176, 76, 0.22)";
    for (let windowIndex = 0; windowIndex < 4; windowIndex += 1) {
      if ((index + windowIndex) % 3 !== 0) {
        ctx.fillRect(
          x + 5 + (windowIndex % 2) * 15,
          horizon - height + 15 + Math.floor(windowIndex / 2) * 24,
          3,
          5,
        );
      }
    }
  }
}

function drawRoad() {
  const horizonY = viewHeight * 0.17;
  const topHalf = roadHalfWidth(0);
  const bottomHalf = roadHalfWidth(1);
  const centerCurve = Math.sin(state.distance * 0.0025 * 2.4) * viewWidth * 0.018;

  ctx.fillStyle = "#1a2021";
  ctx.beginPath();
  ctx.moveTo(viewWidth / 2 + centerCurve - topHalf, horizonY);
  ctx.lineTo(viewWidth / 2 + centerCurve + topHalf, horizonY);
  ctx.lineTo(viewWidth / 2 + bottomHalf, viewHeight + 2);
  ctx.lineTo(viewWidth / 2 - bottomHalf, viewHeight + 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(217, 255, 72, 0.34)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(viewWidth / 2 + centerCurve - topHalf, horizonY);
  ctx.lineTo(viewWidth / 2 - bottomHalf, viewHeight);
  ctx.moveTo(viewWidth / 2 + centerCurve + topHalf, horizonY);
  ctx.lineTo(viewWidth / 2 + bottomHalf, viewHeight);
  ctx.stroke();

  const dashOffset = (state.distance / 22) % 1;
  [-0.29, 0.29].forEach((laneDivider) => {
    for (let index = -1; index < 13; index += 1) {
      const start = (index + dashOffset) / 12;
      const end = start + 0.045;
      if (start < 0 || end > 1) continue;
      const p1 = roadPoint(laneDivider, start);
      const p2 = roadPoint(laneDivider, end);
      ctx.strokeStyle = `rgba(235, 232, 214, ${0.16 + start * 0.5})`;
      ctx.lineWidth = lerp(1, 6, start);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  });

  for (let index = 0; index < 38; index += 1) {
    const x = ((index * 83 + state.elapsed * 180) % (viewWidth + 200)) - 100;
    const y = (index * 61 + state.elapsed * 530) % (viewHeight + 120) - 120;
    ctx.strokeStyle = "rgba(205, 225, 224, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 28);
    ctx.stroke();
  }
}

function drawGate() {
  if (!state.activeRoute) return;
  const gate = state.activeRoute;
  const depth = clamp(gate.progress ?? 0, 0, 0.94);
  const point = roadPoint(LANES[gate.lane], depth);
  const width = lerp(20, viewWidth * 0.16, depth);
  const height = lerp(8, 38, depth);
  const color = gate.disposal ? "#f02432" : "#d9ff48";

  ctx.save();
  ctx.globalAlpha = 0.35 + depth * 0.65;
  ctx.strokeStyle = color;
  ctx.lineWidth = lerp(2, 6, depth);
  ctx.strokeRect(point.x - width / 2, point.y - height, width, height);
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.max(9, height * 0.45)}px ui-monospace`;
  ctx.textAlign = "center";
  ctx.fillText(
    gate.disposal ? "ALLEY" : gate.destination ? "HOTEL" : "GPS",
    point.x,
    point.y - height * 0.34,
  );
  ctx.restore();
}

function drawVehicle(obstacle) {
  if (obstacle.p < -0.03) return;
  const point = obstacleScreenPoint(obstacle);
  const scale = lerp(0.14, 1.15, Math.pow(clamp(obstacle.p, 0, 1), 1.25));
  const width = 62 * scale;
  const height = (obstacle.type === "van" ? 104 : 82) * scale;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(Math.sin(obstacle.wobble) * 0.012);

  if (obstacle.type === "pothole") {
    ctx.fillStyle = "#050606";
    ctx.beginPath();
    ctx.ellipse(0, 0, width * 0.52, height * 0.13, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#343a38";
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (obstacle.type === "cones") {
    ctx.fillStyle = "#e86e2d";
    [-0.25, 0.25].forEach((offset) => {
      ctx.beginPath();
      ctx.moveTo(width * offset, -height * 0.35);
      ctx.lineTo(width * offset - width * 0.15, height * 0.25);
      ctx.lineTo(width * offset + width * 0.15, height * 0.25);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
    return;
  }

  ctx.fillStyle = obstacle.type === "police" ? "#ced7d8" : obstacle.color;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.fillStyle = "#192126";
  ctx.fillRect(-width * 0.37, -height * 0.27, width * 0.74, height * 0.3);
  ctx.fillStyle = "#ef3f42";
  ctx.fillRect(-width * 0.38, height * 0.3, width * 0.2, height * 0.08);
  ctx.fillRect(width * 0.18, height * 0.3, width * 0.2, height * 0.08);

  if (obstacle.type === "police") {
    ctx.fillStyle = Math.floor(state.elapsed * 8) % 2 ? "#ef2635" : "#3a7dff";
    ctx.fillRect(-width * 0.25, -height * 0.06, width * 0.5, height * 0.08);
  }
  if (obstacle.type === "camera") {
    ctx.strokeStyle = "#f02432";
    ctx.lineWidth = 5 * scale;
    ctx.strokeRect(-width * 0.56, -height * 0.62, width * 1.12, height * 1.24);
  }
  ctx.restore();
}

function drawPlayer() {
  const point = roadPoint(state.x, PLAYER_DEPTH);
  const size = clamp(viewWidth * 0.065, 48, 78);
  const lean = clamp(state.vx * 0.2, -0.1, 0.1);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(lean);
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#090c0d";
  ctx.fillRect(-size * 0.52, -size * 0.92, size * 1.04, size * 1.65);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#33484b";
  ctx.fillRect(-size * 0.45, -size * 0.82, size * 0.9, size * 1.45);
  ctx.fillStyle = "#101719";
  ctx.fillRect(-size * 0.34, -size * 0.58, size * 0.68, size * 0.52);
  ctx.fillStyle = "#ef323e";
  ctx.fillRect(-size * 0.36, size * 0.47, size * 0.2, size * 0.09);
  ctx.fillRect(size * 0.16, size * 0.47, size * 0.2, size * 0.09);
  ctx.fillStyle = "#d9ff48";
  ctx.fillRect(-size * 0.06, size * 0.5, size * 0.12, size * 0.05);
  ctx.restore();
}

function drawParticles() {
  state.particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 4, 4);
  });
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const pressure = state.mode === "disposal" ? state.heat : state.nerves;
  const alpha = clamp((pressure - 48) / 115, 0, 0.38);
  if (alpha <= 0) return;
  const gradient = ctx.createRadialGradient(
    viewWidth / 2,
    viewHeight / 2,
    viewWidth * 0.18,
    viewWidth / 2,
    viewHeight / 2,
    viewWidth * 0.68,
  );
  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(1, `rgba(156, 0, 15, ${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function render() {
  ctx.save();
  const shakeX = state.shake > 0 ? (random() - 0.5) * state.shake : 0;
  const shakeY = state.shake > 0 ? (random() - 0.5) * state.shake * 0.55 : 0;
  ctx.translate(shakeX, shakeY);
  drawSky();
  drawRoad();
  drawGate();
  [...state.obstacles]
    .sort((a, b) => a.p - b.p)
    .forEach(drawVehicle);
  drawPlayer();
  drawParticles();
  drawVignette();
  ctx.restore();
}

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.033);
  lastFrame = now;
  if (!game.hidden) {
    update(dt);
    render();
  }
  animationFrame = requestAnimationFrame(loop);
}

function startKillHold(event) {
  if (state.mode !== "ride" || state.holdingKill || killButton.disabled) return;
  if (event) event.preventDefault();
  state.holdingKill = true;
  killStartedAt = performance.now();
  killButton.classList.add("is-holding");
  killSmall.textContent = "Let go to";
  killText.textContent = "Keep driving";
  audio.tone(72, 0.16, 0.035, "sine");
  if ("speechSynthesis" in window) window.speechSynthesis.pause();

  const updateHold = (now) => {
    if (!state.holdingKill) return;
    const progress = clamp((now - killStartedAt) / KILL_HOLD_MS, 0, 1);
    document.documentElement.style.setProperty(
      "--hold-angle",
      `${progress * 360}deg`,
    );
    audio.setMuffled(progress);
    if (progress >= 1) {
      killFrame = 0;
      killPassenger();
      return;
    }
    killFrame = requestAnimationFrame(updateHold);
  };
  killFrame = requestAnimationFrame(updateHold);
}

function cancelKillHold() {
  if (!state.holdingKill) return;
  state.holdingKill = false;
  if (killFrame) cancelAnimationFrame(killFrame);
  killFrame = 0;
  document.documentElement.style.setProperty("--hold-angle", "0deg");
  killButton.classList.remove("is-holding");
  killSmall.textContent = "Do not hold";
  killText.textContent = "Kill Trent";
  audio.setMuffled(0);
  if ("speechSynthesis" in window) {
    window.speechSynthesis.resume();
    if (state.mode === "ride") {
      window.setTimeout(() => showBark("Eyes on the road."), 120);
    }
  }
}

function killPassenger() {
  if (state.mode !== "ride") return;
  state.holdingKill = false;
  state.murdered = true;
  state.mode = "silence";
  state.silenceTimer = 2;
  state.nerves = 0;
  state.obstacles = [];
  state.activeRoute = null;
  killButton.disabled = true;
  killButton.classList.remove("is-holding", "is-tempting");
  document.documentElement.style.setProperty("--hold-angle", "360deg");
  killSmall.textContent = "Passenger";
  killText.textContent = "Silenced";
  killWarning.textContent = "That helped.";
  game.classList.add("is-killed");
  passengerState.textContent = "Passenger silenced";
  bark.hidden = true;
  phoneSos.hidden = true;
  routeKicker.textContent = "No active route";
  routeInstruction.textContent = "Continue straight";
  routeSubtext.textContent = "…";
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  audio.noise(0.2, 0.3);
  audio.tone(74, 0.22, 0.1, "sawtooth");
  window.setTimeout(() => audio.silence(), 90);
  state.shake = 22;
  flash("SILENCE");
  if (navigator.vibrate) navigator.vibrate([80, 50, 120]);
}

function resultItem(label, value, tone = "") {
  return `<div class="result"><span>${label}</span><strong class="${tone}">${value}</strong></div>`;
}

function finishRun(kind) {
  if (state.mode === "finished") return;
  state.mode = "finished";
  state.resultShown = true;
  keys.clear();
  state.holdingKill = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  killButton.disabled = true;
  phoneSos.hidden = true;
  audio.setMuffled(0);
  audio.tone(kind === "delivered" || kind === "disposed" ? 620 : 110, 0.24, 0.07);

  const fare = projectedFare();
  const definitions = {
    delivered: {
      kicker: "Passenger delivered alive",
      title: "You kept it together.",
      copy: "Trent gave you one star anyway. You still earned the fare, kept the police out of it, and can accept another ride immediately.",
      bad: false,
      stats: [
        ["Fare", `+$${fare.toFixed(2)}`, "good"],
        ["Collisions", String(state.collisions), state.collisions ? "bad" : "good"],
        ["Wrong turns", String(state.wrongTurns), state.wrongTurns ? "bad" : "good"],
        ["Near misses", String(state.nearMisses), "good"],
        ["Final nerves", `${Math.round(state.nerves)}%`, ""],
        ["Passenger", "Alive", "good"],
      ],
    },
    disposed: {
      kicker: "Body disposed · police alerted",
      title: "Problem relocated.",
      copy: "The ride is gone, the car is ruined, and the city is looking for you. But Trent is finally quiet—and you made rent.",
      bad: true,
      stats: [
        ["Wallet + watch", "+$187.00", "good"],
        ["Cleaning", "-$75.00", "bad"],
        ["Net cash", "+$112.00", "good"],
        ["Heat", `${Math.round(state.heat)}%`, "bad"],
        ["Collisions", String(state.collisions), state.collisions ? "bad" : ""],
        ["Body", "Gone", "good"],
      ],
    },
    caught: {
      kicker: "Police intercepted the vehicle",
      title: "Absolutely worth it?",
      copy: "The silence was excellent. The escape was not. Trent’s phone finished the call before you reached the alley.",
      bad: true,
      stats: [
        ["Stolen cash", "$187.00", "good"],
        ["Usable cash", "$0.00", "bad"],
        ["Heat", "100%", "bad"],
        ["Collisions", String(state.collisions), "bad"],
        ["Rent", "Unpaid", "bad"],
        ["Passenger", "Still a problem", "bad"],
      ],
    },
    wrecked: {
      kicker: "Vehicle disabled",
      title: "Shift over.",
      copy: state.murdered
        ? "The body is still in the car. The sirens are getting louder."
        : "Trent climbs out, photographs the damage, and cancels the ride before you can say anything.",
      bad: true,
      stats: [
        ["Fare", "$0.00", "bad"],
        ["Collisions", String(state.collisions), "bad"],
        ["Car health", "0", "bad"],
        ["Rent", "Unpaid", "bad"],
        ["Heat", `${Math.round(state.heat)}%`, state.heat ? "bad" : ""],
        ["Passenger", state.murdered ? "In vehicle" : "Alive", "bad"],
      ],
    },
    snapped: {
      kicker: "Nerves reached 100%",
      title: "You pulled over.",
      copy: "Trent canceled the ride while explaining that your emotional instability made him feel unsafe.",
      bad: true,
      stats: [
        ["Fare", "$0.00", "bad"],
        ["Nerves", "100%", "bad"],
        ["Distance left", `${Math.ceil(state.distanceGoal - state.distance)} m`, "bad"],
        ["Collisions", String(state.collisions), ""],
        ["Rent", "Unpaid", "bad"],
        ["Passenger", "Still talking", "bad"],
      ],
    },
    late: {
      kicker: "Passenger canceled",
      title: "Too slow.",
      copy: "You stayed calm by barely moving. Trent got out in traffic and reported you through the app.",
      bad: true,
      stats: [
        ["Fare", "$0.00", "bad"],
        ["Time", "Expired", "bad"],
        ["Nerves", `${Math.round(state.nerves)}%`, ""],
        ["Distance left", `${Math.ceil(state.distanceGoal - state.distance)} m`, "bad"],
        ["Rent", "Unpaid", "bad"],
        ["Passenger", "Alive", "good"],
      ],
    },
  };

  const result = definitions[kind];
  outcomeKicker.textContent = result.kicker;
  outcomeTitle.textContent = result.title;
  outcomeCopy.textContent = result.copy;
  outcomeCard.classList.toggle("is-bad", result.bad);
  results.innerHTML = result.stats
    .map(([label, value, tone]) => resultItem(label, value, tone))
    .join("");

  window.setTimeout(() => {
    outcome.hidden = false;
    restartButton.focus();
  }, 420);
}

function setTouchControl(event, down) {
  const button = event.currentTarget;
  const control = button.dataset.control;
  event.preventDefault();
  touchInput[control] = down;
  button.classList.toggle("is-down", down);
  if (down && control === "left") state.vx -= 0.48;
  if (down && control === "right") state.vx += 0.48;
  if (down && button.setPointerCapture && event.pointerId !== undefined) {
    button.setPointerCapture(event.pointerId);
  }
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

killButton.addEventListener("pointerdown", startKillHold);
killButton.addEventListener("pointerup", cancelKillHold);
killButton.addEventListener("pointercancel", cancelKillHold);
killButton.addEventListener("pointerleave", cancelKillHold);
killButton.addEventListener("contextmenu", (event) => event.preventDefault());
killButton.addEventListener("click", (event) => event.preventDefault());

touchButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => setTouchControl(event, true));
  button.addEventListener("pointerup", (event) => setTouchControl(event, false));
  button.addEventListener("pointercancel", (event) => setTouchControl(event, false));
  button.addEventListener("pointerleave", (event) => setTouchControl(event, false));
});

document.addEventListener("keydown", (event) => {
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(
      event.code,
    )
  ) {
    event.preventDefault();
  }
  if (!event.repeat && ["ArrowLeft", "KeyA"].includes(event.code)) {
    state.vx -= 0.48;
  }
  if (!event.repeat && ["ArrowRight", "KeyD"].includes(event.code)) {
    state.vx += 0.48;
  }
  keys.add(event.code);
  if (event.code === "KeyK" && !event.repeat) startKillHold(event);
  if (event.code === "KeyM" && !event.repeat) soundButton.click();
  if (event.code === "KeyR" && !event.repeat && state.mode === "finished") {
    startGame();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "KeyK") cancelKillHold();
});

window.addEventListener("blur", () => {
  keys.clear();
  Object.keys(touchInput).forEach((key) => {
    touchInput[key] = false;
  });
  cancelKillHold();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    cancelKillHold();
  }
});

soundButton.addEventListener("click", () => {
  audio.start();
  audio.setMuted(!muted);
  soundButton.setAttribute("aria-pressed", String(!muted));
  soundLabel.textContent = muted ? "Sound off" : "Sound on";
  if (muted && "speechSynthesis" in window) window.speechSynthesis.cancel();
});

window.addEventListener("resize", resizeCanvas);
if ("ResizeObserver" in window) {
  new ResizeObserver(resizeCanvas).observe(gameStage);
}

animationFrame = requestAnimationFrame(loop);
