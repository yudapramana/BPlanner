import { makeDrive } from './drive';
import { getDriveToken, getDriveTokenSilent, clearDriveToken, forgetDriveScope, hasDriveScope } from './googleAuth';
import { buildSnapshot, inspectImport, runImport } from './backup';
import { meta, setMeta, isLocalEmpty, dataRev } from './db';
import { getProfile } from './auth';

// ===== Sinkron otomatis ke Google Drive (satu file, ditimpa di tempat) =====
// Aturan inti:
//  - Hanya saat sudah masuk dengan Google DAN izin Drive sudah diberikan (diminta sekali, saat masuk).
//  - Hanya bila data berubah sejak sinkron terakhir. Deteksi memakai angka revisi (meta 'data.rev', dinaikkan trigger database; lihat migrasi v4),
//    jadi memeriksa "ada perubahan?" tidak lagi menserialisasi seluruh database. Snapshot hanya dibuat saat benar-benar mengunggah.
//  - Snapshot KOSONG tidak pernah diunggah otomatis, supaya data di Drive tidak tertimpa kosong tanpa sengaja.
//    (Tombol "Sinkronkan sekarang" dan Keluar akun tetap memakai aturan sendiri.)
//  - Sebelum menimpa file di Drive, modifiedTime-nya dibandingkan dengan yang diingat HP ini (1 panggilan tambahan). Bila beda, file itu diubah
//    perangkat lain: sinkron otomatis berhenti (status 'conflict') dan pengguna memilih lewat "Sinkronkan sekarang" (gabung / pakai Drive / pakai HP).
//  - Paling banyak AUTO_PER_DAY sinkron otomatis per hari (batas buatan sendiri; kuota Drive API jauh lebih longgar).
// Semua kunci status memakai awalan "drive." sehingga ikut terhapus saat keluar akun.

export const AUTO_PER_DAY = 60;
// hash = sidik jari lama (v1.13.0 dan sebelumnya), hanya dibaca sekali pada pemasangan lama lalu dikosongkan; rev = revisi data saat sinkron terakhir.
export const K = { hash: 'drive.sync.hash', rev: 'drive.sync.rev', id: 'drive.sync.id', mod: 'drive.sync.mod', last: 'drive.sync.last', err: 'drive.sync.err', day: 'drive.sync.day', conflict: 'drive.sync.conflict' };

// File di Drive diubah perangkat lain sejak sinkron terakhir HP ini. remote = metadata file di Drive.
export class SyncConflict extends Error {
  constructor(remote) {
    super('File di Google Drive diubah dari perangkat lain sejak sinkron terakhir.\nBuka Profil lalu ketuk Sinkronkan sekarang untuk memilih data mana yang dipakai.');
    this.code = 'CONFLICT'; this.remote = remote;
  }
}

