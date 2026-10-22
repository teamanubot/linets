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
- Python 3.9+ (hanya untuk `tab vpl`/`tab dl-*`: `yt-dlp` dijalankan lewat Python)
- `pip install curl_cffi` (hanya untuk `tab dl-tiktok`: TikTok menolak permintaan yt-dlp biasa, butuh TLS impersonation dari paket ini)
- Google Chrome/Chromium terpasang (hanya untuk `tab search-tiktok`; cek lewat env `CHROME_PATH` kalau lokasinya bukan `/usr/bin/google-chrome`)

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

| Perintah            | Fungsi                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab help`        | Menu perintah per kelompok. `tab help <profil\|cover\|grup\|otomatis>` untuk penjelasan cara pakai tiap kelompok                                                  |
| `tab ping`        | Cek bot hidup (dibalas `pong`)                                                                                                                                 |
| `tab speed`       | Ukur kecepatan respon dalam ms dan detik: ping API LINE (5×), waktu kirim pesan, dan pulang-pergi pesan. Penilaian 🟢 <500 ms · 🟡 <1,5 dtk · 🔴 lebih lambat |
| `tab me`          | Tampilkan nama akunmu                                                                                                                                            |
| `tab echo <teks>` | Bot mengulang teks                                                                                                                                               |
| `tab stat`        | Status auto-reply, auto-read, anti-unsend (chat ini), dan Group Guard (grup ini, kalau versi proteksi) sekaligus dalam satu balasan                              |
| `tab batal`       | Batalkan alur yang sedang berjalan                                                                                                                               |

### Profil

| Perintah                   | Fungsi                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab pp`                 | Ganti **foto profil** (gambar). Kalau profilmu sudah punya video, videonya tidak diubah                                                                                                                                                                                                                                                                                                   |
| `tab vp`                 | Ganti **gambar + video** profil                                                                                                                                                                                                                                                                                                                                                           |
| `tab vp2`                | Ganti **video profil saja**, foto tidak diubah                                                                                                                                                                                                                                                                                                                                            |
| `tab vpl <link YouTube>` | Unduh video YouTube (**dengan suara**, kualitas terbaik sampai **4K**) lalu jadikan **video profil** (foto tetap). Hasilnya persegi dengan seluruh gambar dimuat (latar buram), tidak terpotong. Opsi di belakang link: `foto` (sekalian jadikan foto profil), `potong` (potong tengah). Maks. 10 menit. File sementara otomatis dihapus. Lihat catatan kualitas di bawah |
| `tab nama <nama>`        | Ganti nama tampilan (maks. 20 karakter)                                                                                                                                                                                                                                                                                                                                                         |
| `tab status <teks>`      | Ganti status (maks. 500 karakter); tanpa teks = hapus status                                                                                                                                                                                                                                                                                                                                    |
| `tab tpp @orang`         | Kirim **foto profil** orang yang di-mention ke chat ini, plus **video profil**-nya kalau ada. Bisa juga `tab tpp <id pengguna>`, maks. 3 orang sekali jalan. Video di atas 50 MB tidak dikirim                                                                                                                                                                                    |
| `tab tpp me`             | Sama, untuk akunmu sendiri. Di chat pribadi, `tab tpp` saja menampilkan foto lawan bicara                                                                                                                                                                                                                                                                                                     |
| `tab save`               | **Reply** gambar/video lalu ketik ini untuk menyimpannya ke folder `downloads/`                                                                                                                                                                                                                                                                                                         |
| `tab saveprofile`        | Simpan nama, status, foto profil (+video kalau ada), dan foto cover (+video kalau ada) **akun sendiri** (bukan orang lain) ke `downloads/fotoprofile.jpg`, `videoprofile.mp4`, `fotocover.jpg`, `videocover.mp4` — nama baku, tiap dipanggil menimpa yang lama (tidak menumpuk file baru), lalu membalas ringkasannya                                                            |
| `tab recovery`           | Kembalikan nama, status, foto/video profil, dan foto/video cover ke kondisi saat `tab saveprofile` **terakhir** dijalankan (satu slot, bukan riwayat). Kalau file di `downloads/` sudah dihapus, bagian itu dilewati tapi nama/status tetap dipulihkan                                                                                                                                |

