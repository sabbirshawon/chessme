// Plays a checkmate chime using the Web Audio API (no audio files needed)
let ctx = null;

function tone(freq, start, duration, volume = 0.25, type = "triangle") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export function playCheckmate(iWon) {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    if (iWon) {
      // rising victory fanfare: C5 → E5 → G5 → C6
      tone(523.25, 0.0, 0.18);
      tone(659.25, 0.15, 0.18);
      tone(783.99, 0.3, 0.18);
      tone(1046.5, 0.45, 0.5, 0.3);
    } else {
      // falling "defeat" tones: G4 → E4 → C4
      tone(392.0, 0.0, 0.25, 0.2, "sine");
      tone(329.63, 0.22, 0.25, 0.2, "sine");
      tone(261.63, 0.44, 0.6, 0.22, "sine");
    }
  } catch {}
}