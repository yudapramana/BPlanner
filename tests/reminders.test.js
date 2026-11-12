import { freshDb, cat } from './helpers/db';
import { addBook } from '../lib/db';
import { saveRecurring } from '../lib/recurring';
import { buildPlan, getMask, setMask } from '../lib/reminders';

const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0);

describe('buildPlan (jadwal notifikasi pengingat)', () => {
  let cid;
  beforeEach(() => { freshDb(); cid = cat('Tagihan', 'Internet', 1000000); });
  const make = (o = {}) => saveRecurring({ catId: cid, nominal: 150000, ket: 'Wifi', hari: 20, mulai: '2026-11', otomatis: false, ingat: 3, ...o });

  test('mode "ingatkan saja": H-3, hari-H, dan H+2 pukul 09.00, urut waktu', () => {
    make();
    const p = buildPlan(D(2026, 11, 11)).filter(n => n.id.includes('2026-11-'));
    expect(p.map(n => [n.at.getDate(), n.at.getHours()])).toEqual([[17, 9], [20, 9], [22, 9]]);
    expect(p[0].title).toBe('🔁 Internet • 3 hari lagi'); expect(p[1].title).toContain('Jatuh tempo hari ini'); expect(p[2].title).toContain('Terlambat');
    expect(p[0].body).toContain('Sudah dibayar?');
  });
  test('mode otomatis: tidak ada pengingat H+2 dan teksnya menyebut pencatatan otomatis', () => {
    make({ otomatis: true });
    const p = buildPlan(D(2026, 11, 11)).filter(n => n.id.includes('2026-11-'));
    expect(p).toHaveLength(2); expect(p[0].body).toContain('dicatat otomatis saat jatuh tempo');
  });
  test('nominal disamarkan secara default (layar kunci); bisa ditampilkan lewat setMask(false)', () => {
    make();
    expect(getMask()).toBe(true); expect(buildPlan(D(2026, 11, 11))[0].body).toContain('Rp ******');
    setMask(false); expect(getMask()).toBe(false);
    expect(buildPlan(D(2026, 11, 11))[0].body).toContain('Rp 150.000 • Wifi');
  });
  test('waktu yang sudah lewat tidak dijadwalkan', () => {
    make();
    const p = buildPlan(D(2026, 11, 18)).filter(n => n.id.includes('2026-11-'));
    expect(p.map(n => n.at.getDate())).toEqual([20, 22]); // H-3 (17 Nov) sudah lewat
    expect(buildPlan(D(2026, 11, 20, 9)).filter(n => n.id.includes('2026-11-')).map(n => n.at.getDate())).toEqual([22]); // tepat pukul 09.00 hari-H dianggap lewat (batas 1 menit)
  });
  test('"tanpa pengingat" (ingat < 0) dan templat nonaktif tidak menghasilkan notifikasi', () => {
    make({ ingat: -1 }); make({ aktif: false });
    expect(buildPlan(D(2026, 11, 11))).toEqual([]);
  });
  test('ingat = 0 hanya hari-H; id notifikasi unik per templat/bulan/hari', () => {
    make({ ingat: 0, otomatis: true });
    const p = buildPlan(D(2026, 11, 11));
    expect(p.filter(n => n.id.includes('2026-11-'))).toHaveLength(1);
    expect(new Set(p.map(n => n.id)).size).toBe(p.length);
  });
  test('catatan ambang anggaran ikut di isi notifikasi', () => {
    make({ nominal: 900000, otomatis: true });
    expect(buildPlan(D(2026, 11, 11))[0].body).toMatch(/🟠.*90%/);
  });
  test('nama buku ditampilkan hanya bila ada lebih dari satu buku kas', () => {
    make({ otomatis: true }); setMask(false);
    expect(buildPlan(D(2026, 11, 11))[0].body).not.toContain('Buku Kas Utama');
    addBook('Usaha', 'proyek');
    expect(buildPlan(D(2026, 11, 11))[0].body).toContain('Buku Kas Utama');
  });
  test('jumlah notifikasi dibatasi 60 (batas aman OS)', () => {
    for (let i = 0; i < 30; i++) make({ nominal: 1000 + i });
    expect(buildPlan(D(2026, 11, 11))).toHaveLength(60);
  });
});
