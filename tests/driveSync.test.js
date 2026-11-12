import { freshDb, cat, tx, rows, count } from './helpers/db';
import * as fsMock from './helpers/expo-file-system';
import { db, meta, setMeta, isLocalEmpty, resetAllData, updateBook, addBook, bid } from '../lib/db';
import { saveGoogleProfile } from '../lib/auth';
import { buildSnapshot, clearAutoBackups } from '../lib/backup';
import { makeSync, dataFingerprint, AUTO_PER_DAY, K } from '../lib/driveSync';
import { DriveError } from '../lib/drive';

// Google Drive tiruan di memori: daftar file, unduh, dan simpan-sinkron (menimpa file sinkron yang sudah ada).
function fakeDrive() {
  let clock = 0; const files = []; const calls = [];
  const stamp = () => new Date(Date.UTC(2026, 10, 12, 8, 0, ++clock)).toISOString();
  const d = {
    files, calls, failNext: null,
    async list() { calls.push('list'); return [...files].sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1)).map(({ text, ...f }) => f); },
    async download(id) { calls.push('download'); const f = files.find(x => x.id === id); if (!f) throw new DriveError('hilang', 'notfound', 404); return f.text; },
    async saveSync(text, props, knownId) {
      calls.push('saveSync:' + (knownId || '-'));
      if (d.failNext) { const e = d.failNext; d.failNext = null; throw e; }
      let f = knownId && files.find(x => x.id === knownId); if (!f) f = files.find(x => x.kind === 'sync');
      if (f) { f.text = text; f.modifiedTime = stamp(); Object.assign(f, props); return { file: { id: f.id, modifiedTime: f.modifiedTime }, created: false }; }
      f = { id: 'f' + (files.length + 1), name: 'BudgetPlanner_Sinkron_Otomatis.json', kind: 'sync', createdTime: stamp(), modifiedTime: '', text, size: text.length, ...props }; f.modifiedTime = f.createdTime; files.push(f);
      return { file: { id: f.id, modifiedTime: f.modifiedTime }, created: true };
    },
    addBackup(text, props = {}) { const t = stamp(); files.push({ id: 'f' + (files.length + 1), name: 'BudgetPlanner_Backup.json', kind: 'backup', createdTime: t, modifiedTime: t, text, size: text.length, ...props }); },
  };
  return d;
}

let drive, sync, clock;
const login = () => { saveGoogleProfile({ googleId: 'g1', nama: 'Yuda', email: 'y@x.id', foto: '' }); setMeta('drive.scope', 1); };
const mk = () => { drive = fakeDrive(); clock = new Date(2026, 10, 12, 9, 0, 0); sync = makeSync({ ui: drive, bg: drive, now: () => clock }); };
const isoOf = () => JSON.stringify(buildSnapshot('all'));
const seedA = () => { cat('Pendapatan', 'Gaji', 5000000); cat('Biaya', 'Makanan', 900000); tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000, 'Gaji'); tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'Nasi'); };
const names = () => rows('SELECT jenis,nama FROM categories ORDER BY jenis,nama').map(r => r.nama);

beforeEach(() => { freshDb(); mk(); });

describe('dataFingerprint', () => {
  test('sama untuk data sama, berubah bila isi berubah, tidak terpengaruh buku aktif / waktu', () => {
    seedA(); const a = dataFingerprint();
    expect(dataFingerprint()).toBe(a);
    const b2 = addBook('Usaha', 'proyek'); const f2 = dataFingerprint(); expect(f2).not.toBe(a);
    require('../lib/db').setActiveBook(b2); expect(dataFingerprint()).toBe(f2);
    tx('2026-11-03', 'Biaya', 'Makanan', 1000, 'x'); expect(dataFingerprint()).not.toBe(f2);
  });
});

