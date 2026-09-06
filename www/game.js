// ============================================================
//  WIREFRAME DUNGEON — Wizardry-style first-person crawler
//  + Cube Slimes
// ============================================================

const CELL = 4;
const GREEN = 0x00ff66;
const SLIME_GREEN = 0x33ff99;

let scene, camera, renderer;
let player = { x: 1.5, z: 1.5, dir: 0 }; // 0=N,1=E,2=S,3=W
let moving = false;
let mapW = 15, mapH = 15;
let map = [];
let explored = [];
let leftHand, rightHand, weaponGroup, shieldGroup;
let clock = new THREE.Clock();
let stats = { hp: 35, maxHp: 40, mp: 10, maxMp: 10, lvl: 4, floor: 'B1F', floorNum: 1, kills: 0, herbs: 1, weapon: 0, kings: 0, dmgTaken: 0, herbsUsed: 0, deepest: 1, log: [], poison: 0, shield: 8, maxShield: 8 };
let guarding = false;
const WEAPONS = [
  { name: 'DAGGER', min: 4, extra: 4 },
  { name: 'LONG DAGGER', min: 6, extra: 4 },
  { name: 'RUNE BLADE', min: 8, extra: 5 },
  { name: 'KING SLAYER', min: 11, extra: 6 }
];
let messageTimer = 0;
function logEvent(text) {
  if (!stats.log) stats.log = [];
  stats.log.push(text);
  if (stats.log.length > 12) stats.log = stats.log.slice(-12);
}

let enemies = [];
let items = [];
let playerBusy = false; // during attack anim etc.
let dead = false;
let worldGroup = null;
let stairs = null;
let stairsLocked = false;
let savePoint = null;
let secretRoom = null;
let shots = [];
let torchFlames = [];
const SAVE_KEY = 'wfd_save_v1';
const debug = { open: false, god: false, unlocked: false };
let shakeTime = 0;
let shakeMag = 0;

// ============================================================
//  8-BIT AUDIO (Web Audio — no files needed)
// ============================================================
const SFX = {
  ctx: null, master: null, music: null, sfx: null,
  muted: false, bgmOff: false, sfxOff: false, started: false, step: 0, timer: null, bossOn: false
};
const CFG_KEY = 'wfd_cfg_v1';
const cfg = { open: false };

// D-minor dungeon scale (Hz)
const N = {
  C2:65.41, D2:73.42, E2:82.41, F2:87.31, G2:98.00, A2:110.00, Bb2:116.54, C3:130.81,
  D3:146.83, E3:164.81, F3:174.61, G3:196.00, A3:220.00, Bb3:233.08, C4:261.63,
  D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, Bb4:466.16, C5:523.25, D5:587.33, F5:698.46
};

function audioInit() {
  if (SFX.ctx) {
    if (SFX.ctx.state === 'suspended') SFX.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  SFX.ctx = new Ctx();
  SFX.master = SFX.ctx.createGain();
  SFX.master.gain.value = 0.72;
  SFX.master.connect(SFX.ctx.destination);
  SFX.music = SFX.ctx.createGain();
  SFX.music.gain.value = 0.7;
  SFX.music.connect(SFX.master);
  SFX.sfx = SFX.ctx.createGain();
  SFX.sfx.gain.value = 0.9;
  SFX.sfx.connect(SFX.master);
  applyAudioGains();
}

function beep(freq, type, dur, vol, dest, slide) {
  if (!SFX.ctx) return;
  dest = dest || SFX.sfx;
  if (dest === SFX.sfx && SFX.sfxOff) return;
  if (dest === SFX.music && (SFX.bgmOff || SFX.muted)) return;
  const t = SFX.ctx.currentTime;
  const o = SFX.ctx.createOscillator();
  const g = SFX.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, vol, hp) {
  if (!SFX.ctx || SFX.sfxOff) return;
  const t = SFX.ctx.currentTime;
  const len = Math.max(1, Math.floor(SFX.ctx.sampleRate * dur));
  const buf = SFX.ctx.createBuffer(1, len, SFX.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = SFX.ctx.createBufferSource();
  src.buffer = buf;
  const f = SFX.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = hp || 1200;
  f.Q.value = 0.8;
  const g = SFX.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(SFX.sfx);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function sfxSlash() {
  beep(880, 'square', 0.08, 0.22, SFX.sfx, 220);
  noise(0.07, 0.18, 2500);
}
function sfxHit() {
  beep(220, 'square', 0.09, 0.28, SFX.sfx, 90);
  noise(0.06, 0.2, 600);
}
function sfxKill() {
  beep(392, 'square', 0.08, 0.22, SFX.sfx);
  setTimeout(() => beep(523, 'square', 0.08, 0.22, SFX.sfx), 80);
  setTimeout(() => beep(784, 'square', 0.16, 0.2, SFX.sfx), 160);
}
function sfxHurt() {
  beep(180, 'sawtooth', 0.16, 0.22, SFX.sfx, 70);
  noise(0.12, 0.16, 400);
}
function sfxBlocked() {
  beep(90, 'square', 0.08, 0.18, SFX.sfx);
}
function sfxStep() {
  beep(70, 'triangle', 0.05, 0.08, SFX.sfx);
}
function sfxMiss() {
  beep(300, 'square', 0.05, 0.1, SFX.sfx, 180);
}
function sfxHeal() {
  beep(392, 'triangle', 0.08, 0.2, SFX.sfx);
  setTimeout(() => beep(523, 'triangle', 0.1, 0.2, SFX.sfx), 70);
  setTimeout(() => beep(659, 'triangle', 0.16, 0.18, SFX.sfx), 140);
}
function sfxPickup() {
  beep(523, 'square', 0.05, 0.14, SFX.sfx);
  setTimeout(() => beep(659, 'square', 0.05, 0.16, SFX.sfx), 55);
  setTimeout(() => beep(784, 'square', 0.05, 0.16, SFX.sfx), 110);
  setTimeout(() => beep(1046, 'triangle', 0.16, 0.18, SFX.sfx), 165);
}
function sfxStairs() {
  // shuffle / "za za" foot scrapes down steps — not a chime
  const scrapes = [0, 110, 220, 340, 470];
  scrapes.forEach(function(ms, i) {
    setTimeout(function() {
      noise(0.07 + i * 0.01, 0.22, 900 - i * 80);
      beep(90 - i * 8, 'triangle', 0.05, 0.1, SFX.sfx);
    }, ms);
  });
}

// 64-step D-minor dungeon loop (~92 BPM 8ths)
const BASS = [
  N.D2,0,N.D2,0, N.A2,0,N.D2,0,  N.F2,0,N.F2,0, N.C3,0,N.F2,0,
  N.G2,0,N.G2,0, N.D2,0,N.G2,0,  N.A2,0,N.F2,0, N.E2,0,N.D2,0,
  N.D2,0,0,N.D2, N.A2,0,N.D2,0,  N.Bb2,0,N.F2,0, N.C3,0,N.F2,0,
  N.G2,0,N.D3,0, N.A2,0,N.F2,0,  N.E2,0,N.A2,0, N.D2,0,0,0
];
const MELO = [
  N.D4,0,N.F4,0, N.A4,N.G4,0,0,  N.F4,0,N.E4,N.D4, 0,N.C4,N.D4,0,
  0,0,N.F4,0, N.G4,N.A4,0,N.Bb4,  0,N.A4,0,N.G4, N.F4,N.E4,0,0,
  N.A4,0,0,N.F4, 0,N.G4,N.A4,0,  N.Bb4,0,N.A4,0, N.G4,0,N.F4,0,
  N.E4,0,N.D4,0, N.C4,N.D4,0,0,  0,N.A3,0,N.C4, N.D4,0,0,0
];
const PAD = [
  N.D3,0,0,0, 0,0,N.A3,0,  N.F3,0,0,0, 0,0,N.C4,0,
  N.G3,0,0,0, 0,0,N.D3,0,  N.A3,0,0,0, N.F3,0,0,0,
  N.D3,0,0,0, 0,0,0,N.A3,  N.F3,0,0,0, 0,N.Bb3,0,0,
  N.G3,0,0,0, N.A3,0,0,0,  N.F3,0,N.E3,0, N.D3,0,0,0
];
const ARP = [
  0,N.A4,0,N.D5, 0,0,N.A4,0,  0,N.F4,0,N.A4, 0,0,N.C5,0,
  0,0,N.G4,0, 0,N.D5,0,0,  0,N.A4,0,N.F4, 0,0,0,0,
  0,N.D5,0,N.A4, 0,0,N.F4,0,  0,N.Bb4,0,N.A4, 0,0,N.G4,0,
  0,0,N.E4,0, 0,N.D4,0,0,  0,N.A3,0,0, 0,0,0,0
];

const BOSS_BASS = [
  N.D2,N.D2,0,N.D2, N.D2,0,N.A2,N.D2,
  N.D2,N.D2,0,N.D2, N.F2,0,N.A2,N.D2,
  N.C3,N.C3,0,N.C3, N.Bb2,0,N.A2,N.G2,
  N.D2,N.D2,N.A2,N.D2, N.F2,N.D2,N.A2,N.D2
];
const BOSS_MELO = [
  N.A4,0,N.A4,0, N.D5,0,N.A4,0,
  N.Bb4,0,N.A4,N.G4, 0,N.A4,0,0,
  N.F4,0,N.G4,0, N.A4,N.D5,0,N.A4,
  N.G4,0,N.F4,N.E4, N.D4,0,N.A3,0
];
const BOSS_LEAD = [
  0,0,N.D5,0, 0,0,N.F5,0,
  0,N.D5,0,0, N.C5,0,N.A4,0,
  0,0,N.Bb4,0, 0,N.A4,0,N.D5,
  0,0,N.A4,0, N.F4,0,0,0
];

const CORE_BASS = [
  N.D2,N.D2,N.A2,N.D2, N.D2,N.D2,N.A2,N.F2,
  N.D2,N.D2,N.A2,N.D2, N.C3,N.D2,N.A2,N.D2,
  N.F2,N.F2,N.C3,N.F2, N.G2,N.G2,N.D3,N.G2,
  N.A2,N.D2,N.A2,N.D2, N.F2,N.A2,N.D3,N.D2
];
const CORE_MELO = [
  N.D5,0,N.A4,0, N.D5,N.F5,0,N.A4,
  N.Bb4,0,N.A4,N.G4, N.A4,0,N.D5,0,
  N.F5,0,N.D5,0, N.C5,N.A4,0,N.D5,
  N.A4,N.G4,N.F4,N.A4, N.D5,0,N.A4,0
];
const CORE_PAD = [
  N.D3,0,N.A3,0, N.D3,0,0,N.A3,
  N.F3,0,N.C4,0, N.F3,0,0,0,
  N.G3,0,N.D4,0, N.A3,0,N.F3,0,
  N.D3,0,N.A3,N.D4, 0,N.A3,0,N.D3
];

function musicMode() {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.kind === 'core') return 'core';
    if (e.kind === 'king') return 'king';
  }
  return 'explore';
}

function musicTick() {
  if (!SFX.ctx || SFX.muted || SFX.bgmOff || !SFX.started) return;
  const mode = musicMode();
  if (mode !== SFX.mode) {
    SFX.mode = mode;
    SFX.step = 0;
    if (mode === 'king') {
      beep(N.D3, 'sawtooth', 0.18, 0.14, SFX.music);
      setTimeout(function() { beep(N.A3, 'sawtooth', 0.16, 0.14, SFX.music); }, 90);
      setTimeout(function() { beep(N.D4, 'square', 0.22, 0.16, SFX.music); }, 180);
    }
    if (mode === 'core') {
      beep(N.D3, 'sawtooth', 0.12, 0.16, SFX.music);
      setTimeout(function() { beep(N.A3, 'square', 0.1, 0.16, SFX.music); }, 70);
      setTimeout(function() { beep(N.D4, 'square', 0.12, 0.18, SFX.music); }, 140);
      setTimeout(function() { beep(N.A4, 'square', 0.16, 0.16, SFX.music); }, 210);
    }
  }
  if (mode === 'king') {
    const i = SFX.step % 32;
    if (BOSS_BASS[i]) beep(BOSS_BASS[i], 'square', 0.14, 0.22, SFX.music);
    if (BOSS_MELO[i]) beep(BOSS_MELO[i], 'square', 0.12, 0.14, SFX.music);
    if (BOSS_LEAD[i]) beep(BOSS_LEAD[i], 'triangle', 0.16, 0.1, SFX.music);
    if (i % 2 === 0) noise(0.025, 0.05, 2800);
    if (i % 8 === 0) noise(0.06, 0.08, 400);
  } else if (mode === 'core') {
    const i = (SFX.step * 2) % 32;
    const j = (SFX.step * 2 + 1) % 32;
    if (CORE_BASS[i]) beep(CORE_BASS[i], 'square', 0.11, 0.2, SFX.music);
    if (CORE_BASS[j]) beep(CORE_BASS[j], 'square', 0.09, 0.14, SFX.music);
    if (CORE_MELO[i]) beep(CORE_MELO[i], 'square', 0.1, 0.13, SFX.music);
    if (CORE_PAD[i]) beep(CORE_PAD[i], 'triangle', 0.22, 0.08, SFX.music);
    if (i % 2 === 0) noise(0.02, 0.05, 3200);
    if (i % 4 === 0) noise(0.05, 0.07, 380);
  } else {
    const i = SFX.step % 64;
    if (BASS[i]) beep(BASS[i], 'square', 0.2, 0.18, SFX.music);
    if (MELO[i]) beep(MELO[i], 'triangle', 0.24, 0.15, SFX.music);
    if (PAD[i])  beep(PAD[i], 'triangle', 0.42, 0.07, SFX.music);
    if (ARP[i])  beep(ARP[i], 'square', 0.1, 0.07, SFX.music);
    if (i % 4 === 0) noise(0.03, 0.03, 3200);
  }
  SFX.step++;
}

function startMusic() {
  audioInit();
  if (SFX.ctx && SFX.ctx.state === 'suspended') {
    SFX.ctx.resume().catch(function() {});
  }
  applyAudioGains();
  if (SFX.timer) return;
  SFX.started = true;
  SFX.step = SFX.step || 0;
  const interval = (60 / 92) * 500;
  SFX.timer = setInterval(musicTick, interval);
  musicTick();
}

function loadCfg() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    SFX.bgmOff = !!d.bgmOff;
    SFX.sfxOff = !!d.sfxOff;
    SFX.muted = !!d.muted;
    debug.unlocked = !!d.debugUnlocked;
  } catch (err) {}
}

function saveCfg() {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify({
      bgmOff: SFX.bgmOff,
      sfxOff: SFX.sfxOff,
      muted: SFX.muted,
      debugUnlocked: !!debug.unlocked
    }));
  } catch (err) {}
}

function applyAudioGains() {
  if (SFX.music) SFX.music.gain.value = (SFX.bgmOff || SFX.muted) ? 0 : 0.7;
  if (SFX.sfx) SFX.sfx.gain.value = SFX.sfxOff ? 0 : 0.9;
  if (SFX.master) SFX.master.gain.value = 0.72;
}

