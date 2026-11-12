import { makeDrive } from './drive';
import { getDriveToken, getDriveTokenSilent, clearDriveToken, forgetDriveScope, hasDriveScope } from './googleAuth';
import { buildSnapshot, inspectImport, runImport } from './backup';
import { meta, setMeta, isLocalEmpty } from './db';
import { getProfile } from './auth';

// ===== Sinkron otomatis ke Google Drive (satu file, ditimpa di tempat) =====
// Aturan inti:
//  - Hanya saat sudah masuk dengan Google DAN izin Drive sudah diberikan (diminta sekali, saat masuk).
//  - Hanya bila isi data benar-benar berubah sejak sinkron terakhir (sidik jari isi data, bukan id database).
//  - Snapshot KOSONG tidak pernah diunggah otomatis, supaya data di Drive tidak tertimpa kosong tanpa sengaja.
//    (Tombol "Sinkronkan sekarang" dan Keluar akun tetap memakai aturan sendiri.)
//  - Paling banyak AUTO_PER_DAY sinkron otomatis per hari, menyisakan jatah untuk cadangan manual dalam batas ±100 panggilan/hari.
// Semua kunci status memakai awalan "drive." sehingga ikut terhapus saat keluar akun.

export const AUTO_PER_DAY = 60;
export const K = { hash: 'drive.sync.hash', id: 'drive.sync.id', mod: 'drive.sync.mod', last: 'drive.sync.last', err: 'drive.sync.err', day: 'drive.sync.day' };

