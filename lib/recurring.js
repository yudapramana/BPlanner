import { db, bid, inTx } from './db';
import { statusOf, rp, pct, WARN_AT, RED, ORANGE, GREEN } from './calc';

// ===== Transaksi berulang =====
// Templat (tabel recurring) dibuat sekali; tiap bulan menghasilkan satu "kejadian" (occurrence) pada tanggal jatuh tempo.
// Kejadian yang sudah diproses dicatat di recurring_log (status 'done' atau 'skip') supaya tidak pernah dibuat dua kali,
// termasuk bila pengguna menghapus transaksi hasilnya (jadi 'skip', tidak muncul lagi).
//   otomatis = 1 -> transaksi dibuat sendiri begitu jatuh tempo tiba (saat aplikasi dibuka)
//   otomatis = 0 -> hanya diingatkan; pengguna menekan "Catat" bila sudah bayar

export const INGAT = [[-1, 'Tanpa'], [0, 'Hari-H'], [1, 'H-1'], [3, 'H-3'], [7, 'H-7']]; // [hari sebelum jatuh tempo, label]
export const MAX_BACKFILL = 60; // paling banyak 60 bulan ke belakang dicatat sekaligus

const p2 = n => String(n).padStart(2, '0');
export const daysIn = (y, m) => new Date(y, m, 0).getDate();
const splitYm = p => p.split('-').map(Number);
export const nextYm = p => { let [y, m] = splitYm(p); m++; if (m > 12) { m = 1; y++; } return `${y}-${p2(m)}`; };
export const backYm = (p, n) => { let [y, m] = splitYm(p); m -= n; while (m < 1) { m += 12; y--; } return `${y}-${p2(m)}`; };
const periods = (from, to) => { const out = []; for (let p = from; p <= to && out.length < 200; p = nextYm(p)) out.push(p); return out; };
export const todayYmd = (now = new Date()) => `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
const dayNum = v => { const [y, m, d] = v.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; }; // nomor hari kalender (bebas zona waktu)
export const daysBetween = (a, b) => dayNum(a) - dayNum(b); // a - b, dalam hari kalender

// Tanggal jatuh tempo untuk bulan "YYYY-MM": hari 29-31 dipangkas ke tanggal terakhir bulan itu
export const dueDate = (r, periode) => { const [y, m] = splitYm(periode); return `${periode}-${p2(Math.min(r.hari, daysIn(y, m)))}`; };
export const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`; };

export const dueLabel = days => days < 0 ? `Terlambat ${-days} hari` : days === 0 ? 'Jatuh tempo hari ini' : days === 1 ? 'Besok' : `${days} hari lagi`;

// ---- Baca ----
export const getRecurring = (bookId = bid()) => db.getAllSync('SELECT * FROM recurring WHERE book_id=? ORDER BY aktif DESC, hari, id', [bookId]);
export const countRecurring = (bookId = bid()) => db.getFirstSync('SELECT COUNT(*) n FROM recurring WHERE book_id=? AND aktif=1', [bookId]).n;
const logged = (id, periode) => !!db.getFirstSync('SELECT 1 x FROM recurring_log WHERE recurring_id=? AND periode=?', [id, periode]);
const inRange = (r, p) => p >= r.mulai && (!r.akhir || p <= r.akhir);

// Kejadian yang belum diproses dari satu templat dalam rentang bulan [from, to]
function pendingOf(r, from, to, today) {
  return periods(from, to).filter(p => inRange(r, p) && !logged(r.id, p)).map(p => { const due = dueDate(r, p); return { r, periode: p, due, days: daysBetween(due, today) }; });
}

// Kejadian belum diproses, urut jatuh tempo. lookback: berapa bulan ke belakang masih dianggap "terlambat"; ahead: berapa bulan ke depan.
// bookId null = semua buku kas (dipakai penjadwal pengingat).
export function pendingList({ bookId = bid(), lookback = 2, ahead = 1, now = new Date() } = {}) {
  const today = todayYmd(now), cur = today.slice(0, 7);
  const rows = bookId == null ? db.getAllSync('SELECT * FROM recurring WHERE aktif=1') : db.getAllSync('SELECT * FROM recurring WHERE aktif=1 AND book_id=?', [bookId]);
  const out = [];
  rows.forEach(r => out.push(...pendingOf(r, backYm(cur, lookback), nextYmN(cur, ahead), today)));
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.r.id - b.r.id));
}
const nextYmN = (p, n) => { for (let i = 0; i < n; i++) p = nextYm(p); return p; };