function refreshCfgButtons() {
  const bgm = document.getElementById('cfg-bgm');
  const sfx = document.getElementById('cfg-sfx');
  if (bgm) {
    bgm.textContent = SFX.bgmOff ? 'BGM OFF' : 'BGM ON';
    bgm.classList.toggle('on', !SFX.bgmOff);
  }
  if (sfx) {
    sfx.textContent = SFX.sfxOff ? 'SFX OFF' : 'SFX ON';
    sfx.classList.toggle('on', !SFX.sfxOff);
  }
}

function setupConfig() {
  loadCfg();
  function bindTap(el, fn) {
    if (!el) return;
    let lock = 0;
    function run(e) {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lock < 350) return;
      lock = now;
      fn(e);
    }
    el.addEventListener('pointerup', run);
    el.addEventListener('touchend', run, { passive: false });
    el.addEventListener('click', run);
  }
  bindTap(document.getElementById('cfg-btn'), toggleConfig);
  bindTap(document.getElementById('cfg-close'), function() { setConfig(false); });
  bindTap(document.getElementById('cfg-scrim'), function() { setConfig(false); });
  bindTap(document.getElementById('cfg-bgm'), function() {
    SFX.bgmOff = !SFX.bgmOff;
    applyAudioGains();
    saveCfg();
    refreshCfgButtons();
  });
  bindTap(document.getElementById('cfg-sfx'), function() {
    SFX.sfxOff = !SFX.sfxOff;
    applyAudioGains();
    saveCfg();
    refreshCfgButtons();
  });
  bindTap(document.getElementById('cfg-title'), goToTitle);
  refreshCfgButtons();
}

function syncMobileLock() {
  const mob = document.getElementById('mobile-controls');
  if (!mob) return;
  const lock = debug.open || cfg.open;
  mob.style.pointerEvents = lock ? 'none' : '';
  mob.style.opacity = '';
}

function leaveTitle() {
  const title = document.getElementById('title-screen');
  if (title) title.style.display = 'none';
  document.body.classList.remove('titled');
}

function toggleConfig() {
  setConfig(!cfg.open);
}

function setConfig(on) {
  cfg.open = !!on;
  const panel = document.getElementById('cfg-panel');
  const scrim = document.getElementById('cfg-scrim');
  const mob = document.getElementById('mobile-controls');
  if (panel) panel.style.display = cfg.open ? 'block' : 'none';
  if (scrim) scrim.style.display = cfg.open ? 'block' : 'none';
  syncMobileLock();
  refreshCfgButtons();
}

function goToTitle() {
  if (inPlay() && !dead) writeSave();
  setConfig(false);
  const title = document.getElementById('title-screen');
  if (title) title.style.display = 'flex';
  document.body.classList.add('titled');
  labelContinue();
}

function toggleMute() {
  SFX.bgmOff = !SFX.bgmOff;
  applyAudioGains();
  saveCfg();
  refreshCfgButtons();
}

function revealDebug() {
  debug.unlocked = true;
  const btn = document.getElementById('dbg-btn');
  if (btn) btn.classList.add('show');
}

function setupDebug() {
  const btn = document.getElementById('dbg-btn');
  const panel = document.getElementById('debug-panel');
  function bindTap(el, fn) {
    if (!el) return;
    let lock = 0;
    function run(e) {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lock < 350) return;
      lock = now;
      fn(e);
    }
    el.addEventListener('pointerup', run);
    el.addEventListener('touchend', run, { passive: false });
    el.addEventListener('click', run);
  }
  bindTap(btn, toggleDebug);
  if (debug.unlocked) revealDebug();
  const title = document.querySelector('#title-screen h1');
  let taps = 0;
  let last = 0;
  function titleTap(e) {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - last < 80) return;
    if (now - last > 1200) taps = 0;
    last = now;
    taps++;
    if (taps >= 7) {
      taps = 0;
      if (!debug.unlocked) {
        revealDebug();
        saveCfg();
        if (typeof sfxPickup === 'function') sfxPickup();
        showMsg('DEBUG unlocked');
      }
    }
  }
  if (title) {
    title.addEventListener('pointerup', titleTap);
    title.addEventListener('click', titleTap);
  }
  if (!panel) return;
  panel.querySelectorAll('button').forEach(function(b) {
    bindTap(b, function() {
      const act = b.getAttribute('data-dbg');
      if (act === 'god') dbgGod(b);
      else if (act === 'heal') dbgHeal();
      else if (act === 'gear') dbgGear();
      else if (act === 'unlock') { stairsLocked = false; showMsg('Stairs unlocked'); }
      else if (act === 'floor') dbgFloor(+b.getAttribute('data-n'));
      else if (act === 'spawn') dbgSpawn(b.getAttribute('data-k'));
    });
  });
}

function toggleDebug() {
  if (!debug.unlocked) return;
  setDebug(!debug.open);
}

function setDebug(on) {
  debug.open = !!on;
  const panel = document.getElementById('debug-panel');
  const scrim = document.getElementById('debug-scrim');
  if (panel) panel.style.display = debug.open ? 'block' : 'none';
  if (scrim) scrim.style.display = debug.open ? 'block' : 'none';
  syncMobileLock();
}

function dbgGod(btn) {
  debug.god = !debug.god;
  if (btn) btn.classList.toggle('on', debug.god);
  showMsg(debug.god ? 'GOD MODE ON' : 'GOD MODE OFF');
}

function dbgHeal() {
  dead = false;
  stats.hp = stats.maxHp;
  stats.mp = stats.maxMp;
  stats.poison = 0;
  const storm = document.getElementById('death-noise');
  if (storm) { storm.style.display = 'none'; storm.style.opacity = '0'; }
  const retry = document.getElementById('retry-btn');
  if (retry) retry.style.display = 'none';
  updateHUD();
  showMsg('HP/MP restored');
}

function dbgGear() {
  stats.herbs = 9;
  stats.weapon = WEAPONS.length - 1;
  stats.shield = stats.maxShield || 8;
  guarding = false;
  if (leftHand) leftHand.scale.set(1, 1, 1);
  refreshWeapon();
  updateShieldVis();
  updateHUD();
  showMsg('KING SLAYER + herbs + SHIELD');
}

function dbgFloor(n) {
  leaveTitle();
  dead = false;
  moving = false;
  playerBusy = false;
  stats.floorNum = n;
  if (stats.floorNum > (stats.deepest || 1)) stats.deepest = stats.floorNum;
  logEvent('DEBUG jump B' + n + 'F');
  startMusic();
  loadFloor(true);
  setDebug(false);
}

function dbgSpawn(kind) {
  leaveTitle();
  const v = DIR_VEC[player.dir];
  const gx = Math.floor(player.x) + v.x * 2;
  const gz = Math.floor(player.z) + v.z * 2;
  if (gx < 1 || gz < 1 || gx >= mapW - 1 || gz >= mapH - 1) {
    showMsg('No spawn space');
    return;
  }
  map[gz][gx] = 0;
  const occ = getEnemyAt(gx, gz);
  if (occ && occ.mesh) {
    occ.alive = false;
    worldGroup.remove(occ.mesh);
  }
  const opts = { gx: gx, gz: gz, kind: kind, size: 1, hp: 16, maxHp: 16 };
  if (kind === 'small') { opts.kind = 'slime'; opts.size = 0.55; opts.hp = 8; opts.maxHp = 8; }
  if (kind === 'splitter') { opts.kind = 'slime'; opts.canSplit = true; }
  if (kind === 'mimic') { opts.awake = false; opts.hp = 20; opts.maxHp = 20; }
  if (kind === 'golem') { opts.hp = 28; opts.maxHp = 28; }
  if (kind === 'spider') { opts.kind = 'king'; opts.form = 'spider'; opts.size = 0.95; opts.hp = 40; opts.maxHp = 40; stairsLocked = true; }
  if (kind === 'jelly') { opts.kind = 'king'; opts.form = 'jelly'; opts.size = 0.95; opts.hp = 40; opts.maxHp = 40; stairsLocked = true; }
  if (kind === 'toxking') { opts.kind = 'king'; opts.form = 'toxic'; opts.toxic = true; opts.size = 0.95; opts.hp = 44; opts.maxHp = 44; stairsLocked = true; }
  if (kind === 'king') { opts.size = 0.95; opts.hp = 40; opts.maxHp = 40; stairsLocked = true; }
  if (kind === 'core') { opts.size = 1.05; opts.hp = 60; opts.maxHp = 60; stairsLocked = true; }
  addEnemy(opts);
  showMsg('Spawned ' + kind.toUpperCase());
}

function applyPoison(turns) {
  if (debug.god) return;
  const next = Math.max(stats.poison || 0, turns);
  stats.poison = next;
  showMsg('POISONED  (' + next + ')');
  flashScreen('rgba(136,255,68,0.35)', 280);
  updateHUD();
}

function tickPoison() {
  if (dead || !stats.poison) return;
  if (debug.god) { stats.poison = 0; updateHUD(); return; }
  stats.poison--;
  const dmg = 1;
  hurtPlayer(dmg, stats.poison > 0 ? ('Poison ticks  -' + dmg + '  (' + stats.poison + ')') : 'Poison fades  -' + dmg, { pierce: true });
}

function hurtPlayer(dmg, msg, opts) {
  if (debug.god) {
    showMsg('GOD — blocked');
    return true;
  }
  opts = opts || {};
  if (!opts.pierce && guarding && stats.shield > 0) {
    const reduced = Math.max(1, Math.ceil(dmg * 0.4));
    stats.shield -= 1;
    dmg = reduced;
    msg = 'BLOCK  -' + dmg + '  SHIELD ' + stats.shield;
    sfxBlock();
    flashScreen('rgba(0,255,102,0.28)', 160);
    hitShake(0.06);
    if (stats.shield <= 0) {
      stats.shield = 0;
      msg = 'SHIELD BROKE';
      logEvent('Shield broke');
    }
    updateShieldVis();
    stats.hp = Math.max(0, stats.hp - dmg);
    stats.dmgTaken = (stats.dmgTaken || 0) + dmg;
    updateHUD();
    if (msg) showMsg(msg);
    if (stats.hp <= 0) {
      killPlayer();
      return true;
    }
    return false;
  }
  stats.hp = Math.max(0, stats.hp - dmg);
  stats.dmgTaken = (stats.dmgTaken || 0) + dmg;
  updateHUD();
  sfxHurt();
  flashScreen('rgba(0,255,102,0.55)', 220);
  hitShake(0.16);
  if (msg) showMsg(msg);
  if (stats.hp <= 0) {
    killPlayer();
    return true;
  }
  return false;
}

function sfxBlock() {
  beep(520, 'square', 0.05, 0.12, SFX.sfx, 180);
  beep(280, 'triangle', 0.07, 0.1, SFX.sfx, 90);
}

function updateShieldVis() {
  refreshShield();
}

function refreshShield() {
  if (!rightHand) return;
  if (shieldGroup) {
    rightHand.remove(shieldGroup);
    shieldGroup = null;
  }
  const hp = stats.shield || 0;
  if (hp <= 0) return;
  const mat = new THREE.LineBasicMaterial({
    color: GREEN,
    transparent: true,
    opacity: 0.55 + hp * 0.05
  });
  const g = new THREE.Group();
  g.position.set(-0.28, 0.05, 0.08);
  const plate = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.5, 0.65)), mat);
  g.add(plate);
  const cross = new THREE.BufferGeometry();
  cross.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.12, 0, 0.01, 0.12, 0, 0.01,
    0, -0.23, 0.01, 0, 0.23, 0.01
  ], 3));
  g.add(new THREE.LineSegments(cross, mat));

  const missing = Math.max(0, (stats.maxShield || 8) - hp);
  const cracks = [
    [-0.16, 0.22, 0.02, 0.1, -0.08, 0.02],
    [0.18, 0.18, 0.02, -0.08, -0.2, 0.02],
    [-0.2, 0.02, 0.02, 0.2, 0.06, 0.02],
    [0.08, 0.28, 0.02, 0.2, 0.04, 0.02],
    [-0.22, -0.1, 0.02, -0.04, -0.28, 0.02],
    [0.14, -0.22, 0.02, -0.18, 0.12, 0.02],
    [-0.1, 0.3, 0.02, 0.16, -0.3, 0.02]
  ];
  if (missing > 0) {
    const pts = [];
    for (let i = 0; i < missing && i < cracks.length; i++) {
      const c = cracks[i];
      pts.push(c[0], c[1], c[2], c[3], c[4], c[5]);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(cg, mat));
  }
  shieldGroup = g;
  rightHand.add(g);
}

function guard() {
  if (cfg.open || moving || playerBusy || dead || stats.hp <= 0) return;
  if (stats.shield <= 0) {
    showMsg('Shield is broken');
    return;
  }
  playerBusy = true;
  guarding = true;
  if (rightHand) {
    rightHand.position.x = 0.22;
    rightHand.position.z = -0.85;
    rightHand.rotation.y = -0.05;
  }
  showMsg('GUARD');
  setTimeout(function() {
    enemiesAct();
    guarding = false;
    playerBusy = false;
    if (rightHand) {
      const h = handRest();
      rightHand.position.set(h.rx, h.ry, h.rz);
      rightHand.rotation.set(h.rrx, h.rry, h.rrz);
    }
  }, 280);
}

// -------------------------------------------------------
function generateMaze(w, h) {
  const m = Array.from({ length: h }, () => Array(w).fill(1));
  const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]];

  function carve(x, y) {
    m[y][x] = 0;
    const order = dirs.slice().sort(() => Math.random() - 0.5);
    for (const [dx, dy] of order) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && m[ny][nx] === 1) {
        m[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  }
  carve(1, 1);

  let roomTries = 8, roomRad = 1;
  if (stats.floorNum === 5) { roomTries = 14; roomRad = 2; }
  if (stats.floorNum === 10) { roomTries = 10; roomRad = 1; }
  if (stats.floorNum === 15) { roomTries = 4; roomRad = 1; }
  if (stats.floorNum === 20) { roomTries = 12; roomRad = 1; }

  for (let i = 0; i < roomTries; i++) {
    const rx = 2 + Math.floor(Math.random() * (w - 4));
    const ry = 2 + Math.floor(Math.random() * (h - 4));
    const rad = roomRad;
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++)
        if (rx + dx > 0 && rx + dx < w - 1 && ry + dy > 0 && ry + dy < h - 1)
          m[ry + dy][rx + dx] = 0;
  }
  m[1][1] = 0; m[1][2] = 0; m[2][1] = 0;
  return m;
}

function placeSecret() {
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const cands = [];
  for (let z = 2; z < mapH - 2; z++) {
    for (let x = 2; x < mapW - 2; x++) {
      if (map[z][x] !== 0) continue;
      if (Math.abs(x - 1) + Math.abs(z - 1) < 5) continue;
      for (let d = 0; d < 4; d++) {
        const dx = dirs[d][0], dz = dirs[d][1];
        const wx = x + dx, wz = z + dz;
        const bx = x + dx * 2, bz = z + dz * 2;
        if (wx < 1 || wz < 1 || wx >= mapW - 1 || wz >= mapH - 1) continue;
        if (bx < 1 || bz < 1 || bx >= mapW - 1 || bz >= mapH - 1) continue;
        if (map[wz][wx] !== 1 || map[bz][bx] !== 1) continue;
        cands.push({ wx: wx, wz: wz, bx: bx, bz: bz });
      }
    }
  }
  if (!cands.length) return;
  const pick = cands[Math.floor(Math.random() * cands.length)];
  map[pick.wz][pick.wx] = 2;
  map[pick.bz][pick.bx] = 0;
  secretRoom = { x: pick.bx, z: pick.bz, doorX: pick.wx, doorZ: pick.wz };
}

