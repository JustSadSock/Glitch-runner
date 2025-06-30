let ctx = null;
let masterGain = null;
let beatInterval = null;
let dropTimer = null;
let step = 0;

export function startMusic() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(ctx.destination);
  step = 0;
  beatInterval = setInterval(playBeat, 500); // 120 BPM
  scheduleDrop();
}

export function stopMusic() {
  if (!ctx) return;
  clearInterval(beatInterval);
  clearTimeout(dropTimer);
  ctx.close();
  ctx = null;
}

function playBeat() {
  const t = ctx.currentTime;
  if (step % 2 === 0) playKick(t);
  else playHat(t);
  step = (step + 1) % 4;
}

function playKick(time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(50, time + 0.15);
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.15);
}

function playHat(time) {
  const length = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 4000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(time);
  src.stop(time + 0.05);
}

function scheduleDrop() {
  const delay = 25000 + Math.random() * 10000; // 25-35s
  dropTimer = setTimeout(triggerDrop, delay);
}

function triggerDrop() {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = createReverbBuffer(0.3);
  osc.type = 'sawtooth';
  osc.frequency.value = 80;
  osc.detune.value = Math.random() * 800 - 400;
  osc.connect(gain);
  gain.connect(convolver);
  convolver.connect(masterGain);
  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.start(now);
  osc.stop(now + 0.5);
  scheduleDrop();
}

function createReverbBuffer(duration) {
  const length = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  return buffer;
}
