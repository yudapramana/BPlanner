import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { s, NAVY, GCOL } from '../theme';
import { Btn, Section } from '../components/ui';
import { db, bid, getBook, meta, setMeta, addCategories, addCategory, renameCategory, deleteCategory, categoryUsage, categoryRecurring } from '../lib/db';
import { countRecurring } from '../lib/recurring';
import MasterSheet from '../components/MasterSheet';
import CategorySheet from '../components/CategorySheet';
import { masterCount } from '../lib/master';
import { JENIS, rp, rpk } from '../lib/calc';

// Tab Anggaran: daftar kategori per kelompok sebagai baris TEKS (tanpa kolom isian), kelompok bisa dilipat.
// Mengedit / menambah lewat lembar CategorySheet (2 kolom isian, hanya saat terbuka). Dulu setiap kategori punya
// 2 kolom isian yang selalu aktif (±100 kolom), dan itu membuat pindah ke/dari tab ini lambat di HP kelas bawah.
// Cadangan / import / kosongkan buku ada di halaman Data & Cadangan (screens/DataScreen.js).
const OPEN_KEY = 'cfg.anggaran.open'; // kelompok yang terbuka (pengaturan perangkat)
const readOpen = () => { const v = meta(OPEN_KEY); return v == null ? ['Biaya'] : v.split('|').filter(j => JENIS.includes(j)); };
const OUT = ['Biaya', 'Tagihan', 'Pinjaman', 'Investasi/Tabungan'];

