// GLITCH RUNNER - simple portrait roguelike on pure canvas
// mix of RU/EN comments, no frameworks
import { openSimplex } from './noise.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
let width = 0, height = 0;

// UI refs
const hpEl = document.getElementById('hp');
const xpEl = document.getElementById('xp');
const glitchEl = document.getElementById('glitch');
const glitchBtn = document.getElementById('force-glitch');
const devMode = new URLSearchParams(location.search).get('dev') === '1';
if (devMode) glitchBtn.hidden = false;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ==== game state =====
const enemyChars = ['▲','■','◆','♥','☠'];
const noise = openSimplex(42);

const player = { x: width/2, y: height/2, r: 12, hp: 100, xp: 0, speed: 0.3, glyphs: [] };
const enemies = [];
const bullets = [];
const loot = [];

let lastSpawn = 0;
let difficultyScalar = 1;
let timeSurvived = 0;
let highDpsTime = 0;
let glitchCountdown = 0;

// helpers
const rand = n => Math.floor(Math.random()*n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const distSq = (a,b)=>{const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy};

function randomGlyph() {
  return { char: enemyChars[rand(enemyChars.length)], hue: rand(360), level:1 };
}

function addGlyph(g) {
  const same = player.glyphs.find(o=>o.char===g.char && o.hue===g.hue);
  if (same) same.level++;
  else if (player.glyphs.length < 8) player.glyphs.push(g);
}

function fireBullet(x,y,angle,hue,level){
  bullets.push({x,y,dx:Math.cos(angle)*0.4,dy:Math.sin(angle)*0.4,r:4,hue,damage:5*level});
}

function spawnWave(){
  const count = 4 + Math.round(difficultyScalar*2);
  for(let i=0;i<count;i++){
    const side = rand(4);
    let x,y;
    if(side===0){x=rand(width);y=-20;}
    else if(side===1){x=rand(width);y=height+20;}
    else if(side===2){x=-20;y=rand(height);} 
    else {x=width+20;y=rand(height);} 
    enemies.push({x,y,r:12,hp:20*difficultyScalar,char:enemyChars[rand(enemyChars.length)],hue:rand(360)});
  }
}

function spawnGlitchBoss(){
  enemies.push({x:width/2,y:-40,r:24,hp:200,char:'Ω',hue:320,boss:true});
  glitchCountdown = 10000; // 10s of FX
}

function updateGlyphs(dt){
  const baseR = 32;
  player.glyphs.forEach((g,i)=>{
    g.angle = (g.angle||0) + dt*0.001;
    const r = baseR + i*4;
    const gx = player.x + Math.cos(g.angle)*r;
    const gy = player.y + Math.sin(g.angle)*r;
    g.cd = (g.cd||0) - dt;
    if(g.cd<=0){
      fireBullet(gx,gy,g.angle,g.hue,g.level);
      g.cd = 1000 / g.level;
    }
  });
}

function updateBullets(dt){
  bullets.forEach(b=>{
    b.x += b.dx*dt;
    b.y += b.dy*dt;
    if(b.x<-50||b.y<-50||b.x>width+50||b.y>height+50) b.dead=true;
  });
}

function updateEnemies(dt){
  enemies.forEach(e=>{
    if(e.hp<=0){ e.dead=true; return; }
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const len = Math.hypot(dx,dy)||1;
    e.x += dx/len * dt*0.1*difficultyScalar;
    e.y += dy/len * dt*0.1*difficultyScalar;
  });
}

function updateLoot(dt){ loot.forEach(l=>l.t+=dt); }

function collisions(){
  bullets.forEach(b=>{
    if(b.dead) return;
    enemies.forEach(e=>{
      if(e.dead) return;
      if(distSq(b,e)<(b.r+e.r)**2){
        e.hp-=b.damage;
        b.dead=true;
        if(e.hp<=0){
          loot.push({x:e.x,y:e.y,r:10,char:'✦',hue:e.hue,t:0});
          player.xp+=1;
        }
      }
    });
  });
  enemies.forEach(e=>{
    if(e.dead) return;
    if(distSq(e,player)<(e.r+player.r)**2){
      player.hp-=0.05*difficultyScalar;
    }
  });
  loot.forEach(l=>{
    if(l.dead) return;
    if(distSq(l,player)<(l.r+player.r)**2){ collectLoot(l); }
  });
}

function collectLoot(l){
  l.dead=true;
  addGlyph(randomGlyph());
}

function calcDifficulty(dt){
  const expDPS = difficultyScalar*10;
  player.dps = player.glyphs.length*10;
  const lowHP = player.hp<30?0.1:0;
  difficultyScalar = clamp(0.8 + (player.dps/expDPS - 1)*0.5 - lowHP + timeSurvived/600*0.05,0.7,3);
  if(player.dps>1.4*expDPS){
    highDpsTime += dt;
    if(highDpsTime>60000 && glitchCountdown===0){
      spawnGlitchBoss();
      highDpsTime=0;
    }
  } else highDpsTime = Math.max(0,highDpsTime-dt);
}

function update(dt){
  timeSurvived += dt/1000;
  lastSpawn += dt;
  if(lastSpawn>6000){ spawnWave(); lastSpawn=0; }
  updateGlyphs(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateLoot(dt);
  collisions();
  calcDifficulty(dt);
  if(glitchCountdown>0) glitchCountdown -= dt;
}

function drawBackground(){
  ctx.fillStyle='#03050a';
  ctx.fillRect(0,0,width,height);
  for(let x=0;x<width;x+=256){
    for(let y=0;y<height;y+=256){
      const n = noise(x*0.01,y*0.01);
      const c = Math.floor(20 + n*25);
      ctx.fillStyle=`rgb(${c},0,${c*2})`;
      ctx.fillRect(x,y,256,256);
    }
  }
}

function render(){
  if(glitchCountdown>0){
    ctx.save();
    ctx.globalAlpha = 0.6 + Math.random()*0.4;
    ctx.shadowColor = '#f0f';
    ctx.shadowBlur = 8;
  }
  drawBackground();
  loot.forEach(l=>{ if(l.dead) return; ctx.fillStyle=`hsl(${l.hue},80%,${50+Math.sin(l.t/100)*30}%)`; ctx.fillText(l.char,l.x,l.y); });
  bullets.forEach(b=>{ if(b.dead) return; ctx.fillStyle=`hsl(${b.hue},80%,70%)`; ctx.fillText('·',b.x,b.y); });
  ctx.fillStyle='#fff';
  ctx.fillText('●',player.x,player.y);
  enemies.forEach(e=>{ if(e.dead) return; ctx.fillStyle=`hsl(${e.hue},80%,60%)`; ctx.fillText(e.char,e.x,e.y); });
  if(glitchCountdown>0) ctx.restore();
}

let last=0;
function loop(ts){
  if(!last) last=ts;
  const dt = ts-last;
  last=ts;
  update(dt);
  render();
  hpEl.textContent = 'HP '+Math.max(0,player.hp|0);
  xpEl.textContent = 'XP '+player.xp;
  glitchEl.textContent = glitchCountdown>0 ? 'GLITCH '+(glitchCountdown/1000).toFixed(1) : '';
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// touch controls: swipe move, tap loot
let touchStart=null;
canvas.addEventListener('touchstart',e=>{
  const t=e.touches[0];
  touchStart={x:t.clientX,y:t.clientY};
});
canvas.addEventListener('touchend',e=>{
  if(!touchStart) return;
  const t=e.changedTouches[0];
  const dx=t.clientX-touchStart.x;
  const dy=t.clientY-touchStart.y;
  const len=Math.hypot(dx,dy);
  if(len<10){ // tap
    loot.forEach(l=>{ if(!l.dead && distSq(l,{x:t.clientX,y:t.clientY})<400){ collectLoot(l); } });
  } else {
    player.x+=Math.sign(dx)*player.speed*100;
    player.y+=Math.sign(dy)*player.speed*100;
  }
  touchStart=null;
});

glitchBtn.addEventListener('click',spawnGlitchBoss);
