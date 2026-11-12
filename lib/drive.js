// Klien REST Google Drive v3 untuk cadangan. Sengaja tanpa dependensi React Native agar bisa diuji di Node.
// Scope yang dipakai: drive.file (hanya file yang dibuat aplikasi ini; non-sensitif).
// Dua jenis file, keduanya ditandai appProperties.app = 'budgetplanner':
//   kind 'backup' (atau tanpa kind, file lama) = cadangan manual bertanggal, 10 terbaru disimpan.
//   kind 'sync' = SATU file sinkron otomatis yang ditimpa di tempat (1 panggilan API per sinkron bila id-nya sudah diketahui).
// Panggilan API per aksi: Cadangkan manual = 2 (unggah + daftar untuk merapikan, +1 per file lama yang dibuang); Pulihkan = 2 (daftar + unduh);
// Sinkron otomatis = 1 (perbarui file yang id-nya tersimpan) atau 2-3 (belum tahu id: daftar lalu perbarui/buat).
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const APP_TAG = 'budgetplanner';
export const SYNC_NAME = 'BudgetPlanner_Sinkron_Otomatis.json';
export const KEEP = 10; // jumlah cadangan terbaru yang disimpan; yang lebih lama dipindah ke Sampah Drive
const TIMEOUT = 30000;

export class DriveError extends Error {
  constructor(message, kind = 'api', status = 0) { super(message); this.kind = kind; this.status = status; }
}

const p2 = n => String(n).padStart(2, '0');
export const backupName = (d = new Date()) =>
  `BudgetPlanner_Backup_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.json`;

function reasonOf(body) {
  try {
    const e = JSON.parse(body).error || {};
    const r = (e.errors && e.errors[0] && e.errors[0].reason) || (e.details && e.details[0] && e.details[0].reason) || e.status || '';
    return { reason: String(r), message: e.message || '' };
  } catch (_) { return { reason: '', message: String(body || '').slice(0, 120) }; }
}

export function explain(status, body) {
  const { reason, message } = reasonOf(body);
  const all = `${reason} ${message}`;
  if (status === 401) return new DriveError('Izin Google sudah kedaluwarsa. Coba lagi; bila tetap gagal, keluar lalu masuk lagi di halaman Profil.', 'auth', status);
  if (status === 403) {
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(all)) return new DriveError('Google Drive API belum diaktifkan di project Google Cloud Anda. Aktifkan "Google Drive API" di konsol (lihat PANDUAN_GOOGLE_DRIVE.md).', 'config', status);
    if (/insufficient|SCOPE/i.test(all)) return new DriveError('Izin Google Drive belum diberikan.', 'scope', status);
    if (/storageQuotaExceeded/i.test(all)) return new DriveError('Penyimpanan Google Drive Anda penuh.', 'quota', status);
    if (/rateLimit|quotaExceeded/i.test(all)) return new DriveError('Terlalu banyak permintaan ke Google Drive. Coba lagi beberapa menit lagi.', 'rate', status);
  }
  if (status === 429) return new DriveError('Terlalu banyak permintaan ke Google Drive. Coba lagi beberapa menit lagi.', 'rate', status);
  if (status === 404) return new DriveError('File cadangan tidak ditemukan di Google Drive.', 'notfound', status);
  return new DriveError(`Google Drive menolak permintaan (kode ${status}). ${message}`.trim(), 'api', status);
}

