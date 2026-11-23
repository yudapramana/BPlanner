import { makeDrive } from '../lib/drive';

const res = (status, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body, json: async () => JSON.parse(body || '{}') });
const mk = (files, onDelete) => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push([init.method || 'GET', url]);
    if (init.method === 'DELETE') return onDelete(decodeURIComponent(url.split('/files/')[1]), files);
    return res(200, JSON.stringify({ files: files.map(id => ({ id })) }));
  };
  return { drive: makeDrive({ getToken: async () => 't', fetchFn }), calls };
};

describe('Hapus akun: removeAll', () => {
  test('menghapus semua file aplikasi lalu berhenti saat daftar kosong', async () => {
    const files = ['a', 'b'];
    const { drive, calls } = mk(files, (id, arr) => { arr.splice(arr.indexOf(id), 1); return res(204); });
    expect(await drive.removeAll()).toBe(2);
    expect(calls.filter(c => c[0] === 'DELETE').length).toBe(2);
  });
  test('Drive kosong -> 0, tanpa panggilan hapus', async () => {
    const { drive, calls } = mk([], () => res(204));
    expect(await drive.removeAll()).toBe(0);
    expect(calls.some(c => c[0] === 'DELETE')).toBe(false);
  });
  test('404 saat hapus dianggap sudah terhapus (tidak dihitung, tidak error)', async () => {
    const files = ['a'];
    const { drive } = mk(files, (id, arr) => { arr.length = 0; return res(404, JSON.stringify({ error: { message: 'x' } })); });
    expect(await drive.removeAll()).toBe(0);
  });
  test('error lain (mis. 403 kuota) dilempar agar penghapusan di HP dibatalkan', async () => {
    const { drive } = mk(['a'], () => res(500, '{}'));
    await expect(drive.removeAll()).rejects.toThrow(/Google Drive/);
  });
});