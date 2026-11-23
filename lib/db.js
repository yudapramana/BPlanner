import * as SQLite from 'expo-sqlite';
import { JENIS } from './seed';
import { starterNames } from './master';
export const db = SQLite.openDatabaseSync('budget.db');

// ---- Buku Kas ----
// Setiap kategori/anggaran dan transaksi menempel ke satu buku kas (kolom book_id).
export { TIPE } from './bookTypes'; // jenis buku kas didefinisikan di bookTypes.js
let cur = 1; // id buku kas yang sedang aktif
export const bid = () => cur;

// Rentang tanggal untuk awalan 'YYYY-MM' / 'YYYY' / '' (semua): [awalan, awalan + '~'].
// Dipakai sebagai `tanggal >= ? AND tanggal < ?` (lihat DATE_IN) sehingga SQLite memakai indeks ix_tx_book(book_id, tanggal).
// substr(tanggal,...)=? dan LIKE tidak bisa memakai indeks: seluruh transaksi buku kas dibaca setiap kali.
// '~' (0x7E) lebih besar dari angka & '-', jadi hasilnya sama persis dengan "tanggal diawali awalan".
export const DATE_IN = 'tanggal >= ? AND tanggal < ?';
export const dateRange = (prefix = '') => [prefix, `${prefix}~`];

const hasCol = (t, c) => db.getAllSync(`PRAGMA table_info(${t})`).some(r => r.name === c);
export const meta = k => { const r = db.getFirstSync('SELECT v FROM meta WHERE k=?', [k]); return r ? r.v : null; };
export const setMeta = (k, v) => db.runSync('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)', [k, String(v)]);

// Revisi data: naik setiap isi buku kas / kategori / transaksi / transaksi berulang berubah (lihat migrasi v4). Perubahan meta (mis. buku aktif) tidak menaikkannya.
export const dataRev = () => Number(meta('data.rev')) || 0;

// Transaksi yang aman dipanggil bersarang. expo-sqlite menjalankan BEGIN begitu saja, jadi withTransactionSync di dalam
// withTransactionSync gagal ("cannot start a transaction within a transaction"). Panggilan bersarang cukup ikut transaksi luar.
let txDepth = 0;
export function inTx(fn) {
  if (txDepth > 0) return fn();
  txDepth++;
  try { db.withTransactionSync(fn); } finally { txDepth--; }
}

// ---- Sinkron banyak HP (migrasi v5) ----
export const SYNC_TABLES = ['books', 'categories', 'transactions', 'recurring']; // tabel yang punya uid/upd & catatan hapus
const NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"; // ms sejak 1970 (sama dengan Date.now())
const NEW_UID = 'lower(hex(randomblob(16)))';
export const TOMB_KEEP_DAYS = 400; // catatan hapus lebih tua dari ini dibuang (HP yang tidak sinkron > 400 hari bisa memunculkan lagi data lama)
export const pruneTombstones = (now = Date.now()) => db.runSync('DELETE FROM deleted WHERE at < ?', [now - TOMB_KEEP_DAYS * 86400000]);

