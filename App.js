import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, StyleSheet, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db, initDb, seedAll } from './db';
import { JENIS, MONTHS, rp, pct, ym, GREEN, ORANGE, RED, colorFor, monthData, yearData, highlights, cek } from './calc';

initDb();
const NAVY = '#14365d', BG = '#f3f6fa';
const GCOL = { Pendapatan: '#2e9e5b', Biaya: '#e17055', Tagihan: '#0984e3', Pinjaman: '#6c5ce7', 'Investasi/Tabungan': '#00b894' };

async function exportCsv(name, rows) {
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, csv);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: name });
  else Alert.alert('Tersimpan', uri);
}

const Card = ({ title, value, sub, color }) => (
  <View style={[s.card, { borderLeftColor: color || NAVY }]}>
    <Text style={s.cardT}>{title}</Text>
    <Text style={[s.cardV, color && { color }]}>{value}</Text>
    {sub ? <Text style={s.cardS}>{sub}</Text> : null}
  </View>
);
const Btn = ({ t, onPress, color, small }) => (
  <TouchableOpacity onPress={onPress} style={[s.btn, { backgroundColor: color || NAVY }, small && { paddingVertical: 6 }]}><Text style={s.btnT}>{t}</Text></TouchableOpacity>
);
const Chips = ({ items, value, onPick }) => (
  <View style={s.chips}>{items.map(i => (
    <TouchableOpacity key={i} onPress={() => onPick(i)} style={[s.chip, value === i && { backgroundColor: NAVY }]}>
      <Text style={[s.chipT, value === i && { color: '#fff' }]}>{i}</Text>
    </TouchableOpacity>))}</View>
);
const Prog = ({ jenis, r }) => {
  const c = colorFor(jenis, r.budget, r.real);
  const w = Math.min(100, (r.budget > 0 ? r.real / r.budget : r.real > 0 ? 1 : 0) * 100);
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={s.row}><Text style={s.rn}>{r.nama}</Text><Text style={s.rv}>{rp(r.real)} / {rp(r.budget)}  ({pct(r.p)})</Text></View>
      <View style={s.track}><View style={{ width: w + '%', height: 8, backgroundColor: c, borderRadius: 4 }} /></View>
    </View>
  );
};
const Section = ({ title, children }) => (<View style={s.sec}><Text style={s.secT}>{title}</Text>{children}</View>);

function MonthPicker({ y, m, setY, setM }) {
  const step = d => { let nm = m + d, ny = y; if (nm < 1) { nm = 12; ny--; } if (nm > 12) { nm = 1; ny++; } setM(nm); setY(ny); };
  return (
    <View style={s.mp}>
      <TouchableOpacity onPress={() => step(-1)}><Text style={s.mpA}>◀</Text></TouchableOpacity>
      <Text style={s.mpT}>{MONTHS[m - 1]} {y}</Text>
      <TouchableOpacity onPress={() => step(1)}><Text style={s.mpA}>▶</Text></TouchableOpacity>
    </View>
  );
}

