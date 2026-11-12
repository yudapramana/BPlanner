import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

// Ikon garis (outline) bergaya modern, 24x24. Warna mengikuti status menu aktif/nonaktif.
const ICONS = {
  // Dashboard: 4 kotak
  dashboard: c => (<>
    <Rect x="3" y="3" width="7.5" height="7.5" rx="2" stroke={c} />
    <Rect x="13.5" y="3" width="7.5" height="7.5" rx="2" stroke={c} />
    <Rect x="3" y="13.5" width="7.5" height="7.5" rx="2" stroke={c} />
    <Rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" stroke={c} />
  </>),
  // Transaksi: dua panah berlawanan (uang masuk & keluar)
  transaksi: c => (<>
    <Path d="M8 3L4 7l4 4" stroke={c} />
    <Path d="M4 7h16" stroke={c} />
    <Path d="M16 21l4-4-4-4" stroke={c} />
    <Path d="M20 17H4" stroke={c} />
  </>),
  // Anggaran: dompet
  anggaran: c => (<>
    <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" stroke={c} />
    <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" stroke={c} />
  </>),
  // ---- Ikon buku kas ----
  pribadi: c => (<>
    <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" stroke={c} />
    <Circle cx="12" cy="7" r="4" stroke={c} />
  </>),
  keluarga: c => (<>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke={c} />
    <Circle cx="9" cy="7" r="4" stroke={c} />
    <Path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke={c} />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" stroke={c} />
  </>),
  acara: c => (<>
    <Rect x="3" y="4.5" width="18" height="17" rx="2.5" stroke={c} />
    <Path d="M16 2.5v4" stroke={c} />
    <Path d="M8 2.5v4" stroke={c} />
    <Path d="M3 10.5h18" stroke={c} />
  </>),
  proyek: c => (<Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={c} />),
  lainnya: c => (<Path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" stroke={c} />),
  check: c => (<Path d="M5 12.5l4.5 4.5L19 7.5" stroke={c} />),
  chevdown: c => (<Path d="M6 9l6 6 6-6" stroke={c} />),
  edit: c => (<>
    <Path d="M12 20h9" stroke={c} />
    <Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" stroke={c} />
  </>),
  // Tambah transaksi: plus tebal
  tambah: c => (<>
    <Path d="M12 5v14" stroke={c} />
    <Path d="M5 12h14" stroke={c} />
  </>),
  // Pengeluaran: tren turun
  pengeluaran: c => (<>
    <Path d="M22 17l-8.5-8.5-5 5L2 7" stroke={c} />
    <Path d="M16 17h6v-6" stroke={c} />
  </>),
};

export default function NavIcon({ name, color, size = 24, strokeWidth = 1.9 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name](color)}
    </Svg>
  );
}
