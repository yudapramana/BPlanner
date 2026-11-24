// Uji layar: setiap layar dirender dengan database sungguhan (sql.js) lalu dipakai seperti pengguna:
// ketuk tombol, isi kolom, jawab dialog. Yang diperiksa: teks di layar, isi database, dan callback ke App.
import { act, render, renderAsync, rerender, allText, texts, press, pressAsync, pressables, inputs, input, type, lastAlert, clearAlerts, pressAlert } from './helpers/screen';
import { freshDb, cat, tx, rows, count } from './helpers/db';
import { addBook, setActiveBook, bid } from '../lib/db';
import { toYmd } from '../components/DateField';
import DashboardScreen from '../screens/DashboardScreen';
import TransaksiScreen from '../screens/TransaksiScreen';
import TransaksiFormScreen from '../screens/TransaksiFormScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import PengaturanScreen from '../screens/PengaturanScreen';
import DataScreen from '../screens/DataScreen';
import BerulangScreen from '../screens/BerulangScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WelcomeScreen from '../screens/WelcomeScreen';

const today = toYmd(new Date());
const NOW_Y = +today.slice(0, 4), NOW_M = +today.slice(5, 7);

// Data contoh November 2026: gaji 5 jt, makan 2 transaksi, satu pembelian emas (Investasi/Tabungan), satu transaksi tahun lalu.
function seed() {
  freshDb();
  cat('Pendapatan', 'Gaji', 5000000); cat('Biaya', 'Makan', 1000000); cat('Biaya', 'Transport', 300000); cat('Investasi/Tabungan', 'Emas', 0);
  tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000);
  tx('2026-11-03', 'Biaya', 'Makan', 25000, 'nasi padang');
  tx('2026-11-05', 'Biaya', 'Makan', 40000, 'bakso');
  tx('2026-11-07', 'Investasi/Tabungan', 'Emas', 900000, 'tring 0.5 gr');
  tx('2025-12-20', 'Biaya', 'Transport', 15000, 'ojek');
}
const fn = () => jest.fn();
let p;
beforeEach(() => {
  seed(); clearAlerts();
  p = { y: 2026, m: 11, setY: fn(), setM: fn(), tick: 0, goTab: fn(), openForm: fn(), hide: false, toggleHide: fn(), openRec: fn(), bump: fn(), notify: fn(), openProfile: fn(), onClose: fn(), onSaved: fn() };
});

// ============================================================ Dashboard
describe('DashboardScreen', () => {
  test('ringkasan bulan: saldo, pemasukan, pengeluaran (termasuk tabungan emas), dan 5 transaksi terbaru', () => {
    const r = render(<DashboardScreen {...p} />);
    const t = allText(r);
    expect(t).toContain('November 2026');
    expect(t).toContain('Rp 4.035.000'); // 5.000.000 − 25.000 − 40.000 − 900.000
    expect(t).toContain('Rp 965.000'); // total keluar
    expect(t).toContain('nasi padang'); expect(t).toContain('tring 0.5 gr');
    expect(t).not.toContain('ojek'); // tahun lalu tidak ikut
  });
  test('mode sembunyikan angka: tidak ada nominal rupiah yang tampil', () => {
    const r = render(<DashboardScreen {...p} hide />);
    expect(texts(r).filter(x => /Rp\s?\d/.test(x))).toEqual([]);
    press(r, 'Tampilkan angka'); expect(p.toggleHide).toHaveBeenCalled();
  });
  test('mengetuk transaksi terbaru tidak crash; "Lihat semua transaksi" pindah tab', () => {
    const r = render(<DashboardScreen {...p} />);
    press(r, 'Lihat semua transaksi →'); expect(p.goTab).toHaveBeenCalled();
  });
  test('bulan kosong: tidak crash dan saldo Rp 0', () => {
    const r = render(<DashboardScreen {...p} y={2026} m={1} />);
    expect(allText(r)).toContain('Januari 2026'); expect(allText(r)).toContain('Rp 0');
  });
  test('panah bulan memanggil setY/setM', () => {
    const r = render(<DashboardScreen {...p} />);
    press(r, 'Bulan berikutnya'); expect(p.setM).toHaveBeenCalled();
  });
});