function fillSecretLoot() {
  if (!secretRoom) return;
  const gx = secretRoom.x, gz = secretRoom.z;
  if (typeof getItemAt === 'function' && getItemAt(gx, gz)) return;
  const deep = stats.floorNum >= 10;
  const mesh = deep ? createChestMesh(false) : createHerbMesh();
  mesh.position.set(gx * CELL + CELL / 2, 0, gz * CELL + CELL / 2);
  worldGroup.add(mesh);
  items.push({ type: deep ? 'chest' : 'herb', x: gx, z: gz, mesh: mesh, taken: false });
}

function hideWallAt(gx, gz) {
  if (!worldGroup) return;
  worldGroup.children.forEach(function(ch) {
    if (ch.userData && ch.userData.cellX === gx && ch.userData.cellZ === gz) ch.visible = false;
  });
}

function checkSecret() {
  const gx = Math.floor(player.x);
  const gz = Math.floor(player.z);
  if (!map[gz] || map[gz][gx] !== 2) return;
  map[gz][gx] = 0;
  hideWallAt(gx, gz);
  logEvent('Hidden wall on B' + stats.floorNum + 'F');
  sfxPickup();
  showMsg('The wall gives way...');
}

// -------------------------------------------------------
function init() {
  map = generateMaze(mapW, mapH);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x001100, 0.05);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 80);
  updateCamera();

  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.id = 'c';
  document.getElementById('game-container').appendChild(renderer.domElement);

  const amb = new THREE.AmbientLight(0x003311, 0.5);
  scene.add(amb);
  const point = new THREE.PointLight(0x00ff66, 0.7, 25);
  point.position.set(0, 2.5, 0);
  camera.add(point);
  scene.add(camera);

  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  loadFloor(false);
  buildHands();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', e => { handleKey(e); });

  setupMobile();
  function bindTap(el, fn) {
    if (!el) return;
    let lock = 0;
    function run(e) {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lock < 400) return;
      lock = now;
      fn(e);
    }
    el.addEventListener('pointerup', run);
    el.addEventListener('touchend', run, { passive: false });
    el.addEventListener('click', run);
  }
  bindTap(document.getElementById('start-btn'), startGame);
  bindTap(document.getElementById('continue-btn'), continueGame);
  bindTap(document.getElementById('ng-yes'), function() { beginNewGame(true); });
  bindTap(document.getElementById('ng-no'), hideNewGameConfirm);
  const muteBtn = document.getElementById('mute-btn');
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', retryFromSave);
  const endBtn = document.getElementById('ending-btn');
  if (endBtn) endBtn.addEventListener('click', function() { location.reload(); });
  setupConfig();
  setupDebug();
  setupSleepHooks();
  labelContinue();
  lockPortrait();
  window.addEventListener('pointerdown', function() { startMusic(); }, { capture: true });

  animate();
}

function lockPortrait() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(function() {});
    }
  } catch (err) {}
}

function inPlay() {
  const title = document.getElementById('title-screen');
  const ending = document.getElementById('ending-screen');
  return title && title.style.display === 'none' && (!ending || ending.style.display !== 'flex');
}

function labelContinue() {
  const cont = document.getElementById('continue-btn');
  const start = document.getElementById('start-btn');
  if (!cont) return;
  const data = readSave();
  if (!data) {
    cont.style.display = 'none';
    if (start) {
      start.classList.remove('has-save');
      start.textContent = '[ PRESS TO ENTER ]';
    }
    return;
  }
  cont.style.display = 'block';
  const fl = data.floorNum || 1;
  cont.textContent = '[ CONTINUE  B' + fl + 'F ]';
  if (start) {
    start.classList.add('has-save');
    start.textContent = '[ NEW GAME ]';
  }
}

function setupSleepHooks() {
  function wakeAudio() {
    startMusic();
    applyAudioGains();
  }
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      if (inPlay() && !dead) {
        writeSave();
        labelContinue();
      }
    } else {
      wakeAudio();
    }
  });
  window.addEventListener('pagehide', function() {
    if (inPlay() && !dead) writeSave();
  });
  window.addEventListener('pageshow', wakeAudio);
  window.addEventListener('focus', wakeAudio);
}

function hideNewGameConfirm() {
  const el = document.getElementById('title-confirm');
  if (el) el.style.display = 'none';
}

function startGame() {
  if (readSave()) {
    const el = document.getElementById('title-confirm');
    if (el) el.style.display = 'flex';
    return;
  }
  beginNewGame(false);
}

function beginNewGame(wipe) {
  hideNewGameConfirm();
  if (wipe) {
    try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
  }
  stats = { hp: 35, maxHp: 40, mp: 10, maxMp: 10, lvl: 4, floor: 'B1F', floorNum: 1, kills: 0, herbs: 1, weapon: 0, kings: 0, dmgTaken: 0, herbsUsed: 0, deepest: 1, log: [], poison: 0, shield: 8, maxShield: 8 };
  dead = false;
  moving = false;
  playerBusy = false;
  document.getElementById('title-screen').style.display = 'none';
  document.body.classList.remove('titled');
  lockPortrait();
  refreshWeapon();
  updateShieldVis();
  loadFloor(true);
  logEvent('Entered B1F');
  showMsg('You descend into B1F...');
  startMusic();
  labelContinue();
}

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) { return null; }
}

function writeSave() {
  const data = {
    floorNum: stats.floorNum,
    hp: stats.hp,
    maxHp: stats.maxHp,
    mp: stats.mp,
    herbs: stats.herbs,
    weapon: stats.weapon,
    kills: stats.kills,
    kings: stats.kings || 0,
    dmgTaken: stats.dmgTaken || 0,
    herbsUsed: stats.herbsUsed || 0,
    deepest: stats.deepest || stats.floorNum,
    log: stats.log || [],
    shield: stats.shield,
    maxShield: stats.maxShield
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (err) {}
}

function applySave(data) {
  if (!data) return;
  stats.floorNum = data.floorNum || 1;
  stats.maxHp = data.maxHp || 40;
  stats.hp = Math.max(1, Math.min(data.hp || stats.maxHp, stats.maxHp));
  stats.mp = data.mp != null ? data.mp : 10;
  stats.herbs = data.herbs || 0;
  stats.weapon = data.weapon || 0;
  stats.shield = data.shield != null ? data.shield : 8;
  stats.maxShield = data.maxShield || 8;
  updateShieldVis();
  stats.kills = data.kills || 0;
  stats.kings = data.kings || 0;
  stats.dmgTaken = data.dmgTaken || 0;
  stats.herbsUsed = data.herbsUsed || 0;
  stats.deepest = data.deepest || stats.floorNum;
  stats.log = data.log || [];
  stats.floor = 'B' + stats.floorNum + 'F';
  refreshWeapon();
}

function continueGame() {
  const data = readSave();
  if (!data) { startGame(); return; }
  applySave(data);
  document.getElementById('title-screen').style.display = 'none';
  document.body.classList.remove('titled');
  loadFloor(false);
  showMsg('Resumed at ' + stats.floor);
  startMusic();
}

function retryFromSave() {
  const data = readSave();
  if (!data) { location.reload(); return; }
  dead = false;
  const storm = document.getElementById('death-noise');
  if (storm) { storm.style.display = 'none'; storm.style.opacity = '0'; }
  const btn = document.getElementById('retry-btn');
  if (btn) btn.style.display = 'none';
  applySave(data);
  loadFloor(false);
  showMsg('Returned to last save — ' + stats.floor);
}

function spawnSavePoint() {
  const used = new Set(['1,1','1,2','2,1']);
  if (stairs) used.add(stairs.x + ',' + stairs.z);
  for (const e of enemies) used.add(Math.floor(e.x) + ',' + Math.floor(e.z));
  for (const it of items) used.add(it.x + ',' + it.z);
  const spots = [];
  for (let z = 1; z < mapH - 1; z++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (map[z][x] !== 0) continue;
      if (used.has(x + ',' + z)) continue;
      if (secretRoom && x === secretRoom.x && z === secretRoom.z) continue;
      if (secretRoom && x === secretRoom.doorX && z === secretRoom.doorZ) continue;
      if (Math.abs(x-1)+Math.abs(z-1) < 3) continue;
      if (stairs && Math.abs(x - stairs.x) + Math.abs(z - stairs.z) < 2) continue;
      spots.push([x,z]);
    }
  }
  if (!spots.length) return;
  // mid-distance from start
  spots.sort(function(a,b){
    const da = Math.abs(a[0]-1)+Math.abs(a[1]-1);
    const db = Math.abs(b[0]-1)+Math.abs(b[1]-1);
    return Math.abs(da-7) - Math.abs(db-7);
  });
  const gx = spots[0][0], gz = spots[0][1];
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 });
  const g = new THREE.Group();
  const obelisk = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(0.28, 1.3, 4)), mat);
  obelisk.position.y = 0.7;
  g.add(obelisk);
  const base = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, 0.12, 0.7)), mat);
  base.position.y = 0.06;
  g.add(base);
  const gem = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.22)), mat);
  gem.position.y = 1.45;
  g.add(gem);
  g.position.set(gx * CELL + CELL / 2, 0, gz * CELL + CELL / 2);
  worldGroup.add(g);
  savePoint = { x: gx, z: gz, mesh: g, healed: false };
}

function checkSavePoint() {
  if (!savePoint || dead) return;
  if (Math.floor(player.x) === savePoint.x && Math.floor(player.z) === savePoint.z) {
    const filledMp = stats.mp < stats.maxMp;
    stats.mp = stats.maxMp;
    let heal = 0;
    if (!savePoint.healed && stats.hp < stats.maxHp) {
      heal = Math.max(8, Math.floor(stats.maxHp * 0.25));
      stats.hp = Math.min(stats.maxHp, stats.hp + heal);
      savePoint.healed = true;
    }
    writeSave();
    sfxPickup();
    flashGet(380);
    if (heal) showMsg('SAVE — HP +' + heal + '  MP restored');
    else if (filledMp) showMsg('SAVE — MP restored');
    else showMsg('SAVE POINT — recorded ' + stats.floor);
    updateHUD();
  }
}

function clearWorld() {
  if (!worldGroup) return;
  while (worldGroup.children.length) {
    worldGroup.remove(worldGroup.children[0]);
  }
  enemies = [];
  items = [];
  stairs = null;
  stairsLocked = false;
  savePoint = null;
  secretRoom = null;
  torchFlames = [];
  clearShots();
}

function loadFloor(announce) {
  clearWorld();
  map = generateMaze(mapW, mapH);
  placeSecret();
  explored = Array.from({ length: mapH }, function() { return Array(mapW).fill(false); });
  player.x = 1.5;
  player.z = 1.5;
  player.dir = facingOpen(1, 1);
  moving = false;
  playerBusy = false;
  updateCamera();
  buildDungeon();
  if (scene.fog) {
    let dens = 0.05;
    if (stats.floorNum === 5) dens = 0.035;
    if (stats.floorNum === 10) dens = 0.048;
    if (stats.floorNum === 15) dens = 0.07;
    if (stats.floorNum === 20) dens = 0.032;
    scene.fog.density = dens;
  }
  buildDecor();
  const nEn = Math.min(18, 7 + stats.floorNum * 2);
  let nHerb = Math.max(3, 7 - Math.floor(stats.floorNum / 2));
  const coreFloor = stats.floorNum === 20;
  const bossFloor = !coreFloor && stats.floorNum > 1 && stats.floorNum % 5 === 0;
  if (bossFloor || coreFloor) nHerb += 4;
  spawnEnemies(coreFloor ? 2 : (bossFloor ? Math.max(4, Math.floor(nEn * 0.4)) : nEn));
  spawnHerbs(nHerb);
  if (!coreFloor) spawnStairs();
  if (coreFloor) spawnCore();
  else if (bossFloor) spawnCubeKing();
  spawnSavePoint();
  fillSecretLoot();
  stats.floor = 'B' + stats.floorNum + 'F';
  markExplored();
  updateHUD();
  if (announce) {
    if (coreFloor) showMsg('B20F — The CORE hums...');
    else if (bossFloor) showMsg(stats.floor + ' — CUBE KING awaits...');
    else showMsg('Descended to ' + stats.floor + '...');
    flashScreen('rgba(0,255,102,0.4)', 400);
  }
}

function spawnStairs() {
  let gx = mapW - 3, gz = mapH - 3;
  // pick an open cell far from start
  const candidates = [];
  for (let z = 1; z < mapH - 1; z++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (map[z][x] !== 0) continue;
      if (Math.abs(x - 1) + Math.abs(z - 1) < 6) continue;
      if (getEnemyAt(x, z) || getItemAt(x, z)) continue;
      candidates.push([x, z]);
    }
  }
  if (candidates.length) {
    const c = candidates[Math.floor(Math.random() * candidates.length)];
    gx = c[0]; gz = c[1];
  } else {
    // fallback: first open far cell
    for (let z = mapH - 2; z >= 1; z--) {
      for (let x = mapW - 2; x >= 1; x--) {
        if (map[z][x] === 0) { gx = x; gz = z; break; }
      }
    }
  }

  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 });
  const group = new THREE.Group();
  // hatch
  const hatch = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.6, 1.6)), mat);
  hatch.rotation.x = -Math.PI / 2;
  hatch.position.y = 0.02;
  group.add(hatch);
  // inner hole
  const hole = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9)), mat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.03;
  group.add(hole);
  // descending rails
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const y = -0.15 * i;
    const w = 0.7 - i * 0.08;
    pts.push(-w, y, -w, w, y, -w, w, y, -w, w, y, w, w, y, w, -w, y, w, -w, y, w, -w, y, -w);
  }
  const rail = new THREE.BufferGeometry();
  rail.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(rail, mat));
  group.position.set(gx * CELL + CELL / 2, 0, gz * CELL + CELL / 2);
  worldGroup.add(group);
  stairs = { x: gx, z: gz, mesh: group };
}

function checkStairs() {
  if (!stairs || dead) return;
  if (Math.floor(player.x) === stairs.x && Math.floor(player.z) === stairs.z) {
    if (stairsLocked) {
      showMsg('CUBE KING blocks the stairs!');
      sfxBlocked();
      return;
    }
    goDown();
  }
}

function goDown() {
  if (stats.floorNum >= 20) {
    showMsg('There is no deeper stair.');
    return;
  }
  sfxStairs();
  stats.floorNum++;
  if (stats.floorNum > (stats.deepest || 1)) stats.deepest = stats.floorNum;
  if (stats.floorNum === 5 || stats.floorNum === 10 || stats.floorNum === 15 || stats.floorNum === 20) {
    logEvent('Reached B' + stats.floorNum + 'F');
  }
  loadFloor(true);
  writeSave();
  labelContinue();
}

