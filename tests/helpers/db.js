// Pembantu uji: database kosong yang sudah termigrasi + fungsi kecil untuk mengisi data.
const sqlite = require('./expo-sqlite');
const dbm = require('../../lib/db');

// Database baru, termigrasi penuh, buku kas 1 aktif, TANPA data contoh.
function freshDb() {
  sqlite.__resetDb();
  dbm.migrate();
  dbm.setActiveBook(1);
  return dbm;
}
const raw = () => sqlite.__raw();
const userVersion = () => dbm.db.getFirstSync('PRAGMA user_version').user_version;

// Isi cepat: kembalikan id kategori. nama unik per (buku, jenis).
const cat = (jenis, nama, anggaran = 0, bookId = 1) => dbm.addCategory(jenis, nama, anggaran, bookId);
const tx = (tanggal, jenis, kategori, nominal, ket = '', bookId = 1) => {
  const c = dbm.findCategory(jenis, kategori, bookId);
  return dbm.db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES(?,?,?,?,?,?,?)', [tanggal, jenis, kategori, nominal, ket, bookId, c ? c.id : null]).lastInsertRowId;
};
const rows = (sql, p) => dbm.db.getAllSync(sql, p);
const count = (table, where = '1=1', p = []) => dbm.db.getFirstSync(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`, p).c;

module.exports = { freshDb, raw, userVersion, cat, tx, rows, count };
