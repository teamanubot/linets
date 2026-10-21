import type { ChatMessage, MediaKind } from "../domain/chat.ts";
import type { BotSettings, GroupGateway, MediaStore, Notifier, PeopleDirectory, ProfileGateway, SettingsStore } from "../domain/ports.ts";
import { DEFAULT_SETTINGS } from "../domain/ports.ts";

export const buf = (text: string) => Buffer.from(text);

export class FakeProfile implements ProfileGateway {
  calls: string[] = [];
  video = false;

  async setDisplayName(name: string) {
    this.calls.push(`setDisplayName:${name}`);
  }
  async setStatusMessage(text: string) {
    this.calls.push(`setStatusMessage:${text}`);
  }
  async hasVideo() {
    return this.video;
  }
  async setImage(jpg: Buffer) {
    this.calls.push(`setImage:${jpg}`);
  }
  async setImageKeepVideo(jpg: Buffer) {
    this.calls.push(`setImageKeepVideo:${jpg}`);
  }
  async setVideo(video: Buffer, image: Buffer) {
    this.calls.push(`setVideo:${video}+${image}`);
  }
  async setVideoKeepImage(video: Buffer) {
    this.calls.push(`setVideoKeepImage:${video}`);
  }
}

export class FakeGroups implements GroupGateway {
  calls: string[] = [];
  groupMembers: Record<string, string[]> = {};

  async createInviteLink(chatId: string) {
    this.calls.push(`createInviteLink:${chatId}`);
    return `https://line.me/R/ti/g/TICKET_${chatId}`;
  }
  async joinByTicket(ticketId: string) {
    this.calls.push(`joinByTicket:${ticketId}`);
    return "Grup Uji";
  }
  async rename(chatId: string, name: string) {
    this.calls.push(`rename:${chatId}:${name}`);
  }
  async invite(chatId: string, userIds: string[]) {
    this.calls.push(`invite:${chatId}:${userIds.join(",")}`);
  }
  async kick(chatId: string, userIds: string[]) {
    this.calls.push(`kick:${chatId}:${userIds.join(",")}`);
  }
  async leave(chatId: string) {
    this.calls.push(`leave:${chatId}`);
  }
  async members(chatId: string) {
    this.calls.push(`members:${chatId}`);
    return this.groupMembers[chatId] ?? [];
  }
}

export class FakeStore implements MediaStore {
  saved: Array<{ data: string; kind: MediaKind }> = [];

  async save(data: Buffer, kind: MediaKind) {
    this.saved.push({ data: data.toString(), kind });
    return `./downloads/file-${this.saved.length}`;
  }
}

export class FakeNotifier implements Notifier {
  sent: string[] = [];

  async notify(text: string) {
    this.sent.push(text);
  }
}

export class FakePeople implements PeopleDirectory {
  constructor(private readonly names: Record<string, string> = {}) {}

  async displayName(userId: string) {
    return this.names[userId] ?? userId;
  }
}

export class FakeSettingsStore implements SettingsStore {
  saved: BotSettings[] = [];

  constructor(private current: BotSettings = structuredClone(DEFAULT_SETTINGS)) {}

  async load() {
    return structuredClone(this.current);
  }
  async save(settings: BotSettings) {
    this.current = structuredClone(settings);
    this.saved.push(structuredClone(settings));
  }
}

export interface FakeMessageOptions {
  id?: string;
  senderId?: string;
  text?: string;
  fromSelf?: boolean;
  mediaKind?: MediaKind | null;
  data?: string;
  chatId?: string;
  isGroupChat?: boolean;
  mentionedIds?: string[];
  replied?: FakeMessage | null;
}

export class FakeMessage implements ChatMessage {
  replies: string[] = [];
  readonly id: string;
  readonly senderId: string;
  readonly isFromSelf: boolean;
  readonly mediaKind: MediaKind | null;
  readonly chatId: string;
  readonly isGroupChat: boolean;
  readonly mentionedIds: string[];
  private readonly data: string;
  private readonly body: string;
  private readonly replied: FakeMessage | null;

  constructor(options: FakeMessageOptions = {}) {
    this.id = options.id ?? "m1";
    this.senderId = options.senderId ?? "uSELF";
    this.isFromSelf = options.fromSelf ?? true;
    this.body = options.text ?? "";
    this.mediaKind = options.mediaKind ?? null;
    this.data = options.data ?? "";
    this.chatId = options.chatId ?? "cGROUP";
    this.isGroupChat = options.isGroupChat ?? true;
    this.mentionedIds = options.mentionedIds ?? [];
    this.replied = options.replied ?? null;
  }

  get text() {
    return this.body;
  }
  async reply(text: string) {
    this.replies.push(text);
  }
  async downloadMedia() {
    return buf(this.data);
  }
  async repliedMessage() {
    return this.replied;
  }
}
