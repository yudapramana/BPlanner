import { GOOGLE_WEB_CLIENT_ID } from './config';
import { db, meta, setMeta } from './db';

// code: 'NO_CLIENT_ID' = Web Client ID belum diisi (layar bisa menawarkan tombol "Isi sekarang").
export class AuthError extends Error { constructor(message, code = '') { super(message); this.code = code; } }

// ---------- Google Web Client ID (diisi lewat aplikasi, bukan lewat kode) ----------
// Disimpan di tabel meta dengan kunci "cfg.webClientId". Awalan "cfg." sengaja tidak ikut terhapus saat keluar akun,
// jadi pengaturan ini bertahan walau data keuangan dikosongkan. Nilai di lib/config.js hanya cadangan bila kolom di aplikasi kosong.
export const CLIENT_ID_KEY = 'cfg.webClientId';
export const CLIENT_ID_RE = /^\d{6,}-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
export const cleanClientId = v => String(v == null ? '' : v).replace(/["'\s]/g, ''); // buang spasi, baris baru, dan tanda kutip hasil salin-tempel
export const isValidClientId = v => CLIENT_ID_RE.test(cleanClientId(v));
export const getWebClientId = () => cleanClientId(meta(CLIENT_ID_KEY)) || cleanClientId(GOOGLE_WEB_CLIENT_ID);
export const hasWebClientId = () => !!getWebClientId();
export const maskClientId = id => (id ? `${id.slice(0, 13)}…${id.slice(-26)}` : '');

const NO_ID = () => new AuthError('Google Web Client ID belum diisi.\n\nBuka Profil › Pengaturan Google, lalu tempel Web Client ID dari Google Cloud Console (langkahnya ada di PANDUAN_GOOGLE_LOGIN.md).', 'NO_CLIENT_ID');

// Modul native dimuat saat dibutuhkan, agar aplikasi tidak crash di build yang belum memuatnya
// (mis. sebelum build ulang, atau di Expo Go).
function load() {
  try { return require('@react-native-google-signin/google-signin'); }
  catch (e) { throw new AuthError('Fitur login Google belum ada di build aplikasi ini. Build ulang aplikasi (npx expo run:android atau build APK baru), lalu coba lagi.'); }
}
function configured() {
  const id = getWebClientId();
  if (!id) throw NO_ID();
  const lib = load();
  lib.GoogleSignin.configure({ webClientId: id });
  return lib;
}

// Putuskan sesi Google lama (token milik Web Client ID sebelumnya tidak berlaku lagi) dan minta izin Drive ulang di login berikutnya.
// Data keuangan & profil lokal TIDAK disentuh di sini.
export async function dropGoogleSession() {
  setMeta('drive.scope', 0);
  try { await load().GoogleSignin.signOut(); } catch (e) { /* tidak ada sesi / modul belum ada: abaikan */ }
}

// Simpan Web Client ID baru. Kosong = hapus (kembali ke nilai di lib/config.js). Mengembalikan { changed }.
export async function saveWebClientId(v) {
  const id = cleanClientId(v);
  if (id && !isValidClientId(id)) throw new AuthError('Format Web Client ID tidak sesuai.\n\nContoh yang benar:\n1234567890-abcdefg123456.apps.googleusercontent.com\n\nPastikan yang disalin adalah Client ID dari jenis "Web application", bukan Client secret.');
  const before = getWebClientId();
  if (id) setMeta(CLIENT_ID_KEY, id); else db.runSync('DELETE FROM meta WHERE k=?', [CLIENT_ID_KEY]);
  const changed = getWebClientId() !== before;
  if (changed) await dropGoogleSession();
  return { changed };
}

// Mengembalikan { googleId, nama, email, foto }, atau null bila pengguna membatalkan.
export async function signInWithGoogle() {
  const { GoogleSignin, isSuccessResponse, statusCodes } = configured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null; // dibatalkan
    const u = res.data.user;
    return { googleId: u.id, nama: u.name || u.givenName || '', email: u.email, foto: u.photo || '' };
  } catch (e) {
    if (e && String(e.code) === String(statusCodes.SIGN_IN_CANCELLED)) return null;
    throw e;
  }
}

export async function signOutGoogle() {
  try { await load().GoogleSignin.signOut(); } catch (e) { /* abaikan: profil lokal tetap dihapus */ }
}

// Apakah masih ada sesi Google yang aktif di perangkat ini (false bila Web Client ID diganti/dicabut atau pengguna sudah keluar).
export async function sessionActive() {
  try { return !!(await configured().GoogleSignin.hasPreviousSignIn()); } catch (e) { return false; }
}

export function authMessage(e) {
  if (e instanceof AuthError) return e.message;
  const code = e && e.code ? String(e.code) : '';
  const text = String((e && e.message) || e || '');
  try {
    const { statusCodes } = load();
    if (code === String(statusCodes.IN_PROGRESS)) return 'Proses masuk sedang berjalan. Tunggu sebentar.';
    if (code === String(statusCodes.PLAY_SERVICES_NOT_AVAILABLE)) return 'Google Play Services tidak tersedia atau perlu diperbarui di HP ini.';
  } catch (_) { /* lanjut ke pesan umum */ }
  if (code === '10' || code === '12500' || /DEVELOPER_ERROR|invalid_client/.test(text)) return `Google menolak konfigurasi login (${code || 'DEVELOPER_ERROR'}).\n\nPenyebab yang umum: Web Client ID sudah dicabut atau salah, atau package name & SHA-1 pada OAuth client Android tidak cocok.\n\nBuat/salin Web Client ID yang baru lalu tempel di Profil › Pengaturan Google. Perubahan di Google bisa butuh beberapa menit.`;
  return `Gagal masuk dengan Google.\n\n${text}\n\nPeriksa: koneksi internet, Web Client ID, serta package name dan SHA-1 pada OAuth Android client (lihat PANDUAN_GOOGLE_LOGIN.md).`;
}

// ---------- Izin Google Drive (untuk cadangan & sinkron) ----------
// Hanya scope drive.file: aplikasi hanya melihat file yang ia buat sendiri, bukan seluruh isi Drive Anda.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const forgetDriveScope = () => setMeta('drive.scope', 0);
export const hasDriveScope = () => meta('drive.scope') === '1';

export async function clearDriveToken(token) {
  try { await load().GoogleSignin.clearCachedAccessToken(token); } catch (e) { /* abaikan */ }
}

const NO_SESSION = 'Sesi Google tidak ditemukan atau terputus. Buka Profil lalu ketuk Hubungkan ulang.';

// Mengembalikan access token Drive. silent=true: tidak pernah memunculkan jendela izin (dipakai sinkron otomatis di latar belakang).
// Jendela izin Google hanya muncul sekali per akun/Web Client ID, saat masuk (silent=false).
export async function getDriveToken({ silent = false } = {}) {
  const { GoogleSignin } = configured();
  if (!(await GoogleSignin.hasPreviousSignIn())) throw new AuthError(NO_SESSION);
  if (!hasDriveScope()) {
    if (silent) throw new AuthError('Izin Google Drive belum diberikan.');
    let r;
    try { r = await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] }); }
    catch (e) { throw new AuthError('Izin Google Drive tidak diberikan, jadi data tidak bisa disinkronkan.\n\nSaat jendela izin muncul, pilih Izinkan.'); }
    if (!r) throw new AuthError(NO_SESSION);
    setMeta('drive.scope', 1);
  }
  const t = await GoogleSignin.getTokens();
  if (!t || !t.accessToken) throw new AuthError('Gagal mendapatkan izin akses Google Drive. Coba lagi.');
  return t.accessToken;
}
export const getDriveTokenSilent = () => getDriveToken({ silent: true });
