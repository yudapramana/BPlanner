// Pembantu penanganan error. Murni (tanpa React / modul native) agar mudah diuji.

// Ubah apa pun yang dilempar (Error, string, null, objek) menjadi { name, message, stack } yang aman ditampilkan.
export function describeError(e) {
  if (e == null) return { name: 'Error', message: 'Kesalahan tidak diketahui', stack: '' };
  if (typeof e === 'string') return { name: 'Error', message: e, stack: '' };
  return { name: String(e.name || 'Error'), message: String(e.message != null ? e.message : e), stack: String(e.stack || '') };
}
export const errorText = e => { const d = describeError(e); return `${d.name}: ${d.message}`; };

// Apakah dua daftar kunci reset sama (dipakai ErrorBoundary: ganti tab / bulan / buku kas = coba render ulang)
export function sameKeys(a, b) {
  a = a || []; b = b || [];
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

// Catatan error di memori (maks. 20 terakhir) + console.error. Tidak pernah melempar error.
const LOG_MAX = 20;
const log = [];
export function reportError(where, error, componentStack) {
  try {
    log.push({ at: new Date().toISOString(), where, ...describeError(error), componentStack: componentStack || '' });
    if (log.length > LOG_MAX) log.shift();
    console.error(`[${where}]`, error);
  } catch (e) { /* mencatat error tidak boleh menimbulkan error baru */ }
}
export const recentErrors = () => log.slice();
export const clearErrors = () => { log.length = 0; };
