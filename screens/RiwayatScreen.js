import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { s, NAVY } from '../theme';
import { Chips, MonthPicker } from '../components/ui';
import { fromYmd } from '../components/DateField';
import TxRow from '../components/TxRow';
import { db, bid } from '../lib/db';
import { JENIS, MONTHS, ym, rpk, GREEN, cek } from '../lib/calc';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dayLabel = v => { const d = fromYmd(v); return `${DAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`; };

export default function RiwayatScreen({ y, m, setY, setM, tick, openForm }) {
  const [filter, setFilter] = useState('Semua');
  const [q, setQ] = useState('');
  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories WHERE book_id=?', [bid()]), [tick]);
  const list = useMemo(() => db.getAllSync('SELECT * FROM transactions WHERE book_id=? AND substr(tanggal,1,7)=? ORDER BY tanggal DESC,id DESC', [bid(), ym(y, m)]), [y, m, tick]);
  const masuk = list.filter(t => t.jenis === 'Pendapatan').reduce((a, t) => a + (t.nominal || 0), 0);
  const keluar = list.filter(t => t.jenis !== 'Pendapatan').reduce((a, t) => a + (t.nominal || 0), 0);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return list.filter(t => (filter === 'Semua' || t.jenis === filter) && (!k || `${t.kategori} ${t.ket || ''}`.toLowerCase().includes(k)));
  }, [list, filter, q]);
  const days = useMemo(() => {
    const g = [];
    shown.forEach(t => { const last = g[g.length - 1]; if (last && last.tanggal === t.tanggal) last.items.push(t); else g.push({ tanggal: t.tanggal, items: [t] }); });
    return g;
  }, [shown]);

  return (
    <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 90 }]} keyboardShouldPersistTaps="handled">
      {/* Ringkasan bulan: pemilih bulan menyatu di kartu */}
      <View style={[s.hero, { backgroundColor: NAVY }]}>
        <MonthPicker {...{ y, m, setY, setM }} onHero />
        <View style={s.chip2}><Text style={s.heroS}>{list.length} TRANSAKSI</Text></View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={s.hp}>
            <Text style={s.hpL}>↓ MASUK</Text>
            <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rpk(masuk)}</Text>
          </View>
          <View style={s.hp}>
            <Text style={s.hpL}>↑ KELUAR</Text>
            <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rpk(keluar)}</Text>
          </View>
        </View>
      </View>
      <View style={s.sec}>
        <TextInput style={s.search} placeholder="🔍 Cari kategori atau keterangan…" value={q} onChangeText={setQ} />
        <Chips items={['Semua', ...JENIS]} value={filter} onPick={setFilter} />
        {days.length === 0 ? (
          <Text style={[s.rv, { textAlign: 'center', paddingVertical: 24 }]}>{list.length === 0 ? 'Belum ada transaksi bulan ini.\nKetuk tombol ＋ Transaksi untuk mencatat.' : 'Tidak ada transaksi yang cocok.'}</Text>
        ) : days.map(g => {
          const out = g.items.filter(t => t.jenis !== 'Pendapatan').reduce((a, t) => a + (t.nominal || 0), 0);
          return (
            <View key={g.tanggal}>
              <View style={s.dayH}><Text style={s.dayT}>{dayLabel(g.tanggal)}</Text>{out > 0 ? <Text style={s.dayS}>Keluar {rpk(out)}</Text> : null}</View>
              {g.items.map(t => { const c = cek(t, cats); return <TxRow key={t.id} t={t} warn={c.startsWith('✔') ? '' : c} onPress={() => openForm(t)} />; })}
            </View>);
        })}
        {days.length > 0 ? <Text style={[s.rv, { textAlign: 'center', marginTop: 10 }]}>Ketuk transaksi untuk mengedit atau menghapus</Text> : null}
      </View>
    </ScrollView>
  );
}
