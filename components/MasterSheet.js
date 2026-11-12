import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVY, GCOL } from '../theme';
import { MASTER, starterNames } from '../lib/master';

// Panel pilih kategori dari Master untuk satu kelompok. Item yang sudah ada di buku kas ditandai ✓ dan tidak bisa dipilih lagi.
export default function MasterSheet({ visible, jenis, existing, onClose, onSubmit }) {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) { setSel([]); setQ(''); } }, [visible, jenis]);

  const color = GCOL[jenis] || NAVY;
  const have = useMemo(() => new Set((existing || []).map(n => n.toLowerCase())), [existing]);
  const isHave = n => have.has(n.toLowerCase());
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (MASTER[jenis] || [])
      .map(g => ({ ...g, items: g.items.map(i => i[0]).filter(n => !k || n.toLowerCase().includes(k) || g.grup.toLowerCase().includes(k)) }))
      .filter(g => g.items.length > 0);
  }, [jenis, q]);

  const toggle = n => setSel(p => (p.includes(n) ? p.filter(x => x !== n) : [...p, n]));
  const groupFree = g => g.items.filter(n => !isHave(n));
  const toggleGroup = g => { const free = groupFree(g); const all = free.every(n => sel.includes(n)); setSel(p => (all ? p.filter(n => !free.includes(n)) : [...new Set([...p, ...free])])); };
  const pickStarter = () => setSel(p => [...new Set([...p, ...starterNames(jenis).filter(n => !isHave(n))])]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={ms.overlay} /></TouchableWithoutFeedback>
      <View style={[ms.panel, { paddingBottom: insets.bottom + 10, maxHeight: '88%' }]}>
        <View style={ms.grab} />
        <View style={ms.head}>
          <View style={{ flex: 1 }}>
            <Text style={ms.title}>Master {jenis}</Text>
            <Text style={ms.cap}>Ketuk untuk memilih lebih dari satu, lalu tekan Tambahkan.</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Tutup"><Text style={ms.x}>✕</Text></TouchableOpacity>
        </View>
        <View style={ms.tools}>
          <TextInput style={ms.search} placeholder="🔍 Cari di master…" value={q} onChangeText={setQ} />
          <TouchableOpacity onPress={pickStarter} style={[ms.starter, { borderColor: color }]} activeOpacity={0.7}>
            <Text style={[ms.starterT, { color }]}>★ Pilih yang umum</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {groups.length === 0 ? <Text style={ms.empty}>Tidak ada di master. Ketik nama sendiri di kolom "Kategori baru".</Text> : groups.map(g => {
            const free = groupFree(g); const allOn = free.length > 0 && free.every(n => sel.includes(n));
            return (
              <View key={g.grup} style={{ marginTop: 12 }}>
                <View style={ms.gh}>
                  <Text style={ms.gt}>{g.ikon}  {g.grup}</Text>
                  {free.length > 0 ? <TouchableOpacity onPress={() => toggleGroup(g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={[ms.gl, { color }]}>{allOn ? 'Batal semua' : 'Pilih semua'}</Text></TouchableOpacity> : <Text style={ms.done}>Semua sudah ada</Text>}
                </View>
                <View style={ms.chips}>
                  {g.items.map(n => {
                    const h = isHave(n); const on = sel.includes(n);
                    return (
                      <TouchableOpacity key={n} disabled={h} onPress={() => toggle(n)} activeOpacity={0.7}
                        style={[ms.chip, on && { backgroundColor: color, borderColor: color }, h && ms.chipOff]} accessibilityState={{ selected: on, disabled: h }}>
                        <Text style={[ms.chipT, on && { color: '#fff', fontWeight: '800' }, h && { color: '#a4b0be' }]}>{h ? '✓ ' : on ? '✓ ' : ''}{n}</Text>
                      </TouchableOpacity>);
                  })}
                </View>
              </View>);
          })}
        </ScrollView>
        <TouchableOpacity disabled={sel.length === 0} onPress={() => onSubmit(sel)} activeOpacity={0.8} style={[ms.go, { backgroundColor: sel.length ? color : '#c8d0db' }]}>
          <Text style={ms.goT}>{sel.length ? `Tambahkan ${sel.length} kategori` : 'Pilih kategori dulu'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,25,40,0.45)' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8, elevation: 16 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#d5dce6', marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 },
  title: { fontSize: 18, fontWeight: '800', color: NAVY }, cap: { fontSize: 12, color: '#636e72', marginTop: 2 }, x: { fontSize: 20, color: '#8794a6', paddingHorizontal: 4 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  search: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#eef2f7' },
  starter: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 }, starterT: { fontSize: 12, fontWeight: '800' },
  gh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  gt: { fontSize: 13, fontWeight: '800', color: NAVY }, gl: { fontSize: 12, fontWeight: '700' }, done: { fontSize: 11.5, color: '#a4b0be' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1.5, borderColor: '#e1e7ef', backgroundColor: '#f6f8fb', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOff: { backgroundColor: '#f1f3f6', borderColor: '#eceff3' }, chipT: { fontSize: 13, color: '#2d3436', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#636e72', paddingVertical: 28 },
  go: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }, goT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
