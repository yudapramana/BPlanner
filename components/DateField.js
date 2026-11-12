import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { s } from '../theme';
import { MONTHS } from '../lib/calc';

const p2 = n => String(n).padStart(2, '0');
export const toYmd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; // tanggal lokal, bukan UTC
export const fromYmd = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); };
const label = v => { const d = fromYmd(v); return `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export default function DateField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={[s.in, s.dateBtn]} onPress={() => setOpen(true)}><Text>📅  {label(value)}</Text></TouchableOpacity>
      {open && (
        <DateTimePicker value={fromYmd(value)} mode="date" onChange={(e, d) => { setOpen(false); if (e.type === 'set' && d) onChange(toYmd(d)); }} />
      )}
    </>
  );
}
