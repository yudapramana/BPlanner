// Master kategori: daftar pilihan siap pakai untuk 5 kelompok anggaran, dibagi per subkelompok.
// Berdiri sendiri (tanpa impor) agar aman dimuat kapan saja.
// Format item: [nama, rekomendasi?]  -> true = ikut "Paket Master" saat membuat buku kas baru.
// Nama item harus unik di dalam satu kelompok (Pendapatan/Biaya/Tagihan/Pinjaman/Investasi/Tabungan).

export const MASTER = {
  'Pendapatan': [
    { grup: 'Pekerjaan', ikon: '💼', items: [['Gaji', true], ['Uang Makan'], ['Tunjangan Kinerja'], ['Tunjangan Keluarga'], ['Lembur'], ['Bonus', true], ['THR', true], ['Insentif / Komisi'], ['Honor']] },
    { grup: 'Usaha & Sampingan', ikon: '🛍️', items: [['Bisnis', true], ['Kerja Sampingan', true], ['Jualan Online'], ['Sewa Properti'], ['Bagi Hasil Usaha']] },
    { grup: 'Hasil Investasi', ikon: '📈', items: [['Dividen Saham'], ['Bunga Tabungan / Deposito'], ['Keuntungan Reksadana'], ['Keuntungan Emas'], ['Profit Kripto']] },
    { grup: 'Bantuan & Lainnya', ikon: '🎁', items: [['Kiriman Keluarga'], ['Hadiah'], ['Beasiswa'], ['Bantuan Pemerintah'], ['Cashback & Reward'], ['Penjualan Barang'], ['Pengembalian Dana'], ['Pendapatan Lain', true]] },
  ],
  'Biaya': [
    { grup: 'Makanan & Minuman', ikon: '🍽️', items: [['Makanan', true], ['Belanja Dapur'], ['Jajan & Kopi'], ['Makan di Luar'], ['Air Galon']] },
    { grup: 'Transportasi', ikon: '🚗', items: [['Transportasi', true], ['BBM'], ['Parkir & Tol'], ['Ojek / Taksi Online'], ['Angkutan Umum'], ['Servis Kendaraan']] },
    { grup: 'Rumah Tangga', ikon: '🏠', items: [['Rumah Tangga', true], ['Perabot & Peralatan'], ['Perawatan Rumah'], ['Laundry'], ['Gas LPG'], ['Kebutuhan Bayi']] },
    { grup: 'Kesehatan & Perawatan', ikon: '🩺', items: [['Kesehatan', true], ['Obat & Vitamin'], ['Dokter & Rumah Sakit'], ['Kecantikan'], ['Salon & Barber'], ['Olahraga & Gym']] },
    { grup: 'Gaya Hidup & Hiburan', ikon: '🎬', items: [['Pakaian', true], ['Hiburan', true], ['Hobi'], ['Liburan'], ['Belanja Online'], ['Gadget & Elektronik']] },
    { grup: 'Pendidikan Anak', ikon: '🎒', items: [['Jajan Sekolah'], ['Buku & Alat Tulis'], ['Les & Kursus'], ['Seragam & Perlengkapan'], ['Mainan & Rekreasi Anak']] },
    { grup: 'Sosial & Keluarga', ikon: '🤝', items: [['Kehidupan Sosial', true], ['Kado & Hadiah'], ['Sumbangan & Hajatan'], ['Kiriman Orang Tua'], ['Traktir Teman']] },
    { grup: 'Lain-lain', ikon: '🧾', items: [['Biaya Tak Terduga', true], ['Biaya Admin Bank'], ['Denda & Pajak'], ['Lain-lain']] },
  ],
  'Tagihan': [
    { grup: 'Hunian', ikon: '🏘️', items: [['Listrik', true], ['Air', true], ['Gas'], ['Uang Kos'], ['Sewa Rumah'], ['Iuran Lingkungan', true], ['Sampah Kota'], ['Pajak Bumi & Bangunan']] },
    { grup: 'Komunikasi & Digital', ikon: '📶', items: [['Internet', true], ['Ponsel', true], ['TV Kabel / Streaming'], ['Langganan Aplikasi'], ['Penyimpanan Cloud']] },
    { grup: 'Asuransi & Jaminan', ikon: '🛡️', items: [['BPJS Kesehatan', true], ['BPJS Ketenagakerjaan'], ['Asuransi Jiwa'], ['Asuransi Kesehatan'], ['Asuransi Kendaraan'], ['Asuransi Pendidikan']] },
    { grup: 'Pendidikan', ikon: '🎓', items: [['Sekolah Anak (SPP)'], ['Uang Kuliah'], ['Les Bulanan'], ['Antar-Jemput Sekolah']] },
    { grup: 'Kendaraan', ikon: '🛵', items: [['Mobil'], ['Pajak Kendaraan'], ['Parkir Bulanan']] },
    { grup: 'Iuran & Lainnya', ikon: '📌', items: [['Gaji Asisten Rumah Tangga'], ['Arisan'], ['Iuran Keanggotaan'], ['Uang Bulanan Orang Tua'], ['Tagihan Lain']] },
  ],
  'Pinjaman': [
    { grup: 'Properti', ikon: '🏡', items: [['Cicilan Rumah', true], ['Cicilan Tanah'], ['Cicilan Renovasi']] },
    { grup: 'Kendaraan', ikon: '🚘', items: [['Cicilan Motor', true], ['Cicilan Mobil', true]] },
    { grup: 'Bank & Koperasi', ikon: '🏦', items: [['Kredit Tanpa Agunan'], ['Pinjaman Koperasi'], ['Pinjaman Bank (Potong Gaji)'], ['Kredit Usaha Rakyat'], ['Kredit Multiguna']] },
    { grup: 'Kartu & Paylater', ikon: '💳', items: [['Kartu Kredit', true], ['Paylater', true], ['Pinjaman Online Resmi'], ['Cicilan Elektronik & Gadget']] },
    { grup: 'Pribadi & Emas', ikon: '🪙', items: [['Cicilan Emas'], ['Hutang ke Keluarga'], ['Hutang ke Teman']] },
  ],
  'Investasi/Tabungan': [
    { grup: 'Dana Darurat & Cadangan', ikon: '🛟', items: [['Dana Darurat', true], ['Tabungan Umum', true], ['Tabungan Rutin Bulanan']] },
    { grup: 'Tujuan Hidup', ikon: '🎯', items: [['Dana Pernikahan'], ['Dana Pendidikan Anak', true], ['Dana Rekreasi', true], ['Dana Mobil'], ['Dana Rumah / DP'], ['Dana Renovasi'], ['Dana Pensiun'], ['Dana Kelahiran'], ['Dana Gadget']] },
    { grup: 'Instrumen Investasi', ikon: '📊', items: [['Reksadana', true], ['Emas', true], ['Saham'], ['Obligasi / SBN'], ['Deposito'], ['Uang Kripto'], ['Properti'], ['Modal Usaha']] },
    { grup: 'Ibadah & Sosial', ikon: '🕌', items: [['Sedekah', true], ['Zakat'], ['Infak'], ['Wakaf'], ['Tabungan Haji & Umrah'], ['Tabungan Kurban']] },
  ],
};

export const masterNames = jenis => (MASTER[jenis] || []).flatMap(g => g.items.map(i => i[0]));
export const starterNames = jenis => (MASTER[jenis] || []).flatMap(g => g.items.filter(i => i[1]).map(i => i[0]));
export const masterCount = jenis => masterNames(jenis).length;
