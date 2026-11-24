import React, { memo, useState } from 'react';
import { View } from 'react-native';
import ErrorBoundary from './ErrorBoundary';

// Halaman tab yang pernah dibuka tetap terpasang (disembunyikan dengan display:none), jadi kembali ke tab itu tidak
// membangun ulang seluruh layar. Penting untuk tab Anggaran: puluhan kategori x 2 kolom isian lambat dibuat di HP kelas bawah.
// - Tab yang tidak aktif TIDAK dirender ulang saat data berubah (props dibekukan). Begitu dibuka lagi, ia menerima props
//   terbaru (tick, bulan, dsb.) dan memperbarui isinya; useMemo di layar bergantung pada tick sehingga data ikut segar.
// - Ganti buku kas / terkunci lagi (resetKey berubah): semua halaman dibuang, hanya tab aktif yang dibuat ulang.
// - Tab yang belum pernah dibuka belum dibuat sama sekali (aplikasi tetap cepat dibuka).
// - Tab yang tampil hanya dirender ulang bila DATA-nya berubah (tick, bulan, tahun, sembunyikan angka, profil, ...).
//   Fungsi di props (bump, openForm, notify, ...) dibuat ulang di setiap render App tetapi isinya hanya memanggil setter
//   state, jadi diabaikan saat membandingkan. Bila kelak ada fungsi yang memakai nilai state secara langsung,
//   ubah fungsinya agar memakai setter berbentuk fungsi (setX(x => ...)) supaya tidak basi.
const sameData = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => (typeof a[k] === 'function' && typeof b[k] === 'function') || Object.is(a[k], b[k]));
};
const Page = memo(function Page({ Screen, props }) { return <Screen {...props} />; },
  (prev, next) => !next.active || (prev.Screen === next.Screen && sameData(prev.props, next.props)));

export default function TabStack({ tabs, tab, props, resetKey, locked }) {
  const [seen, setSeen] = useState(() => ({ key: resetKey, tabs: [tab] }));
  // Pembaruan state saat render (pola "derived state" React): catat tab baru / mulai ulang saat resetKey berubah.
  if (seen.key !== resetKey) setSeen({ key: resetKey, tabs: [tab] });
  else if (!seen.tabs.includes(tab)) setSeen({ key: resetKey, tabs: [...seen.tabs, tab] });
  if (locked) return null; // layar terkunci: tidak ada data keuangan yang dimuat di balik layar kunci
  const open = seen.key === resetKey ? seen.tabs : [tab];
  return tabs.map(([name, , Screen], k) => {
    if (k !== tab && !open.includes(k)) return null;
    const on = k === tab;
    return (
      <View key={`${k}|${resetKey}`} style={on ? { flex: 1 } : { display: 'none' }} importantForAccessibility={on ? 'auto' : 'no-hide-descendants'}>
        <ErrorBoundary label={`tab:${name}`} resetKeys={[on, props.y, props.m, props.tick]} title={`Layar ${name} bermasalah`}>
          <Page Screen={Screen} props={props} active={on} />
        </ErrorBoundary>
      </View>
    );
  });
}
