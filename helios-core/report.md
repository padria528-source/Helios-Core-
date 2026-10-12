# Laporan Kerja — HELIOS CORE

**Mechanica Collection · Specimen No. 002**
Tanggal: 12 Oktober 2026
Lokasi project: `D:\Fun Projek\helios-core`

## Ringkasan

HELIOS CORE dibangun dari nol sebagai project saudara dari `apis-mechanica` (Specimen No. 001),
memakai stack yang sama (Vite 8, React 19, three.js 0.186, React Three Fiber 9, drei 10,
postprocessing, zustand 5, pnpm). Seluruh artefak adalah geometri prosedural yang dirender
langsung di browser: tidak ada file model, gambar, atau video di balik objek utamanya.

Hasil akhirnya berjalan, interaktif, dan sudah diverifikasi lewat browser sungguhan (Chrome
headless dengan GPU), baik pada dev server maupun build produksi.

## Status

| Area | Status | Bukti |
| --- | --- | --- |
| Typecheck (`pnpm typecheck`) | PASS | `tsc --noEmit`, exit 0 |
| Lint (`pnpm lint`) | PASS | `eslint .`, 0 error, 0 warning |
| Unit test (`pnpm test`) | PASS | 6 file, 87 test, ±0,6 detik |
| Build produksi (`pnpm build`) | PASS | 17 file, 1,62 MB (JS 3D 298 kB gzip, JS app 98 kB gzip) |
| QA visual, build produksi, tier high | PASS | 17 skenario, exit 0, 0 error/warning konsol |
| Stabilitas frame (anti layar hitam) | PASS | 0 frame gelap dari 90, di tier high, medium, dan low |
| Konsol browser | PASS | 0 error. 2 catatan dari dependensi (lihat di bawah) |
| Orbit, zoom, reset view | PASS | drag mouse, roda mouse, tombol RESET VIEW |
| Mode operasi (4 mode) | PASS | state dan tampilan berubah sesuai profil |
| Slider OUTPUT dan RING SPEED | PASS | 35%–175% dan 0,25x–2,00x, ter-clamp |
| PAUSE, ORBIT, X-RAY, RESET | PASS | RESET mengembalikan semua kontrol ke default |
| Sorotan anatomi (5 bagian) | PASS | kamera terbang ke bagian yang dipilih |
| Keyboard | PASS | X, 1–4, Spasi, O, R, V, Esc, Tab + Enter |
| Sentuhan (drag 1 jari, pinch 2 jari) | PASS | event sentuh asli lewat CDP, viewport 390×844 |
| Layout ponsel dan tablet | PASS | 390×844 dan 1024×768 |
| Fallback WebGL | PASS | pesan bermerek muncul, tidak ada canvas, tidak ada error |
| Reduced motion | PASS | intro dipersingkat, orbit otomatis mati |
| Simpan "Collector's Plate" (PNG) | PASS | file 1,41 MB berisi frame + label spesimen |
| Perangkat ponsel fisik | NOT TESTED | hanya emulasi viewport dan sentuhan di Chrome desktop |
| Safari dan Firefox | NOT TESTED | hanya Chrome yang diuji |
| Suara | Tidak dibuat | sengaja dilewati, lihat "Keterbatasan" |

Angka ±60 fps yang tercatat berasal dari Chrome headless di mesin ini pada 1440×900 dan
dibatasi vsync. Itu bukan jaminan performa di perangkat lain.

## Yang dibangun

**Artefak (semua prosedural)**
- Inti plasma berlapis: jantung bintang opak, dua cangkang turbulensi aditif, kabut dalam,
  filamen energi, halo, dan bola kaca amber dengan pantulan softbox prosedural.
- Empat cincin gyro pada satu sumbu kutub, dengan radius, penampang, arah, dan kecepatan
  berbeda. Cincin 3 berayun (nutasi), tidak berputar penuh.
- Enam sirip surya, masing-masing tiga pelat baja-kuningan yang berengsel dan berartikulasi,
  lengkap dengan aktuator yang memanjang dan memendek mengikuti gerak sirip.
- Regulator: piston, flywheel, dua kluster roda gigi, escapement, balance wheel dengan
  hairspring, rocking beam, dan jarum pengukur. Sudut semua roda gigi diturunkan dari satu
  sudut penggerak lewat rasio gigi asli, jadi gigi-giginya tetap bertaut.
- Governor bola terbang di mahkota: bolanya naik saat cincin makin cepat, turun saat PAUSE.
- Pedestal bertingkat dengan cincin kalibrasi, 24 lampu indikator output, jendela ke roda
  gigi bawah, dan inskripsi terukir "HELIOS CORE".

