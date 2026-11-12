import { freshDb, cat, tx, rows } from './helpers/db';
import {
  rp, rpk, pct, ym, statusOf, colorFor, monthData, yearData, highlights, cek, expenseYear, expenseByCategory,
  WARN_AT, GREEN, ORANGE, RED, GRAY, MASK,
} from '../lib/calc';
import { addBook, db, renameCategory } from '../lib/db';

describe('format rupiah', () => {
  test.each([
    [0, 'Rp 0'], [null, 'Rp 0'], [undefined, 'Rp 0'], [NaN, 'Rp 0'], [999, 'Rp 999'], [1000, 'Rp 1.000'], [1500000, 'Rp 1.500.000'],
    [1234567890, 'Rp 1.234.567.890'], [1234.6, 'Rp 1.235'], [-2500, '-Rp 2.500'],
  ])('rp(%p) = %p', (n, out) => expect(rp(n)).toBe(out));
  test('nilai negatif yang dibulatkan ke 0 tidak tampil sebagai "-Rp 0"', () => { expect(rp(-0.4)).toBe('Rp 0'); expect(rpk(-0.4)).toBe('Rp 0'); });

  test.each([
    [0, 'Rp 0'], [500, 'Rp 500'], [1500, 'Rp 2 rb'], [250000, 'Rp 250 rb'], [1500000, 'Rp 1,5 jt'], [2000000, 'Rp 2 jt'],
    [3200000000, 'Rp 3,2 M'], [-1500000, '-Rp 1,5 jt'], [1000000000, 'Rp 1 M'],
  ])('rpk(%p) = %p', (n, out) => expect(rpk(n)).toBe(out));
  test.each([[999500, 'Rp 1 jt'], [999999, 'Rp 1 jt'], [999499, 'Rp 999 rb'], [999950000, 'Rp 1 M'], [999999999, 'Rp 1 M'], [-999999, '-Rp 1 jt']])(
    'rpk membulat lintas satuan dengan benar: rpk(%p) = %p', (n, out) => expect(rpk(n)).toBe(out));

  test('pct, ym, MASK', () => {
    expect(pct(0.456)).toBe('46%'); expect(pct(1)).toBe('100%'); expect(pct(null)).toBe('-'); expect(pct(undefined)).toBe('-');
    expect(ym(2026, 3)).toBe('2026-03'); expect(ym(2026, 12)).toBe('2026-12');
    expect(MASK).toBe('Rp ******');
  });
});

describe('statusOf (status per kategori)', () => {
  const st = (jenis, budget, real) => statusOf(jenis, { budget, real });
  test('Biaya/Tagihan: aman < 80%, peringatan 80–100%, melebihi > 100%', () => {
    expect(st('Biaya', 1000, 799)).toMatchObject({ level: 'ok', color: GREEN, label: 'Sisa Rp 201' });
    expect(st('Biaya', 1000, 800)).toMatchObject({ level: 'warn', color: ORANGE });
    expect(st('Tagihan', 1000, 1000)).toMatchObject({ level: 'warn', label: 'Sisa Rp 0' }); // tepat 100% belum "lebih"
    expect(st('Tagihan', 1000, 1001)).toMatchObject({ level: 'over', color: RED, label: 'Lebih Rp 1' });
  });
  test('ambang peringatan = WARN_AT (0,8)', () => expect(WARN_AT).toBe(0.8));
  test('Biaya/Tagihan tanpa anggaran: kosong bila belum ada pengeluaran, "Belum dianggarkan" bila sudah ada', () => {
    expect(st('Biaya', 0, 0)).toMatchObject({ level: 'empty', label: '' });
    expect(st('Tagihan', 0, 5000)).toMatchObject({ level: 'nobudget', color: GRAY, label: 'Belum dianggarkan' });
  });
  test('Pendapatan / Investasi: target tercapai, kurang, atau belum diterima/disetor', () => {
    expect(st('Pendapatan', 1000, 1000)).toMatchObject({ level: 'ok', label: 'Tercapai' });
    expect(st('Pendapatan', 1000, 1500)).toMatchObject({ level: 'ok', label: 'Tercapai' });
    expect(st('Pendapatan', 1000, 400)).toMatchObject({ level: 'low', color: ORANGE, label: 'Kurang Rp 600' });
    expect(st('Pendapatan', 1000, 0)).toMatchObject({ level: 'low', color: RED, label: 'Belum diterima' });
    expect(st('Investasi/Tabungan', 1000, 0)).toMatchObject({ label: 'Belum disetor' });
    expect(st('Pendapatan', 0, 700)).toMatchObject({ level: 'ok', label: 'Tanpa anggaran' });
  });
  test('Pinjaman: belum dibayar / kurang = level "due"', () => {
    expect(st('Pinjaman', 1000, 0)).toMatchObject({ level: 'due', color: RED, label: 'Belum dibayar' });
    expect(st('Pinjaman', 1000, 300)).toMatchObject({ level: 'due', color: ORANGE, label: 'Kurang Rp 700' });
    expect(st('Pinjaman', 1000, 1000)).toMatchObject({ level: 'ok', label: 'Tercapai' });
  });
  test('formatter bisa diganti (mode sembunyikan angka)', () => {
    expect(statusOf('Biaya', { budget: 1000, real: 100 }, () => MASK).label).toBe('Sisa Rp ******');
  });
  test('colorFor = warna dari statusOf', () => expect(colorFor('Biaya', 1000, 2000)).toBe(RED));
});

