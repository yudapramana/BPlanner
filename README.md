# Monthly Budget Planner (Android) v1.13.0 — Expo SDK 58

## Struktur
- `App.js` — navigasi bawah + state bulan/tahun; menjalankan pencatatan otomatis & penjadwalan pengingat (`refreshRecurring`)
- `screens/` — DashboardScreen (angka bisa disembunyikan lewat ikon mata), TransaksiScreen (daftar transaksi), ExpensesScreen (bar chart 12 bulan + donat per kategori), PengaturanScreen (tab "Anggaran") (kategori + backup), TransaksiFormScreen, BerulangScreen (daftar & form transaksi berulang + pengaturan pengingat)
- `components/` — ui.js (Card, Btn, Chips, Prog, Section, MonthPicker pil ringkas), BarChart.js, Donut.js, EyeIcon.js, DateField.js (date picker), MasterSheet.js (pilih kategori dari master), BookSheet.js (Buku Kas), ErrorBoundary.js (pelindung kesalahan layar + layar pengganti)
- `lib/` — db.js (SQLite, migrasi bernomor, kategori), seed.js (data awal Excel), master.js (master kategori 5 kelompok), calc.js (rumus), csv.js, backup.js (export/import CSV & JSON, backup otomatis), excel.js (.xlsx/CSV), files.js, recurring.js (transaksi berulang), reminders.js (notifikasi pengingat), errors.js (pembantu penanganan error)
- `tests/` — pengujian otomatis (Jest): rumus, CSV, migrasi, backup/import, transaksi berulang, pengingat, ErrorBoundary. Lihat bagian Pengujian di bawah
- `theme.js` — warna & style bersama

## Menjalankan di laptop (tanpa Android Studio)
Butuh Node.js 22 (`node -v`).
    npm install
    npx expo start
Lalu buka dengan Expo Go **versi SDK 58** (scan QR). Jika Expo Go di Play Store belum SDK 58, lihat https://expo.dev/go.
Uji bundling saja: `npx expo export --platform android`.
Jalankan pengujian: `npm test` (lihat bagian Pengujian).

## Build APK
Push ke GitHub (branch main/master) → tab Actions → Build APK → unduh artifact `app-release.apk`.

## Backup & Restore
Anggaran → (bagian bawah) Data & Backup:
- **Export Backup Buku Ini (CSV)** — hanya buku kas aktif.
- **Export Backup Semua Buku (JSON)** — semua buku kas dalam satu file; untuk pindah HP.
- **Import dari File (CSV / JSON)** — jenis file dikenali otomatis; pilih Gabung atau Ganti Semua.
- **Simpan Backup Otomatis Terakhir** — membagikan salinan otomatis terbaru.
- Template Import dan Export Excel.

Format CSV: `Tipe,Tanggal,Jenis,Kategori,Nominal,Keterangan` (Tipe = KATEGORI atau TRANSAKSI; Nominal pada KATEGORI = anggaran).

## Buku Kas (v1.6.2)
- Kategori, anggaran, dan transaksi menempel ke satu **buku kas** (kolom `book_id`). Ketuk nama buku kas di header untuk ganti, tambah, ubah, atau hapus buku kas (Pribadi, Keluarga, Proyek, Acara, Lainnya).
- Data dari versi sebelumnya otomatis masuk ke "Buku Kas Utama" saat aplikasi pertama dibuka (lihat migrasi di bawah, tidak ada data yang hilang).
- Buku kas baru bisa menyalin kategori & anggaran dari buku aktif atau dimulai kosong. Transaksi tidak pernah ikut disalin.
- Backup/Import CSV, Export Excel, dan Reset Data Awal hanya berlaku untuk buku kas yang aktif. Untuk semua buku kas gunakan Backup JSON.
- Buku kas yang terakhir dipakai diingat (tabel `meta`).
- Buku kas dirancang sebagai ruang **anggaran** terpisah (rencana vs realisasi) dengan kelompok yang sama di semua buku; bukan pembukuan usaha (modal, HPP, prive, dll tidak didukung).

