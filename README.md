# Monthly Budget Planner (Android) v1.15.1 — Expo SDK 58

## Struktur
- `App.js` — navigasi bawah + state bulan/tahun; menjalankan pencatatan otomatis & penjadwalan pengingat (`refreshRecurring`)
- `screens/` — DashboardScreen (angka bisa disembunyikan lewat ikon mata), TransaksiScreen (daftar transaksi), ExpensesScreen (bar chart 12 bulan + donat per kategori), PengaturanScreen (tab "Anggaran") (kategori + backup), TransaksiFormScreen, BerulangScreen (daftar & form transaksi berulang + pengaturan pengingat)
- `components/` — ui.js (Card, Btn, Chips, Prog, Section, MonthPicker pil ringkas), BarChart.js, Donut.js, EyeIcon.js, DateField.js (date picker), MasterSheet.js (pilih kategori dari master), BookSheet.js (Buku Kas), ErrorBoundary.js (pelindung kesalahan layar + layar pengganti), LockScreen.js (layar Kunci aplikasi)
- `lib/` — db.js (SQLite, migrasi bernomor, kategori), seed.js (kategori umum untuk Template Import, anggaran Rp 0; tanpa data pribadi), master.js (master kategori 5 kelompok), calc.js (rumus), csv.js, backup.js (export/import CSV & JSON, backup otomatis), excel.js (.xlsx/CSV), files.js, recurring.js (transaksi berulang), reminders.js (notifikasi pengingat), errors.js (pembantu penanganan error), googleAuth.js / auth.js (login Google), drive.js / driveSync.js (Google Drive: cadangan & sinkron), lock.js (Kunci aplikasi)
- `tests/` — pengujian otomatis (Jest): rumus, CSV, migrasi, backup/import, transaksi berulang, pengingat, ErrorBoundary, dan semua layar. Lihat bagian Pengujian di bawah
- `plugins/withReleaseSigning.js` — config plugin: tanda tangan rilis dari variabel lingkungan (dipakai GitHub Actions)
- `theme.js` — warna & style bersama

## Menjalankan di laptop (tanpa Android Studio)
Butuh Node.js 22 (`node -v`).
    npm install
    npx expo start
Lalu buka dengan Expo Go **versi SDK 58** (scan QR). Jika Expo Go di Play Store belum SDK 58, lihat https://expo.dev/go.
Uji bundling saja: `npx expo export --platform android`.
Jalankan pengujian: `npm test` (lihat bagian Pengujian).

## Build APK
Push ke GitHub (branch main/master) → tab Actions → Build APK → unduh artifact `budget-planner-apk` (APK) atau `budget-planner-aab` (AAB untuk Play Store). Penandatanganan rilis: lihat v1.14.0.

### Login Google: dua SHA-1, dua OAuth client Android
Build lokal dan APK dari GitHub ditandatangani kunci berbeda, jadi Google melihatnya sebagai dua aplikasi. Keduanya perlu OAuth client Android sendiri (package `com.yuda.budgetplanner`) di **project Google Cloud yang sama** dengan Web Client ID. Tanpa itu login gagal dengan kode **10** (DEVELOPER_ERROR).

| Build | Keystore | SHA-1 |
|---|---|---|
| `npx expo run:android` (lokal) | `android/app/debug.keystore` | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| APK/AAB dari GitHub Actions | keystore rilis (secret `KEYSTORE_BASE64`) | `91:00:A7:EB:94:09:63:79:85:DF:CC:D2:C2:6E:F2:1B:C7:70:67:D1` |
| Play Store (bila nanti dipakai) | kunci Play App Signing | lihat Play Console › App integrity |

Cek SHA-1 sebuah APK tanpa kata sandi: `apksigner verify --print-certs app-release.apk` (Android SDK build-tools). Keytool `-printcert -jarfile` tidak bisa membaca APK yang hanya bertanda tangan v2. Perubahan di Google Cloud bisa butuh sampai ±30 menit.

