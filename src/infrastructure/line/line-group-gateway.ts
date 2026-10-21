import type { Client } from "@tab/linets";
import type { GroupGateway } from "../../domain/ports.ts";

type ChatPatch = Parameters<Awaited<ReturnType<Client["getChat"]>>["updateChat"]>[0]["chat"];

const GROUP_LINK_BASE_URL = "https://line.me/R/ti/g";

/** Operasi grup LINE lewat service `talk`. */
export class LineGroupGateway implements GroupGateway {
  constructor(private readonly client: Client) {}

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

  async kick(chatId: string, userIds: string[]): Promise<void> {
    const chat = await this.client.getChat(chatId);
    for (const userId of userIds) await chat.kick(userId);
  }

  async leave(chatId: string): Promise<void> {
    await (await this.client.getChat(chatId)).leave();
  }
}
