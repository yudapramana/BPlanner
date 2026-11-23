import * as DocumentPicker from 'expo-document-picker';
import { db, bid, getBook, getBooks, setActiveBook, findCategory, addCategory, wipeBook, inTx, TIPE, deleteCategory, deleteBook } from './db';
import { SEED_CATS } from './seed';
import { HEAD, toCsv, parseCsv, normJenis, normDate, parseNom } from './csv';
import { writeCache, writeDoc, listDoc, readText, shareFile } from './files';
import { shareSheets } from './excel';
import { todayYmd, deleteRecurring } from './recurring';

const ORDER = Object.keys(SEED_CATS);
const slugOf = nama => String(nama).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Buku';
const slug = () => slugOf(getBook().nama);
const today = () => todayYmd(); // tanggal lokal HP (bukan UTC): export pukul 00.00-07.00 WIB tidak lagi bertanggal kemarin

async function shareText(name, text) {
  const uri = await writeCache(name, text);
  await shareFile(uri, 'text/csv', name);
}

// ---------- Backup CSV (satu buku kas aktif) ----------
export async function exportBackup() {
  const cats = db.getAllSync('SELECT jenis,nama,anggaran FROM categories WHERE book_id=? ORDER BY urut,id', [bid()]).sort((a, b) => ORDER.indexOf(a.jenis) - ORDER.indexOf(b.jenis));
  const tx = db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket FROM transactions WHERE book_id=? ORDER BY tanggal,id', [bid()]);
  const rows = [HEAD,
    ...cats.map(c => ['KATEGORI', '', c.jenis, c.nama, c.anggaran, '']),
    ...tx.map(t => ['TRANSAKSI', t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || ''])];
  await shareText(`Backup_${slug()}_${today()}.csv`, toCsv(rows));
}

export async function shareTemplate() {
  const rows = [HEAD];
  Object.entries(SEED_CATS).forEach(([j, arr]) => arr.forEach(([n, a]) => rows.push(['KATEGORI', '', j, n, a, ''])));
  rows.push(['CONTOH', '2026-11-01', 'Biaya', 'Makanan', 25000, 'Baris CONTOH diabaikan saat import. Isi transaksi dengan Tipe = TRANSAKSI']);
  await shareText('Template_Import_BudgetPlanner.csv', toCsv(rows));
}

export async function pickAndRead() {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled) return null;
  return await readText(r.assets[0].uri);
}

// ---------- Backup JSON (semua buku kas dalam satu file) ----------
// Transaksi menunjuk kategori lewat indeks ("kat") di daftar kategori bukunya sendiri, bukan id database,
// karena id akan berbeda di HP baru. kat = null berarti transaksi tanpa kategori (yatim) dan dipulihkan apa adanya.
// Sejak migrasi v5 setiap buku/kategori/transaksi/templat juga membawa uid (id lintas HP) dan upd (waktu ubah terakhir, ms),
// dan file membawa "hapus" (catatan hapus). Kolom tambahan ini diabaikan versi lama, jadi versi format tetap 1.
const FORMAT = 'budgetplanner-backup';
export const SNAPSHOT_VERSION = 1; // naikkan bila format file berubah dengan cara yang tidak terbaca versi lama

function bookPayload(b) {
  const cats = db.getAllSync('SELECT id,jenis,nama,anggaran,urut,uid,upd FROM categories WHERE book_id=? ORDER BY urut,id', [b.id]);
  const idx = new Map(cats.map((c, i) => [c.id, i]));
  const tx = db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket,category_id,recurring_id,uid,upd FROM transactions WHERE book_id=? ORDER BY tanggal,id', [b.id]);
  // Transaksi berulang: templat + catatan bulan yang sudah diproses (log). Transaksi hasilnya menunjuk templat lewat indeks "rec".
  const recs = db.getAllSync('SELECT * FROM recurring WHERE book_id=? ORDER BY id', [b.id]);
  const ridx = new Map(recs.map((r, i) => [r.id, i]));
  return {
    nama: b.nama, tipe: b.tipe, aktif: b.id === bid(), uid: b.uid, upd: b.upd,
    kategori: cats.map(c => ({ jenis: c.jenis, nama: c.nama, anggaran: c.anggaran, uid: c.uid, upd: c.upd })),
    transaksi: tx.map(t => ({ tanggal: t.tanggal, jenis: t.jenis, kategori: t.kategori, nominal: t.nominal, ket: t.ket || '', kat: idx.has(t.category_id) ? idx.get(t.category_id) : null, rec: ridx.has(t.recurring_id) ? ridx.get(t.recurring_id) : null, uid: t.uid, upd: t.upd })),
    berulang: recs.map(r => ({ jenis: r.jenis, kategori: r.kategori, kat: idx.has(r.category_id) ? idx.get(r.category_id) : null, nominal: r.nominal, ket: r.ket || '', hari: r.hari, mulai: r.mulai, akhir: r.akhir || null, otomatis: r.otomatis, ingat: r.ingat, aktif: r.aktif, uid: r.uid, upd: r.upd,
      log: db.getAllSync('SELECT periode,status FROM recurring_log WHERE recurring_id=? ORDER BY periode', [r.id]) })),
  };
}

