import * as DocumentPicker from 'expo-document-picker';
import { db, bid, getBook, getBooks, setActiveBook, findCategory, addCategory, wipeBook, inTx, TIPE } from './db';
import { SEED_CATS } from './seed';
import { HEAD, toCsv, parseCsv, normJenis, normDate, parseNom } from './csv';
import { writeCache, writeDoc, listDoc, readText, shareFile } from './files';
import { shareSheets } from './excel';

const ORDER = Object.keys(SEED_CATS);
const slugOf = nama => String(nama).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Buku';
const slug = () => slugOf(getBook().nama);
const today = () => new Date().toISOString().slice(0, 10);

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
const FORMAT = 'budgetplanner-backup';
export const SNAPSHOT_VERSION = 1; // naikkan bila format file berubah dengan cara yang tidak terbaca versi lama

function bookPayload(b) {
  const cats = db.getAllSync('SELECT id,jenis,nama,anggaran,urut FROM categories WHERE book_id=? ORDER BY urut,id', [b.id]);
  const idx = new Map(cats.map((c, i) => [c.id, i]));
  const tx = db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket,category_id,recurring_id FROM transactions WHERE book_id=? ORDER BY tanggal,id', [b.id]);
  // Transaksi berulang: templat + catatan bulan yang sudah diproses (log). Transaksi hasilnya menunjuk templat lewat indeks "rec".
  const recs = db.getAllSync('SELECT * FROM recurring WHERE book_id=? ORDER BY id', [b.id]);
  const ridx = new Map(recs.map((r, i) => [r.id, i]));
  return {
    nama: b.nama, tipe: b.tipe, aktif: b.id === bid(),
    kategori: cats.map(c => ({ jenis: c.jenis, nama: c.nama, anggaran: c.anggaran })),
    transaksi: tx.map(t => ({ tanggal: t.tanggal, jenis: t.jenis, kategori: t.kategori, nominal: t.nominal, ket: t.ket || '', kat: idx.has(t.category_id) ? idx.get(t.category_id) : null, rec: ridx.has(t.recurring_id) ? ridx.get(t.recurring_id) : null })),
    berulang: recs.map(r => ({ jenis: r.jenis, kategori: r.kategori, kat: idx.has(r.category_id) ? idx.get(r.category_id) : null, nominal: r.nominal, ket: r.ket || '', hari: r.hari, mulai: r.mulai, akhir: r.akhir || null, otomatis: r.otomatis, ingat: r.ingat, aktif: r.aktif,
      log: db.getAllSync('SELECT periode,status FROM recurring_log WHERE recurring_id=? ORDER BY periode', [r.id]) })),
  };
}

// scope: 'all' = semua buku kas; 'active' = hanya buku kas aktif
export function buildSnapshot(scope = 'all') {
  const books = scope === 'active' ? [getBook()] : getBooks();
  return { format: FORMAT, version: SNAPSHOT_VERSION, exportedAt: new Date().toISOString(), books: books.map(bookPayload) };
}
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

