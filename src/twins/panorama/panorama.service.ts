import { Injectable, Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { StorageService } from '../../media/storage.service.js';
import { CdpSession } from './cdp.js';

/**
 * Panorama baking.
 *
 * A rendered walkthrough moves a camera through geometry, and indoors that is
 * the wrong shape of problem: two rooms have a wall between them, so any
 * straight move between them passes through it, and pathfinding around it
 * needs door positions the model does not record. Every attempt to solve it
 * ends up approximating information that was never captured.
 *
 * The reference viewers sidestep it entirely. Matterport downloads no mesh at
 * all on a walkthrough — its traffic is cubemap JPEGs, six faces per viewpoint
 * — because a visitor there is standing *inside a photograph*, and moving is a
 * crossfade between two of them. There is no camera to collide with anything.
 *
 * This does the same thing from a model rather than a camera rig: render one
 * 360° image per authored waypoint, offline, and let the viewer crossfade
 * between them. It costs a bake step, and buys three things. Transitions
 * cannot clip a wall, because nothing moves. The visitor downloads a few
 * hundred kilobytes of image instead of a mesh. And because the render has no
 * frame budget, it can carry lighting a real-time viewer cannot afford.
 *
 * Off-plan developments keep the live model — a building that does not exist
 * yet cannot be photographed, which is the one thing this approach and
 * Matterport's both give up.
 */

/** Where the camera stood, and what came back. */
export interface BakedPanorama {
  waypointId: string;
  url: string;
  sizeBytes: number;
}

@Injectable()
export class PanoramaService {
  private readonly logger = new Logger(PanoramaService.name);

  constructor(private readonly storage: StorageService) {}

  /** The renderer page and the three.js build it imports. */
  private get assetDir(): string {
    return __dirname;
  }

  /**
   * Whether a bake can run here at all.
   *
   * Chrome is a heavy dependency to assume, and a deployment without it should
   * degrade to the live-model walkthrough rather than fail an upload. Callers
   * check this and skip quietly.
   */
  available(): boolean {
    return !!this.chromePath();
  }

  private chromePath(): string | null {
    const candidates = [
      process.env.CHROME_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ].filter(Boolean) as string[];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  /**
   * Render one panorama per waypoint.
   *
   * `meshUrl` and the waypoint coordinates must be in the same space the
   * viewer uses — the renderer applies the viewer's own centring transform, so
   * a waypoint authored against the viewer lands where it was authored.
   */
  async bake(
    meshUrl: string,
    waypoints: Array<{ id: string; posX: number; posY: number; posZ: number }>,
    opts: { width?: number } = {},
  ): Promise<BakedPanorama[]> {
    const chrome = this.chromePath();
    if (!chrome || !waypoints.length) return [];

    const width = opts.width ?? 4096;
    let server: Server | null = null;
    let browser: ChildProcess | null = null;

    try {
      const { server: s, port } = await this.serveAssets();
      server = s;

      const { browser: b, wsUrl } = await this.launchChrome(chrome);
      browser = b;

      return await this.renderAll(wsUrl, `http://127.0.0.1:${port}/renderer.html`, meshUrl, waypoints, width);
    } catch (err) {
      // A failed bake is not a failed upload. The model is already stored and
      // the live-model walkthrough still works; panoramas are an enhancement.
      this.logger.warn(`Panorama bake failed: ${err instanceof Error ? err.message : err}`);
      return [];
    } finally {
      browser?.kill();
      server?.close();
    }
  }

  /**
   * Serve the renderer page to the browser.
   *
   * On a loopback port rather than a file:// URL: module imports and WebGL
   * both behave differently under file://, and a local origin is what the
   * page would have in production anyway.
   */
  private async serveAssets(): Promise<{ server: Server; port: number }> {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.wasm': 'application/wasm',
      '.json': 'application/json',
    };

    const server = createServer(async (req, res) => {
      const path = (req.url ?? '/').split('?')[0].replace(/^\/+/, '');
      const file = join(this.assetDir, path);
      // Never serve outside the asset directory.
      if (!file.startsWith(this.assetDir) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        // The renderer fetches the model cross-origin.
        'Access-Control-Allow-Origin': '*',
      });
      res.end(await readFile(file));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server, port };
  }

  /** Headless Chrome with a real GPU path, and its DevTools endpoint. */
  private async launchChrome(chrome: string): Promise<{ browser: ChildProcess; wsUrl: string }> {
    const browser = spawn(chrome, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--disable-gpu-sandbox',
      // SwiftShader rather than a real GPU: a server has no display, and a
      // software rasteriser renders this correctly if slowly. Offline is
      // exactly where that trade is acceptable.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      'about:blank',
    ]);

    const wsUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome did not report a debugging port')), 20_000);
      browser.stderr?.on('data', (chunk: Buffer) => {
        const match = /ws:\/\/[^\s]+/.exec(chunk.toString());
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      browser.on('exit', () => {
        clearTimeout(timer);
        reject(new Error('Chrome exited before reporting a debugging port'));
      });
    });

    return { browser, wsUrl };
  }

  /** Drive the page over the DevTools protocol, one waypoint at a time. */
  private async renderAll(
    wsUrl: string,
    pageUrl: string,
    meshUrl: string,
    waypoints: Array<{ id: string; posX: number; posY: number; posZ: number }>,
    width: number,
  ): Promise<BakedPanorama[]> {
    const session = await CdpSession.attach(wsUrl);

    try {
      await session.navigate(pageUrl);
      await session.waitFor('window.__ready === true', 30_000);
      const loaded = await session.evaluate<{ meshes: number; lights: number; unlit: number }>(
        `window.loadModel(${JSON.stringify(meshUrl)})`,
        120_000,
      );
      // Worth saying out loud: an unlit model carries its lighting in its
      // textures, so a dark bake from one is the artist's lighting rather than
      // something the renderer can turn up.
      this.logger.log(
        `Loaded model: ${loaded?.meshes ?? 0} meshes, ${loaded?.lights ?? 0} lights` +
          (loaded?.unlit ? `, ${loaded.unlit} unlit (lighting baked into textures)` : ''),
      );

      const out: BakedPanorama[] = [];
      for (const w of waypoints) {
        const dataUrl = await session.evaluate<string>(
          `window.bake(${w.posX}, ${w.posY}, ${w.posZ}, ${width})`,
          120_000,
        );
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) continue;

        const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
        const stored = await this.storage.upload('tours', `pano-${w.id}.jpg`, buffer, 'image/jpeg');
        out.push({ waypointId: w.id, url: stored.url, sizeBytes: stored.sizeBytes });
        this.logger.log(`Baked panorama for waypoint ${w.id} (${Math.round(buffer.length / 1024)} KB)`);
      }
      return out;
    } finally {
      await session.close();
    }
  }
}