// FNV-1a 32 bit + panjang teks. Cukup untuk mendeteksi "ada perubahan"; tabrakan hanya menunda satu sinkron.
function hashText(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(16)}:${str.length}`;
}

// Sidik jari isi data semua buku kas. Tidak memuat id database, waktu ekspor, maupun penanda buku aktif.
export function dataFingerprint() {
  const snap = buildSnapshot('all');
  return hashText(JSON.stringify(snap.books.map(({ aktif, ...b }) => b)));
}

const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = e => String((e && e.message) || e || 'Kesalahan tidak diketahui').split('\n')[0].slice(0, 160);

export function makeSync({ ui, bg, now = () => new Date() }) {
  // ui = Drive dengan token interaktif (boleh memunculkan jendela izin; untuk tindakan yang dipicu pengguna)
  // bg = Drive dengan token senyap (latar belakang; tidak pernah memunculkan jendela)
  let running = null;

  const usedToday = () => { const [d, n] = String(meta(K.day) || '').split(':'); return d === dayKey(now()) ? Number(n) || 0 : 0; };
  const countAuto = () => setMeta(K.day, `${dayKey(now())}:${usedToday() + 1}`);

  const infoOf = snap => ({ buku: snap.books.length, tx: snap.books.reduce((a, b) => a + b.transaksi.length, 0) });

  // Unggah snapshot sekarang. Melempar error bila gagal (pemanggil memutuskan cara menampilkannya).
  async function push(drive) {
    const snap = buildSnapshot('all');
    const fp = dataFingerprint();
    const r = await drive.saveSync(JSON.stringify(snap), infoOf(snap), meta(K.id));
    setMeta(K.id, r.file.id); setMeta(K.mod, r.file.modifiedTime || '');
    setMeta(K.hash, fp); setMeta(K.last, now().toISOString()); setMeta(K.err, '');
    return { info: infoOf(snap), created: r.created };
  }

  // Sinkron otomatis (dipanggil timer / saat aplikasi ke latar belakang). Tidak pernah melempar error.
  // Hasil: { status: 'off'|'noscope'|'same'|'empty'|'cap'|'busy'|'ok'|'error', ... }
  async function auto() {
    if (running) return { status: 'busy' };
    if (!getProfile()) return { status: 'off' };
    if (!hasDriveScope()) return { status: 'noscope' };
    if (dataFingerprint() === meta(K.hash)) return { status: 'same' };
    if (isLocalEmpty()) return { status: 'empty' };
    if (usedToday() >= AUTO_PER_DAY) return { status: 'cap' };
    countAuto();
    running = push(bg);
    try { const r = await running; return { status: 'ok', ...r }; }
    catch (e) { setMeta(K.err, short(e)); return { status: 'error', error: e }; }
    finally { running = null; }
  }

  // Sinkron paksa (tombol "Sinkronkan sekarang"): tetap mengunggah walau datanya kosong atau tidak berubah. Melempar error bila gagal.
  async function syncNow() {
    if (!getProfile()) throw new Error('Masuk dengan Google dulu.');
    if (running) { await running.catch(() => {}); }
    running = push(ui);
    try { return await running; }
    catch (e) { setMeta(K.err, short(e)); throw e; }
    finally { running = null; }
  }

  // Dipanggil tepat setelah masuk (atau Hubungkan ulang). Menyamakan HP dengan Drive:
  //  - Drive belum punya cadangan   -> data HP (bila ada) diunggah sebagai sinkron pertama.
  //  - HP masih kosong              -> data terbaru di Drive dipulihkan (ganti semua).
  //  - HP berisi data & Drive juga  -> ask(remote) memilih: 'replace' | 'merge' | 'local' (null = batal),
  //    kecuali akun sama dan file di Drive tidak berubah sejak sinkron terakhir: data HP dipakai tanpa bertanya.
  // Hasil: { action: 'none'|'push'|'pull'|'merge'|'cancel', ... }. Melempar error bila jaringan/Drive gagal; data HP tidak disentuh sebelum file Drive berhasil dibaca & divalidasi.
  async function login({ ask, sameAccount = false } = {}) {
    const items = await ui.list();
    const remote = items[0] || null;
    const empty = isLocalEmpty();
    if (!remote) {
      if (empty) return { action: 'none' };
      const r = await push(ui); return { action: 'push', ...r };
    }
    let mode = 'replace';
    if (!empty) {
      const unchanged = sameAccount && remote.kind === 'sync' && remote.id === meta(K.id) && !!remote.modifiedTime && remote.modifiedTime === meta(K.mod);
      mode = unchanged ? 'local' : await ask(remote, items);
      if (!mode) return { action: 'cancel' };
    }
    if (mode === 'local') { const r = await push(ui); return { action: 'push', ...r }; }
    const text = await ui.download(remote.id);
    if (!/^[\s\uFEFF]*\{/.test(text)) throw new Error('File di Google Drive bukan cadangan Budget Planner yang valid.'); // Drive hanya berisi JSON; CSV/teks lain ditolak
    const ins = inspectImport(text); // memvalidasi dulu; error di sini = data HP utuh
    const out = await runImport(ins, mode === 'replace');
    if (remote.kind === 'sync') { setMeta(K.id, remote.id); setMeta(K.mod, remote.modifiedTime || ''); }
    setMeta(K.last, now().toISOString()); setMeta(K.err, '');
    // Ganti semua: HP sama dengan Drive, tidak perlu unggah lagi. Gabung: hasil gabungan harus naik ke Drive pada sinkron berikutnya.
    setMeta(K.hash, mode === 'replace' ? dataFingerprint() : '');
    return { action: mode === 'replace' ? 'pull' : 'merge', info: ins.info, remote, res: out.res };
  }

  // Dipanggil sebelum keluar akun. { ok: true } bila tidak ada yang akan hilang (data kosong / sudah tersinkron / berhasil diunggah);
  // { ok: false, error } bila perubahan terakhir gagal diunggah.
  async function beforeLogout() {
    if (isLocalEmpty() || dataFingerprint() === meta(K.hash)) return { ok: true, pushed: false };
    try { await syncNow(); return { ok: true, pushed: true }; }
    catch (e) { return { ok: false, error: e }; }
  }

  function status() {
    const profile = getProfile();
    let pending = false;
    if (profile) { try { pending = !isLocalEmpty() && dataFingerprint() !== meta(K.hash); } catch (e) { pending = false; } }
    return { last: meta(K.last) || null, error: meta(K.err) || '', pending, usedToday: usedToday(), cap: AUTO_PER_DAY };
  }

  return { auto, syncNow, login, beforeLogout, status, push };
}

const real = makeSync({
  ui: makeDrive({ getToken: getDriveToken, clearToken: clearDriveToken, onScopeMissing: forgetDriveScope }),
  bg: makeDrive({ getToken: getDriveTokenSilent, clearToken: clearDriveToken, onScopeMissing: forgetDriveScope }),
});
export const autoSync = real.auto;
export const syncNow = real.syncNow;
export const loginSync = real.login;
export const beforeLogout = real.beforeLogout;
export const syncStatus = real.status;