## Master Kategori (v1.7.0)
- `lib/master.js` berisi master kategori untuk 5 kelompok (Pendapatan, Biaya, Tagihan, Pinjaman, Investasi/Tabungan), dibagi per subkelompok (mis. Biaya → Makanan & Minuman, Transportasi, Rumah Tangga, dst). Tambah/ubah pilihan cukup di file ini; item bertanda `true` ikut Paket Master.
- Tab **Anggaran**: tiap kelompok punya tombol **📚 Pilih dari Master**. Pilih banyak kategori sekaligus (atau ★ Pilih yang umum), lalu Tambahkan. Kategori yang sudah ada ditandai ✓. Ketik manual ("Kategori baru...") tetap tersedia.
- **Buku Kas Baru** punya 3 pilihan isi awal: **Paket Master** (default; kategori umum, anggaran Rp 0), **Salin Buku Aktif**, atau **Kosong**.
- Menu bawah: "Riwayat" diganti **Transaksi** (ikon panah dua arah); label tombol ＋ di tengah menjadi **Tambah**.

## Perubahan v1.8.0
**Kategori terhubung lewat ID.** Kolom baru `transactions.category_id` menunjuk `categories.id`, dan nama kategori unik per (buku kas, kelompok) tanpa membedakan huruf besar/kecil (`UNIQUE INDEX ux_cat_nama`).
- Ganti nama kategori ditolak bila namanya sudah dipakai kategori lain di kelompok yang sama; bila diterima, nama di semua transaksinya ikut berubah.
- Hapus kategori menampilkan jumlah & total transaksi yang terdampak, dengan dua pilihan: **hapus kategori saja** (transaksi tetap ada tanpa kategori, ditandai ⚠ dan bisa dipilihkan kategori baru lewat Edit) atau **hapus beserta transaksinya**.
- `transactions.kategori` (teks) tetap disimpan sebagai salinan nama (untuk CSV/backup dan transaksi tanpa kategori); relasi yang sebenarnya adalah `category_id`.
- Perhitungan Dashboard memakai `category_id`; transaksi tanpa kategori tidak lagi ikut baris kategori mana pun.

**Migrasi bernomor (`PRAGMA user_version`).** Di `lib/db.js`, daftar `MIGRATIONS` berisi satu fungsi per versi skema; tiap migrasi berjalan dalam satu transaksi bersama kenaikan `user_version` (gagal = dibatalkan total). Aturan: migrasi yang sudah dirilis tidak diubah; perubahan skema baru = tambah satu fungsi di akhir daftar.
- v1: skema dasar + `book_id` (idempotent, aman untuk database lama yang `user_version`-nya masih 0).
- v2: pangkas spasi di nama; **gabungkan kategori kembar** (nama sama tanpa beda huruf besar/kecil dalam satu buku & kelompok; anggaran dijumlahkan agar total rencana tidak berubah); tambah & isi `category_id`; buat indeks unik.

**Backup.**
- Export Backup Semua Buku (JSON): semua buku kas, kategori, anggaran, transaksi. Import JSON: *Gabung* (buku bernama sama digabung, transaksi kembar dilewati) atau *Ganti Semua* (semua buku diganti isi file).
- **Backup otomatis**: sebelum *Ganti Semua* (CSV maupun JSON) dan *Reset Data Awal*, aplikasi menyimpan salinan JSON ke penyimpanan aplikasi (`auto-backup/`, 10 terbaru). Jika salinan gagal dibuat, tindakan dibatalkan dan data tidak disentuh. Salinan itu bisa dibagikan lewat dialog hasil import atau tombol *Simpan Backup Otomatis Terakhir*, dan dipulihkan lewat Import JSON biasa.
- Catatan: penyimpanan aplikasi ikut terhapus bila aplikasi di-uninstall, jadi untuk pindah HP tetap gunakan Export lalu simpan filenya di luar aplikasi.

