// Sinkron banyak HP (migrasi v5): dua HP (A dan B) memakai akun & file Drive yang sama.
// Setiap HP punya database sendiri; useDevice() menyimpan database HP yang aktif lalu memuat database HP lain.
import { freshDb, cat as cat1, tx as tx1, rows, count } from './helpers/db';
import * as sqlite from './helpers/expo-sqlite';
import { bid, db, initDb, setMeta, meta, findCategory, deleteCategory, deleteBook, addBook, migrate, renameCategory } from '../lib/db';
import { saveGoogleProfile } from '../lib/auth';
import { makeSync, K } from '../lib/driveSync';
import { DriveError } from '../lib/drive';
import { deleteTransaction, restoreTransaction, saveRecurring, processRecurring, occurrenceUid } from '../lib/recurring';

// Google Drive tiruan (satu file sinkron) yang dipakai bersama kedua HP
function fakeDrive() {
  let clock = 0; const files = []; const calls = [];
  const stamp = () => new Date(Date.UTC(2026, 10, 12, 8, 0, ++clock)).toISOString();
  return {
    files, calls,
    async list() { calls.push('list'); return [...files].sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1)).map(({ text, ...f }) => f); },
    async info(id) { calls.push('info'); const f = files.find(x => x.id === id); if (!f) throw new DriveError('hilang', 'notfound', 404); const { text, ...r } = f; return r; },
    async download(id) { calls.push('download'); return files.find(x => x.id === id).text; },
    async saveSync(text, props, knownId) {
      calls.push('saveSync');
      let f = (knownId && files.find(x => x.id === knownId)) || files.find(x => x.kind === 'sync');
      if (f) { f.text = text; f.modifiedTime = stamp(); return { file: { id: f.id, modifiedTime: f.modifiedTime }, created: false }; }
      f = { id: 'f1', name: 'sync.json', kind: 'sync', text, modifiedTime: stamp(), ...props }; files.push(f);
      return { file: { id: f.id, modifiedTime: f.modifiedTime }, created: true };
    },
  };
}

// Di HP yang memulihkan dari Drive, id buku kas bukan 1: isi selalu ke buku kas aktif kecuali disebut
const cat = (j, n, a = 0, b = bid()) => cat1(j, n, a, b);
const tx = (d, j, k, n, ket = '', b = bid()) => tx1(d, j, k, n, ket, b);
const wait = ms => new Promise(r => setTimeout(r, ms)); // upd memakai jam (ms): beri jeda agar "lebih baru" pasti lebih besar
let drive, sync, saved, current;
const login = () => { saveGoogleProfile({ googleId: 'g1', nama: 'Yuda', email: 'y@x.id', foto: '' }); setMeta('drive.scope', 1); };

// Pindah ke HP lain. HP baru: database kosong, sudah masuk akun yang sama, lalu menyamakan diri dengan Drive lewat login().
async function useDevice(name) {
  if (current) saved[current] = sqlite.__export();
  current = name;
  if (saved[name]) { sqlite.__import(saved[name]); initDb(); return; }
  freshDb(); login();
  await sync.login({ ask: () => Promise.resolve('merge') });
}
const txs = () => rows('SELECT ket, nominal FROM transactions ORDER BY ket').map(r => `${r.ket}:${r.nominal}`);
const remoteCheck = () => sync.auto({ remote: true }); // dipanggil saat aplikasi dibuka / kembali aktif

beforeEach(async () => {
  drive = fakeDrive(); saved = {}; current = null;
  sync = makeSync({ ui: drive, bg: drive, now: () => new Date(2026, 10, 12, 9, 0, 0) });
  await useDevice('A');
  cat('Biaya', 'Makanan', 900000); cat('Pendapatan', 'Gaji', 5000000);
  tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000, 'gaji'); tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'nasi');
  expect((await sync.auto()).status).toBe('ok'); // A mengunggah lebih dulu
  await useDevice('B'); // B kosong -> memulihkan dari Drive
  expect(txs()).toEqual(['gaji:5000000', 'nasi:25000']);
});