// scope: 'all' = semua buku kas; 'active' = hanya buku kas aktif
export function buildSnapshot(scope = 'all') {
  const books = scope === 'active' ? [getBook()] : getBooks();
  const hapus = db.getAllSync('SELECT tbl t, uid, at FROM deleted ORDER BY at, tbl, uid');
  return { format: FORMAT, version: SNAPSHOT_VERSION, exportedAt: new Date().toISOString(), books: books.map(bookPayload), hapus };
}
// File berformat sinkron banyak HP (v5): setiap buku membawa uid. File lama / buatan tangan tidak.
export const hasSyncIds = snap => !!snap && Array.isArray(snap.books) && snap.books.length > 0 && snap.books.every(b => b && typeof b.uid === 'string' && !!b.uid);
const countOf = snap => ({ buku: snap.books.length, kat: snap.books.reduce((a, b) => a + b.kategori.length, 0), tx: snap.books.reduce((a, b) => a + b.transaksi.length, 0) });

export async function exportAllBooks() {
  const snap = buildSnapshot('all');
  const name = `Backup_SemuaBuku_${today()}.json`;
  await shareFile(await writeCache(name, JSON.stringify(snap)), 'application/json', name);
  return countOf(snap);
}

// ---------- Backup otomatis (sebelum tindakan yang menghapus data) ----------
const AUTO_DIR = 'auto-backup', AUTO_KEEP = 10;
const stamp = () => new Date().toISOString().slice(0, 23).replace(/[:.]/g, '-'); // sampai milidetik: dua backup beruntun tidak saling menimpa

// Menyimpan salinan ke penyimpanan aplikasi; hanya AUTO_KEEP file terbaru yang disimpan. Melempar error bila gagal menulis.
export async function autoBackup(scope = 'active') {
  const label = scope === 'all' ? 'SemuaBuku' : slug();
  const name = `Auto_${stamp()}_${label}.json`;
  const uri = await writeDoc(AUTO_DIR, name, JSON.stringify(buildSnapshot(scope)));
  try { listDoc(AUTO_DIR).slice(0, -AUTO_KEEP).forEach(f => f.delete()); } catch (e) { /* gagal merapikan file lama tidak boleh membatalkan backup */ }
  return { uri, name };
}
// Hapus semua salinan otomatis di HP (dipakai saat keluar akun setelah data aman di Google Drive). Tidak pernah melempar error.
export function clearAutoBackups() { try { listDoc(AUTO_DIR).forEach(f => { try { f.delete(); } catch (e) { /* abaikan satu file */ } }); } catch (e) { /* folder belum ada */ } }
export const latestAutoBackup = () => { const l = listDoc(AUTO_DIR); return l.length ? { uri: l[l.length - 1].uri, name: l[l.length - 1].name } : null; };
export const shareAutoBackup = b => shareFile(b.uri, 'application/json', b.name);

