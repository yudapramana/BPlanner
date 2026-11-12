import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { s, NAVY } from '../theme';
import { MONTHS, rp, pct, statusOf, GRAY } from '../lib/calc';

export const Card = ({ title, value, sub, color }) => (
  <View style={[s.card, { borderLeftColor: color || NAVY }]}>
    <Text style={s.cardT}>{title}</Text>
    <Text style={[s.cardV, color && { color }]}>{value}</Text>
    {sub ? <Text style={s.cardS}>{sub}</Text> : null}
  </View>
);

export const Btn = ({ t, onPress, color, small }) => (
  <TouchableOpacity onPress={onPress} style={[s.btn, { backgroundColor: color || NAVY }, small && { paddingVertical: 6 }]}>
    <Text style={s.btnT}>{t}</Text>
  </TouchableOpacity>
);

export const Chips = ({ items, value, onPick }) => (
  <View style={s.chips}>{items.map(i => (
    <TouchableOpacity key={i} onPress={() => onPick(i)} style={[s.chip, value === i && { backgroundColor: NAVY }]}>
      <Text style={[s.chipT, value === i && { color: '#fff' }]}>{i}</Text>
    </TouchableOpacity>))}</View>
);

export const Prog = ({ jenis, r, fmt = rp, pf = pct }) => {
  const st = statusOf(jenis, r, fmt);
  const w = r.budget > 0 ? Math.min(100, (r.real / r.budget) * 100) : r.real > 0 ? 100 : 0;
  const txt = st.color === GRAY ? '#636e72' : st.color;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={s.row}>
        <Text style={[s.rn, { fontWeight: '600' }]}>{r.nama}</Text>
        <Text style={[s.rv, { color: txt, fontWeight: '700' }]}>{r.p == null ? '' : pf(r.p)}</Text>
      </View>
      <View style={s.track}><View style={{ width: w + '%', height: 8, backgroundColor: st.color, borderRadius: 4, opacity: st.level === 'nobudget' ? 0.5 : 1 }} /></View>
      <View style={s.row}>
        <Text style={s.rv}>{fmt(r.real)} / {r.budget > 0 ? fmt(r.budget) : '—'}</Text>
        {st.label ? <Text style={[s.rv, { color: txt }]}>{st.label}</Text> : null}
      </View>
    </View>
  );
};

// Kotak ringkasan 2 kolom: nilai realisasi, anggaran, dan bar progres
export const Tile = ({ title, real, budget, color, fmt = rp, pf = pct }) => {
  const w = budget > 0 ? Math.min(100, (real / budget) * 100) : 0;
  return (
    <View style={s.tile}>
      <Text style={s.tileT}>{title}</Text>
      <Text style={s.tileV} numberOfLines={1} adjustsFontSizeToFit>{fmt(real)}</Text>
      <View style={[s.track, { marginTop: 6 }]}><View style={{ width: w + '%', height: 8, backgroundColor: color, borderRadius: 4 }} /></View>
      <Text style={s.tileS}>{budget > 0 ? `${pf(real / budget)} dari ${fmt(budget)}` : 'Belum dianggarkan'}</Text>
    </View>
  );
};

export const Section = ({ title, children }) => (<View style={s.sec}><Text style={s.secT}>{title}</Text>{children}</View>);

export const Chevron = ({ dir, color }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </Svg>
);

// Pemilih bulan ringkas berbentuk pil. onHero = true -> transparan (menyatu dengan kartu saldo).
export function MonthPicker({ y, m, setY, setM, onHero, onPressLabel }) {
  const step = d => { let nm = m + d, ny = y; if (nm < 1) { nm = 12; ny--; } if (nm > 12) { nm = 1; ny++; } setM(nm); setY(ny); };
  const now = new Date();
  const isNow = y === now.getFullYear() && m === now.getMonth() + 1;
  const fg = onHero ? '#fff' : NAVY;
  const bg = onHero ? 'rgba(255,255,255,0.20)' : '#fff';
  const hit = { top: 10, bottom: 10, left: 10, right: 10 };
  const row = (
    <View style={s.mpRow}>
      <View style={[s.mpPill, { backgroundColor: bg }]}>
        <TouchableOpacity onPress={() => step(-1)} hitSlop={hit} accessibilityLabel="Bulan sebelumnya"><Chevron dir="left" color={fg} /></TouchableOpacity>
        {onPressLabel
          ? <TouchableOpacity onPress={onPressLabel} hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }} accessibilityLabel="Pilih bulan"><Text style={[s.mpT, { color: fg }]}>{MONTHS[m - 1]} {y} ▾</Text></TouchableOpacity>
          : <Text style={[s.mpT, { color: fg }]}>{MONTHS[m - 1]} {y}</Text>}
        <TouchableOpacity onPress={() => step(1)} hitSlop={hit} accessibilityLabel="Bulan berikutnya"><Chevron dir="right" color={fg} /></TouchableOpacity>
      </View>
      {!isNow && (
        <TouchableOpacity onPress={() => { setY(now.getFullYear()); setM(now.getMonth() + 1); }} style={[s.mpNow, { backgroundColor: bg }]}>
          <Text style={[s.mpNowT, { color: fg }]}>Bulan ini</Text>
        </TouchableOpacity>)}
    </View>
  );
  return onHero ? row : <View style={{ marginBottom: 8, flexDirection: 'row' }}>{row}</View>;
}
