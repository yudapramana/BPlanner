# Panduan Mengaktifkan Login Google (diperbarui v1.13.0)

Login Google di aplikasi ini **opsional**. Setelah masuk, data disinkronkan ke Google Drive Anda (lihat PANDUAN_GOOGLE_DRIVE.md).
Sebelum langkah di bawah dikerjakan, aplikasi tetap berjalan normal dalam mode "tanpa akun".

Yang dibutuhkan: akun Google dan akses ke https://console.cloud.google.com (gratis).
Tampilan konsol Google bisa berubah; nama menu di bawah bisa sedikit berbeda.

## 1. Buat project
1. Buka Google Cloud Console, klik pemilih project di atas, lalu **New Project** (nama bebas, mis. "Budget Planner").

## 2. Layar persetujuan OAuth (OAuth consent screen)
1. Menu **APIs & Services → OAuth consent screen** (atau **Google Auth Platform**).
2. Jenis pengguna: **External**. Isi nama aplikasi, email dukungan, dan email developer.
3. Pada **Audience / Test users**, biarkan status **Testing**, lalu **tambahkan email Gmail yang akan dipakai login** sebagai Test user.
   (Selama status Testing, hanya email yang terdaftar yang bisa masuk. Batas 100 test user, cukup untuk pemakaian pribadi.)

## 3. Buat OAuth client jenis **Web application**
1. **Credentials → Create credentials → OAuth client ID → Application type: Web application**.
2. Klik Create. Salin **Client ID** (berakhiran `.apps.googleusercontent.com`).
3. **Tempel langsung di aplikasi** (tidak perlu mengubah kode atau build ulang): di layar sambutan ketuk *Google Web Client ID*, atau buka **Profil → Pengaturan Google → Isi / Ubah Web Client ID**, tempel, lalu *Simpan*.
   Nilai ini tersimpan di HP dan tidak terhapus saat keluar akun.

### Bila Web Client ID dicabut / ingin diganti (masa testing)
1. Buat OAuth client **Web application** baru di project yang **sama** (supaya cadangan lama di Drive tetap terbaca), atau project baru bila memang perlu.
2. Di aplikasi: **Profil → Pengaturan Google → Ubah Web Client ID** → tempel yang baru → Simpan.
3. Sesi Google lama diputus otomatis. Ketuk **Hubungkan ulang** di Profil (pilih akun yang sama). Data di HP tidak dihapus; aplikasi menyamakannya dengan Drive.
4. Client **Android** (langkah 4) harus ada di project yang sama dengan Web Client ID yang baru. Bila project berbeda, buat lagi client Android di project baru itu dengan package name dan SHA-1 yang sama, dan aktifkan Google Drive API serta tambahkan email Anda sebagai Test user di project tersebut.
5. Project baru tidak bisa melihat file Drive yang dibuat project lama (scope `drive.file`). Data di HP tetap ada dan diunggah ulang ke file baru.

## 4. Buat OAuth client jenis **Android**
1. **Credentials → Create credentials → OAuth client ID → Application type: Android**.
2. **Package name**: `com.yuda.budgetplanner`
3. **SHA-1 certificate fingerprint**:
   ```
   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
   ```
   Ini sidik jari keystore debug bawaan template Expo, yang dipakai oleh build GitHub Actions maupun `npx expo run:android`.
   Cara memastikan di komputer Anda (setelah folder `android` terbentuk):
   ```
   cd android
   keytool -list -v -keystore app\debug.keystore -alias androiddebugkey -storepass android
   ```
   Bila hasilnya berbeda, pakai nilai SHA1 dari perintah itu. Bila kelak memakai keystore rilis sendiri, tambahkan satu OAuth client Android lagi dengan SHA-1 keystore tersebut.
4. Client Android ini tidak perlu disalin ke kode; cukup ada di project yang sama dengan client Web.

## 5. Build ulang (wajib)
Login Google memakai modul native baru, jadi perubahan ini tidak cukup lewat reload.
- Lewat GitHub: push seluruh isi folder, tunggu Actions selesai, lalu pasang APK baru di atas aplikasi lama.
- Lewat laptop: `npm install` lalu `npx expo run:android`.
Setelah membuat client di Google, perubahan kadang butuh beberapa menit sebelum berlaku.

## 6. Coba
Buka aplikasi, ketuk **Daftar / Masuk dengan Google** di layar sambutan, atau ikon profil di kanan atas.
Pendaftaran terjadi otomatis saat pertama kali masuk.

## Masalah yang sering muncul
| Gejala | Penyebab / solusi |
|---|---|
| "Google Web Client ID belum diisi" | Isi lewat Profil → Pengaturan Google (atau tombol di layar sambutan) |
| "Fitur login Google belum ada di build ini" | Aplikasi belum dibuild ulang setelah update, atau dijalankan lewat Expo Go (tidak didukung) |
| Error `DEVELOPER_ERROR` / kode 10 / 12500 (atau "Sesi Google terputus") | Package name atau SHA-1 pada client Android salah, client Web yang dipakai bukan jenis *Web application*, atau perubahan belum aktif (tunggu 5-10 menit) |
| "Access blocked / app has not completed verification" | Email belum ditambahkan sebagai Test user (langkah 2) |
| Peringatan "Google hasn't verified this app" | Normal pada status Testing; pilih *Continue* |
| Foto profil tidak muncul | HP sedang offline; aplikasi menampilkan inisial nama sebagai gantinya |

## Yang disimpan dan yang tidak
- Disimpan di HP (tabel `meta`): nama, email, URL foto, ID Google, tanggal bergabung, dan Web Client ID (`cfg.webClientId`).
- **Tidak** disimpan: kata sandi, token akses/ID.
- Data keuangan tidak dikirim ke Google maupun server mana pun.
- Login **tidak mengenkripsi** dan **tidak mengunci** data di HP.
- Sejak v1.13.0 data otomatis disinkronkan ke Google Drive Anda sendiri setelah masuk, dan **dikosongkan dari HP saat keluar akun**.
