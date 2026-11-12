import { freshDb, cat, tx, rows, count } from './helpers/db';
import * as fsMock from './helpers/expo-file-system';
import { db, addBook, updateBook, setActiveBook, bid, getBooks, findCategory } from '../lib/db';
import { saveRecurring, processRecurring, deleteTransaction } from '../lib/recurring';
import {
  buildSnapshot, inspectImport, runImport, autoBackup, latestAutoBackup, exportAllBooks, exportBackup, shareTemplate, SNAPSHOT_VERSION,
} from '../lib/backup';
import { SEED_CATS } from '../lib/seed';

const NOW = new Date(2026, 10, 11, 12);

// Ringkasan isi seluruh database yang tidak bergantung pada id. Dua database dengan sidik jari sama = datanya sama.
function fingerprint() {
  return getBooks().map(b => ({
    nama: b.nama, tipe: b.tipe,
    cats: rows('SELECT jenis,nama,anggaran FROM categories WHERE book_id=? ORDER BY jenis,nama', [b.id]),
    tx: rows('SELECT t.tanggal,t.jenis,t.kategori,t.nominal,t.ket, c.nama AS cat, CASE WHEN t.recurring_id IS NULL THEN 0 ELSE 1 END AS rec FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.book_id=? ORDER BY t.tanggal,t.jenis,t.kategori,t.nominal,t.ket', [b.id]),
    rec: rows("SELECT r.jenis,r.kategori,r.nominal,r.ket,r.hari,r.mulai,r.akhir,r.otomatis,r.ingat,r.aktif,(SELECT group_concat(periode||':'||status) FROM (SELECT periode,status FROM recurring_log l WHERE l.recurring_id=r.id ORDER BY periode)) logs FROM recurring r WHERE r.book_id=? ORDER BY r.hari,r.nominal", [b.id]),
  }));
}

// Dua buku kas dengan semua jenis data yang perlu dipulihkan: kategori+anggaran, transaksi, transaksi yatim, transaksi 0, berulang + log, buku aktif.
function seedData() {
  freshDb();
  updateBook(1, 'Utama', 'pribadi');
  cat('Pendapatan', 'Gaji', 5000000); cat('Biaya', 'Makanan', 1000000); cat('Tagihan', 'Internet', 200000);
  tx('2026-11-01', 'Pendapatan', 'Gaji', 5000000, 'Gaji November'); tx('2026-11-02', 'Biaya', 'Makanan', 25000, 'Nasi, "uduk"\ntelur');
  db.runSync("INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES('2026-11-03','Biaya','Hilang',5000,'yatim',1,NULL)");
  db.runSync("INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket,book_id,category_id) VALUES('2026-11-04','Biaya','Makanan',0,'nol',1,(SELECT id FROM categories WHERE nama='Makanan'))");
  saveRecurring({ catId: findCategory('Tagihan', 'Internet').id, nominal: 200000, ket: 'Wifi', hari: 5, mulai: '2026-10', otomatis: true, ingat: 3 });
  processRecurring(NOW); // Okt & Nov
  const b2 = addBook('Usaha', 'proyek'); cat('Biaya', 'Bahan', 300000, b2); tx('2026-11-06', 'Biaya', 'Bahan', 150000, 'Kain', b2);
  setActiveBook(b2);
}
const jsonOf = scope => JSON.stringify(buildSnapshot(scope));
const written = suffix => [...fsMock.__store.entries()].find(([k]) => k.endsWith(suffix));
const autoFiles = () => [...fsMock.__store.keys()].filter(k => /auto-backup\/Auto_.*\.json$/i.test(k));

