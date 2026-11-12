import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVY } from '../theme';
import { getWebClientId, saveWebClientId, isValidClientId, cleanClientId } from '../lib/googleAuth';

// Panel untuk mengisi / mengganti Google Web Client ID langsung di aplikasi.
// Dipakai di layar sambutan dan halaman Profil. Saat nilai berubah, sesi Google lama diputus (lihat saveWebClientId).
export default function ClientIdSheet({ visible, hasSession, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setVal(getWebClientId()); setErr(''); setBusy(false); } }, [visible]);

  const clean = cleanClientId(val);
  const ok = clean === '' || isValidClientId(clean);
  const save = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try { const r = await saveWebClientId(clean); onSaved({ ...r, empty: clean === '' }); }
    catch (e) { setErr(String((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}><View style={st.backdrop} /></TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ justifyContent: 'flex-end' }}>
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.handle} />
          <Text style={st.title}>Google Web Client ID</Text>
          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            <Text style={st.p}>Tempel Client ID dari Google Cloud Console (Credentials › OAuth client ID › jenis <Text style={st.b}>Web application</Text>). Bila ID lama sudah dicabut, buat yang baru lalu tempel di sini; tidak perlu membangun ulang aplikasi.</Text>
            <TextInput
              style={[st.in, !ok && { borderColor: '#d63031' }]} value={val} onChangeText={t => { setVal(t); setErr(''); }}
              placeholder="1234567890-abcdefg.apps.googleusercontent.com" placeholderTextColor="#b2bec3"
              autoCapitalize="none" autoCorrect={false} multiline blurOnSubmit spellCheck={false} accessibilityLabel="Google Web Client ID" />
            {!ok ? <Text style={st.bad}>Format belum sesuai. Harus berakhiran .apps.googleusercontent.com</Text> : null}
            {err ? <Text style={st.bad}>{err}</Text> : null}
            <View style={st.note}>
              <Text style={st.noteT}>• Client Android (package <Text style={st.b}>com.yuda.budgetplanner</Text> + SHA-1) harus ada di project Google Cloud yang sama dengan Web Client ID ini.</Text>
              <Text style={st.noteT}>• Pakai project yang sama bila ingin cadangan lama di Drive tetap terbaca. Project baru tidak bisa melihat file milik project lama; data di HP tetap aman dan akan diunggah ulang.</Text>
              {hasSession ? <Text style={[st.noteT, { color: '#e17055', fontWeight: '700' }]}>• Anda sedang masuk. Bila ID diganti, sesi Google diputus dan perlu Hubungkan ulang di Profil. Data di HP tidak dihapus.</Text> : null}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={[st.btn, { backgroundColor: '#eef1f4' }]} onPress={onClose} accessibilityRole="button"><Text style={[st.btnT, { color: '#2d3436' }]}>Batal</Text></TouchableOpacity>
            <TouchableOpacity style={[st.btn, { backgroundColor: ok ? NAVY : '#b2bec3', flex: 1.4 }]} onPress={save} disabled={!ok || busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnT}>{clean === '' ? 'Kosongkan' : 'Simpan'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,48,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe6e9', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: NAVY, marginBottom: 6 }, p: { fontSize: 12.5, color: '#636e72', lineHeight: 19 }, b: { fontWeight: '800', color: '#2d3436' },
  in: { borderWidth: 1, borderColor: '#b2bec3', borderRadius: 12, padding: 12, marginTop: 10, fontSize: 14, minHeight: 74, textAlignVertical: 'top', backgroundColor: '#f6f8fb', color: '#2d3436' },
  bad: { color: '#d63031', fontSize: 12, marginTop: 6, lineHeight: 17 },
  note: { backgroundColor: '#f4f7fa', borderRadius: 12, padding: 12, marginTop: 12, gap: 6 }, noteT: { fontSize: 12, color: '#636e72', lineHeight: 18 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' }, btnT: { color: '#fff', fontWeight: '800' },
});
