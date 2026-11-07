import { db } from './db';
export const JENIS = ['Pendapatan','Biaya','Tagihan','Pinjaman','Investasi/Tabungan'];
export const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export const rp = n => (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const pct = v => (v == null ? '-' : Math.round(v * 100) + '%');
export const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const GREEN = '#2e9e5b', ORANGE = '#f0932b', RED = '#d63031';

export function colorFor(jenis, budget, real) {
  const p = budget > 0 ? real / budget : (real > 0 ? 9 : 0);
  if (jenis === 'Biaya' || jenis === 'Tagihan') return p < 0.8 ? GREEN : p <= 1 ? ORANGE : RED;
  if (budget > 0) return p === 0 ? RED : p < 1 ? ORANGE : GREEN;
  return real > 0 ? GREEN : RED;
}

export function monthData(y, m) {
  const cats = db.getAllSync('SELECT * FROM categories ORDER BY urut,id');
  const sums = db.getAllSync('SELECT jenis,kategori,SUM(nominal) s FROM transactions WHERE substr(tanggal,1,7)=? GROUP BY jenis,kategori', [ym(y, m)]);
  const d = {};
  JENIS.forEach(j => {
    const rows = cats.filter(c => c.jenis === j).map(c => {
      const real = (sums.find(s => s.jenis === j && s.kategori === c.nama) || {}).s || 0;
      return { nama: c.nama, budget: c.anggaran, real, p: c.anggaran > 0 ? real / c.anggaran : null };
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
    const s = db.getAllSync('SELECT jenis,SUM(nominal) s FROM transactions WHERE substr(tanggal,1,7)=? GROUP BY jenis', [ym(y, m)]);
    const g = j => (s.find(x => x.jenis === j) || {}).s || 0;
    const n = db.getFirstSync('SELECT COUNT(*) c FROM transactions WHERE substr(tanggal,1,7)=?', [ym(y, m)]).c;
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
  return cats.some(c => c.jenis === t.jenis && c.nama === t.kategori) ? '✔ OK' : '⚠ Kategori tidak ada di List';
}