describe('snapshot JSON (buildSnapshot)', () => {
  beforeEach(seedData);

  test('struktur file: format, versi, semua buku, kategori, transaksi, berulang + log', () => {
    const s = buildSnapshot('all');
    expect(s).toMatchObject({ format: 'budgetplanner-backup', version: SNAPSHOT_VERSION });
    expect(s.books.map(b => [b.nama, b.tipe, b.aktif])).toEqual([['Utama', 'pribadi', false], ['Usaha', 'proyek', true]]);
    const u = s.books[0];
    expect(u.kategori).toHaveLength(3); expect(u.transaksi).toHaveLength(6);
    expect(u.berulang).toHaveLength(1);
    expect(u.berulang[0]).toMatchObject({ kategori: 'Internet', nominal: 200000, hari: 5, mulai: '2026-10', otomatis: 1, log: [{ periode: '2026-10', status: 'done' }, { periode: '2026-11', status: 'done' }] });
  });
  test('transaksi menunjuk kategori lewat indeks, yatim = null, hasil berulang menunjuk templat lewat "rec"', () => {
    const u = buildSnapshot('all').books[0];
    const t = n => u.transaksi.find(x => x.ket === n);
    expect(u.kategori[t('Gaji November').kat].nama).toBe('Gaji'); expect(t('yatim').kat).toBeNull();
    expect(t('Gaji November').rec).toBeNull(); expect(u.transaksi.filter(x => x.rec === 0)).toHaveLength(2);
  });
  test("scope 'active' hanya memuat buku aktif", () => {
    expect(buildSnapshot('active').books.map(b => b.nama)).toEqual(['Usaha']);
  });
});

describe('Pulihkan (replace) dari JSON', () => {
  test('backup lalu pulihkan ke database yang sudah berubah = data kembali persis sama', async () => {
    seedData();
    const before = fingerprint(); const json = jsonOf('all');
    // rusak / ubah semua data
    db.runSync('DELETE FROM transactions'); db.runSync("UPDATE categories SET anggaran=1, nama=nama||'x'"); addBook('Sampah', 'acara'); setActiveBook(1);
    expect(fingerprint()).not.toEqual(before);
    const out = await runImport(inspectImport(json), true);
    expect(fingerprint()).toEqual(before);
    expect(out.res).toMatchObject({ buku: 2, bukuBaru: 2, tx: 7, rec: 1, lewat: 0, dobel: 0 });
    expect(bid()).toBe(getBooks().find(b => b.nama === 'Usaha').id); // buku aktif ikut kembali
  });
  test('transaksi hasil berulang tetap terhubung ke log: menghapusnya setelah pulih = dilewati, tidak dibuat ulang', async () => {
    seedData();
    await runImport(inspectImport(jsonOf('all')), true);
    expect(count('recurring_log', "status='done' AND tx_id IS NULL")).toBe(0);
    const t = rows("SELECT id FROM transactions WHERE tanggal='2026-11-05'")[0];
    deleteTransaction(t.id);
    expect(processRecurring(NOW)).toBe(0);
    expect(count('transactions', "tanggal='2026-11-05'")).toBe(0);
  });
  test('transaksi yatim tetap yatim; transaksi nominal 0 tetap dipulihkan', async () => {
    seedData(); await runImport(inspectImport(jsonOf('all')), true);
    expect(rows("SELECT category_id FROM transactions WHERE ket='yatim'")[0].category_id).toBeNull();
    expect(count('transactions', 'nominal=0')).toBe(1);
  });
  test('selalu didahului backup otomatis yang berisi data SEBELUM diganti', async () => {
    seedData(); const json = jsonOf('all');
    db.runSync('DELETE FROM transactions');
    const out = await runImport(inspectImport(json), true);
    expect(out.backup.name).toMatch(/^Auto_.*_SemuaBuku\.json$/);
    const saved = JSON.parse(fsMock.__store.get(out.backup.uri));
    expect(saved.books.reduce((a, b) => a + b.transaksi.length, 0)).toBe(0); // salinan keadaan sebelum import
  });
  test('GAGAL di tengah import: seluruh data lama utuh (tidak setengah terhapus), backup otomatis tetap ada', async () => {
    seedData(); const json = jsonOf('all');
    db.runSync("UPDATE categories SET anggaran=anggaran+1"); addBook('Buku Tambahan', 'acara'); // keadaan "saat ini" berbeda dari isi file
    const before = fingerprint();
    const real = db.runSync.bind(db); let n = 0;
    const spy = jest.spyOn(db, 'runSync').mockImplementation((sql, p) => { if (/^INSERT INTO transactions/.test(sql) && ++n === 4) throw new Error('disk penuh'); return real(sql, p); });
    try { await expect(runImport(inspectImport(json), true)).rejects.toThrow('disk penuh'); } finally { spy.mockRestore(); }
    expect(fingerprint()).toEqual(before);
    expect(autoFiles()).toHaveLength(1);
  });
  test('backup otomatis gagal ditulis -> import dibatalkan sebelum menyentuh data', async () => {
    seedData(); const json = jsonOf('all'); db.runSync('DELETE FROM transactions');
    const before = fingerprint();
    fsMock.__state.failWrites = true;
    await expect(runImport(inspectImport(json), true)).rejects.toThrow('Penyimpanan penuh');
    expect(fingerprint()).toEqual(before);
  });
});