function Dashboard({ y, m, setY, setM, tick }) {
  const D = useMemo(() => monthData(y, m), [y, m, tick]);
  const { d } = D;
  const bt = { budget: d.Biaya.budget + d.Tagihan.budget, real: d.Biaya.real + d.Tagihan.real };
  const alloc = [['Biaya', d.Biaya.real], ['Tagihan', d.Tagihan.real], ['Pinjaman', d.Pinjaman.real], ['Investasi/Tabungan', d['Investasi/Tabungan'].real], ['Saldo', Math.max(D.saldo, 0)]];
  const atot = alloc.reduce((a, x) => a + x[1], 0) || 1;
  const bars = [['Pendapatan', d.Pendapatan], ['Biaya+Tagihan', bt], ['Pinjaman', d.Pinjaman], ['Tabungan', d['Investasi/Tabungan']]];
  const bmax = Math.max(1, ...bars.map(b => Math.max(b[1].budget, b[1].real)));
  const doExport = () => exportCsv(`Dashboard_${ym(y, m)}.csv`, [
    ['Kelompok', 'Kategori', 'Anggaran', 'Realisasi', '%'],
    ...JENIS.flatMap(j => d[j].rows.map(r => [j, r.nama, r.budget, r.real, pct(r.p)])),
    [], ['Saldo Bulan Ini', D.saldo], ['Status', D.surplus ? 'SURPLUS' : 'DEFISIT'], ['Tingkat Tabungan', pct(D.tabungan)], ['Pengeluaran Terpakai', pct(D.terpakai)]]);
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <MonthPicker {...{ y, m, setY, setM }} />
      <Card title="PENDAPATAN" value={rp(d.Pendapatan.real)} sub={'Anggaran ' + rp(d.Pendapatan.budget)} color={GCOL.Pendapatan} />
      <Card title="BIAYA & TAGIHAN" value={rp(bt.real)} sub={'Anggaran ' + rp(bt.budget)} color={GCOL.Biaya} />
      <Card title="BAYAR PINJAMAN" value={rp(d.Pinjaman.real)} sub={'Anggaran ' + rp(d.Pinjaman.budget)} color={GCOL.Pinjaman} />
      <Card title="TABUNGAN & INVESTASI" value={rp(d['Investasi/Tabungan'].real)} sub={'Anggaran ' + rp(d['Investasi/Tabungan'].budget)} color={GCOL['Investasi/Tabungan']} />
      <Card title="SALDO BULAN INI" value={rp(D.saldo)} sub={'Rencana ' + rp(D.saldoPlan)} color={D.surplus ? GREEN : RED} />
      <Card title="STATUS KEUANGAN" value={D.surplus ? '▲ SURPLUS (PLUS)' : '▼ DEFISIT (MINUS)'} color={D.surplus ? GREEN : RED} />
      <Card title="TINGKAT TABUNGAN" value={pct(D.tabungan)} sub="Tabungan ÷ Pendapatan" />
      <Card title="PENGELUARAN TERPAKAI" value={pct(D.terpakai)} sub="(Biaya+Tagihan+Pinjaman) ÷ Anggarannya" />
      <Section title="Alokasi Dana (realisasi)">
        <View style={s.stack}>{alloc.map(([k, v]) => <View key={k} style={{ flex: v / atot, backgroundColor: GCOL[k] || '#b2bec3' }} />)}</View>
        {alloc.map(([k, v]) => <Text key={k} style={s.leg}><Text style={{ color: GCOL[k] || '#b2bec3' }}>■ </Text>{k}: {rp(v)} ({pct(v / atot)})</Text>)}
      </Section>
      <Section title="Anggaran vs Realisasi">
        {bars.map(([k, v]) => (
          <View key={k} style={{ marginBottom: 8 }}>
            <Text style={s.rn}>{k}</Text>
            <View style={{ height: 10, width: (v.budget / bmax) * 100 + '%', backgroundColor: '#b2bec3', marginTop: 2 }} />
            <View style={{ height: 10, width: (v.real / bmax) * 100 + '%', backgroundColor: NAVY, marginTop: 2 }} />
          </View>))}
        <Text style={s.leg}>■ abu = anggaran   ■ biru = realisasi</Text>
      </Section>
      <Section title="Ringkasan Arus Kas">
        <Text style={s.rn}>Pendapatan {rp(d.Pendapatan.real)}</Text>
        <Text style={s.rn}>− Biaya {rp(d.Biaya.real)}  − Tagihan {rp(d.Tagihan.real)}</Text>
        <Text style={s.rn}>− Pinjaman {rp(d.Pinjaman.real)}  − Tabungan {rp(d['Investasi/Tabungan'].real)}</Text>
        <Text style={[s.rn, { fontWeight: '700', color: D.surplus ? GREEN : RED }]}>= Saldo {rp(D.saldo)}</Text>
      </Section>
      {[['Pendapatan', 'Pendapatan'], ['Biaya', 'Biaya'], ['Tagihan', 'Pelacak Tagihan'], ['Pinjaman', 'Pelacak Pinjaman'], ['Investasi/Tabungan', 'Tabungan & Investasi']].map(([j, t]) => (
        <Section key={j} title={t}>{d[j].rows.map(r => <Prog key={r.nama} jenis={j} r={r} />)}
          <Text style={[s.rn, { fontWeight: '700' }]}>TOTAL {rp(d[j].real)} / {rp(d[j].budget)}</Text></Section>))}
      <Btn t="Export laporan (CSV)" onPress={doExport} />
    </ScrollView>
  );
}

