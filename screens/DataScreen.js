import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, BackHandler, StyleSheet } from 'react-native';
import { s, NAVY, BG } from '../theme';
import { Btn, Section, Chevron } from '../components/ui';
import { db, wipeBook, bid, getBook } from '../lib/db';
import { GREEN } from '../lib/calc';
import { exportBackup, exportAllBooks, exportExcelFull, shareTemplate, pickAndRead, inspectImport, runImport, autoBackup, latestAutoBackup, shareAutoBackup } from '../lib/backup';
import { failAlert } from '../lib/excel';
import { backupToDrive, listDriveBackups, fetchDriveBackup, lastDriveBackup } from '../lib/driveBackup';
import DriveSheet, { fmtWaktu } from '../components/DriveSheet';

// Halaman "Data & Cadangan": cadangan Google Drive, backup/import file, Excel, dan kosongkan buku kas.
// Dipisah dari tab Anggaran agar tab itu ringan dan khusus untuk mengatur rencana anggaran.
export default function DataScreen({ tick, bump, notify, profile, openProfile, onClose }) {
  const [driveBusy, setDriveBusy] = useState(null); // 'backup' | 'restore' | null
  const [sheet, setSheet] = useState({ open: false, loading: false, items: [], error: '' });
  const bookName = getBook().nama;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  // Aplikasi dimulai kosong, jadi tidak ada lagi "data awal Excel" untuk dipulihkan; tombol ini mengosongkan buku kas yang sedang aktif.
  const reset = () => Alert.alert('Kosongkan buku kas ini?', `Semua kategori, anggaran, transaksi, dan transaksi berulang di buku kas "${bookName}" dihapus. Buku kas lain tidak terpengaruh.\n\nSalinan backup dibuat otomatis lebih dulu.`, [{ text: 'Batal', style: 'cancel' }, { text: 'Kosongkan', style: 'destructive', onPress: async () => {
    try { await autoBackup('active'); } catch (e) { return Alert.alert('Dibatalkan', 'Backup otomatis gagal dibuat, data tidak diubah.\n' + String((e && e.message) || e)); }
    wipeBook(bid()); bump();
  } }]);

  const finish = async (ins, replace) => {
    try {
      const { kind, res: r, backup } = await runImport(ins, replace); bump();
      const body = kind === 'json'
        ? `Buku kas diproses: ${r.buku} (baru: ${r.bukuBaru})\nKategori diproses: ${r.kat} (baru: ${r.katBaru})\nTransaksi masuk: ${r.tx}${r.rec ? `\nTransaksi berulang baru: ${r.rec}` : ''}\nTransaksi kembar dilewati: ${r.dobel}${r.ubah ? `\nDiperbarui (versi file lebih baru): ${r.ubah}` : ''}${r.hapus ? `\nDihapus (sudah dihapus di HP lain): ${r.hapus}` : ''}${r.terhapus ? `\nDilewati (sudah Anda hapus di HP ini): ${r.terhapus}` : ''}\nBaris tidak valid/dilewati: ${r.lewat}`
        : `Kategori diproses: ${r.kat} (baru: ${r.katBaru})\nTransaksi masuk: ${r.tx}\nTransaksi kembar dilewati: ${r.dobel}\nBaris tidak valid/dilewati: ${r.lewat}`;
      Alert.alert('Import selesai', body + (backup ? `\n\nData lama sudah disalin otomatis (${backup.name}).` : ''),
        backup ? [{ text: 'OK' }, { text: 'Simpan salinan data lama', onPress: () => shareAutoBackup(backup).catch(failAlert('Gagal')) }] : [{ text: 'OK' }]);
    } catch (e) { Alert.alert('Import gagal', String((e && e.message) || e)); }
  };
  const askImport = ins => { // dipakai import file maupun pemulihan dari Drive; belum ada data yang diubah di sini
    if (ins.kind === 'json') {
      const n = db.getFirstSync('SELECT COUNT(*) c FROM books').c;
      Alert.alert('Import backup semua buku', `File berisi ${ins.info.buku} buku kas, ${ins.info.kat} kategori, ${ins.info.tx} transaksi.\n\nGabung: buku kas bernama sama digabung (transaksi kembar dilewati), buku lain ditambahkan.\nGanti Semua: SEMUA ${n} buku kas di aplikasi ini dihapus lalu diganti isi file. Salinan data lama dibuat otomatis lebih dulu.`, [
        { text: 'Batal', style: 'cancel' }, { text: 'Gabung', onPress: () => finish(ins, false) }, { text: 'Ganti Semua', style: 'destructive', onPress: () => finish(ins, true) }]);
    } else {
      Alert.alert('Import dari file CSV', `File berisi ${ins.info.kat} baris kategori dan ${ins.info.tx} baris transaksi, masuk ke buku kas "${getBook().nama}".\n\nGabung: tambahkan data file ke data yang ada (transaksi kembar dilewati).\nGanti Semua: hapus semua data buku kas ini lalu isi dari file. Transaksi berulang buku kas ini ikut terhapus dan tidak bisa dikembalikan dari file CSV. Salinan data lama dibuat otomatis lebih dulu.`, [
        { text: 'Batal', style: 'cancel' }, { text: 'Gabung', onPress: () => finish(ins, false) }, { text: 'Ganti Semua', style: 'destructive', onPress: () => finish(ins, true) }]);
    }
  };
  const doImport = async () => {
    try {
      const text = await pickAndRead(); if (text == null) return;
      askImport(inspectImport(text)); // validasi dulu
    } catch (e) { Alert.alert('Import gagal', String((e && e.message) || e)); }
  };

  // ---- Google Drive ----
  const msg = e => String((e && e.message) || e);
  const needLogin = () => {
    if (profile) return false;
    Alert.alert('Masuk dulu', 'Cadangan ke Google Drive memakai akun Google Anda. Masuk lewat ikon profil di kanan atas.', [{ text: 'Batal', style: 'cancel' }, { text: 'Buka Profil', onPress: () => openProfile && openProfile() }]);
    return true;
  };
  const doBackupDrive = async () => {
    if (driveBusy || needLogin()) return;
    setDriveBusy('backup');
    try { const r = await backupToDrive(); bump(); notify && notify(`✔ Tercadangkan ke Drive: ${r.info.buku} buku kas, ${r.info.tx} transaksi`); }
    catch (e) { Alert.alert('Cadangan gagal', msg(e)); }
    finally { setDriveBusy(null); }
  };
  const openRestore = async () => {
    if (driveBusy || needLogin()) return;
    setSheet({ open: true, loading: true, items: [], error: '' });
    try { setSheet({ open: true, loading: false, items: await listDriveBackups(), error: '' }); }
    catch (e) { setSheet({ open: true, loading: false, items: [], error: msg(e) }); }
  };
  const pickRestore = async f => {
    setSheet(x => ({ ...x, open: false }));
    setDriveBusy('restore');
    try { askImport(inspectImport(await fetchDriveBackup(f.id))); }
    catch (e) { Alert.alert('Pemulihan gagal', msg(e)); }
    finally { setDriveBusy(null); }
  };
  const lastDrive = lastDriveBackup();
  const shareLastAuto = () => { const b = latestAutoBackup(); if (!b) return Alert.alert('Belum ada', 'Backup otomatis dibuat setiap kali Anda memakai Ganti Semua atau Kosongkan Buku Kas.'); shareAutoBackup(b).catch(failAlert('Gagal')); };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={st.top}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={st.backBtn} accessibilityLabel="Kembali"><Chevron dir="left" color="#fff" /></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.title}>Data & Cadangan</Text>
          <Text style={st.sub} numberOfLines={1}>Buku Kas: {bookName}</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        <Section title="Cadangan Google Drive">
          <Text style={s.rn}>Setelah masuk dengan Google, perubahan data otomatis disinkronkan ke satu file di Google Drive Anda (lihat status di Profil). Tombol di bawah membuat cadangan bertanggal tambahan secara manual: 10 terbaru disimpan, yang lebih lama dipindah ke Sampah Drive. Pulihkan bisa memakai file sinkron otomatis maupun cadangan manual.</Text>
          <Text style={[s.rv, { marginTop: 6 }]}>{lastDrive ? `Cadangan manual terakhir: ${fmtWaktu(lastDrive.time)}${lastDrive.buku ? ` • ${lastDrive.buku} buku kas • ${lastDrive.tx} transaksi` : ''}` : 'Belum pernah membuat cadangan manual ke Drive.'}</Text>
          {!profile ? <Text style={[s.rv, { marginTop: 4, color: '#e17055' }]}>Perlu masuk dengan Google (ikon profil di kanan atas).</Text> : null}
          <Btn t={driveBusy === 'backup' ? 'Mengunggah…' : '☁ Cadangkan ke Google Drive'} color="#2e86de" onPress={doBackupDrive} />
          <Btn t={driveBusy === 'restore' ? 'Mengunduh…' : '☁ Pulihkan dari Google Drive'} color="#1d6f42" onPress={openRestore} />
        </Section>

        <Section title={`Backup & Import • ${bookName}`}>
          <Text style={s.rn}>Backup CSV menyimpan kategori, anggaran, dan transaksi buku kas yang sedang aktif. Backup JSON menyimpan SEMUA buku kas dalam satu file, cocok untuk pindah HP. Simpan file itu (Drive/WhatsApp), lalu Import di HP baru; Import mengenali CSV atau JSON otomatis.</Text>
          <Btn t="⬆ Export Backup Buku Ini (CSV)" onPress={() => exportBackup().catch(failAlert('Export gagal'))} />
          <Btn t="🗂 Export Backup Semua Buku (JSON)" color="#2e86de" onPress={() => exportAllBooks().then(c => notify && notify(`✔ ${c.buku} buku kas, ${c.tx} transaksi`)).catch(failAlert('Export gagal'))} />
          <Btn t="⬇ Import dari File (CSV / JSON)" color={GREEN} onPress={doImport} />
          <Btn t="🕘 Simpan Backup Otomatis Terakhir" color="#636e72" onPress={shareLastAuto} />
          <Btn t="📄 Download Template Import" color="#636e72" onPress={() => shareTemplate().catch(failAlert('Gagal'))} />
          <Btn t="📊 Export Semua Data ke Excel (.xlsx)" color="#1d6f42" onPress={() => exportExcelFull().catch(failAlert('Export gagal'))} />
        </Section>

        <Section title="Zona berbahaya">
          <Text style={s.rn}>Menghapus semua kategori, anggaran, transaksi, dan transaksi berulang di buku kas "{bookName}". Salinan backup dibuat otomatis lebih dulu.</Text>
          <Btn t="🗑 Kosongkan Buku Kas Ini" color="#d63031" onPress={reset} />
        </Section>
      </ScrollView>
      <DriveSheet visible={sheet.open} loading={sheet.loading} error={sheet.error} items={sheet.items} onPick={pickRestore} onClose={() => setSheet(x => ({ ...x, open: false }))} />
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, backgroundColor: NAVY },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' }, sub: { color: '#ffffffcc', fontSize: 11.5, fontWeight: '600', marginTop: 1, maxWidth: 220 },
});
