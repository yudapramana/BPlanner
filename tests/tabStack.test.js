// TabStack: tab yang pernah dibuka tetap terpasang (state terjaga, tidak dibangun ulang), tab tersembunyi tidak
// dirender ulang saat data berubah, dan ganti buku kas / terkunci membuang semuanya.
import { useState, useEffect } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, render, rerender, allText, press } from './helpers/screen';
import TabStack from '../components/TabStack';

let log;
const make = name => function Screen({ tick }) {
  const [n, setN] = useState(0);
  log.renders[name] = (log.renders[name] || 0) + 1;
  useEffect(() => { log.mounts[name] = (log.mounts[name] || 0) + 1; return () => { log.unmounts[name] = (log.unmounts[name] || 0) + 1; }; }, []);
  return <><Text>{`${name} tick=${tick} n=${n}`}</Text><TouchableOpacity onPress={() => setN(x => x + 1)}><Text>{`+${name}`}</Text></TouchableOpacity></>;
};
const TABS = [['A', 'a', make('A')], ['B', 'b', make('B')], ['C', 'c', make('C')]];
const el = (tab, { tick = 0, resetKey = 'k1', locked = false } = {}) => <TabStack tabs={TABS} tab={tab} props={{ tick, y: 2026, m: 11 }} resetKey={resetKey} locked={locked} />;
// Halaman yang tampil = pembungkus View tanpa display:none
const visible = r => r.root.findAll(n => n.type === 'View' && n.props.importantForAccessibility && n.props.style && n.props.style.flex === 1).map(v => allText({ root: v }));

beforeEach(() => { log = { renders: {}, mounts: {}, unmounts: {} }; });

test('hanya tab aktif yang dibuat saat mulai; tab lain belum dimuat', () => {
  const r = render(el(0));
  expect(log.mounts).toEqual({ A: 1 }); expect(visible(r)).toEqual(['A tick=0 n=0 | +A']);
});

test('kembali ke tab yang pernah dibuka: tidak dibuat ulang, state lokal (mis. pencarian) tetap', () => {
  const r = render(el(0));
  press(r, '+A'); press(r, '+A');
  rerender(r, el(2)); rerender(r, el(0));
  expect(log.mounts).toEqual({ A: 1, C: 1 }); expect(log.unmounts).toEqual({});
  expect(visible(r)).toEqual(['A tick=0 n=2 | +A']);
});

test('tab tersembunyi tidak dirender ulang saat data berubah; saat dibuka lagi memakai data terbaru', () => {
  const r = render(el(0));
  rerender(r, el(1));
  const before = log.renders.A;
  rerender(r, el(1, { tick: 1 })); rerender(r, el(1, { tick: 2 }));
  expect(log.renders.A).toBe(before); // A tersembunyi: tidak dirender
  rerender(r, el(0, { tick: 2 }));
  expect(visible(r)).toEqual(['A tick=2 n=0 | +A']);
});

test('hanya satu tab yang tampil; yang lain disembunyikan dan tidak terbaca TalkBack', () => {
  const r = render(el(0)); rerender(r, el(1)); rerender(r, el(2));
  const pages = r.root.findAll(n => n.type === 'View' && n.props.importantForAccessibility);
  expect(pages.map(p => p.props.style)).toEqual([{ display: 'none' }, { display: 'none' }, { flex: 1 }]);
  expect(pages.map(p => p.props.importantForAccessibility)).toEqual(['no-hide-descendants', 'no-hide-descendants', 'auto']);
});

test('ganti buku kas (resetKey berubah): semua tab dibuang, hanya tab aktif dibuat ulang', () => {
  const r = render(el(0)); rerender(r, el(1)); rerender(r, el(2));
  press(r, '+C');
  rerender(r, el(2, { resetKey: 'k2' }));
  expect(log.unmounts).toEqual({ A: 1, B: 1, C: 1 });
  expect(log.mounts).toEqual({ A: 1, B: 1, C: 2 });
  expect(visible(r)).toEqual(['C tick=0 n=0 | +C']);
  rerender(r, el(0, { resetKey: 'k2' })); expect(log.mounts.A).toBe(2);
});

test('terkunci: tidak ada layar tab yang dimuat', () => {
  const r = render(el(0)); rerender(r, el(1));
  rerender(r, el(1, { locked: true }));
  expect(r.toJSON()).toBeNull(); expect(log.unmounts).toEqual({ A: 1, B: 1 });
});

test('error di satu tab tidak menjatuhkan tab lain yang tersimpan', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  function Boom() { throw new Error('rusak'); }
  const tabs = [TABS[0], ['Rusak', 'x', Boom]];
  const r = render(<TabStack tabs={tabs} tab={0} props={{ tick: 0 }} resetKey="k" />);
  act(() => { r.update(<TabStack tabs={tabs} tab={1} props={{ tick: 0 }} resetKey="k" />); });
  expect(allText(r)).toContain('Layar Rusak bermasalah');
  act(() => { r.update(<TabStack tabs={tabs} tab={0} props={{ tick: 0 }} resetKey="k" />); });
  expect(visible(r)).toEqual(['A tick=0 n=0 | +A']);
  spy.mockRestore();
});

test('tab yang tampil tidak dirender ulang bila hanya fungsi di props yang dibuat ulang; dirender bila data berubah', () => {
  const withFn = (tick, hide) => <TabStack tabs={TABS} tab={0} props={{ tick, hide, y: 2026, m: 11, bump: () => {}, notify: () => {} }} resetKey="k" />;
  const r = render(withFn(0, false));
  const before = log.renders.A;
  rerender(r, withFn(0, false)); rerender(r, withFn(0, false)); // App dirender ulang (mis. toast), fungsi baru, data sama
  expect(log.renders.A).toBe(before);
  rerender(r, withFn(1, false)); expect(log.renders.A).toBe(before + 1); // data berubah
  rerender(r, withFn(1, true)); expect(log.renders.A).toBe(before + 2);
  expect(visible(r)).toEqual(['A tick=1 n=0 | +A']);
});
