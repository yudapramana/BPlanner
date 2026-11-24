# Persiapan Google Play Store

Panduan isian Play Console untuk **Monthly Budget Planner** (`com.yuda.budgetplanner`). Halaman publik ada di folder `docs/` dan dipasang lewat GitHub Pages.

## 1. Aktifkan GitHub Pages (sekali saja)
GitHub › repo **BPlanner** › Settings › Pages › *Build and deployment*: Source **Deploy from a branch**, Branch **master**, folder **/docs** › Save. Setelah ±1 menit:

| Halaman | URL | Dipakai di Play Console |
|---|---|---|
| Kebijakan Privasi | https://yudapramana.github.io/BPlanner/privasi.html | App content › Privacy policy; juga tautan di Profil aplikasi |
| Hapus akun & data | https://yudapramana.github.io/BPlanner/hapus-akun.html | Data safety › Data deletion › "Delete account URL" |
| Beranda | https://yudapramana.github.io/BPlanner/ | Store listing › Website (opsional) |

Repo harus tetap **publik** agar Pages gratis bisa dibuka.

## 2. Data safety (App content › Data safety)
Dasar jawaban: aplikasi tidak punya server; data hanya keluar HP ke **Google Drive milik pengguna** (opsional, HTTPS, scope `drive.file`) dan lewat menu Bagikan yang dipilih pengguna. Tidak ada iklan, analitik, atau SDK pelacak. Android Auto Backup dimatikan (`allowBackup: false`).

| Pertanyaan | Jawaban |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** (unggahan ke Drive pengguna dihitung "collected" karena data keluar dari HP) |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes**: di aplikasi (Profil › Hapus akun & semua data) dan URL halaman hapus akun |
| Account creation | "My app allows users to create an account": **OAuth / Sign in with Google**. Delete account URL: halaman hapus akun di atas |

Jenis data yang dicentang:

| Kategori › jenis | Collected | Shared | Ephemeral | Wajib / opsional | Tujuan |
|---|---|---|---|---|---|
| Financial info › **Other financial info** (transaksi, anggaran, kategori) | Ya | Tidak | Tidak | **Opsional** (hanya bila masuk Google) | App functionality |
| Personal info › **Name**, **Email address** | Ya* | Tidak | Tidak | Opsional | Account management |

\* Nama dan email tidak ikut dalam file Drive (hanya disimpan di HP setelah login Google). Mencentangnya adalah pilihan aman karena aplikasi menerima keduanya dari Google Sign-In; bila Anda tidak mencentangnya, pastikan kebijakan privasi tetap sesuai.

Tidak dicentang: lokasi, kontak, foto/video, file & dokumen, pesan, aktivitas aplikasi, diagnostik, ID perangkat. Laporan error hanya dibagikan manual oleh pengguna lewat menu Bagikan, tidak dikirim ke pengembang secara otomatis.

## 3. App content lainnya
| Bagian | Isian |
|---|---|
| Ads | **No, my app does not contain ads** |
| App access | **All functionality is available without special access** (login Google opsional; tanpa akun aplikasi tetap penuh). Bila reviewer tetap meminta, jelaskan bahwa login memakai akun Google mana pun |
| Content rating | Kuesioner IARC: kategori *Utility / Productivity*, jawab "No" untuk semua konten sensitif → biasanya **Rated for 3+ / Everyone** |
| Target audience | **18+** (atau 13+). Jangan pilih usia di bawah 13 agar tidak masuk aturan Families |
| News app | No |
| Government app | No |
| Financial features | Pilih **"My app doesn't provide any financial features"** bila tersedia opsi pencatat anggaran pribadi tanpa transaksi uang sungguhan; aplikasi tidak memindahkan uang, tidak memberi pinjaman, dan tidak terhubung ke bank |
| Health | Tidak ada |

## 4. Store listing
**Nama aplikasi** (≤ 30): `Monthly Budget Planner`

**Deskripsi singkat** (≤ 80):
`Catat pemasukan & pengeluaran, atur anggaran bulanan, dan pengingat tagihan.`

