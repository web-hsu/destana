# DESTANA — Desa/Kelurahan Tanggap Bencana
Kabupaten Hulu Sungai Utara (HSU)

Aplikasi web untuk memantau kesiapan banjir per kecamatan: prakiraan cuaca, curah hujan, tinggi muka air (TMA), debit sungai, dan analisa tingkat siaga. Semua data direkam otomatis ke Google Spreadsheet sebagai bahan laporan kondisi tiap kecamatan.

## 1. Isi paket

| File | Fungsi |
|---|---|
| `Kode.gs` | Backend Google Apps Script: ambil data, hitung skor, rekam ke spreadsheet |
| `appsscript.json` | Pengaturan proyek Apps Script (zona waktu WITA, akses Web App) |
| `index.html`, `style.css`, `app.js`, `data-modul.js` | Tampilan web |
| `batas-wilayah.js` | Batas kabupaten/kecamatan (tidak diubah) |

## 2. Sumber data

| Data | Sumber | Cara masuk |
|---|---|---|
| Prakiraan cuaca | BMKG (`api.bmkg.go.id`) | Otomatis |
| Curah hujan | Open-Meteo | Otomatis |
| Debit sungai | GloFAS via Open-Meteo Flood | Otomatis (hasil model, bukan alat ukur) |
| Tinggi muka air (TMA) | Pembacaan petugas pos duga | **Diinput manual** lewat form + PIN |
| Sumber daya siaga | Petugas kecamatan/BPBD | **Diinput manual** lewat form + PIN |
| Ambang siaga & target kesiapan | BPBD/BWS | **Diisi manual** di sheet "Ambang & Target" |

## 3. Tahap pemasangan (sekali saja)

### Tahap 1 — Buat spreadsheet dan pasang backend
1. Buka Google Drive, buat **Google Spreadsheet baru** (misalnya "DESTANA HSU").
2. Menu **Extensions › Apps Script**.
3. Ganti isi `Code.gs` dengan isi file `Kode.gs`.
4. Buka **Project Settings** (ikon roda gigi), centang **Show "appsscript.json" manifest file in editor**. Lalu buka `appsscript.json` di editor dan ganti isinya dengan file `appsscript.json` dari paket ini.

> Bila skrip dibuat terpisah dari spreadsheet (bukan lewat menu Extensions), isi Script Property `SPREADSHEET_ID` dengan ID spreadsheet (potongan URL di antara `/d/` dan `/edit`).

### Tahap 2 — Atur PIN petugas
1. Di Apps Script: **Project Settings › Script Properties › Add script property**.
2. Isi **Property** = `INPUT_PIN`, **Value** = PIN rahasia (disarankan 6 angka). Simpan.
3. Bagikan PIN hanya kepada petugas yang berwenang menginput TMA dan data kesiapan.
4. PIN dikunci 10 menit setelah 10 kali salah. PIN hanya pengaman ringan, jangan dipakai untuk data yang sangat sensitif.

### Tahap 3 — Jalankan `setup()`
1. Di editor Apps Script, pilih fungsi **`setup`** pada menu dropdown, lalu klik **Run**.
2. Setujui izin yang diminta (akses Spreadsheet dan koneksi ke layanan luar). Pada layar "Google hasn't verified this app", pilih **Advanced › Go to … (unsafe)**. Ini wajar untuk skrip milik sendiri.
3. Setelah selesai, spreadsheet akan berisi sheet berikut:
   - **Pemantauan**: rekaman data tiap 3 jam per kecamatan.
   - **TMA**: riwayat pembacaan muka air yang diinput petugas.
   - **Kesiapan**: riwayat data sumber daya siaga.
   - **Ambang & Target**: ambang TMA dan target kesiapan per kecamatan.
   - **Rekap Harian**: ringkasan harian per kecamatan untuk laporan.
4. `setup()` juga memasang pemicu otomatis tiap 3 jam dan membuat rekaman pertama. Pastikan pemicunya ada di menu **Triggers** (ikon jam).

### Tahap 4 — Isi ambang dan target resmi
Buka sheet **Ambang & Target** dan ganti angka contoh untuk setiap kecamatan:

| Kolom | Arti |
|---|---|
| Pos duga | Nama pos duga yang dipakai kecamatan |
| Waspada / Siaga / Awas (cm) | Batas TMA untuk tiap tingkat. **Isi dengan angka resmi BPBD/BWS** |
| Target perahu, posko, relawan, pompa, logistik | Jumlah ideal yang harus tersedia |

