import { freshDb, cat, tx, rows, count } from './helpers/db';
import { db, addBook, txByPrefix, deleteCategory, deleteBook } from '../lib/db';
import { filterTx } from '../lib/calc';
import { saveRecurring, postOccurrence, deleteTransaction, restoreTransaction } from '../lib/recurring';

beforeEach(() => freshDb());

describe('filterTx (cari & filter transaksi)', () => {
  const L = [
    { id: 1, jenis: 'Biaya', kategori: 'Makanan', nominal: 250000, ket: 'Warung Padang' },
    { id: 2, jenis: 'Biaya', kategori: 'Transportasi', nominal: 25000, ket: '' },
    { id: 3, jenis: 'Pendapatan', kategori: 'Gaji', nominal: 5000000, ket: 'Gaji November' },
    { id: 4, jenis: 'Tagihan', kategori: 'Internet', nominal: 350000, ket: null },
  ];
  const ids = o => filterTx(L, o).map(t => t.id);
  test('tanpa syarat = semua; jenis dan kategori menyaring', () => {
    expect(ids()).toEqual([1, 2, 3, 4]); expect(ids({ jenis: 'Biaya' })).toEqual([1, 2]);
    expect(ids({ jenis: 'Biaya', kategori: 'Makanan' })).toEqual([1]); expect(ids({ kategori: 'Gaji' })).toEqual([3]);
  });
  test('kata kunci: kategori atau keterangan, tanpa beda huruf besar/kecil, spasi pinggir diabaikan', () => {
    expect(ids({ q: ' padang ' })).toEqual([1]); expect(ids({ q: 'GAJI' })).toEqual([3]); expect(ids({ q: 'trans' })).toEqual([2]); expect(ids({ q: 'zzz' })).toEqual([]);
  });
  test('angka >= 3 digit mencocokkan nominal (titik/koma pemisah diabaikan); 1-2 digit tidak', () => {
    expect(ids({ q: '250000' })).toEqual([1]); expect(ids({ q: '250.000' })).toEqual([1]); expect(ids({ q: '5000000' })).toEqual([3]);
    expect(ids({ q: '25' })).toEqual([]); expect(ids({ q: '350' })).toEqual([4]);
  });
  test('syarat digabung (AND)', () => { expect(ids({ jenis: 'Biaya', q: '25000' })).toEqual([1, 2]); expect(ids({ jenis: 'Pendapatan', q: '25000' })).toEqual([]); });
});

describe('txByPrefix', () => {
  beforeEach(() => {
    cat('Biaya', 'Makanan', 0);
    tx('2025-12-31', 'Biaya', 'Makanan', 1); tx('2026-01-05', 'Biaya', 'Makanan', 2); tx('2026-11-01', 'Biaya', 'Makanan', 3); tx('2026-11-20', 'Biaya', 'Makanan', 4);
  });
  test('bulan, tahun, semua; terbaru dulu', () => {
    expect(txByPrefix('2026-11').map(t => t.nominal)).toEqual([4, 3]);
    expect(txByPrefix('2026').map(t => t.nominal)).toEqual([4, 3, 2]);
    expect(txByPrefix('').map(t => t.nominal)).toEqual([4, 3, 2, 1]);
  });
  test('batas baris', () => { expect(txByPrefix('', 2).map(t => t.nominal)).toEqual([4, 3]); });
  test('hanya buku kas aktif', () => {
    const b = addBook('B2', 'pribadi'); cat('Biaya', 'X', 0, b); tx('2026-11-02', 'Biaya', 'X', 99, '', b);
    expect(txByPrefix('2026-11').map(t => t.nominal)).toEqual([4, 3]);
  });
});

