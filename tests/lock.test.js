import { freshDb } from './helpers/db';
import * as LA from './helpers/expo-local-authentication';
import { meta, resetAllData } from '../lib/db';
import * as SC from './helpers/expo-screen-capture';
import { isLockEnabled, setLockEnabled, deviceLockAvailable, authenticate, authBusy, shouldLock, reasonText, LOCK_GRACE_MS, LOCK_KEY, applyScreenPrivacy } from '../lib/lock';

beforeEach(() => { freshDb(); LA.__reset(); });

describe('pengaturan kunci aplikasi', () => {
  test('bawaan mati; bisa dinyalakan/dimatikan dan tersimpan di meta', () => {
    expect(isLockEnabled()).toBe(false);
    setLockEnabled(true); expect(isLockEnabled()).toBe(true); expect(meta(LOCK_KEY)).toBe('1');
    setLockEnabled(false); expect(isLockEnabled()).toBe(false);
  });
  test('pengaturan perangkat: tidak ikut terhapus saat keluar akun / kosongkan semua data (awalan cfg.)', () => {
    setLockEnabled(true); resetAllData(); expect(isLockEnabled()).toBe(true);
  });
});

describe('privasi layar (FLAG_SECURE) mengikuti kunci aplikasi', () => {
  beforeEach(() => SC.__reset());
  test('menyalakan kunci memblokir tangkapan layar; mematikan mengizinkan lagi', () => {
    setLockEnabled(true); setLockEnabled(false);
    expect(SC.__state.calls).toEqual(['prevent', 'allow']);
  });
  test('applyScreenPrivacy tanpa argumen memakai pengaturan tersimpan (dipanggil saat aplikasi dibuka)', () => {
    applyScreenPrivacy(); expect(SC.__state.calls).toEqual(['allow']);
    setLockEnabled(true); SC.__reset(); applyScreenPrivacy(); expect(SC.__state.calls).toEqual(['prevent']);
  });
});

describe('deviceLockAvailable', () => {
  test.each([[0, false], [1, true], [2, true], [3, true]])('level %i -> %s', async (level, want) => {
    LA.__state.level = level; expect(await deviceLockAvailable()).toBe(want);
  });
  test('error dari modul native -> dianggap tidak tersedia, tidak melempar', async () => {
    LA.__state.throws = 'level'; expect(await deviceLockAvailable()).toBe(false);
  });
});

describe('authenticate', () => {
  test('berhasil -> { ok: true }; kunci layar HP boleh jadi pengganti biometrik (disableDeviceFallback tidak true)', async () => {
    expect(await authenticate('Pesan uji')).toEqual({ ok: true });
    const opts = LA.__state.calls[0]; expect(opts.promptMessage).toBe('Pesan uji'); expect(opts.disableDeviceFallback).not.toBe(true);
  });
  test('gagal / dibatalkan -> ok:false dengan alasan dari sistem', async () => {
    LA.__state.result = { success: false, error: 'user_cancel' }; expect(await authenticate()).toEqual({ ok: false, reason: 'user_cancel' });
    LA.__state.result = { success: false }; expect(await authenticate()).toEqual({ ok: false, reason: 'unknown' });
  });
  test('error native tidak dilempar', async () => {
    LA.__state.throws = 'auth'; expect(await authenticate()).toEqual({ ok: false, reason: 'error' });
  });
  test('authBusy menyala selama jendela autentikasi tampil dan padam sesudahnya (juga saat gagal)', async () => {
    let during = null; LA.__state.onAuth = () => { during = authBusy(); };
    expect(authBusy()).toBe(false); await authenticate(); expect(during).toBe(true); expect(authBusy()).toBe(false);
    LA.__state.throws = 'auth'; await authenticate(); expect(authBusy()).toBe(false);
  });
});

describe('shouldLock', () => {
  test('tidak tercatat -> tidak mengunci; di bawah batas -> tidak; sama atau lebih -> mengunci', () => {
    expect(shouldLock(null, 999999999)).toBe(false);
    expect(shouldLock(1000, 1000 + LOCK_GRACE_MS - 1)).toBe(false);
    expect(shouldLock(1000, 1000 + LOCK_GRACE_MS)).toBe(true);
    expect(shouldLock(1000, 1000 + 5, 5)).toBe(true);
  });
});

describe('reasonText', () => {
  test('setiap alasan punya pesan Indonesia yang bisa dibaca', () => {
    ['user_cancel', 'lockout', 'not_enrolled', 'passcode_not_set', 'authentication_failed', undefined].forEach(r => expect(reasonText(r)).toMatch(/\w+/));
    expect(reasonText('lockout')).toMatch(/Terlalu banyak/);
  });
});