### Cover (sampul profil)

Sama seperti foto profil, cover punya **gambar statis** dan **video** terpisah. Gambar otomatis dipotong potret 9:16.

| Perintah                | Fungsi                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab cp`              | Ganti **gambar cover**. Video cover, kalau ada, tidak diubah                                                                                                                                              |
| `tab cv`              | Ganti **gambar + video** cover (kirim gambar, lalu video)                                                                                                                                                 |
| `tab cv2`             | Ganti **video cover saja**, gambar tidak diubah                                                                                                                                                           |
| `tab tcv @orang \| me` | Kirim **cover** orang yang di-mention (atau `me` untuk diri sendiri) ke chat ini. Kalau covernya cuma gambar, dikirim gambarnya saja; kalau ada video cover juga, gambar dan videonya dikirim sekaligus |

**Video cover maksimal 15 detik.** Server LINE memotongnya sendiri, dan itu tidak bisa ditembus (sudah diuji dengan
upload 20 dan 150 detik, hasilnya sama-sama 15 detik). Bot memotongnya lebih dulu sebelum mengunggah.
Berbeda dengan video foto profil yang tidak dibatasi (teruji sampai 10 menit).

### Otomatis

| Perintah                            | Fungsi                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tab autoreply <teks>`            | Balas otomatis chat pribadi dari orang lain. Bawaan: maks. sekali per orang tiap 30 menit, grup tidak dibalas. `tab autoreply off` untuk mematikan, `tab autoreply on` untuk nyalakan lagi pakai teks terakhir (tanpa ketik ulang), tanpa teks untuk melihat status (termasuk jeda & limit yang berlaku) |
| `tab autoreply jeda <jam> [kali]` | Atur jeda (boleh pecahan jam, mis. 0.5 = 30 menit) dan berapa kali maksimal dibalas per orang dalam jeda itu. Contoh: `tab autoreply jeda 2 2` → tiap 2 jam, maks. 2x balasan per orang                                                                                                                   |
| `tab autoread on/off`             | Tandai SEMUA pesan masuk (grup & pribadi, dari orang lain) sebagai sudah dibaca otomatis begitu diterima. Global (bukan per chat). **Bawaan MATI**                                                                                                                                                     |
| `tab antiunsend on/off`           | Kirim ulang isi pesan yang ditarik orang lain, ke chat tempat kejadiannya. **Per chat** (grup/pribadi masing-masing diatur sendiri, bukan global) — lihat catatan di bawah. **Bawaan MATI**; harus dinyalakan dulu per chat. Hanya pesan yang diterima saat bot berjalan                        |

`autoreply` dan `autoread` berlaku global (satu pengaturan untuk semua chat sekaligus), **tidak** per chat
seperti `antiunsend`/`groupguard` di bawah. Pengaturan disimpan di `.settings.json` (sudah di `.gitignore`).

**Anti-unsend**: teks, foto, video, dan file yang ditarik dikirim ulang beneran; sticker dan lokasi cukup
detailnya (sticker/lokasi tidak perlu diunduh ulang). Alasannya: begitu pesan ditarik, LINE langsung menolak
unduh ulang isinya (sudah dicoba langsung, HTTP 410 Gone), jadi gambar/video/file harus sudah disimpan
sementara di disk (folder `.antiunsend-cache/`, sudah di `.gitignore`) sebelum ada yang menariknya — ini berarti
bot mengunduh setiap gambar/video/file yang lewat di chat yang dipantau, bukan hanya saat ditarik. Disimpan
maks. 7 hari (dihapus otomatis setelah itu, juga berkas di atas 100 MB tidak dicache sama sekali). Kalau sudah
lewat 7 hari atau gagal tersimpan, cuma jenisnya yang diberi tahu ("sudah tidak bisa diambil ulang").

### Unduh media

