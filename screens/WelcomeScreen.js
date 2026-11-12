import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NavIcon from '../components/NavIcons';
import GoogleButton from '../components/GoogleButton';
import { NAVY, BG } from '../theme';

// Tampil sekali saat pertama dibuka. Login bersifat opsional: aplikasi tetap bisa dipakai offline tanpa akun.
export default function WelcomeScreen({ onGoogle, onSkip, onClientId, clientIdSet }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await onGoogle(); } finally { setBusy(false); } };
  return (
    <View style={[st.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={st.mid}>
        <View style={st.logo}><NavIcon name="anggaran" color="#fff" size={44} strokeWidth={2} /></View>
        <Text style={st.title}>Monthly Budget Planner</Text>
        <Text style={st.sub}>Catat pemasukan dan pengeluaran, pantau anggaran tiap bulan. Aplikasi dimulai kosong; masuk dengan Google untuk memulihkan dan menyinkronkan data dari Google Drive Anda.</Text>
      </View>
      <View style={{ gap: 12 }}>
        <GoogleButton label="Daftar / Masuk dengan Google" onPress={go} loading={busy} />
        <TouchableOpacity onPress={onClientId} disabled={busy} style={st.cfg} accessibilityRole="button" accessibilityLabel="Atur Google Web Client ID">
          <Text style={st.cfgT}>⚙ Google Web Client ID: {clientIdSet ? 'sudah diisi (ketuk untuk ubah)' : 'belum diisi (ketuk untuk mengisi)'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip} disabled={busy} style={{ alignItems: 'center', padding: 12 }} accessibilityRole="button">
          <Text style={st.skip}>Lanjutkan tanpa akun</Text>
        </TouchableOpacity>
        <Text style={st.note}>Setelah masuk, data otomatis tersinkron ke Google Drive milik Anda sendiri (hanya file yang dibuat aplikasi ini). Saat keluar akun, data di HP dikosongkan dan bisa dipulihkan dengan masuk lagi. Tanpa akun, semua data hanya ada di HP ini.</Text>
      </View>
    </View>
  );
}
const st = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BG, paddingHorizontal: 24, justifyContent: 'space-between' },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 92, height: 92, borderRadius: 28, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { fontSize: 24, fontWeight: '800', color: NAVY, textAlign: 'center' },
  sub: { fontSize: 14, color: '#636e72', textAlign: 'center', marginTop: 10, lineHeight: 21, paddingHorizontal: 8 },
  cfg: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#e8eef6' }, cfgT: { color: NAVY, fontWeight: '700', fontSize: 12.5, textAlign: 'center' },
  skip: { color: NAVY, fontWeight: '800', fontSize: 15 },
  note: { fontSize: 11.5, color: '#8794a6', textAlign: 'center', lineHeight: 17 },
});