// FNV-1a 32 bit + panjang teks. Dipertahankan hanya untuk pemasangan lama (lihat isPending) dan pengujian.
function hashText(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(16)}:${str.length}`;
}

// Sidik jari isi data semua buku kas. Tidak memuat id database, waktu ekspor, maupun penanda buku aktif. MAHAL (serialisasi penuh): jangan dipakai di jalur rutin.
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

  // Ada perubahan yang belum sampai di Drive? Murah: dua pembacaan meta. Revisi kosong/hilang = belum pernah sinkron atau perlu unggah (mis. setelah gabung).
  // Pemasangan lama (belum punya rev tetapi punya sidik jari lama): dibandingkan SEKALI dengan sidik jari lama, lalu beralih ke rev.
  function isPending() {
    const sr = meta(K.rev);
    if (sr == null || sr === '') {
      const old = meta(K.hash);
      if (old && dataFingerprint() === old) { setMeta(K.rev, dataRev()); setMeta(K.hash, ''); return false; }
      return true;
    }
    return sr !== String(dataRev());
  }

  // Memeriksa apakah file sinkron di Drive diubah perangkat lain sejak sinkron terakhir HP ini. Mengembalikan metadata file bila ya, selain itu null.
  // Belum pernah sinkron dari HP ini (tidak ada id/waktu yang diingat) = tidak ada pembanding; file hilang/dibuang ke Sampah = bukan konflik.
  async function remoteChanged(drive) {
    const id = meta(K.id), mod = meta(K.mod);
    if (!id || !mod) return null;
    let f;
    try { f = await drive.info(id); } catch (e) { if (e && e.kind === 'notfound') return null; throw e; }
    if (!f || f.trashed) return null;
    return f.modifiedTime && f.modifiedTime !== mod ? f : null;
  }

  // Unggah snapshot sekarang. guard=true: periksa dulu apakah Drive diubah perangkat lain (melempar SyncConflict). Melempar error bila gagal.
  async function push(drive, { guard = false } = {}) {
    if (guard) { const ch = await remoteChanged(drive); if (ch) throw new SyncConflict(ch); }
    const rev = dataRev(); // dicatat SEBELUM snapshot: perubahan yang masuk saat unggah berlangsung tetap tercatat sebagai tertunda
    const snap = buildSnapshot('all');
    const r = await drive.saveSync(JSON.stringify(snap), infoOf(snap), meta(K.id));
    setMeta(K.id, r.file.id); setMeta(K.mod, r.file.modifiedTime || '');
    setMeta(K.rev, rev); setMeta(K.hash, ''); setMeta(K.conflict, ''); setMeta(K.last, now().toISOString()); setMeta(K.err, '');
    return { action: 'push', info: infoOf(snap), created: r.created };
  }

  // Terapkan file Drive ke HP. mode 'replace' = HP sama dengan Drive; 'merge' = digabung, lalu hasilnya harus naik ke Drive pada sinkron berikutnya.
  // Data HP tidak disentuh sebelum file Drive berhasil dibaca & divalidasi.
  async function pull(drive, remote, mode) {
    const text = await drive.download(remote.id);
    if (!/^[\s\uFEFF]*\{/.test(text)) throw new Error('File di Google Drive bukan cadangan Budget Planner yang valid.'); // Drive hanya berisi JSON; CSV/teks lain ditolak
    const ins = inspectImport(text); // memvalidasi dulu; error di sini = data HP utuh
    const out = await runImport(ins, mode === 'replace');
    if (remote.kind === 'sync') { setMeta(K.id, remote.id); setMeta(K.mod, remote.modifiedTime || ''); }
    setMeta(K.last, now().toISOString()); setMeta(K.err, ''); setMeta(K.conflict, ''); setMeta(K.hash, '');
    setMeta(K.rev, mode === 'replace' ? dataRev() : ''); // ganti semua: HP sama dengan Drive; gabung: hasilnya harus naik ke Drive
    return { action: mode === 'replace' ? 'pull' : 'merge', info: ins.info, remote, res: out.res };
  }

  // Sinkron otomatis (dipanggil timer / saat aplikasi ke latar belakang). Tidak pernah melempar error.
  // Hasil: { status: 'off'|'noscope'|'same'|'conflict'|'empty'|'cap'|'busy'|'ok'|'error', ... }
  async function auto() {
    if (running) return { status: 'busy' };
    if (!getProfile()) return { status: 'off' };
    if (!hasDriveScope()) return { status: 'noscope' };
    if (!isPending()) return { status: 'same' };
    if (meta(K.conflict) === '1') return { status: 'conflict' }; // menunggu pengguna memilih; tidak membuang panggilan API
    if (isLocalEmpty()) return { status: 'empty' };
    if (usedToday() >= AUTO_PER_DAY) return { status: 'cap' };
    countAuto();
    running = push(bg, { guard: true });
    try { const r = await running; return { status: 'ok', ...r }; }
    catch (e) {
      if (e instanceof SyncConflict) { setMeta(K.conflict, '1'); return { status: 'conflict', remote: e.remote }; }
      setMeta(K.err, short(e)); return { status: 'error', error: e };
    }
    finally { running = null; }
  }

  // Sinkron paksa (tombol "Sinkronkan sekarang"): tetap mengunggah walau datanya kosong atau tidak berubah.
  // Bila Drive diubah perangkat lain: ask(remote) memilih 'merge' | 'replace' | 'local' (null = batal); tanpa ask dilempar SyncConflict.
  // Hasil: { action: 'push'|'pull'|'merge'|'cancel', ... }. Melempar error bila gagal.
  async function syncNow({ ask } = {}) {
    if (!getProfile()) throw new Error('Masuk dengan Google dulu.');
    if (running) { await running.catch(() => {}); }
    running = (async () => {
      const ch = await remoteChanged(ui);
      if (!ch) return push(ui);
      if (!ask) throw new SyncConflict(ch);
      const mode = await ask(ch);
      if (!mode) return { action: 'cancel' };
      return mode === 'local' ? push(ui) : pull(ui, ch, mode);
    })();
    try { return await running; }
    catch (e) { if (e instanceof SyncConflict) setMeta(K.conflict, '1'); else setMeta(K.err, short(e)); throw e; }
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
    if (!remote) return empty ? { action: 'none' } : push(ui);
    let mode = 'replace';
    if (!empty) {
      const unchanged = sameAccount && remote.kind === 'sync' && remote.id === meta(K.id) && !!remote.modifiedTime && remote.modifiedTime === meta(K.mod);
      mode = unchanged ? 'local' : await ask(remote, items);
      if (!mode) return { action: 'cancel' };
    }
    return mode === 'local' ? push(ui) : pull(ui, remote, mode);
  }

  // Dipanggil sebelum keluar akun. { ok: true } bila tidak ada yang akan hilang (data kosong / sudah tersinkron / berhasil diunggah);
  // { ok: false, error } bila perubahan terakhir gagal diunggah (termasuk SyncConflict: Drive diubah perangkat lain).
  async function beforeLogout() {
    if (isLocalEmpty() || !isPending()) return { ok: true, pushed: false };
    try { await syncNow(); return { ok: true, pushed: true }; }
    catch (e) { return { ok: false, error: e }; }
  }

  function status() {
    const profile = getProfile();
    let pending = false;
    if (profile) { try { pending = !isLocalEmpty() && isPending(); } catch (e) { pending = false; } }
    return { last: meta(K.last) || null, error: meta(K.err) || '', pending, conflict: meta(K.conflict) === '1', usedToday: usedToday(), cap: AUTO_PER_DAY };
  }

  return { auto, syncNow, login, beforeLogout, status, push };
}

const uiDrive = makeDrive({ getToken: getDriveToken, clearToken: clearDriveToken, onScopeMissing: forgetDriveScope });
const real = makeSync({
  ui: uiDrive,
  bg: makeDrive({ getToken: getDriveTokenSilent, clearToken: clearDriveToken, onScopeMissing: forgetDriveScope }),
});
export const deleteDriveData = () => uiDrive.removeAll(); // Hapus akun: buang semua file aplikasi di Drive (permanen)
export const autoSync = real.auto;
export const syncNow = real.syncNow;
export const loginSync = real.login;
export const beforeLogout = real.beforeLogout;
export const syncStatus = real.status;