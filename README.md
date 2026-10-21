# line-selfbotts

Self-bot LINE (unofficial) berbasis TypeScript. Login dengan QR code, lalu kontrol bot lewat chat dari akunmu sendiri.
Fitur utama: ganti foto profil dengan gambar, video, atau keduanya, termasuk video lebih dari 2 menit.

> **Peringatan:** ini memakai API LINE yang tidak resmi dan melanggar ketentuan LINE.
> Akun bisa diblokir dan nomor HP bisa kena ban permanen. Pakai akun cadangan dulu dan jangan kirim pesan massal.

## Kebutuhan

- [Node.js](https://nodejs.org/) 20 atau lebih baru (cek: `node -v`)
- npm (ikut terpasang bersama Node.js)
- [Git](https://git-scm.com/)
- Koneksi internet saat `npm install` (library diambil dari `npm.jsr.io`, tidak perlu login npm)
- Aplikasi LINE di HP untuk scan QR
- Python 3.9+ (hanya untuk `tab vpl`: `yt-dlp` dijalankan lewat Python)

ffmpeg dan `yt-dlp` tidak perlu dipasang sendiri: keduanya ikut terunduh lewat `npm install`
(`yt-dlp` diambil dari GitHub, jadi butuh akses ke github.com saat install).

## Menjalankan

Untuk memakai akun lain (mis. akun clone untuk uji) dengan file sesi terpisah: `LINE_STORAGE=./.storage-clone.json npm start`.

```bash
# 1. Clone (HTTPS)
git clone https://github.com/teamanubot/linets.git
cd linets

# 2. Pasang dependensi (membuat folder node_modules)
npm install

# 3. Jalankan bot
npm start
```

Jalankan `npm start` dari folder project (yang berisi `package.json`), bukan dari dalam `src/`.

## Login pertama kali

1. Setelah `npm start`, terminal menampilkan **QR code** dan sebuah link.
2. Di HP, buka LINE lalu scan QR itu. Gunakan scanner di aplikasi LINE (menu tambah teman / scan QR).
3. Kalau muncul PIN di terminal, masukkan PIN itu di HP.
4. Saat berhasil, terminal menampilkan:

   ```
   Login sebagai <nama akunmu>
   Bot berjalan. Tekan Ctrl+C untuk berhenti.
   ```

Token login disimpan di file `.storage.json`, jadi jalan berikutnya **tidak perlu scan QR lagi**.
File ini berisi akses ke akunmu: jangan dibagikan dan jangan di-commit (sudah ada di `.gitignore`).

## Log di terminal

Setiap kegiatan bot tercatat di terminal tempat `npm start` berjalan, lengkap dengan jam:

```
[23:01:03] 📥 menerima perintah: tab ping
[23:01:03] 📤 kirim (pribadi): "pong 🏓"
[23:01:03] ✅ tab ping selesai (430 ms)
[23:01:10] ⚠️ tab ngawur → perintah tidak dikenal
[23:01:25] ❌ tab vpl https://… gagal: This video is unavailable (1,2 dtk)
[23:01:34] 📤 kirim gambar (90 KB)
[23:02:10] 📩 menerima pesan dari Budi (pribadi): "halo"
```

- 📩 pesan masuk dari orang lain (nama, grup/pribadi, cuplikan isi)
- 📥 perintah atau gambar/video yang diterima
- 📤 setiap pesan, gambar, video, atau pemberitahuan yang dikirim bot
- ✅ / ❌ hasil tiap perintah beserta lamanya, dan ⚠️ untuk perintah yang tidak dikenal

Teks dipotong supaya log tetap satu baris per kejadian. Pesan yang kamu kirim sendiri di chat lain tidak dicatat.

## Perintah

> Pesan yang dibuat sebelum bot menyala diabaikan (toleransi 15 detik), jadi perintah lama yang tertinggal tidak dijalankan ulang saat bot dinyalakan.

Bot hanya merespons pesan dari **akunmu sendiri**. Kirim perintah di chat mana pun (misalnya chat "Keep"
atau chat dengan teman). Semua perintah diawali kata `tab`:

### Umum

| Perintah | Fungsi |
| --- | --- |
| `tab help` | Menu perintah per kelompok. `tab help <profil\|cover\|grup\|otomatis>` untuk penjelasan cara pakai tiap kelompok |
| `tab ping` | Cek bot hidup (dibalas `pong`) |
| `tab speed` | Ukur kecepatan respon dalam ms dan detik: ping API LINE (5×), waktu kirim pesan, dan pulang-pergi pesan. Penilaian 🟢 <500 ms · 🟡 <1,5 dtk · 🔴 lebih lambat |
| `tab me` | Tampilkan nama akunmu |
| `tab echo <teks>` | Bot mengulang teks |
| `tab batal` | Batalkan alur yang sedang berjalan |

### Profil

| Perintah | Fungsi |
| --- | --- |
| `tab pp` | Ganti **foto profil** (gambar). Kalau profilmu sudah punya video, videonya tidak diubah |
| `tab vp` | Ganti **gambar + video** profil |
| `tab vp2` | Ganti **video profil saja**, foto tidak diubah |
| `tab vpl <link YouTube>` | Unduh video YouTube (**dengan suara**, kualitas terbaik sampai **4K**) lalu jadikan **video profil** (foto tetap). Hasilnya persegi dengan seluruh gambar dimuat (latar buram), tidak terpotong. Opsi di belakang link: `foto` (sekalian jadikan foto profil), `potong` (potong tengah). Maks. 10 menit. File sementara otomatis dihapus. Lihat catatan kualitas di bawah |
| `tab nama <nama>` | Ganti nama tampilan (maks. 20 karakter) |
| `tab status <teks>` | Ganti status (maks. 500 karakter); tanpa teks = hapus status |
| `tab tpp @orang` | Kirim **foto profil** orang yang di-mention ke chat ini, plus **video profil**-nya kalau ada. Bisa juga `tab tpp <id pengguna>`, maks. 3 orang sekali jalan. Video di atas 50 MB tidak dikirim |
| `tab tpp me` | Sama, untuk akunmu sendiri. Di chat pribadi, `tab tpp` saja menampilkan foto lawan bicara |
| `tab save` | **Reply** gambar/video lalu ketik ini untuk menyimpannya ke folder `downloads/` |

### Cover (sampul profil)

Sama seperti foto profil, cover punya **gambar statis** dan **video** terpisah. Gambar otomatis dipotong potret 9:16.

| Perintah | Fungsi |
| --- | --- |
| `tab cp` | Ganti **gambar cover**. Video cover, kalau ada, tidak diubah |
| `tab cv` | Ganti **gambar + video** cover (kirim gambar, lalu video) |
| `tab cv2` | Ganti **video cover saja**, gambar tidak diubah |

**Video cover maksimal 15 detik.** Server LINE memotongnya sendiri, dan itu tidak bisa ditembus (sudah diuji dengan
upload 20 dan 150 detik, hasilnya sama-sama 15 detik). Bot memotongnya lebih dulu sebelum mengunggah.
Berbeda dengan video foto profil yang tidak dibatasi (teruji sampai 10 menit).

### Otomatis

| Perintah | Fungsi |
| --- | --- |
| `tab autoreply <teks>` | Balas otomatis chat pribadi dari orang lain. Maks. sekali per orang tiap 30 menit, grup tidak dibalas. `tab autoreply off` untuk mematikan, tanpa teks untuk melihat status |
| `tab antiunsend on/off` | Kabari kamu (di chat dengan diri sendiri) isi pesan yang ditarik orang lain. Default aktif. Hanya pesan yang diterima saat bot berjalan |

Pengaturan disimpan di `.settings.json` (sudah di `.gitignore`).

### Flex Message (lewat LIFF)

| Perintah | Fungsi |
| --- | --- |
| `tab liff <id>` | Atur LIFF app yang dipakai untuk mengirim Flex (`tab liff` untuk melihat, `tab liff reset` untuk menghapus) |
| `tab flex <judul> \| <isi> [\| <label tombol> \| <link>] [\| opsi…]` | Kirim kartu Flex ke chat ini dengan gaya dan tema bawaan (atau yang dipilih lewat opsi) |
| `tab flexgaya` | Lihat gaya dan tema bawaan beserta daftar gaya |
| `tab flexgaya <gaya> [tema]` | Ganti gaya dan/atau tema bawaan (tersimpan), mis. `tab flexgaya bisnis biru` |
| `tab flexgaya contoh [gaya]` | Kirim contoh semua gaya (atau satu gaya) dengan tema bawaan; tambah `gambar:https://…` untuk gambarmu |
| `tab flexgaya reset` | Kembalikan ke gaya `chino` tema `pink` |
| `tab flexgaleri <url> \| <keterangan> \| <url> …` | Carousel gambar (maks. 10, semua https) |
| `tab flexjson <json>` | Kirim Flex dari JSON mentah (`bubble` atau `carousel`), susun di [Flex Simulator](https://developers.line.biz/flex-simulator/) |

**Gaya** (`gaya:` atau `tab flexgaya`): `chino` (gradien pastel ala [chino-line-image-bot](https://github.com/talkouki89/chino-line-image-bot), MIT),
`bisnis` (putih bersih, gambar lebar, dua tombol), `banner` (teks di atas gambar atau gradien), `profil` (avatar bulat),
`struk` (rincian rata kanan, baris Total ditebalkan), `pengumuman` (lencana + judul besar), `polos`, dan
`latar` (latar bergerak, lihat di bawah).
**Tema** (`tema:`): `pink`, `biru`, `senja`, `hijau`, `kuning`, `merah`, `ungu`, `hitam`.

**Gaya `latar` (latar bergerak):** **navbar** solid di atas berisi judul, **gambar memenuhi seluruh area tengah** dengan isi teks di tengahnya
(lapisan gelap tipis agar terbaca), dan **bar bawah** gelap dengan teks kredit di **kiri** (bawaan `Powered By TeamAnuBot`) dan
**foto profil LINE-mu** di **kanan** (diambil otomatis dari akun yang menjalankan bot). Contoh:

```
tab flex Selamat Pagi | Semangat terus ya | gaya:latar | tema:biru | gif:https://hostingmu.id/latar-flex.png | rasio:70:39
tab flex Teknologi | - | gaya:latar | gif:https://hostingmu.id/latar-flex.png | rasio:70:39     (isi "-" = gambar saja tanpa teks)
```

Teks kiri bar bawah: `tab flexgaya oleh <teks>` (tersimpan; `tab flexgaya oleh reset` mengembalikan), atau sekali pakai dengan opsi `| oleh:Teks`.
Opsi `gif:` / `latar:` / `gambar:` sama saja (URL https). `rasio:LEBAR:TINGGI` mengatur bentuk gambar latar (default `1:1`; untuk GIF landscape
misalnya `rasio:16:9`), supaya seluruh gambar tampil utuh.

> **Syarat agar latar bergerak** (dari dokumentasi LINE dan hasil uji):
> 1. Formatnya **APNG**, bukan GIF. GIF biasa tampil diam.
> 2. Ukuran file **maksimal 300 KB**. Animasi yang lebih besar **tidak diputar** (tampil diam). Ini batas yang membuat latar 897 KB tidak bergerak,
>    padahal APNG 62 KB bergerak.
> 3. Jumlah putarannya **tanpa henti** (`num_plays=0`). Stiker animasi LINE yang diuji hanya 3 putaran lalu berhenti.
> 4. Maksimal 1024×1024 piksel, URL https.
>
> Bot memeriksa gambar `gaya:latar` otomatis dan **memberi peringatan** kalau salah satu syarat tidak terpenuhi (GIF, di atas 300 KB, putaran terbatas, atau bukan APNG).
>
> - Siap pakai: **`assets/latar-flex.png`** (animasi angka biner bertema IT): APNG 280×156, 281 KB, 23 frame, tanpa henti, `rasio:70:39`.
>   Setelah mengubahnya, **commit dan push lagi**; GitHub raw bisa menyimpan cache beberapa menit.
> - Ubah GIF-mu sendiri: `npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12] [batas-KB=285]` → file di `apng-out/`.
>   Ia memakai palet 8-bit dan menurunkan lebar, fps, dan jumlah warna bertahap sampai muat di batas, lalu mencetak `rasio:` yang pas.
>   Pengaturan tetap: `--tetap=LEBAR,FPS,WARNA` (mis. `--tetap=280,8,28`).
> - Animasi hujan kode: `python3 scripts/make-coderain.py keluaran.png 320 biru` (butuh Pillow; periksa ukurannya tetap di bawah 300 KB).
> - **Hosting:** unggah ke tempat berlink https milikmu, misalnya commit ke repo GitHub lalu pakai
>   `https://raw.githubusercontent.com/<user>/<repo>/<branch>/assets/latar-flex.png`.

**Opsi** (letakkan di bagian mana pun setelah judul dan isi, dipisah `|`): `gaya:` · `tema:` · `gambar:https://…` · `label:Kategori` ·
`sub:Subjudul` · `oleh:Nama` · `tombol2:Label>https://…`. Baris isi berbentuk `Label: nilai` (pisahkan baris dengan Enter) tampil sebagai dua kolom.

```
tab flex Paket Premium | Harga: Rp 99.000
Masa aktif: 30 hari | Beli | https://line.me | gaya:bisnis | tema:biru | label:Penawaran | gambar:https://contoh.id/foto.jpg | tombol2:Pelajari>https://line.me
```

Gambar hanya bisa lewat **URL https publik** (tidak ada unggah dari chat, supaya tidak ada layanan pihak ketiga yang dipakai).
Kirim banyak kartu sekaligus bisa kena **batas kecepatan LINE** (`RateLimit`); bot memberi jeda dan mencoba ulang sekali.

Kirim langsung `contentType FLEX` ditolak server (`INCOMPATIBLE_APP_VERSION`), jadi Flex dikirim lewat **LIFF**: bot meminta
token LIFF atas nama akunmu lalu memanggil `api.line.me/message/v3/share`. Yang perlu disiapkan:

1. Buat LIFF app (gratis) di [LINE Developers Console](https://developers.line.biz/console/): channel **LINE Login** → tab **LIFF** →
   Add, isi Endpoint URL apa saja yang `https://`, scope **chat_message.write**. Salin LIFF ID (`1234567890-AbCdEfGh`).
2. Kirim `tab liff <LIFF ID>`.
3. Saat pertama kali dipakai, akunmu **menyetujui izin** LIFF app itu secara otomatis (izin kirim pesan). Karena itu pakai LIFF app milikmu
   sendiri, atau yang benar-benar kamu percaya.

Batasan yang sudah teruji:

- **Chat dengan diri sendiri (Notes) tidak didukung** oleh LIFF (`INVALID_RECEIVER`); bot membalas penjelasannya. Pakai di chat dengan orang lain atau di grup.
- Teruji di **grup**. Chat pribadi dengan teman belum teruji.
- Channel LINE Login harus berstatus **Published**, atau akun yang memakainya terdaftar sebagai admin/tester channel.

### Grup

Perintah grup hanya berlaku di chat grup, kecuali `tab join`.

| Perintah | Fungsi |
| --- | --- |
| `tab linkgrup` | Aktifkan dan kirim link grup. Membuat link baru, jadi link lama tidak berlaku lagi |
| `tab join <link>` | Gabung grup lewat link (`https://line.me/R/ti/g/...`) atau tiketnya |
| `tab namagrup <nama>` | Ganti nama grup (maks. 50 karakter) |
| `tab invite @teman` | Undang lewat mention, atau `tab invite <id pengguna>` |
| `tab tendang @orang` | Keluarkan orang yang di-mention (butuh hak admin grup) |
| `tab keluar` | Keluar dari grup. Minta konfirmasi: ketik `tab keluar ya` |

### Alur ganti foto profil

**`tab pp`**
1. Kirim `tab pp`. Bot membalas "Kirimkan fotonya."
2. Kirim fotonya.
3. Bot membalas "✅ Berhasil".

**`tab vp`**
1. Kirim `tab vp`. Bot membalas minta foto.
2. Kirim fotonya. Foto ini menjadi gambar profil (avatar).
3. Bot membalas "Sekarang kirim videonya." Kirim videonya.
4. Bot membalas "✅ Berhasil". Video diputar saat profilmu diklik.

**`tab vp2`**
1. Kirim `tab vp2`.
2. Kirim videonya.
3. Bot membalas "✅ Berhasil", foto profil tidak berubah.

Catatan:
- Setiap langkah menunggu maksimal **2 menit**, lalu alur dibatalkan sendiri.
- Gambar otomatis dipotong persegi 640x640.
- `tab save` hanya bisa mengambil media dari pesan yang masih ada di cache bot atau di ~100 pesan terakhir chat itu.
- Video lebih dari 2 menit bisa diupload; server LINE menyimpan video utuh. Thumbnail kecil di avatar hanya memutar sekitar 6 detik.
- Profil di server LINE diperbarui dengan jeda beberapa detik. Tutup lalu buka lagi profilmu kalau belum berubah.

## Perintah npm

| Perintah | Fungsi |
| --- | --- |
| `npm start` | Jalankan bot |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm test` | Jalankan unit test |

Skrip tes live di `scripts/` **mengubah akunmu** (lalu memulihkannya), jalankan hanya kalau perlu:
`live-profile-test.ts` (foto profil), `live-cover-test.ts` (cover), dan `live-bot-e2e.ts` (semua perintah lewat chat;
butuh folder kerja dan file foto profil asli sebagai cadangan, lihat komentar di atas skrip).

## Struktur project

```
src/
  domain/          tipe dan antarmuka (ChatMessage, ProfileGateway, GroupGateway, ...)
  application/     logika: alur foto profil, akun, grup, simpan media + unit test
  infrastructure/  LINE (login, OBS, adapter pesan) dan ffmpeg
  presentation/    parser perintah "tab ..." dan event handler bot
  main.ts          titik masuk (merakit semua bagian)
scripts/           tes live manual
```

Library LINE yang dipakai adalah `@tab/linets` (fork LINEJS, MIT) dari
[JSR](https://jsr.io/@tab/linets). `.npmrc` di project ini mengarahkan scope `@jsr` ke `https://npm.jsr.io`,
jadi file itu harus ikut ada.

## Catatan `tab vpl` (YouTube)

- Hanya link YouTube yang diterima (`youtube.com/watch`, `youtu.be`, `shorts`, `embed`, `live`). Playlist diabaikan, hanya satu video.
- Mengunduh video YouTube melanggar ketentuan YouTube dan bisa melanggar hak cipta. Pakai untuk konten yang boleh kamu pakai.
- YouTube sering mengubah sistemnya. Kalau tiba-tiba gagal, perbarui alatnya: `npm rebuild youtube-dl-exec`.
- Video diunduh ke folder sementara di disk, diproses, lalu foldernya langsung dihapus, baik berhasil maupun gagal.
- **Kualitas mengikuti sumber:** sumber 4K menghasilkan 2160×2160, 1080p menghasilkan 1080×1080, dan seterusnya (720, 480).
  Bitrate dibatasi supaya file akhir di bawah **180 MB**, karena server LINE menolak upload sekitar 200 MB ke atas (413).
  Jadi 4K hanya bertahan untuk video pendek (sekitar 2,5 menit ke bawah); video yang lebih panjang otomatis diturunkan
  ke 1440 atau 1080 supaya tetap muat. Bot memberi tahu kalau kualitasnya diturunkan.
- **Waktu proses:** 4K (2160×2160) sekitar 2 detik per 1 detik video di mesin 24 core, jadi klip 30 detik sekitar 1 menit.
  1080p jauh lebih cepat. Frame rate 4K dibatasi 30 fps supaya bisa diputar di HP.

## Masalah umum

- **`npm start` bilang `Cannot find module` atau `tsx: not found`**: belum `npm install`, atau kamu tidak berada di folder project.
- **`npm install` gagal 404 untuk `@jsr/tab__linets`**: pastikan file `.npmrc` ada di folder project dan koneksi internet normal.
- **Minta scan QR terus**: `.storage.json` tidak ada atau token tidak valid. Hapus `.storage.json`, lalu `npm start` dan scan ulang.
- **Bot tidak membalas**: kirim perintah dari akun yang sama dengan yang login, dan awali dengan `tab` (contoh `tab ping`).
- **Merah di VS Code padahal `npm run typecheck` bersih**: jalankan **Ctrl+Shift+P → TypeScript: Restart TS Server**,
  dan pastikan folder yang dibuka adalah folder project.
- **Gagal ganti foto profil**: bot membalas "❌ Gagal: ..." dengan alasannya. Coba ulang `tab pp` / `tab vp`.

## Lisensi

Kode project ini mengikuti lisensi repositori. `@tab/linets` adalah fork LINEJS milik Evex Developers (MIT).
