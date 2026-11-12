import * as XLSX from 'xlsx';
import { Alert } from 'react-native';
import { toCsv } from './csv';
import { writeCache, shareFile } from './files';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// sheets: [{ name, rows: [[...], ...] }]; format: 'xlsx' | 'csv'
export async function shareSheets(baseName, sheets, format = 'xlsx') {
  if (format === 'csv') {
    const rows = sheets.flatMap((sh, i) => (i ? [[], [sh.name], ...sh.rows] : sh.rows));
    const uri = await writeCache(baseName + '.csv', toCsv(rows));
    return shareFile(uri, 'text/csv', baseName);
  }
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    const cols = Math.max(0, ...sh.rows.map(r => r.length));
    ws['!cols'] = Array.from({ length: cols }, (_, c) => ({ wch: Math.min(45, Math.max(8, ...sh.rows.map(r => String(r[c] ?? '').length))) }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  });
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const uri = await writeCache(baseName + '.xlsx', b64, true);
  return shareFile(uri, XLSX_MIME, baseName);
}

export const askFormat = cb => Alert.alert('Export laporan', 'Pilih format file:', [
  { text: 'Batal', style: 'cancel' },
  { text: 'CSV', onPress: () => cb('csv') },
  { text: 'Excel (.xlsx)', onPress: () => cb('xlsx') },
]);
export const failAlert = title => e => Alert.alert(title, String((e && e.message) || e));
