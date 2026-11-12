import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Modal, ScrollView, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NavIcon from './NavIcons';
import { NAVY } from '../theme';
import { getBooks, bookSaldo, addBook, updateBook, deleteBook } from '../lib/db';
import { TIPE, TCOL } from '../lib/bookTypes';
import { ym, rp, MASK } from '../lib/calc';

export { TCOL };
const TIPES = Object.keys(TIPE);
const ISI_HINT = {
  master: 'Terisi otomatis kategori umum yang sering dipakai (anggaran Rp 0). Kategori lain tinggal dipilih dari Master di tab Anggaran.',
  copy: 'Kategori & anggaran disalin dari buku kas yang sedang aktif. Transaksi tidak ikut disalin.',
  kosong: 'Buku kas kosong. Kategori bisa dipilih dari Master atau diketik sendiri di tab Anggaran.',
};

export function BookAvatar({ tipe, size = 36 }) {
  const c = TCOL[tipe] || NAVY;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: c + '22', alignItems: 'center', justifyContent: 'center' }}>
      <NavIcon name={tipe in TCOL ? tipe : 'lainnya'} color={c} size={size * 0.58} />
    </View>
  );
}

// Panel daftar Buku Kas yang turun dari header: ganti, tambah, ubah, hapus.
export default function BookSheet({ visible, onClose, activeId, tick, hide, y, m, onSwitch, onChanged, notify }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('list'); // 'list' | 'new' | { edit: buku }
  const [nama, setNama] = useState('');
  const [tipe, setTipe] = useState('pribadi');
  const [isi, setIsi] = useState('master'); // 'master' | 'copy' | 'kosong'

  useEffect(() => { if (visible) { setMode('list'); setNama(''); setTipe('pribadi'); setIsi('master'); } }, [visible]);

  const books = useMemo(() => (visible ? getBooks().map(b => ({ ...b, saldo: bookSaldo(b.id, ym(y, m)) })) : []), [visible, tick, y, m]);
  const R = n => (hide ? MASK : rp(n));
  const editing = typeof mode === 'object' ? mode.edit : null;

  const startNew = () => { setNama(''); setTipe('pribadi'); setIsi('master'); setMode('new'); };
  const startEdit = b => { setNama(b.nama); setTipe(b.tipe in TIPE ? b.tipe : 'lainnya'); setMode({ edit: b }); };

  const dupe = n => books.some(b => b.nama.toLowerCase() === n.toLowerCase() && (!editing || b.id !== editing.id));
  const save = () => {
    const n = nama.trim().slice(0, 30);
    if (!n) return Alert.alert('Nama kosong', 'Isi nama buku kas terlebih dahulu.');
    if (dupe(n)) return Alert.alert('Nama sudah dipakai', 'Gunakan nama lain untuk buku kas ini.');
    if (editing) { updateBook(editing.id, n, tipe); onChanged(); notify && notify('✔ Buku kas diperbarui'); setMode('list'); return; }
    const id = addBook(n, tipe, isi, activeId);
    onSwitch(id); notify && notify(`✔ Buku kas "${n}" dibuat`);
  };
  const remove = () => {
    if (books.length <= 1) return Alert.alert('Tidak bisa dihapus', 'Minimal harus ada satu buku kas.');
    Alert.alert(`Hapus "${editing.nama}"?`, `${editing.n} transaksi beserta semua kategori & anggaran di buku kas ini akan dihapus permanen. Buku kas lain tidak terpengaruh.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => { deleteBook(editing.id); onChanged(); notify && notify('Buku kas dihapus'); setMode('list'); } }]);
  };

  const Tipe = (
    <View style={bs.tipes}>
      {TIPES.map(k => { const on = tipe === k; return (
        <TouchableOpacity key={k} onPress={() => setTipe(k)} style={[bs.tipe, on && { backgroundColor: TCOL[k] + '22', borderColor: TCOL[k] }]}>
          <NavIcon name={k} color={on ? TCOL[k] : '#8794a6'} size={20} />
          <Text style={[bs.tipeT, on && { color: TCOL[k], fontWeight: '800' }]}>{TIPE[k]}</Text>
        </TouchableOpacity>); })}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => (mode === 'list' ? onClose() : setMode('list'))}>
      <TouchableWithoutFeedback onPress={onClose}><View style={bs.overlay} /></TouchableWithoutFeedback>
      <View pointerEvents="box-none" style={[bs.wrap, { top: insets.top + 8 }]}>
        <View style={bs.panel}>
          {mode === 'list' ? (
            <>
              <View style={bs.head}>
                <Text style={bs.title}>Buku Kas</Text>
                <Text style={bs.cap}>Pisahkan anggaran: pribadi, keluarga, proyek, acara.</Text>
              </View>
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {books.map(b => { const on = b.id === activeId; return (
                  <TouchableOpacity key={b.id} style={[bs.row, on && { backgroundColor: '#eef3fa' }]} activeOpacity={0.7} onPress={() => onSwitch(b.id)}>
                    <BookAvatar tipe={b.tipe} />
                    <View style={{ flex: 1 }}>
                      <Text style={bs.nm} numberOfLines={1}>{b.nama}</Text>
                      <Text style={bs.sub} numberOfLines={1}>{TIPE[b.tipe] || 'Lainnya'} • {b.n} transaksi • Saldo {R(b.saldo)}</Text>
                    </View>
                    {on ? <NavIcon name="check" color={NAVY} size={20} strokeWidth={2.6} /> : null}
                    <TouchableOpacity onPress={() => startEdit(b)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={bs.ed} accessibilityLabel={`Ubah ${b.nama}`}>
                      <NavIcon name="edit" color="#8794a6" size={18} />
                    </TouchableOpacity>
                  </TouchableOpacity>); })}
              </ScrollView>
              <TouchableOpacity style={bs.add} onPress={startNew} activeOpacity={0.8}>
                <NavIcon name="tambah" color="#fff" size={18} strokeWidth={2.6} />
                <Text style={bs.addT}>Buku Kas Baru</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={bs.head}>
                <Text style={bs.title}>{editing ? 'Ubah Buku Kas' : 'Buku Kas Baru'}</Text>
              </View>
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                <Text style={bs.lbl}>NAMA</Text>
                <TextInput style={bs.in} value={nama} onChangeText={setNama} maxLength={30} placeholder="Contoh: Renovasi Rumah, Nikahan, Liburan" autoFocus />
                <Text style={[bs.lbl, { marginTop: 12 }]}>JENIS</Text>
                {Tipe}
                {!editing && (
                  <>
                    <Text style={[bs.lbl, { marginTop: 12 }]}>ISI AWAL</Text>
                    <View style={bs.tipes}>
                      {[['master', 'Paket Master'], ['copy', 'Salin Buku Aktif'], ['kosong', 'Kosong']].map(([v, t]) => { const on = isi === v; return (
                        <TouchableOpacity key={v} onPress={() => setIsi(v)} style={[bs.tipe, { flex: 1 }, on && { backgroundColor: '#e6edf7', borderColor: NAVY }]}>
                          <Text style={[bs.tipeT, { textAlign: 'center' }, on && { color: NAVY, fontWeight: '800' }]}>{t}</Text>
                        </TouchableOpacity>); })}
                    </View>
                    <Text style={bs.hint}>{ISI_HINT[isi]} Kelompok (Pendapatan, Biaya, Tagihan, Pinjaman, Tabungan) sama di semua buku; cocok untuk rencana vs realisasi, bukan pembukuan usaha.</Text>
                  </>)}
              </View>
              <View style={bs.btns}>
                {editing ? (
                  <TouchableOpacity style={[bs.btn, bs.btnO, { borderColor: '#d63031' }]} onPress={remove}><Text style={[bs.btnT, { color: '#d63031' }]}>Hapus</Text></TouchableOpacity>)
                  : <TouchableOpacity style={[bs.btn, bs.btnO, { borderColor: '#d5dce6' }]} onPress={() => setMode('list')}><Text style={[bs.btnT, { color: '#636e72' }]}>Batal</Text></TouchableOpacity>}
                <TouchableOpacity style={[bs.btn, { backgroundColor: NAVY }]} onPress={save}><Text style={bs.btnT}>{editing ? 'Simpan' : 'Buat Buku Kas'}</Text></TouchableOpacity>
              </View>
              {editing && <TouchableOpacity onPress={() => setMode('list')} style={{ alignItems: 'center', paddingBottom: 12 }}><Text style={{ color: '#636e72', fontWeight: '700' }}>Kembali</Text></TouchableOpacity>}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,25,40,0.45)' },
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12 },
  panel: { backgroundColor: '#fff', borderRadius: 24, paddingTop: 6, paddingBottom: 14, elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  head: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: NAVY }, cap: { fontSize: 12, color: '#636e72', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, marginHorizontal: 6 },
  nm: { fontSize: 15, fontWeight: '800', color: '#2d3436' }, sub: { fontSize: 11.5, color: '#636e72', marginTop: 2 },
  ed: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f4f9', alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: NAVY, borderRadius: 16, marginHorizontal: 16, marginTop: 10, paddingVertical: 12 },
  addT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  lbl: { fontSize: 11, fontWeight: '800', color: '#636e72', letterSpacing: 0.5, marginBottom: 6 },
  in: { borderWidth: 1, borderColor: '#e1e7ef', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f6f8fb', fontSize: 15 },
  tipes: { flexDirection: 'row', gap: 8 },
  tipe: { alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, borderWidth: 1.5, borderColor: '#e1e7ef', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 2 },
  tipeT: { fontSize: 11, fontWeight: '600', color: '#636e72' },
  hint: { fontSize: 11.5, color: '#636e72', marginTop: 6 },
  btns: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }, btnO: { backgroundColor: '#fff', borderWidth: 1.5 }, btnT: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