// ---------- Import ----------
const isJson = text => /^[\s\uFEFF]*\{/.test(text);
const key = (...a) => a.join('|');

function parseSnapshot(text) {
  let o;
  try { o = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (e) { throw new Error('File JSON rusak atau bukan hasil Export aplikasi ini.'); }
  if (!o || o.format !== FORMAT || !Array.isArray(o.books)) throw new Error('Bukan file backup Budget Planner.');
  // File dari aplikasi yang lebih baru bisa memuat data yang belum dikenali versi ini; "Ganti Semua" akan membuangnya diam-diam, jadi tolak.
  if (Number.isFinite(o.version) && o.version > SNAPSHOT_VERSION) throw new Error('File backup dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi lebih dulu, lalu coba lagi.');
  if (!o.books.length) throw new Error('File backup tidak berisi buku kas.');
  o.books.forEach(b => { if (!b || !Array.isArray(b.kategori) || !Array.isArray(b.transaksi)) throw new Error('Isi file backup tidak lengkap.'); });
  return o;
}

function parseCsvImport(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('File kosong.');
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  const [iT, iD, iJ, iK, iN, iKet] = ['tipe', 'tanggal', 'jenis', 'kategori', 'nominal', 'keterangan'].map(k => hdr.indexOf(k));
  if ([iT, iJ, iK, iN].some(i => i < 0)) throw new Error('Header tidak sesuai. Gunakan file hasil Export atau Template Import.');
  const tipeOf = r => (r[iT] || '').trim().toUpperCase();
  const body = rows.slice(1);
  if (!body.some(r => tipeOf(r) === 'KATEGORI' || tipeOf(r) === 'TRANSAKSI')) throw new Error('Tidak ada baris bertipe KATEGORI atau TRANSAKSI di file ini.');
  return { body, tipeOf, iD, iJ, iK, iN, iKet, kat: body.filter(r => tipeOf(r) === 'KATEGORI').length, tx: body.filter(r => tipeOf(r) === 'TRANSAKSI').length };
}

// Kategori: pakai yang sudah ada (nama sama tanpa beda huruf besar/kecil) atau buat baru. Mengembalikan { id, nama }.
function upsertCat(j, nama, bud, res) {
  const ex = findCategory(j, nama);
  if (ex) { if (bud !== null) db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [bud, ex.id]); return { id: ex.id, nama: ex.nama }; }
  const id = addCategory(j, nama, bud || 0);
  res.katBaru++;
  return { id, nama };
}

function applyCsv(p, replace) {
  const { body, tipeOf, iD, iJ, iK, iN, iKet } = p;
  const res = { kat: 0, katBaru: 0, tx: 0, dobel: 0, lewat: 0 };
  inTx(() => {
    if (replace) wipeBook(bid());
    const have = {};
    db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket FROM transactions WHERE book_id=?', [bid()]).forEach(t => { const k = key(t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || ''); have[k] = (have[k] || 0) + 1; });
    for (const r of body) {
      const tipe = tipeOf(r), jenis = normJenis(r[iJ]), kat = (r[iK] || '').trim(), nom = parseNom(r[iN]);
      if (tipe === 'KATEGORI') {
        if (!jenis || !kat) { res.lewat++; continue; }
        upsertCat(jenis, kat, nom, res); res.kat++;
      } else if (tipe === 'TRANSAKSI') {
        const tgl = iD >= 0 ? normDate(r[iD]) : '';
        if (!tgl || !jenis || !kat || !nom) { res.lewat++; continue; }
        const c = upsertCat(jenis, kat, null, res);
        const ket = (iKet >= 0 ? r[iKet] || '' : '').trim();
        const k = key(tgl, jenis, c.nama, nom, ket);
        if (have[k] > 0) { have[k]--; res.dobel++; continue; }
        db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES(?,?,?,?,?,?,?)', [tgl, jenis, c.nama, nom, ket, bid(), c.id]);
        res.tx++;
      } else res.lewat++;
    }
  });
  return res;
}

// ---------- Menerapkan file JSON ----------
// replace=true: SEMUA buku kas dihapus lalu diganti isi file (catatan hapus juga diganti milik file).
// replace=false (gabung). Setiap baris dicocokkan dengan urutan:
//   1. uid sama           -> versi dengan upd (waktu ubah) paling baru dipakai; yang lebih lama dibiarkan.
//   2. uid sudah dihapus di HP ini (catatan hapus) dan versi file TIDAK lebih baru -> dilewati (data yang dihapus tidak muncul lagi).
//   3. isi sama (cara lama: buku = nama; kategori = kelompok + nama; transaksi = tanggal, jenis, kategori, nominal, keterangan)
//      -> dianggap baris yang sama, dan HP ini MENGAMBIL uid dari file, sehingga gabung berikutnya cocok lewat uid.
//   4. selain itu         -> baris baru.
// Setelah itu catatan hapus dari file diterapkan: baris di HP ini yang dihapus di HP lain dan tidak diubah sesudahnya ikut dihapus.
// File tanpa uid (versi lama / buatan tangan) hanya memakai langkah 3-4, sama seperti sebelumnya (termasuk anggaran dari file menimpa).
const UID_RE = /^[A-Za-z0-9:_-]{1,100}$/;
const uidOf = r => (r && typeof r.uid === 'string' && UID_RE.test(r.uid) ? r.uid : null);
const updOf = r => { const n = Number(r && r.upd); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const byUid = (tbl, uid) => (uid ? db.getFirstSync(`SELECT * FROM ${tbl} WHERE uid=?`, [uid]) : null);
// Baris yang cocok lewat isi mengambil uid dari file. uid di file Drive sudah dikenal HP lain (setiap HP menggabung file Drive
// sebelum mengunggah), sedangkan uid baris ini baru dikenal HP ini. Jadi HP lain tidak perlu berubah, dan edit berikutnya di HP
// mana pun tetap cocok lewat uid. (Aturan "uid terkecil" tidak cukup: bila HP ini mempertahankan uid-nya lalu mengedit baris itu
// sebelum HP lain menggabung, HP lain tidak bisa mencocokkannya lagi -> dobel.) Mengubah uid tidak menaikkan upd (lihat trigger v5).
const adoptUid = (tbl, row, uid) => {
  if (uid && row.uid !== uid && !byUid(tbl, uid)) { db.runSync(`UPDATE ${tbl} SET uid=? WHERE id=?`, [uid, row.id]); row.uid = uid; }
};
const TOMB_TABLES = ['books', 'categories', 'transactions', 'recurring'];
// Baris di HP ini yang bisa dicocokkan lewat isi: tidak boleh baris yang uid-nya ada di file (itu sudah dicocokkan lewat uid)
const freeForContent = (ex, remoteUids, uid) => ex && !(ex.uid && ex.uid !== uid && remoteUids.has(ex.uid));

function applySnapshot(snap, replace) {
  const res = { buku: 0, bukuBaru: 0, kat: 0, katBaru: 0, tx: 0, dobel: 0, lewat: 0, rec: 0, ubah: 0, hapus: 0, terhapus: 0 };
  let activeId = null, firstId = null;
  inTx(() => {
    if (replace) {
      db.runSync('DELETE FROM recurring_log'); db.runSync('DELETE FROM recurring'); db.runSync('DELETE FROM transactions'); db.runSync('DELETE FROM categories'); db.runSync('DELETE FROM books');
      db.runSync('DELETE FROM deleted'); // diganti catatan hapus milik file (di akhir)
    }
    const tomb = new Map(db.getAllSync('SELECT tbl,uid,at FROM deleted').map(d => [`${d.tbl}|${d.uid}`, d.at]));
    // Dihapus di HP ini dan versi file tidak lebih baru dari penghapusannya
    const deletedHere = (tbl, uid, upd) => { const at = uid ? tomb.get(`${tbl}|${uid}`) : undefined; return at != null && !(upd > at); };
    const remoteBookUids = new Set(snap.books.map(uidOf).filter(Boolean));

    snap.books.forEach(b => {
      const nama = String(b.nama || '').trim().slice(0, 30) || 'Buku Kas';
      const tipe = b.tipe in TIPE ? b.tipe : 'lainnya';
      const bUid = uidOf(b), bUpd = updOf(b);
      let book = byUid('books', bUid);
      if (!book && deletedHere('books', bUid, bUpd)) {
        // Buku ini dihapus di HP ini. Dilewati, KECUALI ada isinya yang diubah di HP lain setelah buku dihapus.
        const at = tomb.get(`books|${bUid}`);
        const newer = [...b.kategori, ...b.transaksi, ...(Array.isArray(b.berulang) ? b.berulang : [])].some(r => updOf(r) > at);
        if (!newer) { res.terhapus++; return; }
      }
      if (!book) { const ex = db.getFirstSync('SELECT * FROM books WHERE lower(nama)=lower(?)', [nama]); if (freeForContent(ex, remoteBookUids, bUid)) book = ex; }
      let bookId;
      if (book) {
        bookId = book.id; adoptUid('books', book, bUid);
        if (bUid && bUpd > (book.upd || 0)) { db.runSync('UPDATE books SET nama=?, tipe=?, upd=? WHERE id=?', [nama, tipe, bUpd, bookId]); res.ubah++; }
      } else {
        const u = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM books').u;
        bookId = db.runSync('INSERT INTO books(nama,tipe,urut,uid,upd) VALUES(?,?,?,?,?)', [nama, tipe, u, bUid, bUid ? bUpd : null]).lastInsertRowId; res.bukuBaru++;
      }
      res.buku++; if (firstId == null) firstId = bookId; if (b.aktif) activeId = bookId;

      // ---- Kategori: indeks file -> { id, nama, jenis } atau null ----
      const remoteCatUids = new Set(b.kategori.map(uidOf).filter(Boolean));
      const map = b.kategori.map(c => {
        const jenis = normJenis(c && c.jenis), n = String((c && c.nama) || '').trim();
        if (!jenis || !n) { res.lewat++; return null; }
        const uid = uidOf(c), upd = updOf(c), anggaran = parseNom(c.anggaran);
        res.kat++;
        let row = byUid('categories', uid);
        if (!row && deletedHere('categories', uid, upd)) { res.terhapus++; return null; } // transaksinya menjadi tanpa kategori, sama seperti di HP ini
        if (!row) { const ex = findCategory(jenis, n, bookId); if (freeForContent(ex, remoteCatUids, uid)) row = ex; }
        if (row) {
          adoptUid('categories', row, uid);
          if (!uid) db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [anggaran, row.id]); // file lama: anggaran file menimpa (perilaku lama)
          else if (upd > (row.upd || 0)) {
            try { db.runSync('UPDATE categories SET nama=?, anggaran=?, upd=? WHERE id=?', [n, anggaran, upd, row.id]); }
            catch (e) { db.runSync('UPDATE categories SET anggaran=?, upd=? WHERE id=?', [anggaran, upd, row.id]); } // nama sudah dipakai kategori lain: nama di HP ini dipertahankan
            res.ubah++;
          }
          return { id: row.id, nama: db.getFirstSync('SELECT nama FROM categories WHERE id=?', [row.id]).nama, jenis };
        }
        const urut = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM categories WHERE book_id=? AND jenis=?', [bookId, jenis]).u;
        try {
          const id = db.runSync('INSERT INTO categories(jenis,nama,anggaran,urut,book_id,uid,upd) VALUES(?,?,?,?,?,?,?)', [jenis, n, anggaran, urut, bookId, uid, uid ? upd : null]).lastInsertRowId;
          res.katBaru++; return { id, nama: n, jenis };
        } catch (e) { // nama bentrok dengan kategori yang sudah dicocokkan ke baris lain di file: pakai kategori yang ada
          const ex = findCategory(jenis, n, bookId); return ex ? { id: ex.id, nama: ex.nama, jenis } : null;
        }
      });

      // ---- Transaksi berulang (file lama tanpa kolom "berulang" dilewati). recMap: indeks file -> id templat di database ini ----
      const recs = Array.isArray(b.berulang) ? b.berulang : [];
      const remoteRecUids = new Set(recs.map(uidOf).filter(Boolean));
      const recMap = recs.map(r => {
        const jenis = normJenis(r && r.jenis), hari = parseInt(r && r.hari, 10), mulai = String((r && r.mulai) || '');
        const cat = Number.isInteger(r && r.kat) && map[r.kat] && map[r.kat].jenis === jenis ? map[r.kat] : null;
        if (!jenis || !cat || !(hari >= 1 && hari <= 31) || !/^\d{4}-\d{2}$/.test(mulai)) { res.lewat++; return null; }
        const uid = uidOf(r), upd = updOf(r);
        const nominal = parseNom(r.nominal), ket = String(r.ket || '').trim();
        const v = [cat.id, jenis, cat.nama, nominal, ket, hari, mulai, /^\d{4}-\d{2}$/.test(r.akhir || '') ? r.akhir : null, r.otomatis ? 1 : 0, Number.isInteger(r.ingat) ? r.ingat : 3, r.aktif === 0 ? 0 : 1];
        let row = byUid('recurring', uid);
        if (!row && deletedHere('recurring', uid, upd)) { res.terhapus++; return null; }
        if (!row) {
          const ex = db.getFirstSync("SELECT * FROM recurring WHERE book_id=? AND category_id=? AND nominal=? AND hari=? AND ifnull(ket,'')=?", [bookId, cat.id, nominal, hari, ket]);
          if (freeForContent(ex, remoteRecUids, uid)) row = ex;
        }
        let id;
        if (row) {
          id = row.id; adoptUid('recurring', row, uid);
          if (uid && upd > (row.upd || 0)) { db.runSync('UPDATE recurring SET category_id=?,jenis=?,kategori=?,nominal=?,ket=?,hari=?,mulai=?,akhir=?,otomatis=?,ingat=?,aktif=?,upd=? WHERE id=?', [...v, upd, id]); res.ubah++; }
        } else {
          id = db.runSync('INSERT INTO recurring(book_id,category_id,jenis,kategori,nominal,ket,hari,mulai,akhir,otomatis,ingat,aktif,uid,upd) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [bookId, ...v, uid, uid ? upd : null]).lastInsertRowId;
          res.rec++;
        }
        (Array.isArray(r.log) ? r.log : []).forEach(l => { if (l && /^\d{4}-\d{2}$/.test(l.periode || '')) db.runSync('INSERT OR IGNORE INTO recurring_log(recurring_id,periode,status,tx_id) VALUES(?,?,?,NULL)', [id, l.periode, l.status === 'skip' ? 'skip' : 'done']); });
        return id;
      });

      // ---- Transaksi ----
      const remoteTxUids = new Set(b.transaksi.map(uidOf).filter(Boolean));
      const have = new Map(); // isi -> baris di HP ini yang bisa dicocokkan lewat isi (yang uid-nya tidak ada di file)
      db.getAllSync('SELECT id,uid,tanggal,jenis,kategori,nominal,ket FROM transactions WHERE book_id=?', [bookId]).forEach(t => {
        if (t.uid && remoteTxUids.has(t.uid)) return;
        const k = key(t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || '');
        if (!have.has(k)) have.set(k, []);
        have.get(k).push(t);
      });
      b.transaksi.forEach(t => {
        const tgl = normDate(t && t.tanggal), jenis = normJenis(t && t.jenis), nom = parseNom(t && t.nominal);
        if (!tgl || !jenis) { res.lewat++; return; } // nominal 0 tetap dipulihkan: backup harus mengembalikan data apa adanya
        let cat = null; // kat = null di file -> tetap yatim; kat tidak ada (file buatan tangan) -> cocokkan lewat nama
        if (t.kat === undefined) { const ex = findCategory(jenis, t.kategori, bookId); if (ex) cat = { id: ex.id, nama: ex.nama }; }
        else if (Number.isInteger(t.kat) && map[t.kat] && map[t.kat].jenis === jenis) cat = map[t.kat];
        const nm = cat ? cat.nama : String(t.kategori || '').trim();
        const ket = String(t.ket || '').trim();
        const recId = Number.isInteger(t.rec) && recMap[t.rec] ? recMap[t.rec] : null;
        const uid = uidOf(t), upd = updOf(t);
        const row = byUid('transactions', uid);
        if (row) {
          if (upd > (row.upd || 0)) {
            db.runSync('UPDATE transactions SET tanggal=?,jenis=?,kategori=?,nominal=?,ket=?,category_id=?,recurring_id=?,upd=? WHERE id=?', [tgl, jenis, nm, nom, ket, cat ? cat.id : null, recId, upd, row.id]);
            res.ubah++;
          } else res.dobel++;
          return;
        }
        if (deletedHere('transactions', uid, upd)) { res.terhapus++; return; }
        const cand = have.get(key(tgl, jenis, nm, nom, ket));
        if (cand && cand.length) { adoptUid('transactions', cand.shift(), uid); res.dobel++; return; }
        const txId = db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id,recurring_id,uid,upd) VALUES(?,?,?,?,?,?,?,?,?,?)', [tgl, jenis, nm, nom, ket, bookId, cat ? cat.id : null, recId, uid, uid ? upd : null]).lastInsertRowId;
        if (recId) db.runSync("UPDATE recurring_log SET tx_id=?, status='done' WHERE recurring_id=? AND periode=? AND tx_id IS NULL", [txId, recId, tgl.slice(0, 7)]);
        res.tx++;
      });
    });

    // ---- Catatan hapus dari file ----
    const hapus = (Array.isArray(snap.hapus) ? snap.hapus : [])
      .map(h => ({ t: h && h.t, uid: uidOf(h), at: updOf({ upd: h && h.at }) }))
      .filter(h => TOMB_TABLES.includes(h.t) && h.uid && h.at > 0);
    if (!replace) {
      // Urutan: transaksi -> templat -> kategori -> buku, agar baris yang bergantung sudah beres lebih dulu.
      ['transactions', 'recurring', 'categories', 'books'].forEach(tbl => hapus.filter(h => h.t === tbl).forEach(h => {
        const row = byUid(tbl, h.uid);
        if (!row || (row.upd || 0) > h.at) return; // tidak ada, atau diubah di HP ini SETELAH dihapus di HP lain -> dipertahankan
        if (tbl === 'transactions') { db.runSync("UPDATE recurring_log SET status='skip', tx_id=NULL WHERE tx_id=?", [row.id]); db.runSync('DELETE FROM transactions WHERE id=?', [row.id]); }
        else if (tbl === 'recurring') deleteRecurring(row.id);
        else if (tbl === 'categories') deleteCategory(row.id, false);
        else {
          const newer = ['categories', 'transactions', 'recurring'].some(t => db.getFirstSync(`SELECT 1 x FROM ${t} WHERE book_id=? AND upd > ?`, [row.id, h.at]));
          if (newer || db.getFirstSync('SELECT COUNT(*) c FROM books').c <= 1) return; // ada isi yang lebih baru, atau buku kas terakhir
          deleteBook(row.id);
        }
        res.hapus++;
      }));
    }
    // Simpan catatan hapus file (diteruskan ke HP berikutnya), kecuali barisnya masih ada di sini dan lebih baru
    hapus.forEach(h => {
      const row = byUid(h.t, h.uid);
      if (row && (row.upd || 0) > h.at) return;
      db.runSync('INSERT INTO deleted(tbl,uid,at) VALUES(?,?,?) ON CONFLICT(tbl,uid) DO UPDATE SET at=max(at, excluded.at)', [h.t, h.uid, h.at]);
    });
  });
  if (replace) setActiveBook(activeId ?? firstId); // buku aktif lama sudah dihapus
  else if (!db.getFirstSync('SELECT 1 x FROM books WHERE id=?', [bid()])) setActiveBook(db.getFirstSync('SELECT id FROM books ORDER BY urut,id').id); // buku aktif dihapus lewat catatan hapus
  return res;
}

// Langkah 1: baca & validasi file TANPA mengubah apa pun. Melempar Error bila file tidak valid.
// Hasil: { kind: 'csv'|'json', parsed, info } — info.buku (hanya json), info.kat, info.tx untuk ditampilkan di dialog konfirmasi.
export function inspectImport(text) {
  if (isJson(text)) { const parsed = parseSnapshot(text); const c = countOf(parsed); return { kind: 'json', parsed, info: c }; }
  const parsed = parseCsvImport(text);
  return { kind: 'csv', parsed, info: { kat: parsed.kat, tx: parsed.tx } };
}

// Langkah 2: jalankan import. "Ganti Semua" selalu didahului backup otomatis; bila backup gagal, import dibatalkan dan data tidak disentuh.
// CSV mengganti buku kas aktif (backup buku itu); JSON mengganti semua buku kas (backup semua buku).
export async function runImport(ins, replace) {
  let backup = null;
  if (replace) backup = await autoBackup(ins.kind === 'json' ? 'all' : 'active');
  const res = ins.kind === 'json' ? applySnapshot(ins.parsed, replace) : applyCsv(ins.parsed, replace);
  return { kind: ins.kind, res, backup };
}

// Export lengkap ke Excel (tidak untuk import ulang; untuk import gunakan Backup CSV/JSON)
export async function exportExcelFull() {
  const cats = db.getAllSync('SELECT jenis,nama,anggaran FROM categories WHERE book_id=? ORDER BY urut,id', [bid()]).sort((a, b) => ORDER.indexOf(a.jenis) - ORDER.indexOf(b.jenis));
  const tx = db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket FROM transactions WHERE book_id=? ORDER BY tanggal,id', [bid()]);
  await shareSheets(`Data_${slug()}_${today()}`, [
    { name: 'Transaksi', rows: [['Tanggal', 'Jenis', 'Kategori', 'Nominal', 'Keterangan'], ...tx.map(t => [t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || ''])] },
    { name: 'Kategori', rows: [['Kelompok', 'Kategori', 'Anggaran Bulanan'], ...cats.map(c => [c.jenis, c.nama, c.anggaran])] },
  ], 'xlsx');
}