| Perintah                   | Fungsi                                        |
| -------------------------- | --------------------------------------------- |
| `tab dl-ig <link>`       | Unduh dari **Instagram**                |
| `tab dl-tiktok <link>`   | Unduh dari **TikTok**                   |
| `tab dl-facebook <link>` | Unduh dari **Facebook**                 |
| `tab dl-twitter <link>`  | Unduh dari **Twitter/X**                |
| `tab dl-yt <link>`       | Unduh dari **YouTube**                  |
| `tab dl-ytmp3 <link>`    | Jalan pintas: langsung audio mp3 dari YouTube |

Tidak perlu pilih mp3/foto/video manual: bot cek langsung dari postingannya, lalu otomatis mengunduh **video**
(kualitas terbaik yang tersedia, sampai 4K di YouTube, dengan suara) atau **foto** (gambar aslinya) sesuai isi
link-nya. Postingan **karusel** (campuran beberapa foto & video dalam satu postingan, umum di Instagram/Facebook)
diunduh semuanya, urut sesuai slide-nya, dan dikirim satu per satu. `dl-ytmp3` adalah jalan pintas khusus YouTube
yang melewati deteksi otomatis di atas dan selalu menghasilkan audio mp3 kualitas terbaik.

**Keterbatasan yang sudah dicek langsung (bukan asumsi), di luar kendali bot ini:**

- **Instagram** sekarang mewajibkan login untuk hampir semua postingan — `dl-ig` kemungkinan besar gagal untuk
  kebanyakan link kecuali sudah diatur cookies-nya (lihat "Cookies untuk dl-*" di bawah). Postingan karusel
  (beberapa foto/video dalam satu postingan) sudah didukung kalau link-nya bisa diakses.
- **Twitter/X**: yt-dlp sendiri tidak mendukung mengambil tweet yang isinya foto saja (hanya video). Untuk itu
  `dl-twitter` punya jalur cadangan lewat endpoint publik syndication Twitter (yang dipakai widget embed resmi,
  tanpa login) supaya tweet foto-saja tetap bisa diunduh, kualitas penuh.
- **YouTube Community post** (`youtube.com/post/<id>`) juga tidak punya extractor di yt-dlp sama sekali. `dl-yt`
  punya jalur cadangan yang membaca data postingannya langsung dari halamannya (tanpa login) untuk link seperti ini.
- **Facebook**: video publik sudah dicoba langsung dan berhasil, tapi banyak postingan Facebook sekarang juga
  mewajibkan login (sama seperti Instagram) — kalau begitu, `dl-facebook` kasih pesan jelas, bukan error mentah yt-dlp,
  kecuali sudah diatur cookies-nya. yt-dlp sendiri juga tidak mengisi thumbnail untuk postingan **foto-saja**
  Facebook (beda dengan Instagram) — `dl-facebook` punya jalur cadangan yang membaca gambarnya langsung dari
  halaman postingannya (lewat User-Agent crawler resmi Facebook) untuk kasus ini.
- **TikTok** video publik sudah dicoba langsung dan berhasil.

Setiap perintah hanya menerima link dari platformnya sendiri — kalau link-nya dari platform lain, bot kasih tahu
perintah yang benar. Hasil dikirim ke chat ini; di atas ±200 MB (per item) ditolak (batas upload LINE). File
sementara otomatis dihapus setelah selesai/gagal.

### Cookies untuk dl-* (opsional, buat postingan yang butuh login)

Instagram/Facebook/dll sekarang sering mewajibkan login untuk melihat suatu postingan. Kalau itu terjadi, `dl-*`
bisa dibuat ikut berhasil dengan memberinya **cookies** dari akun yang sudah login di browser-mu — **bot tidak
pernah login sendiri**, cuma membaca cookies yang sudah ada.

> **Cookies itu setara password.** Siapa pun yang pegang file cookies-nya bisa menyamar jadi akunmu selama
> sesinya masih berlaku. Taruh di folder `cookies/` (sudah di `.gitignore`), jangan pernah upload/commit/bagikan
> file itu ke mana pun. Kalau curiga bocor, logout semua device dari pengaturan akun itu untuk mencabutnya.

