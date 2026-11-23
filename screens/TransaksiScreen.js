import React, { useState, useMemo } from 'react';
import { View, Text, SectionList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { s, NAVY } from '../theme';
import { Chips, MonthPicker } from '../components/ui';
import { fromYmd } from '../components/DateField';
import TxRow from '../components/TxRow';
import { db, bid, txByPrefix, DATE_IN, dateRange } from '../lib/db';
import { JENIS, MONTHS, ym, rpk, cek, filterTx, groupByDay } from '../lib/calc';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dayLabel = (v, withYear) => { const d = fromYmd(v); return `${DAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`; };
const SCOPES = [['Bulan ini', 'Bulan'], ['Tahun ini', 'Tahun'], ['Semua waktu', 'Semua']];
const sumOf = (list, masuk) => list.reduce((a, t) => a + ((t.jenis === 'Pendapatan') === masuk ? t.nominal || 0 : 0), 0);

// Daftar memakai SectionList (tervirtualisasi): hanya baris yang terlihat di layar yang dirender, jadi data bertahun-tahun
// tetap lancar tanpa batas jumlah baris. Kartu putih dibentuk dari 3 bagian: atas (header daftar), isi (judul hari & baris), bawah (footer).
export default function TransaksiScreen({ y, m, setY, setM, tick, openForm, openRec }) {
  const [filter, setFilter] = useState('Semua');
  const [kat, setKat] = useState('');
  const [scope, setScope] = useState('Bulan');
  const [q, setQ] = useState('');
  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories WHERE book_id=?', [bid()]), [tick]);
  const list = useMemo(() => db.getAllSync(`SELECT * FROM transactions WHERE book_id=? AND ${DATE_IN} ORDER BY tanggal DESC,id DESC`, [bid(), ...dateRange(ym(y, m))]), [y, m, tick]); // ringkasan bulan di kartu atas
  const masuk = sumOf(list, true), keluar = sumOf(list, false);
  const base = useMemo(() => (scope === 'Bulan' ? list : txByPrefix(scope === 'Tahun' ? String(y) : '', -1)), [scope, list, y, tick]); // -1 = tanpa batas (SQLite)
  const shown = useMemo(() => filterTx(base, { jenis: filter, kategori: kat, q }), [base, filter, kat, q]);
  const katNames = useMemo(() => [...new Set(cats.filter(c => c.jenis === filter).map(c => c.nama))].sort((a, b) => a.localeCompare(b)), [cats, filter]);
  const sections = useMemo(() => groupByDay(shown), [shown]);
  const pickJenis = v => { setFilter(v); setKat(''); };
  const searching = !!q.trim() || filter !== 'Semua' || !!kat;
  const filtering = searching || scope !== 'Bulan';
  const withYear = scope !== 'Bulan';
  const warnOf = t => { const c = cek(t, cats); return c.startsWith('✔') ? '' : c; };

  // Elemen (bukan komponen fungsi) agar TextInput pencarian tidak dipasang ulang setiap ketikan (keyboard tidak tertutup)
  const header = (
    <>
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
      <View style={st.top}>
        <TouchableOpacity onPress={() => openRec && openRec()} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#eef2f7', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 }} accessibilityRole="button" accessibilityLabel="Transaksi berulang dan pengingat tagihan">
          <Text style={{ color: NAVY, fontWeight: '800', fontSize: 13 }}>🔁 Transaksi Berulang & Pengingat</Text>
          <Text style={{ color: NAVY, fontWeight: '800' }}>›</Text>
        </TouchableOpacity>
        <TextInput style={s.search} placeholder="🔍 Cari kategori atau keterangan…" value={q} onChangeText={setQ} />
        <Chips items={SCOPES.map(x => x[0])} value={SCOPES.find(x => x[1] === scope)[0]} onPick={v => setScope(SCOPES.find(x => x[0] === v)[1])} />
        <Chips items={['Semua', ...JENIS]} value={filter} onPick={pickJenis} />
        {filter !== 'Semua' && katNames.length > 0 ? <Chips items={['Semua kategori', ...katNames]} value={kat || 'Semua kategori'} onPick={v => setKat(v === 'Semua kategori' ? '' : v)} /> : null}
        {filtering ? <Text style={[s.rv, { marginBottom: 6 }]}>{shown.length} transaksi  •  ↓ {rpk(sumOf(shown, true))}  •  ↑ {rpk(sumOf(shown, false))}</Text> : null}
      </View>
    </>
  );

  const empty = (
    <View style={[st.body, { alignItems: 'center', paddingVertical: 24 }]}>
      <Text style={[s.rv, { textAlign: 'center' }]}>{scope === 'Bulan' && list.length === 0 && !searching ? 'Belum ada transaksi bulan ini.\nKetuk tombol ＋ di tengah untuk mencatat.' : 'Tidak ada transaksi yang cocok.'}</Text>
      {scope === 'Bulan' && searching ? (
        <TouchableOpacity onPress={() => setScope('Semua')} style={{ marginTop: 10, padding: 8 }} accessibilityRole="button"><Text style={{ color: NAVY, fontWeight: '800', textDecorationLine: 'underline' }}>Cari di semua waktu</Text></TouchableOpacity>) : null}
    </View>
  );

  const footer = (
    <View style={st.foot}>
      {sections.length > 0 ? <Text style={[s.rv, { textAlign: 'center' }]}>Ketuk transaksi untuk mengedit atau menghapus</Text> : null}
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={t => String(t.id)}
      contentContainerStyle={[s.pad, { paddingBottom: 90 }]}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      initialNumToRender={25}
      maxToRenderPerBatch={25}
      windowSize={11}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      renderSectionHeader={({ section }) => (
        <View style={st.body}>
          <View style={s.dayH}><Text style={s.dayT}>{dayLabel(section.tanggal, withYear)}</Text>{section.out > 0 ? <Text style={s.dayS}>Keluar {rpk(section.out)}</Text> : null}</View>
        </View>)}
      renderItem={({ item: t }) => (
        <View style={st.body}>
          <TxRow t={t} warn={warnOf(t)} onPress={() => openForm(t)} />
        </View>)}
    />
  );
}

// Tiga potongan kartu putih (sama dengan s.sec: putih, sudut 18, padding 14) agar daftar tetap tampil sebagai satu kartu
const CARD = '#fff', R = 18, P = 14;
const st = StyleSheet.create({
  top: { backgroundColor: CARD, borderTopLeftRadius: R, borderTopRightRadius: R, paddingHorizontal: P, paddingTop: P, marginTop: 6 },
  body: { backgroundColor: CARD, paddingHorizontal: P },
  foot: { backgroundColor: CARD, borderBottomLeftRadius: R, borderBottomRightRadius: R, paddingHorizontal: P, paddingTop: 10, paddingBottom: P, marginBottom: 6 },
});