**Perbaikan bug.** Membuat buku kas baru dengan isi awal "Paket Master" (pilihan default) gagal dengan error SQLite "cannot start a transaction within a transaction", karena `addCategories` membuka transaksi di dalam transaksi `addBook`. Kini semua transaksi di `db.js` memakai `inTx()` yang aman dipanggil bersarang.

## v1.9.0 — Login Google & Profil
- Layar sambutan sekali saat pertama dibuka: Daftar/Masuk dengan Google, atau lanjut tanpa akun.
- Ikon profil di kanan atas header membuka halaman Profil (foto, nama, email, ringkasan data, versi, keluar).
- Konfigurasi: lihat PANDUAN_GOOGLE_LOGIN.md (isi `GOOGLE_WEB_CLIENT_ID` di `lib/config.js`).
- Memakai modul native `@react-native-google-signin/google-signin`: wajib build ulang, tidak jalan di Expo Go.

## v1.10.0 — Cadangan Google Drive
- Pengaturan → Cadangan Google Drive: Cadangkan (semua buku kas, JSON) dan Pulihkan (pilih dari 10 cadangan terbaru).
- Scope drive.file saja; panduan lengkap: PANDUAN_GOOGLE_DRIVE.md. Tidak ada dependensi native baru.

## v1.11.0 — Transaksi berulang + pengingat tagihan
Catat sekali, muncul tiap bulan: cicilan rumah, cicilan emas, uang kos, internet, SPP, gaji, tabungan rutin.

**Cara pakai**
- **Dari form transaksi:** saat menambah transaksi, nyalakan *Ulangi tiap bulan*. Transaksi itu menjadi bulan pertama; bulan berikutnya dicatat pada tanggal yang sama.
- **Dari menu:** tab Transaksi → *🔁 Transaksi Berulang & Pengingat* (juga ada di tab Anggaran dan di bagian *Jatuh Tempo* Dashboard). Isi jenis, kategori, nominal, tanggal tiap bulan, bulan mulai, (opsional) bulan berakhir.
- **Otomatis** (default): transaksi dibuat sendiri saat jatuh tempo tiba. Bila aplikasi tidak dibuka beberapa bulan, bulan yang terlewat dicatat sekaligus saat dibuka (maks. 60 bulan). **Ingatkan saja**: tidak ada transaksi dibuat; ketuk *Catat* (Dashboard / daftar berulang) setelah membayar, atau *Lewati bulan ini*.
- Tanggal 29–31 memakai tanggal terakhir di bulan yang lebih pendek. Menghapus transaksi hasil berulang = bulan itu dilewati (tidak dibuat ulang). Menghapus templat tidak menghapus transaksi yang sudah tercatat.
- Transaksi hasil berulang ditandai 🔁 di daftar.

**Pengingat (butuh build ulang: modul native `expo-notifications`)**
- Notifikasi lokal pukul 09.00: pada H-n (pilih Tanpa / Hari-H / H-1 / H-3 / H-7), pada hari-H, dan (mode *Ingatkan saja*) H+2 bila belum dicatat.
- **Ambang 80% dan 100%:** isi notifikasi, kartu *Jatuh Tempo* di Dashboard, dan pratinjau di form menghitung dampak membayar tagihan itu terhadap anggaran kategori bulan jatuh tempo, memakai aturan yang sama dengan status kategori (`WARN_AT = 0.8` di `lib/calc.js`). Biaya/Tagihan: 🟠 ≥ 80%, 🔴 100% (habis) dan di atas 100% (melampaui). Pinjaman/Tabungan/Pendapatan: 🟢 mendekati target ≥ 80%, tercapai 100%.
- Nominal di notifikasi disamarkan secara default (layar kunci); bisa diubah di layar Transaksi Berulang.
- Izin notifikasi diminta saat pertama kali menyimpan transaksi berulang (atau lewat tombol *Aktifkan Pengingat*). Semua notifikasi dijadwalkan ulang setiap aplikasi dibuka/kembali aktif atau data berubah (maks. 60 terjadwal), sehingga jadwal selalu sesuai data terbaru.
- Keterbatasan: pencatatan otomatis berjalan saat aplikasi dibuka (tanpa layanan latar belakang), dan isi catatan 80%/100% dihitung saat penjadwalan. Beberapa HP dengan penghemat baterai agresif dapat menunda notifikasi; matikan optimasi baterai untuk aplikasi ini bila perlu.

