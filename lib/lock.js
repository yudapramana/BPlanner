import * as LocalAuthentication from 'expo-local-authentication';
import { meta, setMeta } from './db';

// ===== Kunci aplikasi =====
// Memakai kunci layar milik HP (sidik jari / wajah, atau PIN / pola / kata sandi HP) lewat expo-local-authentication.
// Sengaja TIDAK ada PIN sendiri: tidak ada PIN yang bisa terlupa, tidak ada PIN yang tersimpan di aplikasi, dan batas percobaan ditangani Android.
// Pengaturan disimpan di meta 'cfg.lock' (awalan cfg. = pengaturan perangkat, tidak ikut terhapus saat keluar akun).
export const LOCK_KEY = 'cfg.lock';
export const LOCK_GRACE_MS = 60000; // terkunci lagi bila aplikasi ditinggalkan >= 60 detik (memberi waktu untuk pemilih file / berbagi file)

export const isLockEnabled = () => meta(LOCK_KEY) === '1';
export const setLockEnabled = on => { setMeta(LOCK_KEY, on ? 1 : 0); applyScreenPrivacy(on); };

// ---- Privasi layar (ikut Kunci aplikasi) ----
// Saat kunci aktif: isi aplikasi disembunyikan di daftar "aplikasi terbaru" Android dan tangkapan layar diblokir (FLAG_SECURE).
// Tanpa ini, cuplikan saldo tetap terlihat di daftar aplikasi terbaru walau aplikasi terkunci.
// Modul native dimuat saat dibutuhkan: build lama tanpa modulnya tetap jalan (fitur ini saja yang mati).
let SC = null;
try { SC = require('expo-screen-capture'); } catch (e) { SC = null; }
export function applyScreenPrivacy(on = isLockEnabled()) {
  if (!SC) return;
  try { (on ? SC.preventScreenCaptureAsync() : SC.allowScreenCaptureAsync()).catch(() => {}); } catch (e) { /* abaikan */ }
}

// Penanda "sedang menampilkan jendela autentikasi": layar kunci Android bisa memindahkan aplikasi ke latar belakang sebentar,
// dan itu tidak boleh dihitung sebagai "ditinggalkan".
let busy = false;
export const authBusy = () => busy;

// Apakah HP punya kunci layar apa pun (PIN/pola/kata sandi atau biometrik). Tanpa itu, kunci aplikasi tidak bisa dipakai.
export async function deviceLockAvailable() {
  try { return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE; }
  catch (e) { return false; }
}

// { ok: true } atau { ok: false, reason }. Tidak pernah melempar error. Kunci layar HP boleh dipakai sebagai pengganti biometrik (disableDeviceFallback tidak diisi).
export async function authenticate(message = 'Buka Monthly Budget Planner') {
  busy = true;
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: message, cancelLabel: 'Batal' });
    return r && r.success ? { ok: true } : { ok: false, reason: (r && r.error) || 'unknown' };
  } catch (e) { return { ok: false, reason: 'error' }; }
  finally { busy = false; }
}

// Sudah cukup lama di latar belakang untuk dikunci lagi? bgAt = waktu (ms) aplikasi masuk latar belakang, null = tidak tercatat.
export const shouldLock = (bgAt, now = Date.now(), grace = LOCK_GRACE_MS) => bgAt != null && now - bgAt >= grace;

export function reasonText(reason) {
  switch (reason) {
    case 'user_cancel': case 'system_cancel': case 'app_cancel': return 'Dibatalkan. Ketuk Buka kunci untuk mencoba lagi.';
    case 'lockout': return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
    case 'not_enrolled': case 'passcode_not_set': case 'not_available': return 'Kunci layar HP tidak tersedia. Atur PIN, pola, atau sidik jari di Pengaturan HP.';
    default: return 'Autentikasi gagal. Ketuk Buka kunci untuk mencoba lagi.';
  }
}