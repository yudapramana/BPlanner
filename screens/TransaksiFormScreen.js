import React, { useState, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { s, NAVY, BG, GCOL } from '../theme';
import DateField, { toYmd } from '../components/DateField';
import { db, bid, getBook } from '../lib/db';
import { JENIS, rp, GRAY, statusOf } from '../lib/calc';
import useKeyboard from '../lib/useKeyboard';
import { Chevron } from '../components/ui';
import { deleteTransaction, makeRecurringFromTx } from '../lib/recurring';
import { permissionState, askPermission } from '../lib/reminders';

const ICON = { Pendapatan: '💰', Biaya: '🛒', Tagihan: '🧾', Pinjaman: '🏦', 'Investasi/Tabungan': '🌱' };
const SHORT = { Pendapatan: 'Pendapatan', Biaya: 'Biaya', Tagihan: 'Tagihan', Pinjaman: 'Pinjaman', 'Investasi/Tabungan': 'Tabungan' };
const QUICK = [[10000, '+10rb'], [50000, '+50rb'], [100000, '+100rb'], [500000, '+500rb'], [1000000, '+1jt']];
const fmt = d => (d ? String(d).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return toYmd(d); };
const last = { jenis: 'Biaya' }; // mengingat jenis yang terakhir dipakai

export default function TransaksiFormScreen({ tx, onClose, onSaved, notify, bump }) {
  const insets = useSafeAreaInsets();
  const scroller = useRef(null);
  const { wrapRef, overlap, ensure, onScroll } = useKeyboard(scroller, 70);
  const editing = !!tx;
  const [f, setF] = useState(tx
    ? { tanggal: tx.tanggal || daysAgo(0), jenis: tx.jenis || 'Biaya', catId: tx.category_id ?? null, nominal: tx.nominal ? String(tx.nominal) : '', ket: tx.ket || '' }
    : { tanggal: daysAgo(0), jenis: last.jenis, catId: null, nominal: '', ket: '' });
  const [tried, setTried] = useState(false);
  const [rep, setRep] = useState(false); // ulangi tiap bulan (hanya untuk transaksi baru)
  const col = GCOL[f.jenis] || NAVY;
  const nom = parseInt(f.nominal || '0', 10) || 0;
  const valid = f.catId != null && nom > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.tanggal);

  const cats = useMemo(() => db.getAllSync('SELECT * FROM categories WHERE book_id=? AND jenis=? ORDER BY urut,id', [bid(), f.jenis]), [f.jenis]);
  const sel = cats.find(x => x.id === f.catId) || null; // kategori terpilih (null = belum dipilih / kategori lama sudah dihapus)
  const orphan = editing && tx.category_id == null && f.catId == null; // transaksi lama yang kategorinya sudah dihapus
  const hint = useMemo(() => {
    if (!sel) return null;
    const spent = db.getFirstSync('SELECT COALESCE(SUM(nominal),0) s FROM transactions WHERE category_id=? AND substr(tanggal,1,7)=? AND id != ?', [sel.id, f.tanggal.slice(0, 7), tx ? tx.id : -1]).s;
    return { budget: sel.anggaran, spent, st: statusOf(f.jenis, { budget: sel.anggaran, real: spent + nom }) };
  }, [sel, f.jenis, f.tanggal, nom]);
  const sugg = useMemo(() => !sel ? [] : db.getAllSync("SELECT ket FROM transactions WHERE category_id=? AND ket IS NOT NULL AND ket != '' GROUP BY ket ORDER BY MAX(id) DESC LIMIT 5", [sel.id]).map(r => r.ket), [sel]);

  const save = again => {
    if (!valid) { setTried(true); return; }
    // kategori (teks) disimpan sebagai salinan nama; relasi sebenarnya ada di category_id
    if (editing) db.runSync('UPDATE transactions SET tanggal=?,jenis=?,kategori=?,nominal=?,ket=?,category_id=? WHERE id=?', [f.tanggal, f.jenis, sel.nama, nom, f.ket.trim(), sel.id, tx.id]);
    else {
      const txId = db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES(?,?,?,?,?,?,?)', [f.tanggal, f.jenis, sel.nama, nom, f.ket.trim(), bid(), sel.id]).lastInsertRowId;
      // Ulangi tiap bulan: transaksi ini menjadi kejadian bulan pertama; bulan-bulan berikutnya dicatat otomatis pada tanggal yang sama
      if (rep) {
        makeRecurringFromTx({ catId: sel.id, nominal: nom, ket: f.ket.trim(), tanggal: f.tanggal, txId });
        permissionState().then(p => { if (p === 'undetermined') return askPermission(); }).then(() => bump()).catch(() => {});
      }
    }
    last.jenis = f.jenis;
    bump(); onSaved(f.tanggal);
    notify(`✔ ${sel.nama} ${rp(nom)} ${editing ? 'diperbarui' : 'tersimpan'}${!editing && rep ? ' • diulang tiap bulan' : ''}`);
    if (again && !editing) { setF({ ...f, catId: null, nominal: '', ket: '' }); setRep(false); setTried(false); } else onClose();
  };
  const del = () => Alert.alert('Hapus transaksi?', `${tx.kategori} ${rp(tx.nominal)}`, [{ text: 'Batal' }, { text: 'Hapus', style: 'destructive', onPress: () => { deleteTransaction(tx.id); bump(); notify('Transaksi dihapus'); onClose(); } }]);

  return (
    <View ref={wrapRef} collapsable={false} style={{ flex: 1, backgroundColor: BG }}>
    <View style={{ flex: 1, paddingBottom: overlap }}>
      <View style={[fs.top, { backgroundColor: col }]}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={fs.backBtn} accessibilityLabel="Kembali"><Chevron dir="left" color="#fff" /></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={fs.title}>{editing ? 'Edit Transaksi' : 'Tambah Transaksi'}</Text>
          <Text style={fs.bk} numberOfLines={1}>Buku Kas: {getBook(tx ? tx.book_id : bid()).nama}</Text>
        </View>
        {editing ? <TouchableOpacity onPress={del} hitSlop={12}><Text style={fs.trash}>🗑</Text></TouchableOpacity> : <View style={{ width: 34 }} />}
      </View>

      <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Jenis */}
        <View style={fs.jenisRow}>
          {JENIS.map(j => { const on = f.jenis === j; return (
            <TouchableOpacity key={j} onPress={() => setF({ ...f, jenis: j, catId: null })} style={[fs.jenis, on && { backgroundColor: GCOL[j], borderColor: GCOL[j] }]}>
              <Text style={{ fontSize: 18 }}>{ICON[j]}</Text>
              <Text style={[fs.jenisT, on && { color: '#fff' }]} numberOfLines={1}>{SHORT[j]}</Text>
            </TouchableOpacity>); })}
        </View>

        {/* Nominal */}
        <View style={[fs.card, { borderTopColor: col, borderTopWidth: 4 }]}>
          <Text style={fs.lbl}>NOMINAL</Text>
          <View style={fs.amtRow}>
            <Text style={[fs.rp, { color: col }]}>Rp</Text>
            <TextInput style={[fs.amt, { color: col }]} onFocus={ensure} keyboardType="numeric" placeholder="0" placeholderTextColor="#b2bec3"
              value={fmt(f.nominal)} onChangeText={v => setF({ ...f, nominal: v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12) })} />
          </View>
          <View style={fs.quick}>
            {QUICK.map(([a, t]) => <TouchableOpacity key={t} style={fs.q} onPress={() => setF({ ...f, nominal: String(nom + a) })}><Text style={fs.qT}>{t}</Text></TouchableOpacity>)}
            <TouchableOpacity style={[fs.q, { borderColor: '#d63031' }]} onPress={() => setF({ ...f, nominal: '' })}><Text style={[fs.qT, { color: '#d63031' }]}>Hapus</Text></TouchableOpacity>
          </View>
          {tried && nom <= 0 ? <Text style={fs.err}>Isi nominal lebih dari 0</Text> : null}
        </View>

        {/* Kategori */}
        <View style={fs.card}>
          <Text style={fs.lbl}>KATEGORI</Text>
          <View style={fs.wrap}>
            {cats.map(c => { const on = f.catId === c.id; return (
              <TouchableOpacity key={c.id} onPress={() => setF({ ...f, catId: c.id })} style={[fs.cat, { borderColor: col }, on && { backgroundColor: col }]}>
                <Text style={[fs.catT, { color: on ? '#fff' : col }]}>{c.nama}</Text>
              </TouchableOpacity>); })}
          </View>
          {cats.length === 0 ? <Text style={s.rv}>Belum ada kategori. Tambahkan di tab Anggaran.</Text> : null}
          {orphan && !tried ? <Text style={[s.rv, { color: '#e17055', fontWeight: '700', marginTop: 6 }]}>Kategori lama "{tx.kategori}" sudah dihapus. Pilih kategori baru agar transaksi ini ikut terhitung.</Text> : null}
          {tried && f.catId == null ? <Text style={fs.err}>Pilih satu kategori</Text> : null}
          {hint && (
            <View style={[fs.hint, { borderLeftColor: hint.st.color }]}>
              <Text style={s.rv}>Anggaran {hint.budget > 0 ? rp(hint.budget) : 'belum diatur'}  •  bulan ini {rp(hint.spent)}</Text>
              {hint.st.label ? <Text style={[s.rv, { fontWeight: '800', color: hint.st.color === GRAY ? '#636e72' : hint.st.color }]}>Setelah transaksi ini: {hint.st.label}</Text> : null}
            </View>)}
        </View>

        {/* Tanggal */}
        <View style={fs.card}>
          <Text style={fs.lbl}>TANGGAL</Text>
          <View style={fs.quick}>
            {[['Hari ini', 0], ['Kemarin', 1]].map(([t, n]) => { const on = f.tanggal === daysAgo(n); return (
              <TouchableOpacity key={t} style={[fs.q, on && { backgroundColor: col, borderColor: col }]} onPress={() => setF({ ...f, tanggal: daysAgo(n) })}><Text style={[fs.qT, on && { color: '#fff' }]}>{t}</Text></TouchableOpacity>); })}
          </View>
          <DateField value={f.tanggal} onChange={v => setF({ ...f, tanggal: v })} />
        </View>

        {/* Keterangan */}
        <View style={fs.card}>
          <Text style={fs.lbl}>KETERANGAN (opsional)</Text>
          <TextInput style={s.in} onFocus={ensure} placeholder="Contoh: Makan siang di warung" value={f.ket} onChangeText={v => setF({ ...f, ket: v })} />
          {sugg.length > 0 && (
            <View style={[fs.quick, { marginTop: 8 }]}>
              {sugg.map(t => <TouchableOpacity key={t} style={fs.q} onPress={() => setF({ ...f, ket: t })}><Text style={fs.qT} numberOfLines={1}>{t}</Text></TouchableOpacity>)}
            </View>)}
        </View>

        {/* Ulangi tiap bulan */}
        {!editing ? (
          <View style={fs.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fs.lbl}>🔁 ULANGI TIAP BULAN</Text>
                <Text style={s.rv}>{rep ? `Dicatat otomatis setiap tanggal ${parseInt(f.tanggal.slice(8, 10), 10) || '-'}, dengan pengingat H-3. Atur jeda, akhir, dan pengingat di Transaksi Berulang.` : 'Untuk cicilan, uang kos, internet, SPP, dan tagihan tetap lainnya.'}</Text>
              </View>
              <Switch value={rep} onValueChange={setRep} trackColor={{ true: col }} />
            </View>
          </View>) : tx.recurring_id ? (
          <View style={fs.card}>
            <Text style={fs.lbl}>🔁 TRANSAKSI BERULANG</Text>
            <Text style={s.rv}>Transaksi ini dibuat dari jadwal berulang. Perubahan di sini hanya berlaku untuk bulan ini; ubah nominal atau jadwal tiap bulan lewat menu Transaksi Berulang. Bila dihapus, bulan ini tidak dibuat ulang.</Text>
          </View>) : null}

        {editing ? (
          <TouchableOpacity onPress={del} style={{ alignItems: 'center', padding: 12 }}><Text style={{ color: '#d63031', fontWeight: '700' }}>🗑  Hapus transaksi ini</Text></TouchableOpacity>) : null}
      </ScrollView>

      {/* Bar simpan */}
      <View style={[fs.bar, { paddingBottom: (overlap > 0 ? 0 : insets.bottom) + 10 }]}>
        {!editing && (
          <TouchableOpacity onPress={() => save(true)} style={[fs.btn, fs.btnO, { borderColor: col }, !valid && { opacity: 0.5 }]}><Text style={[fs.btnT, { color: col }]}>Simpan & Tambah Lagi</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={() => save(false)} style={[fs.btn, { backgroundColor: col }, !valid && { opacity: 0.5 }]}><Text style={fs.btnT}>{editing ? 'Simpan Perubahan' : 'Simpan'}</Text></TouchableOpacity>
      </View>
    </View>
    </View>
  );
}

