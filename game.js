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
const xpBarEl = document.getElementById('xp-bar');
const glitchEl = document.getElementById('glitch');
const levelEl = document.getElementById('level');
const startEl = document.getElementById('start-screen');
const overEl = document.getElementById('game-over');
const finalStatsEl = document.getElementById('final-stats');
const restartBtn = document.getElementById('restart');
const glyphsEl = document.getElementById('glyphs');
const glitchBtn = document.getElementById('force-glitch');
const rotateWarningEl = document.getElementById('rotate-warning');
const joystickEl = document.getElementById('joystick');
const stickEl = document.getElementById('stick');
const waveEl = document.getElementById('wave');
const staticEl = document.getElementById('static-overlay');
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const devMode = new URLSearchParams(location.search).get('dev') === '1';
if (devMode) glitchBtn.hidden = false;
if (!isMobile) joystickEl.style.display = 'none';

// lock to portrait on mobile when possible
let orientationMedia = null;
if (isMobile) {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {});
  }
  orientationMedia = window.matchMedia
    ? window.matchMedia('(orientation: portrait)')
    : null;
  if (orientationMedia && orientationMedia.addEventListener) {
    orientationMedia.addEventListener('change', checkOrientation);
  }
}

function isPortrait() {
  if (screen.orientation && screen.orientation.type) {
    return screen.orientation.type.startsWith('portrait');
  }
  if (orientationMedia) return orientationMedia.matches;
  return window.innerHeight >= window.innerWidth;
}

function checkOrientation() {
  if (!isMobile) {
    rotateWarningEl.hidden = true;
    return;
  }
  rotateWarningEl.hidden = isPortrait();
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  checkOrientation();
}
window.addEventListener('resize', resize);
if (isMobile) window.addEventListener('orientationchange', checkOrientation);
resize();

// ==== game state =====
const enemyTypes = [
  {char:'▲', type:'stabber'},
  {char:'■', type:'charger'},
  {char:'◆', type:'orbiter'},
  {char:'♥', type:'healer'},
  {char:'☠', type:'trailer'}
];
const enemyChars = enemyTypes.map(e=>e.char);
const noise = openSimplex(42);

const chunkTypes = {
  street: { color:'#020814', obstacleCount:3 },
  market: { color:'#042a1a', obstacleCount:8 },
  bug:    { color:'#200012', obstacleCount:5, hazard:true }
};

const player = { x: width/2, y: height/2, r: 12, hp: 100, xp: 0, speed: 0.3, glyphs: [] };
const enemies = [];
const bullets = [];
const loot = [];
const obstacles = [];
const chunks = {};

let lastSpawn = 0;
let spawnInterval = 6000;
let waveCount = 0;
let breakTimer = 0;
let rareLoot = false;
let lavaHazard = false;
const xpForLevel = 10;
let playerLevel = 1;
let difficultyScalar = 1;
let timeSurvived = 0;
let highDpsTime = 0;
let glitchCountdown = 0;
let running = false;
let rafId = 0;
let camX = 0, camY = 0;
let damageFlash = 0;
let joyX = 0, joyY = 0;
const keys = {};

