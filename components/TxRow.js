import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { s, GCOL } from '../theme';
import { MONTHS, rp, GREEN, RED } from '../lib/calc';
import { fromYmd } from './DateField';
import { Btn } from './ui';

export const shortDate = v => { const d = fromYmd(v); return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)}`; };

// Baris transaksi ringkas. Tanpa onEdit/onDelete = hanya tampilan (mis. di Dashboard).
export default function TxRow({ t, warn, onPress, expanded, onEdit, onDelete, showDate, fmt = rp }) {
  const inc = t.jenis === 'Pendapatan';
  return (
    <View style={{ borderBottomWidth: 1, borderColor: '#f0f3f6' }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={s.txRow}>
        <View style={[s.txDot, { backgroundColor: GCOL[t.jenis] || '#b2bec3' }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.txMain} numberOfLines={1}>{t.recurring_id ? '🔁 ' : ''}{t.kategori || '(tanpa kategori)'}{warn ? '  ⚠' : ''}</Text>
          <Text style={[s.txSub, warn ? { color: '#e17055' } : null]} numberOfLines={1}>{showDate ? shortDate(t.tanggal) + ' • ' : ''}{warn || t.ket || t.jenis}</Text>
        </View>
        <Text style={[s.txAmt, inc && { color: GREEN }]}>{inc ? '+' : '−'}{fmt(t.nominal)}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={s.txActions}>
          <Text style={[s.txSub, { width: '100%' }]}>{t.jenis} • {t.tanggal}{warn ? '  •  ' + warn : ''}</Text>
          {onEdit && <Btn small t="Edit" onPress={onEdit} />}
          {onDelete && <Btn small t="Hapus" color={RED} onPress={onDelete} />}
        </View>)}
    </View>
  );
}
