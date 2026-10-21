import { FileStorage } from "@tab/linets/storage";
import { buildCard } from "./src/application/flex-cards.ts";
import { LineIdentityProvider } from "./src/infrastructure/line/line-identity.ts";
import { login } from "./src/infrastructure/line/auth.ts";
import { LineFlexSender } from "./src/infrastructure/line/line-flex-sender.ts";

const LOOP = "https://upload.wikimedia.org/wikipedia/commons/1/14/Animated_PNG_example_bouncing_beach_ball.png";
const client = await login(new FileStorage("./.storage-clone.json"));
const target = (await client.fetchJoinedChats()).find((c) => c.name.trim().toLowerCase() === "rmun")!;
const author = await new LineIdentityProvider(client).current();
console.log("pengirim:", author.name, "| foto:", Boolean(author.pictureUrl));
const sender = new LineFlexSender(client);
const cards: Array<[string, any]> = [
  ["D. latar APNG tak terbatas + bar nama/foto", buildCard({ title: "Selamat Pagi", sub: "Latar bergerak terus", label: "Sapaan", text: "Semangat terus ya ✨\nJangan lupa minum air", style: "latar", theme: "biru", imageUrl: LOOP, author })],
  ["E. latar gradien (tanpa gambar) + bar nama/foto", buildCard({ title: "Pengumuman", text: "Rapat dimajukan jam 09.00", style: "latar", theme: "pink", author })],
];
for (const [label, contents] of cards) {
  try { await sender.send(target.mid, "2012143545-DtbO6HNI", label, contents); console.log(`OK    ${label}`); }
  catch (e) { console.log(`GAGAL ${label} -> ${(e as Error).message.slice(-80)}`); }
  await new Promise((r) => setTimeout(r, 2500));
}
console.log("SELESAI");
process.exit(0);