// helpers
const rand = n => Math.floor(Math.random()*n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const distSq = (a,b)=>{const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy};

function getChunk(cx, cy){
  const key = cx+','+cy;
  let c = chunks[key];
  if(!c){
    const r = (noise(cx*0.1, cy*0.1)+1)/2;
    let type = 'street';
    if(r>0.7) type='bug';
    else if(r>0.4) type='market';
    const cfg = chunkTypes[type];
    c = { type, color: cfg.color, obstacles: [] };
    for(let i=0;i<cfg.obstacleCount;i++){
      const o={x:cx*256+rand(256),y:cy*256+rand(256),r:16};
      if(cfg.hazard || lavaHazard) o.damage=1;
      c.obstacles.push(o);
    }
    chunks[key]=c;
    obstacles.push(...c.obstacles);
  }
  return c;
}

function removeChunk(cx,cy){
  const key=cx+','+cy;
  const c=chunks[key];
  if(c){
    c.obstacles.forEach(o=>{
      const idx=obstacles.indexOf(o);
      if(idx!==-1) obstacles.splice(idx,1);
    });
    delete chunks[key];
  }
}

function cleanupChunks(minX,maxX,minY,maxY){
  for(const k in chunks){
    const [cx,cy]=k.split(',').map(Number);
    if(cx<minX||cx>maxX||cy<minY||cy>maxY){
      removeChunk(cx,cy);
    }
  }
}

// simple object pool allocator
function alloc(pool, props){
  const obj = pool.find(o=>o.dead) || {};
  Object.assign(obj, props, {dead:false});
  if(!pool.includes(obj)) pool.push(obj);
  return obj;
}

function elementFromHue(h){
  h = (h % 360 + 360) % 360;
  if(h < 60 || h >= 300) return 'fire';
  if(h < 180) return 'chain';
  return 'slow';
}

function randomGlyph() {
  return { char: enemyChars[rand(enemyChars.length)], hue: rand(360), level:1 };
}

function addGlyph(g) {
  const same = player.glyphs.find(o=>o.char===g.char && o.hue===g.hue);
  if (same) same.level++;
  else if (player.glyphs.length < 8) player.glyphs.push(g);
}

function fireBullet(x,y,angle,hue,level){
  alloc(bullets,{
    x,y,
    dx:Math.cos(angle)*0.4,
    dy:Math.sin(angle)*0.4,
    r:4,
    hue,
    damage:5*level,
    element:elementFromHue(hue)
  });
}

function spawnWave(){
  waveCount++;
  const count = 4 + Math.round(difficultyScalar*2);
  for(let i=0;i<count;i++){
    const side = rand(4);
    let x,y;
    if(side===0){x=camX+rand(width);y=camY-20;}
    else if(side===1){x=camX+rand(width);y=camY+height+20;}
    else if(side===2){x=camX-20;y=camY+rand(height);}
    else {x=camX+width+20;y=camY+rand(height);}
    const cfg = enemyTypes[rand(enemyTypes.length)];
    alloc(enemies,{x,y,r:12,hp:20*difficultyScalar,char:cfg.char,hue:rand(360),type:cfg.type});
  }
  if(lavaHazard){
    for(let i=0;i<3;i++){
      const x=camX+rand(width);
      const y=camY+rand(height);
      obstacles.push({x,y,r:16,damage:1});
    }
  }
  if(waveCount%10===0){
    breakTimer=1000;
    staticEl.style.display='block';
    applyModifier();
  }
}

function spawnGlitchBoss(){
  alloc(enemies,{x:camX+width/2,y:camY-40,r:24,hp:200,char:'Ω',hue:320,boss:true});
  glitchCountdown = 10000; // 10s of FX
}

function glitchReward(){
  if(Math.random()<0.5){
    const g=randomGlyph();
    g.broken=true;
    addGlyph(g);
  }else if(player.glyphs.length){
    player.glyphs.splice(rand(player.glyphs.length),1);
  }
}

function applyModifier(){
  const m = rand(3);
  if(m===0){
    spawnInterval = Math.max(2000, spawnInterval-1000);
  }else if(m===1){
    rareLoot = true;
  }else{
    lavaHazard = true;
  }
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
      g.cd = g.broken ? 0 : 1000 / g.level;
    }
  });
}

function updateBullets(dt){
  bullets.forEach(b=>{
    b.x += b.dx*dt;
    b.y += b.dy*dt;
    if(b.ttl!==undefined){
      b.ttl -= dt;
      if(b.ttl<=0) b.dead=true;
    }
    if(b.x<camX-50||b.y<camY-50||b.x>camX+width+50||b.y>camY+height+50) b.dead=true;
  });
}

