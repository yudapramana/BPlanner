import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, LayoutAnimation } from 'react-native';
import { s, NAVY, GCOL } from '../theme';
import { Btn, Prog, Section, MonthPicker } from '../components/ui';
import Donut from '../components/Donut';
import EyeIcon from '../components/EyeIcon';
import TxRow from '../components/TxRow';
import { db, bid } from '../lib/db';
import { JENIS, MONTHS, rp, rpk, pct, ym, MASK, MASK_PCT, GREEN, ORANGE, RED, GRAY, monthData, statusOf, colorFor } from '../lib/calc';
import { shareSheets, askFormat, failAlert } from '../lib/excel';
import { pendingList, thresholdNote, dueLabel, postOccurrence, NOTE_COLOR } from '../lib/recurring';

const GROUP_TITLE = { Pendapatan: 'Pendapatan', Biaya: 'Biaya', Tagihan: 'Pelacak Tagihan', Pinjaman: 'Pelacak Pinjaman', 'Investasi/Tabungan': 'Tabungan & Investasi' };
const ORDER = { over: 0, nobudget: 1, due: 2, warn: 3 };

// Kelompok yang bisa dilipat; baris 0/0 disembunyikan kecuali "Tampilkan semua"
function Group({ jenis, g, R, PC, defaultOpen, first }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [all, setAll] = useState(false);
  const active = g.rows.filter(r => r.budget > 0 || r.real > 0);
  const hidden = g.rows.length - active.length;
  const rows = all ? g.rows : active;
  const w = g.budget > 0 ? Math.min(100, (g.real / g.budget) * 100) : 0;
  const col = colorFor(jenis, g.budget, g.real);
  const toggle = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(!open); };
  return (
    <View style={first ? null : s.grp}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.6}>
        <View style={s.row}>
          <Text style={[s.secT, { marginBottom: 0, flex: 1, fontSize: 14 }]}>{open ? '▾' : '▸'}  {GROUP_TITLE[jenis]}</Text>
          <Text style={[s.rv, { fontWeight: '700' }]}>{R(g.real)}</Text>
        </View>
        <View style={[s.track, { height: 6, marginTop: 4 }]}><View style={{ width: w + '%', height: 6, backgroundColor: col, borderRadius: 3 }} /></View>
        <Text style={[s.rv, { marginTop: 3, color: '#636e72' }]}>{g.budget > 0 ? `${PC(g.real / g.budget)} dari ${R(g.budget)}` : 'Belum dianggarkan'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 10 }}>
          {rows.length === 0 ? <Text style={s.rv}>Belum ada kategori aktif.</Text> : rows.map(r => <Prog key={r.nama} jenis={jenis} r={r} fmt={R} pf={PC} />)}
          {hidden > 0 && (
            <TouchableOpacity onPress={() => setAll(!all)}>
              <Text style={s.link}>{all ? 'Sembunyikan kategori kosong' : `Tampilkan ${hidden} kategori kosong`}</Text>
            </TouchableOpacity>)}
        </View>)}
    </View>
  );
}

