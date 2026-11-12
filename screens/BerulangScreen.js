import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, Switch, Linking, BackHandler, StyleSheet } from 'react-native';
import { s, NAVY, BG, GCOL } from '../theme';
import { MonthPicker, Chevron, Btn } from '../components/ui';
import { db, bid, getBook } from '../lib/db';
import { JENIS, MONTHS_SHORT, rp, ORANGE, RED, GREEN, GRAY } from '../lib/calc';
import { INGAT, getRecurring, monthTotals, nextDue, dueLabel, dueDate, saveRecurring, deleteRecurring, postOccurrence, skipOccurrence, thresholdNote, todayYmd, NOTE_COLOR } from '../lib/recurring';
import { reminderAvailable, permissionState, askPermission, syncReminders, testReminder, getMask, setMask } from '../lib/reminders';
import useKeyboard from '../lib/useKeyboard';

const ICON = { Pendapatan: '💰', Biaya: '🛒', Tagihan: '🧾', Pinjaman: '🏦', 'Investasi/Tabungan': '🌱' };
const SHORT = { Pendapatan: 'Pendapatan', Biaya: 'Biaya', Tagihan: 'Tagihan', Pinjaman: 'Pinjaman', 'Investasi/Tabungan': 'Tabungan' };
const HARI_QUICK = [1, 5, 10, 15, 20, 25, 28];
const fmtNum = d => (d ? String(d).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
const shortDay = ymd => { const [y, m, d] = ymd.split('-'); return `${+d} ${MONTHS_SHORT[+m - 1]}`; };
const ingatLabel = v => (INGAT.find(x => x[0] === v) || INGAT[3])[1];
const ymPair = p => { const [y, m] = p.split('-').map(Number); return { y, m }; };
const ymStr = ({ y, m }) => `${y}-${String(m).padStart(2, '0')}`;

// ============================================================ Form tambah / edit
function RecForm({ rec, onClose, onDone }) {
  const scroller = useRef(null);
  const { wrapRef, overlap, ensure, onScroll } = useKeyboard(scroller, 0);
  const editing = !!rec;
  const bookId = rec ? rec.book_id : bid();
  const now = new Date();
  const curYm = todayYmd(now).slice(0, 7);
  const [f, setF] = useState(rec
    ? { jenis: rec.jenis, catId: rec.category_id, nominal: String(rec.nominal || ''), ket: rec.ket || '', hari: String(rec.hari), otomatis: !!rec.otomatis, ingat: rec.ingat, aktif: !!rec.aktif }
    : { jenis: 'Tagihan', catId: null, nominal: '', ket: '', hari: String(now.getDate()), otomatis: true, ingat: 3, aktif: true });
  const [mulai, setMulai] = useState(ymPair(rec ? rec.mulai : curYm));
  const [akhirOn, setAkhirOn] = useState(!!(rec && rec.akhir));
  const [akhir, setAkhir] = useState(ymPair(rec && rec.akhir ? rec.akhir : curYm));
  const [tried, setTried] = useState(false);

  const col = GCOL[f.jenis] || NAVY;
  const nom = parseInt(f.nominal || '0', 10) || 0;
  const hari = parseInt(f.hari || '0', 10) || 0;
  const mulaiS = ymStr(mulai), akhirS = akhirOn ? ymStr(akhir) : null;
  const rangeOk = !akhirS || akhirS >= mulaiS;
  const valid = f.catId != null && nom > 0 && hari >= 1 && hari <= 31 && rangeOk;

  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories WHERE book_id=? AND jenis=? ORDER BY urut,id', [bookId, f.jenis]), [f.jenis, bookId]);
  const sel = cats.find(c => c.id === f.catId) || null;

  // Pratinjau ambang 80%/100% untuk bulan jatuh tempo berikutnya (aturan yang sama dengan pengingat)
  const preview = useMemo(() => {
    if (!sel || nom <= 0) return null;
    const periode = mulaiS > curYm ? mulaiS : curYm;
    return thresholdNote({ category_id: sel.id, jenis: f.jenis, nominal: nom }, periode);
  }, [sel, nom, f.jenis, mulaiS, curYm]);

  // Berapa bulan yang akan langsung dicatat bila mulai di masa lalu (hanya mode otomatis)
  const backfill = useMemo(() => {
    if (!f.otomatis || !f.aktif || mulaiS > curYm || hari < 1) return 0;
    let n = 0;
    const today = todayYmd(now);
    for (let p = mulaiS; p <= curYm && p <= (akhirS || curYm) && n < 100; ) {
      const r = { hari }; if (dueDate(r, p) <= today) n++;
      const [y, m] = p.split('-').map(Number); p = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    return n;
  }, [f.otomatis, f.aktif, mulaiS, akhirS, hari, curYm]);

  const save = () => {
    if (!valid) { setTried(true); return; }
    const go = () => {
      try { saveRecurring({ ...f, nominal: nom, hari, mulai: mulaiS, akhir: akhirS }, editing ? rec.id : null, bookId); }
      catch (e) { return Alert.alert('Gagal menyimpan', String((e && e.message) || e)); }
      onDone(editing ? 'diperbarui' : 'tersimpan');
    };
    if (backfill > 1) Alert.alert('Catat bulan-bulan sebelumnya?', `Bulan mulai (${MONTHS_SHORT[mulai.m - 1]} ${mulai.y}) sudah lewat, sehingga ${backfill} transaksi akan langsung dicatat sekaligus. Ubah "Mulai bulan" ke bulan ini bila tidak diinginkan.`, [{ text: 'Batal', style: 'cancel' }, { text: `Simpan & catat ${backfill}`, onPress: go }]);
    else go();
  };
  const del = () => Alert.alert('Hapus transaksi berulang?', `${rec.kategori} ${rp(rec.nominal)}\n\nTransaksi yang sudah tercatat tidak ikut terhapus; hanya jadwal ke depannya yang dihentikan.`, [{ text: 'Batal', style: 'cancel' }, { text: 'Hapus', style: 'destructive', onPress: () => { deleteRecurring(rec.id); onDone('dihapus'); } }]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  return (
    <View ref={wrapRef} collapsable={false} style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, paddingBottom: overlap }}>
        <View style={[st.top, { backgroundColor: col }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={st.backBtn} accessibilityLabel="Kembali"><Chevron dir="left" color="#fff" /></TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={st.title}>{editing ? 'Edit Berulang' : 'Tambah Berulang'}</Text>
            <Text style={st.sub} numberOfLines={1}>Buku Kas: {getBook(bookId).nama}</Text>
          </View>
          {editing ? <TouchableOpacity onPress={del} hitSlop={12}><Text style={st.trash}>🗑</Text></TouchableOpacity> : <View style={{ width: 34 }} />}
        </View>

        <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={st.jenisRow}>
            {JENIS.map(j => { const on = f.jenis === j; return (
              <TouchableOpacity key={j} onPress={() => setF({ ...f, jenis: j, catId: null })} style={[st.jenis, on && { backgroundColor: GCOL[j], borderColor: GCOL[j] }]}>
                <Text style={{ fontSize: 18 }}>{ICON[j]}</Text>
                <Text style={[st.jenisT, on && { color: '#fff' }]} numberOfLines={1}>{SHORT[j]}</Text>
              </TouchableOpacity>); })}
          </View>

          <View style={[st.card, { borderTopColor: col, borderTopWidth: 4 }]}>
            <Text style={st.lbl}>NOMINAL TIAP BULAN</Text>
            <View style={st.amtRow}>
              <Text style={[st.rp, { color: col }]}>Rp</Text>
              <TextInput style={[st.amt, { color: col }]} onFocus={ensure} keyboardType="numeric" placeholder="0" placeholderTextColor="#b2bec3"
                value={fmtNum(f.nominal)} onChangeText={v => setF({ ...f, nominal: v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12) })} />
            </View>
            {tried && nom <= 0 ? <Text style={st.err}>Isi nominal lebih dari 0</Text> : null}
          </View>

          <View style={st.card}>
            <Text style={st.lbl}>KATEGORI</Text>
            <View style={st.wrap}>
              {cats.map(c => { const on = f.catId === c.id; return (
                <TouchableOpacity key={c.id} onPress={() => setF({ ...f, catId: c.id })} style={[st.cat, { borderColor: col }, on && { backgroundColor: col }]}>
                  <Text style={[st.catT, { color: on ? '#fff' : col }]}>{c.nama}</Text>
                </TouchableOpacity>); })}
            </View>
            {cats.length === 0 ? <Text style={s.rv}>Belum ada kategori. Tambahkan di tab Anggaran.</Text> : null}
            {tried && f.catId == null ? <Text style={st.err}>Pilih satu kategori</Text> : null}
            {preview ? (
              <View style={[st.hint, { borderLeftColor: NOTE_COLOR[preview.level] || GRAY }]}>
                <Text style={[s.rv, { fontWeight: '800', color: NOTE_COLOR[preview.level] || '#636e72' }]}>{preview.text}</Text>
                <Text style={s.rv}>Pengingat memakai ambang yang sama dengan Dashboard: peringatan di 80%, habis di 100%.</Text>
              </View>) : null}
          </View>

          <View style={st.card}>
            <Text style={st.lbl}>TANGGAL JATUH TEMPO TIAP BULAN</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.rn}>Setiap tanggal</Text>
              <TextInput style={[s.in, { width: 64, textAlign: 'center', fontWeight: '800', marginTop: 0 }]} onFocus={ensure} keyboardType="numeric" maxLength={2}
                value={f.hari} onChangeText={v => setF({ ...f, hari: v.replace(/\D/g, '').slice(0, 2) })} />
            </View>
            <View style={st.quick}>
              {HARI_QUICK.map(d => { const on = hari === d; return (
                <TouchableOpacity key={d} style={[st.q, on && { backgroundColor: col, borderColor: col }]} onPress={() => setF({ ...f, hari: String(d) })}><Text style={[st.qT, on && { color: '#fff' }]}>{d}</Text></TouchableOpacity>); })}
              <TouchableOpacity style={[st.q, hari === 31 && { backgroundColor: col, borderColor: col }]} onPress={() => setF({ ...f, hari: '31' })}><Text style={[st.qT, hari === 31 && { color: '#fff' }]}>Akhir bulan</Text></TouchableOpacity>
            </View>
            <Text style={[s.rv, { marginTop: 8, color: '#636e72' }]}>Tanggal 29–31 otomatis memakai tanggal terakhir pada bulan yang lebih pendek.</Text>
            {tried && !(hari >= 1 && hari <= 31) ? <Text style={st.err}>Isi tanggal 1–31</Text> : null}
          </View>

          <View style={st.card}>
            <Text style={st.lbl}>BERLAKU</Text>
            <Text style={[s.rv, { color: '#636e72' }]}>Mulai bulan</Text>
            <MonthPicker y={mulai.y} m={mulai.m} setY={y => setMulai(x => ({ ...x, y }))} setM={m => setMulai(x => ({ ...x, m }))} />
            <View style={st.switchRow}>
              <View style={{ flex: 1 }}><Text style={s.rn}>Berhenti pada bulan tertentu</Text><Text style={s.rv}>Contoh: cicilan yang berakhir setelah 12 bulan</Text></View>
              <Switch value={akhirOn} onValueChange={setAkhirOn} trackColor={{ true: col }} />
            </View>
            {akhirOn ? (
              <View style={{ marginTop: 6 }}>
                <Text style={[s.rv, { color: '#636e72' }]}>Bulan terakhir</Text>
                <MonthPicker y={akhir.y} m={akhir.m} setY={y => setAkhir(x => ({ ...x, y }))} setM={m => setAkhir(x => ({ ...x, m }))} />
                {!rangeOk ? <Text style={st.err}>Bulan terakhir tidak boleh sebelum bulan mulai</Text> : null}
              </View>) : null}
            {backfill > 1 ? <Text style={[s.rv, { color: '#e17055', fontWeight: '700', marginTop: 6 }]}>⚠ {backfill} transaksi dari bulan-bulan sebelumnya akan langsung dicatat.</Text> : null}
          </View>

          <View style={st.card}>
            <Text style={st.lbl}>PENCATATAN & PENGINGAT</Text>
            <View style={st.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.rn}>Catat otomatis saat jatuh tempo</Text>
                <Text style={s.rv}>{f.otomatis ? 'Transaksi dibuat sendiri begitu tanggalnya tiba (saat aplikasi dibuka).' : 'Hanya diingatkan. Anda yang mengetuk "Catat" setelah membayar.'}</Text>
              </View>
              <Switch value={f.otomatis} onValueChange={v => setF({ ...f, otomatis: v })} trackColor={{ true: col }} />
            </View>
            <Text style={[s.rv, { color: '#636e72', marginTop: 10 }]}>Ingatkan saya</Text>
            <View style={st.quick}>
              {INGAT.map(([v, t]) => { const on = f.ingat === v; return (
                <TouchableOpacity key={v} style={[st.q, on && { backgroundColor: col, borderColor: col }]} onPress={() => setF({ ...f, ingat: v })}><Text style={[st.qT, on && { color: '#fff' }]}>{t}</Text></TouchableOpacity>); })}
            </View>
            {editing ? (
              <View style={[st.switchRow, { marginTop: 12 }]}>
                <View style={{ flex: 1 }}><Text style={s.rn}>Aktif</Text><Text style={s.rv}>Matikan untuk menjeda tanpa menghapus</Text></View>
                <Switch value={f.aktif} onValueChange={v => setF({ ...f, aktif: v })} trackColor={{ true: col }} />
              </View>) : null}
          </View>

          <View style={st.card}>
            <Text style={st.lbl}>KETERANGAN (opsional)</Text>
            <TextInput style={s.in} onFocus={ensure} placeholder="Contoh: Cicilan rumah bulanan" value={f.ket} onChangeText={v => setF({ ...f, ket: v })} />
          </View>
        </ScrollView>

        <View style={[st.bar, { paddingBottom: 10 }]}>
          <TouchableOpacity onPress={save} style={[st.btn, { backgroundColor: col }, !valid && { opacity: 0.5 }]}><Text style={st.btnT}>{editing ? 'Simpan Perubahan' : 'Simpan Transaksi Berulang'}</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============================================================ Daftar
export default function BerulangScreen({ tick, bump, notify, onClose }) {
  const [form, setForm] = useState(null); // null | { rec }
  const [perm, setPerm] = useState('undetermined');
  const [count, setCount] = useState(null); // jumlah notifikasi terjadwal
  const [mask, setMaskState] = useState(getMask);
  const bookName = getBook().nama;

  const list = useMemo(() => getRecurring().map(r => ({ r, nd: nextDue(r) })), [tick]);
  const sorted = useMemo(() => [...list].sort((a, b) => (b.r.aktif - a.r.aktif) || (a.nd && b.nd ? (a.nd.due < b.nd.due ? -1 : 1) : a.nd ? -1 : b.nd ? 1 : 0)), [list]);
  const tot = useMemo(() => monthTotals(), [tick]);
  const masuk = (tot.find(x => x.jenis === 'Pendapatan') || {}).s || 0;
  const keluar = tot.filter(x => x.jenis !== 'Pendapatan').reduce((a, x) => a + (x.s || 0), 0);
  const nAktif = list.filter(x => x.r.aktif).length;

  const refresh = useCallback(async () => {
    const p = await permissionState(); setPerm(p);
    const r = await syncReminders(); setCount(r && r.status === 'granted' ? r.n : null);
  }, []);
  useEffect(() => { refresh(); }, [tick, refresh]);

  const enable = async () => { const p = await askPermission(); setPerm(p); await refresh(); if (p === 'granted') notify('✔ Pengingat diaktifkan'); };
  const toggleMask = v => { setMask(v); setMaskState(v); refresh(); };
  const test = async () => { try { await testReminder(); notify('Notifikasi uji dikirim dalam 5 detik. Tutup aplikasi bila ingin melihatnya di layar kunci.'); } catch (e) { Alert.alert('Gagal', String((e && e.message) || e)); } };

  const catat = (r, o) => { postOccurrence(r, o.periode); bump(); notify(`✔ ${r.kategori} ${rp(r.nominal)} dicatat`); };
  const lewati = (r, o) => Alert.alert('Lewati bulan ini?', `${r.kategori} untuk ${shortDay(o.due)} tidak akan dicatat atau diingatkan lagi. Bulan berikutnya tetap berjalan.`, [{ text: 'Batal', style: 'cancel' }, { text: 'Lewati', onPress: () => { skipOccurrence(r, o.periode); bump(); notify('Dilewati'); } }]);
  const done = msg => { setForm(null); bump(); notify(`✔ Transaksi berulang ${msg}`); (async () => { if ((await permissionState()) === 'undetermined') { await askPermission(); bump(); } })(); };

  if (form) return <RecForm key={form.rec ? form.rec.id : 'baru'} rec={form.rec} onClose={() => setForm(null)} onDone={done} />;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[st.top, { backgroundColor: NAVY }]}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={st.backBtn} accessibilityLabel="Kembali"><Chevron dir="left" color="#fff" /></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.title}>Transaksi Berulang</Text>
          <Text style={st.sub} numberOfLines={1}>Buku Kas: {bookName}</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={[s.hero, { backgroundColor: NAVY, marginBottom: 6 }]}>
          <Text style={[s.heroL, { marginTop: 2 }]}>Catat sekali, muncul tiap bulan • {nAktif} aktif</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={s.hp}><Text style={s.hpL}>↓ MASUK / BULAN</Text><Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rp(masuk)}</Text></View>
            <View style={s.hp}><Text style={s.hpL}>↑ KELUAR / BULAN</Text><Text style={s.hpV} numberOfLines={1} adjustsFontSizeToFit>{rp(keluar)}</Text></View>
          </View>
        </View>

        <View style={s.sec}>
          <Text style={s.secT}>🔔 Pengingat jatuh tempo</Text>
          {!reminderAvailable() ? <Text style={s.rn}>Pengingat butuh modul notifikasi. Pasang versi aplikasi terbaru (build ulang APK); daftar berulang tetap berfungsi tanpa pengingat.</Text> : null}
          {perm === 'granted' ? <Text style={[s.rn, { color: GREEN, fontWeight: '700' }]}>Aktif{count != null ? ` • ${count} notifikasi terjadwal` : ''}</Text> : null}
          {perm === 'undetermined' && reminderAvailable() ? (<><Text style={s.rn}>Izinkan notifikasi agar aplikasi mengingatkan sebelum tagihan jatuh tempo.</Text><Btn t="Aktifkan Pengingat" onPress={enable} /></>) : null}
          {perm === 'denied' ? (<><Text style={[s.rn, { color: '#e17055' }]}>Notifikasi diblokir. Aktifkan lewat Pengaturan HP → Aplikasi → Monthly Budget Planner → Notifikasi.</Text><Btn t="Buka Pengaturan HP" color="#636e72" onPress={() => Linking.openSettings()} /></>) : null}
          {reminderAvailable() ? (
            <View style={[st.switchRow, { marginTop: 10 }]}>
              <View style={{ flex: 1 }}><Text style={s.rn}>Sembunyikan nominal di notifikasi</Text><Text style={s.rv}>Agar angka tidak terbaca di layar kunci</Text></View>
              <Switch value={mask} onValueChange={toggleMask} trackColor={{ true: NAVY }} />
            </View>) : null}
          <Text style={[s.rv, { marginTop: 8, color: '#636e72' }]}>Notifikasi muncul pukul 09.00 dan memuat dampaknya ke anggaran: peringatan di 80%, habis di 100%.</Text>
          {perm === 'granted' ? <Btn t="Uji notifikasi (5 detik)" color="#636e72" small onPress={test} /> : null}
        </View>

        {sorted.length === 0 ? (
          <View style={[s.sec, { alignItems: 'center' }]}>
            <Text style={s.secT}>Belum ada transaksi berulang</Text>
            <Text style={[s.rv, { textAlign: 'center' }]}>Cicilan rumah, cicilan emas, uang kos, internet, SPP… catat sekali di sini, lalu muncul otomatis tiap bulan.</Text>
          </View>
        ) : sorted.map(({ r, nd }) => {
          const note = nd ? thresholdNote(r, nd.periode) : null;
          const dc = !nd ? '#636e72' : nd.days < 0 ? RED : nd.days <= 3 ? ORANGE : '#636e72';
          return (
            <View key={r.id} style={[st.item, !r.aktif && { opacity: 0.6 }]}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setForm({ rec: r })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[st.dot, { backgroundColor: GCOL[r.jenis] || GRAY }]} />
                <View style={{ flex: 1 }}>
                  <Text style={st.itemT} numberOfLines={1}>🔁 {r.kategori}{r.ket ? ` • ${r.ket}` : ''}</Text>
                  <Text style={s.rv} numberOfLines={1}>Tiap tgl {r.hari >= 29 ? `${r.hari}*` : r.hari} • {r.otomatis ? 'Otomatis' : 'Ingatkan saja'} • {ingatLabel(r.ingat)}{r.akhir ? ` • s/d ${MONTHS_SHORT[+r.akhir.slice(5) - 1]} ${r.akhir.slice(0, 4)}` : ''}</Text>
                </View>
                <Text style={[st.itemV, r.jenis === 'Pendapatan' && { color: GREEN }]}>{rp(r.nominal)}</Text>
              </TouchableOpacity>
              {!r.aktif ? <Text style={[s.rv, { marginTop: 6, fontWeight: '700' }]}>⏸ Dijeda</Text> : nd ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={[s.rv, { color: dc, fontWeight: '700' }]}>Berikutnya {shortDay(nd.due)} • {dueLabel(nd.days)}</Text>
                  {note ? <Text style={[s.rv, { color: NOTE_COLOR[note.level], fontWeight: '700', marginTop: 2 }]}>{note.text}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <TouchableOpacity style={[st.mini, { backgroundColor: GCOL[r.jenis] || NAVY }]} onPress={() => catat(r, nd)}><Text style={st.miniT}>Catat sekarang</Text></TouchableOpacity>
                    <TouchableOpacity style={[st.mini, { backgroundColor: '#eef2f7' }]} onPress={() => lewati(r, nd)}><Text style={[st.miniT, { color: NAVY }]}>Lewati bulan ini</Text></TouchableOpacity>
                  </View>
                </View>) : <Text style={[s.rv, { marginTop: 6 }]}>Sudah selesai (melewati bulan terakhir).</Text>}
            </View>);
        })}
        {sorted.some(x => x.r.hari >= 29) ? <Text style={[s.rv, { color: '#636e72', marginHorizontal: 4 }]}>* Pada bulan yang lebih pendek dipakai tanggal terakhir bulan itu.</Text> : null}

        <Btn t="+ Tambah Transaksi Berulang" onPress={() => setForm({ rec: null })} />
        <Text style={[s.rv, { color: '#636e72', textAlign: 'center', marginTop: 10 }]}>Ketuk satu baris untuk mengedit, menjeda, atau menghapus.</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' }, sub: { color: '#ffffffcc', fontSize: 11.5, fontWeight: '600', marginTop: 1, maxWidth: 220 }, trash: { fontSize: 20, width: 34, textAlign: 'right' },
  jenisRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  jenis: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: '#e1e7ef', backgroundColor: '#fff' },
  jenisT: { fontSize: 10, fontWeight: '700', color: '#2d3436', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 8 },
  lbl: { fontSize: 11, fontWeight: '800', color: '#636e72', letterSpacing: 0.5, marginBottom: 6 },
  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rp: { fontSize: 22, fontWeight: '800', marginRight: 6 }, amt: { fontSize: 34, fontWeight: '800', minWidth: 80, padding: 0, textAlign: 'center' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  q: { borderWidth: 1, borderColor: '#d5dce6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }, qT: { fontSize: 12, fontWeight: '700', color: '#2d3436' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 }, catT: { fontSize: 13, fontWeight: '700' },
  hint: { marginTop: 10, borderLeftWidth: 4, backgroundColor: '#f8fafc', borderRadius: 6, padding: 8, gap: 2 },
  err: { color: '#d63031', fontSize: 12, fontWeight: '700', marginTop: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eef2f7' },
  btn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }, btnT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  item: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  itemT: { fontSize: 14, fontWeight: '800', color: NAVY }, itemV: { fontSize: 14, fontWeight: '800', color: '#2d3436' },
  mini: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 }, miniT: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
