import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { db } from './db';
import { SEED_CATS } from './seed';
import { HEAD, toCsv, parseCsv, normJenis, normDate, parseNom } from './csv';

const ORDER = Object.keys(SEED_CATS);

async function shareText(name, text) {
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: name });
  else Alert.alert('Tersimpan', uri);
}

export async function exportBackup() {
  const cats = db.getAllSync('SELECT jenis,nama,anggaran FROM categories ORDER BY urut,id').sort((a, b) => ORDER.indexOf(a.jenis) - ORDER.indexOf(b.jenis));
  const tx = db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket FROM transactions ORDER BY tanggal,id');
  const rows = [HEAD,
    ...cats.map(c => ['KATEGORI', '', c.jenis, c.nama, c.anggaran, '']),
    ...tx.map(t => ['TRANSAKSI', t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || ''])];
  await shareText(`Backup_BudgetPlanner_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}

export async function shareTemplate() {
  const rows = [HEAD];
  Object.entries(SEED_CATS).forEach(([j, arr]) => arr.forEach(([n, a]) => rows.push(['KATEGORI', '', j, n, a, ''])));
  rows.push(['CONTOH', '2026-11-01', 'Biaya', 'Makanan', 25000, 'Baris CONTOH diabaikan saat import. Isi transaksi dengan Tipe = TRANSAKSI']);
  await shareText('Template_Import_BudgetPlanner.csv', toCsv(rows));
}

export async function pickAndRead() {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled) return null;
  return await FileSystem.readAsStringAsync(r.assets[0].uri);
}

function upsertCat(j, nama, bud, res) {
  const ex = db.getFirstSync('SELECT id,nama FROM categories WHERE jenis=? AND lower(nama)=lower(?)', [j, nama]);
  if (ex) { if (bud !== null) db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [bud, ex.id]); return ex.nama; }
  const u = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM categories WHERE jenis=?', [j]).u;
  db.runSync('INSERT INTO categories(jenis,nama,anggaran,urut) VALUES(?,?,?,?)', [j, nama, bud || 0, u]);
  res.katBaru++;
  return nama;
}

// replace=false: gabung (transaksi kembar dilewati). replace=true: hapus semua data lama lalu isi dari file.
export function importCsv(text, replace) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('File kosong.');
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  const ix = k => hdr.indexOf(k);
  const [iT, iD, iJ, iK, iN, iKet] = ['tipe', 'tanggal', 'jenis', 'kategori', 'nominal', 'keterangan'].map(ix);
  if ([iT, iJ, iK, iN].some(i => i < 0)) throw new Error('Header tidak sesuai. Gunakan file hasil Export atau Template Import.');
  const tipeOf = r => (r[iT] || '').trim().toUpperCase();
  const body = rows.slice(1);
  if (!body.some(r => tipeOf(r) === 'KATEGORI' || tipeOf(r) === 'TRANSAKSI')) throw new Error('Tidak ada baris bertipe KATEGORI atau TRANSAKSI di file ini.');
  const res = { kat: 0, katBaru: 0, tx: 0, dobel: 0, lewat: 0 };
  db.withTransactionSync(() => {
    if (replace) db.execSync('DELETE FROM categories; DELETE FROM transactions;');
    const key = (...a) => a.join('|');
    const have = {};
    db.getAllSync('SELECT tanggal,jenis,kategori,nominal,ket FROM transactions').forEach(t => { const k = key(t.tanggal, t.jenis, t.kategori, t.nominal, t.ket || ''); have[k] = (have[k] || 0) + 1; });
    for (const r of body) {
      const tipe = tipeOf(r), jenis = normJenis(r[iJ]), kat = (r[iK] || '').trim(), nom = parseNom(r[iN]);
      if (tipe === 'KATEGORI') {
        if (!jenis || !kat) { res.lewat++; continue; }
        upsertCat(jenis, kat, nom, res); res.kat++;
      } else if (tipe === 'TRANSAKSI') {
        const tgl = iD >= 0 ? normDate(r[iD]) : '';
        if (!tgl || !jenis || !kat || !nom) { res.lewat++; continue; }
        const nama = upsertCat(jenis, kat, null, res);
        const ket = (iKet >= 0 ? r[iKet] || '' : '').trim();
        const k = key(tgl, jenis, nama, nom, ket);
        if (have[k] > 0) { have[k]--; res.dobel++; continue; }
        db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket) VALUES(?,?,?,?,?)', [tgl, jenis, nama, nom, ket]);
        res.tx++;
      } else res.lewat++;
    }
  });
  return res;
}
