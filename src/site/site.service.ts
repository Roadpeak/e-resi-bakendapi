import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The homepage's 3D showcase: an outside and an inside model (.glb), uploaded
 * by an admin and edited as ordinary platform settings. Empty values hide the
 * viewer; one model shows without the switch.
 */
const SETTINGS = [
  { key: 'home_3d_exterior_url', value: '', label: 'Homepage 3D — outside model (.glb)', description: 'Shown beside "Our Vision" on the homepage. Leave empty to hide.' },
  { key: 'home_3d_interior_url', value: '', label: 'Homepage 3D — inside model (.glb)', description: 'The "Inside" view of the homepage 3D showcase.' },
  { key: 'home_3d_caption', value: '', label: 'Homepage 3D — caption', description: 'A short line under the viewer, e.g. the development name.' },
  { key: 'home_3d_link', value: '', label: 'Homepage 3D — link', description: 'Optional page the caption links to, e.g. /w-residences-nairobi.' },
] as const;

@Injectable()
export class SiteService implements OnModuleInit {
  private readonly logger = new Logger(SiteService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const s of SETTINGS) {
      await this.prisma.platformSetting.upsert({
        where: { key: s.key }, update: {}, create: { ...s, valueType: 'string', group: 'homepage' },
      }).catch((e) => this.logger.warn(`Setting ${s.key}: ${(e as Error).message}`));
    }
  }

  async home3d() {
    const rows = await this.prisma.platformSetting.findMany({ where: { key: { in: SETTINGS.map((s) => s.key) } } });
    const v = (k: string) => rows.find((r) => r.key === k)?.value?.trim() || null;
    return {
      exterior: v('home_3d_exterior_url'),
      interior: v('home_3d_interior_url'),
      caption: v('home_3d_caption'),
      link: v('home_3d_link'),
    };
  }
}