function Input({ y, m, setY, setM, tick, bump }) {
  const blank = { id: null, tanggal: ym(y, m) + '-01', jenis: 'Biaya', kategori: '', nominal: '', ket: '' };
  const [f, setF] = useState(blank);
  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories ORDER BY urut,id'), [tick]);
  const list = useMemo(() => db.getAllSync('SELECT * FROM transactions WHERE substr(tanggal,1,7)=? ORDER BY tanggal DESC,id DESC', [ym(y, m)]), [y, m, tick]);
  const opts = cats.filter(c => c.jenis === f.jenis).map(c => c.nama);
  const save = () => {
    const nom = parseInt(String(f.nominal).replace(/\D/g, ''), 10) || 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tanggal)) return Alert.alert('Format tanggal', 'Gunakan YYYY-MM-DD');
    if (!f.kategori || !nom) return Alert.alert('Belum lengkap', 'Kategori dan nominal wajib diisi.');
    if (f.id) db.runSync('UPDATE transactions SET tanggal=?,jenis=?,kategori=?,nominal=?,ket=? WHERE id=?', [f.tanggal, f.jenis, f.kategori, nom, f.ket, f.id]);
    else db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket) VALUES(?,?,?,?,?)', [f.tanggal, f.jenis, f.kategori, nom, f.ket]);
    setF({ ...blank, tanggal: f.tanggal }); bump();
  };
  const del = t => Alert.alert('Hapus transaksi?', `${t.kategori} ${rp(t.nominal)}`, [{ text: 'Batal' }, { text: 'Hapus', style: 'destructive', onPress: () => { db.runSync('DELETE FROM transactions WHERE id=?', [t.id]); bump(); } }]);
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <MonthPicker {...{ y, m, setY, setM }} />
      <Section title={f.id ? 'Edit Transaksi' : 'Tambah Transaksi'}>
        <Text style={s.lbl}>Tanggal (YYYY-MM-DD)</Text>
        <TextInput style={s.in} value={f.tanggal} onChangeText={v => setF({ ...f, tanggal: v })} />
        <Text style={s.lbl}>Jenis Transaksi</Text>
        <Chips items={JENIS} value={f.jenis} onPick={v => setF({ ...f, jenis: v, kategori: '' })} />
        <Text style={s.lbl}>Kategori</Text>
        <Chips items={opts} value={f.kategori} onPick={v => setF({ ...f, kategori: v })} />
        <Text style={s.lbl}>Nominal (Rp)</Text>
        <TextInput style={s.in} keyboardType="numeric" value={String(f.nominal)} onChangeText={v => setF({ ...f, nominal: v })} />
        <Text style={s.lbl}>Keterangan</Text>
        <TextInput style={s.in} value={f.ket} onChangeText={v => setF({ ...f, ket: v })} />
        <Btn t={f.id ? 'Simpan Perubahan' : 'Tambah'} onPress={save} />
        {f.id ? <Btn t="Batal Edit" color="#636e72" onPress={() => setF(blank)} /> : null}
      </Section>
      <Section title={`Riwayat ${MONTHS[m - 1]} ${y} (${list.length})`}>
        {list.map(t => { const c = cek(t, cats); return (
          <View key={t.id} style={s.tx}>
            <Text style={s.rn}>{t.tanggal}  •  {t.jenis}  •  {t.kategori || '(kosong)'}</Text>
            <Text style={s.rv}>{rp(t.nominal)} {t.ket ? '— ' + t.ket : ''}</Text>
            <Text style={{ color: c.startsWith('✔') ? GREEN : ORANGE, fontSize: 12 }}>{c}</Text>
            <View style={s.row}>
              <Btn small t="Edit" onPress={() => setF({ ...t, nominal: String(t.nominal || ''), ket: t.ket || '' })} />
              <Btn small t="Hapus" color={RED} onPress={() => del(t)} />
            </View>
          </View>); })}
      </Section>
    </ScrollView>
  );
}

