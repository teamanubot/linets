import type { ChatMessage, MediaKind } from "../domain/chat.ts";
import type { ImageShape, MediaProcessor, PictureGateway } from "../domain/ports.ts";

/** Alur yang bisa dimulai pengguna: `tab pp`, `tab vp`, `tab vp2`. */
export type FlowName = "pp" | "vp" | "vp2";

type Step = "pp-image" | "vp-image" | "vp-video" | "vp2-video";

interface Session {
  step: Step;
  expiresAt: number;
  /** Foto yang sudah dikirim pada langkah sebelumnya (hanya alur `vp`). */
  image?: Buffer;
}

export interface ProfileFlowDeps {
  /** Tujuan perubahan: foto profil atau cover. */
  profile: PictureGateway;
  media: MediaProcessor;
  /** Nama untuk pesan ke pengguna, default foto profil. */
  labels?: { still: string; video: string };
  /** Bentuk gambar, default persegi. */
  shape?: ImageShape;
  /** Batas durasi video (detik); video lebih panjang dipotong. Default tanpa batas. */
  maxVideoSeconds?: number;
  /** Batas waktu tiap langkah, default 2 menit. */
  stepTimeoutMs?: number;
  now?: () => number;
}

const DEFAULT_STEP_TIMEOUT_MS = 2 * 60_000;

const FLOW_START: Record<FlowName, { step: Step; prompt: (still: string) => string }> = {
  pp: { step: "pp-image", prompt: () => "Kirimkan fotonya." },
  vp: { step: "vp-image", prompt: (still) => `Kirim foto dulu (jadi gambar ${still}), lalu videonya.` },
  vp2: { step: "vp2-video", prompt: (still) => `Kirim videonya (${still} tidak diubah).` },
};

const EXPECTED_MEDIA: Record<Step, MediaKind> = {
  "pp-image": "image",
  "vp-image": "image",
  "vp-video": "video",
  "vp2-video": "video",
};

const toMegabytes = (data: Buffer) => (data.length / 1024 / 1024).toFixed(1);

/**
 * Alur ganti foto profil yang butuh beberapa pesan.
 * Hanya satu alur aktif dalam satu waktu; tiap langkah kedaluwarsa setelah `stepTimeoutMs`.
 */
export class ProfileFlow {
  private session: Session | null = null;
  private readonly stepTimeoutMs: number;
  private readonly now: () => number;
  private readonly labels: { still: string; video: string };
  private readonly shape: ImageShape;

  private readonly stepHandlers: Record<Step, (message: ChatMessage, session: Session) => Promise<void>> = {
    "pp-image": (message) => this.replaceImage(message),
    "vp-image": (message) => this.receiveVideoImage(message),
    "vp-video": (message, session) => this.replaceVideoAndImage(message, session),
    "vp2-video": (message) => this.replaceVideoOnly(message),
  };

  constructor(private readonly deps: ProfileFlowDeps) {
    this.stepTimeoutMs = deps.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    this.now = deps.now ?? Date.now;
    this.labels = deps.labels ?? { still: "foto profil", video: "video profil" };
    this.shape = deps.shape ?? "square";
  }

  /** Mulai alur dan minta pengguna mengirim media pertama. */
  async start(name: FlowName, message: ChatMessage): Promise<void> {
    const { step, prompt } = FLOW_START[name];
    this.begin(step);
    await message.reply(prompt(this.labels.still));
  }

  cancel(): void {
    this.session = null;
  }

  get isActive(): boolean {
    return this.session !== null && this.session.expiresAt > this.now();
  }

  /** Proses gambar/video yang masuk. Mengembalikan true kalau pesan ini dipakai oleh alur yang sedang aktif. */
  async handleMedia(message: ChatMessage): Promise<boolean> {
    if (!message.mediaKind || !this.isActive || !this.session) return false;

    const session = this.session;
    const expected = EXPECTED_MEDIA[session.step];
    if (message.mediaKind !== expected) {
      const wanted = expected === "video" ? "video" : "gambar";
      await message.reply(`Yang diminta saat ini: ${wanted}. Ketik "tab batal" untuk membatalkan.`);
      return true;
    }

    await this.stepHandlers[session.step](message, session);
    return true;
  }

  private begin(step: Step, image?: Buffer): void {
    this.session = { step, image, expiresAt: this.now() + this.stepTimeoutMs };
  }

  private async replaceImage(message: ChatMessage): Promise<void> {
    const { profile, media } = this.deps;
    const jpg = await media.toJpeg(await message.downloadMedia(), this.shape);
    const keepsVideo = await profile.hasVideo();

    if (keepsVideo) await profile.setImageKeepVideo(jpg);
    else await profile.setImage(jpg);

    this.session = null;
    await message.reply(
      keepsVideo
        ? `✅ Berhasil: ${this.labels.still} sudah diganti, ${this.labels.video} tidak diubah.`
        : `✅ Berhasil: ${this.labels.still} (gambar) sudah diganti.`,
    );
  }

  private async receiveVideoImage(message: ChatMessage): Promise<void> {
    const jpg = await this.deps.media.toJpeg(await message.downloadMedia(), this.shape);
    this.begin("vp-video", jpg);
    await message.reply("Foto diterima. Sekarang kirim videonya.");
  }

  private async replaceVideoAndImage(message: ChatMessage, session: Session): Promise<void> {
    const { profile, media } = this.deps;
    await message.reply("Video diterima, sedang memproses...");
    const video = await this.prepareVideo(await message.downloadMedia());
    const image = session.image ?? (await media.extractFrame(video, this.shape));
    await profile.setVideo(video, image);

    this.session = null;
    await message.reply(
      `✅ Berhasil: ${this.labels.video} sudah diganti (${toMegabytes(video)} MB)${this.limitNote()}. ` +
        "Gambar = foto yang kamu kirim, video diputar saat dibuka.",
    );
  }

  private async replaceVideoOnly(message: ChatMessage): Promise<void> {
    await message.reply("Video diterima, sedang memproses...");
    const video = await this.prepareVideo(await message.downloadMedia());
    await this.deps.profile.setVideoKeepImage(video);

    this.session = null;
    await message.reply(
      `✅ Berhasil: ${this.labels.video} sudah diganti (${toMegabytes(video)} MB)${this.limitNote()}, ${this.labels.still} tidak diubah.`,
    );
  }

  private prepareVideo(video: Buffer): Promise<Buffer> {
    const { maxVideoSeconds, media } = this.deps;
    return maxVideoSeconds ? media.trimVideo(video, maxVideoSeconds) : Promise.resolve(video);
  }

  private limitNote(): string {
    return this.deps.maxVideoSeconds ? `, maks. ${this.deps.maxVideoSeconds} detik` : "";
  }
}
