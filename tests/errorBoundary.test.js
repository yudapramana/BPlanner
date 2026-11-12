import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ErrorBoundary, { ErrorFallback } from '../components/ErrorBoundary';
import { describeError, errorText, sameKeys, reportError, recentErrors, clearErrors } from '../lib/errors';
import { freshDb, cat, tx } from './helpers/db';
import * as sharing from './helpers/expo-sharing';

global.IS_REACT_ACT_ENVIRONMENT = true;

let errSpy;
beforeEach(() => { clearErrors(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); }); // React & reportError mencatat ke console.error
afterEach(() => errSpy.mockRestore());

function Bomb({ explode, value = 'aman' }) {
  if (explode) throw explode instanceof Error ? explode : new Error(String(explode));
  return <Text>{value}</Text>;
}
const texts = r => r.root.findAllByType('Text').map(n => [].concat(n.props.children).join(''));
const press = (r, label) => act(() => { r.root.findAllByType('TouchableOpacity').find(n => n.props.accessibilityLabel === label).props.onPress(); });
const render = el => { let r; act(() => { r = TestRenderer.create(el); }); return r; };
const update = (r, el) => act(() => { r.update(el); });

describe('lib/errors', () => {
  test('describeError menangani Error, string, null, dan objek aneh tanpa melempar', () => {
    expect(describeError(new TypeError('x'))).toMatchObject({ name: 'TypeError', message: 'x' });
    expect(describeError('teks')).toMatchObject({ name: 'Error', message: 'teks' });
    expect(describeError(null).message).toMatch(/tidak diketahui/); expect(describeError(undefined).message).toMatch(/tidak diketahui/);
    expect(describeError({ message: 'obj' }).message).toBe('obj'); expect(describeError({}).message).toBe('[object Object]');
    expect(errorText(new RangeError('r'))).toBe('RangeError: r');
  });
  test('sameKeys membandingkan isi dan urutan; undefined dianggap kosong', () => {
    expect(sameKeys([1, 'a'], [1, 'a'])).toBe(true); expect(sameKeys([1], [2])).toBe(false); expect(sameKeys([1], [1, 2])).toBe(false); expect(sameKeys(undefined, [])).toBe(true); expect(sameKeys([NaN], [NaN])).toBe(true);
  });
  test('reportError menyimpan maks. 20 catatan terakhir dan tidak pernah melempar', () => {
    for (let i = 0; i < 25; i++) reportError('t', new Error('e' + i));
    const l = recentErrors();
    expect(l).toHaveLength(20); expect(l[0].message).toBe('e5'); expect(l[19].message).toBe('e24');
    errSpy.mockImplementation(() => { throw new Error('console rusak'); });
    expect(() => reportError('t', new Error('x'))).not.toThrow();
  });
});

