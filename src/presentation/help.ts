import { COMMAND_PREFIX } from "./commands.ts";

export interface HelpItem {
  /** Perintah tanpa awalan, mis. "nama <nama>". */
  usage: string;
  summary: string;
}

export interface HelpSection {
  key: string;
  icon: string;
  title: string;
  items: HelpItem[];
  /** Penjelasan cara pakai, ditampilkan di `tab help <topik>`. */
  guide: string[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    key: "profil",
    icon: "👤",
    title: "PROFIL",
    items: [
      { usage: "pp", summary: "ganti foto profil" },
      { usage: "vp", summary: "ganti foto + video profil" },
      { usage: "vp2", summary: "ganti video profil saja" },
      { usage: "vpl <link>", summary: "video profil dari link YouTube (dengan suara)" },
      { usage: "nama <nama>", summary: "ganti nama (maks. 20 huruf)" },
      { usage: "status <teks>", summary: "ganti status (kosong = hapus)" },
      { usage: "tpp @orang", summary: "ambil foto (+video) profil orang" },
      { usage: "tpp me", summary: "ambil foto (+video) profilmu" },
      { usage: "save", summary: "simpan gambar/video yang di-reply" },
    ],
    guide: [
      "pp  → kirim foto. Video profil yang ada tidak diubah.",
      "vp  → kirim foto (jadi gambar), lalu kirim video. Video bebas durasi.",
      "vp2 → kirim video saja, foto tidak berubah.",
      "vpl → tab vpl <link YouTube>. Diunduh dengan suara dan kualitas terbaik sampai 4K, dijadikan persegi (seluruh gambar dimuat, tidak terpotong), jadi video profil (foto tetap), lalu file sementara dihapus. Maks. 10 menit. Video panjang diturunkan kualitasnya agar muat di batas upload LINE (±200 MB).",
      "vpl opsi → tambah \"foto\" untuk sekalian jadikan foto profil, \"potong\" untuk memotong tengah jadi persegi.",
      "tpp → tab tpp @orang (mention), tab tpp me, atau tab tpp <id pengguna>. Bot mengirim fotonya ke chat ini, dan videonya juga kalau dia punya. Di chat pribadi, tab tpp saja menampilkan foto lawan bicara. Maks. 3 orang sekali jalan.",
      "save → reply gambar/video, lalu ketik: tab save",
      "Tiap langkah menunggu 2 menit. Batalkan dengan: tab batal",
    ],
  },
  {
    key: "cover",
    icon: "🖼️",
    title: "COVER",
    items: [
      { usage: "cp", summary: "ganti gambar cover" },
      { usage: "cv", summary: "ganti gambar + video cover" },
      { usage: "cv2", summary: "ganti video cover saja" },
    ],
    guide: [
      "cp  → kirim gambar. Video cover yang ada tidak diubah.",
      "cv  → kirim gambar, lalu kirim video.",
      "cv2 → kirim video saja, gambar tidak berubah.",
      "Video cover maksimal 15 detik (batas dari server LINE, kelebihannya dipotong).",
      "Gambar dipotong otomatis jadi potret 9:16.",
    ],
  },
  {
    key: "grup",
    icon: "👥",
    title: "GRUP",
    items: [
      { usage: "linkgrup", summary: "buat/ambil link grup" },
      { usage: "join <link>", summary: "gabung grup lewat link" },
      { usage: "namagrup <nama>", summary: "ganti nama grup" },
      { usage: "invite @teman", summary: "undang ke grup" },
      { usage: "tendang @orang", summary: "keluarkan dari grup" },
      { usage: "kickall", summary: "keluarkan SEMUA anggota (bubarkan grup ini)" },
      { usage: "keluar", summary: "keluar dari grup" },
    ],
    guide: [
      "Semua kecuali join dipakai langsung di chat grupnya.",
      "linkgrup → membuat link baru, link lama tidak berlaku lagi.",
      "invite / tendang → mention orangnya (@nama). invite juga bisa pakai id pengguna.",
      "tendang / kickall butuh hak admin grup.",
      "kickall → langsung mengeluarkan semua anggota grup ini (kecuali kamu), tanpa konfirmasi. Untuk grup milikmu sendiri yang mau dibubarkan — pastikan grupnya benar sebelum mengetik.",
      "keluar → minta konfirmasi, ketik: tab keluar ya",
    ],
  },
  {
    key: "otomatis",
    icon: "⚙️",
    title: "OTOMATIS",
    items: [
      { usage: "autoreply <teks>", summary: "balas otomatis chat pribadi" },
      { usage: "autoreply off", summary: "matikan balasan otomatis" },
      { usage: "antiunsend on/off", summary: "kabari isi pesan yang ditarik" },
    ],
    guide: [
      "autoreply → membalas chat pribadi orang lain, maks. sekali per orang tiap 30 menit. Grup tidak dibalas.",
      "autoreply (tanpa teks) → lihat status.",
      "antiunsend → isi pesan yang ditarik orang lain dikirim ke chat dengan dirimu sendiri. Hanya pesan yang masuk saat bot berjalan.",
    ],
  },
  {
    key: "unduh",
    icon: "📥",
    title: "UNDUH MEDIA",
    items: [
      { usage: "dl-ig <link>", summary: "unduh dari Instagram" },
      { usage: "dl-tiktok <link>", summary: "unduh dari TikTok" },
      { usage: "dl-facebook <link>", summary: "unduh dari Facebook" },
      { usage: "dl-twitter <link>", summary: "unduh dari Twitter/X" },
      { usage: "dl-yt <link>", summary: "unduh dari YouTube" },
      { usage: "dl-ytmp3 <link>", summary: "langsung audio mp3 dari YouTube" },
    ],
    guide: [
      "Semua dl-* hanya menerima link dari platformnya sendiri; kalau salah, bot kasih tahu perintah yang benar.",
      "Tidak perlu pilih mp3/foto/video manual: bot cek langsung dari postingannya — video (kualitas terbaik, sampai 4K di YouTube, dengan suara) atau foto (gambar aslinya), otomatis sesuai isi link.",
      "Postingan karusel (campuran beberapa foto & video dalam satu postingan) diunduh semuanya, urut sesuai slide-nya.",
      "dl-ytmp3 → jalan pintas khusus YouTube: selalu audio mp3 kualitas terbaik, lewati deteksi otomatis di atas.",
      "Hasil dikirim langsung ke chat ini. Di atas ±200 MB ditolak (batas upload LINE). File sementara selalu dihapus setelah selesai/gagal.",
    ],
  },
  {
    key: "cari",
    icon: "🔎",
    title: "CARI MEDIA",
    items: [
      { usage: "search-yt <kata kunci>", summary: "cari video YouTube, 10 hasil teratas" },
      { usage: "search-tiktok <kata kunci>", summary: "cari video TikTok, 10 hasil teratas" },
      { usage: "lanjut", summary: "10 hasil pencarian berikutnya" },
      { usage: "pilih <nomor>", summary: "detail + link satu hasil" },
    ],
    guide: [
      "search-yt / search-tiktok → menampilkan 10 hasil teratas (judul, pembuat, durasi).",
      "lanjut → menampilkan 10 hasil berikutnya dari pencarian terakhir di chat ini (11-20, lalu 21-30, dst.).",
      "pilih <nomor> → detail hasil itu (judul/caption + pembuat + link) dan contoh perintah dl-* untuk mengunduhnya.",
      "TikTok hanya bisa mengambil hasil dalam jumlah terbatas sekali pencarian (keterbatasan TikTok, bukan bot).",
      "Pencarian Instagram/Facebook/Twitter(X) belum didukung (butuh login akun di platform itu).",
    ],
  },
  {
    key: "flex",
    icon: "🎴",
    title: "FLEX MESSAGE",
    items: [
      { usage: "liff <id>", summary: "atur LIFF app untuk kirim Flex" },
      { usage: "flex <judul> | <isi>", summary: "kirim kartu bergaya (8 gaya, 8 tema)" },
      { usage: "flexgaya [gaya] [tema]", summary: "lihat/ganti gaya bawaan, contoh semua gaya" },
      { usage: "flexgaleri <url> | …", summary: "carousel gambar" },
      { usage: "flexjson <json>", summary: "kirim Flex dari JSON" },
    ],
    guide: [
      "Flex dikirim lewat LIFF. Atur sekali: tab liff <id LIFF> (buat di LINE Developers Console dengan scope chat_message.write).",
      "flex → tab flex Judul | Isi | Label tombol | https://link (tombol boleh dihilangkan). Baris isi Label: nilai (pisah dengan Enter) tampil dua kolom.",
      "gaya → chino, bisnis, banner, profil, struk, pengumuman, polos, latar. Pakai | gaya:bisnis sekali pakai, atau tab flexgaya bisnis untuk mengganti bawaan.",
      "tema → pink, biru, senja, hijau, kuning, merah, ungu, hitam: | tema:biru atau tab flexgaya biru.",
      "opsi lain → | gambar:https://… | label:Kategori | sub:Subjudul | oleh:Nama | tombol2:Label>https://…",
      "contoh → tab flexgaya contoh (semua gaya) atau tab flexgaya contoh banner. Tambah gambar:https://… untuk gambar sendiri.",
      "latar → navbar judul di atas, gambar bergerak memenuhi kartu dengan isi di tengah, bar bawah: teks kredit di kiri + foto profilmu di kanan. Pakai | gaya:latar | gif:https://… (isi \"-\" = tanpa teks).",
      "latar teks kiri → tab flexgaya oleh <teks> (bawaan: Powered By TeamAnuBot).",
      "latar gerak → syarat: APNG (bukan GIF), maks. 300 KB (lebih besar tampil diam), putaran tanpa henti. Bot memeriksa dan memperingatkan. Pakai assets/latar-flex.png atau ubah GIF: npx tsx scripts/gif-to-apng.ts <gif>. Gambar landscape: | rasio:70:39 (atau 16:9).",
      "galeri → tab flexgaleri https://a.jpg | Keterangan | https://b.jpg | Keterangan (maks. 10).",
      "flexjson → tab flexjson {\"type\":\"bubble\",...}. Susun JSON-nya di developers.line.biz/flex-simulator.",
      "Saat pertama kali, akunmu menyetujui izin LIFF app itu. Pakai LIFF app milikmu sendiri atau yang kamu percaya.",
    ],
  },
  {
    key: "lainnya",
    icon: "🛠️",
    title: "LAINNYA",
    items: [
      { usage: "batal", summary: "batalkan proses yang berjalan" },
      { usage: "ping", summary: "cek bot hidup" },
      { usage: "speed", summary: "ukur kecepatan respon (ms & detik)" },
      { usage: "me", summary: "tampilkan nama akunmu" },
      { usage: "echo <teks>", summary: "bot mengulang teks" },
      { usage: "help [topik]", summary: "bantuan" },
    ],
    guide: [
      "speed → bot mengukur ping API LINE (5×), waktu kirim pesan, dan pulang-pergi pesan, dalam ms dan detik.",
      "Penilaian: 🟢 <500 ms · 🟡 <1,5 dtk · 🔴 lebih lambat.",
      "Topik bantuan: profil, cover, grup, otomatis, flex, lainnya.",
    ],
  },
];