describe('Gabung (merge) dari JSON', () => {
  test('mengimpor file yang sama dua kali tidak menggandakan apa pun', async () => {
    seedData(); const before = fingerprint(); const json = jsonOf('all');
    const r = await runImport(inspectImport(json), false);
    expect(fingerprint()).toEqual(before);
    expect(r.res).toMatchObject({ tx: 0, dobel: 7, rec: 0, bukuBaru: 0, katBaru: 0 });
    expect(autoFiles()).toHaveLength(0); // gabung tidak menghapus apa pun -> tidak perlu backup otomatis
  });
  test('menggabung ke buku bernama sama (tanpa beda huruf besar/kecil): menambah yang baru, memperbarui anggaran, buku lain tidak tersentuh', async () => {
    seedData(); const snap = buildSnapshot('all');
    snap.books[0].nama = 'utama';
    snap.books[0].kategori.find(c => c.nama === 'Makanan').anggaran = 1234567;
    snap.books[0].transaksi.push({ tanggal: '2026-11-09', jenis: 'Biaya', kategori: 'Makanan', nominal: 11111, ket: 'baru', kat: snap.books[0].kategori.findIndex(c => c.nama === 'Makanan'), rec: null });
    const r = await runImport(inspectImport(JSON.stringify(snap)), false);
    expect(r.res.tx).toBe(1); expect(r.res.bukuBaru).toBe(0);
    expect(count('books')).toBe(2);
    expect(findCategory('Biaya', 'Makanan', 1).anggaran).toBe(1234567);
    expect(count('transactions', "ket='baru'")).toBe(1);
  });
  test('buku yang belum ada dibuat baru', async () => {
    seedData(); const snap = buildSnapshot('all'); snap.books[1].nama = 'Liburan';
    const r = await runImport(inspectImport(JSON.stringify(snap)), false);
    expect(r.res.bukuBaru).toBe(1); expect(getBooks().map(b => b.nama)).toEqual(['Utama', 'Usaha', 'Liburan']);
  });
  test('dua transaksi identik DI DALAM file tetap dua-duanya masuk (belanja kembar di hari yang sama itu sah)', async () => {
    freshDb(); cat('Biaya', 'Makanan');
    const snap = { format: 'budgetplanner-backup', version: 1, books: [{ nama: 'Buku Kas Utama', tipe: 'pribadi', kategori: [{ jenis: 'Biaya', nama: 'Makanan', anggaran: 0 }], transaksi: [
      { tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'Makanan', nominal: 5000, ket: 'Kopi', kat: 0 }, { tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'Makanan', nominal: 5000, ket: 'Kopi', kat: 0 }] }] };
    const r = await runImport(inspectImport(JSON.stringify(snap)), false);
    expect(r.res.tx).toBe(2);
    const again = await runImport(inspectImport(JSON.stringify(snap)), false); // diimpor lagi: keduanya dikenali sebagai sudah ada
    expect(again.res).toMatchObject({ tx: 0, dobel: 2 });
  });
});