describe('Urungkan hapus transaksi', () => {
  test('transaksi biasa: kembali persis sama (id, tanggal, nominal, keterangan, kategori)', () => {
    const c = cat('Biaya', 'Makanan', 0); const id = tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'Nasi');
    const before = rows('SELECT * FROM transactions WHERE id=?', [id])[0];
    const snap = deleteTransaction(id); expect(count('transactions')).toBe(0);
    expect(restoreTransaction(snap)).toBe(true);
    const { upd, ...after } = rows('SELECT * FROM transactions WHERE id=?', [id])[0];
    const { upd: upd0, ...want } = before;
    expect(after).toEqual(want); expect(before.category_id).toBe(c);
    expect(upd).toBeGreaterThan(upd0); // dikembalikan = perubahan terbaru (menang atas catatan hapus yang mungkin sudah tersinkron)
    expect(count('deleted', "tbl='transactions' AND uid=?", [after.uid])).toBe(0); // catatan hapusnya ikut hilang
  });
  test('hasil transaksi berulang: bulannya kembali dari skip ke done dan tidak dibuat ulang', () => {
    const c = cat('Tagihan', 'Uang Kos', 1000000);
    const rid = saveRecurring({ catId: c, nominal: 670000, hari: 5, mulai: '2026-11', otomatis: true, ingat: 3 });
    const r = rows('SELECT * FROM recurring WHERE id=?', [rid])[0]; const id = postOccurrence(r, '2026-11');
    const snap = deleteTransaction(id);
    expect(rows('SELECT status, tx_id FROM recurring_log')[0]).toEqual({ status: 'skip', tx_id: null });
    expect(restoreTransaction(snap)).toBe(true);
    expect(rows('SELECT status, tx_id FROM recurring_log')[0]).toEqual({ status: 'done', tx_id: id });
    expect(rows('SELECT recurring_id FROM transactions WHERE id=?', [id])[0].recurring_id).toBe(rid);
  });
  test('id sudah dipakai transaksi lain -> false, data tidak berubah', () => {
    cat('Biaya', 'Makanan', 0); const id = tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'a'); const snap = deleteTransaction(id);
    db.runSync("INSERT INTO transactions(id,tanggal,jenis,kategori,nominal,ket,book_id) VALUES(?,?,?,?,?,?,1)", [id, '2026-11-09', 'Biaya', 'Makanan', 1, 'baru']);
    expect(restoreTransaction(snap)).toBe(false); expect(count('transactions')).toBe(1); expect(rows('SELECT ket FROM transactions')[0].ket).toBe('baru');
  });
  test('kategori sudah dihapus -> tetap kembali sebagai transaksi tanpa kategori (nama disimpan)', () => {
    const c = cat('Biaya', 'Makanan', 0); const id = tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'a'); const snap = deleteTransaction(id);
    deleteCategory(c, false);
    expect(restoreTransaction(snap)).toBe(true);
    expect(rows('SELECT category_id, kategori FROM transactions WHERE id=?', [id])[0]).toEqual({ category_id: null, kategori: 'Makanan' });
  });
  test('buku kas sudah dihapus -> false', () => {
    const b = addBook('B2', 'pribadi'); cat('Biaya', 'X', 0, b); const id = tx('2026-11-02', 'Biaya', 'X', 5, '', b);
    const snap = deleteTransaction(id); deleteBook(b);
    expect(restoreTransaction(snap)).toBe(false); expect(count('transactions')).toBe(0);
  });
  test('id tidak ada -> deleteTransaction null; restore(null) false', () => { expect(deleteTransaction(999)).toBeNull(); expect(restoreTransaction(null)).toBe(false); });
});
describe('rentang tanggal terindeks (dateRange / DATE_IN)', () => {
  const { DATE_IN, dateRange } = require('../lib/db');
  const ids = p => db.getAllSync(`SELECT id FROM transactions WHERE book_id=1 AND ${DATE_IN} ORDER BY id`, dateRange(p)).map(r => r.id);
  const old = p => db.getAllSync('SELECT id FROM transactions WHERE book_id=1 AND tanggal LIKE ? ORDER BY id', [`${p}%`]).map(r => r.id);
  beforeEach(() => {
    cat('Biaya', 'Makanan');
    ['2025-12-31', '2026-01-01', '2026-01-31', '2026-02-01', '2026-10-05', '2026-11-30', '2026-12-31', '2027-01-01'].forEach((d, i) => tx(d, 'Biaya', 'Makanan', i + 1));
  });
  test.each(['2026-01', '2026-02', '2026-10', '2026-12', '2026', '2025', '2027', '2026-03', ''])('awalan "%s" = hasil sama dengan cara lama (LIKE)', p => {
    expect(ids(p)).toEqual(old(p));
  });
  test('batas bulan & tahun tepat (tanggal pertama dan terakhir ikut, bulan sebelah tidak)', () => {
    expect(ids('2026-01').length).toBe(2); expect(ids('2026').length).toBe(6); expect(ids('').length).toBe(8);
  });
  test('SQLite memakai indeks ix_tx_book untuk rentang tanggal (bukan membaca seluruh tabel)', () => {
    const plan = db.getAllSync(`EXPLAIN QUERY PLAN SELECT * FROM transactions WHERE book_id=? AND ${DATE_IN}`, [1, ...dateRange('2026-01')]).map(r => r.detail).join(' | ');
    expect(plan).toMatch(/ix_tx_book \(book_id=\? AND tanggal>\? AND tanggal<\?\)/);
  });
});

describe('groupByDay (bagian SectionList di halaman Transaksi)', () => {
  const { groupByDay } = require('../lib/calc');
  test('dikelompokkan per tanggal berurutan; total keluar per hari tanpa pendapatan', () => {
    const g = groupByDay([
      { id: 3, tanggal: '2026-11-02', jenis: 'Biaya', nominal: 10000 }, { id: 2, tanggal: '2026-11-02', jenis: 'Pendapatan', nominal: 500000 },
      { id: 1, tanggal: '2026-11-01', jenis: 'Investasi/Tabungan', nominal: 25000 },
    ]);
    expect(g.map(x => [x.tanggal, x.out, x.data.map(t => t.id)])).toEqual([['2026-11-02', 10000, [3, 2]], ['2026-11-01', 25000, [1]]]);
    expect(groupByDay([])).toEqual([]);
  });
});
