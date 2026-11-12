import { freshDb, cat, tx, rows, count } from './helpers/db';
import {
  db, inTx, addCategory, addCategories, renameCategory, deleteCategory, categoryUsage, categoryRecurring, findCategory,
  addBook, updateBook, deleteBook, getBooks, getBook, setActiveBook, bid, bookSaldo, seedAll, seedStarter, wipeBook, meta, setMeta,
} from '../lib/db';
import { SEED_CATS } from '../lib/seed';
import { starterNames } from '../lib/master';
import { saveRecurring } from '../lib/recurring';

beforeEach(() => freshDb());

describe('inTx (transaksi bersarang & rollback)', () => {
  test('panggilan bersarang ikut transaksi luar (tidak error "cannot start a transaction within a transaction")', () => {
    expect(() => inTx(() => { addCategory('Biaya', 'A'); inTx(() => addCategory('Biaya', 'B')); })).not.toThrow();
    expect(count('categories')).toBe(2);
  });
  test('error di dalam membatalkan semuanya, termasuk bagian bersarang', () => {
    expect(() => inTx(() => { addCategory('Biaya', 'A'); inTx(() => { addCategory('Biaya', 'B'); throw new Error('gagal'); }); })).toThrow('gagal');
    expect(count('categories')).toBe(0);
  });
  test('setelah error, transaksi berikutnya tetap bisa dimulai', () => {
    expect(() => inTx(() => { throw new Error('x'); })).toThrow();
    expect(() => inTx(() => addCategory('Biaya', 'A'))).not.toThrow();
    expect(count('categories')).toBe(1);
  });
});

describe('kategori', () => {
  test('addCategory: rapikan spasi, tolak kosong dan nama kembar (tanpa beda huruf besar/kecil) di kelompok yang sama', () => {
    expect(addCategory('Biaya', '  Makanan  ', 5000)).toEqual(expect.any(Number));
    expect(findCategory('Biaya', 'makanan')).toMatchObject({ nama: 'Makanan', anggaran: 5000 });
    expect(addCategory('Biaya', 'MAKANAN')).toBeNull();
    expect(addCategory('Biaya', '   ')).toBeNull();
    expect(addCategory('Tagihan', 'Makanan')).toEqual(expect.any(Number)); // kelompok lain boleh
  });
  test('urutan bertambah per kelompok', () => {
    addCategory('Biaya', 'A'); addCategory('Biaya', 'B'); addCategory('Tagihan', 'C');
    expect(rows('SELECT nama,urut FROM categories ORDER BY jenis,urut').map(r => [r.nama, r.urut])).toEqual([['A', 0], ['B', 1], ['C', 0]]);
  });
  test('addCategories: nama yang sudah ada dilewati, mengembalikan jumlah yang benar-benar ditambah', () => {
    addCategory('Biaya', 'A');
    expect(addCategories('Biaya', ['a', 'B', 'C', ' B '])).toBe(2);
    expect(count('categories')).toBe(3);
  });

  describe('renameCategory', () => {
    test('kode hasil: ok / sama / kosong / kembar', () => {
      const a = addCategory('Biaya', 'A'), b = addCategory('Biaya', 'B');
      expect(renameCategory(a, 'A')).toBe('sama');
      expect(renameCategory(a, '  ')).toBe('kosong');
      expect(renameCategory(999, 'Z')).toBe('kosong');
      expect(renameCategory(a, 'b')).toBe('kembar');
      expect(renameCategory(a, 'A2')).toBe('ok');
      expect(findCategory('Biaya', 'A2').id).toBe(a); expect(b).not.toBe(a);
    });
    test('salinan nama di transaksi dan transaksi berulang ikut diperbarui', () => {
      const a = addCategory('Tagihan', 'Internet', 100000);
      tx('2026-11-01', 'Tagihan', 'Internet', 100000);
      const r = saveRecurring({ catId: a, nominal: 100000, hari: 1, mulai: '2026-11', ingat: 3, otomatis: true });
      renameCategory(a, 'Wifi');
      expect(rows('SELECT kategori FROM transactions')[0].kategori).toBe('Wifi');
      expect(rows('SELECT kategori FROM recurring WHERE id=?', [r])[0].kategori).toBe('Wifi');
    });
    test('ganti nama dengan huruf besar/kecil saja diizinkan (bukan "kembar" dengan dirinya sendiri)', () => {
      const a = addCategory('Biaya', 'makanan');
      expect(renameCategory(a, 'Makanan')).toBe('ok');
      expect(rows('SELECT nama FROM categories')[0].nama).toBe('Makanan');
    });
  });

  describe('deleteCategory', () => {
    let id;
    beforeEach(() => {
      id = addCategory('Tagihan', 'Internet', 100000);
      tx('2026-10-01', 'Tagihan', 'Internet', 100000); tx('2026-11-01', 'Tagihan', 'Internet', 120000);
      const r = saveRecurring({ catId: id, nominal: 100000, hari: 1, mulai: '2026-10', ingat: 3, otomatis: true });
      db.runSync("INSERT INTO recurring_log(recurring_id,periode,status) VALUES(?, '2026-10','done')", [r]);
    });
    test('categoryUsage & categoryRecurring menghitung dengan benar', () => {
      expect(categoryUsage(id)).toEqual({ n: 2, total: 220000 });
      expect(categoryRecurring(id)).toBe(1);
    });
    test('transaksi dipertahankan sebagai yatim (category_id NULL); templat berulang & lognya ikut dihapus', () => {
      deleteCategory(id, false);
      expect(count('categories')).toBe(0);
      expect(count('transactions')).toBe(2); expect(count('transactions', 'category_id IS NULL')).toBe(2);
      expect(count('recurring')).toBe(0); expect(count('recurring_log')).toBe(0);
    });
    test('withTx=true: transaksinya ikut dihapus', () => {
      deleteCategory(id, true);
      expect(count('transactions')).toBe(0); expect(count('categories')).toBe(0);
    });
    test('tidak menyentuh kategori / transaksi lain', () => {
      const other = addCategory('Biaya', 'Makanan'); tx('2026-11-02', 'Biaya', 'Makanan', 1);
      deleteCategory(id, true);
      expect(count('categories')).toBe(1); expect(count('transactions', 'category_id=?', [other])).toBe(1);
    });
  });
});

