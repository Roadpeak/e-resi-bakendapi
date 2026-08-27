import { WebSocket } from 'ws';

/**
 * The smallest useful Chrome DevTools client.
 *
 * Puppeteer would do this and a great deal more, and pulls its own Chromium
 * download with it — a hundred-odd megabytes added to every deployment to
 * evaluate three expressions in a page. The protocol itself is a JSON-RPC
 * exchange over one socket, and the three methods used here are the whole of
 * what a bake needs.
 */
export class CdpSession {
  private nextId = 1;
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

  /** Connect to the browser and open a page to drive. */
  static async attach(browserWsUrl: string): Promise<CdpSession> {
    const browser = await CdpSession.open(browserWsUrl);
    const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as {
      targetId: string;
    };
    const base = browserWsUrl.replace(/\/devtools\/browser\/.*$/, '');
    const page = await CdpSession.open(`${base}/devtools/page/${targetId}`);
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    browser.socket.close();
    return page;
  }

  private static open(url: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      // Large payloads: a 4096×2048 JPEG arrives as one base64 string.
      const socket = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
      socket.once('open', () => resolve(new CdpSession(socket)));
      socket.once('error', reject);
    });
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
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
    const result = (await this.withTimeout(
      this.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }),
      timeoutMs,
      expression.slice(0, 60),
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

  private withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      work,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms),
      ),
    ]);
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}