// replace=false: gabung ke buku dengan nama sama (atau buat buku baru); transaksi kembar dilewati.
// replace=true: SEMUA buku kas dihapus lalu diganti isi file.
function applySnapshot(snap, replace) {
  const res = { buku: 0, bukuBaru: 0, kat: 0, katBaru: 0, tx: 0, dobel: 0, lewat: 0, rec: 0 };
  let activeId = null, firstId = null;
  inTx(() => {
    if (replace) { db.runSync('DELETE FROM recurring_log'); db.runSync('DELETE FROM recurring'); db.runSync('DELETE FROM transactions'); db.runSync('DELETE FROM categories'); db.runSync('DELETE FROM books'); }
    snap.books.forEach(b => {
      const nama = String(b.nama || '').trim().slice(0, 30) || 'Buku Kas';
      const tipe = b.tipe in TIPE ? b.tipe : 'lainnya';
      let bookId = (db.getFirstSync('SELECT id FROM books WHERE lower(nama)=lower(?)', [nama]) || {}).id;
      if (!bookId) {
        const u = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM books').u;
        bookId = db.runSync('INSERT INTO books(nama,tipe,urut) VALUES(?,?,?)', [nama, tipe, u]).lastInsertRowId; res.bukuBaru++;
      }
      res.buku++; if (firstId == null) firstId = bookId; if (b.aktif) activeId = bookId;

      const map = b.kategori.map(c => { // indeks file -> { id, nama, jenis } atau null
        const jenis = normJenis(c && c.jenis), n = String((c && c.nama) || '').trim();
        if (!jenis || !n) { res.lewat++; return null; }
        const ex = findCategory(jenis, n, bookId);
        res.kat++;
        if (ex) { db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [parseNom(c.anggaran), ex.id]); return { id: ex.id, nama: ex.nama, jenis }; }
        res.katBaru++;
        return { id: addCategory(jenis, n, parseNom(c.anggaran), bookId), nama: n, jenis };
      });

      // Transaksi berulang (file lama tanpa kolom "berulang" dilewati). recMap: indeks file -> id templat di database ini.
      const recMap = (Array.isArray(b.berulang) ? b.berulang : []).map(r => {
        const jenis = normJenis(r && r.jenis), hari = parseInt(r && r.hari, 10), mulai = String((r && r.mulai) || '');
        const cat = Number.isInteger(r && r.kat) && map[r.kat] && map[r.kat].jenis === jenis ? map[r.kat] : null;
        if (!jenis || !cat || !(hari >= 1 && hari <= 31) || !/^\d{4}-\d{2}$/.test(mulai)) { res.lewat++; return null; }
        const nominal = parseNom(r.nominal), ket = String(r.ket || '').trim();
        let id = (db.getFirstSync('SELECT id FROM recurring WHERE book_id=? AND category_id=? AND nominal=? AND hari=? AND ifnull(ket,\'\')=?', [bookId, cat.id, nominal, hari, ket]) || {}).id;
        if (!id) {
          id = db.runSync('INSERT INTO recurring(book_id,category_id,jenis,kategori,nominal,ket,hari,mulai,akhir,otomatis,ingat,aktif) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            [bookId, cat.id, jenis, cat.nama, nominal, ket, hari, mulai, /^\d{4}-\d{2}$/.test(r.akhir || '') ? r.akhir : null, r.otomatis ? 1 : 0, Number.isInteger(r.ingat) ? r.ingat : 3, r.aktif === 0 ? 0 : 1]).lastInsertRowId;
          res.rec++;
        }
        (Array.isArray(r.log) ? r.log : []).forEach(l => { if (l && /^\d{4}-\d{2}$/.test(l.periode || '')) db.runSync('INSERT OR IGNORE INTO recurring_log(recurring_id,periode,status,tx_id) VALUES(?,?,?,NULL)', [id, l.periode, l.status === 'skip' ? 'skip' : 'done']); });
        return id;
      });

      const have = {};
      db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket FROM transactions WHERE book_id=?', [bookId]).forEach(t => { const k = key(t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || ''); have[k] = (have[k] || 0) + 1; });
      b.transaksi.forEach(t => {
        const tgl = normDate(t && t.tanggal), jenis = normJenis(t && t.jenis), nom = parseNom(t && t.nominal);
        if (!tgl || !jenis) { res.lewat++; return; } // nominal 0 tetap dipulihkan: backup harus mengembalikan data apa adanya
        let cat = null; // kat = null di file -> tetap yatim; kat tidak ada (file buatan tangan) -> cocokkan lewat nama
        if (t.kat === undefined) { const ex = findCategory(jenis, t.kategori, bookId); if (ex) cat = { id: ex.id, nama: ex.nama }; }
        else if (Number.isInteger(t.kat) && map[t.kat] && map[t.kat].jenis === jenis) cat = map[t.kat];
        const nm = cat ? cat.nama : String(t.kategori || '').trim();
        const ket = String(t.ket || '').trim();
        const k = key(tgl, jenis, nm, nom, ket);
        if (have[k] > 0) { have[k]--; res.dobel++; return; }
        const recId = Number.isInteger(t.rec) && recMap[t.rec] ? recMap[t.rec] : null;
        const txId = db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id,recurring_id) VALUES(?,?,?,?,?,?,?,?)', [tgl, jenis, nm, nom, ket, bookId, cat ? cat.id : null, recId]).lastInsertRowId;
        if (recId) db.runSync("UPDATE recurring_log SET tx_id=? WHERE recurring_id=? AND periode=? AND tx_id IS NULL", [txId, recId, tgl.slice(0, 7)]);
        res.tx++;
      });
    });
  });
  if (replace) setActiveBook(activeId ?? firstId); // buku aktif lama sudah dihapus
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