**Cadangkan `release.keystore` beserta kata sandi dan alias-nya di luar laptop** (mis. Drive pribadi + flashdisk). Bila hilang, pembaruan tidak bisa dipasang di atas aplikasi yang sudah terpasang dan SHA-1 berubah.

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
| `migrations.test.js` | DB kosong → versi terbaru; **dari DB lama (v1.7.0, user_version 0)**: kategori kembar digabung, `category_id` terisi, tidak ada baris hilang; migrasi gagal = dibatalkan total; DB dari app yang lebih baru tidak disentuh; `initDb` tidak mengisi ulang data contoh; tidak ada data pribadi di `SEED_CATS` |
| `db.test.js` | Transaksi bersarang & rollback, kategori (tambah/ganti nama/hapus), buku kas (tambah/salin/hapus), saldo |
| `backup.test.js` | **Backup → Pulihkan = data persis sama** (termasuk berulang + log, transaksi yatim, nominal 0, buku aktif); Gabung tidak menggandakan; file rusak/versi lebih baru ditolak sebelum menyentuh data; **import yang gagal di tengah tidak merusak data lama**; backup otomatis gagal = import dibatalkan; CSV roundtrip; retensi 10 backup otomatis |
| `recurring.test.js` | Tanggal jatuh tempo (29–31, kabisat), pencatatan otomatis tidak pernah ganda, mengejar bulan terlewat (maks. 60), skip, atomik, `pendingList`, ambang 80%/100% |
| `reminders.test.js` | Jadwal notifikasi (H-n, hari-H, H+2, pukul 09.00), masking nominal, batas 60 |
| `googleAuth.test.js` | Web Client ID diisi di aplikasi (validasi format, dibersihkan, ID baru langsung dipakai, sesi lama diputus saat ID berganti, bertahan setelah keluar akun), izin Drive interaktif vs senyap, `resetAllData` |
| `driveSync.test.js` | Sinkron otomatis (hanya saat berubah, tidak mengunggah data kosong, batas harian, gagal/pulih), alur masuk (Drive kosong / HP kosong / dua-duanya berisi / dibatalkan / file rusak), keluar akun, dan alur lengkap masuk → catat → keluar → masuk lagi = data kembali. Sejak v1.14.0: revisi data lewat trigger (naik untuk semua jenis perubahan, tidak untuk meta; tanpa snapshot saat cek), perubahan saat unggah tetap tertunda, pemasangan lama, serta konflik Drive diubah HP lain (auto berhenti, pilih Gabung / Pakai Drive / Pakai HP, batal, keluar akun) |
| `driveDelete.test.js` | Hapus akun: semua file aplikasi di Drive dihapus permanen, Drive kosong, 404 dianggap sudah terhapus, error lain dilempar (penghapusan di HP dibatalkan) |
| `lock.test.js` | Kunci aplikasi: pengaturan tersimpan dan tidak terhapus saat keluar akun, ketersediaan kunci layar HP, hasil autentikasi (berhasil/batal/error), penanda sibuk, batas waktu kunci ulang |
| `errorBoundary.test.js` | ErrorBoundary merender komponen sungguhan: menangkap error, "Coba lagi", reset otomatis saat ganti tab/bulan/buku, bersarang, tombol cadangan |
| `screens.test.js` | **Semua layar dirender dan dipakai seperti pengguna** (database sungguhan): Dashboard (saldo, sembunyikan angka), Transaksi (per hari, cari, filter, "Cari di semua waktu", 1.200+ baris), Form (validasi, simpan, tambah lagi, edit, hapus + urungkan, ulangi tiap bulan), Pengeluaran (cakupan Bulan/Tahun/Semua, Kas Emas), Anggaran (tambah/ganti nama/hapus kategori, kosongkan buku), Berulang (tambah, catat sekarang), Profil & Sambutan. Tiruan modul native ada di `tests/helpers/` (`react-native`, `react-native-svg`, safe-area, datetimepicker, expo-constants); pembantu `tests/helpers/screen.js` untuk render, ketuk, isi kolom, dan menjawab Alert |

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
- Ini sinkron satu arah per perangkat (HP → Drive), bukan penggabungan dua arah otomatis. Sejak v1.14.0 penimpaan antar-HP dicegah dengan pemeriksaan sebelum mengunggah (lihat v1.14.0 butir 6); sebelumnya yang terakhir menyimpan menang. Riwayat versi file masih bisa dilihat di Drive (Kelola versi) dan cadangan manual tidak ditimpa.
- Tidak ada modul native baru; build lama yang sudah memuat Google Sign-In (v1.9.0+) cukup di-update. Tidak ada migrasi skema baru.
- Tes baru: `googleAuth.test.js`, `driveSync.test.js` (lihat tabel di atas).