// -------------------------------------------------------
function buildDungeon() {
  const wallMat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9 });
  const floorMat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.4 });

  const floorPts = [];
  for (let z = 0; z <= mapH; z++) {
    floorPts.push(0, 0, z * CELL, mapW * CELL, 0, z * CELL);
  }
  for (let x = 0; x <= mapW; x++) {
    floorPts.push(x * CELL, 0, 0, x * CELL, 0, mapH * CELL);
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPts, 3));
  worldGroup.add(new THREE.LineSegments(floorGeo, floorMat));

  const H = 3.2;
  const ceilPts = [];
  for (let z = 0; z <= mapH; z++) {
    ceilPts.push(0, H, z * CELL, mapW * CELL, H, z * CELL);
  }
  for (let x = 0; x <= mapW; x++) {
    ceilPts.push(x * CELL, H, 0, x * CELL, H, mapH * CELL);
  }
  const ceilGeo = new THREE.BufferGeometry();
  ceilGeo.setAttribute('position', new THREE.Float32BufferAttribute(ceilPts, 3));
  worldGroup.add(new THREE.LineSegments(ceilGeo, floorMat.clone()));

  for (let z = 0; z < mapH; z++) {
    for (let x = 0; x < mapW; x++) {
      if (map[z][x] === 1 || map[z][x] === 2) {
        const geo = new THREE.BoxGeometry(CELL * 0.98, H, CELL * 0.98);
        const edges = new THREE.EdgesGeometry(geo);
        const lines = new THREE.LineSegments(edges, wallMat);
        lines.position.set(x * CELL + CELL / 2, H / 2, z * CELL + CELL / 2);
        lines.userData.cellX = x;
        lines.userData.cellZ = z;
        worldGroup.add(lines);
        addBrickLines(x, z, H, wallMat);
      }
    }
  }
}

function addBrickLines(gx, gz, H, mat) {
  const ox = gx * CELL + CELL / 2;
  const oz = gz * CELL + CELL / 2;
  const hw = CELL * 0.49;
  const pts = [];
  for (let y = 0.5; y < H; y += 0.55) {
    pts.push(ox - hw, y, oz - hw, ox + hw, y, oz - hw);
    pts.push(ox - hw, y, oz + hw, ox + hw, y, oz + hw);
    pts.push(ox - hw, y, oz - hw, ox - hw, y, oz + hw);
    pts.push(ox + hw, y, oz - hw, ox + hw, y, oz + hw);
  }
  for (let y = 0.25; y < H; y += 1.1) {
    pts.push(ox, y, oz - hw, ox, y + 0.55, oz - hw);
    pts.push(ox, y, oz + hw, ox, y + 0.55, oz + hw);
    pts.push(ox - hw, y, oz, ox - hw, y + 0.55, oz);
    pts.push(ox + hw, y, oz, ox + hw, y + 0.55, oz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, mat);
  lines.userData.cellX = gx;
  lines.userData.cellZ = gz;
  worldGroup.add(lines);
}

function bladeLines(len, w) {
  const tip = -len;
  const mid = -len * 0.55;
  return [
    w, 0.03, -0.08,   w * 0.55, 0.02, mid,
    w * 0.55, 0.02, mid,  0.0, 0.0, tip,
    0.0, 0.0, tip,    w * 0.55, -0.02, mid,
    w * 0.55, -0.02, mid, w, -0.03, -0.08,
    w, -0.03, -0.08, w, 0.03, -0.08,
    -w, 0.03, -0.08,  -w * 0.55, 0.02, mid,
    -w * 0.55, 0.02, mid, 0.0, 0.0, tip,
    0.0, 0.0, tip,    -w * 0.55, -0.02, mid,
    -w * 0.55, -0.02, mid, -w, -0.03, -0.08,
    -w, -0.03, -0.08, -w, 0.03, -0.08,
    0.0, 0.0, -0.08, 0.0, 0.0, tip + 0.04,
    w * 0.8, 0.022, -len * 0.28, -w * 0.8, 0.022, -len * 0.28,
    w * 0.8, -0.022, -len * 0.28, -w * 0.8, -0.022, -len * 0.28
  ];
}

function buildWeaponMesh(tier) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 });
  let len = 0.55, w = 0.045, guardW = 0.16, pommel = 0.045;
  if (tier === 1) { len = 0.82; w = 0.04; guardW = 0.18; pommel = 0.05; }
  if (tier === 2) { len = 0.98; w = 0.055; guardW = 0.26; pommel = 0.06; }
  if (tier === 3) { len = 1.12; w = 0.075; guardW = 0.34; pommel = 0.07; }

  const pom = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pommel, pommel, 0.05)), mat);
  pom.position.set(0.0, 0.01, 0.14);
  g.add(pom);
  const grip = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.04, 0.04, 0.16)), mat);
  grip.position.set(0.0, 0.01, 0.04);
  g.add(grip);
  const guard = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(guardW, 0.05, 0.035)), mat);
  guard.position.set(0.0, 0.01, -0.06);
  g.add(guard);

  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(bladeLines(len, w), 3));
  g.add(new THREE.LineSegments(bladeGeo, mat));

  if (tier === 2) {
    const rune = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.08, 0.08, 0.02)), mat);
    const r1 = rune.clone(); r1.position.set(0, 0.0, -0.38); g.add(r1);
    const r2 = rune.clone(); r2.position.set(0, 0.0, -0.62); g.add(r2);
    const r3 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.05)), mat);
    r3.position.set(0, 0.0, -0.82); g.add(r3);
  }
  if (tier === 3) {
    const spikeGeo = new THREE.EdgesGeometry(new THREE.ConeGeometry(0.05, 0.16, 4));
    const s1 = new THREE.LineSegments(spikeGeo, mat);
    s1.rotation.z = Math.PI / 2; s1.position.set(-guardW * 0.55, 0.01, -0.06); g.add(s1);
    const s2 = new THREE.LineSegments(spikeGeo, mat);
    s2.rotation.z = -Math.PI / 2; s2.position.set(guardW * 0.55, 0.01, -0.06); g.add(s2);
    const crown = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(0.07, 0.14, 4)), mat);
    crown.position.set(0, 0.12, 0.14); g.add(crown);
    const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.1, 0.1, 0.1)), mat);
    core.position.set(0, 0.0, -0.55); g.add(core);
  }
  return g;
}

function isPortrait() {
  return window.innerHeight > window.innerWidth * 1.02;
}

function handRest() {
  if (isPortrait()) {
    return {
      lx: -0.22, ly: -0.32, lz: -0.80,
      lrx: 0.36, lry: 0.10, lrz: -0.16,
      rx: 0.62, ry: -0.52, rz: -1.05,
      rrx: 0.10, rry: -0.28, rrz: 0.22
    };
  }
  return {
    lx: -0.46, ly: -0.42, lz: -0.92,
    lrx: 0.42, lry: 0.18, lrz: -0.22,
    rx: 0.58, ry: -0.48, rz: -1.1,
    rrx: 0.12, rry: -0.35, rrz: 0.3
  };
}

function applyHandRest() {
  const h = handRest();
  if (leftHand) {
    leftHand.position.set(h.lx, h.ly, h.lz);
    leftHand.rotation.set(h.lrx, h.lry, h.lrz);
  }
  if (rightHand && !guarding) {
    rightHand.position.set(h.rx, h.ry, h.rz);
    rightHand.rotation.set(h.rrx, h.rry, h.rrz);
  }
  if (camera) {
    camera.fov = isPortrait() ? 76 : 70;
    camera.updateProjectionMatrix();
  }
}

function refreshWeapon() {
  if (!leftHand) return;
  if (weaponGroup) leftHand.remove(weaponGroup);
  weaponGroup = buildWeaponMesh(stats.weapon || 0);
  leftHand.add(weaponGroup);
  leftHand.scale.set(1, 1, 1);
}

// -------------------------------------------------------
function buildHands() {
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 });

  leftHand = new THREE.Group();

  // Arm comes from the left toward the fist (near camera).
  const armGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 6, 1, true);
  const arm = new THREE.LineSegments(new THREE.EdgesGeometry(armGeo), mat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-0.28, -0.04, 0.08);
  leftHand.add(arm);

  // Fist near the camera, gripping the handle
  const fist = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.12, 0.13, 0.14)), mat);
  fist.position.set(0.0, 0.0, 0.06);
  leftHand.add(fist);
  const knuckle = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.04, 0.12, 0.05)), mat);
  knuckle.position.set(0.05, 0.03, 0.02);
  leftHand.add(knuckle);

  refreshWeapon();

  // Tip up and a bit toward screen center; fist stays at bottom-left
  applyHandRest();
  camera.add(leftHand);

  rightHand = new THREE.Group();
  const arm2 = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.11, 0.15, 0.8, 6, 1, true)), mat
  );
  arm2.rotation.z = -Math.PI / 2;
  arm2.position.set(0.12, 0, 0);
  rightHand.add(arm2);
  refreshShield();
  applyHandRest();
  camera.add(rightHand);
}

// -------------------------------------------------------
function buildDecor() {
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.85 });
  const special = stats.floorNum === 5 || stats.floorNum === 10 || stats.floorNum === 15 || stats.floorNum === 20;

  let sx = 5, sz = 5;
  outer: for (let z = 3; z < mapH - 3; z++) {
    for (let x = 3; x < mapW - 3; x++) {
      if (map[z][x] === 0 && map[z][x+1]===0 && map[z+1][x]===0) {
        sx = x; sz = z; break outer;
      }
    }
  }

  if (!special) {
    const positions = [
      [0, 0.45, 0], [0.7, 0.38, 0.3], [-0.55, 0.3, 0.4],
      [0.2, 1.1, -0.1], [-0.3, 0.95, 0.5], [0.55, 0.9, 0.55],
      [0.1, 1.7, 0.2], [-0.2, 1.55, -0.3], [0.4, 1.5, 0.1]
    ];
    const sizes = [0.9, 0.75, 0.6, 0.55, 0.5, 0.45];
    positions.forEach((p, i) => {
      const s = sizes[i % sizes.length];
      const mesh = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), mat
      );
      mesh.position.set(sx * CELL + CELL / 2 + p[0], p[1], sz * CELL + CELL / 2 + p[2]);
      mesh.rotation.y = (Math.random() - 0.5) * 0.5;
      worldGroup.add(mesh);
    });

    for (let i = 0; i < 14; i++) {
      const s = 0.15 + Math.random() * 0.3;
      const mesh = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s * 0.6, s * 0.8)), mat
      );
      const ang = Math.random() * Math.PI * 2;
      const r = 1.0 + Math.random() * 1.8;
      mesh.position.set(
        sx * CELL + CELL / 2 + Math.cos(ang) * r,
        0.06,
        sz * CELL + CELL / 2 + Math.sin(ang) * r
      );
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      worldGroup.add(mesh);
    }
  }

  if (stats.floorNum === 20) placeBossTorches();
  else if (stats.floorNum === 5) {
    placeHallTorches(0.22, 3);
    addArches();
  } else if (stats.floorNum === 10) {
    placeHallTorches(0.16, 2);
    addPillars();
  } else if (stats.floorNum === 15) {
    placeHallTorches(0.08, 4);
    addBeams();
  }
}

function createLanternTorch() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 });
  const cup = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.22, 0.18, 0.2)), mat);
  cup.position.set(0, 0, 0.02);
  group.add(cup);
  const stem = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.045, 0.48, 0.045)), mat);
  stem.position.set(0, 0.32, 0.02);
  group.add(stem);
  const arm = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.04, 0.04, 0.16)), mat);
  arm.position.set(0, 0.08, -0.08);
  group.add(arm);
  const flamePts = [
    0, 0.00, 0.02,   -0.09, 0.16, 0.02,
    -0.09, 0.16, 0.02, -0.04, 0.24, 0.04,
    -0.04, 0.24, 0.04,  0.00, 0.52, 0.02,
    0.00, 0.52, 0.02,   0.05, 0.26, 0.00,
    0.05, 0.26, 0.00,   0.11, 0.17, 0.02,
    0.11, 0.17, 0.02,   0.00, 0.00, 0.02,
    0.00, 0.02, 0.06,   0.00, 0.38, 0.02,
    -0.06, 0.14, 0.05,  0.06, 0.14, -0.02,
    -0.05, 0.30, 0.00,  0.04, 0.34, 0.04
  ];
  const flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(flamePts, 3));
  const flame = new THREE.LineSegments(flameGeo, mat);
  flame.position.set(0, 0.56, 0.02);
  group.add(flame);
  group.userData.flame = flame;
  return group;
}

function addWallTorch(gx, gz, side) {
  const torch = createLanternTorch();
  const y = 1.42;
  if (side === 'W') {
    torch.position.set(gx * CELL + 0.18, y, gz * CELL + CELL / 2);
    torch.rotation.y = Math.PI / 2;
  } else if (side === 'E') {
    torch.position.set(gx * CELL + CELL - 0.18, y, gz * CELL + CELL / 2);
    torch.rotation.y = -Math.PI / 2;
  } else if (side === 'N') {
    torch.position.set(gx * CELL + CELL / 2, y, gz * CELL + 0.18);
    torch.rotation.y = 0;
  } else {
    torch.position.set(gx * CELL + CELL / 2, y, gz * CELL + CELL - 0.18);
    torch.rotation.y = Math.PI;
  }
  worldGroup.add(torch);
  torchFlames.push({
    mesh: torch.userData.flame,
    phase: Math.random() * Math.PI * 2
  });
}

function placeHallTorches(chance, stride) {
  stride = stride || 3;
  for (let z = 1; z < mapH - 1; z++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (map[z][x] !== 0) continue;
      if ((x + z) % stride !== 0) continue;
      if (map[z][x - 1] === 1 && Math.random() < chance) addWallTorch(x, z, 'W');
      if (map[z][x + 1] === 1 && Math.random() < chance) addWallTorch(x, z, 'E');
      if (map[z - 1][x] === 1 && Math.random() < chance * 0.7) addWallTorch(x, z, 'N');
      if (map[z + 1][x] === 1 && Math.random() < chance * 0.7) addWallTorch(x, z, 'S');
    }
  }
}

function addPillars() {
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9 });
  for (let z = 3; z < mapH - 3; z++) {
    for (let x = 3; x < mapW - 3; x++) {
      if (map[z][x] !== 0) continue;
      if (map[z][x - 1] !== 0 || map[z][x + 1] !== 0) continue;
      if (map[z - 1][x] !== 0 || map[z + 1][x] !== 0) continue;
      if ((x + z) % 3 !== 0) continue;
      const col = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.4, 3.0, 0.4)), mat);
      col.position.set(x * CELL + CELL / 2, 1.5, z * CELL + CELL / 2);
      worldGroup.add(col);
    }
  }
}

function addBeams() {
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.75 });
  for (let z = 1; z < mapH - 1; z++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (map[z][x] !== 0) continue;
      const ew = map[z][x - 1] === 0 && map[z][x + 1] === 0;
      const ns = map[z - 1][x] === 0 && map[z + 1][x] === 0;
      if (!ew && !ns) continue;
      if ((x + z) % 2 !== 0) continue;
      const beam = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(ew ? CELL * 0.95 : 0.18, 0.12, ns ? CELL * 0.95 : 0.18)),
        mat
      );
      beam.position.set(x * CELL + CELL / 2, 3.05, z * CELL + CELL / 2);
      worldGroup.add(beam);
    }
  }
}

