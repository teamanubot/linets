import { COMMAND_PREFIX } from "./commands.ts";

interface HelpItem {
  /** Perintah tanpa awalan, mis. "nama <nama>". */
  usage: string;
  summary: string;
}

interface HelpSection {
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
      { usage: "keluar", summary: "keluar dari grup" },
    ],
    guide: [
      "Semua kecuali join dipakai langsung di chat grupnya.",
      "linkgrup → membuat link baru, link lama tidak berlaku lagi.",
      "invite / tendang → mention orangnya (@nama). invite juga bisa pakai id pengguna.",
      "tendang butuh hak admin grup.",
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
      "latar gerak → Flex hanya menganimasikan APNG (bukan GIF) dan mengikuti jumlah putarannya. Pakai assets/latar-coderain.png (tak terbatas) atau ubah GIF: npx tsx scripts/gif-to-apng.ts <gif>. Unggah ke hostingmu.",
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

function renderMenu(note?: string): string {
  const sections = HELP_SECTIONS.map(
    (section) => `${section.icon} ${section.title}\n${section.items.map(formatItem).join("\n")}`,
  );
  return [
    `🤖 MENU BOT LINE\n${LINE}\nAwali perintah dengan "${COMMAND_PREFIX}"`,
    ...(note ? [note] : []),
    sections.join("\n\n"),
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

/** Teks bantuan: menu utama, atau detail satu topik (`tab help cover`). */
export function renderHelp(topic = ""): string {
  const wanted = topic.trim().toLowerCase();
  if (!wanted) return renderMenu();

  const section = HELP_SECTIONS.find((candidate) => candidate.key === wanted);
  return section ? renderTopic(section) : renderMenu(`❓ Topik "${topic.trim()}" tidak ada.`);
}