// deps: getToken() -> accessToken; clearToken(token); onScopeMissing(); fetchFn (untuk uji)
export function makeDrive({ getToken, clearToken = async () => {}, onScopeMissing = () => {}, fetchFn = (...a) => fetch(...a), timeoutMs = TIMEOUT }) {
  async function once(token, url, init) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      return await fetchFn(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }, signal: ctl ? ctl.signal : undefined });
    } catch (e) {
      throw new DriveError(e && e.name === 'AbortError' ? 'Koneksi ke Google Drive terlalu lama. Coba lagi.' : 'Tidak ada koneksi internet. Sambungkan ke internet lalu coba lagi.', 'network');
    } finally { if (timer) clearTimeout(timer); }
  }

  async function request(url, init = {}, asText = false) {
    let token = await getToken();
    let res = await once(token, url, init);
    if (res.status === 401) { await clearToken(token); token = await getToken(); res = await once(token, url, init); } // token kedaluwarsa: ambil baru, coba sekali lagi
    if (!res.ok) {
      const err = explain(res.status, await res.text().catch(() => ''));
      if (err.kind === 'scope') onScopeMissing();
      throw err;
    }
    return asText ? res.text() : res.json();
  }

  // Yang terbaru diubah lebih dulu. Disaring lewat appProperties (tepat), bukan lewat nama.
  const list = async () => {
    const q = `trashed=false and appProperties has { key='app' and value='${APP_TAG}' }`;
    const fields = 'files(id,name,size,createdTime,modifiedTime,appProperties)';
    const j = await request(`${API}/files?q=${encodeURIComponent(q)}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=50&fields=${encodeURIComponent(fields)}`);
    return (j.files || []).map(f => ({
      id: f.id, name: f.name, size: Number(f.size) || 0, createdTime: f.createdTime, modifiedTime: f.modifiedTime || f.createdTime,
      kind: (f.appProperties && f.appProperties.kind) || 'backup',
      buku: Number(f.appProperties && f.appProperties.buku) || null, tx: Number(f.appProperties && f.appProperties.tx) || null,
    }));
  };

  const multipart = (metadata, text) => {
    const b = 'bpb' + Math.random().toString(36).slice(2, 12);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${b}--`;
    return { headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body };
  };
  const withTag = props => { const a = { app: APP_TAG, v: '1' }; Object.keys(props).forEach(k => { a[k] = String(props[k]); }); return a; };
  const FIELDS = encodeURIComponent('id,name,size,createdTime,modifiedTime');

  const upload = async (name, text, props = {}) => {
    const m = multipart({ name, mimeType: 'application/json', description: 'Cadangan Monthly Budget Planner', appProperties: withTag(props) }, text);
    return request(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', ...m });
  };
  // Timpa isi file yang sudah ada (id tetap). appProperties digabung, nama file tidak diubah.
  const update = async (id, text, props = {}) => {
    const m = multipart({ appProperties: withTag(props) }, text);
    return request(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=${FIELDS}`, { method: 'PATCH', ...m });
  };

  const download = id => request(`${API}/files/${encodeURIComponent(id)}?alt=media`, {}, true);
  const trash = id => request(`${API}/files/${encodeURIComponent(id)}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });

  // Unggah cadangan baru, lalu buang yang melebihi KEEP (file sinkron otomatis tidak ikut dihitung/dibuang).
  // Gagal merapikan tidak membatalkan cadangan yang sudah berhasil.
  const backup = async (text, props) => {
    const file = await upload(backupName(), text, { ...props, kind: 'backup' });
    let pruned = 0;
    try { const all = (await list()).filter(f => f.kind !== 'sync'); for (const f of all.slice(KEEP)) { await trash(f.id); pruned++; } } catch (_) { /* abaikan */ }
    return { file, pruned };
  };

  // Simpan ke file sinkron otomatis. knownId = id yang diingat dari sinkron sebelumnya (hemat 1 panggilan daftar).
  // Id yang sudah tidak ada (404, mis. file dihapus dari Drive) -> cari ulang lewat daftar, lalu buat baru bila memang tidak ada.
  const saveSync = async (text, props = {}, knownId = null) => {
    let id = knownId;
    if (id) {
      try { return { file: await update(id, text, props), created: false }; }
      catch (e) { if (!(e instanceof DriveError && e.kind === 'notfound')) throw e; id = null; }
    }
    const found = (await list()).find(f => f.kind === 'sync');
    if (found) return { file: await update(found.id, text, props), created: false };
    return { file: await upload(SYNC_NAME, text, { ...props, kind: 'sync' }), created: true };
  };

  return { list, upload, update, download, trash, backup, saveSync };
}
