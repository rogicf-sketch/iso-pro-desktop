type LeitorFeedbackTom = 'sucesso' | 'erro' | 'confirmado';

let audioCtx: AudioContext | null = null;

function obterContextoAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx ??= new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tocarTom(frequencia: number, duracaoMs: number, tipo: OscillatorType = 'sine', volume = 0.14) {
  const ctx = obterContextoAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const inicio = ctx.currentTime;
  const fim = inicio + duracaoMs / 1000;
  osc.type = tipo;
  osc.frequency.setValueAtTime(frequencia, inicio);
  gain.gain.setValueAtTime(volume, inicio);
  gain.gain.exponentialRampToValueAtTime(0.001, fim);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(fim);
}

export function tocarFeedbackLeitor(tom: LeitorFeedbackTom) {
  if (tom === 'sucesso') {
    tocarTom(880, 70);
    window.setTimeout(() => tocarTom(1174, 90), 85);
    return;
  }
  if (tom === 'confirmado') {
    tocarTom(988, 55);
    window.setTimeout(() => tocarTom(1318, 75), 65);
    return;
  }
  tocarTom(240, 110, 'square', 0.11);
  window.setTimeout(() => tocarTom(190, 130, 'square', 0.11), 130);
}
