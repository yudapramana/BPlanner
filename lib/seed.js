import { starterNames } from './master';

// Urutan kelompok tetap. SEED_CATS = kategori umum dari master dengan anggaran Rp 0 (dipakai Template Import).
// Tidak memuat data pribadi apa pun.
export const JENIS = ['Pendapatan', 'Biaya', 'Tagihan', 'Pinjaman', 'Investasi/Tabungan'];
export const SEED_CATS = Object.fromEntries(JENIS.map(j => [j, starterNames(j).map(n => [n, 0])]));