function updateEnemies(dt){
  enemies.forEach(e=>{
    if(e.hp<=0){ e.dead=true; return; }
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const len = Math.hypot(dx,dy)||1;
    const speed = (e.slow>0?0.05:0.1) * difficultyScalar;
    switch(e.type){
      case 'stabber':
        e.cd = (e.cd||0) - dt;
        if(e.dash>0){
          e.dash -= dt;
          e.x += Math.cos(e.dashAng)*dt*speed*4;
          e.y += Math.sin(e.dashAng)*dt*speed*4;
        }else{
          e.x += dx/len*dt*speed;
          e.y += dy/len*dt*speed;
          if(e.cd<=0){
            e.dashAng = Math.atan2(dy,dx);
            e.dash = 150;
            e.cd = 1000;
          }
        }
        break;
      case 'charger':
        e.cd = (e.cd||1000) - dt;
        if(e.dash>0){
          e.dash -= dt;
          e.x += Math.cos(e.dashAng)*dt*speed*6;
          e.y += Math.sin(e.dashAng)*dt*speed*6;
        }else{
          e.x += dx/len*dt*speed*0.5;
          e.y += dy/len*dt*speed*0.5;
          if(e.cd<=0){
            e.dashAng = Math.atan2(dy,dx);
            e.dash = 300;
            e.cd = 2000;
          }
        }
        break;
      case 'orbiter':
        e.angle = (e.angle||Math.random()*Math.PI*2) + dt*0.002*difficultyScalar;
        const radius = e.radius || (e.radius = 60 + rand(40));
        e.x = player.x + Math.cos(e.angle)*radius;
        e.y = player.y + Math.sin(e.angle)*radius;
        break;
      case 'healer':
        e.x += dx/len*dt*speed*0.6;
        e.y += dy/len*dt*speed*0.6;
        e.cd = (e.cd||0) - dt;
        if(e.cd<=0){
          enemies.forEach(o=>{
            if(o!==e && !o.dead && distSq(o,e)<2500) o.hp += 5;
          });
          e.cd = 3000;
        }
        break;
      case 'trailer':
        e.x += dx/len*dt*speed;
        e.y += dy/len*dt*speed;
        e.trailCd = (e.trailCd||0) - dt;
        if(e.trailCd<=0){
          alloc(bullets,{x:e.x,y:e.y,dx:0,dy:0,r:4,hue:e.hue,damage:5,owner:'enemy',ttl:1000});
          e.trailCd = 300;
        }
        break;
    }
    if(e.burn>0){ e.hp -= dt*0.005; e.burn-=dt; }
    if(e.slow>0) e.slow-=dt;
  });
}

function updateLoot(dt){ loot.forEach(l=>l.t+=dt); }

function collisions(){
  bullets.forEach(b=>{
    if(b.dead) return;
    if(b.owner==='enemy'){
      if(distSq(b,player)<(b.r+player.r)**2){
        player.hp-=b.damage;
        damageFlash = 200;
        b.dead=true;
      }
      return;
    }
    enemies.forEach(e=>{
      if(e.dead) return;
      if(distSq(b,e)<(b.r+e.r)**2){
        e.hp-=b.damage;
        if(b.element==='fire') e.burn=3000;
        if(b.element==='slow') e.slow=2000;
        if(b.element==='chain'){
          const other=enemies.find(o=>!o.dead&&o!==e&&distSq(o,e)<40000);
          if(other) other.hp-=b.damage*0.5;
        }
        b.dead=true;
        if(e.hp<=0){
          alloc(loot,{x:e.x,y:e.y,r:10,char:e.char,hue:e.hue,t:0,level:1});
          if(rareLoot && Math.random()<0.2){
            alloc(loot,{x:e.x+rand(20)-10,y:e.y+rand(20)-10,r:10,char:'\u2726',hue:rand(360),t:0,level:2});
          }
          player.xp+=1;
          checkLevelUp();
          if(e.boss) glitchReward();
        }
      }
    });
    obstacles.forEach(o=>{
      if(b.dead) return;
      if(distSq(b,o)<(b.r+o.r)**2) b.dead=true;
    });
  });
  enemies.forEach(e=>{
    if(e.dead) return;
    if(distSq(e,player)<(e.r+player.r)**2){
      player.hp-=0.05*difficultyScalar;
      damageFlash = 200;
    }
  });
  obstacles.forEach(o=>{
    const d = Math.hypot(player.x-o.x, player.y-o.y);
    if(d < player.r+o.r){
      const ang = Math.atan2(player.y-o.y, player.x-o.x);
      player.x = o.x + Math.cos(ang)*(player.r+o.r);
      player.y = o.y + Math.sin(ang)*(player.r+o.r);
      if(o.damage){
        player.hp -= o.damage;
        damageFlash = 200;
      }
    }
  });
  loot.forEach(l=>{
    if(l.dead) return;
    if(distSq(l,player)<(l.r+player.r)**2){ collectLoot(l); }
  });
}