function Kategori({ tick, bump }) {
  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories ORDER BY urut,id'), [tick]);
  const [nw, setNw] = useState({});
  const rename = (c, v) => { v = v.trim(); if (!v || v === c.nama) return; db.runSync('UPDATE categories SET nama=? WHERE id=?', [v, c.id]); db.runSync('UPDATE transactions SET kategori=? WHERE jenis=? AND kategori=?', [v, c.jenis, c.nama]); bump(); };
  const setBud = (c, v) => { db.runSync('UPDATE categories SET anggaran=? WHERE id=?', [parseInt(v.replace(/\D/g, ''), 10) || 0, c.id]); bump(); };
  const add = j => {
    const n = (nw[j] || '').trim(); if (!n) return;
    if (cats.some(c => c.jenis === j && c.nama.toLowerCase() === n.toLowerCase())) return Alert.alert('Sudah ada', n);
    const u = db.getFirstSync('SELECT COALESCE(MAX(urut),-1)+1 u FROM categories WHERE jenis=?', [j]).u;
    db.runSync('INSERT INTO categories(jenis,nama,anggaran,urut) VALUES(?,?,0,?)', [j, n, u]); setNw({ ...nw, [j]: '' }); bump();
  };
  const remove = c => Alert.alert('Hapus kategori?', c.nama, [{ text: 'Batal' }, { text: 'Hapus', style: 'destructive', onPress: () => { db.runSync('DELETE FROM categories WHERE id=?', [c.id]); bump(); } }]);
  const reset = () => Alert.alert('Reset / Import Data Awal Excel', 'Semua kategori & transaksi diganti dengan data awal dari Excel.', [{ text: 'Batal' }, { text: 'Reset', style: 'destructive', onPress: () => { seedAll(); bump(); } }]);
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.cardS}>Ubah nama / anggaran lalu tekan selesai di keyboard. Anggaran berlaku sama untuk semua bulan.</Text>
      {JENIS.map(j => (
        <Section key={j} title={j.toUpperCase()}>
          {cats.filter(c => c.jenis === j).map(c => (
            <View key={c.id + c.nama + c.anggaran} style={s.row}>
              <TextInput style={[s.in, { flex: 1.4 }]} defaultValue={c.nama} onEndEditing={e => rename(c, e.nativeEvent.text)} />
              <TextInput style={[s.in, { flex: 1 }]} keyboardType="numeric" defaultValue={String(c.anggaran)} onEndEditing={e => setBud(c, e.nativeEvent.text)} />
              <TouchableOpacity onPress={() => remove(c)}><Text style={{ color: RED, fontSize: 20, paddingHorizontal: 6 }}>✕</Text></TouchableOpacity>
            </View>))}
          <View style={s.row}>
            <TextInput style={[s.in, { flex: 1 }]} placeholder="Kategori baru..." value={nw[j] || ''} onChangeText={v => setNw({ ...nw, [j]: v })} />
            <Btn small t="+ Tambah" onPress={() => add(j)} />
          </View>
          <Text style={[s.rn, { fontWeight: '700' }]}>TOTAL ANGGARAN {rp(cats.filter(c => c.jenis === j).reduce((a, c) => a + c.anggaran, 0))}</Text>
        </Section>))}
      <Btn t="Reset / Import Data Awal Excel" color="#636e72" onPress={reset} />
    </ScrollView>
  );
}