// Jatuh tempo berikutnya untuk satu templat (kejadian belum diproses yang paling awal, mulai 2 bulan lalu s/d 13 bulan ke depan)
export function nextDue(r, now = new Date()) {
  const today = todayYmd(now), cur = today.slice(0, 7);
  return pendingOf(r, backYm(cur, 2), nextYmN(cur, 13), today)[0] || null;
}

// ---- Catatan ambang 80% / 100% ----
// Menghitung dampak membayar tagihan ini terhadap anggaran kategorinya di bulan jatuh tempo, memakai ambang yang sama dengan Dashboard (statusOf, WARN_AT).
// Hasil: { level: 'over' | 'full' | 'warn' | 'nobudget' | 'near' | 'done', text } atau null bila tidak ada yang perlu dicatat. fmt/pf dipakai untuk menyamarkan nominal/persen.
export const NOTE_COLOR = { over: RED, full: RED, warn: ORANGE, nobudget: '#636e72', near: GREEN, done: GREEN };
export function thresholdNote(r, periode, fmt = rp, pf = pct) {
  const c = r.category_id == null ? null : db.getFirstSync('SELECT anggaran FROM categories WHERE id=?', [r.category_id]);
  if (!c) return null;
  const spend = r.jenis === 'Biaya' || r.jenis === 'Tagihan';
  const real = db.getFirstSync('SELECT COALESCE(SUM(nominal),0) s FROM transactions WHERE category_id=? AND substr(tanggal,1,7)=?', [r.category_id, periode]).s;
  const after = real + (r.nominal || 0), budget = c.anggaran;
  if (budget <= 0) return spend ? { level: 'nobudget', text: 'Kategori ini belum dianggarkan' } : null;
  const p = after / budget;
  if (spend) {
    const st = statusOf(r.jenis, { budget, real: after }, fmt);
    if (st.level === 'over') return { level: 'over', text: `Setelah dibayar melampaui anggaran ${fmt(after - budget)} (${pf(p)})` };
    if (p >= 1) return { level: 'full', text: 'Setelah dibayar anggaran habis (100%)' };
    if (p >= WARN_AT) return { level: 'warn', text: `Setelah dibayar anggaran terpakai ${pf(p)} (batas peringatan ${pf(WARN_AT)})` };
    return null;
  }
  if (p >= 1) return { level: 'done', text: `Target ${r.jenis === 'Pendapatan' ? 'pemasukan' : r.jenis === 'Pinjaman' ? 'cicilan' : 'tabungan'} bulan ini tercapai (${pf(p)})` };
  if (p >= WARN_AT) return { level: 'near', text: `Mendekati target bulan ini (${pf(p)})` };
  return null;
}

// ---- Tulis ----
// Membuat transaksi dari satu kejadian dan mencatatnya di log. Mengembalikan id transaksi.
export function postOccurrence(r, periode) {
  let id;
  inTx(() => {
    const due = dueDate(r, periode);
    const cat = r.category_id == null ? null : db.getFirstSync('SELECT nama FROM categories WHERE id=?', [r.category_id]);
    id = db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id,recurring_id) VALUES(?,?,?,?,?,?,?,?)',
      [due, r.jenis, cat ? cat.nama : r.kategori, r.nominal, r.ket || '', r.book_id, r.category_id, r.id]).lastInsertRowId;
    db.runSync("INSERT OR REPLACE INTO recurring_log(recurring_id,periode,status,tx_id) VALUES(?,?,'done',?)", [r.id, periode, id]);
  });
  return id;
}
export const skipOccurrence = (r, periode) => db.runSync("INSERT OR REPLACE INTO recurring_log(recurring_id,periode,status,tx_id) VALUES(?,?,'skip',NULL)", [r.id, periode]);