describe('monthData (Dashboard)', () => {
  beforeEach(() => {
    freshDb();
    cat('Pendapatan', 'Gaji', 5000000); cat('Pendapatan', 'Bonus', 0);
    cat('Biaya', 'Makanan', 1000000); cat('Biaya', 'Hiburan', 0);
    cat('Tagihan', 'Listrik', 300000);
    cat('Pinjaman', 'Cicilan Rumah', 2000000);
    cat('Investasi/Tabungan', 'Reksadana', 500000);
  });

  test('semua kelompok kosong -> semua angka nol dan tanpa pembagian dengan nol', () => {
    freshDb();
    const d = monthData(2026, 11);
    expect(d.saldo).toBe(0); expect(d.saldoPlan).toBe(0); expect(d.tabungan).toBe(0); expect(d.terpakai).toBe(0); expect(d.surplus).toBe(true);
    expect(Object.keys(d.d)).toEqual(['Pendapatan', 'Biaya', 'Tagihan', 'Pinjaman', 'Investasi/Tabungan']);
  });

  test('anggaran dan realisasi dijumlah per kelompok', () => {
    tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000); tx('2026-11-20', 'Pendapatan', 'Bonus', 1000000);
    tx('2026-11-02', 'Biaya', 'Makanan', 250000); tx('2026-11-03', 'Biaya', 'Makanan', 150000);
    const d = monthData(2026, 11);
    expect(d.d.Pendapatan).toMatchObject({ budget: 5000000, real: 6000000 });
    expect(d.d.Biaya).toMatchObject({ budget: 1000000, real: 400000 });
    const makan = d.d.Biaya.rows.find(r => r.nama === 'Makanan');
    expect(makan).toMatchObject({ budget: 1000000, real: 400000, p: 0.4 });
    expect(d.d.Biaya.rows.find(r => r.nama === 'Hiburan').p).toBeNull(); // tanpa anggaran -> persen null, bukan NaN/Infinity
  });

  test('saldo = pendapatan - (biaya + tagihan + pinjaman + tabungan); saldoPlan memakai anggaran', () => {
    tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000);
    tx('2026-11-02', 'Biaya', 'Makanan', 400000); tx('2026-11-03', 'Tagihan', 'Listrik', 300000);
    tx('2026-11-04', 'Pinjaman', 'Cicilan Rumah', 2000000); tx('2026-11-05', 'Investasi/Tabungan', 'Reksadana', 500000);
    const d = monthData(2026, 11);
    expect(d.saldo).toBe(5000000 - 3200000);
    expect(d.surplus).toBe(true);
    expect(d.saldoPlan).toBe(5000000 - (1000000 + 300000 + 2000000 + 500000));
  });

  test('defisit: saldo negatif dan surplus=false', () => {
    tx('2026-11-01', 'Pendapatan', 'Gaji', 1000000); tx('2026-11-02', 'Pinjaman', 'Cicilan Rumah', 2000000);
    const d = monthData(2026, 11);
    expect(d.saldo).toBe(-1000000); expect(d.surplus).toBe(false);
  });

  test('rasio tabungan = tabungan / pendapatan; "terpakai" TIDAK menghitung tabungan', () => {
    tx('2026-11-01', 'Pendapatan', 'Gaji', 4000000);
    tx('2026-11-02', 'Investasi/Tabungan', 'Reksadana', 1000000);
    tx('2026-11-03', 'Biaya', 'Makanan', 500000);
    const d = monthData(2026, 11);
    expect(d.tabungan).toBeCloseTo(0.25);
    // anggaran pengeluaran = 1.000.000 + 300.000 + 2.000.000 (tanpa tabungan); realisasi = 500.000
    expect(d.terpakai).toBeCloseTo(500000 / 3300000);
  });

  test('hanya bulan yang diminta; transaksi bulan/tahun lain tidak ikut', () => {
    tx('2026-10-31', 'Biaya', 'Makanan', 111); tx('2026-11-01', 'Biaya', 'Makanan', 222); tx('2026-12-01', 'Biaya', 'Makanan', 333); tx('2025-11-15', 'Biaya', 'Makanan', 444);
    expect(monthData(2026, 11).d.Biaya.real).toBe(222);
    expect(monthData(2026, 10).d.Biaya.real).toBe(111);
  });

  test('hanya buku kas aktif; buku lain tidak tercampur', () => {
    tx('2026-11-01', 'Biaya', 'Makanan', 100000);
    const b2 = addBook('Usaha', 'proyek'); cat('Biaya', 'Makanan', 50000, b2); tx('2026-11-01', 'Biaya', 'Makanan', 999, '', b2);
    expect(monthData(2026, 11).d.Biaya.real).toBe(100000);
  });

  test('transaksi dikaitkan lewat category_id, bukan nama: ganti nama kategori tidak memutus hubungan', () => {
    tx('2026-11-02', 'Biaya', 'Makanan', 70000);
    const id = rows("SELECT id FROM categories WHERE nama='Makanan'")[0].id;
    expect(renameCategory(id, 'Makan & Minum')).toBe('ok');
    const r = monthData(2026, 11).d.Biaya.rows.find(x => x.nama === 'Makan & Minum');
    expect(r.real).toBe(70000);
  });

  test('transaksi tanpa kategori (yatim) tidak masuk baris kategori maupun saldo Dashboard', () => {
    tx('2026-11-01', 'Pendapatan', 'Gaji', 1000000);
    db.runSync("INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES('2026-11-02','Biaya','Entah',300000,'',1,NULL)");
    expect(monthData(2026, 11).saldo).toBe(1000000);
  });
});