describe('sinkron otomatis', () => {
  test('belum masuk -> off; masuk tanpa izin Drive -> noscope; tidak ada panggilan jaringan', async () => {
    seedA();
    expect((await sync.auto()).status).toBe('off');
    saveGoogleProfile({ googleId: 'g1', nama: 'Y', email: 'y@x.id', foto: '' });
    expect((await sync.auto()).status).toBe('noscope');
    expect(drive.calls).toEqual([]);
  });
  test('perubahan -> diunggah ke SATU file; tanpa perubahan -> same; id diingat (1 panggilan per sinkron)', async () => {
    login(); seedA();
    const r1 = await sync.auto(); expect(r1.status).toBe('ok'); expect(r1.created).toBe(true);
    expect(drive.files).toHaveLength(1); expect(drive.files[0].kind).toBe('sync');
    expect(JSON.parse(drive.files[0].text).books[0].transaksi).toHaveLength(2);
    expect((await sync.auto()).status).toBe('same'); expect(drive.calls).toEqual(['saveSync:-']);
    tx('2026-11-04', 'Biaya', 'Makanan', 5000, 'Bakso');
    const r2 = await sync.auto(); expect(r2.status).toBe('ok'); expect(r2.created).toBe(false);
    expect(drive.files).toHaveLength(1); expect(drive.calls.slice(-1)).toEqual(['saveSync:f1']);
    expect(JSON.parse(drive.files[0].text).books[0].transaksi).toHaveLength(3);
    expect(sync.status().pending).toBe(false); expect(sync.status().last).toBeTruthy();
  });
  test('data kosong tidak pernah diunggah otomatis (tidak menimpa Drive dengan kosong)', async () => {
    login(); seedA(); await sync.auto();
    const before = drive.files[0].text;
    db.runSync('DELETE FROM transactions'); db.runSync('DELETE FROM categories');
    expect(isLocalEmpty()).toBe(true);
    expect((await sync.auto()).status).toBe('empty');
    expect(drive.files[0].text).toBe(before);
  });
  test(`batas ${AUTO_PER_DAY} sinkron otomatis per hari; hari berikutnya jatah kembali`, async () => {
    login(); seedA();
    for (let i = 0; i < AUTO_PER_DAY; i++) { tx('2026-11-05', 'Biaya', 'Makanan', 1000 + i, 'n' + i); expect((await sync.auto()).status).toBe('ok'); }
    tx('2026-11-06', 'Biaya', 'Makanan', 7, 'lebih'); expect((await sync.auto()).status).toBe('cap');
    expect(sync.status().pending).toBe(true);
    clock = new Date(2026, 10, 13, 9, 0, 0); expect((await sync.auto()).status).toBe('ok');
  });
  test('gagal: status error + pesan tersimpan, data tetap menunggu; berikutnya berhasil menghapus pesan', async () => {
    login(); seedA(); drive.failNext = new DriveError('Tidak ada koneksi internet.', 'network');
    const r = await sync.auto(); expect(r.status).toBe('error');
    expect(sync.status().error).toMatch(/koneksi/); expect(sync.status().pending).toBe(true); expect(drive.files).toHaveLength(0);
    expect((await sync.auto()).status).toBe('ok'); expect(sync.status().error).toBe('');
  });
  test('file sinkron dihapus dari Drive (404): memakai file baru lewat saveSync tanpa melempar', async () => {
    login(); seedA(); await sync.auto();
    drive.files.length = 0; setMeta(K.hash, '');
    // saveSync tiruan: id tak ditemukan -> membuat baru
    expect((await sync.auto()).status).toBe('ok'); expect(drive.files).toHaveLength(1);
  });
});

