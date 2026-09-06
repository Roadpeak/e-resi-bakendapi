import { WebSocket } from 'ws';

/**
 * The smallest useful Chrome DevTools client.
 *
 * Puppeteer would do this and a great deal more, and pulls its own Chromium
 * download with it — a hundred-odd megabytes added to every deployment to
 * evaluate three expressions in a page. The protocol itself is a JSON-RPC
 * exchange over one socket, and the handful of methods used here are the
 * whole of what a bake needs.
 *
 * Everything runs over the single BROWSER socket, with page commands carrying
 * a sessionId — the "flat" protocol. The first version of this client opened
 * a second socket to /devtools/page/<id>, which desktop Chrome tolerates but
 * Alpine's Chromium does not: the page socket accepted the connection and
 * then never sent a frame, and the bake hung inside a container while
 * passing on every laptop. Flat sessions are the documented modern path and
 * behave identically on both.
 *
 * Every send carries a timeout for the same reason: the failure mode of a
 * debugging socket is silence, not an error, and an unguarded await on a
 * silent socket is a ten-minute mystery instead of a one-line message.
 */
export class CdpSession {
  private nextId = 1;
  private sessionId: string | null = null;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (msg.id === undefined) return; // an event, not a reply
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    });
  }

  /** Connect to the browser, open a page, and attach to it. */
  static async attach(browserWsUrl: string): Promise<CdpSession> {
    const session = await CdpSession.open(browserWsUrl);
    const { targetId } = (await session.send('Target.createTarget', { url: 'about:blank' })) as {
      targetId: string;
    };
    const attached = (await session.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as { sessionId: string };
    session.sessionId = attached.sessionId;
    await session.send('Runtime.enable');
    await session.send('Page.enable');
    return session;
  }

  private static open(url: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      // Large payloads: a 4096×2048 JPEG arrives as one base64 string.
      const socket = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
      // A connect that neither opens nor errors is the hang this client
      // exists to never have again.
      const timer = setTimeout(
        () => reject(new Error(`DevTools socket did not open: ${url}`)),
        15_000,
      );
      socket.once('open', () => {
        clearTimeout(timer);
        resolve(new CdpSession(socket));
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Send one command and await its reply. Page-level commands are routed to
   * the attached target via sessionId; the Target.* setup calls before an
   * attach exist go to the browser itself.
   */
  private send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.socket.send(
        JSON.stringify({ id, method, params, ...(this.sessionId && { sessionId: this.sessionId }) }),
      );
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send('Page.navigate', { url });
  }

  /**
   * Evaluate an expression and await its result.
   *
   * `awaitPromise` matters: every entry point on the renderer page is async,
   * and without it the call returns a Promise handle rather than the image.
   */
  async evaluate<T = unknown>(expression: string, timeoutMs = 30_000): Promise<T> {
    const result = (await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      timeoutMs,
    )) as { result?: { value?: T }; exceptionDetails?: { text: string } };

    if (result.exceptionDetails) {
      throw new Error(`Renderer threw: ${result.exceptionDetails.text}`);
    }
    return result.result?.value as T;
  }

  /** Poll an expression until it is true, or give up. */
  async waitFor(expression: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.evaluate<boolean>(expression).catch(() => false)) return;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}