**Data & migrasi**
- Migrasi skema **v3**: tabel `recurring` (templat) dan `recurring_log` (bulan yang sudah diproses: `done`/`skip`, mencegah catatan ganda), kolom `transactions.recurring_id`. Data lama tidak berubah.
- Backup JSON ikut menyimpan transaksi berulang beserta log-nya (file backup lama tetap bisa diimpor). Backup CSV, Excel, dan Reset Data Awal tidak memuat transaksi berulang; *Ganti Semua* dan *Reset* menghapusnya bersama kategorinya. Menghapus kategori ikut menghapus transaksi berulang untuk kategori itu (ada peringatan).

## v1.12.0 — Pengujian otomatis + ErrorBoundary
Tujuan: kesalahan rumus, import/backup yang merusak data, atau migrasi yang gagal tertangkap **sebelum** sampai ke HP, dan satu layar yang error tidak lagi mematikan seluruh aplikasi.

### Pengujian
    npm install      # sekali saja (memasang jest, sql.js, dsb. sebagai devDependencies)
    npm test         # semua tes (±2 detik, tanpa HP / emulator)
    npm run test:watch
Tes juga dijalankan otomatis di GitHub Actions sebelum APK dibuild; bila ada yang gagal, build berhenti.

| File di `tests/` | Yang dijaga |
|---|---|
| `calc.test.js` | Format rupiah, status 80%/100% (`statusOf`), `monthData` (saldo, rasio tabungan, "terpakai"), `yearData`, `highlights`, pengeluaran per kategori, isolasi antar buku kas |
| `csv.test.js` | Parser CSV (koma/titik koma, kutip, baris baru), `parseNom`, `normJenis`, `normDate` (termasuk menolak tanggal mustahil) |
| `migrations.test.js` | DB kosong → versi terbaru; **dari DB lama (v1.7.0, user_version 0)**: kategori kembar digabung, `category_id` terisi, tidak ada baris hilang; migrasi gagal = dibatalkan total; DB dari app yang lebih baru tidak disentuh; `initDb` tidak mengisi ulang data contoh |
| `db.test.js` | Transaksi bersarang & rollback, kategori (tambah/ganti nama/hapus), buku kas (tambah/salin/hapus), saldo |
| `backup.test.js` | **Backup → Pulihkan = data persis sama** (termasuk berulang + log, transaksi yatim, nominal 0, buku aktif); Gabung tidak menggandakan; file rusak/versi lebih baru ditolak sebelum menyentuh data; **import yang gagal di tengah tidak merusak data lama**; backup otomatis gagal = import dibatalkan; CSV roundtrip; retensi 10 backup otomatis |
| `recurring.test.js` | Tanggal jatuh tempo (29–31, kabisat), pencatatan otomatis tidak pernah ganda, mengejar bulan terlewat (maks. 60), skip, atomik, `pendingList`, ambang 80%/100% |
| `reminders.test.js` | Jadwal notifikasi (H-n, hari-H, H+2, pukul 09.00), masking nominal, batas 60 |
| `googleAuth.test.js` | Web Client ID diisi di aplikasi (validasi format, dibersihkan, ID baru langsung dipakai, sesi lama diputus saat ID berganti, bertahan setelah keluar akun), izin Drive interaktif vs senyap, `resetAllData` |
| `driveSync.test.js` | Sinkron otomatis (hanya saat berubah, tidak mengunggah data kosong, batas harian, gagal/pulih), alur masuk (Drive kosong / HP kosong / dua-duanya berisi / dibatalkan / file rusak), keluar akun, dan alur lengkap masuk → catat → keluar → masuk lagi = data kembali |
| `errorBoundary.test.js` | ErrorBoundary merender komponen sungguhan: menangkap error, "Coba lagi", reset otomatis saat ganti tab/bulan/buku, bersarang, tombol cadangan |