// Panel di dalam kartu saldo: ketuk untuk membuka rincian
function Panel({ label, icon, value, sub, active, onPress }) {
  return (
    <TouchableOpacity style={[s.hp, active && s.hpOn]} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ expanded: active }}>
      <View style={s.row}>
        <Text style={s.hpL}>{icon} {label}</Text>
        <Text style={s.hpL}>{active ? '▴' : '▾'}</Text>
      </View>
      <Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.hpS} numberOfLines={1}>{sub}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ y, m, setY, setM, tick, goTab, openForm, hide, toggleHide, openRec, bump, notify }) {
  // Mode tersembunyi: semua nominal & persen jadi tanda bintang
  const R = n => (hide ? MASK : rp(n));
  const RK = n => (hide ? MASK : rpk(n));
  const PC = v => (hide ? MASK_PCT : pct(v));
  const D = useMemo(() => monthData(y, m), [y, m, tick]);
  const { d } = D;
  const [panel, setPanel] = useState(null); // null | 'in' | 'out'
  const pick = k => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPanel(p => (p === k ? null : k)); };
  const bt = { budget: d.Biaya.budget + d.Tagihan.budget, real: d.Biaya.real + d.Tagihan.real };
  const tab = d['Investasi/Tabungan'];
  const outReal = d.Biaya.real + d.Tagihan.real + d.Pinjaman.real + tab.real;
  const outBud = d.Biaya.budget + d.Tagihan.budget + d.Pinjaman.budget + tab.budget;
  const empty = JENIS.every(j => d[j].real === 0);
  const recent = useMemo(() => db.getAllSync('SELECT * FROM transactions WHERE book_id=? AND substr(tanggal,1,7)=? ORDER BY tanggal DESC,id DESC LIMIT 5', [bid(), ym(y, m)]), [y, m, tick]);

  // Jatuh tempo dalam 7 hari (atau terlambat) dari transaksi berulang buku kas ini; selalu relatif terhadap hari ini, bukan bulan yang sedang dilihat
  const due = useMemo(() => pendingList({ lookback: 2, ahead: 1 }).filter(o => o.days <= 7).slice(0, 6), [tick]);
  const catatDue = o => { postOccurrence(o.r, o.periode); bump && bump(); notify && notify(`✔ ${o.r.kategori} dicatat`); };

  const attention = [];
  ['Biaya', 'Tagihan'].forEach(j => d[j].rows.forEach(r => { const st = statusOf(j, r, R); if (['over', 'warn', 'nobudget'].includes(st.level)) attention.push({ j, r, st }); }));
  d.Pinjaman.rows.forEach(r => { const st = statusOf('Pinjaman', r, R); if (st.level === 'due') attention.push({ j: 'Pinjaman', r, st }); });
  attention.sort((a, b) => ORDER[a.st.level] - ORDER[b.st.level]);

  const alloc = [['Biaya', d.Biaya.real], ['Tagihan', d.Tagihan.real], ['Pinjaman', d.Pinjaman.real], ['Investasi/Tabungan', tab.real], ['Saldo', Math.max(D.saldo, 0)]];
  const atot = alloc.reduce((a, x) => a + x[1], 0) || 1;
  const bars = [['Pendapatan', d.Pendapatan], ['Biaya+Tagihan', bt], ['Pinjaman', d.Pinjaman], ['Tabungan', tab]];
  const bmax = Math.max(1, ...bars.map(b => Math.max(b[1].budget, b[1].real)));
  const heroColor = D.surplus ? GREEN : RED;
  const useColor = D.terpakai < 0.8 ? GREEN : D.terpakai <= 1 ? ORANGE : RED;

  const doExport = format => shareSheets(`Dashboard_${ym(y, m)}`, [
    { name: 'Ringkasan', rows: [
      ['Indikator', 'Nilai'], ['Periode', `${MONTHS[m - 1]} ${y}`],
      ['Pendapatan (realisasi)', d.Pendapatan.real], ['Pendapatan (anggaran)', d.Pendapatan.budget],
      ['Biaya & Tagihan (realisasi)', bt.real], ['Biaya & Tagihan (anggaran)', bt.budget],
      ['Bayar Pinjaman (realisasi)', d.Pinjaman.real], ['Bayar Pinjaman (anggaran)', d.Pinjaman.budget],
      ['Tabungan & Investasi (realisasi)', tab.real], ['Tabungan & Investasi (anggaran)', tab.budget],
      ['Saldo Bulan Ini', D.saldo], ['Saldo Rencana', D.saldoPlan], ['Status', D.surplus ? 'SURPLUS' : 'DEFISIT'],
      ['Tingkat Tabungan', pct(D.tabungan)], ['Pengeluaran Terpakai', pct(D.terpakai)]] },
    { name: 'Kategori', rows: [['Kelompok', 'Kategori', 'Anggaran', 'Realisasi', '%'],
      ...JENIS.flatMap(j => d[j].rows.map(r => [j, r.nama, r.budget, r.real, r.p == null ? '' : pct(r.p)]))] },
  ], format).catch(failAlert('Export gagal'));

  return (
    <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 90 }]}>
      {/* Kartu saldo: pemilih bulan menyatu di dalamnya, 2 panel (Pemasukan / Pengeluaran) membuka rincian */}
      <View style={[s.hero, { backgroundColor: heroColor }]}>
        <View style={s.row}>
          <MonthPicker {...{ y, m, setY, setM }} onHero />
          <TouchableOpacity onPress={toggleHide} style={s.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={hide ? 'Tampilkan angka' : 'Sembunyikan angka'}>
            <EyeIcon off={hide} size={20} />
          </TouchableOpacity>
        </View>
        <View style={s.chip2}><Text style={s.heroS}>{D.surplus ? '▲ SURPLUS (PLUS)' : '▼ DEFISIT (MINUS)'}</Text></View>
        <Text style={[s.heroL, { marginTop: 8 }]}>Saldo bulan ini</Text>
        <Text style={s.heroV} numberOfLines={1} adjustsFontSizeToFit>{R(D.saldo)}</Text>
        <Text style={s.heroP}>Rencana {R(D.saldoPlan)}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Panel icon="↓" label="PEMASUKAN" active={panel === 'in'} onPress={() => pick('in')}
            value={R(d.Pendapatan.real)} sub={d.Pendapatan.budget > 0 ? `${PC(d.Pendapatan.real / d.Pendapatan.budget)} dari ${R(d.Pendapatan.budget)}` : 'Belum dianggarkan'} />
          <Panel icon="↑" label="PENGELUARAN" active={panel === 'out'} onPress={() => pick('out')}
            value={R(outReal)} sub={outBud > 0 ? `${PC(outReal / outBud)} dari ${R(outBud)}` : 'Belum dianggarkan'} />
        </View>
      </View>

      {/* Rincian muncul hanya setelah panel diketuk */}
      {panel === 'in' && (
        <View style={s.sec}>
          <Group jenis="Pendapatan" g={d.Pendapatan} R={R} PC={PC} defaultOpen first />
        </View>)}
      {panel === 'out' && (
        <View style={s.sec}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={s.stat}>
              <Text style={s.tileT}>TINGKAT TABUNGAN</Text>
              <Text style={s.tileV}>{PC(D.tabungan)}</Text>
              <Text style={s.tileS}>Tabungan ÷ Pendapatan</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.tileT}>PENGELUARAN TERPAKAI</Text>
              <Text style={[s.tileV, { color: useColor }]}>{PC(D.terpakai)}</Text>
              <View style={[s.track, { marginTop: 4, height: 6 }]}><View style={{ width: Math.min(100, D.terpakai * 100) + '%', height: 6, backgroundColor: useColor, borderRadius: 3 }} /></View>
            </View>
          </View>
          {['Biaya', 'Tagihan', 'Pinjaman', 'Investasi/Tabungan'].map((j, i) => <Group key={j} jenis={j} g={d[j]} R={R} PC={PC} first={i === 0} />)}
        </View>)}

      {empty && (
        <View style={[s.sec, { alignItems: 'center' }]}>
          <Text style={s.secT}>Belum ada transaksi bulan ini</Text>
          <Text style={[s.rv, { textAlign: 'center' }]}>Catat transaksi pertama untuk melihat ringkasan bulan {MONTHS[m - 1]}.</Text>
          <Btn t="+ Tambah transaksi" onPress={() => openForm()} />
        </View>)}

      {/* Jatuh tempo: transaksi berulang yang belum dicatat. Catatan 80%/100% memakai ambang yang sama dengan status kategori. */}
      {due.length > 0 && (
        <Section title="🔁 Jatuh Tempo">
          {due.map(o => {
            const note = thresholdNote(o.r, o.periode, R, PC);
            const dc = o.days < 0 ? RED : o.days <= 3 ? ORANGE : '#636e72';
            return (
              <View key={o.r.id + o.periode} style={[s.row, { alignItems: 'flex-start', marginBottom: 10 }]}>
                <Text style={{ color: GCOL[o.r.jenis], fontSize: 16 }}>●</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rn, { fontWeight: '700' }]}>{o.r.kategori}{o.r.ket ? ` • ${o.r.ket}` : ''}</Text>
                  <Text style={[s.rv, { color: dc, fontWeight: '700' }]}>{dueLabel(o.days)} • {R(o.r.nominal)}</Text>
                  {note ? <Text style={[s.rv, { color: NOTE_COLOR[note.level], fontWeight: '700' }]}>{note.text}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => catatDue(o)} style={{ backgroundColor: NAVY, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 }} accessibilityRole="button" accessibilityLabel={`Catat ${o.r.kategori}`}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Catat</Text>
                </TouchableOpacity>
              </View>);
          })}
          <TouchableOpacity onPress={() => openRec && openRec()}><Text style={s.link}>Kelola transaksi berulang →</Text></TouchableOpacity>
        </Section>)}

      {/* Perlu perhatian */}
      <Section title="Perlu Perhatian">
        {attention.length === 0 ? <Text style={[s.rn, { color: GREEN, fontWeight: '700' }]}>✔ Semua terkendali bulan ini</Text> : attention.map(({ j, r, st }) => (
          <View key={j + r.nama} style={[s.row, { alignItems: 'flex-start', marginBottom: 8 }]}>
            <Text style={{ color: st.color, fontSize: 16 }}>●</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.rn, { fontWeight: '700' }]}>{r.nama}</Text>
              <Text style={s.rv}>{j} • {R(r.real)} / {r.budget > 0 ? R(r.budget) : '—'}</Text>
            </View>
            <Text style={[s.rv, { color: st.color === GRAY ? '#636e72' : st.color, fontWeight: '700' }]}>{st.label}</Text>
          </View>))}
      </Section>

      {recent.length > 0 && (
        <Section title="Transaksi Terbaru">
          {recent.map(t => <TxRow key={t.id} t={t} showDate fmt={R} onPress={() => openForm(t)} />)}
          <TouchableOpacity onPress={() => goTab && goTab(1)} style={{ paddingTop: 10 }}><Text style={[s.link, { textAlign: 'center' }]}>Lihat semua transaksi →</Text></TouchableOpacity>
        </Section>)}

      {/* Grafik */}
      <Section title="Alokasi Dana">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Donut size={140} stroke={24} top="Pendapatan" bottom={RK(d.Pendapatan.real)}
            data={alloc.map(([k, v]) => ({ key: k, value: v, color: GCOL[k] || GRAY }))} />
          <View style={{ flex: 1 }}>
            {alloc.map(([k, v]) => (
              <View key={k} style={[s.row, { marginBottom: 6 }]}>
                <Text style={{ color: GCOL[k] || GRAY, fontSize: 14 }}>●</Text>
                <Text style={[s.rv, { flex: 1 }]} numberOfLines={1}>{k === 'Investasi/Tabungan' ? 'Tabungan' : k}</Text>
                <Text style={[s.rv, { fontWeight: '700' }]}>{hide ? MASK_PCT : atot > 1 || v > 0 ? pct(v / atot) : '0%'}</Text>
              </View>))}
          </View>
        </View>
        <Text style={[s.leg, { marginTop: 6 }]}>{alloc.map(([k, v]) => `${k === 'Investasi/Tabungan' ? 'Tabungan' : k} ${RK(v)}`).join('  •  ')}</Text>
      </Section>
      <Section title="Anggaran vs Realisasi">
        {bars.map(([k, v]) => (
          <View key={k} style={{ marginBottom: 10 }}>
            <View style={s.row}><Text style={s.rn}>{k}</Text><Text style={s.rv}>{RK(v.real)} / {RK(v.budget)}</Text></View>
            <View style={{ height: 10, width: Math.max(2, (v.budget / bmax) * 100) + '%', backgroundColor: GRAY, marginTop: 2, borderRadius: 3 }} />
            <View style={{ height: 10, width: Math.max(2, (v.real / bmax) * 100) + '%', backgroundColor: NAVY, marginTop: 2, borderRadius: 3 }} />
          </View>))}
        <Text style={s.leg}>■ abu = anggaran   ■ biru = realisasi</Text>
      </Section>
      <Section title="Ringkasan Arus Kas">
        <Text style={s.rn}>Pendapatan {R(d.Pendapatan.real)}</Text>
        <Text style={s.rn}>− Biaya {R(d.Biaya.real)}  − Tagihan {R(d.Tagihan.real)}</Text>
        <Text style={s.rn}>− Pinjaman {R(d.Pinjaman.real)}  − Tabungan {R(tab.real)}</Text>
        <Text style={[s.rn, { fontWeight: '700', color: heroColor }]}>= Saldo {R(D.saldo)}</Text>
      </Section>

      <Btn t="Export laporan (Excel / CSV)" onPress={() => askFormat(doExport)} />
    </ScrollView>
  );
}
