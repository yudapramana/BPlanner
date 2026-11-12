import * as sqlite from './helpers/expo-sqlite';
import { freshDb, raw, userVersion, rows, count, cat, tx } from './helpers/db';
import { db, migrate, initDb, SCHEMA_VERSION, meta, setMeta, bid, setActiveBook, getBooks } from '../lib/db';
import { SEED_CATS, SEED_TX } from '../lib/seed';

// Skema persis seperti aplikasi lama (v1.7.0 atau lebih tua): PRAGMA user_version masih 0, belum ada book_id / category_id / recurring.
function legacyDb() {
  sqlite.__resetDb();
  raw().exec(`
    CREATE TABLE categories(id INTEGER PRIMARY KEY AUTOINCREMENT, jenis TEXT NOT NULL, nama TEXT NOT NULL, anggaran INTEGER NOT NULL DEFAULT 0, urut INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE transactions(id INTEGER PRIMARY KEY AUTOINCREMENT, tanggal TEXT, jenis TEXT, kategori TEXT, nominal INTEGER, ket TEXT);
    CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
    INSERT INTO categories(jenis,nama,anggaran,urut) VALUES ('Biaya','Makanan',100000,0), ('Biaya',' makanan ',50000,1), ('Tagihan','Listrik',200000,0), ('Tagihan','LISTRIK',1,1), ('Pendapatan','Gaji',5000000,0);
    INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket) VALUES
      ('2026-11-02','Biaya','makanan',10000,'a'), ('2026-11-03','Biaya','Makanan ',20000,'b'), ('2026-11-04','Biaya','Hilang',5000,'c'),
      ('2026-11-05','Tagihan','Listrik',150000,'d'), ('2026-11-01','Pendapatan','Gaji',5000000,'e');
    INSERT INTO meta(k,v) VALUES ('seeded','1');`);
}
const tables = () => rows("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);

describe('migrasi skema', () => {
  test('DB kosong -> versi terbaru, semua tabel ada, satu buku kas default', () => {
    sqlite.__resetDb();
    migrate();
    expect(userVersion()).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
    expect(tables()).toEqual(expect.arrayContaining(['categories', 'transactions', 'books', 'meta', 'recurring', 'recurring_log']));
    expect(getBooks()).toHaveLength(1);
    expect(getBooks()[0]).toMatchObject({ id: 1, nama: 'Buku Kas Utama', tipe: 'pribadi' });
  });

  test('menjalankan migrate() berulang kali aman (idempotent) dan tidak menambah data', () => {
    freshDb(); cat('Biaya', 'Makanan', 1000); tx('2026-11-01', 'Biaya', 'Makanan', 500);
    migrate(); migrate();
    expect(userVersion()).toBe(SCHEMA_VERSION);
    expect(count('categories')).toBe(1); expect(count('transactions')).toBe(1); expect(count('books')).toBe(1);
  });

  describe('dari database lama (v1.7.0 atau lebih tua, user_version 0)', () => {
    beforeEach(() => { legacyDb(); migrate(); });

    test('naik ke versi terbaru tanpa kehilangan satu baris pun', () => {
      expect(userVersion()).toBe(SCHEMA_VERSION);
      expect(count('transactions')).toBe(5);
      expect(rows('SELECT SUM(nominal) s FROM transactions')[0].s).toBe(10000 + 20000 + 5000 + 150000 + 5000000);
    });
    test('data lama masuk ke buku kas 1', () => {
      expect(rows('SELECT DISTINCT book_id FROM transactions').map(r => r.book_id)).toEqual([1]);
      expect(rows('SELECT DISTINCT book_id FROM categories').map(r => r.book_id)).toEqual([1]);
      expect(getBooks().map(b => b.id)).toEqual([1]);
    });
    test('kategori kembar (beda huruf besar/kecil/spasi) digabung, anggaran dijumlahkan', () => {
      const c = rows('SELECT jenis,nama,anggaran FROM categories ORDER BY jenis,nama');
      expect(c).toEqual([
        { jenis: 'Biaya', nama: 'Makanan', anggaran: 150000 },
        { jenis: 'Pendapatan', nama: 'Gaji', anggaran: 5000000 },
        { jenis: 'Tagihan', nama: 'Listrik', anggaran: 200001 },
      ]);
    });
    test('category_id terisi dari nama (tanpa beda huruf besar/kecil & spasi); yang tidak cocok tetap NULL', () => {
      const m = rows("SELECT id FROM categories WHERE nama='Makanan'")[0].id;
      const t = rows('SELECT ket,category_id,kategori FROM transactions ORDER BY id');
      expect(t.map(x => x.category_id)).toEqual([m, m, null, rows("SELECT id FROM categories WHERE nama='Listrik'")[0].id, rows("SELECT id FROM categories WHERE nama='Gaji'")[0].id]);
      expect(t[1].kategori).toBe('Makanan'); // spasi di ujung dirapikan
      expect(t[2]).toMatchObject({ category_id: null, kategori: 'Hilang' }); // yatim tetap utuh
    });
    test('nama kategori unik per (buku, kelompok) tanpa membedakan huruf besar/kecil', () => {
      expect(() => db.runSync("INSERT INTO categories(jenis,nama,anggaran,urut,book_id) VALUES('Biaya','MAKANAN',0,9,1)")).toThrow();
      expect(() => db.runSync("INSERT INTO categories(jenis,nama,anggaran,urut,book_id) VALUES('Tagihan','Makanan',0,9,1)")).not.toThrow(); // beda kelompok boleh
    });
    test('tabel transaksi berulang tersedia dan kosong', () => { expect(count('recurring')).toBe(0); expect(count('recurring_log')).toBe(0); });
  });

  test('dari v2 (sudah punya book_id & category_id) ke v3 tanpa mengubah data', () => {
    freshDb(); cat('Biaya', 'Makanan', 1000); tx('2026-11-01', 'Biaya', 'Makanan', 500);
    raw().exec('DROP TABLE recurring; DROP TABLE recurring_log; PRAGMA user_version = 2;');
    expect(userVersion()).toBe(2);
    migrate();
    expect(userVersion()).toBe(3);
    expect(tables()).toEqual(expect.arrayContaining(['recurring', 'recurring_log']));
    expect(count('transactions')).toBe(1); expect(count('categories')).toBe(1);
  });

  test('migrasi yang gagal dibatalkan total: user_version tidak naik dan perubahan setengah jalan dikembalikan', () => {
    // transactions tanpa kolom "kategori" membuat migrasi v2 gagal di pernyataan kedua, setelah pernyataan pertama (trim nama kategori) berjalan
    sqlite.__resetDb();
    raw().exec(`
      CREATE TABLE categories(id INTEGER PRIMARY KEY AUTOINCREMENT, jenis TEXT NOT NULL, nama TEXT NOT NULL, anggaran INTEGER NOT NULL DEFAULT 0, urut INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE transactions(id INTEGER PRIMARY KEY AUTOINCREMENT, tanggal TEXT, jenis TEXT, nominal INTEGER, ket TEXT);
      INSERT INTO categories(jenis,nama,anggaran) VALUES ('Biaya','Makanan ',1000);
      INSERT INTO transactions(tanggal,jenis,nominal,ket) VALUES ('2026-11-01','Biaya',500,'x');`);
    expect(() => migrate()).toThrow();
    expect(userVersion()).toBe(1); // v1 sudah selesai & tersimpan, v2 dibatalkan
    expect(rows('SELECT nama FROM categories')[0].nama).toBe('Makanan '); // trim milik v2 ikut dibatalkan
    expect(count('transactions')).toBe(1);
    expect(() => db.getFirstSync('SELECT category_id FROM transactions')).toThrow(); // kolom v2 tidak setengah jadi
  });

  test('DB buatan aplikasi yang lebih baru (user_version > SCHEMA_VERSION) tidak diubah dan tidak error', () => {
    freshDb(); cat('Biaya', 'Makanan', 1000);
    raw().exec('PRAGMA user_version = 99');
    expect(() => migrate()).not.toThrow();
    expect(userVersion()).toBe(99);
    expect(count('categories')).toBe(1);
  });
});

describe('initDb', () => {
  test('pemasangan pertama: aplikasi KOSONG (satu buku kas, tanpa kategori & transaksi)', () => {
    sqlite.__resetDb();
    initDb();
    expect(meta('seeded')).toBe('1');
    expect(count('categories')).toBe(0);
    expect(count('transactions')).toBe(0);
    expect(count('recurring')).toBe(0);
    expect(count('books')).toBe(1);
    expect(getBooks()[0].nama).toBe('Buku Kas Utama');
    expect(bid()).toBe(1);
  });
  test('data contoh Excel tidak pernah diisi otomatis (SEED_* hanya untuk Template Import dan seedAll manual)', () => {
    sqlite.__resetDb(); initDb(); initDb();
    expect(count('transactions')).toBe(0);
    expect(SEED_TX.length).toBeGreaterThan(0); expect(Object.keys(SEED_CATS).length).toBe(5); // konstanta tetap ada untuk keperluan lain
  });
  test('dijalankan lagi tidak mengisi ulang, juga bila pengguna sudah mengosongkan semua kategori', () => {
    sqlite.__resetDb(); initDb();
    db.runSync('DELETE FROM transactions'); db.runSync('DELETE FROM categories');
    initDb();
    expect(count('categories')).toBe(0); expect(count('transactions')).toBe(0);
  });
  test('pengguna lama yang naik versi (ada kategori, belum ada tanda seeded): data tidak ditimpa', () => {
    legacyDb(); raw().exec("DELETE FROM meta WHERE k='seeded'");
    initDb();
    expect(count('transactions')).toBe(5);
    expect(meta('seeded')).toBe('1');
  });
  test('buku aktif tersimpan dipakai kembali; bila bukunya sudah tidak ada, jatuh ke buku pertama', () => {
    sqlite.__resetDb(); initDb();
    db.runSync("INSERT INTO books(nama,tipe,urut) VALUES('B2','pribadi',1)");
    setActiveBook(2); initDb(); expect(bid()).toBe(2);
    setMeta('active', 77); initDb(); expect(bid()).toBe(1);
  });
});