**Cara kerjanya.** `expo-sqlite` diganti (lewat `moduleNameMapper` di `package.json`) oleh `tests/helpers/expo-sqlite.js` yang menjalankan **SQLite asli** (sql.js, WASM, tanpa modul native), jadi SQL di `lib/*.js` benar-benar dieksekusi, bukan di-mock. Modul native lain (file system, share, document picker) diganti versi di memori. Tidak ada file di folder aplikasi (`lib/`, `screens/`, dst.) yang diubah demi pengujian.

**Aturan saat menambah fitur**
- Mengubah skema → tambah **satu fungsi baru di akhir `MIGRATIONS`** (jangan ubah yang lama) **dan** tambah tes di `migrations.test.js` yang membangun DB versi sebelumnya lalu memeriksa datanya selamat.
- Menambah kolom/tabel yang perlu dibackup → perbarui `bookPayload` & `applySnapshot` di `lib/backup.js`, lalu tambahkan datanya ke `seedData()` di `backup.test.js` supaya tes "Backup → Pulihkan = sama" ikut menjaganya. Bila format file berubah tak-kompatibel, naikkan `SNAPSHOT_VERSION`.
- Mengubah rumus → ubah/tambah tes di `calc.test.js` lebih dulu.

### ErrorBoundary
- `components/ErrorBoundary.js` menangkap kesalahan **saat render** dan menampilkan layar pengganti (pesan kesalahan, *Coba lagi*, dan *Simpan cadangan data* yang membagikan backup JSON semua buku kas).
- Dipasang berlapis di `App.js`: tiap tab (menu dan pemilih buku tetap hidup; pindah tab/bulan/buku otomatis mencoba render ulang), form transaksi, Transaksi Berulang, Profil, panel Buku Kas (tombol *Tutup*), dan lapisan terluar.
- **Database gagal dibuka/dimigrasi saat aplikasi start** tidak lagi berujung layar putih: aplikasi menampilkan layar "Database tidak dapat dibuka" beserta pesan error. Migrasi berjalan dalam transaksi, jadi data lama tetap utuh.
- Keterbatasan: error boundary **tidak** menangkap error di event handler atau proses async (mis. tombol yang gagal menyimpan); itu tetap ditangani `try/catch` di tempatnya. Kegagalan membuka file database pada saat modul dimuat (sebelum React jalan) tidak bisa ditangkap dari JS.

### Bug yang ditemukan tes dan sudah diperbaiki
- **Import menerima tanggal mustahil** (mis. `2026-02-30`, `31/04/2026`, bulan 13): kini baris itu dilewati dan dihitung sebagai "dilewati". (`normDate` di `lib/csv.js`)
- **Pembulatan format ringkas `rpk`:** `999.999` tampil "Rp 1000 rb" dan `999.999.999` "Rp 1000 jt"; kini "Rp 1 jt" dan "Rp 1 M". (`lib/calc.js`)
- **`rp(-0.4)` tampil "-Rp 0"**; kini "Rp 0". (`lib/calc.js`)
- **File backup dari aplikasi yang lebih baru** kini ditolak dengan pesan jelas (sebelumnya "Ganti Semua" bisa membuang data yang belum dikenali versi ini). Format file mendapat konstanta `SNAPSHOT_VERSION`. (`lib/backup.js`)

### Catatan perilaku yang perlu Anda putuskan (tidak diubah)
- **Transaksi tanpa kategori ("yatim")** tidak ikut saldo/angka di Dashboard (`monthData` menghitung dari kategori), tetapi ikut di ringkasan tahunan dan grafik Pengeluaran (`yearData`, `expenseYear`). Akibatnya total bulan yang sama bisa berbeda antar layar bila ada transaksi yatim. Sudah ada tes yang mengunci perilaku saat ini; bila ingin disamakan, ubah `monthData` dan perbarui tesnya.
- Backup **CSV** tidak punya konsep transaksi yatim: transaksi berkategori yang tidak ada akan membuat kategori itu (anggaran 0) saat diimpor.