function collectLoot(l){
  l.dead=true;
  addGlyph({char:l.char,hue:l.hue,level:l.level||1});
  checkLevelUp();
}

function checkLevelUp(){
  const needed = playerLevel * xpForLevel;
  if(player.xp >= needed){
    playerLevel++;
    player.hp += 10;
    player.speed += 0.05;
  }
}

let diffTimer = 0;
function calcDifficulty(dt){
  diffTimer += dt;
  const expDPS = difficultyScalar*10;
  player.dps = player.glyphs.length*10;
  if(diffTimer>=10000){
    diffTimer=0;
    const lowHP = player.hp<30?0.1:0;
    difficultyScalar = clamp(0.8 + (player.dps/expDPS - 1)*0.5 - lowHP + timeSurvived/600*0.05,0.7,3);
  }
  if(player.dps>1.4*expDPS){
    highDpsTime += dt;
    if(highDpsTime>60000 && glitchCountdown===0){
      if(Math.random()<0.3){
        spawnGlitchBoss();
        highDpsTime=0;
      }
    }
  } else highDpsTime = Math.max(0,highDpsTime-dt);
}

function update(dt){
  timeSurvived += dt/1000;
  if(breakTimer>0){
    breakTimer -= dt;
    if(breakTimer<=0) staticEl.style.display='none';
    return;
  }
  lastSpawn += dt;
  if(lastSpawn>spawnInterval){ spawnWave(); lastSpawn=0; }
  const kx = (keys['ArrowRight']||keys['d']?1:0) - (keys['ArrowLeft']||keys['a']?1:0);
  const ky = (keys['ArrowDown']||keys['s']?1:0) - (keys['ArrowUp']||keys['w']?1:0);
  const moveX = clamp(kx + joyX,-1,1);
  const moveY = clamp(ky + joyY,-1,1);
  camX += moveX * player.speed * dt * 0.2;
  camY += moveY * player.speed * dt * 0.2;
  player.x = camX + width/2;
  player.y = camY + height/2;
  updateGlyphs(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateLoot(dt);
  collisions();
  calcDifficulty(dt);
  if(glitchCountdown>0) glitchCountdown -= dt;
  if(damageFlash>0) damageFlash -= dt;
}

function drawBackground(){
  ctx.fillStyle='#03050a';
  ctx.fillRect(0,0,width,height);
  const startX = Math.floor(camX/256);
  const endX = Math.floor((camX+width)/256);
  const startY = Math.floor(camY/256);
  const endY = Math.floor((camY+height)/256);
  for(let cx=startX; cx<=endX; cx++){
    for(let cy=startY; cy<=endY; cy++){
      const chunk = getChunk(cx,cy);
      const sx = cx*256 - camX;
      const sy = cy*256 - camY;
      ctx.fillStyle = chunk.color;
      ctx.fillRect(sx,sy,256,256);
      chunk.obstacles.forEach(o=>{
        ctx.fillStyle = (chunk.type==='bug' || o.damage) ? '#800' : '#555';
        ctx.fillText('#',o.x-camX,o.y-camY);
      });
    }
  }
  cleanupChunks(startX-2,endX+2,startY-2,endY+2);
}

function render(){
  if(glitchCountdown>0){
    ctx.save();
    ctx.globalAlpha = 0.6 + Math.random()*0.4;
    ctx.shadowColor = '#f0f';
    ctx.shadowBlur = 8;
  }
  drawBackground();
  loot.forEach(l=>{ if(l.dead) return; ctx.fillStyle=`hsl(${l.hue},80%,${50+Math.sin(l.t/100)*30}%)`; ctx.fillText(l.char,l.x-camX,l.y-camY); });
  bullets.forEach(b=>{ if(b.dead) return; ctx.fillStyle=`hsl(${b.hue},80%,70%)`; ctx.fillText('·',b.x-camX,b.y-camY); });
  ctx.fillStyle='#fff';
  ctx.fillText('●',player.x-camX,player.y-camY);
  enemies.forEach(e=>{ if(e.dead) return; ctx.fillStyle=`hsl(${e.hue},80%,60%)`; ctx.fillText(e.char,e.x-camX,e.y-camY); });
  if(damageFlash>0){
    ctx.fillStyle=`rgba(255,0,0,${damageFlash/200})`;
    ctx.fillRect(0,0,width,height);
  }
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
  const pct = (player.xp % xpForLevel)/xpForLevel*100;
  if(xpBarEl) xpBarEl.style.width = pct+'%';
  glitchEl.textContent = glitchCountdown>0 ? 'GLITCH '+(glitchCountdown/1000).toFixed(1) : '';
  levelEl.textContent = 'LVL '+playerLevel;
  glyphsEl.textContent = player.glyphs.map(g=>g.char.repeat(g.level)).join(' ');
  waveEl.textContent = 'WAVE '+waveCount;
  if(player.hp<=0) return gameOver();
  rafId = requestAnimationFrame(loop);
}
function startGame(){
  if(running) return;
  startEl.hidden=true;
  overEl.hidden=true;
  camX=-width/2; camY=-height/2;
  player.x=camX+width/2; player.y=camY+height/2;
  player.hp=100;player.xp=0;playerLevel=1;
  joyX=joyY=0; stickEl.style.transform='translate(0,0)';
  enemies.length=0;bullets.length=0;loot.length=0;obstacles.length=0;
  for(const k in chunks) delete chunks[k];
  timeSurvived=0;glitchCountdown=0;lastSpawn=0;
  spawnInterval=6000;waveCount=0;breakTimer=0;rareLoot=false;lavaHazard=false;
  staticEl.style.display='none';
  waveEl.textContent='WAVE 0';
  glyphsEl.textContent='';
  levelEl.textContent='LVL 1';
  running=true;
  last=0;
  rafId=requestAnimationFrame(loop);
}

function gameOver(){
  running=false;
  finalStatsEl.textContent = `Time ${timeSurvived.toFixed(1)}s XP ${player.xp}`;
  overEl.hidden=false;
}

// touch tap loot
canvas.addEventListener('touchend',e=>{
  const t=e.changedTouches[0];
  loot.forEach(l=>{ if(!l.dead && distSq(l,{x:t.clientX+camX,y:t.clientY+camY})<400){ collectLoot(l); } });
});

glitchBtn.addEventListener('click',spawnGlitchBoss);
startEl.addEventListener('click',startGame);
restartBtn.addEventListener('click',startGame);

document.addEventListener('keydown',e=>{
  keys[e.key]=true;
  if(e.key==='Enter' && !running) startGame();
  if(e.key===' ' && running) {
    loot.forEach(l=>{
      if(!l.dead && distSq(l,player)<400) collectLoot(l);
    });
  }
});
document.addEventListener('keyup',e=>{ keys[e.key]=false; });

// joystick controls
let joyTouch=null;
joystickEl.addEventListener('touchstart',e=>{
  joyTouch=e.touches[0].identifier;
});
joystickEl.addEventListener('touchmove',e=>{
  const t=[...e.touches].find(t=>t.identifier===joyTouch);
  if(!t) return;
  const rect=joystickEl.getBoundingClientRect();
  const cx=rect.left+rect.width/2;
  const cy=rect.top+rect.height/2;
  const dx=t.clientX-cx;
  const dy=t.clientY-cy;
  const max=rect.width/2;
  joyX=clamp(dx/max,-1,1);
  joyY=clamp(dy/max,-1,1);
  stickEl.style.transform=`translate(${joyX*20}px,${joyY*20}px)`;
});
joystickEl.addEventListener('touchend',e=>{
  joyTouch=null; joyX=0; joyY=0; stickEl.style.transform='translate(0,0)';
});
joystickEl.addEventListener('touchcancel',e=>{
  joyTouch=null; joyX=0; joyY=0; stickEl.style.transform='translate(0,0)';
});

canvas.addEventListener('click',e=>{
  loot.forEach(l=>{ if(!l.dead && distSq(l,{x:e.clientX+camX,y:e.clientY+camY})<400){ collectLoot(l); } });
});
