import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar as RNStatusBar } from 'react-native';
import { NAVY, BG } from '../theme';
import { describeError, errorText, sameKeys, reportError } from '../lib/errors';
import { exportAllBooks } from '../lib/backup';

// Tampilan saat terjadi kesalahan. Dipakai ErrorBoundary dan layar gagal-buka-database di App.js.
//   canBackup  : tampilkan tombol "Simpan cadangan data" (bagikan backup JSON semua buku kas lewat share sheet)
//   full       : layar penuh (di luar SafeAreaProvider, jadi memberi jarak atas sendiri)
export function ErrorFallback({ error, title = 'Terjadi kesalahan', hint, retryLabel = 'Coba lagi', onRetry, canBackup = true, full = false }) {
  const [bk, setBk] = useState(null); // null | 'busy' | { ok, text }
  const d = describeError(error);
  const backup = async () => {
    setBk('busy');
    try { const c = await exportAllBooks(); setBk({ ok: true, text: `Cadangan disiapkan: ${c.buku} buku kas, ${c.tx} transaksi.` }); }
    catch (e) { setBk({ ok: false, text: `Gagal menyimpan cadangan: ${errorText(e)}` }); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', padding: 24, paddingTop: full ? (RNStatusBar.currentHeight || 24) + 16 : 24 }} accessibilityRole="alert">
      <Text style={{ fontSize: 40, textAlign: 'center' }}>⚠️</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: NAVY, textAlign: 'center', marginTop: 8 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: '#636e72', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
        {hint || 'Data Anda aman: tidak ada yang dihapus. Ketuk "' + retryLabel + '" untuk mencoba lagi. Bila terus berulang, simpan cadangan data lalu mulai ulang aplikasi.'}
      </Text>
      <ScrollView style={{ maxHeight: 130, backgroundColor: '#fff', borderRadius: 12, marginTop: 16, padding: 10 }}>
        <Text selectable style={{ fontSize: 12, color: '#d63031', fontFamily: 'monospace' }}>{d.name}: {d.message}</Text>
      </ScrollView>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={retryLabel}
          style={{ backgroundColor: NAVY, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 16 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{retryLabel}</Text>
        </TouchableOpacity>)}
      {canBackup && (
        <TouchableOpacity onPress={backup} disabled={bk === 'busy'} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Simpan cadangan data"
          style={{ backgroundColor: '#fff', borderColor: NAVY, borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}>
          {bk === 'busy' ? <ActivityIndicator color={NAVY} /> : <Text style={{ color: NAVY, fontWeight: '800' }}>Simpan cadangan data</Text>}
        </TouchableOpacity>)}
      {bk && bk !== 'busy' && <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: bk.ok ? '#2e9e5b' : '#d63031' }}>{bk.text}</Text>}
    </View>
  );
}

// Pelindung error render: kesalahan di satu layar tidak lagi mematikan seluruh aplikasi.
//   label      : nama bagian (untuk catatan error)
//   resetKeys  : bila isinya berubah (ganti tab / bulan / buku kas), pelindung mencoba merender ulang anak-anaknya
//   onReset    : dipanggil saat tombol ditekan (mis. menutup overlay yang error)
//   retryLabel : tulisan tombol; title / hint / canBackup / full diteruskan ke ErrorFallback
// Catatan: error boundary hanya menangkap error saat render. Error di event handler / async ditangani try/catch masing-masing.
export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error: error != null ? error : new Error('Kesalahan tidak diketahui') }; }
  componentDidCatch(error, info) { reportError(this.props.label || 'app', error, info && info.componentStack); }
  componentDidUpdate(prev) {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) this.setState({ error: null });
  }
  retry = () => { this.setState({ error: null }); if (this.props.onReset) this.props.onReset(); };
  render() {
    if (this.state.error == null) return this.props.children;
    const { title, hint, retryLabel, canBackup, full } = this.props;
    return <ErrorFallback error={this.state.error} title={title} hint={hint} retryLabel={retryLabel} canBackup={canBackup} full={full} onRetry={this.retry} />;
  }
}