describe('ErrorBoundary', () => {
  test('tanpa error: anak dirender apa adanya, tidak ada tampilan error', () => {
    const r = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(texts(r)).toEqual(['aman']);
  });

  test('error saat render ditangkap: layar pengganti tampil, bagian lain di luar pelindung tetap hidup', () => {
    const r = render(<><Text>menu</Text><ErrorBoundary label="tab:Uji" title="Layar Uji bermasalah"><Bomb explode="meledak" /></ErrorBoundary></>);
    const t = texts(r).join(' | ');
    expect(t).toContain('menu'); expect(t).toContain('Layar Uji bermasalah'); expect(t).toContain('Error: meledak');
    expect(texts(r)).not.toContain('aman');
    expect(recentErrors()).toHaveLength(1); expect(recentErrors()[0]).toMatchObject({ where: 'tab:Uji', message: 'meledak' });
  });

  test('yang dilempar bukan Error (string / null / undefined) tetap menampilkan layar pengganti', () => {
    for (const thrown of ['teks saja', null, undefined]) {
      function Throws() { throw thrown; }
      const r = render(<ErrorBoundary><Throws /></ErrorBoundary>);
      expect(texts(r).join(' ')).toContain('Terjadi kesalahan');
    }
  });

  test('"Coba lagi" merender ulang anak; bila masalahnya sudah hilang layar kembali normal, onReset dipanggil', () => {
    const onReset = jest.fn(); let explode = true;
    function Flaky() { return <Bomb explode={explode ? 'sementara' : null} />; }
    const r = render(<ErrorBoundary onReset={onReset}><Flaky /></ErrorBoundary>);
    expect(texts(r).join(' ')).toContain('Terjadi kesalahan');
    explode = false; press(r, 'Coba lagi');
    expect(texts(r)).toEqual(['aman']); expect(onReset).toHaveBeenCalledTimes(1);
  });

  test('"Coba lagi" saat masalah masih ada: kembali ke layar error, tanpa loop tak berujung', () => {
    const r = render(<ErrorBoundary><Bomb explode="tetap" /></ErrorBoundary>);
    press(r, 'Coba lagi');
    expect(texts(r).join(' ')).toContain('tetap');
    expect(recentErrors().length).toBeLessThan(5);
  });

  test('retryLabel kustom (mis. "Tutup form") dan onReset menutup overlay', () => {
    const onReset = jest.fn();
    const r = render(<ErrorBoundary retryLabel="Tutup form" onReset={onReset}><Bomb explode="x" /></ErrorBoundary>);
    press(r, 'Tutup form'); expect(onReset).toHaveBeenCalled();
  });

  test('resetKeys berubah (ganti tab/bulan/buku) -> mencoba lagi otomatis; kunci sama -> tetap di layar error', () => {
    const r = render(<ErrorBoundary resetKeys={['a', 1]}><Bomb explode="x" /></ErrorBoundary>);
    update(r, <ErrorBoundary resetKeys={['a', 1]}><Bomb explode="x" /></ErrorBoundary>);
    expect(texts(r).join(' ')).toContain('Terjadi kesalahan');
    update(r, <ErrorBoundary resetKeys={['b', 1]}><Bomb value="pulih" /></ErrorBoundary>);
    expect(texts(r)).toEqual(['pulih']);
  });

  test('reset otomatis lewat resetKeys tidak memanggil onReset (itu khusus tombol)', () => {
    const onReset = jest.fn();
    const r = render(<ErrorBoundary resetKeys={[1]} onReset={onReset}><Bomb explode="x" /></ErrorBoundary>);
    update(r, <ErrorBoundary resetKeys={[2]} onReset={onReset}><Bomb value="ok" /></ErrorBoundary>);
    expect(onReset).not.toHaveBeenCalled();
  });

  test('pelindung bersarang: error di dalam hanya mengganti bagian dalam; pelindung luar tidak ikut', () => {
    const r = render(<ErrorBoundary title="LUAR"><Text>induk</Text><ErrorBoundary title="DALAM"><Bomb explode="x" /></ErrorBoundary></ErrorBoundary>);
    const t = texts(r).join(' | ');
    expect(t).toContain('induk'); expect(t).toContain('DALAM'); expect(t).not.toContain('LUAR');
  });
});

describe('ErrorFallback', () => {
  test('tombol cadangan membagikan backup JSON semua buku kas dan melaporkan hasilnya', async () => {
    freshDb(); cat('Biaya', 'A'); tx('2026-11-01', 'Biaya', 'A', 5);
    const r = render(<ErrorFallback error={new Error('x')} />);
    await act(async () => { r.root.findAllByType('TouchableOpacity').find(n => n.props.accessibilityLabel === 'Simpan cadangan data').props.onPress(); });
    expect(texts(r).join(' ')).toContain('Cadangan disiapkan: 1 buku kas, 1 transaksi.');
    expect(sharing.__shared.at(-1).mimeType).toBe('application/json');
  });
  test('cadangan gagal (mis. database rusak) menampilkan alasannya, bukan crash', async () => {
    freshDb(); require('./helpers/expo-file-system').__state.failWrites = true;
    const r = render(<ErrorFallback error="db rusak" />);
    await act(async () => { r.root.findAllByType('TouchableOpacity').find(n => n.props.accessibilityLabel === 'Simpan cadangan data').props.onPress(); });
    expect(texts(r).join(' ')).toContain('Gagal menyimpan cadangan');
  });
  test('canBackup=false (database tidak bisa dibuka) menyembunyikan tombol cadangan; tanpa onRetry tidak ada tombol coba lagi', () => {
    const r = render(<ErrorFallback error={new Error('migrasi gagal')} canBackup={false} title="Database tidak dapat dibuka" />);
    expect(r.root.findAllByType('TouchableOpacity')).toHaveLength(0);
    expect(texts(r).join(' ')).toContain('migrasi gagal');
  });
});
