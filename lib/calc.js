import { db, bid } from './db';
export const JENIS = ['Pendapatan','Biaya','Tagihan','Pinjaman','Investasi/Tabungan'];
export const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export const rp = n => (Math.round(n || 0) < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // -0,4 -> "Rp 0" (bukan "-Rp 0")
// Format ringkas. Pembulatan memutuskan satuannya: 999.999 -> "Rp 1 jt" (bukan "Rp 1000 rb"), 999.999.999 -> "Rp 1 M".
export const rpk = n => {
  const a = Math.abs(n || 0), sg = n < 0 && Math.round(a) > 0 ? '-' : '';
  const one = v => v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (a >= 1e9 || (a / 1e6).toFixed(1) === '1000.0') return `${sg}Rp ${one(a / 1e9)} M`;
  if (a >= 1e6 || Math.round(a / 1e3) >= 1000) return `${sg}Rp ${one(a / 1e6)} jt`;
  if (a >= 1e3) return `${sg}Rp ${Math.round(a / 1e3)} rb`;
  return `${sg}Rp ${Math.round(a)}`;
};
export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
export const MASK = 'Rp ******';
export const MASK_PCT = '***';
export const pct = v => (v == null ? '-' : Math.round(v * 100) + '%');
export const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const GREEN = '#2e9e5b', ORANGE = '#f0932b', RED = '#d63031';

export const GRAY = '#b2bec3';
export const WARN_AT = 0.8; // ambang peringatan (80%); ambang 100% = anggaran habis. Dipakai Dashboard dan pengingat tagihan.
const UNPAID = { Pendapatan: 'Belum diterima', Pinjaman: 'Belum dibayar', 'Investasi/Tabungan': 'Belum disetor' };

// Status satu kategori: { level, color, label }. level: over | warn | ok | nobudget | due | low | empty
export function statusOf(jenis, r, fmt = rp) {
  const { budget, real } = r;
  const spend = jenis === 'Biaya' || jenis === 'Tagihan';
  if (budget <= 0) {
    if (real <= 0) return { level: 'empty', color: GRAY, label: '' };
    return spend ? { level: 'nobudget', color: GRAY, label: 'Belum dianggarkan' } : { level: 'ok', color: GREEN, label: 'Tanpa anggaran' };
  }
  const p = real / budget;
  if (spend) {
    if (p > 1) return { level: 'over', color: RED, label: 'Lebih ' + fmt(real - budget) };
    return { level: p >= WARN_AT ? 'warn' : 'ok', color: p >= WARN_AT ? ORANGE : GREEN, label: 'Sisa ' + fmt(budget - real) };
  }
  if (p >= 1) return { level: 'ok', color: GREEN, label: 'Tercapai' };
  if (p === 0) return { level: jenis === 'Pinjaman' ? 'due' : 'low', color: RED, label: UNPAID[jenis] };
  return { level: jenis === 'Pinjaman' ? 'due' : 'low', color: ORANGE, label: 'Kurang ' + fmt(budget - real) };
}
export const colorFor = (jenis, budget, real) => statusOf(jenis, { budget, real }).color;

export function monthData(y, m) {
  const cats = db.getAllSync('SELECT * FROM categories WHERE book_id=? ORDER BY urut,id', [bid()]);
  // Transaksi dihubungkan ke kategori lewat category_id (bukan nama); transaksi tanpa kategori (yatim) tidak ikut baris kategori
  const sums = new Map(db.getAllSync('SELECT category_id, SUM(nominal) s FROM transactions WHERE book_id=? AND substr(tanggal,1,7)=? AND category_id IS NOT NULL GROUP BY category_id', [bid(), ym(y, m)]).map(r => [r.category_id, r.s]));
  const d = {};
  JENIS.forEach(j => {
    const rows = cats.filter(c => c.jenis === j).map(c => {
      const real = sums.get(c.id) || 0;
      return { id: c.id, nama: c.nama, budget: c.anggaran, real, p: c.anggaran > 0 ? real / c.anggaran : null };
    });
    d[j] = { rows, budget: rows.reduce((a, r) => a + r.budget, 0), real: rows.reduce((a, r) => a + r.real, 0) };
  });
  const out = d.Biaya.real + d.Tagihan.real + d.Pinjaman.real + d['Investasi/Tabungan'].real;
  const outBud = d.Biaya.budget + d.Tagihan.budget + d.Pinjaman.budget + d['Investasi/Tabungan'].budget;
  const spendBud = d.Biaya.budget + d.Tagihan.budget + d.Pinjaman.budget;
  const spendReal = d.Biaya.real + d.Tagihan.real + d.Pinjaman.real;
  const saldo = d.Pendapatan.real - out;
  return {
    d, saldo, saldoPlan: d.Pendapatan.budget - outBud, surplus: saldo >= 0,
    tabungan: d.Pendapatan.real > 0 ? d['Investasi/Tabungan'].real / d.Pendapatan.real : 0,
    terpakai: spendBud > 0 ? spendReal / spendBud : 0,
  };
}

export function yearData(y) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const s = db.getAllSync('SELECT jenis,SUM(nominal) s FROM transactions WHERE book_id=? AND substr(tanggal,1,7)=? GROUP BY jenis', [bid(), ym(y, m)]);
    const g = j => (s.find(x => x.jenis === j) || {}).s || 0;
    const n = db.getFirstSync('SELECT COUNT(*) c FROM transactions WHERE book_id=? AND substr(tanggal,1,7)=?', [bid(), ym(y, m)]).c;
    const r = { m, bulan: MONTHS[m - 1], pend: g('Pendapatan'), biaya: g('Biaya'), tagihan: g('Tagihan'), pinjaman: g('Pinjaman'), tab: g('Investasi/Tabungan'), n };
    r.total = r.biaya + r.tagihan + r.pinjaman + r.tab;
    r.saldo = r.pend - r.total;
    out.push(r);
  }
  return out;
}