describe('masuk (login) menyamakan HP dengan Drive', () => {
  test('Drive kosong + HP kosong -> tidak ada yang terjadi', async () => {
    login(); expect((await sync.login({ ask: jest.fn() })).action).toBe('none'); expect(drive.files).toHaveLength(0);
  });
  test('Drive kosong + HP berisi -> data HP diunggah sebagai sinkron pertama', async () => {
    login(); seedA();
    const r = await sync.login({ ask: jest.fn() }); expect(r.action).toBe('push'); expect(drive.files).toHaveLength(1);
  });
  test('HP kosong + Drive berisi -> dipulihkan otomatis tanpa bertanya, dan tidak langsung diunggah ulang', async () => {
    seedA(); drive.addBackup(isoOf(), { buku: 1, tx: 2 }); const want = dataFingerprint();
    freshDb(); login(); const ask = jest.fn();
    const r = await sync.login({ ask });
    expect(r.action).toBe('pull'); expect(ask).not.toHaveBeenCalled();
    expect(dataFingerprint()).toBe(want); expect(count('transactions')).toBe(2);
    expect((await sync.auto()).status).toBe('same');
  });
  test('HP kosong + Drive punya file sinkron dan cadangan lama: yang terbaru dipakai, id sinkron diingat', async () => {
    seedA(); drive.addBackup(isoOf(), { buku: 1, tx: 2 }); tx('2026-11-09', 'Biaya', 'Makanan', 9000, 'baru');
    await (async () => { login(); await sync.auto(); })(); const want = dataFingerprint();
    freshDb(); login(); mk2(drive);
    const r = await sync.login({ ask: jest.fn() }); expect(r.action).toBe('pull');
    expect(dataFingerprint()).toBe(want); expect(meta(K.id)).toBe(drive.files.find(f => f.kind === 'sync').id);
  });
  test.each([['merge', 'merge'], ['replace', 'pull']])('HP & Drive sama-sama berisi, pilihan %s', async (choice, action) => {
    seedA(); drive.addBackup(isoOf(), { buku: 1, tx: 2 });
    freshDb(); login(); cat('Biaya', 'Kopi', 1); tx('2026-11-10', 'Biaya', 'Kopi', 18000, 'kopi');
    const ask = jest.fn(() => Promise.resolve(choice));
    const r = await sync.login({ ask }); expect(ask).toHaveBeenCalledTimes(1); expect(r.action).toBe(action);
    if (choice === 'merge') { expect(names()).toEqual(expect.arrayContaining(['Kopi', 'Makanan', 'Gaji'])); expect(sync.status().pending).toBe(true); }
    else { expect(names()).not.toContain('Kopi'); expect(count('transactions')).toBe(2); expect(fsMock.__store.size).toBeGreaterThan(0); /* salinan otomatis data HP lama */ }
  });
  test("pilihan 'local' -> data HP menimpa Drive", async () => {
    seedA(); drive.addBackup(isoOf(), { buku: 1, tx: 2 });
    freshDb(); login(); cat('Biaya', 'Kopi', 1);
    const r = await sync.login({ ask: () => Promise.resolve('local') }); expect(r.action).toBe('push');
    expect(JSON.parse(drive.files.find(f => f.kind === 'sync').text).books[0].kategori.map(k => k.nama)).toEqual(['Kopi']);
  });
  test('dibatalkan -> tidak ada perubahan di HP maupun Drive', async () => {
    seedA(); drive.addBackup(isoOf(), { buku: 1, tx: 2 });
    freshDb(); login(); cat('Biaya', 'Kopi', 1); const fp = dataFingerprint(); const n = drive.files.length;
    expect((await sync.login({ ask: () => Promise.resolve(null) })).action).toBe('cancel');
    expect(dataFingerprint()).toBe(fp); expect(drive.files).toHaveLength(n);
  });
  test('Hubungkan ulang akun sama, file Drive tidak berubah sejak sinkron terakhir: HP dipakai tanpa bertanya', async () => {
    login(); seedA(); await sync.auto();
    cat('Biaya', 'Kopi', 1); const ask = jest.fn();
    const r = await sync.login({ ask, sameAccount: true }); expect(r.action).toBe('push'); expect(ask).not.toHaveBeenCalled();
    expect(JSON.parse(drive.files[0].text).books[0].kategori.map(k => k.nama)).toContain('Kopi');
  });
  test('Hubungkan ulang tapi Drive berubah dari HP lain: tetap bertanya', async () => {
    login(); seedA(); await sync.auto();
    drive.files[0].modifiedTime = '2026-11-12T23:00:00.000Z'; const ask = jest.fn(() => Promise.resolve('merge'));
    await sync.login({ ask, sameAccount: true }); expect(ask).toHaveBeenCalled();
  });
  test.each([['teks biasa', 'bukan json {{{', /bukan cadangan/], ['JSON rusak', '{"format": "budgetplanner-backup", ', /JSON rusak|bukan hasil Export/], ['JSON lain', '{"a":1}', /Bukan file backup/]])('file di Drive tidak valid (%s): error dilempar dan data HP utuh', async (_n, text, re) => {
    drive.addBackup(text); login(); seedA(); const fp = dataFingerprint();
    await expect(sync.login({ ask: () => Promise.resolve('replace') })).rejects.toThrow(re);
    expect(dataFingerprint()).toBe(fp); expect(count('transactions')).toBe(2);
  });
});

