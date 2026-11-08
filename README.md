# Monthly Budget Planner (Android, offline)
1. Buat repo baru di GitHub, unggah seluruh isi folder ini (termasuk folder .github), branch `main`.
2. Buka tab **Actions** > **Build APK** (jalan otomatis saat push, atau klik *Run workflow*).
3. Setelah hijau (±10 menit), unduh artifact **budget-planner-apk** > ekstrak > `app-release.apk` > instal di HP.
Uji lokal: `npm install && npx expo start`.

## Backup & Restore (v1.1.0)
Menu **Pengaturan** > Backup & Restore Data: Export Backup (CSV), Import dari File CSV (Gabung / Ganti Semua), Download Template Import.
Format CSV: `Tipe,Tanggal,Jenis,Kategori,Nominal,Keterangan`. Tipe = KATEGORI (Nominal = anggaran bulanan) atau TRANSAKSI. Baris bertipe lain (mis. CONTOH) diabaikan.
Pengembangan lokal tanpa Android Studio: `npm install && npx expo start`, lalu scan QR dengan Expo Go (SDK 52).