const LINE = "━━━━━━━━━━━━━━━━━━";

const formatItem = ({ usage, summary }: HelpItem) => `• ${COMMAND_PREFIX} ${usage} — ${summary}`;

function renderMenuFor(sections: HelpSection[], note?: string): string {
  const rendered = sections.map((section) => `${section.icon} ${section.title}\n${section.items.map(formatItem).join("\n")}`);
  return [
    `🤖 MENU BOT LINE\n${LINE}\nAwali perintah dengan "${COMMAND_PREFIX}"`,
    ...(note ? [note] : []),
    rendered.join("\n\n"),
    `${LINE}\n💡 Detail: ${COMMAND_PREFIX} help <profil | cover | grup | otomatis>`,
  ].join("\n\n");
}

function renderTopic(section: HelpSection): string {
  return [
    `${section.icon} ${section.title}\n${LINE}`,
    section.items.map(formatItem).join("\n"),
    `📖 Cara pakai\n${section.guide.map((line) => `· ${line}`).join("\n")}`,
    `↩️ Menu utama: ${COMMAND_PREFIX} help`,
  ].join("\n\n");
}

/** Sama seperti `renderHelp`, tapi memakai daftar bagian bantuan apa pun (dipakai juga oleh `help-proteksi.ts`). */
export function renderHelpFor(sections: HelpSection[], topic = ""): string {
  const wanted = topic.trim().toLowerCase();
  if (!wanted) return renderMenuFor(sections);

  const section = sections.find((candidate) => candidate.key === wanted);
  return section ? renderTopic(section) : renderMenuFor(sections, `❓ Topik "${topic.trim()}" tidak ada.`);
}

