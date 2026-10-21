import type { Client } from "@tab/linets";
import type { ApiProbe } from "../../domain/ports.ts";

/** Ping lewat `talk.noop`, panggilan paling ringan ke server chat LINE. */
export class LineApiProbe implements ApiProbe {
  constructor(private readonly client: Client) {}

  async ping(): Promise<void> {
    await this.client.base.talk.noop();
  }
}