**Deskripsi lengkap** (≤ 4000):
```
Monthly Budget Planner membantu Anda mengatur uang bulanan tanpa ribet. Data tersimpan di HP Anda sendiri, tanpa iklan.

FITUR UTAMA
• Catat pemasukan dan pengeluaran per kategori dalam hitungan detik
• Anggaran bulanan per kategori: Biaya, Tagihan, Pinjaman, Investasi/Tabungan, Pendapatan
• Dashboard: sisa anggaran, persentase terpakai, dan peringatan saat mendekati batas
• Transaksi berulang (cicilan, kos, internet, SPP) dengan pengingat jatuh tempo
• Banyak buku kas: pribadi, keluarga, usaha, tabungan
• Master kategori siap pakai, tidak perlu mengetik dari awal

AMAN & PRIBADI
• Data disimpan di HP, tidak ada server pengembang
• Kunci aplikasi dengan sidik jari / kunci layar
• Tangkapan layar diblokir saat kunci aplikasi aktif

CADANGAN & PINDAH HP
• Masuk dengan Google (opsional): sinkron otomatis ke Google Drive Anda sendiri, bisa dipakai di beberapa HP
• Export CSV, JSON, dan Excel (.xlsx); Import dari CSV/JSON
• Hapus akun dan semua data kapan saja dari aplikasi

Gratis, tanpa iklan, tanpa langganan.
```

**Grafis yang wajib** (lihat juga bagian 5):
| Aset | Ukuran | Sumber |
|---|---|---|
| Ikon aplikasi | 512 × 512 PNG | `store/grafis/icon-512.png` (dikecilkan dari `assets/icon.png`) |
| Feature graphic | 1024 × 500 PNG/JPG | `store/grafis/feature-graphic-1024x500.png` |
| Screenshot HP | minimal 2, disarankan 4–8; sisi 320–3840 px, rasio maks 2:1 | Lihat bagian 5 |

Kontak developer (Store settings › Store listing contact details): email **pramanayuda772@gmail.com**, website https://yudapramana.github.io/BPlanner/.

Kategori: **Finance**. Tag: budget, pengeluaran, keuangan pribadi.

## 5. Screenshot tanpa data pribadi
Jangan memakai buku kas asli (nama kategori, nominal, dan catatan terlihat publik).
1. Matikan sementara Kunci aplikasi (tangkapan layar diblokir saat kunci aktif).
2. Buat buku kas baru bernama mis. **Contoh**, isi ±8 kategori dan ±15 transaksi rekaan.
3. Ambil tangkapan layar: Dashboard, daftar Transaksi, form tambah transaksi, tab Anggaran (kelompok terbuka), lembar edit kategori, Transaksi Berulang, halaman Data & Cadangan.
4. Hapus buku kas Contoh, lalu nyalakan lagi Kunci aplikasi.

## 6. Rilis & penandatanganan
- Unggah file **`.aab`** dari GitHub Release (`budget-planner-vX.Y.Z.aab`), bukan APK.
- Saat pertama mengunggah, pilih **Play App Signing** (bawaan). Keystore `release.keystore` menjadi **upload key**; Google menandatangani ulang aplikasi dengan kunci miliknya.
- **Penting untuk login Google:** setelah Play App Signing aktif, buka Play Console › Test and release › App integrity › *App signing key certificate*, salin **SHA-1**, lalu buat OAuth client Android baru (package `com.yuda.budgetplanner` + SHA-1 itu) di project Google Cloud yang sama dengan Web Client ID. Tanpa ini login dari versi Play Store gagal dengan kode 10. Lihat tabel SHA-1 di README.
- Layar persetujuan OAuth (Google Cloud › OAuth consent screen) perlu status **In production**. Scope `drive.file` termasuk *non-sensitive*, jadi biasanya tidak perlu verifikasi Google, tetapi isi URL Kebijakan Privasi dan domain beranda di sana.
- Akun developer **pribadi** yang baru dibuat wajib menjalankan **closed testing** dengan sejumlah penguji (saat ini 12 orang selama 14 hari) sebelum boleh rilis ke Production. Cek angka terbaru di Play Console › Dashboard.
- Setiap rilis: naikkan `version` dan `versionCode` (Play menolak versionCode yang sama), lalu push tag (lihat README › *Rilis versi baru*).

## 7. Daftar periksa
- [ ] GitHub Pages aktif, kedua URL terbuka di HP
- [ ] Privacy policy URL diisi (App content + OAuth consent screen)
- [ ] Data safety diisi sesuai bagian 2
- [ ] Ads, App access, Content rating, Target audience, Financial features
- [ ] Store listing: nama, deskripsi singkat & lengkap, ikon 512, feature graphic, ≥ 2 screenshot
- [ ] AAB diunggah ke Closed testing; penguji diundang
- [ ] SHA-1 *App signing key* Play didaftarkan di Google Cloud; login Google dites dari versi Play
- [ ] Setelah masa closed testing: ajukan akses Production
