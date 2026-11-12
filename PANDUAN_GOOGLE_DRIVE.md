# Panduan Google Drive: Sinkron Otomatis & Cadangan Manual (diperbarui v1.13.0)

Fitur: **Pengaturan → Cadangan Google Drive** → *Cadangkan ke Google Drive* dan *Pulihkan dari Google Drive*.
Yang dicadangkan: **semua buku kas** (kategori, anggaran, transaksi) dalam satu file JSON, format yang sama dengan
"Export Backup Semua Buku". Syarat: sudah masuk dengan Google (lihat PANDUAN_GOOGLE_LOGIN.md).

## 0. Sinkron otomatis (v1.13.0)
Setelah masuk dengan Google, izin Drive diminta sekali dan data otomatis disinkronkan ke satu file `BudgetPlanner_Sinkron_Otomatis.json`
(ditimpa di tempat) sekitar 45 detik setelah perubahan terakhir dan saat aplikasi ditutup. Detail dan status ada di Profil.
- Masuk di HP kosong = data dipulihkan dari Drive. Keluar akun = perubahan terakhir diunggah lalu data di HP dikosongkan.
- Maksimal 60 sinkron otomatis per hari; tiap sinkron = 1 panggilan Drive API (2-3 bila id file belum diketahui).
- Tidak pernah mengunggah data kosong secara otomatis.
- Tombol Cadangkan/Pulihkan di bawah tetap ada untuk cadangan manual bertanggal.

Versi ini hanya mengubah kode JavaScript. Bila HP Anda sudah memakai build v1.9.0 (yang memuat modul login Google),
**tidak perlu build ulang**: timpa file lalu reload.

## 1. Aktifkan Google Drive API (wajib, sekali saja)
1. Google Cloud Console → pilih project yang sama dengan login Google.
2. **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
Tanpa langkah ini, aplikasi menampilkan pesan "Google Drive API belum diaktifkan" (kode 403).
Setelah diaktifkan, kadang perlu 1-2 menit sebelum berlaku.

## 2. Tambahkan scope
**OAuth consent screen / Google Auth Platform → Data Access → Add or remove scopes** → centang
`.../auth/drive.file` (*See, edit, create, and delete only the specific Google Drive files you use with this app*).
Scope ini non-sensitif: aplikasi hanya melihat file yang ia buat sendiri, bukan seluruh isi Drive Anda.

## 3. Status publikasi
- **Testing** (bawaan): izin untuk scope selain profil dasar bisa kedaluwarsa tiap 7 hari, jadi sesekali
  jendela izin Google muncul lagi saat Cadangkan/Pulihkan. Tidak berbahaya; pilih Izinkan.
- **In production**: izin tidak cepat kedaluwarsa. Untuk scope non-sensitif cukup verifikasi dasar menurut dokumentasi Google;
  persyaratan rincinya (mis. halaman kebijakan privasi) belum saya pastikan, jadi cek di konsol.
  Untuk pemakaian pribadi, tetap di Testing juga tidak masalah.

## 4. Cara memakai
1. Masuk dengan Google (ikon profil kanan atas) bila belum.
2. **Pengaturan → Cadangkan ke Google Drive**. Pertama kali, jendela izin Google Drive muncul: pilih **Izinkan**.
3. Pulihkan di HP lain/pasang ulang: masuk dengan **akun Google yang sama** → **Pulihkan dari Google Drive** → pilih cadangan →
   pilih **Gabung** atau **Ganti Semua**. Sebelum menimpa data, salinan data lama dibuat otomatis (fitur yang sudah ada).

## 5. Aturan penyimpanan
- Setiap cadangan = file baru `BudgetPlanner_Backup_TAHUN-BLN-TGL_JAMMENITDETIK.json` di **My Drive**.
- **10 cadangan terbaru** disimpan; yang lebih lama dipindah ke **Sampah** Drive (bisa dipulihkan dalam masa retensi sampah Google).
- Boleh memindahkan file ke folder lain. Jangan menghapus/membuang ke sampah bila masih ingin memulihkannya lewat aplikasi.
- Aplikasi hanya melihat file buatannya sendiri (scope `drive.file`). File yang Anda unggah manual tidak muncul di daftar.
  Pemulihan di HP baru hanya berhasil dengan **project Google Cloud yang sama** (Web Client ID dari project itu, diisi di Profil → Pengaturan Google) dan akun yang sama.

## 6. Pemakaian API
| Aksi | Panggilan Drive API |
|---|---|
| Cadangkan | 2 (unggah + daftar untuk merapikan) + 1 per file lama yang dibuang |
| Pulihkan | 2 (daftar + unduh) |
Sinkron otomatis: 1 panggilan per sinkron (maks. 60/hari). Cadangan manual dan Pulihkan hanya terjadi saat Anda menekan tombol. Saat masuk: 1 panggilan daftar + 1 unduh bila ada data di Drive.

## 7. Masalah yang sering muncul
| Pesan | Penyebab / solusi |
|---|---|
| Google Drive API belum diaktifkan | Langkah 1 belum dilakukan atau belum berlaku (tunggu 1-2 menit) |
| Izin Google Drive tidak diberikan | Jendela izin ditutup/ditolak; coba lagi dan pilih Izinkan |
| Sesi Google tidak ditemukan / terputus | Buka Profil → Hubungkan ulang (Web Client ID diganti atau dicabut) |
| Tidak ada koneksi internet / terlalu lama | Periksa koneksi, coba lagi |
| Penyimpanan Google Drive penuh | Kosongkan ruang di Drive |
| Daftar cadangan kosong di HP baru | Akun Google berbeda, atau Web Client ID/project berbeda dari HP lama |

## 8. Keamanan dan batasan
- File cadangan **tidak dienkripsi**; terlindungi oleh keamanan akun Google Anda. Aktifkan verifikasi 2 langkah dan jangan bagikan file.
- Sinkron otomatis bersifat satu arah per perangkat (HP → Drive, yang terakhir menyimpan menang), **bukan penggabungan dua arah** antar HP. Jangan mengedit di dua HP sekaligus dengan akun yang sama.
- Modul login yang dipakai membungkus API lama Google Sign-In untuk Android. Google menyatakan API itu deprecated dan akan dihapus
  dari Play Services Auth di rilis mendatang. Saat itu terjadi, login dan izin Drive perlu dimigrasi bersama (ke Credential Manager + AuthorizationClient).
