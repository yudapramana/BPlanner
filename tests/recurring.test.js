import { freshDb, cat, tx, rows, count } from './helpers/db';
import { db, addBook } from '../lib/db';
import {
  daysIn, nextYm, backYm, dueDate, addDays, daysBetween, dueLabel, todayYmd, MAX_BACKFILL,
  saveRecurring, processRecurring, postOccurrence, skipOccurrence, deleteTransaction, deleteRecurring, makeRecurringFromTx,
  pendingList, nextDue, thresholdNote, getRecurring, countRecurring, monthTotals,
} from '../lib/recurring';

const D = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0); // tengah hari, waktu lokal

describe('tanggal', () => {
  test('daysIn (kabisat)', () => {
    expect(daysIn(2026, 2)).toBe(28); expect(daysIn(2028, 2)).toBe(29); expect(daysIn(2100, 2)).toBe(28); expect(daysIn(2000, 2)).toBe(29);
    expect(daysIn(2026, 4)).toBe(30); expect(daysIn(2026, 12)).toBe(31);
  });
  test('nextYm / backYm melewati pergantian tahun', () => {
    expect(nextYm('2026-12')).toBe('2027-01'); expect(nextYm('2026-01')).toBe('2026-02');
    expect(backYm('2026-01', 1)).toBe('2025-12'); expect(backYm('2026-03', 14)).toBe('2025-01'); expect(backYm('2026-11', 0)).toBe('2026-11'); expect(backYm('2026-12', 12)).toBe('2025-12');
  });
  test('dueDate: hari 29–31 dipangkas ke tanggal terakhir bulan itu', () => {
    expect(dueDate({ hari: 31 }, '2026-02')).toBe('2026-02-28'); expect(dueDate({ hari: 31 }, '2028-02')).toBe('2028-02-29');
    expect(dueDate({ hari: 31 }, '2026-04')).toBe('2026-04-30'); expect(dueDate({ hari: 30 }, '2026-01')).toBe('2026-01-30'); expect(dueDate({ hari: 5 }, '2026-11')).toBe('2026-11-05');
  });
  test('addDays melewati bulan/tahun; daysBetween tidak terpengaruh zona waktu / jam musim panas', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01'); expect(addDays('2026-01-01', -1)).toBe('2025-12-31'); expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); expect(addDays('2026-11-05', -3)).toBe('2026-11-02');
    expect(daysBetween('2026-11-10', '2026-11-05')).toBe(5); expect(daysBetween('2026-11-05', '2026-11-10')).toBe(-5);
    expect(daysBetween('2027-01-01', '2026-01-01')).toBe(365); expect(daysBetween('2026-03-30', '2026-03-28')).toBe(2); expect(daysBetween('2026-11-05', '2026-11-05')).toBe(0);
  });
  test('todayYmd & dueLabel', () => {
    expect(todayYmd(D(2026, 1, 5))).toBe('2026-01-05');
    expect(dueLabel(-3)).toBe('Terlambat 3 hari'); expect(dueLabel(0)).toBe('Jatuh tempo hari ini'); expect(dueLabel(1)).toBe('Besok'); expect(dueLabel(6)).toBe('6 hari lagi');
  });
});

