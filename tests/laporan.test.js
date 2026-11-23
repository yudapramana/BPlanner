import { buildErrorReport } from '../lib/errors';

describe('buildErrorReport', () => {
  test('memuat versi, platform, jumlah, dan memangkas stack (8 baris) serta komponen (6 baris)', () => {
    const stack = Array.from({ length: 20 }, (_, i) => `at fn${i} (file.js:${i})`).join('\n');
    const comp = Array.from({ length: 10 }, (_, i) => `in Komp${i}`).join('\n');
    const t = buildErrorReport({ version: '1.14.0', platform: 'android 14', now: new Date('2026-11-15T01:02:03Z'),
      errors: [{ at: '2026-11-15T00:00:00Z', where: 'syncNow', name: 'DriveError', message: 'gagal', stack, componentStack: comp }] });
    expect(t).toContain('Versi: 1.14.0'); expect(t).toContain('Platform: android 14'); expect(t).toContain('Jumlah error: 1'); expect(t).toContain('[syncNow]'); expect(t).toContain('DriveError: gagal');
    expect(t).toContain('at fn7'); expect(t).not.toContain('at fn8'); expect(t).toContain('in Komp5'); expect(t).not.toContain('in Komp6');
  });
  test('daftar kosong tetap menghasilkan teks', () => { expect(buildErrorReport({ errors: [] })).toContain('Jumlah error: 0'); });
});