**Cara pasangnya — tidak perlu atur apa pun, cukup taruh filenya (sekali per platform, ulangi kalau sesinya kedaluwarsa):**

1. Pasang ekstensi **"Get cookies.txt LOCALLY"** di Chrome/Edge ([Chrome Web Store](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)), atau **"cookies.txt"** di Firefox. Keduanya ekspor dalam format Netscape yang langsung dipahami yt-dlp.
2. Login seperti biasa (lewat browser, bukan lewat bot) ke platform yang mau diambil cookies-nya (mis. facebook.com).
3. Masih di tab platform itu, klik ikon ekstensinya → **Export** → simpan file-nya. Namanya biasanya otomatis seperti `www.facebook.com_cookies.txt` — **biarkan apa adanya**, tidak perlu diganti nama.
4. Buat folder `cookies/` di root project ini (sejajar `package.json`) kalau belum ada, lalu taruh file itu di situ: `cookies/www.facebook.com_cookies.txt`.
5. Jalankan `npm start` seperti biasa. Selesai — bot otomatis mendeteksi file itu dari namanya (mengandung "facebook.com") setiap kali ada link Facebook yang diunduh. Tidak ada env var yang perlu diatur.

Ulangi langkah 2–4 untuk platform lain yang kamu perlukan (TikTok, Instagram, Twitter/X, YouTube) — satu file per
platform, boleh namanya apa saja asal mengandung domain platformnya (`tiktok.com`, `instagram.com`, `facebook.com`,
`twitter.com`/`x.com`, `youtube.com`). Contoh isi folder `cookies/` dengan lengkap:

```
cookies/
├── www.tiktok.com_cookies.txt
├── www.instagram.com_cookies.txt
├── www.facebook.com_cookies.txt
├── www.x.com_cookies.txt
└── www.youtube.com_cookies.txt
```

Tiap platform berdiri sendiri — taruh cuma yang memang kamu perlukan, sisanya boleh dikosongkan (unduhan tetap
jalan seperti biasa tanpa cookies untuk platform yang filenya belum ada).

**Kalau mau path/nama file lain** (di luar folder `cookies/`), bisa pakai env var sebelum `npm start` — ini dicek
lebih dulu daripada folder `cookies/`:

| Platform  | Env var                    | Contoh                                                     |
| --------- | -------------------------- | ---------------------------------------------------------- |
| TikTok    | `TIKTOK_COOKIES_FILE`    | `export TIKTOK_COOKIES_FILE=/path/lain/tiktok.txt`       |
| Instagram | `INSTAGRAM_COOKIES_FILE` | `export INSTAGRAM_COOKIES_FILE=/path/lain/instagram.txt` |
| Facebook  | `FACEBOOK_COOKIES_FILE`  | `export FACEBOOK_COOKIES_FILE=/path/lain/facebook.txt`   |
| Twitter/X | `TWITTER_COOKIES_FILE`   | `export TWITTER_COOKIES_FILE=/path/lain/twitter.txt`     |
| YouTube   | `YOUTUBE_COOKIES_FILE`   | `export YOUTUBE_COOKIES_FILE=/path/lain/youtube.txt`     |

**Catatan:** sesi cookies bisa kedaluwarsa (logout dari HP, ganti password, dll.) — kalau `dl-*` yang sebelumnya
berhasil mulai gagal lagi dengan pesan butuh login, ekspor ulang dari langkah 2–3 di atas.

### Cari media

| Perintah                           | Fungsi                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `tab search-yt <kata kunci>`     | Cari video **YouTube** (resmi lewat yt-dlp), 10 hasil teratas                             |
| `tab search-tiktok <kata kunci>` | Cari video **TikTok**, 10 hasil teratas                                                   |
| `tab lanjut`                     | 10 hasil berikutnya dari pencarian terakhir di chat ini (11-20, 21-30, dst.)                    |
| `tab pilih <nomor>`              | Detail satu hasil (judul/caption + pembuat + link), siap ditempel ke `tab dl-*` untuk diunduh |