function addArches() {
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.88 });
  for (let z = 2; z < mapH - 2; z++) {
    for (let x = 2; x < mapW - 2; x++) {
      if (map[z][x] !== 0) continue;
      if ((x + z) % 5 !== 0) continue;
      const ns = map[z - 1][x] === 0 && map[z + 1][x] === 0 && map[z][x - 1] === 1 && map[z][x + 1] === 1;
      const ew = map[z][x - 1] === 0 && map[z][x + 1] === 0 && map[z - 1][x] === 1 && map[z + 1][x] === 1;
      if (!ns && !ew) continue;
      const w = ns ? 2.2 : 0.12;
      const d = ew ? 2.2 : 0.12;
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 2.6, d)), mat);
      frame.position.set(x * CELL + CELL / 2, 1.35, z * CELL + CELL / 2);
      worldGroup.add(frame);
    }
  }
}

function placeBossTorches() {
  for (let z = 1; z < mapH - 1; z++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (map[z][x] !== 0) continue;
      if ((x + z) % 2 === 1) continue;
      if (map[z][x - 1] === 1) addWallTorch(x, z, 'W');
      if (map[z][x + 1] === 1) addWallTorch(x, z, 'E');
      if (map[z - 1][x] === 1) addWallTorch(x, z, 'N');
      if (map[z + 1][x] === 1) addWallTorch(x, z, 'S');
    }
  }
}

// ============================================================
//  CUBE SLIMES
// ============================================================
function createSlimeMesh(size) {
  size = size || 1;
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: SLIME_GREEN, transparent: true, opacity: 0.95 });

  // main body cube (slightly squat)
  const body = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 0.9, 1.1)), mat
  );
  body.position.y = 0.45;
  group.add(body);

  // inner smaller cube for "jelly" look
  const inner = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, 0.55, 0.7)), mat
  );
  inner.position.y = 0.45;
  group.add(inner);

  // eyes (two small squares)
  const eyeMat = new THREE.LineBasicMaterial({ color: 0xaaffcc, transparent: true, opacity: 1 });
  const eyeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.18, 0.18, 0.05));
  const eyeL = new THREE.LineSegments(eyeGeo, eyeMat);
  eyeL.position.set(-0.28, 0.65, 0.56);
  group.add(eyeL);
  const eyeR = new THREE.LineSegments(eyeGeo, eyeMat);
  eyeR.position.set(0.28, 0.65, 0.56);
  group.add(eyeR);

  // pupils
  const pupilGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.07, 0.07, 0.04));
  const pL = new THREE.LineSegments(pupilGeo, eyeMat);
  pL.position.set(-0.28, 0.65, 0.58);
  group.add(pL);
  const pR = new THREE.LineSegments(pupilGeo, eyeMat);
  pR.position.set(0.28, 0.65, 0.58);
  group.add(pR);

  group.scale.set(size, size, size);
  return group;
}

function createChestMesh(awake) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 });
  const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 0.7, 0.8)), mat);
  box.position.y = 0.35;
  group.add(box);
  const lid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.14, 0.16, 0.84)), mat);
  lid.position.y = 0.74;
  group.add(lid);
  const lock = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.18, 0.08)), mat);
  lock.position.set(0, 0.5, 0.44);
  group.add(lock);
  if (awake) {
    const eye = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.14, 0.14, 0.05)), mat);
    const e1 = eye.clone(); e1.position.set(-0.22, 0.55, 0.42); group.add(e1);
    const e2 = eye.clone(); e2.position.set(0.22, 0.55, 0.42); group.add(e2);
  }
  return group;
}

function createGolemMesh() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x88ff44, transparent: true, opacity: 0.96 });
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.45, 0.38, 1.45)), mat);
  body.position.y = 0.22;
  group.add(body);
  const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.95, 0.2, 0.95)), mat);
  inner.position.y = 0.22;
  group.add(inner);
  const eyeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.1, 0.05));
  const e1 = new THREE.LineSegments(eyeGeo, mat); e1.position.set(-0.28, 0.32, 0.74); group.add(e1);
  const e2 = new THREE.LineSegments(eyeGeo, mat); e2.position.set(0.28, 0.32, 0.74); group.add(e2);

  const bubbles = new THREE.Group();
  const spots = [
    [0.7, 0.55, 0.2], [-0.65, 0.7, -0.15], [0.15, 0.85, 0.55],
    [-0.4, 0.5, 0.6], [0.55, 0.95, -0.4], [-0.1, 1.1, 0.1],
    [0.35, 0.62, -0.65], [-0.75, 0.4, 0.25]
  ];
  const sizes = [0.16, 0.12, 0.2, 0.1, 0.14, 0.18, 0.11, 0.13];
  for (let i = 0; i < spots.length; i++) {
    const s = sizes[i];
    const b = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), mat);
    b.position.set(spots[i][0], spots[i][1], spots[i][2]);
    b.userData.base = spots[i].slice();
    b.userData.phase = i * 0.9;
    bubbles.add(b);
  }
  group.add(bubbles);
  group.userData.bubbles = bubbles;
  return group;
}

function createKingMesh(form) {
  const v = form || (stats.floorNum === 5 ? 'spider' : (stats.floorNum === 15 ? 'toxic' : 'jelly'));
  if (v === 'spider') return createSpiderKingMesh();
  return createJellyKingMesh(v === 'toxic');
}

function createJellyKingMesh(toxic) {
  const group = new THREE.Group();
  const col = toxic ? 0x88ff44 : GREEN;
  const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.96 });
  const bell = new THREE.Group();
  const layers = [
    [1.12, 1.32, 0.26],
    [1.38, 1.12, 0.22],
    [1.58, 0.88, 0.20],
    [1.74, 0.58, 0.16],
    [1.88, 0.32, 0.14]
  ];
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    const slab = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L[1], L[2], L[1])), mat);
    slab.position.y = L[0];
    bell.add(slab);
  }
  const voxels = [
    [-0.48, 1.22, 0.42], [0.52, 1.28, 0.38], [-0.38, 1.48, -0.4],
    [0.4, 1.52, -0.36], [-0.22, 1.68, 0.28], [0.18, 1.66, 0.32],
    [0.0, 1.42, -0.5], [-0.55, 1.34, -0.1], [0.58, 1.36, 0.05]
  ];
  for (let i = 0; i < voxels.length; i++) {
    const s = 0.16 + (i % 3) * 0.04;
    const v = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), mat);
    v.position.set(voxels[i][0], voxels[i][1], voxels[i][2]);
    bell.add(v);
  }
  const eyeL = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.16, 0.08)), mat);
  eyeL.position.set(-0.22, 1.32, 0.62);
  bell.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.22;
  bell.add(eyeR);
  const pupil = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.07, 0.07, 0.07)), mat);
  const p1 = pupil.clone(); p1.position.set(-0.22, 1.32, 0.68); bell.add(p1);
  const p2 = pupil.clone(); p2.position.set(0.22, 1.32, 0.68); bell.add(p2);
  group.add(bell);
  group.userData.bell = bell;

  const tents = [];
  const roots = [
    [-0.28, 0.18], [0.28, 0.18], [-0.12, -0.22], [0.14, -0.2], [0.0, 0.28], [-0.32, -0.08]
  ];
  for (let t = 0; t < roots.length; t++) {
    const tent = new THREE.Group();
    tent.position.set(roots[t][0], 0.98, roots[t][1]);
    const n = 7 + (t % 3);
    for (let k = 0; k < n; k++) {
      const cs = 0.11 - k * 0.006;
      const c = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cs, cs, cs)), mat);
      const curve = Math.sin(k * 0.45 + t) * 0.08;
      c.position.set(curve * (t % 2 ? 1 : -1), -0.12 - k * 0.13, curve * 0.4);
      tent.add(c);
    }
    tent.userData.phase = t * 0.9;
    group.add(tent);
    tents.push(tent);
  }
  group.userData.tents = tents;
  group.userData.jelly = true;
  group.userData.toxic = !!toxic;
  if (toxic) {
    const bubbles = new THREE.Group();
    const spots = [
      [0.85, 1.55, 0.2], [-0.8, 1.7, -0.15], [0.2, 2.05, 0.55],
      [-0.5, 1.4, 0.7], [0.7, 1.9, -0.45], [-0.15, 2.2, 0.1],
      [0.45, 1.35, -0.7], [-0.9, 1.2, 0.3], [0.55, 1.75, 0.65]
    ];
    const sizes = [0.16, 0.12, 0.2, 0.1, 0.14, 0.18, 0.11, 0.13, 0.15];
    for (let i = 0; i < spots.length; i++) {
      const s = sizes[i];
      const b = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), mat);
      b.position.set(spots[i][0], spots[i][1], spots[i][2]);
      b.userData.base = spots[i].slice();
      b.userData.phase = i * 0.9;
      bubbles.add(b);
    }
    group.add(bubbles);
    group.userData.bubbles = bubbles;
  }
  return group;
}

function makePlus(mat, s) {
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s * 0.28, 0.05)), mat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s * 0.28, s, 0.05)), mat));
  return g;
}

function createSpiderKingMesh() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.98 });
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.15, 1.05, 1.05)), mat);
  body.position.y = 0.95;
  group.add(body);
  const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 0.72, 0.72)), mat);
  inner.position.y = 0.95;
  group.add(inner);

  const eyeL = makePlus(mat, 0.22);
  eyeL.position.set(-0.22, 1.02, 0.54);
  group.add(eyeL);
  const eyeR = makePlus(mat, 0.22);
  eyeR.position.set(0.22, 1.02, 0.54);
  group.add(eyeR);
  const pupilL = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.07, 0.07, 0.07)), mat);
  pupilL.position.set(-0.22, 1.02, 0.58);
  group.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.22;
  group.add(pupilR);

  const bits = new THREE.Group();
  bits.position.y = 0.95;
  const sword = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.06, 0.06, 0.32)), mat);
  sword.position.set(-0.18, -0.08, 0.12);
  sword.rotation.z = 0.5;
  bits.add(sword);
  const shield = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.2, 0.04)), mat);
  shield.position.set(0.16, -0.12, 0.08);
  bits.add(shield);
  const crumb = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.1, 0.1, 0.1)), mat);
  crumb.position.set(0.05, 0.18, -0.12);
  bits.add(crumb);
  group.add(bits);
  group.userData.bits = bits;

  const legs = [];
  function addSideLeg(side, zOff, phase) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.58, 0.88, zOff);
    const hip = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.22, 0.22, 0.22)), mat);
    hip.position.set(side * 0.08, 0, 0);
    leg.add(hip);
    const upper = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.2, 0.2)), mat);
    upper.position.set(side * 0.42, -0.06, zOff * 0.12);
    leg.add(upper);
    const elbow = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.2, 0.2)), mat);
    elbow.position.set(side * 0.72, -0.18, zOff * 0.18);
    leg.add(elbow);
    const shin = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.18, 0.18, 0.18)), mat);
    shin.position.set(side * 0.88, -0.48, zOff * 0.12);
    leg.add(shin);
    const foot = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.28, 0.28, 0.28)), mat);
    foot.position.set(side * 0.98, -0.82, zOff * 0.08);
    leg.add(foot);
    const claw = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.12, 0.12, 0.12)), mat);
    claw.position.set(side * 1.08, -0.98, 0);
    leg.add(claw);
    leg.userData.side = side;
    leg.userData.phase = phase;
    group.add(leg);
    legs.push(leg);
  }
  addSideLeg(-1, 0.34, 0);
  addSideLeg(-1, -0.34, 1.6);
  addSideLeg(1, 0.34, 0.8);
  addSideLeg(1, -0.34, 2.4);
  group.userData.legs = legs;
  group.userData.spider = true;
  return group;
}

function createCoreMesh() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.98 });
  const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.15, 1.15, 1.15)), mat);
  outer.position.y = 1.15;
  group.add(outer);
  const mid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 0.72, 0.72)), mat);
  mid.position.y = 1.15;
  group.add(mid);
  const oct = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.38)), mat);
  oct.position.y = 1.15;
  group.add(oct);
  const spark = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.12, 0.12, 0.12)), mat);
  spark.position.y = 1.15;
  group.add(spark);

  const glows = [];
  const shells = [
    { s: 1.55, op: 0.32 },
    { s: 2.05, op: 0.16 },
    { s: 2.55, op: 0.08 }
  ];
  for (let i = 0; i < shells.length; i++) {
    const gm = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: shells[i].op });
    const g = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.15, 1.15, 1.15)), gm);
    g.position.y = 1.15;
    g.scale.setScalar(shells[i].s);
    g.userData.baseOp = shells[i].op;
    g.userData.baseS = shells[i].s;
    group.add(g);
    glows.push(g);
  }
  const halo = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.05)),
    new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.22 })
  );
  halo.position.y = 1.15;
  group.add(halo);

  const orbit = new THREE.Group();
  orbit.position.y = 1.15;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bit = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.1, 0.1, 0.1)), mat);
    bit.position.set(Math.cos(a) * 1.15, Math.sin(a * 2) * 0.25, Math.sin(a) * 1.15);
    orbit.add(bit);
  }
  group.add(orbit);

  group.userData.mid = mid;
  group.userData.oct = oct;
  group.userData.glows = glows;
  group.userData.halo = halo;
  group.userData.orbit = orbit;
  return group;
}

function spawnCore() {
  let gx = Math.floor(mapW / 2), gz = Math.floor(mapH / 2);
  if (map[gz][gx] !== 0) {
    for (let r = 1; r < 8; r++) {
      let found = false;
      for (let z = gz - r; z <= gz + r && !found; z++) {
        for (let x = gx - r; x <= gx + r; x++) {
          if (z < 2 || x < 2 || z >= mapH - 2 || x >= mapW - 2) continue;
          if (map[z][x] === 0 && !(stairs && x === stairs.x && z === stairs.z)) {
            gx = x; gz = z; found = true; break;
          }
        }
      }
      if (found) break;
    }
  }
  const hp = 60;
  addEnemy({ gx: gx, gz: gz, kind: 'core', size: 1.05, hp: hp, maxHp: hp, pulse: 0 });
  stairsLocked = true;
}

function corePulse(e) {
  const dist = Math.abs(Math.floor(player.x) - Math.floor(e.x)) + Math.abs(Math.floor(player.z) - Math.floor(e.z));
  if (dist > 2) return;
  e.pulse = (e.pulse || 0) + 1;
  if (e.pulse % 2 !== 0) return;
  const dmg = 2 + Math.floor(stats.floorNum / 10);
  hurtPlayer(dmg, 'CORE aura  -' + dmg);
}

function showEnding() {
  dead = true;
  moving = false;
  clearShots();
  logEvent('CORE destroyed — surface restored');
  const el = document.getElementById('ending-screen');
  const rec = document.getElementById('ending-record');
  if (rec) {
    rec.innerHTML =
      'DEEPEST  B' + (stats.deepest || stats.floorNum) + 'F<br>' +
      'KILLS  ' + stats.kills + '    KINGS  ' + (stats.kings || 0) + '<br>' +
      'DAMAGE TAKEN  ' + (stats.dmgTaken || 0) + '<br>' +
      'HERBS USED  ' + (stats.herbsUsed || 0) + '<br>' +
      'WEAPON  ' + weaponName();
  }
  const logEl = document.getElementById('ending-log');
  if (logEl) {
    const lines = (stats.log && stats.log.length) ? stats.log : ['No record.'];
    logEl.innerHTML = lines.map(function(l) { return '> ' + l; }).join('<br>');
  }
  if (el) el.style.display = 'flex';
  try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
}

