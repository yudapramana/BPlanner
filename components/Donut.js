import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { NAVY } from '../theme';

// data: [{ key, value, color }]; teks tengah: top (kecil), bottom (tebal)
export default function Donut({ data, size = 150, stroke = 26, top, bottom }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const total = data.reduce((a, d) => a + d.value, 0);
  let off = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${mid}, ${mid}`}>
          <Circle cx={mid} cy={mid} r={r} stroke="#dfe6e9" strokeWidth={stroke} fill="none" />
          {total > 0 && data.filter(d => d.value > 0).map(d => {
            const len = (d.value / total) * c;
            const el = <Circle key={d.key} cx={mid} cy={mid} r={r} stroke={d.color} strokeWidth={stroke} fill="none" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
            off += len;
            return el;
          })}
        </G>
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: stroke }}>
        <Text style={{ fontSize: 10, color: '#636e72' }}>{top}</Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: NAVY }} numberOfLines={1} adjustsFontSizeToFit>{bottom}</Text>
      </View>
    </View>
  );
}