export function highlights(rows) {
  const f = rows.filter(r => r.n > 0);
  const total = f.reduce((a, r) => a + r.saldo, 0);
  const tab = f.reduce((a, r) => a + r.tab, 0);
  const pend = f.reduce((a, r) => a + r.pend, 0);
  const hi = f.length ? f.reduce((a, r) => (r.saldo > a.saldo ? r : a)) : null;
  const lo = f.length ? f.reduce((a, r) => (r.saldo < a.saldo ? r : a)) : null;
  return {
    total, avg: f.length ? total / f.length : 0, hi, lo,
    plus: f.filter(r => r.saldo >= 0).length, minus: f.filter(r => r.saldo < 0).length,
    tab, rasio: pend > 0 ? tab / pend : 0,
  };
}

export function cek(t, cats) {
  if (!t.tanggal || !t.jenis || !t.kategori || !t.nominal) return '⚠ Data belum lengkap';
  return t.category_id != null && cats.some(c => c.id === t.category_id) ? '✔ OK' : '⚠ Kategori tidak ada di List';
}

// Pengeluaran = Biaya + Tagihan + Pinjaman (Tabungan/Investasi bukan pengeluaran, sama seperti "Pengeluaran Terpakai" di Dashboard).
// Ubah daftar ini jika ingin definisi lain.
export const EXPENSE_JENIS = ['Biaya', 'Tagihan', 'Pinjaman'];
const EXP_IN = EXPENSE_JENIS.map(() => '?').join(',');

// Total pengeluaran per bulan untuk satu tahun (12 elemen)
export function expenseYear(y) {
  const rows = db.getAllSync(`SELECT substr(tanggal,6,2) mm, jenis, SUM(nominal) s FROM transactions WHERE book_id=? AND substr(tanggal,1,4)=? AND jenis IN (${EXP_IN}) GROUP BY mm, jenis`, [bid(), String(y), ...EXPENSE_JENIS]);
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const g = j => (rows.find(x => x.mm === mm && x.jenis === j) || {}).s || 0;
    const r = { m, bulan: MONTHS[m - 1], short: MONTHS_SHORT[m - 1], biaya: g('Biaya'), tagihan: g('Tagihan'), pinjaman: g('Pinjaman') };
    r.total = r.biaya + r.tagihan + r.pinjaman;
    out.push(r);
  }
  return out;
}

// Pengeluaran satu bulan per kategori, terbesar dulu
export function expenseByCategory(y, m) {
  return db.getAllSync(`SELECT jenis, category_id, kategori, SUM(nominal) s FROM transactions WHERE book_id=? AND substr(tanggal,1,7)=? AND jenis IN (${EXP_IN}) GROUP BY jenis, category_id, kategori`, [bid(), ym(y, m), ...EXPENSE_JENIS])
    .map(r => ({ jenis: r.jenis, nama: r.kategori || '(tanpa kategori)', value: r.s || 0 }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);
}