function spawnCubeKing() {
  const spots = [];
  for (let z = 2; z < mapH - 2; z++) {
    for (let x = 2; x < mapW - 2; x++) {
      if (map[z][x] !== 0) continue;
      if (getEnemyAt(x, z) || getItemAt(x, z)) continue;
      if (stairs && x === stairs.x && z === stairs.z) continue;
      const dStart = Math.abs(x - 1) + Math.abs(z - 1);
      if (dStart < 6) continue;
      const dStair = stairs ? Math.abs(x - stairs.x) + Math.abs(z - stairs.z) : 9;
      spots.push({ x: x, z: z, score: Math.abs(dStair - 3) + Math.abs(dStart - 8) });
    }
  }
  spots.sort(function(a, b) { return a.score - b.score; });
  const pick = spots.length ? spots[0] : { x: mapW - 3, z: mapH - 3 };
  const hp = 26 + stats.floorNum * 5;
  addEnemy({ gx: pick.x, gz: pick.z, kind: 'king', size: 0.95, hp: hp, maxHp: hp, toxic: stats.floorNum === 15 });
  stairsLocked = true;
}

function clearShots() {
  if (!shots) { shots = []; return; }
  for (const sh of shots) {
    if (sh.mesh && worldGroup) worldGroup.remove(sh.mesh);
  }
  shots = [];
}

function lineClear(x0, z0, x1, z1) {
  if (x0 !== x1 && z0 !== z1) return false;
  const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
  let x = x0 + sx, z = z0 + sz;
  while (x !== x1 || z !== z1) {
    if (!map[z] || map[z][x] !== 0) return false;
    x += sx; z += sz;
  }
  return true;
}

function sfxShot() {
  beep(620, 'square', 0.05, 0.16, SFX.sfx, 240);
  noise(0.05, 0.12, 1800);
}

function sfxBolt() {
  beep(980, 'square', 0.07, 0.22, SFX.sfx, 280);
  beep(1480, 'square', 0.09, 0.16, SFX.sfx, 520);
  noise(0.07, 0.18, 2600);
}

function fireBolt() {
  if (cfg.open || moving || playerBusy || dead || stats.hp <= 0) return;
  if (stats.mp < 3) {
    showMsg('No MP');
    return;
  }
  stats.mp -= 3;
  updateHUD();
  playerBusy = true;
  const v = DIR_VEC[player.dir];
  const mat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 1 });
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.55)), mat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.42, 0.42, 0.42)), mat));
  const tail = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.22, 0.22, 0.55)), mat);
  tail.position.set(-v.x * 0.55, 0, -v.z * 0.55);
  g.add(tail);
  const startX = player.x + v.x * 0.42;
  const startZ = player.z + v.z * 0.42;
  g.position.set(startX * CELL, 1.48, startZ * CELL);
  worldGroup.add(g);
  const w = WEAPONS[stats.weapon] || WEAPONS[0];
  const dmg = Math.max(4, w.min - 1) + Math.floor(stats.floorNum / 3);
  shots.push({
    x: startX, z: startZ,
    dx: v.x, dz: v.z,
    mesh: g,
    alive: true,
    speed: 4.0,
    fromPlayer: true,
    dmg: dmg
  });
  sfxBolt();
  flashGet(220);
  showMsg('BOLT!');
  const h = handRest();
  if (leftHand) {
    leftHand.position.z = h.lz + 0.18;
    leftHand.position.x = h.lx + 0.08;
  }
  setTimeout(function() {
    applyHandRest();
    playerBusy = false;
    if (!dead) enemiesAct();
  }, 420);
}

function kingShoot(e) {
  const px = Math.floor(player.x), pz = Math.floor(player.z);
  const ex = Math.floor(e.x), ez = Math.floor(e.z);
  if (px !== ex && pz !== ez) return false;
  if (px === ex && pz === ez) return false;
  if (!lineClear(ex, ez, px, pz)) return false;
  const dx = Math.sign(px - ex), dz = Math.sign(pz - ez);
  const range = Math.abs(px - ex) + Math.abs(pz - ez);
  const mat = new THREE.LineBasicMaterial({ color: e.toxic ? 0x88ff44 : GREEN, transparent: true, opacity: 1 });
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.5)), mat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.38, 0.38, 0.38)), mat));
  g.position.set(e.x * CELL, 1.4, e.z * CELL);
  worldGroup.add(g);
  shots.push({
    x: e.x, z: e.z,
    dx: dx, dz: dz,
    mesh: g,
    alive: true,
    speed: range >= 5 ? 3.2 : (e.kind === 'core' ? 3.6 : 5.2),
    fromPlayer: false,
    range: range,
    toxic: !!e.toxic
  });
  sfxShot();
  showMsg((e.kind === 'core' ? 'CORE' : (e.toxic ? 'TOXIC KING' : 'CUBE KING')) + ' fires!');
  return true;
}

function hitByShot(sh) {
  let dmg = 3 + Math.ceil(stats.floorNum / 2);
  const r = sh.range || 3;
  if (r >= 6) dmg = 1;
  else if (r >= 4) dmg = Math.max(1, Math.ceil(dmg * 0.45));
  else if (r >= 3) dmg = Math.max(2, Math.ceil(dmg * 0.7));
  hurtPlayer(dmg, 'Bolt hits you for ' + dmg + '!');
  if (sh.toxic && !dead) applyPoison(5);
}

function updateShots(dt) {
  if (!shots.length) return;
  const px = Math.floor(player.x), pz = Math.floor(player.z);
  for (const sh of shots) {
    if (!sh.alive) continue;
    sh.x += sh.dx * sh.speed * dt;
    sh.z += sh.dz * sh.speed * dt;
    const y = sh.fromPlayer ? 1.48 : 1.1;
    sh.mesh.position.set(sh.x * CELL, y, sh.z * CELL);
    sh.mesh.rotation.y += dt * (sh.fromPlayer ? 12 : 8);
    if (sh.fromPlayer) {
      const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.12;
      sh.mesh.scale.set(pulse, pulse, pulse);
    }
    const gx = Math.floor(sh.x + 0.0001), gz = Math.floor(sh.z + 0.0001);
    // wall
    if (gx < 0 || gz < 0 || gx >= mapW || gz >= mapH || map[gz][gx] !== 0) {
      sh.alive = false;
      worldGroup.remove(sh.mesh);
      continue;
    }
    if (!sh.fromPlayer && gx === px && gz === pz) {
      sh.alive = false;
      worldGroup.remove(sh.mesh);
      hitByShot(sh);
      continue;
    }
    if (sh.fromPlayer) {
      const hit = getEnemyAt(gx, gz);
      if (hit && hit.alive) {
        sh.alive = false;
        worldGroup.remove(sh.mesh);
        damageEnemy(hit, sh.dmg || 6);
        flashGet(180);
      }
    }
  }
  shots = shots.filter(function(sh) { return sh.alive; });
}

function addEnemy(opts) {
  const gx = opts.gx, gz = opts.gz;
  const kind = opts.kind || 'slime';
  const size = opts.size || 1;
  let mesh;
  if (kind === 'mimic') mesh = createChestMesh(!!opts.awake);
  else if (kind === 'king') mesh = createKingMesh(opts.form);
  else if (kind === 'core') mesh = createCoreMesh();
  else if (kind === 'golem') mesh = createGolemMesh();
  else mesh = createSlimeMesh(size);
  mesh.position.set(gx * CELL + CELL / 2, 0, gz * CELL + CELL / 2);
  worldGroup.add(mesh);
  const e = {
    x: gx + 0.5,
    z: gz + 0.5,
    kind: kind,
    size: size,
    canSplit: !!opts.canSplit,
    awake: kind !== 'mimic' || !!opts.awake,
    hp: opts.hp,
    maxHp: opts.maxHp,
    mesh: mesh,
    bobPhase: Math.random() * Math.PI * 2,
    alive: true,
    toxic: !!opts.toxic || !!(mesh.userData && mesh.userData.toxic)
  };
  enemies.push(e);
  return e;
}

function spawnEnemies(count) {
  enemies = [];
  const used = new Set();
  used.add('1,1'); used.add('1,2'); used.add('2,1');

  let attempts = 0;
  while (enemies.length < count && attempts < 200) {
    attempts++;
    const gx = 1 + Math.floor(Math.random() * (mapW - 2));
    const gz = 1 + Math.floor(Math.random() * (mapH - 2));
    const key = gx + ',' + gz;
    if (map[gz][gx] !== 0 || used.has(key)) continue;
    // keep away from start
    if (Math.abs(gx - 1) + Math.abs(gz - 1) < 4) continue;
    if (secretRoom && ((gx === secretRoom.x && gz === secretRoom.z) || (gx === secretRoom.doorX && gz === secretRoom.doorZ))) continue;

    used.add(key);
    const roll = Math.random();
    let kind = 'slime';
    let canSplit = false;
    if (stats.floorNum >= 3 && roll < 0.14) { kind = 'golem'; }
    else if (roll < 0.30) { kind = 'mimic'; }
    else if (roll < 0.55) { kind = 'splitter'; canSplit = true; }
    const hpBase = 6 + stats.floorNum * 2;
    const extra = kind === 'golem' ? 12 : (kind === 'mimic' ? 4 : 0);
    addEnemy({
      gx: gx, gz: gz, kind: kind, size: 1, canSplit: canSplit,
      hp: hpBase + Math.floor(Math.random() * 5) + extra,
      maxHp: hpBase + 4 + extra
    });
  }
}

function createHerbMesh() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.95 });
  const leaf = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(0.18, 0.4, 4)), mat);
  leaf.position.y = 0.28;
  group.add(leaf);
  const stem = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.06, 0.22, 0.06)), mat);
  stem.position.y = 0.1;
  group.add(stem);
  return group;
}

function spawnHerbs(count) {
  items = [];
  const used = new Set();
  used.add('1,1'); used.add('1,2'); used.add('2,1');
  for (const e of enemies) used.add(Math.floor(e.x) + ',' + Math.floor(e.z));
  let attempts = 0;
  while (items.length < count && attempts < 200) {
    attempts++;
    const gx = 1 + Math.floor(Math.random() * (mapW - 2));
    const gz = 1 + Math.floor(Math.random() * (mapH - 2));
    const key = gx + ',' + gz;
    if (map[gz][gx] !== 0 || used.has(key)) continue;
    if (secretRoom && gx === secretRoom.x && gz === secretRoom.z) continue;
    used.add(key);
    const isChest = items.length === 0 || Math.random() < 0.28;
    const mesh = isChest ? createChestMesh(false) : createHerbMesh();
    mesh.position.set(gx * CELL + CELL / 2, 0, gz * CELL + CELL / 2);
    worldGroup.add(mesh);
    items.push({ type: isChest ? 'chest' : 'herb', x: gx, z: gz, mesh: mesh, taken: false });
  }
}

function dropHerbAt(wx, wz) {
  const gx = Math.floor(wx);
  const gz = Math.floor(wz);
  if (getItemAt(gx, gz) || getEnemyAt(gx, gz)) return;
  const mesh = createHerbMesh();
  mesh.position.set(gx * CELL + CELL / 2, 0, gz * CELL + CELL / 2);
  worldGroup.add(mesh);
  items.push({ type: 'herb', x: gx, z: gz, mesh: mesh, taken: false });
}

function getItemAt(gx, gz) {
  for (const it of items) {
    if (!it.taken && it.x === gx && it.z === gz) return it;
  }
  return null;
}

function weaponName() {
  return (WEAPONS[stats.weapon] || WEAPONS[0]).name;
}

function upgradeWeapon(tier, msg) {
  if (tier <= stats.weapon) return false;
  stats.weapon = Math.min(tier, WEAPONS.length - 1);
  logEvent('Weapon: ' + weaponName());
  showMsg(msg || ('Weapon up: ' + weaponName()));
  refreshWeapon();
  updateHUD();
  return true;
}

function pickupHere() {
  const gx = Math.floor(player.x);
  const gz = Math.floor(player.z);
  const it = getItemAt(gx, gz);
  if (!it) return;
  it.taken = true;
  worldGroup.remove(it.mesh);
  if (it.type === 'herb') {
    stats.herbs++;
    sfxPickup();
    flashGet(320);
    showMsg('Picked up HERB');
    updateHUD();
  } else if (it.type === 'chest') {
    sfxPickup();
    flashGet(360);
    if (stats.floorNum >= 10 && stats.weapon < 3 && Math.random() < 0.45) {
      upgradeWeapon(3, 'Found KING SLAYER!');
    } else if (stats.floorNum >= 3 && stats.weapon < 1) {
      upgradeWeapon(1, 'Found LONG DAGGER!');
    } else if (stats.shield < stats.maxShield && Math.random() < 0.5) {
      stats.shield = stats.maxShield;
      updateShieldVis();
      showMsg('Repaired SHIELD');
      logEvent('Shield repaired');
    } else {
      const n = 1 + Math.floor(Math.random() * 2);
      stats.herbs += n;
      showMsg('Opened CHEST  +' + n + ' HERB');
    }
    updateHUD();
  }
}

function useHerb() {
  if (cfg.open || dead) return;
  if (stats.herbs <= 0) {
    showMsg('No herbs!');
    return;
  }
  if (stats.hp >= stats.maxHp && !stats.poison) {
    showMsg('HP is already full');
    return;
  }
  stats.herbs--;
  stats.herbsUsed = (stats.herbsUsed || 0) + 1;
  const heal = 12;
  stats.hp = Math.min(stats.maxHp, stats.hp + heal);
  const cured = stats.poison > 0;
  stats.poison = 0;
  sfxHeal();
  flashGet(420);
  showMsg(cured ? 'Used HERB  +' + heal + '  poison gone' : 'Used HERB  +' + heal + ' HP');
  updateHUD();
}

function flashScreen(color, ms) {
  const el = document.getElementById('fx-flash');
  if (!el) return;
  el.style.background = color;
  el.style.transition = 'none';
  el.style.opacity = '1';
  requestAnimationFrame(() => {
    el.style.transition = 'opacity ' + (ms || 220) + 'ms ease-out';
    el.style.opacity = '0';
  });
}

function flashGet(ms) {
  const el = document.getElementById('fx-get');
  if (!el) return;
  el.style.transition = 'none';
  el.style.opacity = '1';
  el.style.transform = 'scale(0.92)';
  requestAnimationFrame(() => {
    el.style.transition = 'opacity ' + (ms || 320) + 'ms ease-out, transform ' + (ms || 320) + 'ms ease-out';
    el.style.opacity = '0';
    el.style.transform = 'scale(1.04)';
  });
}

function hitShake(mag) {
  shakeTime = 0.28;
  shakeMag = mag || 0.12;
}

function getEnemyAt(gx, gz) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.floor(e.x) === gx && Math.floor(e.z) === gz) return e;
  }
  return null;
}

function enemyInFront() {
  const v = DIR_VEC[player.dir];
  const fx = Math.floor(player.x + v.x);
  const fz = Math.floor(player.z + v.z);
  return getEnemyAt(fx, fz);
}

