import { freshDb, count } from './helpers/db';
import { db, meta, setMeta, resetAllData, isLocalEmpty, bid, getBooks, addCategory } from '../lib/db';

// Modul native Google Sign-In diganti tiruan agar bisa dilihat dengan Web Client ID apa ia dikonfigurasi.
const mockGS = {
  configure: jest.fn(), signOut: jest.fn(() => Promise.resolve()), hasPreviousSignIn: jest.fn(() => Promise.resolve(true)),
  addScopes: jest.fn(() => Promise.resolve({ type: 'success' })), getTokens: jest.fn(() => Promise.resolve({ accessToken: 'tok' })),
  hasPlayServices: jest.fn(() => Promise.resolve(true)), clearCachedAccessToken: jest.fn(() => Promise.resolve()),
  signIn: jest.fn(() => Promise.resolve({ type: 'success', data: { user: { id: 'g1', name: 'Yuda', email: 'y@x.id', photo: null } } })),
};
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: mockGS, isSuccessResponse: r => r && r.type === 'success', statusCodes: { SIGN_IN_CANCELLED: '12501', IN_PROGRESS: '12502', PLAY_SERVICES_NOT_AVAILABLE: '12503' },
}), { virtual: true });

const G = require('../lib/googleAuth');
const ID1 = '1234567890-abcdefg123456.apps.googleusercontent.com';
const ID2 = '9876543210-zyxwvu654321.apps.googleusercontent.com';

beforeEach(() => { freshDb(); Object.values(mockGS).forEach(f => f.mockClear && f.mockClear()); });

describe('Google Web Client ID diisi lewat aplikasi', () => {
  test('belum diisi: login ditolak dengan kode NO_CLIENT_ID dan modul native tidak disentuh', async () => {
    expect(G.getWebClientId()).toBe(''); expect(G.hasWebClientId()).toBe(false);
    await expect(G.signInWithGoogle()).rejects.toMatchObject({ code: 'NO_CLIENT_ID' });
    expect(mockGS.configure).not.toHaveBeenCalled();
  });
  test('ID yang disimpan langsung dipakai login berikutnya (configure menerima ID itu)', async () => {
    await G.saveWebClientId(ID1);
    expect(G.getWebClientId()).toBe(ID1);
    const u = await G.signInWithGoogle();
    expect(u).toEqual({ googleId: 'g1', nama: 'Yuda', email: 'y@x.id', foto: '' });
    expect(mockGS.configure).toHaveBeenLastCalledWith({ webClientId: ID1 });
  });
  test('mengganti ID (mis. yang lama dicabut): ID baru dipakai, sesi lama diputus, izin Drive diminta ulang', async () => {
    await G.saveWebClientId(ID1); setMeta('drive.scope', 1);
    const r = await G.saveWebClientId(ID2);
    expect(r.changed).toBe(true);
    expect(mockGS.signOut).toHaveBeenCalled();
    expect(meta('drive.scope')).toBe('0');
    await G.signInWithGoogle();
    expect(mockGS.configure).toHaveBeenLastCalledWith({ webClientId: ID2 });
  });
  test('menyimpan ID yang sama tidak memutus sesi', async () => {
    await G.saveWebClientId(ID1); mockGS.signOut.mockClear();
    const r = await G.saveWebClientId(`  ${ID1}\n`);
    expect(r.changed).toBe(false); expect(mockGS.signOut).not.toHaveBeenCalled();
  });
  test('hasil salin-tempel dibersihkan (spasi, baris baru, tanda kutip)', async () => {
    await G.saveWebClientId(` "${ID1.slice(0, 20)}\n${ID1.slice(20)}" `);
    expect(G.getWebClientId()).toBe(ID1);
  });
  test('format salah ditolak dan tidak disimpan (client secret / teks acak / ID Android)', async () => {
    for (const bad of ['GOCSPX-abcdef123456', 'halo', '1234567890-abc.apps.google.com', 'abc-123.apps.googleusercontent.com']) {
      await expect(G.saveWebClientId(bad)).rejects.toThrow(/Format Web Client ID/);
    }
    expect(G.getWebClientId()).toBe('');
  });
  test('mengosongkan menghapus ID tersimpan', async () => {
    await G.saveWebClientId(ID1);
    const r = await G.saveWebClientId('   ');
    expect(r.changed).toBe(true); expect(G.hasWebClientId()).toBe(false); expect(meta(G.CLIENT_ID_KEY)).toBeNull();
  });
  test('ID tidak ikut terhapus saat data dikosongkan (keluar akun)', async () => {
    await G.saveWebClientId(ID1); setMeta('welcome_done', 1); setMeta('profile.mode', 'google'); setMeta('drive.scope', 1);
    addCategory('Biaya', 'Makanan');
    resetAllData();
    expect(G.getWebClientId()).toBe(ID1); expect(meta('welcome_done')).toBe('1');
    expect(meta('profile.mode')).toBeNull(); expect(meta('drive.scope')).toBeNull();
  });
  test('maskClientId menampilkan awal dan akhir saja', () => {
    expect(G.maskClientId(ID1)).toBe('1234567890-ab…apps.googleusercontent.com');
    expect(G.maskClientId('')).toBe('');
  });
});

describe('izin Google Drive', () => {
  beforeEach(async () => { await G.saveWebClientId(ID1); mockGS.signOut.mockClear(); });
  test('interaktif: meminta izin sekali lalu mengingatnya', async () => {
    expect(await G.getDriveToken()).toBe('tok');
    expect(mockGS.addScopes).toHaveBeenCalledTimes(1); expect(meta('drive.scope')).toBe('1');
    await G.getDriveToken(); expect(mockGS.addScopes).toHaveBeenCalledTimes(1);
  });
  test('senyap (latar belakang): tanpa izin tidak pernah memunculkan jendela, langsung gagal', async () => {
    await expect(G.getDriveTokenSilent()).rejects.toThrow(/Izin Google Drive belum diberikan/);
    expect(mockGS.addScopes).not.toHaveBeenCalled();
    setMeta('drive.scope', 1); expect(await G.getDriveTokenSilent()).toBe('tok');
  });
  test('sesi terputus: pesan mengarahkan ke Hubungkan ulang, dan sessionActive() false', async () => {
    mockGS.hasPreviousSignIn.mockResolvedValueOnce(false);
    await expect(G.getDriveToken()).rejects.toThrow(/Hubungkan ulang/);
    mockGS.hasPreviousSignIn.mockResolvedValueOnce(false);
    expect(await G.sessionActive()).toBe(false);
    expect(await G.sessionActive()).toBe(true);
  });
  test('pesan DEVELOPER_ERROR mengarah ke Web Client ID', () => {
    expect(G.authMessage({ code: '10', message: 'x' })).toMatch(/Web Client ID/);
  });
});

describe('resetAllData / isLocalEmpty', () => {
  test('kembali ke satu buku kas kosong berid 1 dan aktif', () => {
    addCategory('Biaya', 'Makanan'); db.runSync("INSERT INTO books(nama,tipe,urut) VALUES('B2','pribadi',1)");
    expect(isLocalEmpty()).toBe(false);
    resetAllData();
    expect(isLocalEmpty()).toBe(true);
    expect(getBooks().map(b => [b.id, b.nama])).toEqual([[1, 'Buku Kas Utama']]);
    expect(bid()).toBe(1); expect(count('categories')).toBe(0);
  });
  test('buku kas kedua saja (tanpa data) sudah dianggap berisi', () => {
    db.runSync("INSERT INTO books(nama,tipe,urut) VALUES('B2','pribadi',1)");
    expect(isLocalEmpty()).toBe(false);
  });
});