// Menghapus transaksi: bila hasil templat berulang, bulannya ditandai 'skip' agar tidak dibuat ulang saat aplikasi dibuka.
export function deleteTransaction(id) {
  inTx(() => {
    db.runSync("UPDATE recurring_log SET status='skip', tx_id=NULL WHERE tx_id=?", [id]);
    db.runSync('DELETE FROM transactions WHERE id=?', [id]);
  });
}

// Dipanggil saat aplikasi dibuka / kembali aktif: mencatat semua kejadian otomatis yang sudah jatuh tempo (termasuk bulan yang terlewat
// selama aplikasi tidak dibuka). Berlaku untuk SEMUA buku kas. Mengembalikan jumlah transaksi yang dibuat.
export function processRecurring(now = new Date()) {
  const today = todayYmd(now), cur = today.slice(0, 7);
  const rows = db.getAllSync('SELECT * FROM recurring WHERE aktif=1 AND otomatis=1');
  let n = 0;
  inTx(() => rows.forEach(r => {
    const start = r.mulai > backYm(cur, MAX_BACKFILL - 1) ? r.mulai : backYm(cur, MAX_BACKFILL - 1);
    const end = r.akhir && r.akhir < cur ? r.akhir : cur;
    periods(start, end).forEach(p => {
      if (dueDate(r, p) > today || logged(r.id, p)) return;
      postOccurrence(r, p); n++;
    });
  }));
  return n;
}

// ---- Simpan templat ----
// f: { jenis, catId, nominal, ket, hari, mulai, akhir, otomatis, ingat, aktif }
export function saveRecurring(f, id = null, bookId = bid()) {
  const cat = db.getFirstSync('SELECT * FROM categories WHERE id=?', [f.catId]);
  if (!cat) throw new Error('Kategori tidak ditemukan');
  const v = [cat.jenis, cat.id, cat.nama, f.nominal, (f.ket || '').trim(), f.hari, f.mulai, f.akhir || null, f.otomatis ? 1 : 0, f.ingat, f.aktif === false ? 0 : 1];
  if (id != null) {
    db.runSync('UPDATE recurring SET jenis=?,category_id=?,kategori=?,nominal=?,ket=?,hari=?,mulai=?,akhir=?,otomatis=?,ingat=?,aktif=? WHERE id=?', [...v, id]);
    return id;
  }
  return db.runSync('INSERT INTO recurring(jenis,category_id,kategori,nominal,ket,hari,mulai,akhir,otomatis,ingat,aktif,book_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [...v, bookId]).lastInsertRowId;
}

// Templat dari transaksi yang baru dibuat di form "Tambah": transaksi itu sudah jadi kejadian bulannya, jadi langsung ditandai 'done'.
export function makeRecurringFromTx({ catId, nominal, ket, tanggal, txId, otomatis = true, ingat = 3 }) {
  let id;
  inTx(() => {
    id = saveRecurring({ catId, nominal, ket, hari: parseInt(tanggal.slice(8, 10), 10), mulai: tanggal.slice(0, 7), otomatis, ingat });
    db.runSync('UPDATE transactions SET recurring_id=? WHERE id=?', [id, txId]);
    db.runSync("INSERT OR REPLACE INTO recurring_log(recurring_id,periode,status,tx_id) VALUES(?,?,'done',?)", [id, tanggal.slice(0, 7), txId]);
  });
  return id;
}

export function deleteRecurring(id) {
  inTx(() => {
    db.runSync('DELETE FROM recurring_log WHERE recurring_id=?', [id]);
    db.runSync('UPDATE transactions SET recurring_id=NULL WHERE recurring_id=?', [id]); // transaksi yang sudah tercatat tetap ada
    db.runSync('DELETE FROM recurring WHERE id=?', [id]);
  });
}

export const monthTotals = (bookId = bid()) => db.getAllSync('SELECT jenis, SUM(nominal) s, COUNT(*) n FROM recurring WHERE book_id=? AND aktif=1 GROUP BY jenis', [bookId]);