## v1.14.0 — Siap rilis: data bersih, build bertanda tangan, hapus akun, sinkron lebih aman, kunci aplikasi
**1. Tanpa data pribadi di aplikasi.** `lib/seed.js` tidak lagi memuat data contoh: `SEED_TX` dan `seedAll` dihapus; `SEED_CATS` kini berisi kategori umum dari master dengan anggaran Rp 0 (dipakai Template Import), dan `JENIS` memberi urutan 5 kelompok. Tes menjaga agar semua anggaran di `SEED_CATS` tetap 0.

**2. Ikon & splash.** `app.json` memakai `icon`, `adaptiveIcon`, dan splash lewat plugin `expo-splash-screen` (field `splash` tingkat atas lama dihapus). Aset: `assets/icon.png`, `adaptive-icon.png`, `splash.png`. Bila ikon tidak berubah setelah diganti: `npx expo prebuild --platform android --clean`, hapus aplikasi lama dari HP, lalu `npx expo run:android`.

**3. Build rilis bertanda tangan (APK + AAB).**
- `plugins/withReleaseSigning.js` menambahkan `signingConfigs.release` ke `android/app/build.gradle` saat prebuild, membaca `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` dari lingkungan. Tanpa `KEYSTORE_PATH`, build memakai debug keystore (untuk uji lokal; **jangan** diunggah ke Play Store).
- Satu kali: buat keystore (`keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias budgetplanner -keyalg RSA -keysize 2048 -validity 10000`), ubah ke base64, lalu isi 4 Secrets di GitHub (Settings › Secrets and variables › Actions): `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. `*.keystore` dan `*.jks` ada di `.gitignore`.
- **Simpan salinan keystore dan passwordnya di luar repo.** Bila hilang, aplikasi tidak bisa diperbarui di Play Store, dan bila SHA-1 berubah, Login Google gagal.
- Daftarkan SHA-1 keystore di OAuth client Android (Google Cloud). Bila memakai Play App Signing, daftarkan juga SHA-1 *App signing key certificate* dari Play Console.
- Workflow membuat dua artifact: `budget-planner-apk` dan `budget-planner-aab`. Naikkan `android.versionCode` di `app.json` setiap rilis ke Play.

**4. Hapus akun & semua data** (Profil › *Hapus akun & semua data*). Urutan: konfirmasi → semua file aplikasi di Google Drive dihapus **permanen** (`drive.removeAll`, tidak lewat Sampah) → izin aplikasi di akun Google dicabut (`revokeGoogle`) → semua data di HP dikosongkan. Bila penghapusan di Drive gagal (mis. tanpa internet), data di HP **tidak** diubah dan pengguna diminta mencoba lagi. Untuk Play Console (Data Safety), URL penghapusan akun cukup halaman Privacy Policy yang menjelaskan cara ini.

**5. Sinkron lebih efisien.** Migrasi skema **v4** memasang trigger pada tabel `books`, `categories`, `transactions`, `recurring`, `recurring_log` yang menaikkan counter `meta 'data.rev'` pada setiap INSERT/UPDATE/DELETE dari kode mana pun. Pengecekan "ada perubahan?" kini hanya membandingkan dua angka (`data.rev` vs `drive.sync.rev`), tidak lagi menserialisasi seluruh database; snapshot hanya dibuat saat benar-benar mengunggah (sekali, dulu dua kali). Perubahan yang masuk saat unggah berlangsung tetap tercatat tertunda. Pemasangan lama (punya sidik jari lama, belum punya revisi) dibandingkan sekali dengan sidik jari lama lalu beralih ke revisi. Pembaruan dari v1.13.0 tidak mengubah data.

**6. Perlindungan timpa antar-HP.** Sebelum menimpa file sinkron di Drive, aplikasi membaca `modifiedTime`-nya (1 panggilan API tambahan, `drive.info`) dan membandingkannya dengan yang diingat HP ini.
- Beda = file diubah dari perangkat lain: sinkron otomatis berhenti dengan status *konflik* (tidak menimpa apa pun, tidak memakai panggilan API lagi), muncul notifikasi sekali, dan Profil menampilkan peringatan.
- **Sinkronkan sekarang** menampilkan pilihan *Gabungkan* (data HP dan Drive disatukan, transaksi kembar dilewati), *Pakai Drive* (HP diganti isi Drive, salinan pengaman dibuat), atau *Pakai HP* (Drive ditimpa). Ketuk di luar kotak = batal.
- Keluar akun saat konflik diperingatkan lebih dulu, jadi data tidak hilang diam-diam. File sinkron yang dihapus atau dibuang ke Sampah dianggap bukan konflik dan dibuat ulang.
- Keterbatasan: konflik hanya terdeteksi saat HP hendak mengunggah; belum ada pengambilan pembaruan otomatis saat aplikasi dibuka.

**7. Kunci aplikasi** (Profil › Keamanan). Memakai kunci layar milik HP (sidik jari / wajah, atau PIN / pola / kata sandi HP) lewat `expo-local-authentication`; sengaja tidak ada PIN terpisah (tidak ada PIN yang bisa terlupa atau tersimpan di aplikasi, batas percobaan ditangani Android).
- Terkunci saat aplikasi dibuka, dan lagi setelah ditinggalkan ≥ 60 detik (`LOCK_GRACE_MS` di `lib/lock.js`). Saat terkunci, angka disembunyikan lagi dan panel yang terbuka ditutup. Tombol Back saat terkunci menutup aplikasi.
- Sebelum dinyalakan, aplikasi memeriksa HP punya kunci layar dan meminta autentikasi sekali. Bila kunci layar HP dihapus belakangan, kunci aplikasi mati otomatis (agar tidak terkunci selamanya).
- Pengaturan tersimpan di `meta cfg.lock` (tetap ada setelah keluar akun).
- Keterbatasan: siapa pun yang tahu PIN HP bisa membuka aplikasi; pencegahan screenshot dan pratinjau di recent apps tidak ada (butuh kode native).
- Modul native baru: **wajib build ulang** (tidak jalan di build lama). Instalasi: `npx expo install expo-local-authentication`; di `package.json` > `jest.moduleNameMapper` ditambahkan tiruan untuk pengujian.

**Pengujian.** 12 suite, 307 tes; `npx expo export --platform android` berhasil.

**Belum dikerjakan sebelum production.** Mengisi Web Client ID langsung di aplikasi (kolom di layar sambutan/Profil dipertahankan untuk pengembang), OAuth consent screen ke status *In production*, Privacy Policy dan formulir Data Safety, akun Play Console (akun personal baru: closed testing 12 tester selama 14 hari; cek aturan terbaru saat mendaftar).
## Sinkron banyak HP (migrasi database v5)
- Setiap buku kas, kategori, transaksi, dan transaksi berulang punya **uid** (id lintas HP) dan **upd** (waktu ubah terakhir). Baris yang dihapus dicatat di tabel `deleted` (catatan hapus). Semuanya diisi trigger database, jadi kode lain tidak perlu mengisinya.
- **Gabung** (sinkron, Import JSON Gabung): baris dicocokkan lewat uid, lalu versi yang **paling baru diubah** yang dipakai. Yang dihapus di satu HP ikut terhapus di HP lain dan tidak muncul lagi, kecuali diubah di HP lain *setelah* dihapus. Baris tanpa uid (file versi lama) dicocokkan lewat isi seperti sebelumnya.
- **Sinkron otomatis menggabungkan sendiri** bila file Drive berformat baru: tanpa dialog. Aplikasi juga memeriksa perubahan dari HP lain saat dibuka / kembali aktif (paling sering 2 menit sekali). Sebelum menggabung, salinan JSON dibuat di `auto-backup/`. File dari versi aplikasi lama tetap memakai dialog Gabungkan / Pakai Drive / Pakai HP.
- Transaksi hasil transaksi berulang memakai uid tetap per (templat, bulan), sehingga bila dua HP sama-sama mencatatnya hasilnya tetap satu.
- Format file backup tetap versi 1 (kolom `uid`, `upd`, `hapus` hanya tambahan; versi lama mengabaikannya).
- Catatan: "paling baru" memakai jam HP. Catatan hapus disimpan 400 hari.

## v1.15.1 — APK lebih kecil, pesan login lebih jelas
- `plugins/withLeanRelease.js` kini dipasang di `app.json`. Build rilis hanya memuat kode native untuk HP ARM (`armeabi-v7a`, `arm64-v8a`; x86 untuk emulator PC dibuang) dan memakai R8 + shrink resources. Bila ada fitur yang rusak di APK rilis tetapi normal di `npx expo run:android`, hapus baris `"./plugins/withLeanRelease"` dari `app.json` lalu build ulang.
- Pesan error login kode 10 menyebut penyebab yang paling sering: SHA-1 build belum terdaftar (lokal vs GitHub berbeda) dan OAuth client di project yang berbeda. Lihat tabel SHA-1 di bagian *Build APK*.

## Tes layar & pemeriksaan dependensi (setelah v1.15.1)
- `tests/screens.test.js`: 41 tes alur layar (lihat tabel Pengujian). Total 16 suite, 398 tes.
- `npx expo install --check` dan `npx expo-doctor` bersih (expo 58.0.26, expo-file-system 58.0.14, expo-sqlite 58.0.18).
- `npm audit`: `xlsx` 0.18.5 punya celah saat **membaca** file Excel (prototype pollution, ReDoS); aplikasi hanya **menulis** Excel, jadi tidak terdampak. Jangan pakai `xlsx` untuk membaca file dari pengguna tanpa memperbaruinya ke rilis SheetJS dari cdn.sheetjs.com. Temuan `minimatch` lewat `expo` hanya di alat build; "perbaikan" dari npm menurunkan Expo ke 52, jadi diabaikan.

## Tab Anggaran baru + halaman Data & Cadangan
- **Kenapa:** tab Anggaran dulu memuat 2 kolom isian per kategori (±100 kolom). Di HP kelas bawah (Helio P35) menggambar kolom sebanyak itu butuh 600–800 ms per frame setiap kali masuk/keluar tab. Ini kerja thread UI Android, jadi tidak ikut cepat di APK rilis.
- **Sekarang:** kategori tampil sebagai baris teks; 5 kelompok bisa dilipat (yang terbuka diingat di `meta cfg.anggaran.open`, bawaan: Biaya). Ketuk baris membuka `components/CategorySheet.js` (nama, anggaran + tombol cepat, info terpakai bulan yang dilihat & jumlah transaksi, Simpan, Hapus). Tambah kategori memakai lembar yang sama, langsung dengan anggarannya. Menutup lembar dengan perubahan belum disimpan meminta konfirmasi.
- Cadangan Google Drive, backup/import CSV/JSON, Excel, template, backup otomatis, dan Kosongkan Buku Kas pindah ke `screens/DataScreen.js` (kartu "Data & Cadangan" di bawah tab Anggaran).
- `components/TabStack.js`: tab yang pernah dibuka tetap terpasang; tab tersembunyi tidak dirender ulang; tab tampil hanya dirender ulang bila datanya berubah.
- Hasil ukur di HP vivo 1938 (build dev, `dumpsys gfxinfo`, frame terlambat terburuk): masuk/keluar Anggaran 600–800 ms → 133–300 ms.

