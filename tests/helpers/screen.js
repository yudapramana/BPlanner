// Pembantu uji layar: render dengan react-test-renderer, cari teks, tekan tombol, isi kolom, jawab Alert.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const RN = require('react-native');

global.IS_REACT_ACT_ENVIRONMENT = true;
// react-test-renderer masih berfungsi di React 19 tetapi mencetak peringatan "deprecated" di setiap render; sembunyikan peringatan itu saja.
const origError = console.error;
console.error = (...a) => { if (typeof a[0] === 'string' && a[0].includes('react-test-renderer is deprecated')) return; origError(...a); };

const flat = c => (c == null || c === false || c === true ? [] : Array.isArray(c) ? c.flatMap(flat) : typeof c === 'object' ? [] : [String(c)]);
// Teks per elemen <Text> (anak bertingkat digabung), urut sesuai tampilan.
const texts = r => r.root.findAll(n => n.type === 'Text').map(n => flat(n.props.children).join(''));
const allText = r => texts(r).join(' | ');

function render(el) { let r; act(() => { r = TestRenderer.create(el); }); return r; }
// Untuk layar yang menjalankan efek async saat dibuka (mis. cek izin notifikasi): tunggu semuanya selesai.
async function renderAsync(el) { let r; await act(async () => { r = TestRenderer.create(el); }); return r; }
const rerender = (r, el) => act(() => { r.update(el); });

// Elemen yang bisa ditekan (host) yang memuat teks / label tertentu. Teks: cocok persis per <Text> atau regex.
const PRESSABLE = ['TouchableOpacity', 'Pressable', 'TouchableWithoutFeedback'];
const matches = (s, q) => (q instanceof RegExp ? q.test(s) : s === q);
function pressables(r, q) {
  return r.root.findAll(n => PRESSABLE.includes(n.type) && n.props.onPress && (
    (n.props.accessibilityLabel && matches(n.props.accessibilityLabel, q)) ||
    n.findAll(t => t.type === 'Text').some(t => matches(flat(t.props.children).join(''), q))));
}
function press(r, q, i = 0) {
  const list = pressables(r, q);
  // yang paling dalam lebih dulu (tombol di dalam kartu yang juga bisa ditekan)
  const inner = list.filter(n => !list.some(o => o !== n && n.findAll(x => x === o).length));
  const target = inner[i];
  if (!target) throw new Error(`Tombol "${q}" tidak ditemukan. Teks di layar: ${allText(r)}`);
  act(() => { target.props.onPress(); });
}
async function pressAsync(r, q, i = 0) {
  const target = pressables(r, q)[i];
  if (!target) throw new Error(`Tombol "${q}" tidak ditemukan. Teks di layar: ${allText(r)}`);
  await act(async () => { await target.props.onPress(); });
}
const inputs = r => r.root.findAll(n => n.type === 'TextInput');
function input(r, q) {
  const list = inputs(r);
  const n = typeof q === 'number' ? list[q] : list.find(x => matches(String(x.props.placeholder || ''), q) || matches(String(x.props.accessibilityLabel || ''), q));
  if (!n) throw new Error(`Kolom "${q}" tidak ditemukan. Placeholder: ${list.map(x => x.props.placeholder).join(', ')}`);
  return n;
}
const type = (r, q, v) => act(() => { input(r, q).props.onChangeText(v); });

// Alert terakhir; pressAlert menekan tombol berdasarkan teks.
const lastAlert = () => RN.__alerts[RN.__alerts.length - 1];
const clearAlerts = () => { RN.__alerts.length = 0; };
function pressAlert(text) {
  const a = lastAlert(); if (!a) throw new Error('Tidak ada Alert');
  const b = a.buttons.find(x => x.text === text);
  if (!b) throw new Error(`Tombol Alert "${text}" tidak ada: ${a.buttons.map(x => x.text).join(', ')}`);
  act(() => { b.onPress && b.onPress(); });
}

module.exports = { React, act, render, renderAsync, rerender, texts, allText, press, pressAsync, pressables, inputs, input, type, lastAlert, clearAlerts, pressAlert };
