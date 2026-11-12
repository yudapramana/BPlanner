import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { s } from '../theme';
import { Btn, Section } from '../components/ui';
import { rp, pct, GREEN, RED, yearData, highlights } from '../lib/calc';
import { shareSheets, askFormat, failAlert } from '../lib/excel';

export default function AnalisaScreen({ y, setY, tick }) {
  const rows = useMemo(() => yearData(y), [y, tick]);
  const H = useMemo(() => highlights(rows), [rows]);
  const hv = r => (r ? `${r.bulan} (${rp(r.saldo)})` : '-');
  const sorotan = [['Total saldo setahun', rp(H.total)], ['Rata-rata saldo / bulan terisi', rp(H.avg)], ['Bulan saldo tertinggi', hv(H.hi)], ['Bulan saldo terendah', hv(H.lo)],
    ['Jumlah bulan PLUS', H.plus], ['Jumlah bulan MINUS', H.minus], ['Total tabungan & investasi', rp(H.tab)], ['Rasio tabungan / pendapatan', pct(H.rasio)]];

  const doExport = format => shareSheets(`Analisa_${y}`, [
    { name: `Rekap ${y}`, rows: [['Bulan', 'Pendapatan', 'Biaya', 'Tagihan', 'Pinjaman', 'Tabungan & Investasi', 'Total Pengeluaran', 'Saldo', 'Jumlah Transaksi', 'Status'],
      ...rows.map(r => [r.bulan, r.pend, r.biaya, r.tagihan, r.pinjaman, r.tab, r.total, r.saldo, r.n, r.n ? (r.saldo >= 0 ? 'PLUS' : 'MINUS') : ''])] },
    { name: 'Sorotan', rows: [['Indikator', 'Nilai'], ...sorotan] },
  ], format).catch(failAlert('Export gagal'));

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <View style={s.mp}>
        <TouchableOpacity onPress={() => setY(y - 1)}><Text style={s.mpA}>◀</Text></TouchableOpacity>
        <Text style={s.mpT}>Tahun {y}</Text>
        <TouchableOpacity onPress={() => setY(y + 1)}><Text style={s.mpA}>▶</Text></TouchableOpacity>
      </View>
      <Section title="Rekap 12 Bulan">
        {rows.map(r => (
          <View key={r.m} style={s.tx}>
            <View style={s.row}><Text style={[s.rn, { fontWeight: '700' }]}>{r.bulan}</Text>
              <Text style={{ fontWeight: '700', color: r.n ? (r.saldo >= 0 ? GREEN : RED) : '#b2bec3' }}>{r.n ? (r.saldo >= 0 ? 'PLUS' : 'MINUS') : '-'}</Text></View>
            <Text style={s.rv}>Pendapatan {rp(r.pend)}</Text>
            <Text style={s.rv}>Biaya {rp(r.biaya)} • Tagihan {rp(r.tagihan)} • Pinjaman {rp(r.pinjaman)}</Text>
            <Text style={s.rv}>Tabungan {rp(r.tab)} • Total keluar {rp(r.total)}</Text>
            <Text style={s.rv}>Saldo {rp(r.saldo)} • {r.n} transaksi</Text>
          </View>))}
      </Section>
      <Section title="Sorotan Tahun Ini">
        {sorotan.map(([k, v]) => <View key={k} style={s.row}><Text style={s.rn}>{k}</Text><Text style={[s.rv, { fontWeight: '700' }]}>{v}</Text></View>)}
      </Section>
      <Btn t="Export Analisa (Excel / CSV)" onPress={() => askFormat(doExport)} />
    </ScrollView>
  );
}
