// Small synthesised sound effects (WebAudio), so the app ships no audio files.
// The audio context is created lazily on first use, which is always after a tap or key press,
// as iOS requires.

export type SoundKind = 'move' | 'capture' | 'check' | 'castle' | 'correct' | 'wrong';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A short wooden "tock": filtered noise plus a low thump. */
function knock(ac: AudioContext, at: number, gain = 0.5, pitch = 1) {
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1500 * pitch;
  band.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.value = gain;
  noise.connect(band).connect(g).connect(ac.destination);
  noise.start(at);

  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(220 * pitch, at);
  osc.frequency.exponentialRampToValueAtTime(90 * pitch, at + 0.06);
  const og = ac.createGain();
  og.gain.setValueAtTime(gain * 0.6, at);
  og.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
  osc.connect(og).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.09);
}

function tone(ac: AudioContext, at: number, freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playSound(kind: SoundKind) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  switch (kind) {
    case 'move':
      return knock(ac, t, 0.45);
    case 'capture':
      knock(ac, t, 0.6, 0.8);
      return knock(ac, t + 0.045, 0.4, 1.1);
    case 'castle':
      knock(ac, t, 0.45);
      return knock(ac, t + 0.09, 0.4, 1.05);
    case 'check':
      knock(ac, t, 0.45);
      return tone(ac, t + 0.02, 880, 0.18, 'triangle');
    case 'correct':
      tone(ac, t, 660, 0.12);
      return tone(ac, t + 0.1, 990, 0.2);
    case 'wrong':
      return tone(ac, t, 180, 0.22, 'square', 0.08);
  }
}

/** Which sound a SAN move makes. */
export function soundForSan(san: string): SoundKind {
  if (san.includes('+') || san.includes('#')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}