> Angka bawaan (Waspada 150, Siaga 200, Awas 250 cm, dan target berdasarkan jumlah penduduk) hanyalah **contoh** supaya aplikasi langsung berjalan. Jangan dipakai untuk keputusan operasional sebelum diganti.

### Tahap 5 — Deploy sebagai Web App
1. Di Apps Script: **Deploy › New deployment**.
2. Klik ikon roda gigi, pilih **Web app**.
3. **Execute as: Me**, **Who has access: Anyone**. Klik **Deploy**.
4. Salin **Web app URL** yang berakhiran `/exec`.
5. Bila nanti kode `Kode.gs` diubah, buat versi baru lewat **Deploy › Manage deployments › Edit (ikon pensil) › Version: New version**. URL tetap sama.

### Tahap 6 — Sambungkan tampilan ke backend
Buka `data-modul.js`, cari dua baris di bagian atas, lalu isi:

```js
const API_BANJIR = "https://script.google.com/macros/s/XXXXXXXX/exec";   // URL dari Tahap 5
const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/XXXXXXXX/edit";   // opsional: tombol buka laporan
```

### Tahap 7 — Pasang tampilan web
Unggah ke hosting statis (misalnya GitHub Pages) dalam satu folder:
`index.html`, `style.css`, `app.js`, `data-modul.js`, `batas-wilayah.js`.

Untuk uji lokal, cukup buka `index.html` di browser (butuh internet untuk peta dan Leaflet).

### Tahap 8 — Uji
1. Buka alamat aplikasi. Di bagian atas harus tampil "Update data: …" dengan jam pembaruan, bukan "API belum disambungkan".
2. Semua informasi ada di satu halaman: kartu status, peta, tabel Kondisi per Kecamatan (cuaca, hujan, TMA, debit, skor), grafik, dan detail kecamatan.
3. Tombol **Input Data Petugas** (tab Tinggi Muka Air): input satu TMA uji dengan PIN. Cek baris baru di sheet **TMA** dan perubahan warna kecamatan di peta.
4. Buka sheet **Pemantauan** dan pastikan ada baris data.

## 4. Cara pemakaian harian

### A. Petugas pos duga: input TMA
1. Buka aplikasi, klik **Input Data Petugas**, tab **Tinggi Muka Air**.
2. Pilih **Kecamatan**.
3. Isi **TMA (cm)** dan **Tren** (naik, tetap, turun).
4. Isi **Waktu bacaan** bila tidak diinput saat itu juga (maksimal 7 hari ke belakang). Kosongkan untuk memakai waktu sekarang.
5. Isi nama pos, catatan (opsional), **Nama petugas**, dan **PIN**. Klik kirim.
6. Pembacaan yang lebih tua dari **48 jam** tidak dihitung dan aplikasi akan meminta pembacaan baru. Input TMA minimal 2 kali sehari, dan lebih sering saat siaga.

### B. Petugas kecamatan/BPBD: input sumber daya siaga
1. Klik **Input Data Petugas**, tab **Kesiapan Sumber Daya**.
2. Pilih kecamatan, isi jumlah **perahu, posko, relawan, pompa, dan logistik (hari)**, lalu isi nama petugas dan PIN.
3. Perbarui saat ada perubahan, atau minimal sekali seminggu.

### C. Membaca hasil
- **Peta dan kartu**: warna kecamatan menunjukkan tingkat siaga (hijau Normal, kuning Waspada, oranye Siaga, merah Awas). Klik kecamatan di peta atau tabel untuk melihat cuaca, rekomendasi, dan detailnya; klik lagi untuk kembali ke ringkasan kabupaten.
- **Tabel Kondisi per Kecamatan**: skor risiko 0–100, status, dan peringkat; tombol Unduh CSV.
- **Detail Kecamatan**: faktor risiko, kesiapan sumber daya, dan tindakan yang disarankan.
- **Tren 7 Hari**: jumlah kecamatan per tingkat siaga dari rekap harian, dengan unduh CSV.
- **Cetak / PDF**: tombol Cetak membuka dialog cetak (A4); pilih "Simpan sebagai PDF" untuk laporan.
- **Logo (opsional)**: isi `LOGO_KIRI` dan `LOGO_KANAN` di `data-modul.js`, contoh `[{src:"logo-hsu.png",alt:"Pemkab HSU"}]`, lalu unggah file gambarnya di folder yang sama.