const fs = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }, title: { color: '#fff', fontSize: 18, fontWeight: '800' }, bk: { color: '#ffffffcc', fontSize: 11.5, fontWeight: '600', marginTop: 1, maxWidth: 220 }, trash: { fontSize: 20, width: 34, textAlign: 'right' },
  jenisRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  jenis: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: '#e1e7ef', backgroundColor: '#fff' },
  jenisT: { fontSize: 10, fontWeight: '700', color: '#2d3436', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 8 },
  lbl: { fontSize: 11, fontWeight: '800', color: '#636e72', letterSpacing: 0.5, marginBottom: 6 },
  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rp: { fontSize: 22, fontWeight: '800', marginRight: 6 }, amt: { fontSize: 36, fontWeight: '800', minWidth: 80, padding: 0, textAlign: 'center' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  q: { borderWidth: 1, borderColor: '#d5dce6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' }, qT: { fontSize: 12, fontWeight: '700', color: '#2d3436' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 }, catT: { fontSize: 13, fontWeight: '700' },
  hint: { marginTop: 10, borderLeftWidth: 4, backgroundColor: '#f8fafc', borderRadius: 6, padding: 8, gap: 2 },
  err: { color: '#d63031', fontSize: 12, fontWeight: '700', marginTop: 6 },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eef2f7' },
  btn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }, btnO: { backgroundColor: '#fff', borderWidth: 1.5 }, btnT: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