**Sistem**
- Satu objek simulasi yang di-step sekali per frame dan dibaca lewat ref. React state hanya
  berubah saat pengguna mengubah kontrol, tidak pernah per frame.
- Konstanta redaman berbeda untuk inti, cincin, dan sirip, sehingga pergantian mode terbaca
  berurutan: inti dulu, lalu cincin, lalu sirip.
- Tiga tier performa (high, medium, low) dengan penurunan otomatis satu arah.
- Kamera: orbit dengan damping, zoom roda yang dinormalisasi, penerbangan kamera ber-easing,
  orbit otomatis yang berhenti saat disentuh dan lanjut sendiri.

## Masalah yang ditemukan dan cara memperbaikinya

1. **Layar hitam berkedip (paling serius).** Di tier high, sekitar 1 dari 8 frame hitam total.
   Penyebabnya shader filamen energi: `pow(sin(pi * along), 0.7)`. Dengan MSAA 4x, nilai
   `along` terekstrapolasi sedikit melewati ujung tabung, `sin` menjadi negatif tipis, dan
   `pow` dari bilangan negatif menghasilkan NaN. Satu piksel NaN itu disebar oleh bloom ke
   seluruh frame. Ditemukan dengan memindai buffer HDR multisample lalu menyembunyikan objek
   satu per satu. Perbaikan: clamp sebelum `pow`. Semua shader lain diaudit untuk pola yang
   sama, dan skenario `stability` ditambahkan ke QA sebagai uji regresi permanen.
2. **Lantai oranye terang sampai horizon.** Dua penyebab: `fog` dan `background` menempel ke
   `<group>` (bukan ke scene), jadi kabut tidak pernah aktif; dan lantai memantulkan panel
   lampu studio pada sudut landai. Perbaikan: pindahkan keduanya ke akar scene, dan beri
   lantai environment hitam sendiri.
3. **Zoom roda mouse hampir tidak terasa.** OrbitControls bawaan men-zoom dengan langkah tetap
   per event, tanpa melihat besar delta. Ditulis ulang: dinormalisasi terhadap delta dan
   di-ease menuju target.
4. **Sirip terlihat seperti kelopak bunga.** Didesain ulang jadi pelat berbingkai baja dengan
   garis louver, dan berkas sinar hanya di pelat terbawah, memancar dari tanda Helios.
5. **Sisi bawah logam hitam pekat.** Permukaan yang menghadap ke bawah tidak memantulkan
   apa-apa. Ditambah panel pantulan hangat dari bawah di environment map.
6. **Shader gagal kompilasi** saat environment hitam memakai tekstur 1×1. Diganti 64×32.

## Yang diubah dan yang tidak disentuh

- **Dibuat baru:** seluruh isi `D:\Fun Projek\helios-core` (repo git baru, branch `main`).
- **Diubah di luar project:** `C:\Users\PADRI ALI\CLAUDE CODE\.claude\launch.json`, ditambah
  satu entri `helios-core` supaya panel Browser bisa menempel ke `http://127.0.0.1:5180`.
  Entri lain tidak diubah.
- **Tidak disentuh:** `D:\Fun Projek\apis-mechanica`, `solar_system.html`, `.checks`, dan
  semua project lain.

## Cara memakai

```bash
pnpm install
pnpm dev
```

Lalu buka `http://127.0.0.1:5180`. Untuk build produksi: `pnpm build` lalu `pnpm preview`
(`http://127.0.0.1:5181`). Folder `dist/` adalah situs statis dan bisa langsung di-deploy.

Untuk mengulang QA visual: jalankan dev server, lalu `pnpm qa:visual`. Screenshot tersimpan
di `.qa/` (tidak ikut di-commit).

## Keterbatasan

- **Belum diuji di ponsel fisik.** Layout dan input sentuh lolos di emulasi, tetapi performa
  GPU ponsel sungguhan belum diukur.
- **Hanya Chrome yang diuji.** Safari dan Firefox belum.
- **Tidak ada suara.** Aset berkualitas tidak tersedia, dan suara sintetis akan menurunkan
  kesan karyanya.
- **Dua peringatan konsol dari dependensi:** `THREE.Clock` deprecated (dipakai React Three
  Fiber) dan catatan presisi X4122 dari kompiler HLSL ANGLE pada shader blur pihak ketiga.
  Keduanya bukan cacat project ini dan tidak memengaruhi tampilan.
- Siluet latar (deretan pilar) sangat samar. Itu disengaja, tetapi di layar yang gelap bisa
  nyaris tak terlihat.

## Langkah berikutnya (opsional)

- Uji di ponsel fisik kelas menengah dan sesuaikan ambang tier bila perlu.
- Uji di Safari (macOS dan iOS) dan Firefox.
- Tambah suara bila ada aset rekaman mekanis yang layak.
