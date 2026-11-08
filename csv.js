// Modul CSV murni (tanpa dependensi native) agar mudah diuji.
const J = ['Pendapatan', 'Biaya', 'Tagihan', 'Pinjaman', 'Investasi/Tabungan'];
export const HEAD = ['Tipe', 'Tanggal', 'Jenis', 'Kategori', 'Nominal', 'Keterangan'];
const q = c => '"' + String(c ?? '').replace(/"/g, '""') + '"';
export const toCsv = rows => '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';

export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ','; // Excel Indonesia memakai ;
  const rows = []; let row = [], cur = '', inq = false;
  const endRow = () => { row.push(cur); cur = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inq) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += ch; }
    else if (ch === '"') inq = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else cur += ch;
  }
  if (cur !== '' || row.length) endRow();
  return rows;
}
export function normJenis(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('invest') || s.includes('tabung')) return J[4];
  return J.find(j => j.toLowerCase() === s) || '';
}
const p2 = n => String(n).padStart(2, '0');
export function normDate(v) {
  v = String(v || '').trim(); let m;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if ((m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  return '';
}
export function parseNom(v) {
  const s = String(v ?? '').trim().replace(/[.,]\d{1,2}$/, '');
  const n = parseInt(s.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
