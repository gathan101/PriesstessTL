# TEST CASES — DaikanTL (PriesstessTL)

**Jumlah test case:** 40
**Cakupan:** Deteksi & deduplikasi, geometri editor, translation & retry, typesetting, multi-page & export

| Kelompok | ID | Jumlah |
|---|---|---|
| A. Deteksi & Deduplikasi | TC-01 – TC-08 | 8 |
| B. Geometri & Editor | TC-09 – TC-16 | 8 |
| C. Translation, Parsing & Retry | TC-17 – TC-25 | 9 |
| D. Typesetting & Masking | TC-26 – TC-32 | 7 |
| E. Multi-Page, Export & Persistence | TC-33 – TC-40 | 8 |
| **Total** | | **40** |

---

## A. Deteksi & Deduplikasi

| ID | Skenario | Input | Langkah | Hasil yang diharapkan | Status |
|---|---|---|---|---|---|
| **TC-01** | Satu balon + teks di dalamnya | Gambar dengan 1 balon percakapan | Klik **Detect** | Muncul 1 kotak saja dan 1 hasil terjemahan | ✅ |
| **TC-02** | Containment merge | `balloon = [100,100,200,200]`, `dialogue_text = [130,130,140,100]` | Jalankan `mergeNestedRegions()` | 1 region gabungan; `bbox` = balon, `textBbox` = teks dalam | ✅ |
| **TC-03** | NMS kotak beririsan | Dua `balloon` dengan IoU 0.8, skor 0.9 dan 0.6 | Jalankan `nms()` | Hanya kotak skor 0.9 yang tersisa | ✅ |
| **TC-04** | SFX di luar balon | `onomatopoeia_text` di area kosong | Detect | SFX tetap bubble mandiri, tidak digabung | ✅ |
| **TC-05** | Teks narasi tanpa balon | `dialogue_text` di kotak narasi | Detect | Tetap menjadi bubble sendiri | ✅ |
| **TC-06** | Balon kosong | `balloon` tanpa teks | Detect + Translate | Gemini membalas `SKIP`; bubble kosong, tidak error | ✅ |
| **TC-07** | Ambang confidence | Kotak dengan skor 0.20 | Decode YOLO | Kotak dibuang karena `skor < 0.25` | ✅ |
| **TC-08** | Kelas `frame` diabaikan | Kotak kelas 0 (frame panel) | Detect | Tidak muncul sebagai bubble | ✅ |

---

## B. Geometri, Koordinat & Editor

| ID | Skenario | Input | Langkah | Hasil yang diharapkan | Status |
|---|---|---|---|---|---|
| **TC-09** | Konversi letterbox | Gambar 800×1200, kotak model `x=200` | Decode | `ratio = 0.8533`, `dx = 170.67`, hasil ≈ 34.4 px | ✅ |
| **TC-10** | Persentase bbox | Gambar 1000×1500, bbox `[10,10,20,20]` | Simpan lalu export | `x=100px`, `y=150px`, `w=200px`, `h=300px` | ✅ |
| **TC-11** | Clamp batas gambar | Kotak keluar kanvas | Decode | Koordinat dipotong ke `0..width/height` | ✅ |
| **TC-12** | Shape Tool drag | Tekan `A`, drag 150×80 px | Lepas mouse | Bubble dibuat; tidak hilang walau kursor keluar kanvas | ✅ |
| **TC-13** | Ukuran minimum | Drag 3×2 px | Lepas mouse | Bubble tidak dibuat karena `< 1%` | ✅ |
| **TC-14** | Resize 4 sudut | Bubble aktif, drag handle `se` | Drag keluar kanvas | Ukuran bertambah, tetap di dalam 100% | ✅ |
| **TC-15** | Pan & zoom sinkron | Zoom 2×, pan 100 px | Amati kedua panel | Kiri dan kanan bergerak identik | ✅ |
| **TC-16** | Hapus bubble | Bubble nomor 2 dari 4 | Klik hapus | Sisa 3 bubble, ID diurutkan ulang 1–3 | ✅ |

---

## C. Translation, Parsing & Retry