function damageEnemy(e, dmg) {
  if (!e.alive) return;
  e.hp -= dmg;
  // flash
  e.mesh.scale.set(1.25, 0.7, 1.25);
  setTimeout(() => {
    if (e.alive) e.mesh.scale.set(1, 1, 1);
  }, 120);

  if (e.hp <= 0) {
    const kind = e.kind;
    const canSplit = e.canSplit;
    const ex = e.x, ez = e.z;
    e.alive = false;
    worldGroup.remove(e.mesh);
    stats.kills++;
    sfxKill();
    if (kind === 'core') {
      stairsLocked = false;
      logEvent('Destroyed the CORE');
      showMsg('The CORE collapses...');
      setTimeout(showEnding, 900);
    } else if (kind === 'king') {
      stairsLocked = false;
      stats.kings = (stats.kings || 0) + 1;
      logEvent('CUBE KING fell on ' + stats.floor);
      dropHerbAt(ex, ez);
      stats.hp = stats.maxHp;
      stats.mp = stats.maxMp;
      stats.poison = 0;
      if (stats.herbs < 3) stats.herbs = 3;
      else stats.herbs += 2;
      flashGet(500);
      if (stats.weapon < 2) upgradeWeapon(2, 'KING FALLS — HP full  RUNE BLADE');
      else showMsg('KING FALLS — HP/MP restored. Stairs open.');
      updateHUD();
    } else if (kind === 'golem') showMsg('TOXIC melts!');
    else if (kind === 'mimic') showMsg('MIMIC defeated!');
    else if (canSplit) showMsg('Splitter bursts!');
    else showMsg('Slime defeated!');
    if (kind !== 'king' && kind !== 'core' && canSplit) splitSlime(ex, ez);
    else if (kind !== 'king' && kind !== 'core' && Math.random() < (kind === 'mimic' ? 0.7 : (kind === 'golem' ? 0.55 : 0.35))) {
      dropHerbAt(ex, ez);
      showMsg((kind === 'mimic' ? 'MIMIC' : (kind === 'golem' ? 'TOXIC' : 'Slime')) + ' dropped a HERB');
    }
    updateHUD();
  } else {
    sfxHit();
    if (e.kind === 'mimic' && !e.awake) {
      e.awake = true;
      worldGroup.remove(e.mesh);
      e.mesh = createChestMesh(true);
      e.mesh.position.set(e.x * CELL, 0, e.z * CELL);
      worldGroup.add(e.mesh);
      showMsg("It's a MIMIC!  HP " + e.hp);
    } else {
      const name = e.kind === 'core' ? 'CORE' : (e.kind === 'king' ? 'CUBE KING' : (e.kind === 'mimic' ? 'MIMIC' : (e.kind === 'golem' ? 'TOXIC' : 'Slime')));
      showMsg('Hit! ' + name + ' HP ' + e.hp);
    }
  }
}

function splitSlime(wx, wz) {
  const gx = Math.floor(wx), gz = Math.floor(wz);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const spots = [];
  // prefer adjacent empty, then the death cell
  for (const [dx, dz] of dirs) {
    const x = gx + dx, z = gz + dz;
    if (x < 1 || z < 1 || x >= mapW - 1 || z >= mapH - 1) continue;
    if (map[z][x] !== 0) continue;
    if (getEnemyAt(x, z)) continue;
    if (x === Math.floor(player.x) && z === Math.floor(player.z)) continue;
    spots.push([x, z]);
  }
  if (!getEnemyAt(gx, gz) && !(gx === Math.floor(player.x) && gz === Math.floor(player.z))) {
    spots.unshift([gx, gz]);
  }
  const n = Math.min(2, spots.length);
  if (n === 0) {
    showMsg('The split had no space...');
    return;
  }
  const hp = Math.max(4, 3 + stats.floorNum);
  for (let i = 0; i < n; i++) {
    addEnemy({
      gx: spots[i][0], gz: spots[i][1],
      kind: 'slime', size: 0.58, canSplit: false,
      hp: hp, maxHp: hp
    });
  }
  showMsg(n === 2 ? 'Two small slimes appear!' : 'A small slime appears!');
}

function killPlayer() {
  if (dead) return;
  dead = true;
  moving = false;
  playerBusy = false;
  stats.hp = 0;
  stats.poison = 0;
  updateHUD();
  showMsg('YOU DIED — tap RETRY');
  const btn = document.getElementById('retry-btn');
  if (btn) btn.style.display = 'block';
  startDeathStorm();
}

function startDeathStorm() {
  const c = document.getElementById('death-noise');
  if (!c) return;
  c.style.display = 'block';
  c.style.opacity = '0';
  const fit = function() {
    c.width = Math.max(160, Math.floor(window.innerWidth / 3));
    c.height = Math.max(90, Math.floor(window.innerHeight / 3));
  };
  fit();
  window.addEventListener('resize', fit);
  let op = 0;
  const fade = setInterval(function() {
    op += 0.08;
    if (op >= 0.85) { op = 0.85; clearInterval(fade); }
    c.style.opacity = String(op);
  }, 40);
}

function drawDeathStorm() {
  const c = document.getElementById('death-noise');
  if (!c || c.style.display === 'none') return;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random();
    // green sand / static
    const v = n > 0.55 ? (40 + Math.random() * 215) : Math.random() * 30;
    d[i] = 0;
    d[i + 1] = v;
    d[i + 2] = Math.floor(v * 0.45);
    d[i + 3] = n > 0.35 ? 220 : 40;
  }
  // drifting scan bands
  const band = Math.floor((performance.now() / 18) % h);
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(0,255,80,0.12)';
  ctx.fillRect(0, band, w, 8);
  ctx.fillRect(0, (band + h * 0.4) % h, w, 3);
}

function enemiesAct() {
  if (dead) return;
  tickPoison();
  if (dead) return;
  // one attack per turn so you don't freeze after a few kills
  let attacked = false;
  for (const e of enemies) {
    if (!e.alive || dead) continue;

    const dx = Math.floor(player.x) - Math.floor(e.x);
    const dz = Math.floor(player.z) - Math.floor(e.z);
    const dist = Math.abs(dx) + Math.abs(dz);

    if (e.kind === 'mimic' && !e.awake) {
      if (dist === 1) {
        // stay disguised until attacked
      }
      continue;
    }

    if (e.kind === 'core') {
      const shot = kingShoot(e);
      if (!shot) corePulse(e);
      continue;
    }

    if (e.kind === 'king') {
      if (dist === 1 && !attacked) {
        attacked = true;
        const dmg = 3 + Math.ceil(stats.floorNum / 2);
        const slam = e.toxic ? 'TOXIC KING slams you for ' : 'CUBE KING slams you for ';
        if (hurtPlayer(dmg, slam + dmg + '!')) return;
        if (e.toxic && !dead && Math.random() < 0.5) applyPoison(5);
      } else if (dist <= 3 || !e.shotSkip) {
        e.shotSkip = dist > 4;
        kingShoot(e);
      } else {
        e.shotSkip = false;
      }
      continue;
    }

    if (dist === 1 && !attacked) {
      attacked = true;
      let dmg = 1 + Math.ceil(stats.floorNum / 2) + Math.floor(Math.random() * 3);
      if (e.kind === 'king') dmg += 3;
      if (e.kind === 'golem') dmg += 2;
      const aname = e.kind === 'mimic' ? 'MIMIC' : (e.kind === 'golem' ? 'TOXIC' : 'Slime');
      if (hurtPlayer(dmg, aname + ' hits you for ' + dmg + '!')) return;
      if (e.kind === 'golem' && !dead && Math.random() < 0.45) applyPoison(5);
      const h = handRest();
      leftHand.position.x = h.lx - 0.04;
      rightHand.position.x = h.rx + 0.04;
      setTimeout(function() {
        leftHand.position.x = h.lx;
        rightHand.position.x = h.rx;
      }, 150);
      if (stats.hp <= 0) {
        killPlayer();
        return;
      }
    } else if (dist <= 5 && dist > 1) {
      if (e.kind === 'golem') {
        e.slow = !e.slow;
        if (e.slow) continue;
      }
      // move toward player (one step)
      let mx = 0, mz = 0;
      if (Math.abs(dx) > Math.abs(dz)) {
        mx = dx > 0 ? 1 : -1;
      } else {
        mz = dz > 0 ? 1 : -1;
      }
      const nx = e.x + mx;
      const nz = e.z + mz;
      const ngx = Math.floor(nx);
      const ngz = Math.floor(nz);
      if (map[ngz] && map[ngz][ngx] === 0 && !getEnemyAt(ngx, ngz) &&
          !(ngx === Math.floor(player.x) && ngz === Math.floor(player.z))) {
        e.x = nx;
        e.z = nz;
        // animate mesh
        const startX = e.mesh.position.x;
        const startZ = e.mesh.position.z;
        const targetX = e.x * CELL;
        const targetZ = e.z * CELL;
        const t0 = performance.now();
        function moveStep(now) {
          const t = Math.min(1, (now - t0) / 200);
          e.mesh.position.x = startX + (targetX - startX) * t;
          e.mesh.position.z = startZ + (targetZ - startZ) * t;
          if (t < 1) requestAnimationFrame(moveStep);
        }
        requestAnimationFrame(moveStep);
      }
    }
  }
}

// -------------------------------------------------------
const DIR_VEC = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 }
];

function facingOpen(gx, gz) {
  // prefer a real corridor, never the map rim
  const order = [2, 1, 0, 3]; // south, east, north, west
  for (const d of order) {
    const v = DIR_VEC[d];
    const x = gx + v.x, z = gz + v.z;
    if (z >= 0 && z < mapH && x >= 0 && x < mapW && map[z][x] === 0) return d;
  }
  return 2;
}

function snapPlayer() {
  player.x = Math.floor(player.x + 0.0001) + 0.5;
  player.z = Math.floor(player.z + 0.0001) + 0.5;
}

function markExplored() {
  if (!explored || !explored.length) return;
  const x = Math.floor(player.x);
  const z = Math.floor(player.z);
  if (z >= 0 && z < mapH && x >= 0 && x < mapW) explored[z][x] = true;
}

function cellSeen(x, z) {
  x = Math.floor(x);
  z = Math.floor(z);
  return !!(explored[z] && explored[z][x]);
}

function canMove(nx, nz) {
  const gx = Math.floor(nx);
  const gz = Math.floor(nz);
  if (gx < 0 || gz < 0 || gx >= mapW || gz >= mapH) return false;
  if (map[gz][gx] !== 0 && map[gz][gx] !== 2) return false;
  if (getEnemyAt(gx, gz)) return false; // blocked by slime
  return true;
}

function tryMove(forward) {
  if (cfg.open || moving || dead || stats.hp <= 0) return;
  snapPlayer();
  const v = DIR_VEC[player.dir];
  const dx = forward ? v.x : -v.x;
  const dz = forward ? v.z : -v.z;
  const nx = player.x + dx;
  const nz = player.z + dz;
  if (canMove(nx, nz)) {
    moving = true;
    setTimeout(function() { if (!dead) moving = false; }, 400);
    const startX = player.x, startZ = player.z;
    const duration = 280;
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      player.x = startX + dx * ease;
      player.z = startZ + dz * ease;
      updateCamera();
      const h = handRest();
      leftHand.position.y = h.ly + Math.sin(t * Math.PI * 2) * 0.03;
      rightHand.position.y = h.ry + Math.sin(t * Math.PI * 2 + 0.5) * 0.03;
      if (t < 1) requestAnimationFrame(step);
      else {
        player.x = startX + dx;
        player.z = startZ + dz;
        snapPlayer();
        markExplored();
        updateCamera();
        moving = false;
        const h = handRest();
        leftHand.position.y = h.ly;
        rightHand.position.y = h.ry;
        sfxStep();
        checkSecret();
        pickupHere();
        checkSavePoint();
        checkStairs();
        if (!dead) enemiesAct();
      }
    }
    requestAnimationFrame(step);
  } else {
    // check if blocked by enemy
    const egx = Math.floor(nx);
    const egz = Math.floor(nz);
    sfxBlocked();
    const blocker = getEnemyAt(egx, egz);
    if (blocker) {
      if (blocker.kind === 'core') showMsg('The CORE blocks the way.');
      else if (blocker.kind === 'king') showMsg('CUBE KING blocks the way!');
      else if (blocker.kind === 'golem') showMsg('Toxic slime blocks the way.');
      else if (blocker.kind === 'mimic' && !blocker.awake) showMsg('A chest blocks the way...');
      else showMsg('A slime blocks the way!');
    } else {
      showMsg('Blocked!');
    }
  }
}

function tryTurn(delta) {
  if (cfg.open || moving || dead || stats.hp <= 0) return;
  moving = true;
  const startDir = player.dir;
  const target = (startDir + delta + 4) % 4;
  const startAngle = -startDir * Math.PI / 2;
  let diff = -target * Math.PI / 2 - startAngle;
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;

  const duration = 220;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    const ease = t * t * (3 - 2 * t);
    camera.rotation.y = startAngle + diff * ease;
    if (t < 1) requestAnimationFrame(step);
    else {
      player.dir = target;
      snapPlayer();
      updateCamera();
      moving = false;
      // enemies don't act on pure turn for better feel, or optionally:
      // enemiesAct();
    }
  }
  requestAnimationFrame(step);
}

function updateCamera() {
  camera.position.set(player.x * CELL, 1.55, player.z * CELL);
  camera.rotation.y = -player.dir * Math.PI / 2;
}

// -------------------------------------------------------
function handleKey(e) {
  if (e.code === 'Escape') {
    e.preventDefault();
    toggleConfig();
    return;
  }
  if (cfg.open) return;
  if (e.code === 'Backquote') {
    e.preventDefault();
    if (debug.unlocked) toggleDebug();
    return;
  }
  if (document.getElementById('title-screen').style.display !== 'none') return;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': tryMove(true); break;
    case 'KeyS': case 'ArrowDown': tryMove(false); break;
    case 'KeyA': case 'ArrowLeft': tryTurn(-1); break;
    case 'KeyD': case 'ArrowRight': tryTurn(1); break;
    case 'Space': attack(); break;
    case 'KeyE': case 'KeyH': useHerb(); break;
    case 'KeyQ': case 'KeyF': case 'ShiftLeft': guard(); break;
    case 'KeyR': case 'KeyC': fireBolt(); break;
  }
}

function setupMobile() {
  function bind(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', function(e) { e.preventDefault(); fn(); }, { passive: false });
    el.addEventListener('mousedown', function(e) { e.preventDefault(); fn(); });
  }
  bind('btn-forward', function() { tryMove(true); });
  bind('btn-back', function() { tryMove(false); });
  bind('btn-turn-l', function() { tryTurn(-1); });
  bind('btn-turn-r', function() { tryTurn(1); });
  bind('btn-action', attack);
  bind('btn-herb', useHerb);
  bind('btn-guard', guard);
  bind('btn-bolt', fireBolt);
}

