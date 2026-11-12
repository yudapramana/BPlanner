import React, { useState, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { s, NAVY, GCOL } from '../theme';
import { Btn, Section } from '../components/ui';
import { db, wipeBook, bid, getBook, addCategories, addCategory, renameCategory, deleteCategory, categoryUsage, categoryRecurring } from '../lib/db';
import { countRecurring } from '../lib/recurring';
import MasterSheet from '../components/MasterSheet';
import { masterCount } from '../lib/master';
import { JENIS, rp, GREEN, RED } from '../lib/calc';
import { exportBackup, exportAllBooks, exportExcelFull, shareTemplate, pickAndRead, inspectImport, runImport, autoBackup, latestAutoBackup, shareAutoBackup } from '../lib/backup';
import { failAlert } from '../lib/excel';
import { backupToDrive, listDriveBackups, fetchDriveBackup, lastDriveBackup } from '../lib/driveBackup';
import DriveSheet, { fmtWaktu } from '../components/DriveSheet';
import useKeyboard from '../lib/useKeyboard';

export default function PengaturanScreen({ tick, bump, notify, profile, openProfile, openRec }) {
  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories WHERE book_id=? ORDER BY urut,id', [bid()]), [tick]);
  const [nw, setNw] = useState({});
  const [driveBusy, setDriveBusy] = useState(null); // 'backup' | 'restore' | null
  const [sheet, setSheet] = useState({ open: false, loading: false, items: [], error: '' });
  const [pickJ, setPickJ] = useState(null); // kelompok yang sedang membuka panel Master
  const [rev, setRev] = useState(0); // dinaikkan untuk memaksa kolom nama/anggaran kembali ke nilai di database (mis. setelah ganti nama ditolak)
  const scroller = useRef(null);
  const { wrapRef, overlap, ensure, onScroll } = useKeyboard(scroller, 0);

  const sumBud = js => cats.filter(c => js.includes(c.jenis)).reduce((a, c) => a + c.anggaran, 0);
  const rename = (c, v) => {
    const r = renameCategory(c.id, v);
    if (r === 'kembar') Alert.alert('Nama sudah dipakai', `Sudah ada kategori "${v.trim()}" di kelompok ${c.jenis}. Gunakan nama lain.`);
    if (r === 'ok') bump(); else if (r !== 'sama') setRev(x => x + 1); // ditolak / kosong: kembalikan isi kolom ke nama lama
  };
  const setBud = (c, v) => { db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [parseInt(v.replace(/\D/g, ''), 10) || 0, c.id]); bump(); };
  const add = j => {
    const n = (nw[j] || '').trim(); if (!n) return;
    if (addCategory(j, n) == null) return Alert.alert('Sudah ada', n);
    setNw({ ...nw, [j]: '' }); bump();
  };
  const addFromMaster = names => {
    const j = pickJ; setPickJ(null);
    const n = addCategories(j, names); bump();
    notify && notify(n > 0 ? `✔ ${n} kategori ${j} ditambahkan` : 'Semua sudah ada');
  };
  const remove = c => {
    const u = categoryUsage(c.id);
    const rc = categoryRecurring(c.id);
    const rcNote = rc > 0 ? `\n\n🔁 ${rc} transaksi berulang untuk kategori ini ikut dihapus (jadwal ke depannya berhenti).` : '';
    const done = withTx => { deleteCategory(c.id, withTx); bump(); notify && notify(withTx ? `Kategori & ${u.n} transaksi dihapus` : 'Kategori dihapus'); };
    if (u.n === 0) return Alert.alert('Hapus kategori?', c.nama + rcNote, [{ text: 'Batal', style: 'cancel' }, { text: 'Hapus', style: 'destructive', onPress: () => done(false) }]);
    Alert.alert(`Hapus "${c.nama}"?`,
      `${u.n} transaksi (total ${rp(u.total)}) memakai kategori ini.\n\n• Hapus kategori saja: transaksi tetap ada tetapi tanpa kategori, dan tidak ikut terhitung di Dashboard sampai Anda memilihkan kategori lewat Edit.\n• Hapus beserta transaksi: ${u.n} transaksi itu ikut dihapus permanen.${rcNote}`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus kategori saja', onPress: () => done(false) },
        { text: `Hapus + ${u.n} transaksi`, style: 'destructive', onPress: () => done(true) }]);
  };
  // Aplikasi dimulai kosong, jadi tidak ada lagi "data awal Excel" untuk dipulihkan; tombol ini mengosongkan buku kas yang sedang aktif.
  const reset = () => Alert.alert('Kosongkan buku kas ini?', `Semua kategori, anggaran, transaksi, dan transaksi berulang di buku kas \"${getBook().nama}\" dihapus. Buku kas lain tidak terpengaruh.\n\nSalinan backup dibuat otomatis lebih dulu.`, [{ text: 'Batal', style: 'cancel' }, { text: 'Kosongkan', style: 'destructive', onPress: async () => {
    try { await autoBackup('active'); } catch (e) { return Alert.alert('Dibatalkan', 'Backup otomatis gagal dibuat, data tidak diubah.\n' + String((e && e.message) || e)); }
    wipeBook(bid()); bump();
  } }]);

  const finish = async (ins, replace) => {
    try {
      const { kind, res: r, backup } = await runImport(ins, replace); bump();
      const body = kind === 'json'
        ? `Buku kas diproses: ${r.buku} (baru: ${r.bukuBaru})\nKategori diproses: ${r.kat} (baru: ${r.katBaru})\nTransaksi masuk: ${r.tx}${r.rec ? `\nTransaksi berulang baru: ${r.rec}` : ''}\nTransaksi kembar dilewati: ${r.dobel}\nBaris tidak valid/dilewati: ${r.lewat}`
        : `Kategori diproses: ${r.kat} (baru: ${r.katBaru})\nTransaksi masuk: ${r.tx}\nTransaksi kembar dilewati: ${r.dobel}\nBaris tidak valid/dilewati: ${r.lewat}`;
      Alert.alert('Import selesai', body + (backup ? `\n\nData lama sudah disalin otomatis (${backup.name}).` : ''),
        backup ? [{ text: 'OK' }, { text: 'Simpan salinan data lama', onPress: () => shareAutoBackup(backup).catch(failAlert('Gagal')) }] : [{ text: 'OK' }]);
    } catch (e) { Alert.alert('Import gagal', String((e && e.message) || e)); }
  };
  const askImport = ins => { // dipakai import file maupun pemulihan dari Drive; belum ada data yang diubah di sini
      const bk = getBook().nama;
      if (ins.kind === 'json') {
        const n = db.getFirstSync('SELECT COUNT(*) c FROM books').c;
        Alert.alert('Import backup semua buku', `File berisi ${ins.info.buku} buku kas, ${ins.info.kat} kategori, ${ins.info.tx} transaksi.\n\nGabung: buku kas bernama sama digabung (transaksi kembar dilewati), buku lain ditambahkan.\nGanti Semua: SEMUA ${n} buku kas di aplikasi ini dihapus lalu diganti isi file. Salinan data lama dibuat otomatis lebih dulu.`, [
          { text: 'Batal', style: 'cancel' }, { text: 'Gabung', onPress: () => finish(ins, false) }, { text: 'Ganti Semua', style: 'destructive', onPress: () => finish(ins, true) }]);
      } else {
        Alert.alert('Import dari file CSV', `File berisi ${ins.info.kat} baris kategori dan ${ins.info.tx} baris transaksi, masuk ke buku kas "${bk}".\n\nGabung: tambahkan data file ke data yang ada (transaksi kembar dilewati).\nGanti Semua: hapus semua data buku kas ini lalu isi dari file. Salinan data lama dibuat otomatis lebih dulu.`, [
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
    <View ref={wrapRef} collapsable={false} style={{ flex: 1 }}>
    <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={[s.pad, { paddingBottom: 30 + overlap }]} keyboardShouldPersistTaps="handled">
      {/* Ringkasan rencana anggaran bulanan */}
      <View style={[s.hero, { backgroundColor: NAVY }]}>
        <Text style={[s.heroL, { marginTop: 2 }]}>Rencana anggaran per bulan • {getBook().nama}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={s.hp}>
            <Text style={s.hpL}>↓ PEMASUKAN</Text>
            <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rp(sumBud(['Pendapatan']))}</Text>
          </View>
          <View style={s.hp}>
            <Text style={s.hpL}>↑ PENGELUARAN</Text>
            <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rp(sumBud(['Biaya', 'Tagihan', 'Pinjaman', 'Investasi/Tabungan']))}</Text>
          </View>
        </View>
      </View>
      <Text style={[s.cardS, { marginHorizontal: 4 }]}>Ubah nama / anggaran lalu tekan selesai di keyboard. Anggaran berlaku sama untuk semua bulan.</Text>
      {JENIS.map(j => (
        <Section key={j} title={j.toUpperCase()}>
          {cats.filter(c => c.jenis === j).map(c => (
            <View key={c.id + '|' + rev + '|' + c.nama + '|' + c.anggaran} style={s.row}>
              <TextInput style={[s.in, { flex: 1.4 }]} onFocus={ensure} defaultValue={c.nama} onEndEditing={e => rename(c, e.nativeEvent.text)} />
              <TextInput style={[s.in, { flex: 1 }]} onFocus={ensure} keyboardType="numeric" defaultValue={String(c.anggaran)} onEndEditing={e => setBud(c, e.nativeEvent.text)} />
              <TouchableOpacity onPress={() => remove(c)}><Text style={{ color: RED, fontSize: 20, paddingHorizontal: 6 }}>✕</Text></TouchableOpacity>
            </View>))}
          {cats.every(c => c.jenis !== j) && <Text style={[s.cardS, { marginVertical: 6 }]}>Belum ada kategori {j}. Pilih dari Master agar tidak perlu mengetik dari awal.</Text>}
          <View style={s.row}>
            <TextInput style={[s.in, { flex: 1 }]} onFocus={ensure} placeholder="Kategori baru..." value={nw[j] || ''} onChangeText={v => setNw({ ...nw, [j]: v })} />
            <Btn small t="+ Tambah" onPress={() => add(j)} />
          </View>
          <Btn t={`📚 Pilih dari Master (${masterCount(j)} pilihan)`} color={GCOL[j]} onPress={() => setPickJ(j)} />
          <Text style={[s.rn, { fontWeight: '700', marginTop: 10 }]}>TOTAL ANGGARAN {rp(cats.filter(c => c.jenis === j).reduce((a, c) => a + c.anggaran, 0))}</Text>
        </Section>))}
      <Section title="Transaksi Berulang & Pengingat">
        <Text style={s.rn}>Catat sekali tagihan tetap (cicilan, uang kos, internet, SPP), lalu muncul tiap bulan dengan pengingat jatuh tempo. Pengingat memuat peringatan 80% dan 100% dari anggaran kategorinya.</Text>
        <Text style={[s.rv, { marginTop: 6 }]}>{countRecurring() > 0 ? `${countRecurring()} transaksi berulang aktif di buku kas ini.` : 'Belum ada transaksi berulang.'}</Text>
        <Btn t="🔁 Kelola Transaksi Berulang" onPress={() => openRec && openRec()} />
      </Section>
      <Section title="Cadangan Google Drive">
        <Text style={s.rn}>Setelah masuk dengan Google, perubahan data otomatis disinkronkan ke satu file di Google Drive Anda (lihat status di Profil). Tombol di bawah membuat cadangan bertanggal tambahan secara manual: 10 terbaru disimpan, yang lebih lama dipindah ke Sampah Drive. Pulihkan bisa memakai file sinkron otomatis maupun cadangan manual.</Text>
        <Text style={[s.rv, { marginTop: 6 }]}>{lastDrive ? `Cadangan manual terakhir: ${fmtWaktu(lastDrive.time)}${lastDrive.buku ? ` • ${lastDrive.buku} buku kas • ${lastDrive.tx} transaksi` : ''}` : 'Belum pernah membuat cadangan manual ke Drive.'}</Text>
        {!profile ? <Text style={[s.rv, { marginTop: 4, color: '#e17055' }]}>Perlu masuk dengan Google (ikon profil di kanan atas).</Text> : null}
        <Btn t={driveBusy === 'backup' ? 'Mengunggah…' : '☁ Cadangkan ke Google Drive'} color="#2e86de" onPress={doBackupDrive} />
        <Btn t={driveBusy === 'restore' ? 'Mengunduh…' : '☁ Pulihkan dari Google Drive'} color="#1d6f42" onPress={openRestore} />
      </Section>
      <DriveSheet visible={sheet.open} loading={sheet.loading} error={sheet.error} items={sheet.items} onPick={pickRestore} onClose={() => setSheet(x => ({ ...x, open: false }))} />

      <Section title={`Data & Backup • ${getBook().nama}`}>
        <Text style={s.rn}>Backup CSV menyimpan kategori, anggaran, dan transaksi buku kas yang sedang aktif. Backup JSON menyimpan SEMUA buku kas dalam satu file, cocok untuk pindah HP. Simpan file itu (Drive/WhatsApp), lalu Import di HP baru; Import mengenali CSV atau JSON otomatis.</Text>
        <Btn t="⬆ Export Backup Buku Ini (CSV)" onPress={() => exportBackup().catch(failAlert('Export gagal'))} />
        <Btn t="🗂 Export Backup Semua Buku (JSON)" color="#2e86de" onPress={() => exportAllBooks().then(c => notify && notify(`✔ ${c.buku} buku kas, ${c.tx} transaksi`)).catch(failAlert('Export gagal'))} />
        <Btn t="⬇ Import dari File (CSV / JSON)" color={GREEN} onPress={doImport} />
        <Btn t="🕘 Simpan Backup Otomatis Terakhir" color="#636e72" onPress={shareLastAuto} />
        <Btn t="📄 Download Template Import" color="#636e72" onPress={() => shareTemplate().catch(failAlert('Gagal'))} />
        <Btn t="📊 Export Semua Data ke Excel (.xlsx)" color="#1d6f42" onPress={() => exportExcelFull().catch(failAlert('Export gagal'))} />
      </Section>
      <Btn t="🗑 Kosongkan Buku Kas Ini" color="#d63031" onPress={reset} />
    </ScrollView>
    <MasterSheet visible={!!pickJ} jenis={pickJ || JENIS[0]} existing={cats.filter(c => c.jenis === pickJ).map(c => c.nama)} onClose={() => setPickJ(null)} onSubmit={addFromMaster} />
    </View>
  );
}