describe('migrasi v5: uid, waktu ubah, catatan hapus', () => {
  test('INSERT mendapat uid unik & upd; UPDATE menaikkan upd; DELETE membuat catatan hapus', async () => {
    const id = tx('2026-11-03', 'Biaya', 'Makanan', 1, 'a');
    const r0 = rows('SELECT uid, upd FROM transactions WHERE id=?', [id])[0];
    expect(r0.uid).toMatch(/^[0-9a-f]{32}$/); expect(r0.upd).toBeGreaterThan(0);
    expect(new Set(rows('SELECT uid FROM transactions').map(r => r.uid)).size).toBe(count('transactions'));
    db.runSync('UPDATE transactions SET nominal=2 WHERE id=?', [id]);
    expect(rows('SELECT upd FROM transactions WHERE id=?', [id])[0].upd).toBeGreaterThan(r0.upd);
    db.runSync('DELETE FROM transactions WHERE id=?', [id]);
    expect(rows("SELECT tbl FROM deleted WHERE uid=?", [r0.uid])).toEqual([{ tbl: 'transactions' }]);
  });
  test('database lama (v4) diberi uid acak & upd 0; aman dijalankan ulang', () => {
    freshDb(); cat('Biaya', 'Makanan'); tx('2026-11-01', 'Biaya', 'Makanan', 1, 'x');
    db.getAllSync("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'trg_uid_%' OR name LIKE 'trg_upd_%' OR name LIKE 'trg_tomb_%')").forEach(t => db.execSync(`DROP TRIGGER ${t.name}`));
    db.execSync('UPDATE transactions SET uid=NULL, upd=NULL; UPDATE categories SET uid=NULL, upd=NULL; PRAGMA user_version = 4');
    migrate(); migrate();
    expect(rows('SELECT uid, upd FROM transactions')[0]).toMatchObject({ upd: 0, uid: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(db.getFirstSync('PRAGMA user_version').user_version).toBe(5);
  });
});

describe('dua HP: perubahan saling sampai tanpa dialog dan tanpa dobel', () => {
  test('B menambah -> A menerima saat dibuka; tidak diunggah ulang (tidak ada unggah bolak-balik)', async () => {
    tx('2026-11-05', 'Biaya', 'Makanan', 15000, 'dari B'); expect((await sync.auto()).status).toBe('ok');
    await useDevice('A'); drive.calls.length = 0;
    const r = await remoteCheck(); expect(r).toMatchObject({ status: 'ok', action: 'merge', pushed: false });
    expect(txs()).toEqual(['dari B:15000', 'gaji:5000000', 'nasi:25000']);
    expect(drive.calls).not.toContain('saveSync');
    expect((await remoteCheck()).status).toBe('same'); // sudah sama: cukup 1 panggilan info
    await useDevice('B'); expect((await remoteCheck()).status).toBe('same');
  });
  test('kedua HP menambah bersamaan: digabung otomatis, kedua HP berakhir sama', async () => {
    await useDevice('A'); tx('2026-11-06', 'Biaya', 'Makanan', 1000, 'A baru'); expect((await sync.auto()).status).toBe('ok');
    await useDevice('B'); tx('2026-11-06', 'Biaya', 'Makanan', 2000, 'B baru');
    const r = await sync.auto(); expect(r).toMatchObject({ status: 'ok', action: 'merge', pushed: true }); // Drive berubah -> gabung -> unggah
    const want = ['A baru:1000', 'B baru:2000', 'gaji:5000000', 'nasi:25000'];
    expect(txs()).toEqual(want);
    await useDevice('A'); await remoteCheck(); expect(txs()).toEqual(want);
    expect(meta(K.conflict) || '').toBe('');
  });
  test('transaksi yang DIEDIT tidak menjadi dobel; edit terakhir yang menang', async () => {
    await useDevice('A'); db.runSync("UPDATE transactions SET nominal=30000 WHERE ket='nasi'"); await sync.auto();
    await wait(5);
    await useDevice('B'); await remoteCheck(); expect(txs()).toEqual(['gaji:5000000', 'nasi:30000']);
    await wait(5); db.runSync("UPDATE transactions SET nominal=35000 WHERE ket='nasi'"); await sync.auto();
    await useDevice('A'); await remoteCheck(); expect(txs()).toEqual(['gaji:5000000', 'nasi:35000']);
  });
  test('edit bersamaan pada transaksi yang sama: yang diubah paling akhir menang di kedua HP', async () => {
    await useDevice('A'); db.runSync("UPDATE transactions SET nominal=111 WHERE ket='nasi'");
    await wait(5);
    await useDevice('B'); db.runSync("UPDATE transactions SET nominal=222 WHERE ket='nasi'"); // lebih akhir
    await useDevice('A'); await sync.auto();
    await useDevice('B'); await sync.auto(); expect(txs()).toContain('nasi:222');
    await useDevice('A'); await remoteCheck(); expect(txs()).toContain('nasi:222'); expect(count('transactions')).toBe(2);
  });
  test('yang DIHAPUS di satu HP ikut terhapus di HP lain dan tidak muncul lagi', async () => {
    const id = rows("SELECT id FROM transactions WHERE ket='nasi'")[0].id;
    deleteTransaction(id); await sync.auto();
    await useDevice('A'); tx('2026-11-07', 'Biaya', 'Makanan', 5, 'A lain'); // A juga punya perubahan sendiri
    const r = await sync.auto(); expect(r.res.hapus).toBe(1);
    expect(txs()).toEqual(['A lain:5', 'gaji:5000000']);
    await useDevice('B'); await remoteCheck(); expect(txs()).toEqual(['A lain:5', 'gaji:5000000']); // tidak bangkit lagi
  });
  test('dihapus di A, tapi diedit di B SETELAH itu: editnya menang (tidak hilang)', async () => {
    await useDevice('A'); deleteTransaction(rows("SELECT id FROM transactions WHERE ket='nasi'")[0].id); await sync.auto();
    await wait(5);
    await useDevice('B'); db.runSync("UPDATE transactions SET nominal=99 WHERE ket='nasi'"); await sync.auto();
    expect(txs()).toContain('nasi:99');
    await useDevice('A'); await remoteCheck(); expect(txs()).toContain('nasi:99');
  });
  test('Urungkan hapus setelah penghapusannya sempat tersinkron: transaksi kembali di kedua HP', async () => {
    const snap = deleteTransaction(rows("SELECT id FROM transactions WHERE ket='nasi'")[0].id); await sync.auto();
    await useDevice('A'); await remoteCheck(); expect(txs()).toEqual(['gaji:5000000']);
    await wait(5);
    await useDevice('B'); expect(restoreTransaction(snap)).toBe(true); await sync.auto();
    await useDevice('A'); await remoteCheck(); expect(txs()).toEqual(['gaji:5000000', 'nasi:25000']);
  });
  test('anggaran: yang diubah terakhir menang; anggaran lama di HP lain TIDAK menimpa', async () => {
    await wait(5);
    db.runSync("UPDATE categories SET anggaran=1200000 WHERE nama='Makanan'"); await sync.auto();
    await useDevice('A'); tx('2026-11-08', 'Biaya', 'Makanan', 7, 'A'); await sync.auto(); // A tidak mengubah anggaran
    expect(findCategory('Biaya', 'Makanan').anggaran).toBe(1200000);
    await useDevice('B'); await remoteCheck(); expect(findCategory('Biaya', 'Makanan').anggaran).toBe(1200000);
  });
  test('ganti nama kategori sampai ke HP lain, termasuk nama di transaksinya', async () => {
    await wait(5);
    expect(renameCategory(findCategory('Biaya', 'Makanan').id, 'Makan Siang')).toBe('ok'); await sync.auto();
    await useDevice('A'); await remoteCheck();
    expect(findCategory('Biaya', 'Makan Siang')).toBeTruthy(); expect(findCategory('Biaya', 'Makanan')).toBeFalsy();
    expect(rows("SELECT kategori FROM transactions WHERE ket='nasi'")[0].kategori).toBe('Makan Siang');
  });
  test('kategori dihapus (transaksi dipertahankan) di B -> di A kategori hilang, transaksinya tanpa kategori', async () => {
    deleteCategory(findCategory('Biaya', 'Makanan').id, false); await sync.auto();
    await useDevice('A'); await remoteCheck();
    expect(findCategory('Biaya', 'Makanan')).toBeFalsy();
    expect(rows("SELECT category_id FROM transactions WHERE ket='nasi'")[0].category_id).toBeNull();
  });
  test('buku kas dihapus di satu HP -> terhapus juga di HP lain', async () => {
    const b2 = addBook('Kas Emas', 'lainnya'); cat('Investasi/Tabungan', 'Emas', 0, b2); tx('2026-11-03', 'Investasi/Tabungan', 'Emas', 50000, 'emas', b2); await sync.auto();
    await useDevice('A'); await remoteCheck(); expect(count('books')).toBe(2);
    await wait(5); deleteBook(rows("SELECT id FROM books WHERE nama='Kas Emas'")[0].id); await sync.auto();
    await useDevice('B'); await remoteCheck(); expect(count('books')).toBe(1); expect(count('transactions', "ket='emas'")).toBe(0);
  });
  test('transaksi berulang dicatat di KEDUA HP sebelum sinkron: hanya satu transaksi', async () => {
    const c = findCategory('Biaya', 'Makanan').id;
    saveRecurring({ catId: c, nominal: 100000, ket: 'kos', hari: 1, mulai: '2026-11', ingat: 3, otomatis: true }); await sync.auto();
    await useDevice('A'); await remoteCheck(); // templat sampai di A
    const now = new Date(2026, 11, 5); // Desember: kedua HP mencatat bulan Desember sendiri-sendiri
    expect(processRecurring(now)).toBeGreaterThan(0); await sync.auto();
    await useDevice('B'); expect(processRecurring(now)).toBeGreaterThan(0); await sync.auto();
    expect(count('transactions', "ket='kos' AND tanggal='2026-12-01'")).toBe(1);
    await useDevice('A'); await remoteCheck(); expect(count('transactions', "ket='kos' AND tanggal='2026-12-01'")).toBe(1);
    const rec = rows("SELECT * FROM recurring WHERE ket='kos'")[0];
    expect(rows("SELECT uid FROM transactions WHERE ket='kos' AND tanggal='2026-12-01'")[0].uid).toBe(occurrenceUid(rec, '2026-12'));
  });
});

describe('dua HP yang dipasangkan pertama kali (keduanya sudah berisi data yang sama)', () => {
  // uid di HP baru sengaja dibuat lebih kecil / lebih besar dari uid di Drive (uid acak tidak boleh menentukan hasilnya)
  test.each([['00000000'], ['ffffffff']])('gabung saat masuk (uid HP baru diawali %s): tidak dobel, uid disamakan, edit berikutnya sampai tanpa dobel', async pre => {
    // HP C: diisi sendiri (mis. dari import CSV yang sama) -> uid berbeda dengan Drive
    await useDevice('A');
    saved.C = (() => { const keep = sqlite.__export(); freshDb(); login();
      cat('Biaya', 'Makanan', 900000); cat('Pendapatan', 'Gaji', 5000000);
      tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000, 'gaji'); tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'nasi');
      ['books', 'categories', 'transactions'].forEach(tb => db.runSync(`UPDATE ${tb} SET uid = ? || substr(uid, 9)`, [pre]));
      const c = sqlite.__export(); sqlite.__import(keep); initDb(); return c; })();
    await useDevice('C');
    const r = await sync.login({ ask: () => Promise.resolve('merge') }); expect(r.action).toBe('merge');
    expect(txs()).toEqual(['gaji:5000000', 'nasi:25000']); // tidak dobel
    await sync.auto();
    await wait(5); db.runSync("UPDATE transactions SET nominal=26000 WHERE ket='nasi'"); await sync.auto();
    await useDevice('A'); await remoteCheck(); expect(txs()).toEqual(['gaji:5000000', 'nasi:26000']); // cocok lewat uid, bukan baris baru
    await wait(5); db.runSync("UPDATE transactions SET nominal=27000 WHERE ket='nasi'"); await sync.auto(); // dan sebaliknya
    await useDevice('C'); await remoteCheck(); expect(txs()).toEqual(['gaji:5000000', 'nasi:27000']);
  });
});