describe('yearData / highlights / pengeluaran', () => {
  beforeEach(() => {
    freshDb();
    cat('Pendapatan', 'Gaji'); cat('Biaya', 'Makanan'); cat('Tagihan', 'Listrik'); cat('Pinjaman', 'Cicilan'); cat('Investasi/Tabungan', 'Emas');
    tx('2026-01-05', 'Pendapatan', 'Gaji', 5000000); tx('2026-01-06', 'Biaya', 'Makanan', 1000000); tx('2026-01-07', 'Investasi/Tabungan', 'Emas', 500000);
    tx('2026-03-05', 'Pendapatan', 'Gaji', 2000000); tx('2026-03-10', 'Tagihan', 'Listrik', 300000); tx('2026-03-11', 'Pinjaman', 'Cicilan', 2500000);
    tx('2025-12-31', 'Biaya', 'Makanan', 777); // tahun lain
  });

  test('yearData: 12 bulan, total & saldo per bulan, jumlah transaksi', () => {
    const y = yearData(2026);
    expect(y).toHaveLength(12);
    expect(y[0]).toMatchObject({ m: 1, bulan: 'Januari', pend: 5000000, biaya: 1000000, tab: 500000, total: 1500000, saldo: 3500000, n: 3 });
    expect(y[1]).toMatchObject({ n: 0, pend: 0, total: 0, saldo: 0 });
    expect(y[2]).toMatchObject({ tagihan: 300000, pinjaman: 2500000, total: 2800000, saldo: -800000, n: 3 });
  });

  test('highlights: hanya bulan bertransaksi; tertinggi, terendah, bulan plus/minus, rasio tabungan', () => {
    const h = highlights(yearData(2026));
    expect(h.total).toBe(3500000 - 800000);
    expect(h.avg).toBe((3500000 - 800000) / 2); // 2 bulan berisi, bukan 12
    expect(h.hi.m).toBe(1); expect(h.lo.m).toBe(3);
    expect(h.plus).toBe(1); expect(h.minus).toBe(1);
    expect(h.tab).toBe(500000);
    expect(h.rasio).toBeCloseTo(500000 / 7000000);
  });

  test('highlights tanpa data tidak menghasilkan NaN', () => {
    const h = highlights(yearData(2031));
    expect(h).toMatchObject({ total: 0, avg: 0, hi: null, lo: null, plus: 0, minus: 0, tab: 0, rasio: 0 });
  });

  test('expenseYear = Biaya + Tagihan + Pinjaman (tabungan bukan pengeluaran)', () => {
    const e = expenseYear(2026);
    expect(e).toHaveLength(12);
    expect(e[0]).toMatchObject({ biaya: 1000000, tagihan: 0, pinjaman: 0, total: 1000000, short: 'Jan' });
    expect(e[2].total).toBe(2800000);
  });

  test('expenseByCategory: terbesar dulu, tanpa tabungan/pendapatan, tanpa tahun/bulan lain', () => {
    const l = expenseByCategory(2026, 3);
    expect(l.map(x => [x.nama, x.value])).toEqual([['Cicilan', 2500000], ['Listrik', 300000]]);
    expect(expenseByCategory(2026, 1).map(x => x.nama)).toEqual(['Makanan']);
    expect(expenseByCategory(2026, 6)).toEqual([]);
  });
});

describe('cek (validasi baris transaksi)', () => {
  const cats = [{ id: 1 }, { id: 2 }];
  test('lengkap dan kategori ada', () => expect(cek({ tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'A', nominal: 5, category_id: 2 }, cats)).toBe('✔ OK'));
  test('kategori tidak ada di daftar / tanpa category_id', () => {
    expect(cek({ tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'A', nominal: 5, category_id: 9 }, cats)).toMatch(/Kategori tidak ada/);
    expect(cek({ tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'A', nominal: 5, category_id: null }, cats)).toMatch(/Kategori tidak ada/);
  });
  test('data belum lengkap', () => {
    expect(cek({ tanggal: '', jenis: 'Biaya', kategori: 'A', nominal: 5 }, cats)).toMatch(/belum lengkap/);
    expect(cek({ tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'A', nominal: 0 }, cats)).toMatch(/belum lengkap/);
  });
});
