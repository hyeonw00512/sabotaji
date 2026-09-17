const storageKey = 'mine:sound-enabled';

export const isSoundEnabled = () => localStorage.getItem(storageKey) !== 'false';
export const setSoundEnabled = enabled => localStorage.setItem(storageKey, String(enabled));

const cues = {
  place: [440, .07, 'triangle'],
  action: [280, .1, 'square'],
  reveal: [660, .16, 'sine'],
  victory: [523, .22, 'triangle'],
  error: [130, .11, 'sawtooth']
};

export function playCue(name, enabled = true) {
  if (!enabled || !cues[name]) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = new Audio();
    const [frequency, duration, type] = cues[name];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + duration);
  } catch { /* Audio is optional and must never block play. */ }
}