function Analisa({ y, setY, tick }) {
  const rows = useMemo(() => yearData(y), [y, tick]);
  const H = useMemo(() => highlights(rows), [rows]);
  const doExport = () => exportCsv(`Analisa_${y}.csv`, [
    ['Bulan', 'Pendapatan', 'Biaya', 'Tagihan', 'Pinjaman', 'Tabungan & Investasi', 'Total Pengeluaran', 'Saldo', 'Jumlah Transaksi', 'Status'],
    ...rows.map(r => [r.bulan, r.pend, r.biaya, r.tagihan, r.pinjaman, r.tab, r.total, r.saldo, r.n, r.n ? (r.saldo >= 0 ? 'PLUS' : 'MINUS') : '']),
    [], ['Total saldo', H.total], ['Rata-rata saldo', Math.round(H.avg)], ['Rasio tabungan', pct(H.rasio)]]);
  const hv = r => (r ? `${r.bulan} (${rp(r.saldo)})` : '-');
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
        {[['Total saldo setahun', rp(H.total)], ['Rata-rata saldo / bulan terisi', rp(H.avg)], ['Bulan saldo tertinggi', hv(H.hi)], ['Bulan saldo terendah', hv(H.lo)],
          ['Jumlah bulan PLUS', H.plus], ['Jumlah bulan MINUS', H.minus], ['Total tabungan & investasi', rp(H.tab)], ['Rasio tabungan / pendapatan', pct(H.rasio)]]
          .map(([k, v]) => <View key={k} style={s.row}><Text style={s.rn}>{k}</Text><Text style={[s.rv, { fontWeight: '700' }]}>{v}</Text></View>)}
      </Section>
      <Btn t="Export Analisa (CSV)" onPress={doExport} />
    </ScrollView>
  );
}

export default function App() {
  const now = new Date();
  const [tab, setTab] = useState(0);
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const [tick, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const P = { y, m, setY, setM, tick, bump };
  const tabs = ['Dashboard', 'Input', 'Kategori', 'Tahunan'];
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <View style={s.head}><Text style={s.headT}>Monthly Budget Planner</Text></View>
      <View style={{ flex: 1 }}>
        {tab === 0 && <Dashboard {...P} />}
        {tab === 1 && <Input {...P} />}
        {tab === 2 && <Kategori {...P} />}
        {tab === 3 && <Analisa {...P} />}
      </View>
      <View style={s.nav}>{tabs.map((t, i) => (
        <TouchableOpacity key={t} style={s.navI} onPress={() => setTab(i)}>
          <Text style={[s.navT, tab === i && { color: NAVY, fontWeight: '800' }]}>{['📊', '📝', '⚙️', '📅'][i]}{'\n'}{t}</Text>
        </TouchableOpacity>))}</View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
  head: { backgroundColor: NAVY, padding: 14 }, headT: { color: '#fff', fontSize: 18, fontWeight: '800' },
  pad: { padding: 12, paddingBottom: 30 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 5, elevation: 1 },
  cardT: { fontSize: 11, color: '#636e72', fontWeight: '700' }, cardV: { fontSize: 20, fontWeight: '800', color: NAVY }, cardS: { fontSize: 12, color: '#636e72', marginBottom: 4 },
  sec: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginVertical: 6 }, secT: { fontWeight: '800', color: NAVY, marginBottom: 8, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 },
  rn: { fontSize: 13, color: '#2d3436', flexShrink: 1 }, rv: { fontSize: 12, color: '#2d3436', flexShrink: 1 },
  track: { height: 8, backgroundColor: '#dfe6e9', borderRadius: 4 },
  stack: { flexDirection: 'row', height: 22, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }, leg: { fontSize: 12, marginTop: 2 },
  mp: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 8 },
  mpA: { fontSize: 22, color: NAVY, paddingHorizontal: 14 }, mpT: { fontSize: 17, fontWeight: '800', color: NAVY },
  btn: { borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', marginTop: 8 }, btnT: { color: '#fff', fontWeight: '700' },
  lbl: { fontSize: 12, color: '#636e72', marginTop: 8 },
  in: { borderWidth: 1, borderColor: '#b2bec3', borderRadius: 8, padding: 8, backgroundColor: '#fff', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: NAVY, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }, chipT: { color: NAVY, fontSize: 12 },
  tx: { borderBottomWidth: 1, borderColor: '#dfe6e9', paddingVertical: 8 },
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#dfe6e9' },
  navI: { flex: 1, alignItems: 'center', paddingVertical: 8 }, navT: { textAlign: 'center', fontSize: 11, color: '#636e72' },
});
