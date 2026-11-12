import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { NAVY } from '../theme';

const CH = 150, AXIS_W = 40;

// Skala "rapi": kelipatan 1 / 2 / 2,5 / 5 x 10^n, maksimal sekitar 5 garis bantu
function niceScale(max) {
  if (max <= 0) return { step: 200000, n: 5 };
  const raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= raw);
  return { step, n: Math.ceil(max / step) };
}
const f1 = n => String(+n.toFixed(1)).replace('.', ',');
export const axisLabel = v => (v === 0 ? '0' : v >= 1e9 ? f1(v / 1e9) + 'M' : v >= 1e6 ? f1(v / 1e6) + 'jt' : v >= 1e3 ? f1(v / 1e3) + 'rb' : String(v));

// data: [{ key, label, value }]; selected: key terpilih; onSelect(key)
export default function BarChart({ data, selected, onSelect }) {
  const { step, n } = niceScale(Math.max(0, ...data.map(d => d.value)));
  const top = step * n;
  const ticks = Array.from({ length: n + 1 }, (_, i) => i * step);
  return (
    <View>
      <Text style={{ fontSize: 10, color: '#636e72', marginBottom: 6 }}>Rp</Text>
      <View style={{ height: CH, flexDirection: 'row' }}>
        <View style={{ width: AXIS_W }}>
          {ticks.map(t => (
            <Text key={t} style={{ position: 'absolute', right: 6, bottom: (t / top) * CH - 7, fontSize: 10, color: '#636e72' }}>{axisLabel(t)}</Text>))}
        </View>
        <View style={{ flex: 1 }}>
          {ticks.map(t => <View key={t} style={{ position: 'absolute', left: 0, right: 0, bottom: (t / top) * CH, height: 1, backgroundColor: '#eef2f7' }} />)}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
            {data.map(d => {
              const on = d.key === selected;
              const h = d.value > 0 ? Math.max(4, (d.value / top) * CH) : 0;
              return (
                <TouchableOpacity key={d.key} activeOpacity={0.7} onPress={() => onSelect(d.key)} style={{ flex: 1, height: CH, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <View style={{ width: '62%', maxWidth: 22, height: h, borderRadius: 6, backgroundColor: on ? NAVY : '#d3dae3' }} />
                </TouchableOpacity>);
            })}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginLeft: AXIS_W, marginTop: 6 }}>
        {data.map(d => (
          <Text key={d.key} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: d.key === selected ? NAVY : '#636e72', fontWeight: d.key === selected ? '800' : '400' }}>{d.label}</Text>))}
      </View>
    </View>
  );
}
