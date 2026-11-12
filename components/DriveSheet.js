import React from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVY } from '../theme';
import { MONTHS } from '../lib/calc';

const p2 = n => String(n).padStart(2, '0');
export const fmtWaktu = iso => { const d = new Date(iso); if (isNaN(d)) return '-'; return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()} ${p2(d.getHours())}.${p2(d.getMinutes())}`; };
const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

// Pemilih cadangan di Google Drive (untuk Pulihkan)
export default function DriveSheet({ visible, loading, error, items, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}><View style={st.backdrop} /></TouchableWithoutFeedback>
      <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={st.handle} />
        <Text style={st.title}>Pulihkan dari Google Drive</Text>
        <Text style={st.sub}>Pilih cadangan. Setelah itu Anda memilih Gabung atau Ganti Semua; sebelum menimpa data, salinan data lama dibuat otomatis.</Text>
        {loading ? <View style={st.center}><ActivityIndicator color={NAVY} /><Text style={st.muted}>Mengambil daftar cadangan…</Text></View>
          : error ? <Text style={[st.muted, { color: '#d63031', paddingVertical: 20 }]}>{error}</Text>
          : items.length === 0 ? <Text style={[st.muted, { paddingVertical: 24, textAlign: 'center' }]}>Belum ada cadangan di Google Drive akun ini.{'\n'}Buat dulu lewat tombol Cadangkan.</Text>
          : (
            <ScrollView style={{ maxHeight: 380 }}>
              {items.map((f, i) => (
                <TouchableOpacity key={f.id} onPress={() => onPick(f)} style={st.row} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={`${f.kind === 'sync' ? 'Sinkron otomatis' : 'Cadangan'} ${fmtWaktu(f.modifiedTime || f.createdTime)}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.when}>{f.kind === 'sync' ? '🔄 Sinkron otomatis' : 'Cadangan manual'} • {fmtWaktu(f.modifiedTime || f.createdTime)}{i === 0 ? '   • Terbaru' : ''}</Text>
                    <Text style={st.meta}>{f.buku ? `${f.buku} buku kas • ${f.tx} transaksi • ` : ''}{kb(f.size)}</Text>
                  </View>
                  <Text style={st.go}>Pilih ›</Text>
                </TouchableOpacity>))}
            </ScrollView>)}
        <TouchableOpacity onPress={onClose} style={st.cancel} accessibilityRole="button"><Text style={st.cancelT}>Tutup</Text></TouchableOpacity>
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,48,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe6e9', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: NAVY }, sub: { fontSize: 12.5, color: '#636e72', lineHeight: 18, marginTop: 4, marginBottom: 8 },
  center: { alignItems: 'center', paddingVertical: 28, gap: 10 }, muted: { fontSize: 13, color: '#636e72' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderColor: '#f0f3f6' },
  when: { fontSize: 14, fontWeight: '800', color: '#2d3436' }, meta: { fontSize: 12, color: '#636e72', marginTop: 2 }, go: { color: NAVY, fontWeight: '800', fontSize: 13 },
  cancel: { alignItems: 'center', paddingVertical: 14, marginTop: 6, borderRadius: 12, backgroundColor: '#eef1f4' }, cancelT: { fontWeight: '800', color: '#2d3436' },
});
