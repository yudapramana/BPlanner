export const SEED_CATS = {
  'Pendapatan': [['Gaji',3385100],['Uang Makan',500000],['Tunjangan Kinerja',3319000],['Kerja Sampingan',0],['Pendapatan Lain',1500000],['Bisnis',300000]],
  'Biaya': [['Makanan',0],['Kehidupan Sosial',0],['Transportasi',0],['Rumah Tangga',1000000],['Pakaian',0],['Kecantikan',2500000]],
  'Tagihan': [['Internet',166500],['Listrik',0],['Air',0],['Ponsel',0],['Asuransi Jiwa',0],['Asuransi Kesehatan',0],['Sampah Kota',0],['Mobil',0],['Sekolah Anak (SPP)',840000],['Uang Kos',670000]],
  'Pinjaman': [['Cicilan Rumah',2137026],['Cicilan Emas',982887]],
  'Investasi/Tabungan': [['Dana Rekreasi',0],['Dana Pernikahan',0],['Dana Mobil',0],['Saham',0],['Reksadana',0],['Uang Kripto',0],['Sedekah',100000]],
};
const P='Pendapatan',B='Biaya',T='Tagihan',L='Pinjaman',I='Investasi/Tabungan';
export const SEED_TX = [
  ['2026-11-01',P,'Gaji',3385100,''],
  ['2026-11-02',B,'Transportasi',25000,'Naik HPS'],
  ['2026-11-02',B,'Makanan',10000,'Sarapan Pagi Senin'],
  ['2026-11-02',B,'Makanan',12000,'Lotek + 2 Kerupuk'],
  ['2026-11-02',B,'Makanan',20000,'Beras 1/2 Centang + 3 Butir Telur'],
  ['2026-11-02',B,'Rumah Tangga',8000,'Sabun Cuci Piring'],
  ['2026-11-02',B,'Rumah Tangga',27000,'Laundry'],
  ['2026-11-02',P,'Pendapatan Lain',1500000,'Dana Bantuan'],
  ['2026-11-02',T,'Uang Kos',670000,'Uang Kos Bulanan'],
  ['2026-11-01',L,'Cicilan Rumah',2137026,'Cicilan Rumah Bulanan'],
  ['2026-11-03',B,'Makanan',3000,'Sarapan Bakwan 3'],
  ['2026-11-03',P,'Pendapatan Lain',150000,'Uang Harian Rapat PPIU Haji'],
  ['2026-11-01',P,'Bisnis',300000,'Uang Sewa Kontrakan Sei Laban'],
  ['2026-11-03',L,'Cicilan Emas',982887,''],
  ['2026-11-04',B,'Makanan',10000,'Makan Siang Beli Ayam'],
  ['2026-11-04',I,'Sedekah',10000,''],
  ['2026-11-04',B,'Makanan',5000,'Beli Bakso'],
  ['2026-11-04',T,'Internet',75026,'Internet Kartu Tri'],
  ['2026-11-05',P,'Tunjangan Kinerja',3319000,'Tukin Oktober'],
  ['2026-11-05',P,'Uang Makan',597550,'Uang Makan'],
  ['2026-11-05',B,'Transportasi',25000,'HPS Pulang Kamis'],
  ['2026-11-05',B,'Transportasi',27000,'Gocar Imam Bonjol - Kos Istri'],
  ['2026-11-05',B,'Rumah Tangga',44000,'Beli Galon 2 Buah'],
  ['2026-11-06',P,'',0,''], // baris tidak lengkap dari Excel (baris 28)
];

