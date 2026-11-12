import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Alert, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDb, getBook, setActiveBook, resetAllData } from './lib/db';
import { s, NAVY, BG } from './theme';
import DashboardScreen from './screens/DashboardScreen';
import TransaksiScreen from './screens/TransaksiScreen';
import PengaturanScreen from './screens/PengaturanScreen';
import NavIcon from './components/NavIcons';
import BookSheet, { BookAvatar } from './components/BookSheet';
import ExpensesScreen from './screens/ExpensesScreen';
import TransaksiFormScreen from './screens/TransaksiFormScreen';
import ProfileScreen from './screens/ProfileScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import Avatar from './components/Avatar';
import { getProfile, saveGoogleProfile, renameProfile, clearProfile, welcomeDone, setWelcomeDone } from './lib/auth';
import { signInWithGoogle, signOutGoogle, authMessage, getDriveToken, sessionActive, hasWebClientId } from './lib/googleAuth';
import { loginSync, autoSync, syncNow, beforeLogout, syncStatus } from './lib/driveSync';
import { autoBackup, clearAutoBackups } from './lib/backup';
import ClientIdSheet from './components/ClientIdSheet';
import { fmtWaktu } from './components/DriveSheet';
import BerulangScreen from './screens/BerulangScreen';
import { processRecurring } from './lib/recurring';
import { initNotifications, syncReminders, onReminderTap } from './lib/reminders';
import ErrorBoundary, { ErrorFallback } from './components/ErrorBoundary';
import { reportError } from './lib/errors';

// Gagal membuka / memigrasi database tidak boleh membuat aplikasi mati tanpa penjelasan. Migrasi berjalan dalam transaksi,
// jadi bila gagal data lama tetap utuh; aplikasi menampilkan layar kesalahan dan tidak memuat layar lain (yang butuh tabel-tabelnya).
let bootError = null;
try { initDb(); } catch (e) { bootError = e; reportError('initDb', e); }
try { initNotifications(); } catch (e) { reportError('initNotifications', e); } // pengingat saja yang mati

const AUTO_DELAY_MS = 45000; // sinkron otomatis berjalan 45 detik setelah perubahan terakhir (debounce)
const firstLine = e => String((e && e.message) || e || '').split('\n')[0];

const TABS = [['Dashboard', 'dashboard', DashboardScreen], ['Transaksi', 'transaksi', TransaksiScreen], ['Anggaran', 'anggaran', PengaturanScreen], ['Pengeluaran', 'pengeluaran', ExpensesScreen]];

