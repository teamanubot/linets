import type { Client } from "@tab/linets";
import type { GroupGateway } from "../../domain/ports.ts";

type ChatPatch = Parameters<Awaited<ReturnType<Client["getChat"]>>["updateChat"]>[0]["chat"];

const GROUP_LINK_BASE_URL = "https://line.me/R/ti/g";
// Mulai di 10 per gelombang (cepat); begitu RateLimit terdeteksi di satu gelombang, gelombang berikutnya
// otomatis diperkecil (dibagi dua) dan jedanya diperbesar, supaya tidak terus-menerus kena limit.
const DEFAULT_KICK_CONCURRENCY = 10;
const DEFAULT_KICK_BATCH_PAUSE_MS = 200;
const MIN_KICK_CONCURRENCY = 1;
const MAX_KICK_BATCH_PAUSE_MS = 5000;
const DEFAULT_KICK_RATE_LIMIT_BACKOFF_MS = 3000;

export interface LineGroupGatewayOptions {
  kickConcurrency?: number;
  kickBatchPauseMs?: number;
  kickRateLimitBackoffMs?: number;
}

function isRateLimited(error: unknown): boolean {
  const detail = (error as { data?: { message?: string } } | null)?.data?.message ?? "";
  return /rate\s?limit/i.test(`${detail} ${error instanceof Error ? error.message : String(error)}`);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Operasi grup LINE lewat service `talk`. */
export class LineGroupGateway implements GroupGateway {
  private readonly kickConcurrency: number;
  private readonly kickBatchPauseMs: number;
  private readonly kickRateLimitBackoffMs: number;

  constructor(
    private readonly client: Client,
    options: LineGroupGatewayOptions = {},
  ) {
    this.kickConcurrency = options.kickConcurrency ?? DEFAULT_KICK_CONCURRENCY;
    this.kickBatchPauseMs = options.kickBatchPauseMs ?? DEFAULT_KICK_BATCH_PAUSE_MS;
    this.kickRateLimitBackoffMs = options.kickRateLimitBackoffMs ?? DEFAULT_KICK_RATE_LIMIT_BACKOFF_MS;
  }

  async createInviteLink(chatId: string): Promise<string> {
    const chat = await this.client.getChat(chatId);
    // Link tidak bisa dipakai kalau "gabung lewat link" dimatikan di grup.
    await chat.updateChat({
      chat: { chatMid: chatId, extra: { groupExtra: { preventedJoinByTicket: false } } } as unknown as ChatPatch,
      updatedAttribute: "PREVENTED_JOIN_BY_TICKET",
    });
    const { ticketId } = await this.client.base.talk.reissueChatTicket({
      request: { groupMid: chatId, reqSeq: await this.client.base.getReqseq() },
    });
    return `${GROUP_LINK_BASE_URL}/${ticketId}`;
  }

  async joinByTicket(ticketId: string): Promise<string> {
    const { chat } = await this.client.base.talk.findChatByTicket({ request: { ticketId } });
    await this.client.base.talk.acceptChatInvitationByTicket({
      request: { chatMid: chat.chatMid, ticketId, reqSeq: await this.client.base.getReqseq() },
    });
    return chat.chatName;
  }

  async rename(chatId: string, name: string): Promise<void> {
    // Chat.updateName() di LINEJS tidak menyertakan chatMid, sehingga ditolak server.
    const chat = await this.client.getChat(chatId);
    await chat.updateChat({
      chat: { chatMid: chatId, chatName: name },
      updatedAttribute: "NAME",
    });
  }

  async invite(chatId: string, userIds: string[]): Promise<void> {
    await (await this.client.getChat(chatId)).invite(userIds);
  }

  /**
   * Dikirim per gelombang (mulai dari `kickConcurrency`, bawaan 10) supaya lebih cepat dari sekuensial.
   * Begitu satu gelombang kena RateLimit, gelombang berikutnya otomatis diperkecil (dibagi dua) dan
   * jedanya diperbesar — jadi tidak perlu ditebak manual, bot menyesuaikan sendiri selama proses berjalan.
   * Terus jalan walau ada yang gagal; hanya lempar error kalau SEMUA gagal.
   */
  async kick(chatId: string, userIds: string[]): Promise<void> {
    const chat = await this.client.getChat(chatId);
    let lastError: unknown;
    let succeeded = 0;
    let concurrency = this.kickConcurrency;
    let batchPauseMs = this.kickBatchPauseMs;

    for (let i = 0; i < userIds.length; i += concurrency) {
      const batch = userIds.slice(i, i + concurrency);
      const outcomes = await Promise.all(batch.map((userId) => this.kickOne(chat, userId)));

      let batchRateLimited = false;
      for (const outcome of outcomes) {
        if (outcome.ok) succeeded++;
        else lastError = outcome.error;
        if (outcome.rateLimited) batchRateLimited = true;
      }

      if (batchRateLimited && concurrency > MIN_KICK_CONCURRENCY) {
        concurrency = Math.max(MIN_KICK_CONCURRENCY, Math.floor(concurrency / 2));
        batchPauseMs = Math.min(batchPauseMs * 3, MAX_KICK_BATCH_PAUSE_MS);
        console.log(`[kick] RateLimit terdeteksi di gelombang ini. Mengecilkan ke ${concurrency}/gelombang, jeda ${batchPauseMs} ms.`);
      }
      if (i + batch.length < userIds.length) await pause(batchPauseMs);
    }

    if (succeeded === 0 && userIds.length > 0) throw lastError;
  }

  private async kickOne(
    chat: Awaited<ReturnType<Client["getChat"]>>,
    userId: string,
  ): Promise<{ ok: boolean; rateLimited: boolean; error?: unknown }> {
    try {
      await chat.kick(userId);
      return { ok: true, rateLimited: false };
    } catch (error) {
      if (!isRateLimited(error)) {
        // Gagal karena sebab lain (mis. sudah keluar duluan, atau official account yang tidak bisa ditendang
        // lewat cara ini) — dicatat per-id supaya ketahuan siapa yang bermasalah, bukan ditebak-tebak.
        console.log(`[kick] gagal menendang ${userId.slice(0, 8)}…: ${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, rateLimited: false, error };
      }
      console.log(`[kick] kena RateLimit untuk ${userId.slice(0, 8)}…, tunggu ${this.kickRateLimitBackoffMs} ms lalu coba sekali lagi`);
      await pause(this.kickRateLimitBackoffMs);
      try {
        await chat.kick(userId);
        return { ok: true, rateLimited: true };
      } catch (error) {
        return { ok: false, rateLimited: true, error };
      }
    }
  }

  async leave(chatId: string): Promise<void> {
    await (await this.client.getChat(chatId)).leave();
  }

  async members(chatId: string): Promise<string[]> {
    const chat = await this.client.getChat(chatId);
    return Object.keys((chat.raw.extra as unknown as { groupExtra?: { memberMids?: Record<string, unknown> } }).groupExtra?.memberMids ?? {});
  }
}