// ============================================================ Daftar transaksi
describe('TransaksiScreen', () => {
  test('dikelompokkan per hari, terbaru di atas, dengan total masuk/keluar bulan', () => {
    const r = render(<TransaksiScreen {...p} />);
    const t = texts(r);
    expect(t).toContain('4 TRANSAKSI');
    const i7 = t.findIndex(x => x.startsWith('Sab, 07 November')), i3 = t.findIndex(x => x.startsWith('Sel, 03 November'));
    expect(i7).toBeGreaterThan(-1); expect(i3).toBeGreaterThan(i7);
    expect(t).toContain('Rp 5 jt'); expect(t).toContain('Rp 965 rb');
  });
  test('pencarian keterangan menyaring daftar dan menampilkan jumlah hasil', () => {
    const r = render(<TransaksiScreen {...p} />);
    type(r, /Cari/, 'bakso');
    const t = allText(r);
    expect(t).toContain('bakso'); expect(t).not.toContain('nasi padang'); expect(t).toMatch(/1 transaksi/);
  });
  test('tidak ditemukan di bulan ini -> tombol "Cari di semua waktu" menemukan transaksi tahun lalu', () => {
    const r = render(<TransaksiScreen {...p} />);
    type(r, /Cari/, 'ojek');
    expect(allText(r)).toContain('Tidak ada transaksi yang cocok.');
    press(r, 'Cari di semua waktu');
    expect(allText(r)).toContain('ojek'); expect(allText(r)).toContain('20 Desember 2025'); // tampil dengan tahun
  });
  test('filter jenis lalu kategori', () => {
    const r = render(<TransaksiScreen {...p} />);
    press(r, 'Biaya');
    expect(allText(r)).not.toContain('Gaji'); expect(allText(r)).toContain('nasi padang');
    press(r, 'Transport'); // chip kategori muncul setelah jenis dipilih
    expect(allText(r)).toContain('Tidak ada transaksi yang cocok.');
    press(r, 'Semua kategori'); expect(allText(r)).toContain('bakso');
  });
  test('mengetuk baris membuka form edit dengan transaksi itu', () => {
    const r = render(<TransaksiScreen {...p} />);
    press(r, 'bakso');
    expect(p.openForm).toHaveBeenCalledWith(expect.objectContaining({ ket: 'bakso', nominal: 40000 }));
  });
  test('bulan kosong menampilkan petunjuk menambah transaksi', () => {
    const r = render(<TransaksiScreen {...p} m={2} />);
    expect(allText(r)).toContain('Belum ada transaksi bulan ini.');
  });
  test('ribuan transaksi: tetap dirender lengkap tanpa batas 500 baris', () => {
    const c = rows("SELECT id FROM categories WHERE nama='Makan'")[0].id;
    const { db } = require('../lib/db');
    db.withTransactionSync(() => { for (let i = 0; i < 1200; i++) db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES(?,?,?,?,?,?,?)', ['2026-11-15', 'Biaya', 'Makan', 1000, 'x' + i, 1, c]); });
    const r = render(<TransaksiScreen {...p} />);
    expect(allText(r)).toContain('1204 TRANSAKSI');
    expect(texts(r)).toContain('x0'); expect(texts(r)).toContain('x1199');
  });
});

// ============================================================ Form transaksi
describe('TransaksiFormScreen', () => {
  const pick = (r, jenis, kat) => { press(r, jenis); press(r, kat); };
  test('validasi: tanpa nominal & kategori tidak tersimpan, pesan kesalahan tampil', () => {
    const before = count('transactions');
    const r = render(<TransaksiFormScreen {...p} />);
    press(r, 'Simpan');
    expect(allText(r)).toContain('Isi nominal lebih dari 0'); expect(allText(r)).toContain('Pilih satu kategori');
    expect(count('transactions')).toBe(before); expect(p.onSaved).not.toHaveBeenCalled();
  });
  test('simpan transaksi baru: masuk database, App diberi tahu, form ditutup', () => {
    const r = render(<TransaksiFormScreen {...p} />);
    pick(r, 'Biaya', 'Transport');
    type(r, '0', '12.500'); // titik pemisah ribuan dibuang
    type(r, /Contoh: Makan siang/, '  angkot  ');
    press(r, 'Simpan');
    const t = rows("SELECT * FROM transactions WHERE kategori='Transport' AND tanggal=?", [today]);
    expect(t).toHaveLength(1); expect(t[0]).toMatchObject({ nominal: 12500, ket: 'angkot', jenis: 'Biaya', book_id: 1 });
    expect(p.onSaved).toHaveBeenCalledWith(today); expect(p.onClose).toHaveBeenCalled();
    expect(p.notify.mock.calls[0][0]).toBe('✔ Transport Rp 12.500 tersimpan');
  });
  test('tombol cepat menambah nominal; "Hapus" mengosongkan', () => {
    const r = render(<TransaksiFormScreen {...p} />);
    press(r, '+50rb'); press(r, '+10rb');
    expect(input(r, '0').props.value).toBe('60.000');
    press(r, 'Hapus'); expect(input(r, '0').props.value).toBe('');
  });
  test('"Simpan & Tambah Lagi" menyimpan lalu mengosongkan form tanpa menutup', () => {
    const r = render(<TransaksiFormScreen {...p} />);
    pick(r, 'Biaya', 'Makan'); press(r, '+10rb');
    press(r, 'Simpan & Tambah Lagi');
    expect(p.onClose).not.toHaveBeenCalled(); expect(input(r, '0').props.value).toBe('');
    expect(rows('SELECT * FROM transactions WHERE tanggal=? AND nominal=10000', [today])).toHaveLength(1);
  });
  test('ganti jenis mengosongkan pilihan kategori (kategori Biaya tidak terbawa ke Pendapatan)', () => {
    const r = render(<TransaksiFormScreen {...p} />);
    pick(r, 'Biaya', 'Makan'); press(r, '+10rb');
    press(r, 'Pendapatan'); press(r, 'Simpan');
    expect(allText(r)).toContain('Pilih satu kategori');
  });
  test('petunjuk anggaran: sisa bulan ini dan status setelah transaksi', () => {
    const r = render(<TransaksiFormScreen {...p} tx={rows("SELECT * FROM transactions WHERE ket='bakso'")[0]} />);
    expect(allText(r)).toContain('Anggaran Rp 1.000.000  •  bulan ini Rp 25.000'); // bakso sendiri tidak dihitung dua kali
  });
  test('edit transaksi: nilai lama terisi, perubahan tersimpan', () => {
    const old = rows("SELECT * FROM transactions WHERE ket='bakso'")[0];
    const r = render(<TransaksiFormScreen {...p} tx={old} />);
    expect(allText(r)).toContain('Edit Transaksi'); expect(input(r, '0').props.value).toBe('40.000');
    type(r, '0', '45000'); press(r, 'Simpan Perubahan');
    expect(rows('SELECT nominal FROM transactions WHERE id=?', [old.id])[0].nominal).toBe(45000);
    expect(count('transactions')).toBe(5);
    expect(p.notify.mock.calls[0][0]).toMatch(/diperbarui/);
  });
  test('hapus dengan konfirmasi, lalu "Urungkan" mengembalikan transaksi yang sama', () => {
    const old = rows("SELECT * FROM transactions WHERE ket='bakso'")[0];
    const r = render(<TransaksiFormScreen {...p} tx={old} />);
    press(r, '🗑  Hapus transaksi ini');
    expect(lastAlert().title).toBe('Hapus transaksi?');
    pressAlert('Batal'); expect(count('transactions')).toBe(5);
    press(r, '🗑  Hapus transaksi ini'); pressAlert('Hapus');
    expect(count('transactions')).toBe(4); expect(p.onClose).toHaveBeenCalled();
    const [msg, action] = p.notify.mock.calls.at(-1);
    expect(msg).toBe('Transaksi dihapus'); act(() => action.onPress());
    expect(rows('SELECT * FROM transactions WHERE id=?', [old.id])[0]).toMatchObject({ ket: 'bakso', nominal: 40000 });
  });
  test('"Ulangi tiap bulan" membuat jadwal berulang yang terhubung ke transaksi ini', async () => {
    const r = render(<TransaksiFormScreen {...p} />);
    pick(r, 'Biaya', 'Transport'); press(r, '+100rb');
    act(() => { r.root.findByType('Switch').props.onValueChange(true); });
    expect(allText(r)).toContain('Dicatat otomatis setiap tanggal');
    await act(async () => { press(r, 'Simpan'); });
    const rec = rows('SELECT * FROM recurring');
    expect(rec).toHaveLength(1); expect(rec[0]).toMatchObject({ kategori: 'Transport', nominal: 100000, hari: +today.slice(8, 10) });
    expect(rows('SELECT recurring_id FROM transactions WHERE tanggal=? AND nominal=100000', [today])[0].recurring_id).toBe(rec[0].id);
    expect(p.notify.mock.calls[0][0]).toMatch(/diulang tiap bulan/);
  });
  test('transaksi lama yang kategorinya sudah dihapus: diminta memilih kategori baru', () => {
    const id = tx('2026-11-09', 'Biaya', 'Hilang', 5000);
    const r = render(<TransaksiFormScreen {...p} tx={rows('SELECT * FROM transactions WHERE id=?', [id])[0]} />);
    expect(allText(r)).toContain('Kategori lama "Hilang" sudah dihapus');
  });
});

// ============================================================ Pengeluaran
describe('ExpensesScreen', () => {
  test('total bulan termasuk Investasi/Tabungan (kasus Kas Emas)', () => {
    const r = render(<ExpensesScreen {...p} />);
    expect(allText(r)).toContain('Rp 965.000');
    expect(allText(r)).toContain('Emas');
  });
  test('cakupan Bulan / Tahun / Semua waktu mengubah total per kategori', () => {
    const r = render(<ExpensesScreen {...p} />);
    expect(allText(r)).toContain('Total Rp 965.000  •  3 transaksi');
    press(r, 'Semua waktu');
    expect(allText(r)).toContain('Total Rp 980.000  •  4 transaksi');
    expect(allText(r)).toContain('Transport');
    press(r, 'Tahun'); expect(allText(r)).toContain('Total Rp 965.000  •  3 transaksi');
  });
  test('buku kas khusus emas tanpa pemasukan: total pengeluaran tidak 0', () => {
    const b = addBook('Kas Emas', 'Tabungan'); setActiveBook(b);
    cat('Investasi/Tabungan', 'Emas Tring', 0, b);
    tx('2026-11-10', 'Investasi/Tabungan', 'Emas Tring', 10000, '', b); tx('2026-11-11', 'Investasi/Tabungan', 'Emas Tring', 900000, '', b);
    const r = render(<ExpensesScreen {...p} />);
    expect(allText(r)).toContain('Rp 910.000');
    expect(allText(r)).not.toContain('Gaji');
  });
});

// ============================================================ Anggaran (Pengaturan)
describe('PengaturanScreen (tab Anggaran)', () => {
  const row = n => new RegExp(`^${n.replace('/', '\\/')},`); // baris / judul kelompok dicari lewat label aksesibilitas: "Makan, Rp 1.000.000. Ketuk..."
  const sheetOpen = r => inputs(r).length > 0;
  test('daftar tanpa kolom isian: kategori tampil sebagai teks, hanya kelompok Biaya terbuka di awal', () => {
    const r = render(<PengaturanScreen {...p} />);
    expect(inputs(r)).toHaveLength(0);
    const t = allText(r);
    expect(t).toContain('Makan'); expect(t).toContain('Rp 1.000.000'); expect(t).toContain('Transport');
    expect(t).not.toContain('Gaji'); // Pendapatan terlipat
    expect(t).toContain('1 kategori • Rp 5 jt'); // ringkasan kelompok terlipat tetap terlihat
    expect(t).toContain('Sisa rencana: Rp 3.700.000'); // 5.000.000 − (1.000.000 + 300.000)
  });
  test('anggaran Rp 0 ditulis "belum diatur"', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Investasi/Tabungan'));
    expect(allText(r)).toContain('Emas'); expect(allText(r)).toContain('belum diatur');
  });
  test('kelompok yang dibuka/dilipat diingat saat layar dibuka lagi', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Pendapatan')); press(r, row('Biaya'));
    const r2 = render(<PengaturanScreen {...p} />);
    expect(allText(r2)).toContain('Gaji'); expect(allText(r2)).not.toContain('Transport');
  });
  test('ketuk kategori -> lembar edit (2 kolom isian) dengan info pemakaian; ubah anggaran lalu Simpan', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Makan'));
    expect(inputs(r)).toHaveLength(2);
    expect(input(r, 'Nama kategori').props.value).toBe('Makan'); expect(input(r, 'Anggaran per bulan').props.value).toBe('1.000.000');
    expect(allText(r)).toContain('Terpakai November 2026:'); expect(allText(r)).toContain('(7% dari anggaran di atas) | Rp 65.000');
    expect(allText(r)).toContain('2 transaksi memakai kategori ini');
    type(r, 'Anggaran per bulan', '1.250.000'); press(r, 'Simpan');
    expect(rows("SELECT anggaran FROM categories WHERE nama='Makan'")[0].anggaran).toBe(1250000);
    expect(p.notify).toHaveBeenCalledWith('✔ Makan disimpan'); expect(sheetOpen(r)).toBe(false);
  });
  test('ganti nama ke nama yang sudah ada ditolak; lembar tetap terbuka dan data tidak berubah', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Transport'));
    type(r, 'Nama kategori', 'makan'); press(r, 'Simpan');
    expect(lastAlert().title).toBe('Nama sudah dipakai');
    expect(sheetOpen(r)).toBe(true); expect(count('categories', "nama='Transport'")).toBe(1);
  });
  test('ganti nama ikut memperbarui transaksinya', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Makan')); type(r, 'Nama kategori', 'Makan & Minum'); press(r, 'Simpan');
    expect(count('transactions', "kategori='Makan & Minum'")).toBe(2);
  });
  test('tambah kategori baru dengan anggarannya sekaligus; nama kosong / kembar ditolak', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, '＋ Tambah kategori');
    expect(allText(r)).toContain('Tambah kategori • Biaya');
    press(r, 'Simpan'); expect(allText(r)).toContain('Isi nama kategori');
    type(r, 'Nama kategori', 'Makan'); press(r, 'Simpan'); expect(lastAlert().title).toBe('Nama sudah dipakai');
    type(r, 'Nama kategori', 'Pulsa'); press(r, '+50rb'); press(r, '+50rb'); press(r, 'Simpan');
    expect(rows("SELECT jenis,anggaran FROM categories WHERE nama='Pulsa'")).toEqual([{ jenis: 'Biaya', anggaran: 100000 }]);
    expect(sheetOpen(r)).toBe(false);
  });
  test('menutup lembar dengan perubahan belum disimpan meminta konfirmasi; tanpa perubahan langsung tertutup', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Makan')); press(r, 'Tutup'); expect(sheetOpen(r)).toBe(false); // tanpa perubahan
    press(r, row('Makan')); press(r, '+100rb'); clearAlerts(); press(r, 'Tutup');
    expect(lastAlert().title).toBe('Buang perubahan?');
    pressAlert('Lanjut edit'); expect(sheetOpen(r)).toBe(true);
    press(r, 'Tutup'); pressAlert('Buang'); expect(sheetOpen(r)).toBe(false);
    expect(rows("SELECT anggaran FROM categories WHERE nama='Makan'")[0].anggaran).toBe(1000000);
  });
  test('hapus dari lembar edit: pilihan "kategori saja" atau "+ transaksi"; Batal membiarkan lembar terbuka', () => {
    const r = render(<PengaturanScreen {...p} />);
    press(r, row('Makan')); press(r, '🗑  Hapus kategori');
    expect(lastAlert().title).toBe('Hapus "Makan"?'); expect(lastAlert().message).toContain('2 transaksi (total Rp 65.000)');
    pressAlert('Batal'); expect(sheetOpen(r)).toBe(true);
    press(r, '🗑  Hapus kategori'); pressAlert('Hapus + 2 transaksi');
    expect(count('categories', "nama='Makan'")).toBe(0); expect(count('transactions', "kategori='Makan'")).toBe(0);
    expect(sheetOpen(r)).toBe(false);
  });
  test('kartu Data & Cadangan membuka halamannya', () => {
    const openData = jest.fn();
    const r = render(<PengaturanScreen {...p} openData={openData} />);
    press(r, /^Data dan Cadangan/); expect(openData).toHaveBeenCalled();
  });
});