export default function PengaturanScreen({ y, m, tick, bump, notify, openRec, openData }) {
  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories WHERE book_id=? ORDER BY urut,id', [bid()]), [tick]);
  const recN = useMemo(() => countRecurring(), [tick]);
  const [open, setOpen] = useState(readOpen);
  const [pickJ, setPickJ] = useState(null); // kelompok yang sedang membuka panel Master
  const [edit, setEdit] = useState(null); // { jenis, cat } ; cat null = tambah baru

  const byJ = useMemo(() => Object.fromEntries(JENIS.map(j => [j, cats.filter(c => c.jenis === j)])), [cats]);
  const sumOf = js => js.reduce((a, j) => a + byJ[j].reduce((b, c) => b + (c.anggaran || 0), 0), 0);
  const inc = sumOf(['Pendapatan']), out = sumOf(OUT), sisa = inc - out;

  const toggle = j => setOpen(o => { const n = o.includes(j) ? o.filter(x => x !== j) : [...o, j]; setMeta(OPEN_KEY, n.join('|')); return n; });

  const saveCat = ({ nama, anggaran }) => {
    const { jenis, cat } = edit;
    const dup = () => { Alert.alert('Nama sudah dipakai', `Sudah ada kategori "${nama}" di kelompok ${jenis}. Gunakan nama lain.`); return false; };
    if (!cat) {
      if (addCategory(jenis, nama, anggaran) == null) return dup();
      bump(); notify && notify(`✔ Kategori ${nama} ditambahkan`); return true;
    }
    const r = renameCategory(cat.id, nama);
    if (r === 'kembar') return dup();
    if (r === 'kosong') return false;
    if (anggaran !== (cat.anggaran || 0)) db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [anggaran, cat.id]);
    bump(); notify && notify(`✔ ${nama} disimpan`); return true;
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
    const done = withTx => { deleteCategory(c.id, withTx); setEdit(null); bump(); notify && notify(withTx ? `Kategori & ${u.n} transaksi dihapus` : 'Kategori dihapus'); };
    if (u.n === 0) return Alert.alert('Hapus kategori?', c.nama + rcNote, [{ text: 'Batal', style: 'cancel' }, { text: 'Hapus', style: 'destructive', onPress: () => done(false) }]);
    Alert.alert(`Hapus "${c.nama}"?`,
      `${u.n} transaksi (total ${rp(u.total)}) memakai kategori ini.\n\n• Hapus kategori saja: transaksi tetap ada tetapi tanpa kategori, dan tidak ikut terhitung di Dashboard sampai Anda memilihkan kategori lewat Edit.\n• Hapus beserta transaksi: ${u.n} transaksi itu ikut dihapus permanen.${rcNote}`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus kategori saja', onPress: () => done(false) },
        { text: `Hapus + ${u.n} transaksi`, style: 'destructive', onPress: () => done(true) }]);
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 90 }]}>
      {/* Ringkasan rencana anggaran bulanan */}
      <View style={[s.hero, { backgroundColor: NAVY }]}>
        <Text style={[s.heroL, { marginTop: 2 }]}>Rencana anggaran per bulan • {getBook().nama}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={s.hp}>
            <Text style={s.hpL}>↓ PEMASUKAN</Text>
            <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rp(inc)}</Text>
          </View>
          <View style={s.hp}>
            <Text style={s.hpL}>↑ PENGELUARAN</Text>
            <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rp(out)}</Text>
          </View>
        </View>
        <Text style={[s.heroP, { marginTop: 10 }]}>{sisa >= 0 ? `Sisa rencana: ${rp(sisa)}` : `Rencana defisit: ${rp(sisa)}`}</Text>
      </View>
      <Text style={[s.cardS, { marginHorizontal: 4 }]}>Ketuk kategori untuk mengubah nama atau anggarannya. Anggaran berlaku sama untuk semua bulan.</Text>

      {JENIS.map(j => {
        const list = byJ[j], on = open.includes(j), col = GCOL[j] || NAVY;
        return (
          <View key={j} style={s.sec}>
            <TouchableOpacity onPress={() => toggle(j)} style={st.gHead} accessibilityRole="button" accessibilityState={{ expanded: on }} accessibilityLabel={`${j}, ${list.length} kategori, total ${rp(sumOf([j]))}. Ketuk untuk ${on ? 'melipat' : 'membuka'}`}>
              <Text style={[st.gArrow, { color: col }]}>{on ? '▼' : '►'}</Text>
              <Text style={st.gTitle} numberOfLines={1}>{j.toUpperCase()}</Text>
              <Text style={st.gSum} numberOfLines={1}>{list.length} kategori • {rpk(sumOf([j]))}</Text>
            </TouchableOpacity>
            {on ? (
              <View style={{ marginTop: 6 }}>
                {list.map(c => (
                  <TouchableOpacity key={c.id} onPress={() => setEdit({ jenis: j, cat: c })} style={st.row} activeOpacity={0.6} accessibilityRole="button"
                    accessibilityLabel={`${c.nama}, ${c.anggaran > 0 ? rp(c.anggaran) : 'belum diatur'}. Ketuk untuk mengubah`}>
                    <View style={[st.dot, { backgroundColor: col }]} />
                    <Text style={st.name} numberOfLines={1}>{c.nama}</Text>
                    <Text style={[st.amt, !(c.anggaran > 0) && st.none]} numberOfLines={1}>{c.anggaran > 0 ? rp(c.anggaran) : 'belum diatur'}</Text>
                    <Text style={st.chev}>›</Text>
                  </TouchableOpacity>))}
                {list.length === 0 ? <Text style={[s.cardS, { marginVertical: 6 }]}>Belum ada kategori {j}. Pilih dari Master agar tidak perlu mengetik dari awal.</Text> : null}
                <View style={st.actions}>
                  <TouchableOpacity style={[st.act, { borderColor: col }]} onPress={() => setEdit({ jenis: j, cat: null })} accessibilityRole="button"><Text style={[st.actT, { color: col }]}>＋ Tambah kategori</Text></TouchableOpacity>
                  <TouchableOpacity style={[st.act, { borderColor: col }]} onPress={() => setPickJ(j)} accessibilityRole="button"><Text style={[st.actT, { color: col }]}>📚 Dari Master ({masterCount(j)})</Text></TouchableOpacity>
                </View>
              </View>) : null}
          </View>);
      })}

      <Section title="Transaksi Berulang & Pengingat">
        <Text style={s.rn}>Catat sekali tagihan tetap (cicilan, uang kos, internet, SPP), lalu muncul tiap bulan dengan pengingat jatuh tempo. Pengingat memuat peringatan 80% dan 100% dari anggaran kategorinya.</Text>
        <Text style={[s.rv, { marginTop: 6 }]}>{recN > 0 ? `${recN} transaksi berulang aktif di buku kas ini.` : 'Belum ada transaksi berulang.'}</Text>
        <Btn t="🔁 Kelola Transaksi Berulang" onPress={() => openRec && openRec()} />
      </Section>

      <TouchableOpacity style={[s.sec, st.dataCard]} onPress={() => openData && openData()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Data dan Cadangan: backup, import, Google Drive, kosongkan buku kas">
        <View style={{ flex: 1 }}>
          <Text style={s.secT}>💾 Data & Cadangan</Text>
          <Text style={s.rv}>Backup, import, Google Drive, Excel, kosongkan buku kas</Text>
        </View>
        <Text style={st.chev}>›</Text>
      </TouchableOpacity>
    </ScrollView>
    <MasterSheet visible={!!pickJ} jenis={pickJ || JENIS[0]} existing={pickJ ? byJ[pickJ].map(c => c.nama) : []} onClose={() => setPickJ(null)} onSubmit={addFromMaster} />
    <CategorySheet visible={!!edit} jenis={edit ? edit.jenis : JENIS[0]} cat={edit ? edit.cat : null} y={y} m={m} onClose={() => setEdit(null)} onSave={saveCat} onDelete={remove} />
    </View>
  );
}

const st = StyleSheet.create({
  gHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  gArrow: { fontSize: 12, width: 14 }, gTitle: { fontSize: 14, fontWeight: '800', color: NAVY, flexShrink: 0 },
  gSum: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#636e72' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#f0f3f6' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1, fontSize: 14, color: '#2d3436', fontWeight: '600' },
  amt: { fontSize: 14, fontWeight: '800', color: '#2d3436' }, none: { color: '#a4adb7', fontWeight: '600', fontSize: 12.5 },
  chev: { fontSize: 20, color: '#a4adb7', marginLeft: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  act: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 9, alignItems: 'center' }, actT: { fontSize: 12.5, fontWeight: '800' },
  dataCard: { flexDirection: 'row', alignItems: 'center' },
});