| ID | Skenario | Input | Langkah | Hasil yang diharapkan | Status |
|---|---|---|---|---|---|
| **TC-17** | Response JSON valid | `{"original":"こんにちは","translated":"Halo"}` | Parse | `original` dan `translated` terisi benar | ✅ |
| **TC-18** | Response berkode fence | ` ```json {...} ``` ` | Parse | Code fence dibuang, JSON terbaca | ✅ |
| **TC-19** | Response bukan JSON | `"Halo, apa kabar?"` | Parse | Dianggap `translated`, tidak crash | ✅ |
| **TC-20** | Response `SKIP` | `SKIP` | Parse | Kedua field kosong, bubble tidak diisi | ✅ |
| **TC-21** | Retry 503 | Fetch 503, 503, lalu 200 | Panggil API | Total 3 request, jeda 1s lalu 2s, akhirnya sukses | ✅ |
| **TC-22** | Retry 429 + `Retry-After` | Header `Retry-After: 5` | Panggil API | Menunggu 5 detik, bukan 1 detik | ✅ |
| **TC-23** | Error 400 (API key salah) | Status 400 | Panggil API | Tidak retry, langsung pesan error | ✅ |
| **TC-24** | API key kosong | `apiKey = ""` | Klik Translate | Notice + modal Settings, tanpa request | ✅ |
| **TC-25** | Progres serial | 6 bubble | Klik Translate | Status `1/6 … 6/6`, tidak paralel | ✅ |

---

## D. Typesetting & Masking

| ID | Skenario | Input | Langkah | Hasil yang diharapkan | Status |
|---|---|---|---|---|---|
| **TC-26** | Auto-fit teks panjang | Box 200×120 px, 36 karakter | Render | Font mengecil sampai muat, tidak keluar kotak | ✅ |
| **TC-27** | Word wrap tidak memotong kata | `"AKU UDAH TERBIASA MINUM SENDIRIAN."` | Render | Baris dipotong per kata, bukan per huruf | ✅ |
| **TC-28** | Uppercase otomatis | `"aku sudah biasa"` | Render | Tampil `AKU SUDAH BIASA` | ✅ |
| **TC-29** | Masking oval | Bubble type `bubble` | Export | Area balon ditutup ellipse putih, teks Jepang hilang | ✅ |
| **TC-30** | Masking kotak | Bubble type `text` | Export | Area ditutup `fillRect` putih | ✅ |
| **TC-31** | Teks vertikal | Box 60×240, 8 karakter | Toggle vertikal | 8 baris, font ≈ 23–28 px, terbaca atas–bawah | ✅ |
| **TC-32** | Preview = Export | Teks sama di preview dan export | Bandingkan | Jumlah baris dan ukuran font relatif sama | ✅ |

---

## E. Multi-Page, Export & Persistence

| ID | Skenario | Input | Langkah | Hasil yang diharapkan | Status |
|---|---|---|---|---|---|
| **TC-33** | State per halaman | 3 gambar, isi bubble di halaman 2 | Pindah 1 → 2 → 3 → 2 | Bubble halaman 2 masih utuh | ✅ |
| **TC-34** | Translate semua halaman | 3 halaman berisi bubble | Klik Translate | Semua halaman diproses, kembali ke halaman awal | ✅ |
| **TC-35** | Export PNG | Hasil terjemahan | Export → PNG | File tersimpan, resolusi = asli, lossless | ✅ |
| **TC-36** | Export JPEG + quality | Quality 70% | Export | File lebih kecil dari PNG, slider berpengaruh | ✅ |
| **TC-37** | Batal export | Dialog lalu Cancel | Export | Tidak ada file dibuat, modal aman | ✅ |
| **TC-38** | API key persist | Isi key, tutup aplikasi | Buka aplikasi | Key masih ada di `localStorage` | ✅ |
| **TC-39** | Prompt kustom persist | Ubah prompt gaya Casual | Restart aplikasi | Prompt kustom dimuat kembali | ✅ |
| **TC-40** | Reset workspace | Sudah membuka 3 halaman | Klik reset | Semua URL di-`revokeObjectURL`, state bersih | ✅ |