describe('format file lama / buatan tangan & data tidak bersih', () => {
  const wrap = book => JSON.stringify({ format: 'budgetplanner-backup', version: 1, books: [book] });
  beforeEach(() => freshDb());

  test('file tanpa "kat", "rec", "berulang": kategori dicocokkan lewat nama; nama yang tak cocok jadi yatim', async () => {
    const r = await runImport(inspectImport(wrap({ nama: 'Lama', kategori: [{ jenis: 'Biaya', nama: 'Makanan', anggaran: 100 }],
      transaksi: [{ tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'makanan', nominal: 10, ket: 'a' }, { tanggal: '2026-11-02', jenis: 'Biaya', kategori: 'Entah', nominal: 20 }] })), false);
    expect(r.res).toMatchObject({ tx: 2, rec: 0, lewat: 0 });
    expect(rows("SELECT t.ket, c.nama cat FROM transactions t LEFT JOIN categories c ON c.id=t.category_id ORDER BY t.nominal").map(x => x.cat)).toEqual(['Makanan', null]);
  });
  test('baris rusak dilewati dan dihitung: tanggal mustahil, jenis tak dikenal, kategori tanpa nama; sisanya masuk', async () => {
    const r = await runImport(inspectImport(wrap({ nama: 'Kotor', kategori: [{ jenis: 'Biaya', nama: '  ' }, { jenis: '???', nama: 'X' }, null, { jenis: 'Biaya', nama: 'OK', anggaran: '1.500' }],
      transaksi: [null, { tanggal: '2026-02-30', jenis: 'Biaya', nominal: 1 }, { tanggal: '2026-11-01', jenis: 'Hadiah', nominal: 1 }, { tanggal: 'x', jenis: 'Biaya', nominal: 1 }, { tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'OK', nominal: 7, kat: 3 }] })), false);
    expect(r.res.tx).toBe(1); expect(r.res.lewat).toBe(3 + 4); // 3 kategori rusak + 4 transaksi rusak
    expect(findCategory('Biaya', 'OK', getBooks().find(b => b.nama === 'Kotor').id).anggaran).toBe(1500);
  });
  test('transaksi yang "kat"-nya menunjuk kategori berjenis lain tidak dipasangkan salah (jadi yatim)', async () => {
    await runImport(inspectImport(wrap({ nama: 'Silang', kategori: [{ jenis: 'Pendapatan', nama: 'Gaji', anggaran: 0 }], transaksi: [{ tanggal: '2026-11-01', jenis: 'Biaya', kategori: 'Gaji', nominal: 5, kat: 0 }] })), false);
    expect(rows('SELECT category_id FROM transactions')[0].category_id).toBeNull();
  });
  test('nama buku dipotong 30 huruf; kosong -> "Buku Kas"; jenis tak dikenal -> lainnya', async () => {
    await runImport(inspectImport(JSON.stringify({ format: 'budgetplanner-backup', version: 1, books: [
      { nama: 'A'.repeat(50), tipe: 'ngawur', kategori: [], transaksi: [] }, { nama: '   ', tipe: 'acara', kategori: [], transaksi: [] }] })), false);
    const b = getBooks();
    expect(b[1].nama).toBe('A'.repeat(30)); expect(b[1].tipe).toBe('lainnya'); expect(b[2]).toMatchObject({ nama: 'Buku Kas', tipe: 'acara' });
  });
  test('templat berulang yang tidak valid dilewati (hari 0/32, bulan mulai salah, kategori tidak ada)', async () => {
    const base = { jenis: 'Tagihan', kat: 0, nominal: 5, mulai: '2026-11', hari: 5, otomatis: 1, ingat: 3, aktif: 1, log: [] };
    const r = await runImport(inspectImport(wrap({ nama: 'R', kategori: [{ jenis: 'Tagihan', nama: 'Net', anggaran: 0 }], transaksi: [],
      berulang: [{ ...base, hari: 0 }, { ...base, hari: 32 }, { ...base, mulai: '2026-1' }, { ...base, kat: 9 }, { ...base, jenis: 'Biaya' }, { ...base }] })), false);
    expect(r.res.rec).toBe(1); expect(r.res.lewat).toBe(5); expect(count('recurring')).toBe(1);
  });
});