describe('transaksi berulang', () => {
  let cid, kat;
  beforeEach(() => { freshDb(); cid = cat('Tagihan', 'Uang Kos', 1000000); kat = cat('Pendapatan', 'Gaji', 5000000); });
  const make = (o = {}) => saveRecurring({ catId: cid, nominal: 670000, ket: 'Kos', hari: 5, mulai: '2026-08', otomatis: true, ingat: 3, ...o });
  const txs = () => rows('SELECT * FROM transactions ORDER BY tanggal');

  describe('saveRecurring', () => {
    test('jenis & nama diambil dari kategori; ket dirapikan; akhir kosong = tanpa batas', () => {
      const id = make({ ket: '  Kos Bulanan ' });
      expect(rows('SELECT * FROM recurring WHERE id=?', [id])[0]).toMatchObject({ jenis: 'Tagihan', kategori: 'Uang Kos', category_id: cid, nominal: 670000, ket: 'Kos Bulanan', hari: 5, mulai: '2026-08', akhir: null, otomatis: 1, ingat: 3, aktif: 1, book_id: 1 });
    });
    test('mengubah templat yang ada (id diberikan)', () => {
      const id = make(); saveRecurring({ catId: cid, nominal: 700000, hari: 6, mulai: '2026-08', akhir: '2026-12', otomatis: false, ingat: 1, aktif: false }, id);
      expect(count('recurring')).toBe(1);
      expect(rows('SELECT * FROM recurring')[0]).toMatchObject({ nominal: 700000, hari: 6, akhir: '2026-12', otomatis: 0, ingat: 1, aktif: 0 });
    });
    test('kategori tidak ada -> error', () => expect(() => saveRecurring({ catId: 999, nominal: 1, hari: 1, mulai: '2026-11', ingat: 3 })).toThrow('Kategori tidak ditemukan'));
    test('getRecurring / countRecurring / monthTotals hanya templat aktif milik buku itu', () => {
      make(); make({ aktif: false }); make({ nominal: 100 });
      const b2 = addBook('B2', 'pribadi'); const c2 = cat('Tagihan', 'X', 0, b2); saveRecurring({ catId: c2, nominal: 5, hari: 1, mulai: '2026-11', ingat: 3 }, null, b2);
      expect(getRecurring()).toHaveLength(3); expect(countRecurring()).toBe(2);
      expect(monthTotals()).toEqual([{ jenis: 'Tagihan', s: 670100, n: 2 }]);
    });
  });

  describe('processRecurring (pencatatan otomatis saat aplikasi dibuka)', () => {
    test('mencatat semua bulan yang sudah jatuh tempo, termasuk yang terlewat', () => {
      make();
      expect(processRecurring(D(2026, 11, 11))).toBe(4); // Agu, Sep, Okt, Nov (tgl 5)
      expect(txs().map(t => t.tanggal)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']);
      expect(txs()[0]).toMatchObject({ jenis: 'Tagihan', kategori: 'Uang Kos', nominal: 670000, ket: 'Kos', category_id: cid, book_id: 1 });
      expect(txs().every(t => t.recurring_id != null)).toBe(true);
    });
    test('belum jatuh tempo bulan ini -> belum dicatat; tepat di hari jatuh tempo -> dicatat', () => {
      make();
      expect(processRecurring(D(2026, 11, 4))).toBe(3);
      expect(processRecurring(D(2026, 11, 5))).toBe(1);
    });
    test('dijalankan berulang kali tidak pernah membuat transaksi ganda', () => {
      make(); processRecurring(D(2026, 11, 11));
      expect(processRecurring(D(2026, 11, 11))).toBe(0); expect(processRecurring(D(2026, 11, 12))).toBe(0);
      expect(count('transactions')).toBe(4);
      expect(count('recurring_log', "status='done' AND tx_id IS NOT NULL")).toBe(4);
    });
    test('bulan berikutnya hanya menambah satu transaksi', () => {
      make(); processRecurring(D(2026, 11, 11));
      expect(processRecurring(D(2026, 12, 6))).toBe(1);
      expect(count('transactions')).toBe(5);
    });
    test('menghormati bulan mulai dan bulan berakhir', () => {
      make({ mulai: '2026-10', akhir: '2026-10' });
      expect(processRecurring(D(2026, 12, 31))).toBe(1);
      expect(txs().map(t => t.tanggal)).toEqual(['2026-10-05']);
    });
    test('bulan mulai di masa depan tidak dicatat', () => { make({ mulai: '2027-01' }); expect(processRecurring(D(2026, 11, 11))).toBe(0); });
    test('hanya yang otomatis & aktif; "ingatkan saja" dan templat nonaktif tidak dicatat sendiri', () => {
      make({ otomatis: false }); make({ aktif: false });
      expect(processRecurring(D(2026, 11, 11))).toBe(0); expect(count('transactions')).toBe(0);
    });
    test('hari 31 pada bulan pendek dicatat di tanggal terakhir bulan itu; bulan 31 yang belum tiba tidak dicatat', () => {
      make({ hari: 31, mulai: '2027-01' });
      expect(processRecurring(D(2027, 3, 15))).toBe(2);
      expect(txs().map(t => t.tanggal)).toEqual(['2027-01-31', '2027-02-28']);
    });
    test('mengejar paling banyak MAX_BACKFILL (60) bulan ke belakang', () => {
      make({ mulai: '2000-01', hari: 1 });
      expect(processRecurring(D(2026, 11, 11))).toBe(MAX_BACKFILL);
      expect(txs()[0].tanggal).toBe('2021-12-01'); // 60 bulan: 2021-12 s/d 2026-11
    });
    test('bulan yang dilewati (skip) tidak dibuat; menghapus transaksi hasilnya = skip, tidak muncul lagi', () => {
      const id = make();
      skipOccurrence(db.getFirstSync('SELECT * FROM recurring WHERE id=?', [id]), '2026-09');
      expect(processRecurring(D(2026, 11, 11))).toBe(3);
      const okt = txs().find(t => t.tanggal === '2026-10-05');
      deleteTransaction(okt.id);
      expect(rows("SELECT status,tx_id FROM recurring_log WHERE periode='2026-10'")).toEqual([{ status: 'skip', tx_id: null }]);
      expect(processRecurring(D(2026, 11, 11))).toBe(0);
      expect(txs().map(t => t.tanggal)).toEqual(['2026-08-05', '2026-11-05']);
    });
    test('memproses semua buku kas, tiap transaksi masuk ke bukunya sendiri', () => {
      make(); const b2 = addBook('B2', 'pribadi'); const c2 = cat('Tagihan', 'Net', 0, b2);
      saveRecurring({ catId: c2, nominal: 99, hari: 1, mulai: '2026-11', ingat: 3, otomatis: true }, null, b2);
      expect(processRecurring(D(2026, 11, 11))).toBe(5);
      expect(count('transactions', 'book_id=?', [b2])).toBe(1); expect(count('transactions', 'book_id=1')).toBe(4);
    });
    test('postOccurrence memakai nama kategori terbaru, bukan salinan lama di templat', () => {
      const id = make(); db.runSync('UPDATE categories SET nama=? WHERE id=?', ['Kos Baru', cid]);
      postOccurrence(db.getFirstSync('SELECT * FROM recurring WHERE id=?', [id]), '2026-11');
      expect(txs()[0].kategori).toBe('Kos Baru');
    });
    test('gagal di tengah (mis. penyimpanan penuh) membatalkan SEMUA yang dicatat dalam putaran itu (atomik), lalu putaran berikutnya normal', () => {
      make({ mulai: '2026-09' }); // 3 bulan: Sep, Okt, Nov
      const real = db.runSync.bind(db);
      let logs = 0;
      const spy = jest.spyOn(db, 'runSync').mockImplementation((sql, p) => {
        if (/INTO recurring_log/.test(sql) && ++logs === 2) throw new Error('disk penuh');
        return real(sql, p);
      });
      try { expect(() => processRecurring(D(2026, 11, 11))).toThrow('disk penuh'); } finally { spy.mockRestore(); }
      expect(count('transactions')).toBe(0); expect(count('recurring_log')).toBe(0); // tidak ada transaksi tanpa log, atau log tanpa transaksi
      expect(processRecurring(D(2026, 11, 11))).toBe(3);
    });
  });

  describe('postOccurrence / makeRecurringFromTx / deleteRecurring', () => {
    test('postOccurrence membuat transaksi pada tanggal jatuh tempo dan mencatat log done + tx_id', () => {
      const id = make(); const r = db.getFirstSync('SELECT * FROM recurring WHERE id=?', [id]);
      const txId = postOccurrence(r, '2026-11');
      expect(txs()[0]).toMatchObject({ id: txId, tanggal: '2026-11-05', recurring_id: id });
      expect(rows('SELECT * FROM recurring_log')).toEqual([{ recurring_id: id, periode: '2026-11', status: 'done', tx_id: txId }]);
    });
    test('mencatat ulang bulan yang sama (mis. setelah skip) mengganti log, bukan error', () => {
      const id = make(); const r = db.getFirstSync('SELECT * FROM recurring WHERE id=?', [id]);
      skipOccurrence(r, '2026-11'); expect(() => postOccurrence(r, '2026-11')).not.toThrow();
      expect(rows('SELECT status FROM recurring_log')).toEqual([{ status: 'done' }]);
    });
    test('makeRecurringFromTx: transaksi form menjadi bulan pertama (done), bulan berikutnya otomatis', () => {
      const txId = tx('2026-11-17', 'Tagihan', 'Uang Kos', 670000, 'Kos');
      const rid = makeRecurringFromTx({ catId: cid, nominal: 670000, ket: 'Kos', tanggal: '2026-11-17', txId });
      expect(rows('SELECT hari,mulai FROM recurring WHERE id=?', [rid])[0]).toEqual({ hari: 17, mulai: '2026-11' });
      expect(rows('SELECT recurring_id FROM transactions WHERE id=?', [txId])[0].recurring_id).toBe(rid);
      expect(processRecurring(D(2026, 11, 20))).toBe(0); // bulan ini sudah tercatat
      expect(processRecurring(D(2026, 12, 20))).toBe(1);
    });
    test('deleteRecurring: transaksi yang sudah tercatat tetap ada, hanya tautannya dilepas', () => {
      make(); processRecurring(D(2026, 11, 11));
      deleteRecurring(rows('SELECT id FROM recurring')[0].id);
      expect(count('recurring')).toBe(0); expect(count('recurring_log')).toBe(0);
      expect(count('transactions')).toBe(4); expect(count('transactions', 'recurring_id IS NOT NULL')).toBe(0);
    });
    test('deleteTransaction pada transaksi biasa hanya menghapus transaksi itu', () => {
      const a = tx('2026-11-01', 'Pendapatan', 'Gaji', 1); tx('2026-11-02', 'Pendapatan', 'Gaji', 2);
      deleteTransaction(a); expect(count('transactions')).toBe(1);
    });
  });

  describe('pendingList / nextDue (jatuh tempo yang belum diproses)', () => {
    test('urut jatuh tempo; hari terlambat negatif; yang sudah diproses tidak muncul', () => {
      make({ otomatis: false, mulai: '2026-09' });
      const now = D(2026, 11, 8);
      let l = pendingList({ now });
      expect(l.map(o => [o.periode, o.due, o.days])).toEqual([['2026-09', '2026-09-05', -64], ['2026-10', '2026-10-05', -34], ['2026-11', '2026-11-05', -3], ['2026-12', '2026-12-05', 27]]);
      skipOccurrence(getRecurring()[0], '2026-10');
      expect(pendingList({ now }).map(o => o.periode)).toEqual(['2026-09', '2026-11', '2026-12']);
    });
    test('lookback dan ahead membatasi rentang; bookId null = semua buku', () => {
      make({ otomatis: false, mulai: '2026-01' });
      expect(pendingList({ now: D(2026, 11, 8), lookback: 0, ahead: 0 }).map(o => o.periode)).toEqual(['2026-11']);
      const b2 = addBook('B2', 'pribadi'); const c2 = cat('Tagihan', 'Net', 0, b2); saveRecurring({ catId: c2, nominal: 1, hari: 1, mulai: '2026-11', ingat: 3, otomatis: false }, null, b2);
      expect(pendingList({ now: D(2026, 11, 8), lookback: 0, ahead: 0 })).toHaveLength(1);
      expect(pendingList({ now: D(2026, 11, 8), lookback: 0, ahead: 0, bookId: null })).toHaveLength(2);
    });
    test('templat nonaktif tidak muncul', () => { make({ aktif: false }); expect(pendingList({ now: D(2026, 11, 8) })).toEqual([]); });
    test('nextDue = kejadian belum diproses paling awal; null bila templat sudah berakhir', () => {
      const id = make({ otomatis: false, mulai: '2026-10', akhir: '2026-11' });
      const r = () => db.getFirstSync('SELECT * FROM recurring WHERE id=?', [id]);
      expect(nextDue(r(), D(2026, 11, 8)).periode).toBe('2026-10');
      skipOccurrence(r(), '2026-10'); expect(nextDue(r(), D(2026, 11, 8)).periode).toBe('2026-11');
      skipOccurrence(r(), '2026-11'); expect(nextDue(r(), D(2026, 11, 8))).toBeNull();
    });
  });

  describe('thresholdNote (catatan ambang 80% / 100%)', () => {
    const rec = (jenis, catId, nominal) => ({ jenis, category_id: catId, nominal });
    test('Tagihan: di bawah 80% -> tidak ada catatan', () => expect(thresholdNote(rec('Tagihan', cid, 700000), '2026-11')).toBeNull());
    test('Tagihan: tepat 80% -> warn; 100% -> full; di atas 100% -> over (menyebut selisih)', () => {
      expect(thresholdNote(rec('Tagihan', cid, 800000), '2026-11')).toMatchObject({ level: 'warn', text: expect.stringContaining('80%') });
      expect(thresholdNote(rec('Tagihan', cid, 1000000), '2026-11')).toMatchObject({ level: 'full' });
      const o = thresholdNote(rec('Tagihan', cid, 1200000), '2026-11');
      expect(o.level).toBe('over'); expect(o.text).toContain('Rp 200.000'); expect(o.text).toContain('120%');
    });
    test('memperhitungkan pengeluaran yang sudah ada di bulan itu, bukan bulan lain', () => {
      tx('2026-11-02', 'Tagihan', 'Uang Kos', 500000); tx('2026-10-02', 'Tagihan', 'Uang Kos', 900000);
      expect(thresholdNote(rec('Tagihan', cid, 400000), '2026-11').level).toBe('warn'); // 900.000 / 1.000.000
      expect(thresholdNote(rec('Tagihan', cid, 100000), '2026-11')).toBeNull(); // 600.000
    });
    test('tanpa anggaran: Biaya/Tagihan -> nobudget; Pendapatan -> tidak ada catatan', () => {
      const z = cat('Tagihan', 'Tanpa Anggaran', 0), p = cat('Pendapatan', 'Honor', 0);
      expect(thresholdNote(rec('Tagihan', z, 5), '2026-11').level).toBe('nobudget');
      expect(thresholdNote(rec('Pendapatan', p, 5), '2026-11')).toBeNull();
    });
    test('Pendapatan: mendekati target (>= 80%) -> near; tercapai -> done', () => {
      expect(thresholdNote(rec('Pendapatan', kat, 4000000), '2026-11').level).toBe('near');
      expect(thresholdNote(rec('Pendapatan', kat, 5000000), '2026-11').level).toBe('done');
      expect(thresholdNote(rec('Pendapatan', kat, 1000000), '2026-11')).toBeNull();
    });
    test('kategori sudah dihapus / tidak ada -> null; formatter nominal bisa disamarkan', () => {
      expect(thresholdNote(rec('Tagihan', 9999, 5), '2026-11')).toBeNull(); expect(thresholdNote(rec('Tagihan', null, 5), '2026-11')).toBeNull();
      expect(thresholdNote(rec('Tagihan', cid, 1200000), '2026-11', () => '***', () => '##').text).toBe('Setelah dibayar melampaui anggaran *** (##)');
    });
  });
});