// ---- Migrasi skema (PRAGMA user_version) ----
// Daftar migrasi bernomor: MIGRATIONS[0] membawa DB ke versi 1, MIGRATIONS[1] ke versi 2, dst.
// Aturan: JANGAN mengubah migrasi yang sudah dirilis; perubahan skema baru = tambah satu fungsi di akhir daftar.
// Tiap migrasi berjalan dalam satu transaksi bersama kenaikan user_version, jadi gagal = batal total (tidak setengah jalan).
const MIGRATIONS = [
  // v1 — skema dasar + book_id. Idempotent: DB lama (v1.7.0 atau lebih tua) punya user_version 0 tetapi tabelnya sudah ada.
  () => {
    db.execSync(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT, jenis TEXT NOT NULL, nama TEXT NOT NULL, anggaran INTEGER NOT NULL DEFAULT 0, urut INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT, tanggal TEXT, jenis TEXT, kategori TEXT, nominal INTEGER, ket TEXT);
    CREATE TABLE IF NOT EXISTS books(id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, tipe TEXT NOT NULL DEFAULT 'pribadi', urut INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);`);
    // Data dari versi tanpa buku kas otomatis masuk ke buku kas id 1
    if (!hasCol('categories', 'book_id')) db.execSync('ALTER TABLE categories ADD COLUMN book_id INTEGER NOT NULL DEFAULT 1');
    if (!hasCol('transactions', 'book_id')) db.execSync('ALTER TABLE transactions ADD COLUMN book_id INTEGER NOT NULL DEFAULT 1');
    db.execSync('CREATE INDEX IF NOT EXISTS ix_tx_book ON transactions(book_id, tanggal); CREATE INDEX IF NOT EXISTS ix_cat_book ON categories(book_id);');
    if (db.getFirstSync('SELECT COUNT(*) c FROM books').c === 0) db.runSync("INSERT INTO books(id,nama,tipe,urut) VALUES(1,'Buku Kas Utama','pribadi',0)");
  },
  // v2 — transactions.category_id (relasi ke categories.id) + nama kategori unik per (buku, kelompok).
  // transactions.kategori (teks) tetap disimpan sebagai salinan nama: dipakai CSV/backup dan untuk menampilkan transaksi yang kategorinya sudah dihapus.
  () => {
    db.execSync('UPDATE categories SET nama=trim(nama); UPDATE transactions SET kategori=trim(kategori) WHERE kategori IS NOT NULL;');
    // Gabungkan kategori kembar (nama sama tanpa membedakan huruf besar/kecil). Anggaran dijumlahkan agar total rencana tidak berubah.
    const dupes = db.getAllSync('SELECT book_id, jenis, lower(nama) k, MIN(id) keep, SUM(anggaran) tot FROM categories GROUP BY book_id, jenis, lower(nama) HAVING COUNT(*) > 1');
    dupes.forEach(d => {
      db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [d.tot, d.keep]);
      db.runSync('DELETE FROM categories WHERE book_id=? AND jenis=? AND lower(nama)=? AND id<>?', [d.book_id, d.jenis, d.k, d.keep]);
    });
    if (!hasCol('transactions', 'category_id')) db.execSync('ALTER TABLE transactions ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL');
    // Isi category_id dari pasangan (buku, jenis, nama). Transaksi yang namanya tidak cocok dengan kategori apa pun tetap NULL (yatim, sama seperti sebelumnya).
    db.execSync('UPDATE transactions SET category_id=(SELECT c.id FROM categories c WHERE c.book_id=transactions.book_id AND c.jenis=transactions.jenis AND lower(c.nama)=lower(transactions.kategori)) WHERE category_id IS NULL');
    db.execSync('CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_nama ON categories(book_id, jenis, nama COLLATE NOCASE); CREATE INDEX IF NOT EXISTS ix_tx_cat ON transactions(category_id);');
  },
  // v3 — transaksi berulang. recurring = templat (satu baris per tagihan tetap); recurring_log = catatan tiap bulan yang sudah diproses
  // (status 'done' = sudah menjadi transaksi, 'skip' = dilewati / transaksinya dihapus pengguna) agar tidak dibuat dua kali.
  // transactions.recurring_id menandai transaksi hasil templat (untuk lencana 🔁).
  () => {
    db.execSync(`CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL DEFAULT 1, category_id INTEGER, jenis TEXT NOT NULL, kategori TEXT NOT NULL, nominal INTEGER NOT NULL DEFAULT 0, ket TEXT, hari INTEGER NOT NULL DEFAULT 1, mulai TEXT NOT NULL, akhir TEXT, otomatis INTEGER NOT NULL DEFAULT 1, ingat INTEGER NOT NULL DEFAULT 3, aktif INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS recurring_log(recurring_id INTEGER NOT NULL, periode TEXT NOT NULL, status TEXT NOT NULL, tx_id INTEGER, PRIMARY KEY(recurring_id, periode));
    CREATE INDEX IF NOT EXISTS ix_rec_book ON recurring(book_id);`);
    if (!hasCol('transactions', 'recurring_id')) db.execSync('ALTER TABLE transactions ADD COLUMN recurring_id INTEGER');
  },
  // v4 — penghitung revisi data (meta 'data.rev'). Trigger menaikkannya pada setiap INSERT/UPDATE/DELETE di tabel data, dari kode mana pun
  // (layar, import, transaksi berulang), sehingga sinkron Drive cukup membandingkan dua angka, bukan menserialisasi seluruh database.
  // Memakai UPDATE + INSERT bersyarat (bukan INSERT OR REPLACE) karena klausa konflik pernyataan luar menimpa klausa di dalam trigger.
  () => {
    ['books', 'categories', 'transactions', 'recurring', 'recurring_log'].forEach(t => ['INSERT', 'UPDATE', 'DELETE'].forEach(op => {
      db.execSync(`CREATE TRIGGER IF NOT EXISTS trg_rev_${t}_${op.toLowerCase()} AFTER ${op} ON ${t} BEGIN
        UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'data.rev';
        INSERT INTO meta(k, v) SELECT 'data.rev', '1' WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'data.rev');
      END;`);
    }));
  },
  // v5 — sinkron banyak HP. Setiap baris data punya uid (id unik lintas HP) dan upd (waktu ubah terakhir, ms sejak 1970);
  // baris yang dihapus dicatat di tabel deleted (catatan hapus). Gabung data lalu mencocokkan lewat uid dan memakai versi yang
  // paling baru diubah; catatan hapus mencegah data yang sudah dihapus di HP lain muncul kembali. Semuanya diisi trigger,
  // jadi semua kode (form, import, CSV, transaksi berulang) ikut tercatat tanpa perubahan.
  //  - INSERT tanpa uid/upd -> diisi otomatis (uid acak 32 heksa, upd = sekarang). INSERT dengan uid/upd (hasil gabung) dipertahankan.
  //  - UPDATE yang tidak mengubah upd/uid -> upd dinaikkan otomatis (selalu lebih besar dari sebelumnya). UPDATE yang menulis upd sendiri
  //    (gabung memakai upd dari HP lain) tidak diubah trigger.
  //  - DELETE -> catatan hapus (tbl, uid, at). INSERT dengan uid yang sama menghapus catatan hapusnya (mis. Urungkan hapus).
  // Data lama diberi uid acak dan upd = 0 ("tidak diketahui"): perubahan berikutnya selalu dianggap lebih baru.
  () => {
    db.execSync('CREATE TABLE IF NOT EXISTS deleted(tbl TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(tbl, uid))');
    SYNC_TABLES.forEach(t => {
      if (!hasCol(t, 'uid')) db.execSync(`ALTER TABLE ${t} ADD COLUMN uid TEXT`);
      if (!hasCol(t, 'upd')) db.execSync(`ALTER TABLE ${t} ADD COLUMN upd INTEGER`);
      db.execSync(`UPDATE ${t} SET uid = ${NEW_UID} WHERE uid IS NULL; UPDATE ${t} SET upd = 0 WHERE upd IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS ux_${t}_uid ON ${t}(uid);
        CREATE TRIGGER IF NOT EXISTS trg_uid_${t}_ins AFTER INSERT ON ${t} WHEN NEW.uid IS NULL OR NEW.upd IS NULL BEGIN
          UPDATE ${t} SET uid = COALESCE(NEW.uid, ${NEW_UID}), upd = COALESCE(NEW.upd, ${NOW_MS}) WHERE rowid = NEW.rowid;
        END;
        CREATE TRIGGER IF NOT EXISTS trg_tomb_${t}_ins AFTER INSERT ON ${t} WHEN NEW.uid IS NOT NULL BEGIN
          DELETE FROM deleted WHERE tbl = '${t}' AND uid = NEW.uid;
        END;
        CREATE TRIGGER IF NOT EXISTS trg_upd_${t} AFTER UPDATE ON ${t} WHEN NEW.upd IS OLD.upd AND NEW.uid IS OLD.uid BEGIN
          UPDATE ${t} SET upd = max(${NOW_MS}, COALESCE(OLD.upd, 0) + 1) WHERE rowid = NEW.rowid;
        END;
        CREATE TRIGGER IF NOT EXISTS trg_tomb_${t}_del AFTER DELETE ON ${t} WHEN OLD.uid IS NOT NULL BEGIN
          DELETE FROM deleted WHERE tbl = '${t}' AND uid = OLD.uid;
          INSERT INTO deleted(tbl, uid, at) VALUES('${t}', OLD.uid, ${NOW_MS});
        END;`);
    });
  },
];
export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate() {
  let v = db.getFirstSync('PRAGMA user_version').user_version;
  // Bila v > SCHEMA_VERSION (DB dibuat app yang lebih baru) tidak ada yang dijalankan; kolom tambahan tidak mengganggu kode lama.
  for (; v < MIGRATIONS.length; v++) {
    const run = MIGRATIONS[v];
    inTx(() => { run(); db.execSync(`PRAGMA user_version = ${v + 1}`); });
  }
}

export function initDb() {
  migrate();
  // v1.13.0: aplikasi dimulai KOSONG (hanya satu buku kas tanpa kategori & transaksi). Data contoh Excel tidak diisi lagi.
  // Penanda "seeded" tetap ditulis agar pemasangan lama/baru berperilaku sama.
  if (meta('seeded') == null) setMeta('seeded', 1);
  try { pruneTombstones(); } catch (e) { /* tidak penting */ }
  const a = parseInt(meta('active'), 10);
  cur = db.getFirstSync('SELECT id FROM books WHERE id=?', [a]) ? a : db.getFirstSync('SELECT id FROM books ORDER BY urut,id').id;
}

// Apakah aplikasi ini belum berisi data apa pun (tanpa transaksi, kategori, transaksi berulang; paling banyak satu buku kas).
export function isLocalEmpty() {
  const n = t => db.getFirstSync(`SELECT COUNT(*) c FROM ${t}`).c;
  return n('transactions') === 0 && n('categories') === 0 && n('recurring') === 0 && n('books') <= 1;
}

// Kosongkan SELURUH data (semua buku kas, kategori, transaksi, transaksi berulang) dan kembali ke satu buku kas kosong.
// Dipakai saat keluar dari akun. Yang dipertahankan di tabel meta hanya pengaturan perangkat: cfg.* (mis. Google Web Client ID),
// welcome_done, dan seeded. Profil, status cadangan Drive, dan buku aktif ikut dihapus.
export function resetAllData() {
  inTx(() => {
    ['recurring_log', 'recurring', 'transactions', 'categories', 'books'].forEach(t => db.runSync(`DELETE FROM ${t}`));
    try { db.runSync("DELETE FROM sqlite_sequence WHERE name IN ('recurring','transactions','categories','books')"); } catch (e) { /* tabel sqlite_sequence belum ada: abaikan */ }
    db.runSync("DELETE FROM meta WHERE k NOT IN ('seeded','welcome_done') AND k NOT LIKE 'cfg.%'");
    db.runSync('DELETE FROM deleted'); // HP kembali kosong seperti baru: tidak membawa catatan hapus akun sebelumnya
    db.runSync("INSERT INTO books(nama,tipe,urut) VALUES('Buku Kas Utama','pribadi',0)");
  });
  cur = db.getFirstSync('SELECT id FROM books ORDER BY urut,id').id;
}

// Kosongkan kategori & transaksi satu buku kas (transaksi dulu, baru kategori)
// Atomik: dipanggil langsung (Kosongkan buku kas) maupun di dalam transaksi lain (deleteBook, import CSV Ganti Semua).
export function wipeBook(bookId) {
  inTx(() => {
    db.runSync('DELETE FROM recurring_log WHERE recurring_id IN (SELECT id FROM recurring WHERE book_id=?)', [bookId]);
    db.runSync('DELETE FROM recurring WHERE book_id=?', [bookId]);
    db.runSync('DELETE FROM transactions WHERE book_id=?', [bookId]);
    db.runSync('DELETE FROM categories WHERE book_id=?', [bookId]);
  });
}

// ---- Kategori ----
const norm = v => String(v ?? '').trim();
export const findCategory = (jenis, nama, bookId = cur) =>
  db.getFirstSync('SELECT * FROM categories WHERE book_id=? AND jenis=? AND lower(nama)=lower(?)', [bookId, jenis, norm(nama)]);

// Tambah satu kategori. Mengembalikan id baru, atau null bila nama kosong / sudah dipakai di kelompok itu.
export function addCategory(jenis, nama, anggaran = 0, bookId = cur) {
  nama = norm(nama);
  if (!nama || findCategory(jenis, nama, bookId)) return null;
  const u = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM categories WHERE book_id=? AND jenis=?', [bookId, jenis]).u;
  return db.runSync('INSERT INTO categories(jenis,nama,anggaran,urut,book_id) VALUES(?,?,?,?,?)', [jenis, nama, anggaran || 0, u, bookId]).lastInsertRowId;
}

// Ganti nama kategori. Hasil: 'ok' | 'sama' (tidak berubah) | 'kosong' | 'kembar' (nama sudah dipakai kategori lain di kelompok yang sama).
export function renameCategory(id, nama) {
  nama = norm(nama);
  const c = db.getFirstSync('SELECT * FROM categories WHERE id=?', [id]);
  if (!c || !nama) return 'kosong';
  if (nama === c.nama) return 'sama';
  if (db.getFirstSync('SELECT id FROM categories WHERE book_id=? AND jenis=? AND lower(nama)=lower(?) AND id<>?', [c.book_id, c.jenis, nama, id])) return 'kembar';
  inTx(() => {
    db.runSync('UPDATE categories SET nama=? WHERE id=?', [nama, id]);
    db.runSync('UPDATE transactions SET kategori=? WHERE category_id=?', [nama, id]); // salinan nama ikut diperbarui
    db.runSync('UPDATE recurring SET kategori=? WHERE category_id=?', [nama, id]);
  });
  return 'ok';
}

// Jumlah & total nominal transaksi yang memakai kategori ini
export const categoryUsage = id => db.getFirstSync('SELECT COUNT(*) n, COALESCE(SUM(nominal),0) total FROM transactions WHERE category_id=?', [id]);

// Jumlah transaksi berulang yang memakai kategori ini (ikut dihapus bersama kategorinya)
export const categoryRecurring = id => db.getFirstSync('SELECT COUNT(*) n FROM recurring WHERE category_id=?', [id]).n;

// withTx=false: transaksi dipertahankan tanpa kategori (category_id NULL); withTx=true: transaksinya ikut dihapus
// Transaksi buku kas aktif untuk satu rentang (awalan tanggal: '2026-11', '2026', atau '' = semua), terbaru dulu, maksimal `limit` baris.
export const txByPrefix = (prefix = '', limit = 500) => db.getAllSync(`SELECT * FROM transactions WHERE book_id=? AND ${DATE_IN} ORDER BY tanggal DESC,id DESC LIMIT ?`, [bid(), ...dateRange(prefix), limit]);

export function deleteCategory(id, withTx = false) {
  inTx(() => {
    // Templat berulang butuh kategori; tanpa kategori ia tidak bisa membuat transaksi lagi, jadi ikut dihapus (transaksi yang sudah tercatat tidak disentuh kecuali withTx)
    db.runSync('DELETE FROM recurring_log WHERE recurring_id IN (SELECT id FROM recurring WHERE category_id=?)', [id]);
    db.runSync('DELETE FROM recurring WHERE category_id=?', [id]);
    if (withTx) db.runSync('DELETE FROM transactions WHERE category_id=?', [id]);
    else db.runSync('UPDATE transactions SET category_id=NULL WHERE category_id=?', [id]);
    db.runSync('DELETE FROM categories WHERE id=?', [id]);
  });
}

export const getBooks = () => db.getAllSync('SELECT b.*, (SELECT COUNT(*) FROM transactions t WHERE t.book_id=b.id) n FROM books b ORDER BY b.urut,b.id');
export const getBook = (id = cur) => db.getFirstSync('SELECT * FROM books WHERE id=?', [id]) || db.getFirstSync('SELECT * FROM books ORDER BY urut,id');
export function setActiveBook(id) { cur = id; setMeta('active', id); }

// Tambah banyak kategori sekaligus ke satu kelompok (nama yang sudah ada dilewati). Mengembalikan jumlah yang benar-benar ditambah.
export function addCategories(jenis, names, bookId = cur) {
  let n = 0;
  inTx(() => { names.forEach(nama => { if (addCategory(jenis, nama, 0, bookId) != null) n++; }); });
  return n;
}

// Paket Master: isi kelompok-kelompok buku kas dengan kategori rekomendasi dari master (anggaran Rp 0)
export function seedStarter(bookId) {
  JENIS.forEach(j => addCategories(j, starterNames(j), bookId));
}

// isi: 'master' = Paket Master (kategori rekomendasi); 'copy' = salin kategori & anggaran dari copyFrom (tanpa transaksi); 'kosong' = mulai kosong
export function addBook(nama, tipe, isi = 'kosong', copyFrom = null) {
  let id;
  inTx(() => {
    const u = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM books').u;
    id = db.runSync('INSERT INTO books(nama,tipe,urut) VALUES(?,?,?)', [nama, tipe, u]).lastInsertRowId;
    if (isi === 'copy' && copyFrom) db.runSync('INSERT INTO categories(jenis,nama,anggaran,urut,book_id) SELECT jenis,nama,anggaran,urut,? FROM categories WHERE book_id=?', [id, copyFrom]);
    if (isi === 'master') seedStarter(id);
  });
  return id;
}
export const updateBook = (id, nama, tipe) => db.runSync('UPDATE books SET nama=?, tipe=? WHERE id=?', [nama, tipe, id]);
export function deleteBook(id) {
  inTx(() => {
    wipeBook(id);
    db.runSync('DELETE FROM books WHERE id=?', [id]);
  });
  if (cur === id) setActiveBook(db.getFirstSync('SELECT id FROM books ORDER BY urut,id').id);
}
// Saldo (pendapatan - semua keluaran) satu buku pada bulan "YYYY-MM"
export function bookSaldo(id, ymStr) {
  const rows = db.getAllSync(`SELECT jenis,SUM(nominal) s FROM transactions WHERE book_id=? AND ${DATE_IN} GROUP BY jenis`, [id, ...dateRange(ymStr)]);
  return rows.reduce((a, r) => a + (r.jenis === 'Pendapatan' ? r.s : -r.s), 0);
}