import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
import { s, NAVY, GCOL } from '../theme';
import { Btn, Section, MonthPicker, Chevron } from '../components/ui';
import Donut from '../components/Donut';
import BarChart from '../components/BarChart';
import { MONTHS, MONTHS_SHORT, rp, rpk, pct, ym, expenseYear, expenseByCategory } from '../lib/calc';
import { shareSheets, askFormat, failAlert } from '../lib/excel';

const PALETTE = ['#0984e3', '#e17055', '#00b894', '#6c5ce7', '#fdcb6e', '#e84393', '#00cec9', '#d63031', '#14365d', '#a29bfe', '#55efc4', '#636e72'];

// Pemilih bulan: pilih tahun (◀ ▶) lalu ketuk salah satu dari 12 bulan
function MonthSheet({ visible, y, m, onPick, onClose }) {
  const [py, setPy] = useState(y);
  const now = new Date();
  React.useEffect(() => { if (visible) setPy(y); }, [visible, y]);
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 22, padding: 16 }}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
            <TouchableOpacity onPress={() => setPy(py - 1)} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}><Chevron dir="left" color={NAVY} /></TouchableOpacity>
            <Text style={[s.mpT, { color: NAVY }]}>{py}</Text>
            <TouchableOpacity onPress={() => setPy(py + 1)} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}><Chevron dir="right" color={NAVY} /></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {MONTHS_SHORT.map((nm, i) => {
              const on = py === y && i + 1 === m;
              return (
                <TouchableOpacity key={nm} onPress={() => onPick(py, i + 1)} style={{ width: '31%', paddingVertical: 12, marginBottom: 8, borderRadius: 14, alignItems: 'center', backgroundColor: on ? NAVY : '#eef2f7' }}>
                  <Text style={{ color: on ? '#fff' : NAVY, fontWeight: '700' }}>{nm}</Text>
                </TouchableOpacity>);
            })}
          </View>
          <TouchableOpacity onPress={() => onPick(now.getFullYear(), now.getMonth() + 1)} style={{ alignSelf: 'center', paddingTop: 4 }}>
            <Text style={s.link}>↩ Bulan ini</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ExpensesScreen({ y, m, setY, setM, tick }) {
  const [pick, setPick] = useState(false);
  const year = useMemo(() => expenseYear(y), [y, tick]);
  const cats = useMemo(() => expenseByCategory(y, m), [y, m, tick]);
  const cur = year[m - 1];
  const yearTotal = year.reduce((a, r) => a + r.total, 0);
  const total = cur.total;
  const prev = m > 1 ? year[m - 2] : null;
  const now = new Date();

  const items = cats.map((c, i) => ({ ...c, key: c.jenis + c.nama, color: PALETTE[i % PALETTE.length] }));

  const doExport = format => shareSheets(`Pengeluaran_${y}`, [
    { name: `Per Bulan ${y}`, rows: [['Bulan', 'Biaya', 'Tagihan', 'Pinjaman', 'Total Pengeluaran'], ...year.map(r => [r.bulan, r.biaya, r.tagihan, r.pinjaman, r.total]), ['TOTAL', ...['biaya', 'tagihan', 'pinjaman', 'total'].map(k => year.reduce((a, r) => a + r[k], 0))]] },
    { name: `Kategori ${MONTHS[m - 1]}`.slice(0, 31), rows: [['Kelompok', 'Kategori', 'Jumlah', '%'], ...items.map(c => [c.jenis, c.nama, c.value, total > 0 ? pct(c.value / total) : ''])] },
  ], format).catch(failAlert('Export gagal'));

  return (
    <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 30 }]}>
      {/* Kartu total: pemilih bulan menyatu di dalamnya; ketuk nama bulan untuk lompat ke bulan/tahun lain */}
      <View style={[s.hero, { backgroundColor: NAVY }]}>
        <MonthPicker {...{ y, m, setY, setM }} onHero onPressLabel={() => setPick(true)} />
        <Text style={s.heroL}>Total pengeluaran</Text>
        <Text style={s.heroV} numberOfLines={1} adjustsFontSizeToFit>{rp(total)}</Text>
        <Text style={s.heroP}>Total tahun {y}: {rp(yearTotal)}</Text>
        {prev && prev.total > 0 && total > 0 && (
          <View style={s.chip2}>
            <Text style={s.heroS}>{total >= prev.total ? '▲' : '▼'} {pct(Math.abs(total - prev.total) / prev.total)} dibanding {MONTHS[m - 2]}</Text>
          </View>)}
      </View>

      <Section title={`Tren Pengeluaran ${y}`}>
        <BarChart
          data={year.map(r => ({ key: r.m, label: r.short, value: r.total }))}
          selected={m}
          onSelect={k => setM(k)}
        />
        <Text style={[s.leg, { marginTop: 8, textAlign: 'center', color: '#636e72' }]}>Ketuk batang untuk memilih bulan</Text>
      </Section>

      <Section title={`Per Kategori • ${MONTHS[m - 1]} ${y}`}>
        {items.length === 0 ? (
          <Text style={[s.rv, { textAlign: 'center', paddingVertical: 20 }]}>Belum ada pengeluaran di bulan ini.</Text>
        ) : (
          <>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <Donut size={180} stroke={30} top="Total" bottom={rpk(total)} data={items.map(c => ({ key: c.key, value: c.value, color: c.color }))} />
            </View>
            {items.map(c => (
              <View key={c.key} style={{ marginBottom: 12 }}>
                <View style={s.row}>
                  <View style={[s.txDot, { backgroundColor: c.color }]} />
                  <Text style={[s.txMain, { flex: 1 }]} numberOfLines={1}>{c.nama}</Text>
                  <Text style={s.txAmt}>{rp(c.value)}</Text>
                </View>
                <View style={[s.track, { height: 6, marginTop: 2 }]}><View style={{ width: (c.value / total) * 100 + '%', height: 6, backgroundColor: c.color, borderRadius: 3 }} /></View>
                <Text style={s.txSub}>{c.jenis} • {pct(c.value / total)}</Text>
              </View>))}
          </>)}
      </Section>

      <Btn t="Export Pengeluaran (Excel / CSV)" onPress={() => askFormat(doExport)} />

      <MonthSheet visible={pick} y={y} m={m} onClose={() => setPick(false)} onPick={(yy, mm) => { setY(yy); setM(mm); setPick(false); }} />
    </ScrollView>
  );
}
