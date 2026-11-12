import { Platform } from 'react-native';
import { db, meta, setMeta } from './db';
import { rp, MASK } from './calc';
import { pendingList, thresholdNote, addDays, daysBetween, dueLabel } from './recurring';

// ===== Pengingat jatuh tempo (notifikasi lokal, tanpa server) =====
// Aplikasi menjadwalkan notifikasi untuk kejadian berulang yang belum diproses, lalu menjadwalkan ulang SEMUANYA setiap kali data berubah,
// aplikasi dibuka, atau kembali aktif (lihat refreshRecurring di App.js). Notifikasi dikirim sistem Android pada pukul 09.00.
// Isi notifikasi memuat dampak terhadap anggaran memakai ambang 80% dan 100% yang sama dengan Dashboard (recurring.thresholdNote).

let N = null;
try { N = require('expo-notifications'); } catch (e) { N = null; } // modul native: tidak ada di build lama / Expo Go lama -> fitur pengingat mati, aplikasi tetap jalan

const CHANNEL = 'tagihan';
const PREFIX = 'br-rec-';
const HOUR = 9;
const MAX_SCHEDULED = 60; // batas aman jumlah notifikasi terjadwal (iOS membatasi 64)
const LEVEL_ICON = { over: '🔴', full: '🔴', warn: '🟠', nobudget: '⚪', near: '🟢', done: '🟢' };

export const reminderAvailable = () => !!N;
export const getMask = () => meta('notif.mask') !== '0'; // default: nominal disamarkan di notifikasi (layar kunci)
export const setMask = v => setMeta('notif.mask', v ? 1 : 0);

const channel = () => N.setNotificationChannelAsync(CHANNEL, { name: 'Pengingat tagihan', description: 'Pengingat jatuh tempo transaksi berulang', importance: N.AndroidImportance.HIGH });

export function initNotifications() {
  if (!N) return;
  try {
    N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    if (Platform.OS === 'android') channel().catch(() => {});
  } catch (e) { /* abaikan: pengingat saja yang mati */ }
}

// 'granted' | 'undetermined' (belum ditanya) | 'denied' (ditolak, harus lewat Pengaturan HP) | 'unavailable'
export async function permissionState() {
  if (!N) return 'unavailable';
  try {
    const r = await N.getPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (e) { return 'unavailable'; }
}

export async function askPermission() {
  if (!N) return 'unavailable';
  try {
    if (Platform.OS === 'android') await channel(); // Android 13+: dialog izin baru muncul setelah ada channel
    const r = await N.requestPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (e) { return 'unavailable'; }
}

const at9 = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d, HOUR, 0, 0); };

// Rencana notifikasi: untuk tiap kejadian belum diproses -> (H-n bila diatur), hari-H, dan (khusus mode "ingatkan saja") H+2 bila belum dicatat.
export function buildPlan(now = new Date()) {
  const fmt = getMask() ? () => MASK : rp;
  const multi = db.getFirstSync('SELECT COUNT(*) c FROM books').c > 1;
  const names = new Map(db.getAllSync('SELECT id,nama FROM books').map(b => [b.id, b.nama]));
  const plan = [];
  pendingList({ bookId: null, lookback: 1, ahead: 2, now }).forEach(o => {
    const r = o.r;
    if (r.ingat < 0) return; // pengguna memilih tanpa pengingat
    const days = [];
    if (r.ingat > 0) days.push(addDays(o.due, -r.ingat));
    days.push(o.due);
    if (!r.otomatis) days.push(addDays(o.due, 2));
    days.forEach(day => {
      const at = at9(day);
      if (at.getTime() < now.getTime() + 60000) return; // sudah lewat
      const left = daysBetween(o.due, day);
      const note = thresholdNote(r, o.periode, fmt);
      const lines = [`${fmt(r.nominal)}${r.ket ? ' • ' + r.ket : ''}${multi ? ' • ' + (names.get(r.book_id) || '') : ''}`];
      if (note) lines.push(`${LEVEL_ICON[note.level] || '•'} ${note.text}`);
      lines.push(r.otomatis ? (left <= 0 ? 'Akan dicatat otomatis saat aplikasi dibuka.' : 'Akan dicatat otomatis saat jatuh tempo.') : 'Sudah dibayar? Buka aplikasi lalu ketuk Catat.');
      plan.push({ id: `${PREFIX}${r.id}-${o.periode}-${day}`, at, title: `🔁 ${r.kategori} • ${dueLabel(left)}`, body: lines.join('\n') });
    });
  });
  return plan.sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULED);
}

async function doSync() {
  const st = await permissionState();
  if (st === 'unavailable') return { status: st, n: 0 };
  const old = await N.getAllScheduledNotificationsAsync();
  await Promise.all(old.filter(x => String(x.identifier).startsWith(PREFIX)).map(x => N.cancelScheduledNotificationAsync(x.identifier)));
  if (st !== 'granted') return { status: st, n: 0 };
  const plan = buildPlan();
  for (const p of plan) {
    await N.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { buka: 'berulang' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
  return { status: 'granted', n: plan.length };
}

// Penjadwalan ulang dijalankan satu per satu (antrean) supaya dua panggilan beruntun tidak saling menimpa. Tidak pernah melempar error.
let chain = Promise.resolve({ status: 'unavailable', n: 0 });
export function syncReminders() {
  chain = chain.then(doSync).catch(() => ({ status: 'error', n: 0 }));
  return chain;
}

// Notifikasi uji (5 detik) untuk memastikan izin & saluran notifikasi berfungsi
export async function testReminder() {
  if (!N) return false;
  await N.scheduleNotificationAsync({
    content: { title: '🔁 Tes pengingat tagihan', body: 'Jika Anda membaca ini, pengingat jatuh tempo berfungsi.', data: { buka: 'berulang' } },
    trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL },
  });
  return true;
}

// Dipakai App.js untuk membuka layar Transaksi Berulang saat notifikasi diketuk
export function onReminderTap(cb) {
  if (!N) return () => {};
  const open = resp => { const d = resp && resp.notification && resp.notification.request.content.data; if (d && d.buka === 'berulang') cb(); };
  try {
    const last = N.getLastNotificationResponse && N.getLastNotificationResponse(); // aplikasi dibuka dari notifikasi (cold start)
    if (last) { open(last); N.clearLastNotificationResponse && N.clearLastNotificationResponse(); }
    const sub = N.addNotificationResponseReceivedListener(r => { open(r); N.clearLastNotificationResponse && N.clearLastNotificationResponse(); });
    return () => sub.remove();
  } catch (e) { return () => {}; }
}