describe('validasi file sebelum menyentuh data (inspectImport)', () => {
  test.each([
    ['bukan JSON / JSON rusak', '{ rusak', /rusak/],
    ['JSON format lain', '{"nama":"x"}', /Bukan file backup/],
    ['tanpa daftar buku', '{"format":"budgetplanner-backup","books":"x"}', /Bukan file backup/],
    ['daftar buku kosong', '{"format":"budgetplanner-backup","version":1,"books":[]}', /tidak berisi buku/],
    ['buku tanpa kategori/transaksi', '{"format":"budgetplanner-backup","version":1,"books":[{"nama":"x"}]}', /tidak lengkap/],
    ['buku null', '{"format":"budgetplanner-backup","version":1,"books":[null]}', /tidak lengkap/],
  ])('%s -> ditolak dengan pesan jelas', (_n, text, msg) => expect(() => inspectImport(text)).toThrow(msg));

  test('file dari versi aplikasi yang lebih baru ditolak (supaya "Ganti Semua" tidak menghilangkan data yang belum dikenali)', () => {
    const text = JSON.stringify({ format: 'budgetplanner-backup', version: SNAPSHOT_VERSION + 1, books: [{ nama: 'x', kategori: [], transaksi: [] }] });
    expect(() => inspectImport(text)).toThrow(/versi aplikasi yang lebih baru/);
  });
  test('file tanpa nomor versi (buatan versi lama) tetap diterima; BOM di awal file diabaikan', () => {
    const t = { format: 'budgetplanner-backup', books: [{ nama: 'x', kategori: [], transaksi: [] }] };
    expect(() => inspectImport('\uFEFF' + JSON.stringify(t))).not.toThrow();
  });
  test('info untuk dialog konfirmasi: jumlah buku, kategori, transaksi', () => {
    seedData();
    expect(inspectImport(jsonOf('all'))).toMatchObject({ kind: 'json', info: { buku: 2, kat: 4, tx: 7 } });
  });
  test('inspectImport tidak mengubah database', () => {
    seedData(); const before = fingerprint(); const txt = jsonOf('all');
    inspectImport(txt); expect(fingerprint()).toEqual(before);
  });
});

describe('CSV', () => {
  const HDR = 'Tipe,Tanggal,Jenis,Kategori,Nominal,Keterangan';
  beforeEach(() => freshDb());

  test('header wajib: Tipe, Jenis, Kategori, Nominal', () => {
    expect(() => inspectImport('a,b,c\n1,2,3')).toThrow(/Header tidak sesuai/);
    expect(() => inspectImport('')).toThrow(/kosong/);
    expect(() => inspectImport(HDR + '\nCONTOH,2026-11-01,Biaya,X,5,')).toThrow(/Tidak ada baris bertipe/);
  });
  test('Export Backup lalu Import: kategori, anggaran, dan transaksi kembali sama (termasuk koma, tanda kutip, baris baru)', async () => {
    seedData(); setActiveBook(1);
    await exportBackup();
    const [, content] = written('.csv');
    const before = fingerprint()[0];
    db.runSync('DELETE FROM transactions WHERE book_id=1'); db.runSync('UPDATE categories SET anggaran=0 WHERE book_id=1');
    const ins = inspectImport(content);
    expect(ins).toMatchObject({ kind: 'csv', info: { kat: 3, tx: 6 } });
    await runImport(ins, true);
    const after = fingerprint()[0];
    // CSV tidak mengenal transaksi "yatim": transaksi berkategori "Hilang" membuat kategori itu (anggaran 0) saat diimpor
    expect(after.cats).toEqual([...before.cats, { jenis: 'Biaya', nama: 'Hilang', anggaran: 0 }].sort((a, b) => (a.jenis + a.nama < b.jenis + b.nama ? -1 : 1)));
    const strip = l => l.map(({ tanggal, jenis, kategori, nominal, ket }) => ({ tanggal, jenis, kategori, nominal, ket }));
    // CSV juga tidak membawa transaksi nominal 0 (dilewati) maupun penanda berulang
    expect(strip(after.tx)).toEqual(strip(before.tx).filter(t => t.nominal !== 0));
  });
  test('Gabung: kategori dipakai ulang (tanpa beda huruf besar/kecil), transaksi kembar dilewati, anggaran diperbarui', async () => {
    cat('Biaya', 'Makanan', 100); tx('2026-11-01', 'Biaya', 'Makanan', 5000, 'Kopi');
    const csv = [HDR, 'KATEGORI,,Biaya,MAKANAN,900,', 'TRANSAKSI,2026-11-01,biaya,makanan,5000,Kopi', 'TRANSAKSI,2026-11-02,Biaya,Makanan,7000,Teh', 'TRANSAKSI,2026-11-03,Investasi,Emas,100000,'].join('\n');
    const r = await runImport(inspectImport(csv), false);
    expect(r.res).toMatchObject({ tx: 2, dobel: 1, katBaru: 1 });
    expect(findCategory('Biaya', 'Makanan').anggaran).toBe(900); expect(count('categories', "jenis='Biaya'")).toBe(1);
    expect(findCategory('Investasi/Tabungan', 'Emas')).toBeTruthy();
  });
  test('baris CONTOH, tanggal/jenis/kategori/nominal tidak valid dilewati; titik koma & format tanggal dd/mm/yyyy didukung', async () => {
    const csv = ['Tipe;Tanggal;Jenis;Kategori;Nominal;Keterangan', 'CONTOH;2026-11-01;Biaya;Makanan;25000;abaikan', 'TRANSAKSI;05/11/2026;Biaya;Makanan;Rp 25.000;ok',
      'TRANSAKSI;30/02/2026;Biaya;Makanan;100;tanggal mustahil', 'TRANSAKSI;2026-11-02;Hadiah;Makanan;100;jenis ngawur', 'TRANSAKSI;2026-11-02;Biaya;;100;tanpa kategori', 'TRANSAKSI;2026-11-02;Biaya;Makanan;0;nol', 'LAIN;1;2;3;4;5'].join('\n');
    const r = await runImport(inspectImport(csv), false);
    expect(r.res.tx).toBe(1); expect(r.res.lewat).toBe(7 - 1);
    expect(rows('SELECT tanggal,nominal FROM transactions')).toEqual([{ tanggal: '2026-11-05', nominal: 25000 }]);
  });
  test('Ganti Semua (CSV) hanya mengganti buku aktif; buku lain utuh; didahului backup otomatis buku itu', async () => {
    seedData(); setActiveBook(1);
    const usaha = fingerprint()[1];
    const r = await runImport(inspectImport([HDR, 'KATEGORI,,Biaya,Baru,10,', 'TRANSAKSI,2026-11-01,Biaya,Baru,5,x'].join('\n')), true);
    expect(fingerprint()[1]).toEqual(usaha);
    expect(count('transactions', 'book_id=1')).toBe(1); expect(count('recurring', 'book_id=1')).toBe(0);
    expect(r.backup.name).toMatch(/Utama\.json$/);
  });
  test('Template Import bisa dibaca kembali: semua kategori standar, tanpa transaksi (baris CONTOH diabaikan)', async () => {
    await shareTemplate();
    const [, content] = written('Template_Import_BudgetPlanner.csv');
    const ins = inspectImport(content);
    expect(ins.info).toEqual({ kat: Object.values(SEED_CATS).reduce((a, l) => a + l.length, 0), tx: 0 });
  });
});

