import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import NavIcon from './NavIcons';
import { initials, avatarColor } from '../lib/initials';

// profile null = belum masuk (ikon orang). Foto Google dipakai bila ada; jika offline / gagal dimuat, jatuh ke inisial.
export default function Avatar({ profile, size = 42 }) {
  const [bad, setBad] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' };
  if (!profile) return <View style={[box, { backgroundColor: '#e8edf3' }]}><NavIcon name="pribadi" color="#6b7a8d" size={size * 0.55} /></View>;
  if (profile.foto && !bad) return <Image key={profile.foto} source={{ uri: profile.foto }} style={box} onError={() => setBad(true)} accessibilityIgnoresInvertColors />;
  return <View style={[box, { backgroundColor: avatarColor(profile.nama || profile.email) }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(profile.nama || profile.email)}</Text></View>;
}
