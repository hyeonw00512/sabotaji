import crypto from 'node:crypto';
export const id = (bytes = 10) => crypto.randomBytes(bytes).toString('hex');
export const roomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
};
export function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);