describe('backup otomatis', () => {
  beforeEach(() => { freshDb(); cat('Biaya', 'A'); jest.useFakeTimers({ now: new Date('2026-11-11T08:00:00.000Z') }); });
  afterEach(() => jest.useRealTimers());

  test('hanya 10 file terbaru yang disimpan; yang terbaru bisa diambil', async () => {
    for (let i = 0; i < 13; i++) { await autoBackup('all'); jest.setSystemTime(new Date(Date.now() + 1000)); }
    expect(autoFiles()).toHaveLength(10);
    const latest = latestAutoBackup();
    expect(latest.name).toContain('2026-11-11T08-00-12'); // file ke-13 (detik ke-12)
    expect(autoFiles().some(k => k.includes('08-00-00'))).toBe(false); // yang tertua sudah dirapikan
  });
  test('dua backup dalam detik yang sama tidak saling menimpa (nama sampai milidetik)', async () => {
    await autoBackup('all'); jest.setSystemTime(new Date(Date.now() + 1)); await autoBackup('all');
    expect(autoFiles()).toHaveLength(2);
  });
  test('isi backup otomatis = snapshot yang valid dan bisa diimpor', async () => {
    const { uri } = await autoBackup('all');
    expect(inspectImport(fsMock.__store.get(uri)).kind).toBe('json');
  });
  test('belum ada backup -> latestAutoBackup null', () => expect(latestAutoBackup()).toBeNull());
  test('exportAllBooks menulis file yang valid dan mengembalikan jumlahnya', async () => {
    tx('2026-11-01', 'Biaya', 'A', 5);
    expect(await exportAllBooks()).toEqual({ buku: 1, kat: 1, tx: 1 });
    expect(inspectImport(written('.json')[1]).info).toEqual({ buku: 1, kat: 1, tx: 1 });
  });
});