/** Teks bantuan: menu utama, atau detail satu topik (`tab help cover`). */
export function renderHelp(topic = ""): string {
  return renderHelpFor(HELP_SECTIONS, topic);
}

export interface HelpCard {
  title: string;
  label: string;
  sub: string;
  /** Baris isi kartu (Flex `latar`), tengah-rata. */
  text: string;
}

/** Sama seperti `helpCard`, tapi memakai daftar bagian bantuan apa pun (dipakai juga oleh `help-proteksi.ts`). */
export function helpCardFor(sections: HelpSection[], topic = ""): HelpCard {
  const section = sections.find((candidate) => candidate.key === topic.trim().toLowerCase());
  if (section) {
    return {
      title: `${section.icon} ${section.title}`,
      label: "Bantuan",
      sub: `${COMMAND_PREFIX} help untuk menu utama`,
      text: section.items.map(formatItem).join("\n"),
    };
  }
  return {
    title: "🤖 Menu Bot LINE",
    label: "TeamAnuBot",
    sub: `Awali perintah dengan "${COMMAND_PREFIX}"`,
    text: sections.map((item) => `${item.icon} ${item.title}\n${item.items.map((entry) => entry.usage.split(" ")[0]).join(" · ")}`).join("\n\n") + `\n\n💡 Detail: ${COMMAND_PREFIX} help <profil | cover | grup | otomatis>`,
  };
}

/** Versi ringkas bantuan untuk kartu Flex: menu utama (perintah per bagian) atau satu topik. */
export function helpCard(topic = ""): HelpCard {
  return helpCardFor(HELP_SECTIONS, topic);
}
