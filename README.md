# PriesstessTL Desktop

Aplikasi desktop lokal untuk menerjemahkan halaman manga Jepang ke Bahasa Indonesia.
UI dibuat dengan Vue 3 + Vite dan dibungkus sebagai aplikasi Windows memakai Tauri v2.
Visualnya mengambil inspirasi dari workflow Koharu: gelap, fokus ke kanvas, dan panel
alat yang ringkas.

## Prinsip aplikasi

- Deteksi posisi bubble dilakukan lokal di laptop menggunakan Koharu YOLO.
- Hanya crop bubble kecil yang dikirim ke Gemini Vision untuk membaca dan menerjemahkan teks.
- Gemini memakai **BYOK (Bring Your Own Key)**: pengguna memasukkan API key sendiri.
- API key hanya disimpan di `localStorage` aplikasi pada perangkat pengguna.
- Tidak ada API key milik pembuat yang ditanamkan di dalam installer.

## Menjalankan saat pengembangan

```powershell
npm install
npm run tauri dev
```

## Membuat installer Windows

```powershell
npm run tauri build
```

Installer akan dibuat di:

```text
src-tauri/target/release/bundle/
```

## Alur terjemahan

1. Klik **Detect** untuk menjalankan deteksi bubble lokal.
2. Setiap bubble di-crop menjadi JPEG kecil.
3. Crop dikirim berurutan ke Gemini Vision bersama API key milik pengguna.
4. Gemini mengembalikan teks Jepang dan terjemahan Indonesia dalam JSON.
5. Original dan preview terjemahan diperbarui langsung per bubble.

## Status saat ini

Fondasi UI, upload gambar, preview, pengaturan Gemini BYOK, dan konfigurasi Tauri
sudah tersedia, termasuk deteksi Koharu lokal, Gemini Vision crop translation,
typesetting, multi-page workflow, dan export PNG/JPEG/WebP.