## v1.13.0 — Aplikasi kosong, sinkron Google Drive, Web Client ID di dalam aplikasi
**1. Dimulai kosong.** Pemasangan baru tidak lagi berisi data contoh Excel: satu buku kas "Buku Kas Utama" tanpa kategori dan transaksi. Kategori dipilih dari *📚 Master* di tab Anggaran atau diketik sendiri. Pemasangan lama yang di-update tidak berubah datanya. Tombol *Reset / Import Data Awal Excel* diganti **🗑 Kosongkan Buku Kas Ini** (data awal itu data pribadi, jadi tidak ada lagi yang perlu dipulihkan); backup otomatis tetap dibuat lebih dulu.

**2. Akun Google terhubung dengan Google Drive.** Alur:
- **Masuk** → izin Google Drive diminta sekali → aplikasi menyamakan HP dengan Drive: Drive kosong + HP kosong = tidak ada apa-apa; Drive kosong + HP berisi = data HP diunggah; **HP kosong + Drive berisi = data dipulihkan otomatis**; keduanya berisi = dialog *Gabungkan / Pakai Drive / Pakai HP* (ketuk di luar kotak = batal, akun tidak jadi terhubung).
- **Sinkron otomatis**: ±45 detik setelah data terakhir berubah, dan saat aplikasi ke latar belakang, isi data diunggah ke SATU file `BudgetPlanner_Sinkron_Otomatis.json` di Drive (ditimpa di tempat; 1 panggilan API per sinkron). Hanya bila isi benar-benar berubah, tidak pernah mengunggah data kosong, dan maksimal 60 sinkron otomatis per hari (sisa kuota ±100 panggilan untuk cadangan manual). Status & tombol *☁ Sinkronkan sekarang* ada di Profil.
- **Keluar** → perubahan terakhir diunggah dulu → **semua data di HP dikosongkan** (buku kas, kategori, transaksi, transaksi berulang, profil, salinan otomatis di HP). Masuk lagi dengan akun yang sama = data kembali dari Drive. Bila unggah terakhir gagal, ada peringatan; jika tetap keluar, salinan pengaman disimpan di HP.
- Cadangan manual bertanggal (*Cadangkan ke Google Drive*) tetap ada, dan daftar *Pulihkan* kini menampilkan file sinkron otomatis maupun cadangan manual.

**3. Google Web Client ID diisi di aplikasi.** Layar sambutan dan Profil › *Pengaturan Google* punya tombol untuk menempel Web Client ID (divalidasi formatnya; spasi/kutip hasil salin-tempel dibersihkan). Tersimpan di HP (`meta cfg.webClientId`) dan **tidak ikut terhapus saat keluar akun**. Bila ID dicabut: buat yang baru di Google Cloud Console, tempel di Profil; sesi Google lama diputus otomatis, lalu ketuk **Hubungkan ulang** (akun harus sama; data HP tidak dihapus). `GOOGLE_WEB_CLIENT_ID` di `lib/config.js` hanya cadangan bila kolom di aplikasi kosong.

**Catatan penting**
- Scope `drive.file` hanya melihat file yang dibuat oleh **project Google Cloud yang sama**. Saat mengganti Web Client ID, buat client baru di project yang sama bila cadangan lama harus tetap terbaca. Bila project baru, cadangan lama di Drive tidak terlihat; data di HP tetap ada dan akan diunggah ulang ke file baru.
- Ini sinkron satu arah per perangkat (HP → Drive, ditimpa terakhir menang), bukan penggabungan dua arah otomatis. Memakai dua HP sekaligus dengan akun yang sama: yang terakhir menyimpan menang. Riwayat versi file masih bisa dilihat di Drive (Kelola versi) dan cadangan manual tidak ditimpa.
- Tidak ada modul native baru; build lama yang sudah memuat Google Sign-In (v1.9.0+) cukup di-update. Tidak ada migrasi skema baru.
- Tes baru: `googleAuth.test.js`, `driveSync.test.js` (lihat tabel di atas).

