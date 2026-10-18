# DaikanTL Desktop

Aplikasi desktop lokal untuk menerjemahkan halaman manga Jepang ke Bahasa Indonesia.
UI dibuat dengan Vue 3 + Vite dan dibungkus sebagai aplikasi Windows memakai Tauri v2.
Visualnya mengambil inspirasi dari workflow Koharu: gelap, fokus ke kanvas, dan panel
alat yang ringkas.

## Prinsip aplikasi

- Gambar manga diproses di laptop, tanpa database dan tanpa sinkronisasi cloud.
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

## Status saat ini

Fondasi UI, upload gambar, preview, pengaturan Gemini BYOK, dan konfigurasi Tauri
sudah tersedia. Tahap berikutnya adalah memasukkan model deteksi Koharu/ogkalu,
manga-OCR, penerjemahan teks saja, serta typesetting dan export PNG.
