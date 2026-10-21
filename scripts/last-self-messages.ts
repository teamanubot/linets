/** Utilitas tes: tampilkan beberapa pesan terakhir di chat dengan diri sendiri. Pakai: tsx scripts/last-self-messages.ts [jumlah] */
import { TalkMessage } from "@tab/linets";
import { FileStorage } from "@tab/linets/storage";
import { login } from "../src/infrastructure/line/auth.ts";

const client = await login(new FileStorage("./.storage.json"));
const mid = client.base.profile!.mid;
const { messageBoxes } = await client.base.talk.getMessageBoxes({ messageBoxListRequest: {} });
const box = messageBoxes.find((candidate) => candidate.id === mid);
if (!box) throw new Error("Chat dengan diri sendiri tidak ditemukan.");
const history = await client.base.talk.getPreviousMessagesV2WithRequest({
  request: {
    messageBoxId: box.id,
    endMessageId: { messageId: box.lastDeliveredMessageId.messageId, deliveredTime: box.lastDeliveredMessageId.deliveredTime },
    messagesCount: Number(process.argv[2] ?? 6),
  },
});
for (const raw of history.reverse()) {
  // Pesan E2EE harus didekripsi dulu supaya teksnya terbaca.
  const text = (await TalkMessage.fromRawTalk(raw, client)).text || `[${raw.contentType}]`;
  console.log(new Date(Number(raw.createdTime)).toISOString().slice(11, 19), "|", text.replace(/\n/g, " ").slice(0, 70));
}
process.exit(0);
