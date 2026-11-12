// Pembungkus API file SDK 58 (class File/Paths) + share sheet.
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

export async function writeCache(name, content, base64 = false) {
  const f = new File(Paths.cache, name);
  if (!f.exists) f.create();
  await f.write(content, base64 ? { encoding: 'base64' } : undefined);
  return f.uri;
}
export const readText = uri => new File(uri).text();

export async function shareFile(uri, mimeType, title) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
  else Alert.alert('Tersimpan', uri);
}

// Penyimpanan permanen milik aplikasi (tidak dibersihkan sistem seperti cache). Dipakai untuk backup otomatis.
export async function writeDoc(dir, name, content) {
  const d = new Directory(Paths.document, dir);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const f = new File(d, name);
  if (!f.exists) f.create();
  await f.write(content);
  return f.uri;
}
// Daftar file .json di folder itu, urut nama (nama berawalan cap waktu = urut waktu)
export function listDoc(dir) {
  const d = new Directory(Paths.document, dir);
  if (!d.exists) return [];
  return d.list().filter(x => x.name && x.name.endsWith('.json')).sort((a, b) => (a.name < b.name ? -1 : 1));
}