## 5. Cara kerja analisa singkat

- **Skor risiko (0–100)** = hujan (30%) + TMA (35%) + debit (25%). Bila satu faktor tidak ada datanya, bobot dibagi ulang ke faktor yang ada.
- **Tanpa TMA terukur (pembacaan ≤ 48 jam), status dibatasi maksimal Waspada.** Siaga dan Awas hanya muncul setelah petugas menginput TMA. Tanpa TMA, skor hanya perkiraan model hujan dan debit.
- **Debit:** dihitung dari kenaikan debit puncak 7 hari ke depan dibanding rata-rata 7 hari terakhir (1,25 kali = 0, 3 kali = penuh). Bila debit puncak kurang dari 5 m³/s, tren debit diabaikan karena terlalu kecil untuk dipercaya. Angka 5 m³/s dan batas Waspada tanpa TMA bisa diubah di bagian atas `Kode.gs` (`DEBIT_MIN_M3S`, `TANPA_TMA_MAKS`).
- Kepadatan penduduk menambah skor hingga +25% pada kecamatan terpadat. Faktor ini tidak pernah menciptakan risiko bila data hujan, TMA, dan debit kosong.
- **Tingkat**: Normal < 25, Waspada 25–49, Siaga 50–74, Awas ≥ 75.
- Bila TMA sudah melewati ambang Siaga atau Awas di sheet, tingkat kecamatan dikunci minimal pada tingkat itu, apa pun skornya.
- **Skor kesiapan** = rata-rata pemenuhan target sumber daya (perahu, posko, relawan, pompa, logistik).

## 6. Rekaman di spreadsheet

| Sheet | Diisi | Dipakai untuk |
|---|---|---|
| Pemantauan | Otomatis tiap 3 jam | Riwayat cuaca, hujan, debit, skor, dan status |
| TMA | Saat petugas input | Riwayat muka air |
| Kesiapan | Saat petugas input | Riwayat sumber daya |
| Ambang & Target | Manual (sekali, lalu bila ada perubahan) | Acuan perhitungan |
| Rekap Harian | Otomatis | Laporan harian per kecamatan |

Jangan menghapus baris judul (baris 1) pada setiap sheet. Untuk laporan bulanan, filter sheet **Rekap Harian** berdasarkan kecamatan dan tanggal, atau buat tabel pivot.

## 7. Pemecahan masalah

| Gejala | Penyebab dan solusi |
|---|---|
| "API belum disambungkan" | `API_BANJIR` di `data-modul.js` masih kosong. Isi URL `/exec`. |
| "Data gagal dimuat" | Deploy belum diatur "Anyone", URL salah, atau pemicu/setup belum dijalankan. Cek Tahap 3 dan 5. |
| Perubahan `Kode.gs` tidak muncul | Buat **New version** pada deployment (Tahap 5, langkah 5). |
| "PIN salah" atau input ditolak | Periksa `INPUT_PIN` di Script Properties. Setelah 10 kali salah, tunggu 10 menit. |
| Cuaca BMKG kosong untuk sebagian kecamatan | Kode wilayah dicari otomatis dan BMKG membatasi 60 permintaan/menit. Tunggu beberapa menit lalu muat ulang. |
| Tampilan tidak berubah setelah update | Tekan Ctrl+F5, atau naikkan angka `?v=` pada tag script/link di `index.html`. |
| Rekap Harian masih menampilkan Siaga/Awas lama setelah update | Rekap memakai skor tertinggi hari itu. Hapus baris hari itu di sheet **Pemantauan** dan **Rekap Harian** (jangan hapus baris judul), lalu jalankan `perbarui` sekali. |
| Rekaman otomatis berhenti | Buka **Triggers** di Apps Script, pastikan pemicu `perbarui` tiap 3 jam masih ada. Jalankan `setup()` lagi bila hilang. |

## 8. Batasan yang perlu diketahui

- Debit GloFAS adalah **hasil model** beresolusi sekitar 5 km, bukan pengukuran alat. Gunakan sebagai indikator tren.
- Analisa memakai hujan lokal HSU. Data stasiun hulu (misalnya dari kabupaten tetangga) belum ikut dihitung.
- Ambang dan target bawaan hanyalah contoh. Ganti dengan angka resmi sebelum dipakai.
- Aplikasi ini alat bantu pemantauan, bukan pengganti peringatan resmi BPBD, BMKG, dan BWS.
