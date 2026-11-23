import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NavIcon from './NavIcons';
import { NAVY, BG } from '../theme';
import { authenticate, deviceLockAvailable, setLockEnabled, reasonText } from '../lib/lock';

// Lapisan penutup penuh. Hanya dipasang selama aplikasi terkunci; saat muncul langsung meminta autentikasi.
// Bila HP ternyata tidak lagi punya kunci layar, kunci aplikasi dimatikan otomatis (kalau tidak, pengguna terkunci selamanya).
export default function LockScreen({ onUnlock }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);

  const unlock = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setMsg('');
    try {
      if (!(await deviceLockAvailable())) { setLockEnabled(false); onUnlock({ disabled: true }); return; }
      const r = await authenticate();
      if (r.ok) onUnlock({}); else if (alive.current) setMsg(reasonText(r.reason));
    } finally { running.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { alive.current = true; const t = setTimeout(unlock, 300); return () => { alive.current = false; clearTimeout(t); }; }, []);

  return (
    <View style={[st.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
      <View style={st.mid}>
        <View style={st.logo}><NavIcon name="anggaran" color="#fff" size={44} strokeWidth={2} /></View>
        <Text style={st.title}>Aplikasi terkunci</Text>
        <Text style={st.sub}>Gunakan sidik jari, wajah, atau kunci layar HP Anda untuk membuka.</Text>
        {!!msg && <Text style={st.msg}>{msg}</Text>}
      </View>
      <TouchableOpacity onPress={unlock} disabled={busy} style={[st.btn, busy && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={st.btnT}>{busy ? 'Memeriksa…' : 'Buka kunci'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BG, paddingHorizontal: 24, justifyContent: 'space-between', zIndex: 100, elevation: 100 },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 92, height: 92, borderRadius: 28, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { fontSize: 22, fontWeight: '800', color: NAVY, textAlign: 'center' },
  sub: { fontSize: 14, color: '#636e72', textAlign: 'center', marginTop: 10, lineHeight: 21, paddingHorizontal: 8 },
  msg: { fontSize: 13, color: '#d63031', textAlign: 'center', marginTop: 14, lineHeight: 19 },
  btn: { backgroundColor: NAVY, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }, btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});