describe('keluar akun', () => {
  test('ada perubahan belum terunggah -> diunggah dulu, lalu ok', async () => {
    login(); seedA(); const r = await sync.beforeLogout();
    expect(r).toEqual({ ok: true, pushed: true }); expect(drive.files).toHaveLength(1);
  });
  test('sudah tersinkron atau data kosong -> ok tanpa panggilan jaringan', async () => {
    login(); expect(await sync.beforeLogout()).toEqual({ ok: true, pushed: false });
    seedA(); await sync.auto(); drive.calls.length = 0;
    expect(await sync.beforeLogout()).toEqual({ ok: true, pushed: false }); expect(drive.calls).toEqual([]);
  });
  test('unggah gagal -> ok:false beserta errornya (aplikasi menampilkan peringatan sebelum menghapus)', async () => {
    login(); seedA(); drive.failNext = new DriveError('Izin Google sudah kedaluwarsa.', 'auth', 401);
    const r = await sync.beforeLogout(); expect(r.ok).toBe(false); expect(r.error.message).toMatch(/kedaluwarsa/);
  });
});

describe('alur lengkap: masuk -> catat -> keluar -> masuk lagi', () => {
  test('setelah keluar HP kosong; masuk lagi mengembalikan semua data dari Drive', async () => {
    login(); seedA(); const b2 = addBook('Usaha', 'proyek'); cat('Biaya', 'Bahan', 100, b2); tx('2026-11-06', 'Biaya', 'Bahan', 150000, 'Kain', b2);
    const want = dataFingerprint(); const items = count('transactions');
    expect((await sync.beforeLogout()).ok).toBe(true);
    resetAllData(); clearAutoBackups();
    expect(isLocalEmpty()).toBe(true); expect(count('transactions')).toBe(0); expect(meta('profile.mode')).toBeNull(); expect(meta(K.hash)).toBeNull();
    // masuk lagi (akun sama)
    login(); const ask = jest.fn();
    const r = await sync.login({ ask }); expect(r.action).toBe('pull'); expect(ask).not.toHaveBeenCalled();
    expect(dataFingerprint()).toBe(want); expect(count('transactions')).toBe(items); expect(bid()).toBeGreaterThan(0);
  });
  test('keluar tanpa perubahan baru tidak membuat file kedua di Drive', async () => {
    login(); seedA(); await sync.auto(); await sync.beforeLogout();
    expect(drive.files.filter(f => f.kind === 'sync')).toHaveLength(1);
  });
});

// Memakai instance Drive yang sama dengan file yang sudah ada (setelah freshDb mereset meta, id sinkron tidak diingat)
function mk2(d) { clock = new Date(2026, 10, 12, 9, 0, 0); sync = makeSync({ ui: d, bg: d, now: () => clock }); }
