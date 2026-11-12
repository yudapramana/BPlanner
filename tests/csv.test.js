import { toCsv, parseCsv, normJenis, normDate, parseNom, HEAD } from '../lib/csv';

describe('parseNom (nominal dari file)', () => {
  test.each([
    ['25000', 25000], ['25.000', 25000], ['1.500.000', 1500000], ['Rp 25.000', 25000], ['Rp25.000,-', 25000],
    ['1.500.000,50', 1500000], ['1,500,000.75', 1500000], ['-5000', -5000], ['  900  ', 900], [12000, 12000],
  ])('%p -> %p', (input, out) => expect(parseNom(input)).toBe(out));
  test.each([[''], [null], [undefined], ['abc'], ['-']])('%p -> 0', v => expect(parseNom(v)).toBe(0));
});

describe('normJenis', () => {
  test.each([
    ['Pendapatan', 'Pendapatan'], ['  biaya ', 'Biaya'], ['TAGIHAN', 'Tagihan'], ['pinjaman', 'Pinjaman'],
    ['Investasi/Tabungan', 'Investasi/Tabungan'], ['Investasi', 'Investasi/Tabungan'], ['tabungan', 'Investasi/Tabungan'],
  ])('%p -> %p', (input, out) => expect(normJenis(input)).toBe(out));
  test.each([[''], [null], ['Hadiah'], ['Pemasukan']])('%p tidak dikenali -> ""', v => expect(normJenis(v)).toBe(''));
});

describe('normDate', () => {
  test.each([
    ['2026-11-05', '2026-11-05'], ['2026-1-5', '2026-01-05'], ['2026-11-05T10:20:30Z', '2026-11-05'],
    ['05/11/2026', '2026-11-05'], ['5-1-2026', '2026-01-05'], ['5.1.2026', '2026-01-05'], ['29/02/2028', '2028-02-29'],
  ])('%p -> %p', (input, out) => expect(normDate(input)).toBe(out));
  test.each([[''], [null], ['kemarin'], ['2026-13-01'], ['2026-00-10'], ['2026-02-30'], ['31/04/2026'], ['29/02/2027'], ['2026-11-32'], ['00/01/2026']])('%p tanggal tidak valid -> ""', v => expect(normDate(v)).toBe(''));
});

describe('toCsv / parseCsv', () => {
  test('bolak-balik mempertahankan koma, tanda kutip, dan baris baru di dalam sel', () => {
    const rows = [HEAD, ['TRANSAKSI', '2026-11-01', 'Biaya', 'Makanan', 25000, 'Nasi, "uduk"\nplus telur'], ['KATEGORI', '', 'Biaya', 'Makanan', 100000, '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows.map(r => r.map(String)));
  });
  test('BOM di awal file dibuang', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  test('pemisah titik koma (Excel Indonesia) dikenali otomatis', () => {
    expect(parseCsv('Tipe;Tanggal;Nominal\nTRANSAKSI;2026-11-01;25000')).toEqual([['Tipe', 'Tanggal', 'Nominal'], ['TRANSAKSI', '2026-11-01', '25000']]);
  });
  test('baris kosong diabaikan, akhir baris CRLF / LF / tanpa baris baru terakhir', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
  test('file kosong -> tanpa baris', () => expect(parseCsv('')).toEqual([]));
  test('toCsv memberi BOM dan CRLF; nilai null jadi sel kosong', () => {
    const t = toCsv([['a', null], ['b', 1]]);
    expect(t.startsWith('\uFEFF')).toBe(true);
    expect(t).toBe('\uFEFF"a",""\r\n"b","1"\r\n');
  });
});
