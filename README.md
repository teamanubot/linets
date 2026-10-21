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

ffmpeg tidak perlu dipasang sendiri, sudah ikut terpasang lewat `npm install`.

## Menjalankan

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

## Perintah

Bot hanya merespons pesan dari **akunmu sendiri**. Kirim perintah di chat mana pun (misalnya chat "Keep"
atau chat dengan teman). Semua perintah diawali kata `tab`:

### Umum

| Perintah | Fungsi |
| --- | --- |
| `tab help` | Menu perintah per kelompok. `tab help <profil\|cover\|grup\|otomatis>` untuk penjelasan cara pakai tiap kelompok |
| `tab ping` | Cek bot hidup (dibalas `pong`) |
| `tab me` | Tampilkan nama akunmu |
| `tab echo <teks>` | Bot mengulang teks |
| `tab batal` | Batalkan alur yang sedang berjalan |

### Profil

| Perintah | Fungsi |
| --- | --- |
| `tab pp` | Ganti **foto profil** (gambar). Kalau profilmu sudah punya video, videonya tidak diubah |
| `tab vp` | Ganti **gambar + video** profil |
| `tab vp2` | Ganti **video profil saja**, foto tidak diubah |
| `tab nama <nama>` | Ganti nama tampilan (maks. 20 karakter) |
| `tab status <teks>` | Ganti status (maks. 500 karakter); tanpa teks = hapus status |
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
