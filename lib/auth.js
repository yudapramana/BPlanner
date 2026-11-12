import { db, meta, setMeta } from './db';

// Profil disimpan di tabel meta (key-value) dengan awalan "profile." — tidak perlu migrasi skema.
// Hanya identitas (nama, email, foto, id Google). Tidak ada kata sandi atau token yang disimpan.
export function getProfile() {
  if (meta('profile.mode') !== 'google') return null;
  return {
    mode: 'google',
    nama: meta('profile.nama') || '',
    email: meta('profile.email') || '',
    foto: meta('profile.foto') || '',
    googleId: meta('profile.googleId') || '',
    since: meta('profile.since') || '',
  };
}

export function saveGoogleProfile(u) {
  const same = meta('profile.googleId') === u.googleId;
  const today = new Date().toISOString().slice(0, 10);
  setMeta('profile.mode', 'google');
  setMeta('profile.googleId', u.googleId);
  setMeta('profile.email', u.email);
  setMeta('profile.foto', u.foto || '');
  if (!same || !meta('profile.nama')) setMeta('profile.nama', u.nama || String(u.email).split('@')[0]);
  setMeta('profile.since', same && meta('profile.since') ? meta('profile.since') : today);
}

export const renameProfile = n => setMeta('profile.nama', String(n).trim().slice(0, 40));
export const clearProfile = () => db.runSync("DELETE FROM meta WHERE substr(k,1,8)='profile.' OR substr(k,1,6)='drive.'"); // profil + status cadangan Drive milik akun itu

// Layar sambutan hanya tampil sekali
export const welcomeDone = () => meta('welcome_done') === '1';
export const setWelcomeDone = () => setMeta('welcome_done', 1);

export function profileStats() {
  const n = t => db.getFirstSync(`SELECT COUNT(*) c FROM ${t}`).c;
  return { buku: n('books'), tx: n('transactions'), kat: n('categories') };
}
