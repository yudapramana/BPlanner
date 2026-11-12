import { makeDrive } from './drive';
import { getDriveToken, clearDriveToken, forgetDriveScope } from './googleAuth';
import { buildSnapshot } from './backup';
import { meta, setMeta } from './db';

const drive = makeDrive({ getToken: getDriveToken, clearToken: clearDriveToken, onScopeMissing: forgetDriveScope });

// Cadangkan SEMUA buku kas (format JSON yang sama dengan Export Backup Semua Buku).
export async function backupToDrive() {
  const snap = buildSnapshot('all');
  const info = { buku: snap.books.length, tx: snap.books.reduce((a, b) => a + b.transaksi.length, 0) };
  const r = await drive.backup(JSON.stringify(snap), info);
  setMeta('drive.last', new Date().toISOString());
  setMeta('drive.info', JSON.stringify({ ...info, size: Number(r.file.size) || 0 }));
  return { ...r, info };
}

export const listDriveBackups = () => drive.list();
export const fetchDriveBackup = id => drive.download(id);

export function lastDriveBackup() {
  const t = meta('drive.last'); if (!t) return null;
  let info = {}; try { info = JSON.parse(meta('drive.info') || '{}'); } catch (e) { /* abaikan */ }
  return { time: t, ...info };
}
