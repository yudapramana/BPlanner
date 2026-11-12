import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import Avatar from '../components/Avatar';
import GoogleButton from '../components/GoogleButton';
import NavIcon from '../components/NavIcons';
import { NAVY, BG } from '../theme';
import { MONTHS } from '../lib/calc';
import { profileStats } from '../lib/auth';
import { getWebClientId, maskClientId } from '../lib/googleAuth';
import { fmtWaktu } from '../components/DriveSheet';

const tgl = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '-'; };

export default function ProfileScreen({ profile, onClose, onLogin, onLogout, onRename, onClientId, cfgTick, sessionOk, sync, onSyncNow, onReconnect }) {
  const [busy, setBusy] = useState(false);
  const [act, setAct] = useState(null); // 'sync' | 'reconnect' | 'logout' sedang berjalan
  const clientId = useMemo(() => getWebClientId(), [cfgTick]);
  const [editing, setEditing] = useState(false);
  const [nama, setNama] = useState('');
  const stats = profileStats(); // 3 COUNT sederhana; dihitung ulang tiap render agar angka ikut berubah setelah sinkron
  const version = (Constants.expoConfig && Constants.expoConfig.version) || '-';

  const login = async () => { setBusy(true); try { await onLogin(); } finally { setBusy(false); } };
  const run = async (name, fn) => { if (act) return; setAct(name); try { await fn(); } finally { setAct(null); } };
  const logout = () => Alert.alert('Keluar dari akun?',
    'Perubahan terakhir diunggah ke Google Drive lebih dulu, lalu SEMUA data di HP ini (buku kas, kategori, transaksi) dikosongkan.\n\nMasuk lagi dengan akun yang sama untuk memulihkan data dari Google Drive.',
    [{ text: 'Batal', style: 'cancel' }, { text: 'Keluar', style: 'destructive', onPress: () => run('logout', onLogout) }]);
  const startEdit = () => { setNama(profile.nama); setEditing(true); };
  const saveName = () => { if (!nama.trim()) return Alert.alert('Nama kosong', 'Isi nama tampilan terlebih dahulu.'); onRename(nama); setEditing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={st.top}>
        <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kembali"><Text style={st.back}>‹</Text></TouchableOpacity>
        <Text style={st.title}>Profil</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={[st.card, { alignItems: 'center', paddingVertical: 22 }]}>
          <Avatar profile={profile} size={88} />
          <Text style={st.name} numberOfLines={1}>{profile ? profile.nama : 'Belum masuk'}</Text>
          <Text style={st.email} numberOfLines={1}>{profile ? profile.email : 'Data Anda hanya ada di HP ini'}</Text>
          <View style={[st.badge, { backgroundColor: profile ? '#e3f6ec' : '#eef1f4' }]}>
            <View style={[st.dot, { backgroundColor: profile ? '#2e9e5b' : '#9aa5b1' }]} />
            <Text style={[st.badgeT, { color: profile ? '#1f7a45' : '#636e72' }]}>{profile ? 'Terhubung dengan Google' : 'Mode tanpa akun'}</Text>
          </View>
        </View>

        {!profile && (
          <View style={st.card}>
            <Text style={st.h}>Daftar / Masuk</Text>
            <Text style={st.p}>Masuk dengan akun Google untuk memulihkan data dari Google Drive dan menyinkronkan perubahan berikutnya. Pendaftaran otomatis saat pertama kali masuk.</Text>
            <View style={{ height: 12 }} />
            <GoogleButton onPress={login} loading={busy} />
          </View>)}

        {profile && (
          <View style={st.card}>
            <Text style={st.h}>Akun</Text>
            <View style={st.row}><Text style={st.k}>Email</Text><Text style={st.v} numberOfLines={1}>{profile.email}</Text></View>
            <View style={st.row}><Text style={st.k}>Bergabung</Text><Text style={st.v}>{tgl(profile.since)}</Text></View>
            {editing ? (
              <View style={{ marginTop: 8 }}>
                <Text style={st.k}>Nama tampilan</Text>
                <TextInput style={st.in} value={nama} onChangeText={setNama} maxLength={40} autoFocus placeholder="Nama Anda" />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={[st.btn, { backgroundColor: NAVY }]} onPress={saveName}><Text style={st.btnT}>Simpan</Text></TouchableOpacity>
                  <TouchableOpacity style={[st.btn, { backgroundColor: '#eef1f4' }]} onPress={() => setEditing(false)}><Text style={[st.btnT, { color: '#2d3436' }]}>Batal</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={st.row}>
                <Text style={st.k}>Nama tampilan</Text>
                <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }} accessibilityRole="button" accessibilityLabel="Ubah nama tampilan">
                  <Text style={st.v} numberOfLines={1}>{profile.nama}</Text>
                  <NavIcon name="edit" color={NAVY} size={16} />
                </TouchableOpacity>
              </View>)}
          </View>)}

        {profile && sessionOk === false && (
          <View style={[st.card, { backgroundColor: '#fff4ec' }]}>
            <Text style={[st.h, { color: '#c0561f' }]}>Sesi Google terputus</Text>
            <Text style={st.p}>Penyebabnya bisa Web Client ID diganti atau dicabut. Data di HP tetap aman. Hubungkan ulang dengan akun {profile.email} agar sinkron berjalan lagi.</Text>
            <TouchableOpacity style={[st.btn, { backgroundColor: '#e17055', flex: 0, marginTop: 10 }]} onPress={() => run('reconnect', onReconnect)} disabled={!!act} accessibilityRole="button">
              <Text style={st.btnT}>{act === 'reconnect' ? 'Menghubungkan…' : 'Hubungkan ulang'}</Text>
            </TouchableOpacity>
          </View>)}

        {profile && (
          <View style={st.card}>
            <Text style={st.h}>Sinkron Google Drive</Text>
            <Text style={[st.p, sync && sync.error ? { color: '#d63031' } : null]}>
              {!sync ? '' : sync.error ? `⚠ Sinkron terakhir gagal: ${sync.error}`
                : sync.last ? `Tersinkron ${fmtWaktu(sync.last)}${sync.pending ? ' • ada perubahan yang menunggu diunggah' : ''}`
                : sync.pending ? 'Menunggu sinkron pertama.' : 'Belum ada data untuk disinkronkan.'}
            </Text>
            <Text style={[st.p, { marginTop: 6 }]}>Perubahan diunggah otomatis sekitar 45 detik setelah Anda berhenti mengubah data, dan saat aplikasi ditutup. Batas {sync ? sync.cap : 60} sinkron otomatis per hari{sync ? ` (terpakai ${sync.usedToday})` : ''}.</Text>
            <TouchableOpacity style={[st.btn, { backgroundColor: NAVY, flex: 0, marginTop: 10 }]} onPress={() => run('sync', onSyncNow)} disabled={!!act} accessibilityRole="button">
              <Text style={st.btnT}>{act === 'sync' ? 'Menyinkronkan…' : '☁ Sinkronkan sekarang'}</Text>
            </TouchableOpacity>
          </View>)}

        <View style={st.card}>
          <Text style={st.h}>Pengaturan Google</Text>
          <View style={st.row}><Text style={st.k}>Web Client ID</Text><Text style={[st.v, !clientId && { color: '#e17055' }]} numberOfLines={1}>{clientId ? maskClientId(clientId) : 'Belum diisi'}</Text></View>
          <Text style={[st.p, { marginTop: 8 }]}>Diisi dari Google Cloud Console dan tersimpan di HP ini (tidak ikut terhapus saat keluar akun). Bila ID dicabut, buat yang baru lalu ganti di sini.</Text>
          <TouchableOpacity style={[st.btn, { backgroundColor: '#e8eef6', flex: 0, marginTop: 10 }]} onPress={onClientId} accessibilityRole="button">
            <Text style={[st.btnT, { color: NAVY }]}>{clientId ? 'Ubah Web Client ID' : 'Isi Web Client ID'}</Text>
          </TouchableOpacity>
        </View>

        <View style={st.card}>
          <Text style={st.h}>Data di perangkat ini</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {[['Buku kas', stats.buku], ['Transaksi', stats.tx], ['Kategori', stats.kat]].map(([k, v]) => (
              <View key={k} style={st.stat}><Text style={st.statV}>{v}</Text><Text style={st.statK}>{k}</Text></View>))}
          </View>
          <Text style={[st.p, { marginTop: 10 }]}>Aplikasi tetap bisa dipakai tanpa internet; data dicatat di HP ini lebih dulu. Bila sudah masuk, salinannya disinkronkan ke Google Drive Anda dan bisa dipulihkan di HP lain.</Text>
        </View>

        <View style={st.card}>
          <Text style={st.h}>Tentang aplikasi</Text>
          <View style={st.row}><Text style={st.k}>Versi</Text><Text style={st.v}>{version}</Text></View>
        </View>

        {profile && (
          <TouchableOpacity onPress={logout} disabled={!!act} style={[st.logout, act && { opacity: 0.6 }]} accessibilityRole="button"><Text style={st.logoutT}>{act === 'logout' ? 'Menyimpan & keluar…' : 'Keluar dari akun'}</Text></TouchableOpacity>)}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  back: { color: NAVY, fontSize: 34, lineHeight: 36, width: 28 }, title: { color: NAVY, fontSize: 18, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  name: { fontSize: 20, fontWeight: '800', color: NAVY, marginTop: 12, maxWidth: '100%' }, email: { fontSize: 13, color: '#636e72', marginTop: 2, maxWidth: '100%' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 }, badgeT: { fontSize: 12, fontWeight: '800' },
  h: { fontSize: 14, fontWeight: '800', color: NAVY, marginBottom: 8 }, p: { fontSize: 12.5, color: '#636e72', lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f3f6' },
  k: { fontSize: 13, color: '#636e72' }, v: { fontSize: 13, fontWeight: '700', color: '#2d3436', flexShrink: 1, textAlign: 'right' },
  in: { borderWidth: 1, borderColor: '#b2bec3', borderRadius: 10, padding: 10, backgroundColor: '#fff', marginTop: 4, fontSize: 15 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }, btnT: { color: '#fff', fontWeight: '800' },
  stat: { flex: 1, backgroundColor: '#f4f7fa', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }, statV: { fontSize: 20, fontWeight: '800', color: NAVY }, statK: { fontSize: 11, color: '#636e72', marginTop: 2 },
  logout: { borderWidth: 1.5, borderColor: '#d63031', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 }, logoutT: { color: '#d63031', fontWeight: '800', fontSize: 14 },
});