function attack() {
  if (cfg.open || moving || playerBusy || dead || stats.hp <= 0) return;
  playerBusy = true;

  const h = handRest();
  const rest = {
    x: h.lx, y: h.ly, z: h.lz,
    rx: h.lrx, ry: h.lry, rz: h.lrz
  };
  const wind = {
    x: h.lx - 0.12, y: h.ly + 0.34, z: h.lz + 0.30,
    rx: 0.08, ry: 0.42, rz: 0.85
  };
  const fin = {
    x: h.lx + 0.52, y: h.ly - 0.28, z: h.lz - 0.38,
    rx: 0.92, ry: -0.28, rz: -1.28
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function poseAt(a, b, t) {
    leftHand.position.set(
      lerp(a.x, b.x, t),
      lerp(a.y, b.y, t),
      lerp(a.z, b.z, t)
    );
    leftHand.rotation.set(
      lerp(a.rx, b.rx, t),
      lerp(a.ry, b.ry, t),
      lerp(a.rz, b.rz, t)
    );
  }

  const t0 = performance.now();
  const windMs = 90;
  const slashMs = 220;
  const recoverMs = 90;
  function swing(now) {
    const elapsed = now - t0;
    if (elapsed < windMs) {
      const t = elapsed / windMs;
      const e = 1 - (1 - t) * (1 - t);
      poseAt(rest, wind, e);
    } else if (elapsed < windMs + slashMs) {
      const t = (elapsed - windMs) / slashMs;
      const e = t * t * (3 - 2 * t);
      const snap = e * e;
      poseAt(wind, fin, snap);
    } else if (elapsed < windMs + slashMs + recoverMs) {
      const t = (elapsed - windMs - slashMs) / recoverMs;
      poseAt(fin, rest, t * t * (3 - 2 * t));
    } else {
      poseAt(rest, rest, 1);
      playerBusy = false;
      return;
    }
    requestAnimationFrame(swing);
  }
  requestAnimationFrame(swing);
  sfxSlash();

  // check enemy in front
  const target = enemyInFront();
  if (target) {
    const w = WEAPONS[stats.weapon] || WEAPONS[0];
    const dmg = w.min + Math.floor(Math.random() * w.extra);
    damageEnemy(target, dmg);
    // after attack, enemies act
    setTimeout(enemiesAct, 420);
  } else {
    sfxMiss();
    showMsg('Slash! (nothing there)');
  }
}

// -------------------------------------------------------
function showMsg(text) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.classList.add('show');
  messageTimer = 1.8;
}

function updateHUD() {
  document.getElementById('hp').textContent = stats.hp;
  document.getElementById('mp').textContent = stats.mp;
  document.getElementById('lvl').textContent = stats.lvl;
  document.getElementById('floor').textContent = stats.floor;
  const badge = document.getElementById('floor-badge');
  if (badge) badge.innerHTML = '<small>FLOOR</small>' + stats.floor;
  const herbEl = document.getElementById('herb');
  if (herbEl) herbEl.textContent = stats.herbs;
  const lhand = document.getElementById('lhand');
  if (lhand) lhand.textContent = weaponName();
  const rhand = document.getElementById('rhand');
  if (rhand) rhand.textContent = stats.shield > 0 ? ('SHIELD ' + stats.shield + '/' + stats.maxShield) : 'BROKEN';
  const fill = document.getElementById('hp-fill');
  const num = document.getElementById('hp-num');
  if (fill) {
    const pct = Math.max(0, Math.min(100, (stats.hp / stats.maxHp) * 100));
    fill.style.width = pct + '%';
    if (stats.hp / stats.maxHp <= 0.3) fill.classList.add('low');
    else fill.classList.remove('low');
    if (stats.poison) fill.classList.add('poison');
    else fill.classList.remove('poison');
  }
  const ptag = document.getElementById('poison-tag');
  if (ptag) {
    ptag.style.display = stats.poison ? 'block' : 'none';
    ptag.textContent = 'POISON ' + stats.poison;
  }
  if (num) num.textContent = stats.hp + '/' + stats.maxHp;
  updateTargetBar();
}

function updateTargetBar() {
  const row = document.getElementById('tgt-row');
  const fill = document.getElementById('tgt-fill');
  const num = document.getElementById('tgt-num');
  if (!row || !fill) return;
  const t = typeof enemyInFront === 'function' ? enemyInFront() : null;
  if (!t || !t.alive) {
    row.classList.remove('show');
    return;
  }
  const name = t.kind === 'core' ? 'CORE' : (t.kind === 'king' ? 'KING' : (t.kind === 'mimic' ? 'MIMIC' : (t.kind === 'golem' ? 'TOXIC' : 'SLIME')));
  const pct = Math.max(0, Math.min(100, (t.hp / Math.max(1, t.maxHp)) * 100));
  fill.style.width = pct + '%';
  if (num) num.textContent = name + ' ' + t.hp;
  row.classList.add('show');
}

function drawMinimap() {
  const c = document.getElementById('minimap');
  const ctx = c.getContext('2d');
  const s = c.width / mapW;
  ctx.fillStyle = '#001100';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let z = 0; z < mapH; z++) {
    for (let x = 0; x < mapW; x++) {
      if (map[z][x] === 0 && cellSeen(x, z)) {
        ctx.fillStyle = '#003322';
        ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
      }
    }
  }
  if (stairs && cellSeen(stairs.x, stairs.z)) {
    ctx.strokeStyle = '#00ff66';
    ctx.strokeRect(stairs.x * s + 1, stairs.z * s + 1, s - 2, s - 2);
  }
  if (savePoint && cellSeen(savePoint.x, savePoint.z)) {
    ctx.fillStyle = '#aaffcc';
    ctx.beginPath();
    ctx.moveTo((savePoint.x + 0.5) * s, savePoint.z * s + 2);
    ctx.lineTo(savePoint.x * s + s - 2, (savePoint.z + 1) * s - 2);
    ctx.lineTo(savePoint.x * s + 2, (savePoint.z + 1) * s - 2);
    ctx.closePath();
    ctx.fill();
  }
  for (const it of items) {
    if (it.taken || !cellSeen(it.x, it.z)) continue;
    ctx.fillStyle = '#aaffcc';
    ctx.fillRect(it.x * s + s * 0.3, it.z * s + s * 0.3, s * 0.35, s * 0.35);
  }
  // enemies
  for (const e of enemies) {
    if (!e.alive || !cellSeen(e.x, e.z)) continue;
    if (e.kind === 'core') {
      ctx.strokeStyle = '#00ff66';
      ctx.beginPath();
      ctx.arc(e.x * s, e.z * s, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(e.x * s - 2, e.z * s - 2, 4, 4);
    } else if (e.kind === 'golem') {
      ctx.strokeStyle = '#00ff66';
      ctx.strokeRect(e.x * s - s * 0.28, e.z * s - s * 0.32, s * 0.56, s * 0.64);
      ctx.fillRect(e.x * s - s * 0.12, e.z * s - s * 0.28, s * 0.24, s * 0.22);
    } else if (e.kind === 'king') {
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x * s - s * 0.4, e.z * s - s * 0.4, s * 0.8, s * 0.8);
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(e.x * s - s * 0.2, e.z * s - s * 0.2, s * 0.4, s * 0.4);
    } else {
      ctx.fillStyle = '#33ff99';
      ctx.fillRect(e.x * s - s * 0.25, e.z * s - s * 0.25, s * 0.5, s * 0.5);
    }
  }
  for (const sh of shots) {
    if (!sh.alive) continue;
    ctx.fillStyle = '#ccffdd';
    ctx.fillRect(sh.x * s - 1.5, sh.z * s - 1.5, 3, 3);
  }
  // player facing arrow
  const v = DIR_VEC[player.dir];
  const px = player.x * s, pz = player.z * s;
  const fx = v.x, fz = v.z;
  const rx = -fz, rz = fx; // right
  ctx.fillStyle = '#00ff66';
  ctx.strokeStyle = '#aaffcc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px + fx * s * 0.85, pz + fz * s * 0.85);
  ctx.lineTo(px - fx * s * 0.45 + rx * s * 0.42, pz - fz * s * 0.45 + rz * s * 0.42);
  ctx.lineTo(px - fx * s * 0.2, pz - fz * s * 0.2);
  ctx.lineTo(px - fx * s * 0.45 - rx * s * 0.42, pz - fz * s * 0.45 - rz * s * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// -------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  if (!moving) {
    const h = handRest();
    leftHand.position.y = h.ly + Math.sin(t * 1.4) * 0.012;
    rightHand.position.y = h.ry + Math.sin(t * 1.4 + 1.1) * 0.012;
  }

  const titleEl = document.getElementById('title-screen');
  if (titleEl && titleEl.style.display !== 'none' && shakeTime <= 0) {
    const base = -player.dir * Math.PI / 2;
    camera.position.set(
      player.x * CELL,
      1.58 + Math.sin(t * 0.5) * 0.06,
      player.z * CELL
    );
    camera.rotation.y = base + Math.sin(t * 0.2) * 0.16;
  }

  if (shakeTime > 0) {
    shakeTime -= dt;
    const k = Math.max(0, shakeTime / 0.28);
    camera.position.x = player.x * CELL + (Math.random() - 0.5) * shakeMag * k * CELL;
    camera.position.y = 1.55 + (Math.random() - 0.5) * shakeMag * k * 2;
    camera.position.z = player.z * CELL + (Math.random() - 0.5) * shakeMag * k * CELL;
    if (shakeTime <= 0) {
      snapPlayer();
      updateCamera();
    }
  }

  for (const it of items) {
    if (it.taken || !it.mesh) continue;
    it.mesh.rotation.y += dt * 1.6;
    it.mesh.position.y = 0.08 + Math.sin(t * 3 + it.x) * 0.06;
  }
  if (savePoint && savePoint.mesh) {
    savePoint.mesh.rotation.y += dt * 0.8;
    savePoint.mesh.children.forEach(function(ch, i) {
      if (i === 2) ch.position.y = 1.45 + Math.sin(t * 2.4) * 0.06;
    });
  }

  for (let i = 0; i < torchFlames.length; i++) {
    const f = torchFlames[i];
    if (!f.mesh) continue;
    const target = 1
      + Math.sin(t * 2.1 + f.phase) * 0.16
      + Math.sin(t * 3.4 + f.phase * 1.7) * 0.08
      + Math.sin(t * 5.2 + f.phase * 0.5) * 0.04;
    if (f.smooth == null) f.smooth = 1;
    f.smooth += (target - f.smooth) * Math.min(1, dt * 6);
    f.mesh.scale.set(1, f.smooth, 1);
  }

  for (const e of enemies) {
    if (!e.alive) continue;
    const sz = e.size || 1;
    if (e.kind === 'core') {
      e.mesh.rotation.y += dt * 0.35;
      const ud = e.mesh.userData;
      if (ud.mid) ud.mid.rotation.y -= dt * 1.1;
      if (ud.oct) ud.oct.rotation.x += dt * 0.9;
      if (ud.orbit) {
        ud.orbit.rotation.y += dt * 0.9;
        ud.orbit.rotation.x = Math.sin(t * 0.7) * 0.25;
      }
      if (ud.halo) {
        ud.halo.rotation.y -= dt * 0.4;
        ud.halo.rotation.z += dt * 0.25;
        ud.halo.material.opacity = 0.14 + Math.sin(t * 3.2) * 0.1;
      }
      if (ud.glows) {
        for (let i = 0; i < ud.glows.length; i++) {
          const g = ud.glows[i];
          const wave = Math.sin(t * 2.4 + i * 0.9);
          g.material.opacity = g.userData.baseOp * (0.65 + wave * 0.45);
          const sc = g.userData.baseS * (1 + wave * 0.06);
          g.scale.set(sc, sc, sc);
        }
      }
      const pulse = 1 + Math.sin(t * 3) * 0.04;
      e.mesh.scale.set(sz * pulse, sz * pulse, sz * pulse);
      continue;
    }
    if (e.kind === 'mimic' && !e.awake) {
      e.mesh.position.y = 0;
      e.mesh.scale.set(1, 1, 1);
      continue;
    }
    if (e.kind === 'king') {
      const bob = Math.sin(t * 1.8 + e.bobPhase) * (e.mesh.userData.jelly ? 0.08 : 0.04);
      e.mesh.position.y = bob;
      e.mesh.scale.set(sz, sz, sz);
      const dxk = player.x * CELL - e.mesh.position.x;
      const dzk = player.z * CELL - e.mesh.position.z;
      e.mesh.rotation.y = Math.atan2(dxk, dzk);
      const legs = e.mesh.userData.legs;
      if (legs) {
        for (let i = 0; i < legs.length; i++) {
          const leg = legs[i];
          const ph = t * 2.8 + (leg.userData.phase || i);
          leg.rotation.z = Math.sin(ph) * 0.28 * (leg.userData.side || 1);
          leg.rotation.y = Math.cos(ph * 0.7) * 0.1;
        }
      }
      const tents = e.mesh.userData.tents;
      if (tents) {
        for (let i = 0; i < tents.length; i++) {
          const tent = tents[i];
          const ph = t * 1.7 + (tent.userData.phase || i);
          tent.rotation.x = Math.sin(ph) * 0.38;
          tent.rotation.z = Math.cos(ph * 0.85) * 0.22;
        }
      }
      if (e.mesh.userData.bell) {
        const p = 1 + Math.sin(t * 2.1) * 0.04;
        e.mesh.userData.bell.scale.set(p, 1 + Math.sin(t * 2.1 + 0.4) * 0.05, p);
      }
      if (e.mesh.userData.bits) e.mesh.userData.bits.rotation.y += dt * 0.7;
      const kbub = e.mesh.userData.bubbles;
      if (kbub) {
        kbub.rotation.y += dt * 0.55;
        for (let i = 0; i < kbub.children.length; i++) {
          const b = kbub.children[i];
          const base = b.userData.base;
          const ph = b.userData.phase;
          b.position.y = base[1] + Math.sin(t * 1.8 + ph) * 0.14;
          const spin = t * 0.7 + ph;
          b.position.x = base[0] * Math.cos(spin * 0.15) - base[2] * Math.sin(spin * 0.15);
          b.position.z = base[0] * Math.sin(spin * 0.15) + base[2] * Math.cos(spin * 0.15);
          b.rotation.y += dt * 1.4;
        }
      }
      continue;
    }
    if (e.kind === 'golem') {
      const bob = Math.sin(t * 1.6 + e.bobPhase) * 0.025;
      e.mesh.position.y = bob;
      e.mesh.scale.set(1, 1, 1);
      const dxg = player.x * CELL - e.mesh.position.x;
      const dzg = player.z * CELL - e.mesh.position.z;
      e.mesh.rotation.y = Math.atan2(dxg, dzg);
      const bubbles = e.mesh.userData.bubbles;
      if (bubbles) {
        bubbles.rotation.y += dt * 0.55;
        for (let i = 0; i < bubbles.children.length; i++) {
          const b = bubbles.children[i];
          const base = b.userData.base;
          const ph = b.userData.phase;
          b.position.y = base[1] + Math.sin(t * 1.8 + ph) * 0.12;
          const spin = t * 0.7 + ph;
          b.position.x = base[0] * Math.cos(spin * 0.15) - base[2] * Math.sin(spin * 0.15);
          b.position.z = base[0] * Math.sin(spin * 0.15) + base[2] * Math.cos(spin * 0.15);
          b.rotation.y += dt * 1.4;
        }
      }
      continue;
    }
    const bob = Math.sin(t * 2.2 + e.bobPhase) * 0.08 * sz;
    e.mesh.position.y = bob;
    const squash = 1 + Math.sin(t * 2.2 + e.bobPhase) * 0.06;
    e.mesh.scale.set(sz / Math.sqrt(squash), sz * squash, sz / Math.sqrt(squash));
    const dx = player.x * CELL - e.mesh.position.x;
    const dz = player.z * CELL - e.mesh.position.z;
    e.mesh.rotation.y = Math.atan2(dx, dz);
  }

  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) {
      document.getElementById('message').classList.remove('show');
    }
  }

  updateShots(dt);

  if (dead) drawDeathStorm();
  if (typeof updateTargetBar === "function") updateTargetBar();

  drawMinimap();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyHandRest();
}

init();
updateHUD();
 