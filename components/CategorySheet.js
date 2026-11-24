import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVY, GCOL } from '../theme';
import { db, categoryUsage, DATE_IN, dateRange } from '../lib/db';
import { MONTHS, rp, ym } from '../lib/calc';

const QUICK = [[50000, '+50rb'], [100000, '+100rb'], [500000, '+500rb']];
const fmt = d => (d ? String(d).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
const digits = v => String(v).replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);

// Lembar edit / tambah satu kategori. Hanya 2 kolom isian, dan hanya saat lembar ini terbuka
// (daftar di tab Anggaran sendiri tidak punya kolom isian, agar ringan digambar di HP kelas bawah).
// cat = null -> tambah kategori baru di kelompok `jenis`.
// onSave({ nama, anggaran }) mengembalikan true bila tersimpan (false = ditolak, mis. nama kembar; lembar tetap terbuka).
export default function CategorySheet({ visible, jenis, cat, y, m, onClose, onSave, onDelete }) {
  const insets = useSafeAreaInsets();
  const [nama, setNama] = useState('');
  const [bud, setBud] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (visible) { setNama(cat ? cat.nama : ''); setBud(cat && cat.anggaran ? String(cat.anggaran) : ''); setTried(false); } }, [visible, cat]);

  const col = GCOL[jenis] || NAVY;
  const nom = parseInt(bud || '0', 10) || 0;
  const changed = cat ? (nama.trim() !== cat.nama || nom !== (cat.anggaran || 0)) : (nama.trim() !== '' || nom > 0);
  // Info pemakaian (hanya untuk kategori yang sudah ada): terpakai di bulan yang sedang dilihat + jumlah transaksi
  const info = useMemo(() => {
    if (!visible || !cat) return null;
    const spent = db.getFirstSync(`SELECT COALESCE(SUM(nominal),0) s FROM transactions WHERE category_id=? AND ${DATE_IN}`, [cat.id, ...dateRange(ym(y, m))]).s;
    return { spent, n: categoryUsage(cat.id).n };
  }, [visible, cat, y, m]);

  const close = () => {
    if (!changed) return onClose();
    Alert.alert('Buang perubahan?', 'Perubahan pada kategori ini belum disimpan.', [{ text: 'Lanjut edit', style: 'cancel' }, { text: 'Buang', style: 'destructive', onPress: onClose }]);
  };
  const save = () => {
    if (!nama.trim()) { setTried(true); return; }
    if (onSave({ nama: nama.trim(), anggaran: nom })) onClose();
  };
  const isIncome = jenis === 'Pendapatan';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={close}><View style={st.backdrop} /></TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ justifyContent: 'flex-end' }}>
        <View style={[st.sheet, { paddingBottom: insets.bottom + 14, borderTopColor: col }]}>
          <View style={st.handle} />
          <View style={st.head}>
            <Text style={st.title}>{cat ? 'Edit kategori' : 'Tambah kategori'} • {jenis}</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Tutup"><Text style={st.x}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <Text style={st.lbl}>NAMA</Text>
            <TextInput style={[st.in, tried && !nama.trim() && { borderColor: '#d63031' }]} value={nama} onChangeText={setNama} placeholder="Contoh: Makan, Bensin, Listrik"
              placeholderTextColor="#b2bec3" maxLength={40} accessibilityLabel="Nama kategori" autoFocus={!cat} />
            {tried && !nama.trim() ? <Text style={st.err}>Isi nama kategori</Text> : null}

            <Text style={[st.lbl, { marginTop: 14 }]}>{isIncome ? 'TARGET PEMASUKAN PER BULAN' : 'ANGGARAN PER BULAN'}</Text>
            <View style={st.amtRow}>
              <Text style={[st.rp, { color: col }]}>Rp</Text>
              <TextInput style={[st.in, st.amt, { color: col }]} value={fmt(bud)} onChangeText={v => setBud(digits(v))} keyboardType="numeric" placeholder="0"
                placeholderTextColor="#b2bec3" accessibilityLabel="Anggaran per bulan" />
            </View>
            <View style={st.quick}>
              {QUICK.map(([a, t]) => <TouchableOpacity key={t} style={st.q} onPress={() => setBud(String(nom + a))}><Text style={st.qT}>{t}</Text></TouchableOpacity>)}
              <TouchableOpacity style={[st.q, { borderColor: '#d63031' }]} onPress={() => setBud('')}><Text style={[st.qT, { color: '#d63031' }]}>Rp 0</Text></TouchableOpacity>
            </View>
            <Text style={st.note}>Berlaku sama untuk setiap bulan. Rp 0 = belum dianggarkan.</Text>

            {info ? (
              <View style={[st.info, { borderLeftColor: col }]}>
                <Text style={st.infoT}>{isIncome ? 'Masuk' : 'Terpakai'} {MONTHS[m - 1]} {y}: <Text style={{ fontWeight: '800' }}>{rp(info.spent)}</Text>{nom > 0 ? ` (${Math.round((info.spent / nom) * 100)}% dari anggaran di atas)` : ''}</Text>
                <Text style={st.infoT}>{info.n > 0 ? `${info.n} transaksi memakai kategori ini` : 'Belum ada transaksi dengan kategori ini'}</Text>
              </View>) : null}
          </ScrollView>

          <TouchableOpacity style={[st.btn, { backgroundColor: col }]} onPress={save} accessibilityRole="button"><Text style={st.btnT}>Simpan</Text></TouchableOpacity>
          {cat ? (
            <TouchableOpacity onPress={() => onDelete(cat)} style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 4 }} accessibilityRole="button">
              <Text style={{ color: '#d63031', fontWeight: '700' }}>🗑  Hapus kategori</Text>
            </TouchableOpacity>) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,48,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingTop: 10, borderTopWidth: 4 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe6e9', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: NAVY }, x: { fontSize: 20, color: '#636e72', paddingHorizontal: 4 },
  lbl: { fontSize: 11, fontWeight: '800', color: '#636e72', letterSpacing: 0.5, marginBottom: 6 },
  in: { borderWidth: 1, borderColor: '#d5dce6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#f6f8fb', color: '#2d3436' },
  amtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rp: { fontSize: 20, fontWeight: '800' }, amt: { flex: 1, fontSize: 22, fontWeight: '800' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  q: { borderWidth: 1, borderColor: '#d5dce6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }, qT: { fontSize: 12, fontWeight: '700', color: '#2d3436' },
  note: { fontSize: 11.5, color: '#636e72', marginTop: 8 },
  err: { color: '#d63031', fontSize: 12, fontWeight: '700', marginTop: 6 },
  info: { marginTop: 14, borderLeftWidth: 4, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, gap: 3 }, infoT: { fontSize: 12.5, color: '#2d3436' },
  btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 }, btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