function Main() {
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [tab, setTab] = useState(0);
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState(null); // null = tertutup, { tx } = form tambah (tx null) / edit
  const [hide, setHide] = useState(true); // data keuangan tertutup setiap kali aplikasi dibuka
  const [toast, setToast] = useState(null);
  const [sheet, setSheet] = useState(false); // panel pemilih Buku Kas
  const [profile, setProfile] = useState(getProfile); // null = belum masuk
  const [profileOpen, setProfileOpen] = useState(false);
  const [welcome, setWelcome] = useState(() => !welcomeDone()); // layar sambutan sekali saja
  const [recOpen, setRecOpen] = useState(false); // halaman Transaksi Berulang
  const [clientOpen, setClientOpen] = useState(false); // panel input Google Web Client ID
  const [cfgTick, setCfgTick] = useState(0); // dinaikkan setiap Web Client ID berubah
  const [sessionOk, setSessionOk] = useState(null); // null = belum diperiksa; false = sesi Google terputus
  const [syncTick, setSyncTick] = useState(0); // dinaikkan setiap status sinkron Drive berubah
  const timer = useRef(null);

  const notify = msg => { setToast(msg); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 2200); };
  const book = getBook(); // buku kas aktif (dibaca ulang setiap render; murah)
  const switchBook = id => { setActiveBook(id); setTick(t => t + 1); setSheet(false); };
  const openForm = tx => setForm({ tx: tx || null });
  const onSaved = tgl => { const [yy, mm] = tgl.split('-'); setY(+yy); setM(+mm); };

  // ---- Akun ----
  // Alur: masuk Google -> beri izin Drive (sekali) -> samakan dengan Google Drive (pulihkan / unggah / tanya bila dua-duanya berisi data).
  // Keluar: unggah perubahan terakhir -> kosongkan SEMUA data di HP. Masuk lagi = data kembali dari Drive.
  const failLogin = e => {
    Alert.alert('Gagal masuk', authMessage(e), [{ text: 'OK', style: 'cancel' }, { text: e && e.code === 'NO_CLIENT_ID' ? 'Isi sekarang' : 'Ubah Web Client ID', onPress: () => setClientOpen(true) }]);
    return false;
  };
  // Dipanggil bila HP dan Drive sama-sama berisi data. Hasil: 'merge' | 'replace' | 'local' | null (dibatalkan)
  const askConflict = remote => new Promise(resolve => {
    const what = remote.buku ? `${remote.buku} buku kas, ${remote.tx} transaksi, ` : '';
    Alert.alert('Data ditemukan di Google Drive',
      `Drive akun ini berisi data (${what}${fmtWaktu(remote.modifiedTime || remote.createdTime)}), dan HP ini juga sudah berisi data.\n\n• Gabungkan: data HP dan Drive disatukan (transaksi kembar dilewati).\n• Pakai Drive: data HP diganti data Drive (salinan data HP dibuat otomatis lebih dulu).\n• Pakai HP: data di Drive ditimpa data HP ini.\n\nKetuk di luar kotak ini untuk membatalkan.`,
      [{ text: 'Gabungkan', onPress: () => resolve('merge') }, { text: 'Pakai Drive', style: 'destructive', onPress: () => resolve('replace') }, { text: 'Pakai HP', onPress: () => resolve('local') }],
      { cancelable: true, onDismiss: () => resolve(null) });
  });
  const afterSync = (r, who) => {
    setTick(t => t + 1); setSyncTick(t => t + 1);
    if (r.action === 'pull') notify(`✔ Data dipulihkan dari Google Drive: ${r.info.buku} buku kas, ${r.info.tx} transaksi`);
    else if (r.action === 'merge') notify('✔ Data HP digabung dengan Google Drive');
    else if (r.action === 'push') notify(`✔ Data HP diunggah ke Google Drive: ${r.info.buku} buku kas, ${r.info.tx} transaksi`);
    else notify(`✔ ${who}`);
  };
  const loginGoogle = async () => {
    let u;
    try { u = await signInWithGoogle(); } catch (e) { return failLogin(e); }
    if (!u) return false; // dibatalkan
    saveGoogleProfile(u); setProfile(getProfile());
    const abort = async () => { await signOutGoogle(); clearProfile(); setProfile(null); };
    try {
      await getDriveToken(); // jendela izin Google Drive muncul di sini, sekali saja
      const r = await loginSync({ ask: askConflict });
      if (r.action === 'cancel') { await abort(); notify('Masuk dibatalkan'); return false; }
      afterSync(r, `Masuk sebagai ${u.nama || u.email}`);
      return true;
    } catch (e) {
      await abort();
      Alert.alert('Gagal menyambungkan Google Drive', `${firstLine(e)}\n\nAkun belum dihubungkan dan data di HP tidak diubah.`);
      return false;
    }
  };
  // Sesi Google terputus (mis. Web Client ID diganti): masuk lagi dengan akun YANG SAMA tanpa menghapus data HP.
  const reconnect = async () => {
    const cur = getProfile();
    try {
      const u = await signInWithGoogle(); if (!u) return;
      if (cur && u.googleId !== cur.googleId) {
        await signOutGoogle();
        Alert.alert('Akun berbeda', `Akun yang dipilih (${u.email}) berbeda dengan akun di aplikasi (${cur.email}). Pilih akun yang sama, atau keluar dulu lalu masuk dengan akun baru.`);
        return;
      }
      saveGoogleProfile(u); setProfile(getProfile());
      await getDriveToken();
      const r = await loginSync({ ask: askConflict, sameAccount: true });
      if (r.action === 'cancel') { notify('Dibatalkan'); return; }
      afterSync(r, 'Terhubung kembali ke Google');
      setCfgTick(t => t + 1);
    } catch (e) { Alert.alert('Gagal menghubungkan ulang', `${authMessage(e)}`, [{ text: 'OK', style: 'cancel' }, { text: 'Ubah Web Client ID', onPress: () => setClientOpen(true) }]); }
  };
  const logout = async () => {
    const r = await beforeLogout(); // mengunggah perubahan terakhir bila ada
    if (!r.ok) {
      const go = await new Promise(res => Alert.alert('Perubahan terakhir belum terunggah', `${firstLine(r.error)}\n\nBila tetap keluar, perubahan yang belum sampai di Google Drive akan HILANG dari HP ini.`,
        [{ text: 'Batal', style: 'cancel', onPress: () => res(false) }, { text: 'Keluar & hapus', style: 'destructive', onPress: () => res(true) }], { cancelable: true, onDismiss: () => res(false) }));
      if (!go) return;
      try { await autoBackup('all'); } // jaring pengaman terakhir di HP, karena Drive tidak berhasil diperbarui
      catch (e) { Alert.alert('Keluar dibatalkan', 'Salinan pengaman di HP gagal dibuat, jadi data tidak diubah.'); return; }
    } else clearAutoBackups(); // data sudah aman di Drive; jangan tinggalkan salinan di HP
    await signOutGoogle();
    resetAllData();
    setProfile(null); setProfileOpen(false); setForm(null); setRecOpen(false); setSheet(false);
    setTick(t => t + 1); setSyncTick(t => t + 1);
    notify('Anda telah keluar. Data di HP dikosongkan');
  };
  const syncNowUi = async () => {
    try { const r = await syncNow(); notify(`✔ Tersinkron: ${r.info.buku} buku kas, ${r.info.tx} transaksi`); }
    catch (e) { Alert.alert('Sinkron gagal', firstLine(e)); }
    setSyncTick(t => t + 1);
  };
  const onClientSaved = r => {
    setClientOpen(false); setCfgTick(t => t + 1);
    if (r.changed && getProfile()) Alert.alert('Web Client ID diganti', 'Sesi Google lama diputus. Buka Profil lalu ketuk Hubungkan ulang. Data di HP tidak dihapus.');
    else notify(r.empty ? 'Web Client ID dikosongkan' : r.changed ? '✔ Web Client ID disimpan' : 'Web Client ID tidak berubah');
  };
  const rename = n => { renameProfile(n); setProfile(getProfile()); notify('✔ Nama diperbarui'); };
  const finishWelcome = () => { setWelcomeDone(); setWelcome(false); };

  // ---- Sinkron otomatis ke Google Drive ----
  // Setiap data berubah (tick naik) timer 45 detik dimulai ulang; saat habis, perubahan diunggah. Aplikasi ke latar belakang = unggah segera.
  // autoSync sendiri memeriksa: sudah masuk, izin Drive ada, isi data benar-benar berubah, tidak kosong, dan batas harian.
  const autoTimer = useRef(null); const lastAutoErr = useRef('');
  const runAuto = async () => {
    const r = await autoSync();
    if (r.status === 'ok') { lastAutoErr.current = ''; setSyncTick(t => t + 1); }
    else if (r.status === 'error') {
      const m = firstLine(r.error);
      if (m !== lastAutoErr.current) { lastAutoErr.current = m; notify(`⚠ Sinkron Drive gagal: ${m}`.slice(0, 90)); }
      setSyncTick(t => t + 1);
    }
  };
  useEffect(() => {
    clearTimeout(autoTimer.current);
    if (!profile) return undefined;
    autoTimer.current = setTimeout(runAuto, AUTO_DELAY_MS);
    return () => clearTimeout(autoTimer.current);
  }, [tick, profile]);
  useEffect(() => () => clearTimeout(autoTimer.current), []);

  // Status sesi Google & sinkron hanya dihitung saat halaman Profil terbuka (menghitung sidik jari data tidak gratis)
  useEffect(() => {
    let on = true;
    if (profile && profileOpen) sessionActive().then(v => { if (on) setSessionOk(v); }); else setSessionOk(null);
    return () => { on = false; };
  }, [profile, profileOpen, cfgTick, syncTick]);
  const syncInfo = useMemo(() => (profile && profileOpen ? syncStatus() : null), [profile, profileOpen, tick, syncTick]);

  // ---- Transaksi berulang ----
  // Dijalankan saat aplikasi dibuka, kembali aktif, dan setiap data berubah: (1) catat transaksi berulang otomatis yang sudah jatuh tempo,
  // (2) jadwalkan ulang notifikasi pengingat. Notifikasi dijadwalkan tertunda 600 ms agar beberapa perubahan beruntun cukup sekali jalan.
  const syncTimer = useRef(null);
  const refreshRecurring = () => {
    try { const n = processRecurring(); if (n > 0) { setTick(t => t + 1); notify(`🔁 ${n} transaksi berulang dicatat`); } } catch (e) { /* jangan sampai menghentikan aplikasi */ }
    clearTimeout(syncTimer.current); syncTimer.current = setTimeout(() => { syncReminders(); }, 600);
  };
  useEffect(() => { refreshRecurring(); }, [tick]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') refreshRecurring();
      else if (st === 'background' || st === 'inactive') { clearTimeout(autoTimer.current); runAuto(); } // unggah perubahan yang tertunda sebelum aplikasi ditutup
    });
    const unTap = onReminderTap(() => setRecOpen(true)); // ketuk notifikasi -> buka layar Transaksi Berulang
    return () => { sub.remove(); unTap(); clearTimeout(syncTimer.current); };
  }, []);

  // Tombol back Android: tutup form -> kembali ke Dashboard -> baru keluar
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (form) { setForm(null); return true; }
      if (recOpen) { setRecOpen(false); return true; }
      if (profileOpen) { setProfileOpen(false); return true; }
      if (tab !== 0) { setTab(0); return true; }
      return false;
    });
    return () => sub.remove();
  }, [form, tab, profileOpen, recOpen]);

  const P = { y, m, setY, setM, tick, hide, toggleHide: () => setHide(h => !h), goTab: setTab, openForm, profile, openProfile: () => setProfileOpen(true), notify, bump: () => setTick(t => t + 1), openRec: () => setRecOpen(true) };
  const Screen = TABS[tab][2];
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="dark" />
      <View style={{ height: insets.top, backgroundColor: BG }} />
      {/* Header: pemilih Buku Kas aktif (ketuk untuk ganti / tambah buku kas) */}
      <View style={[s.head, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <TouchableOpacity style={[s.bookBtn, { flexShrink: 1, alignSelf: 'center' }]} onPress={() => setSheet(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Buku kas aktif: ${book.nama}. Ketuk untuk mengganti`}>
          <BookAvatar tipe={book.tipe} size={38} />
          <View style={{ flexShrink: 1 }}>
            <Text style={s.headCap}>BUKU KAS</Text>
            <Text style={s.headT} numberOfLines={1}>{book.nama}</Text>
          </View>
          <NavIcon name="chevdown" color={NAVY} size={20} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {/* Ikon profil di kanan atas */}
        <TouchableOpacity onPress={() => setProfileOpen(true)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button"
          accessibilityLabel={profile ? `Profil: ${profile.nama}` : 'Profil. Belum masuk'}
          style={{ borderRadius: 24, padding: 3, backgroundColor: '#fff', elevation: 1, shadowColor: '#14365d', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          <Avatar profile={profile} size={40} />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        {/* Satu layar yang error tidak mematikan menu & pemilih buku; berpindah tab / bulan / buku kas mencoba render ulang */}
        <ErrorBoundary label={`tab:${TABS[tab][0]}`} resetKeys={[tab, book.id, y, m, tick]} title={`Layar ${TABS[tab][0]} bermasalah`}>
          <Screen {...P} />
        </ErrorBoundary>
      </View>
      {/* Menu bawah: 2 menu | slot tengah (tombol Transaksi menonjol) | 2 menu. Ikon di atas, label di bawah. */}
      <View style={[s.nav, { paddingBottom: insets.bottom + 4 }]}>
        {[0, 1, 'C', 2, 3].map(k => {
          if (k === 'C') return (
            <TouchableOpacity key="C" style={s.navI} activeOpacity={0.7} onPress={() => openForm()} accessibilityRole="button" accessibilityLabel="Tambah transaksi">
              <Text style={[s.navT, { color: NAVY, fontWeight: '800' }]}>Tambah</Text>
            </TouchableOpacity>);
          const [name, icon] = TABS[k]; const on = tab === k;
          return (
            <TouchableOpacity key={name} style={s.navI} activeOpacity={0.7} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{ selected: on }}>
              <NavIcon name={icon} color={on ? NAVY : '#8794a6'} strokeWidth={on ? 2.2 : 1.9} />
              <Text style={[s.navT, on && { color: NAVY, fontWeight: '800' }]} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>);
        })}
      </View>
      {/* Tombol bulat di tengah dibuat sebagai lapisan sendiri agar bagian yang menonjol ke atas tetap bisa diketuk di Android */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 22, alignItems: 'center' }}>
        <TouchableOpacity style={s.navC} activeOpacity={0.85} onPress={() => openForm()} accessibilityRole="button" accessibilityLabel="Tambah transaksi">
          <NavIcon name="tambah" color="#fff" size={26} strokeWidth={2.6} />
        </TouchableOpacity>
      </View>

      <ErrorBoundary label="book-sheet" onReset={() => setSheet(false)} retryLabel="Tutup" title="Daftar buku kas bermasalah">
        <BookSheet visible={sheet} onClose={() => setSheet(false)} activeId={book.id} tick={tick} hide={hide} y={y} m={m}
          onSwitch={switchBook} onChanged={() => setTick(t => t + 1)} notify={notify} />
      </ErrorBoundary>

      {/* Halaman form tambah/edit: menutup seluruh layar, layar di belakangnya tetap terjaga (posisi scroll tidak hilang) */}
      {form && (
        <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, bottom: 0, backgroundColor: BG }}>
          <ErrorBoundary label="form" onReset={() => setForm(null)} retryLabel="Tutup form" title="Form transaksi bermasalah">
            <TransaksiFormScreen key={form.tx ? form.tx.id : 'baru'} tx={form.tx} onClose={() => setForm(null)} onSaved={onSaved} notify={notify} bump={P.bump} />
          </ErrorBoundary>
        </View>)}

      {/* Halaman Transaksi Berulang: daftar tagihan tetap + pengingat jatuh tempo */}
      {recOpen && (
        <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, bottom: 0, backgroundColor: BG }}>
          <ErrorBoundary label="berulang" onReset={() => setRecOpen(false)} retryLabel="Tutup" title="Transaksi berulang bermasalah">
            <BerulangScreen tick={tick} bump={P.bump} notify={notify} onClose={() => setRecOpen(false)} />
          </ErrorBoundary>
        </View>)}

      {/* Halaman profil: menutup seluruh layar, dibuka dari ikon di kanan atas */}
      {profileOpen && (
        <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, bottom: 0, backgroundColor: BG }}>
          <ErrorBoundary label="profil" onReset={() => setProfileOpen(false)} retryLabel="Tutup" title="Halaman profil bermasalah">
            <ProfileScreen profile={profile} onClose={() => setProfileOpen(false)} onLogin={loginGoogle} onLogout={logout} onRename={rename}
              onClientId={() => setClientOpen(true)} cfgTick={cfgTick} sessionOk={sessionOk} sync={syncInfo} onSyncNow={syncNowUi} onReconnect={reconnect} />
          </ErrorBoundary>
        </View>)}

      {/* Layar sambutan (sekali saja): daftar/masuk Google atau lanjut tanpa akun */}
      {welcome && <WelcomeScreen onGoogle={async () => { if (await loginGoogle()) finishWelcome(); }} onSkip={finishWelcome} onClientId={() => setClientOpen(true)} clientIdSet={hasWebClientId()} />}

      <ClientIdSheet visible={clientOpen} hasSession={!!profile} onClose={() => setClientOpen(false)} onSaved={onClientSaved} />

      {toast && (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 64, left: 0, right: 0, alignItems: 'center' }}>
          <View style={s.toast}><Text style={s.toastT}>{toast}</Text></View>
        </View>)}
    </View>
  );
}

export default function App() {
  if (bootError) return (
    <ErrorFallback full canBackup={false} error={bootError} title="Database tidak dapat dibuka"
      hint="Aplikasi gagal menyiapkan database. Pembaruan database berjalan sekali-jalan dan dibatalkan penuh saat gagal, jadi data lama Anda tidak berubah. Tutup lalu buka ulang aplikasi. Bila tetap gagal, kirimkan pesan di bawah ini ke pembuat aplikasi; jangan hapus data aplikasi." />);
  // Lapisan terluar: kesalahan yang lolos dari semua pelindung di dalam tetap menampilkan layar penjelasan, bukan layar putih
  return <ErrorBoundary label="root" full title="Aplikasi mengalami kesalahan"><SafeAreaProvider><Main /></SafeAreaProvider></ErrorBoundary>;
}