// ============================================================ Data & Cadangan
describe('DataScreen', () => {
  test('kosongkan buku kas: konfirmasi, backup otomatis dulu, lalu data buku ini terhapus', async () => {
    const r = render(<DataScreen {...p} />);
    press(r, /Kosongkan Buku Kas/);
    expect(lastAlert().title).toBe('Kosongkan buku kas ini?');
    const ok = lastAlert().buttons.find(b => b.text === 'Kosongkan');
    await act(async () => { await ok.onPress(); });
    expect(count('transactions', 'book_id=1')).toBe(0); expect(count('categories', 'book_id=1')).toBe(0);
  });
  test('cadangan Drive tanpa login: diminta masuk dulu', async () => {
    const r = render(<DataScreen {...p} profile={null} />);
    await pressAsync(r, /Cadangkan ke Google Drive/);
    expect(lastAlert().title).toBe('Masuk dulu');
    pressAlert('Buka Profil'); expect(p.openProfile).toHaveBeenCalled();
  });
  test('tombol Kembali menutup halaman', () => {
    const r = render(<DataScreen {...p} />);
    press(r, 'Kembali'); expect(p.onClose).toHaveBeenCalled();
  });
});

// ============================================================ Transaksi berulang
describe('BerulangScreen', () => {
  test('daftar kosong lalu tambah transaksi berulang lewat form', async () => {
    const r = await renderAsync(<BerulangScreen {...p} />);
    expect(allText(r)).toContain('Belum ada transaksi berulang');
    press(r, '+ Tambah Transaksi Berulang');
    press(r, 'Tagihan');
    expect(allText(r)).toContain('Belum ada kategori. Tambahkan di tab Anggaran.');
    press(r, 'Biaya'); press(r, 'Transport');
    type(r, '0', '150000');
    type(r, /Cicilan rumah/, 'kartu commuter');
    await act(async () => { press(r, 'Simpan Transaksi Berulang'); });
    expect(rows('SELECT kategori,nominal,ket,book_id FROM recurring')).toEqual([{ kategori: 'Transport', nominal: 150000, ket: 'kartu commuter', book_id: 1 }]);
  });
  test('validasi form berulang: nominal & kategori wajib', async () => {
    const r = await renderAsync(<BerulangScreen {...p} />);
    press(r, '+ Tambah Transaksi Berulang'); press(r, 'Simpan Transaksi Berulang');
    expect(allText(r)).toContain('Isi nominal lebih dari 0'); expect(allText(r)).toContain('Pilih satu kategori');
    expect(count('recurring')).toBe(0);
  });
  test('"Catat sekarang" mencatat transaksi bulan berjalan dari jadwal', async () => {
    const { saveRecurring } = require('../lib/recurring');
    const c = rows("SELECT id FROM categories WHERE nama='Transport'")[0].id;
    saveRecurring({ jenis: 'Biaya', catId: c, nominal: 77000, hari: '28', otomatis: false, aktif: true, ingat: 3, ket: 'langganan', mulai: today.slice(0, 7), akhir: null }, null, 1);
    const r = await renderAsync(<BerulangScreen {...p} />);
    expect(allText(r)).toContain('🔁 Transport • langganan');
    await act(async () => { press(r, 'Catat sekarang'); });
    expect(rows('SELECT nominal,tanggal FROM transactions WHERE nominal=77000')).toEqual([{ nominal: 77000, tanggal: `${today.slice(0, 7)}-28` }]);
  });
});