describe('buku kas', () => {
  test('addBook kosong / salin kategori & anggaran (tanpa transaksi) / Paket Master', () => {
    cat('Biaya', 'Makanan', 777); tx('2026-11-01', 'Biaya', 'Makanan', 5);
    const kosong = addBook('Kosong', 'pribadi');
    const salin = addBook('Salinan', 'keluarga', 'copy', 1);
    const master = addBook('Master', 'proyek', 'master');
    expect(count('categories', 'book_id=?', [kosong])).toBe(0);
    expect(rows('SELECT nama,anggaran FROM categories WHERE book_id=?', [salin])).toEqual([{ nama: 'Makanan', anggaran: 777 }]);
    expect(count('transactions', 'book_id=?', [salin])).toBe(0);
    const expected = Object.keys(SEED_CATS).reduce((a, j) => a + starterNames(j).length, 0);
    expect(count('categories', 'book_id=?', [master])).toBe(expected);
    expect(rows('SELECT DISTINCT anggaran FROM categories WHERE book_id=?', [master])).toEqual([{ anggaran: 0 }]);
  });
  test('urutan buku bertambah dan getBooks menghitung transaksi', () => {
    cat('Biaya', 'M'); tx('2026-11-01', 'Biaya', 'M', 1); tx('2026-11-02', 'Biaya', 'M', 1);
    const b = addBook('B2', 'acara');
    expect(getBooks().map(x => [x.id, x.urut, x.n])).toEqual([[1, 0, 2], [b, 1, 0]]);
  });
  test('updateBook & setActiveBook/getBook', () => {
    const b = addBook('B2', 'acara'); updateBook(b, 'Liburan', 'lainnya');
    expect(getBook(b)).toMatchObject({ nama: 'Liburan', tipe: 'lainnya' });
    setActiveBook(b); expect(bid()).toBe(b); expect(meta('active')).toBe(String(b));
    expect(getBook(12345).id).toBe(1); // id tidak ada -> buku pertama
  });
  test('deleteBook menghapus seluruh isinya (transaksi, kategori, berulang) dan memindahkan buku aktif', () => {
    const b = addBook('B2', 'pribadi'); const c = cat('Tagihan', 'Net', 1, b); tx('2026-11-01', 'Tagihan', 'Net', 1, '', b);
    saveRecurring({ catId: c, nominal: 1, hari: 1, mulai: '2026-11', ingat: 3, otomatis: true }, null, b);
    cat('Biaya', 'Tetap'); tx('2026-11-01', 'Biaya', 'Tetap', 9);
    setActiveBook(b);
    deleteBook(b);
    expect(count('books')).toBe(1); expect(count('categories')).toBe(1); expect(count('transactions')).toBe(1); expect(count('recurring')).toBe(0);
    expect(bid()).toBe(1);
  });
  test('wipeBook hanya mengosongkan satu buku', () => {
    const b = addBook('B2', 'pribadi'); cat('Biaya', 'A', 1, b); tx('2026-11-01', 'Biaya', 'A', 1, '', b); cat('Biaya', 'A'); tx('2026-11-01', 'Biaya', 'A', 1);
    wipeBook(b);
    expect(count('transactions', 'book_id=?', [b])).toBe(0); expect(count('transactions', 'book_id=1')).toBe(1); expect(count('categories', 'book_id=1')).toBe(1);
  });
  test('bookSaldo = pendapatan - semua keluaran pada bulan itu', () => {
    cat('Pendapatan', 'Gaji'); cat('Biaya', 'M'); cat('Investasi/Tabungan', 'Emas');
    tx('2026-11-01', 'Pendapatan', 'Gaji', 1000); tx('2026-11-02', 'Biaya', 'M', 300); tx('2026-11-03', 'Investasi/Tabungan', 'Emas', 200); tx('2026-10-03', 'Biaya', 'M', 999);
    expect(bookSaldo(1, '2026-11')).toBe(500);
    expect(bookSaldo(1, '2026-12')).toBe(0);
  });
  test('seedAll mengisi ulang satu buku saja dan menghubungkan category_id', () => {
    const b = addBook('B2', 'pribadi'); cat('Biaya', 'Punya Buku Lain', 1, b);
    seedAll(1);
    expect(count('categories', 'book_id=?', [b])).toBe(1);
    expect(count('categories', 'book_id=1')).toBeGreaterThan(20);
    expect(count('transactions', 'book_id=1 AND category_id IS NOT NULL')).toBeGreaterThan(15);
  });
});

describe('meta', () => {
  test('setMeta menyimpan sebagai teks dan menimpa; meta kunci tak ada -> null', () => {
    setMeta('x', 5); expect(meta('x')).toBe('5'); setMeta('x', 'b'); expect(meta('x')).toBe('b'); expect(meta('tidak-ada')).toBeNull();
  });
});
