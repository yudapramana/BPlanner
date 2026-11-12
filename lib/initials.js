// Inisial & warna avatar dari nama (dipakai saat foto Google tidak ada / gagal dimuat)
const COLORS = ['#14365d', '#0984e3', '#6c5ce7', '#00b894', '#e17055', '#e84393', '#d68910', '#2d8a6e'];
export function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return '?';
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