Pencarian Instagram/Facebook/Twitter(X) **belum didukung** — ketiganya mewajibkan login akun di situsnya untuk bisa
mencari sama sekali, jadi tidak bisa dilakukan lewat bot ini. Pencarian TikTok memakai Chrome headless (lihat
"Kebutuhan" di atas) karena TikTok mewajibkan permintaan pencariannya ditandatangani oleh skrip TikTok sendiri;
karena itu hasilnya terbatas pada satu kali pengambilan dari platform TikTok (biasanya puluhan item), bukan
keterbatasan dari sisi bot.

### Flex Message (lewat LIFF)

| Perintah                                                            | Fungsi                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `tab liff <id>`                                                   | Atur LIFF app yang dipakai untuk mengirim Flex (`tab liff` untuk melihat, `tab liff reset` untuk menghapus)                   |
| `tab flex <judul> \| <isi> [\| <label tombol> \| <link>] [\| opsi…]` | Kirim kartu Flex ke chat ini dengan gaya dan tema bawaan (atau yang dipilih lewat opsi)                                           |
| `tab flexgaya`                                                    | Lihat gaya dan tema bawaan beserta daftar gaya                                                                                    |
| `tab flexgaya <gaya> [tema]`                                      | Ganti gaya dan/atau tema bawaan (tersimpan), mis. `tab flexgaya bisnis biru`                                                    |
| `tab flexgaya contoh [gaya]`                                      | Kirim contoh semua gaya (atau satu gaya) dengan tema bawaan; tambah `gambar:https://…` untuk gambarmu                          |
| `tab flexgaya reset`                                              | Kembalikan ke gaya `chino` tema `pink`                                                                                        |
| `tab flexgaleri <url> \| <keterangan> \| <url> …`                  | Carousel gambar (maks. 10, semua https)                                                                                           |
| `tab flexjson <json>`                                             | Kirim Flex dari JSON mentah (`bubble` atau `carousel`), susun di [Flex Simulator](https://developers.line.biz/flex-simulator/) |

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
>
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

| Perintah                | Fungsi                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `tab linkgrup`        | Aktifkan dan kirim link grup. Membuat link baru, jadi link lama tidak berlaku lagi |
| `tab join <link>`     | Gabung grup lewat link (`https://line.me/R/ti/g/...`) atau tiketnya              |
| `tab namagrup <nama>` | Ganti nama grup (maks. 50 karakter)                                                |
| `tab invite @teman`   | Undang lewat mention, atau `tab invite <id pengguna>`                            |
| `tab tendang @orang`  | Keluarkan orang yang di-mention (butuh hak admin grup)                             |
| `tab keluar`          | Keluar dari grup. Minta konfirmasi: ketik `tab keluar ya`                        |

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

| Perintah              | Fungsi              |
| --------------------- | ------------------- |
| `npm start`         | Jalankan bot        |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm test`          | Jalankan unit test  |

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
  main.ts          titik masuk TANPA Group Guard
  main-proteksi.ts titik masuk DENGAN Group Guard (proteksi anti-kick-massal, tab groupguard)
  start.ts         dijalankan oleh `npm start`; pilih salah satu di atas (lihat di bawah)
scripts/           tes live manual
```

### `npm start`: dengan atau tanpa Group Guard

`npm start` menjalankan `src/start.ts`, yang memilih salah satu titik masuk:

- Kalau `src/main-proteksi.ts` **ada**, kamu ditanya di terminal: "Pakai Group Guard (proteksi anti-kick-massal)?" — jawab `y`/`n`.
- Kalau filenya **tidak ada** (mis. sengaja dihapus), bot langsung jalan **tanpa** Group Guard, tanpa ditanya.

File yang terlibat untuk Group Guard: `src/application/group-guard-proteksi.ts`, `src/presentation/commands-proteksi.ts`,
`src/presentation/help-proteksi.ts`, `src/presentation/line-bot-proteksi.ts`, `src/main-proteksi.ts`. Menghapus
file-file itu (minimal `src/main-proteksi.ts`) membuat bot jalan tanpa fitur `tab groupguard` sama sekali.

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
