// GLITCH RUNNER main loop - RU/EN mixed comments
import { openSimplex } from './noise.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr = window.devicePixelRatio || 1;
let width, height;

// UI elements
const hpEl = document.getElementById('hp');
const xpEl = document.getElementById('xp');
const glitchEl = document.getElementById('glitch');
const glitchBtn = document.getElementById('force-glitch');
const devMode = new URLSearchParams(location.search).get('dev') === '1';
if (devMode) glitchBtn.hidden = false;

// game state
const player = {
  x: 0, y: 0, r: 12, hp: 100, speed: 2,
  glyphs: [], // orbit slots
  dps: 1
};
const enemies = [];
const loots = [];
const bullets = [];

const noise = openSimplex(1337);
let lastSpawn = 0;
let lastDiff = 0;
let difficultyScalar = 1;
let timeSurvived = 0;
let glitchCountdown = 0;

// simple pooling
function getEnemy() {
  return enemies.find(e => e.dead) || { dead: true };
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resize);
resize();

function spawnWave() {
  for (let i = 0; i < 5 * difficultyScalar; i++) {
    const e = getEnemy();
    e.dead = false;
    e.x = Math.random() < 0.5 ? Math.random() * width : Math.random() < 0.5 ? 0 : width;
    e.y = Math.random() < 0.5 ? Math.random() * height : Math.random() < 0.5 ? 0 : height;
    e.r = 12;
    e.hp = 20 * difficultyScalar;
    enemies.push(e);
  }
}

function update(dt) {
  timeSurvived += dt;
  lastSpawn += dt;
  lastDiff += dt;
  if (lastSpawn > 6000) { // 6s
    spawnWave();
    lastSpawn = 0;
  }
  if (lastDiff > 10000) { // 10s
    const lowHP = player.hp < 30 ? 0.1 : 0;
    difficultyScalar = Math.max(0.7,
      Math.min(3,
        0.8 + (player.dps / (difficultyScalar * 10) - 1) * 0.5 - lowHP +
        timeSurvived / 600000 * 0.05));
    lastDiff = 0;
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);
  // player
  ctx.fillStyle = '#fff';
  ctx.fillText('●', player.x, player.y);
  // enemies
  enemies.forEach(e => {
    if (e.dead) return;
    ctx.fillStyle = `hsl(${(timeSurvived / 10) % 360},80%,60%)`;
    ctx.fillText('▲', e.x, e.y);
  });
}

let last = 0;
function loop(ts) {
  if (!last) last = ts;
  const dt = ts - last;
  update(dt);
  render();
  last = ts;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// touch controls
let touchStart = null;
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
});
canvas.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 10) {
    // tap
    // TODO: loot collection
  } else {
    player.x += Math.sign(dx) * player.speed * 10;
    player.y += Math.sign(dy) * player.speed * 10;
  }
  touchStart = null;
});

glitchBtn.addEventListener('click', () => {
  glitchCountdown = 1; // trigger for dev
});