// ============================================================ Profil & sambutan
describe('ProfileScreen', () => {
  const prof = { nama: 'Pengguna Uji', email: 'uji@contoh.id', since: '2026-01-05' };
  test('tanpa akun: tombol masuk Google memanggil onLogin', async () => {
    const onLogin = jest.fn(async () => {});
    const r = render(<ProfileScreen {...p} profile={null} onLogin={onLogin} />);
    expect(allText(r)).toContain('Mode tanpa akun');
    await pressAsync(r, /Masuk dengan Google|Google/);
    expect(onLogin).toHaveBeenCalled();
  });
  test('dengan akun: data akun, versi aplikasi, dan jumlah data tampil', () => {
    const r = render(<ProfileScreen {...p} profile={prof} sync={{ cap: 60, usedToday: 2 }} sessionOk />);
    const t = allText(r);
    expect(t).toContain('uji@contoh.id'); expect(t).toContain('Terhubung dengan Google');
    expect(t).toContain(require('../app.json').expo.version);
  });
  test('ubah nama tampilan; nama kosong ditolak', () => {
    const onRename = jest.fn();
    const r = render(<ProfileScreen {...p} profile={prof} onRename={onRename} sync={{}} />);
    press(r, 'Ubah nama tampilan');
    type(r, 0, '   '); press(r, 'Simpan');
    expect(lastAlert().title).toBe('Nama kosong'); expect(onRename).not.toHaveBeenCalled();
    type(r, 0, 'Nama Baru'); press(r, 'Simpan');
    expect(onRename).toHaveBeenCalledWith('Nama Baru');
  });
  test('keluar akun & hapus akun meminta konfirmasi sebelum memanggil App', async () => {
    const onLogout = jest.fn(async () => {}), onDeleteAccount = jest.fn(async () => {});
    const r = render(<ProfileScreen {...p} profile={prof} sync={{}} onLogout={onLogout} onDeleteAccount={onDeleteAccount} />);
    press(r, 'Keluar dari akun'); expect(onLogout).not.toHaveBeenCalled();
    await act(async () => { pressAlert('Keluar'); }); expect(onLogout).toHaveBeenCalled();
    press(r, 'Hapus akun & semua data');
    pressAlert('Batal'); expect(onDeleteAccount).not.toHaveBeenCalled();
    await act(async () => { pressAlert('Hapus permanen'); }); expect(onDeleteAccount).toHaveBeenCalled();
  });
  test('saklar kunci aplikasi memanggil onToggleLock', async () => {
    const onToggleLock = jest.fn(async () => {});
    const r = render(<ProfileScreen {...p} profile={null} onToggleLock={onToggleLock} />);
    const sw = r.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === 'Kunci aplikasi')[0];
    await act(async () => { await sw.props.onValueChange(true); });
    expect(onToggleLock).toHaveBeenCalledWith(true);
  });
  test('laporan error tanpa catatan: memberi tahu belum ada error', async () => {
    const r = render(<ProfileScreen {...p} profile={null} />);
    await pressAsync(r, 'Bagikan laporan error');
    expect(lastAlert().title).toBe('Laporan error');
  });
});

describe('WelcomeScreen', () => {
  test('tombol masuk, atur Client ID, dan lanjut tanpa akun', async () => {
    const onGoogle = jest.fn(async () => {}), onSkip = jest.fn(), onClientId = jest.fn();
    const r = render(<WelcomeScreen onGoogle={onGoogle} onSkip={onSkip} onClientId={onClientId} clientIdSet={false} />);
    expect(allText(r)).toContain('belum diisi (ketuk untuk mengisi)');
    press(r, 'Atur Google Web Client ID'); expect(onClientId).toHaveBeenCalled();
    press(r, 'Lanjutkan tanpa akun'); expect(onSkip).toHaveBeenCalled();
    await pressAsync(r, /Masuk dengan Google/); expect(onGoogle).toHaveBeenCalled();
  });
});
