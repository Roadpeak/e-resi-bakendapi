import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { normaliseDomain } from './properties/custom-domain';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
    // Webhook signatures are computed over the exact bytes sent. Re-serialising
    // the parsed JSON changes key order and whitespace, so the signature would
    // never match — keep the raw payload available.
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Security
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // Local uploads (sandbox storage fallback when Cloudinary is not configured).
  // Served before enableCors(), so set the headers here — <video> and WebGL
  // textures issue cross-origin requests and fail without them.
  app.use(
    '/uploads',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range,Content-Type');
      // Range headers must be readable for a browser to seek within a video
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    },
    express.static(join(process.cwd(), 'uploads'), { acceptRanges: true }),
  );

  // CORS
  const rawOrigin = config.get<string>('FRONTEND_URL', 'http://localhost:3000');
  const allowedOrigins = rawOrigin.split(',').map((o) => o.trim());
  // Always include common dev ports so the API works regardless of which port Next.js binds to
  const devOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
  const origins = Array.from(new Set([...allowedOrigins, ...devOrigins]));
  // A development served on its own domain calls this API from that origin,
  // so registered custom domains are allowed too. Looked up rather than
  // listed in config, with a short cache so a domain added in admin works
  // within a minute and a flood of unknown origins costs one query each.
  const prisma = app.get(PrismaService);
  const domainCache = new Map<string, { ok: boolean; at: number }>();
  const isCustomDomainOrigin = async (origin: string) => {
    let host: string;
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:') return false;
      host = normaliseDomain(url.hostname);
    } catch {
      return false;
    }
    const hit = domainCache.get(host);
    if (hit && Date.now() - hit.at < 60_000) return hit.ok;
    const ok = !!(await prisma.property.findFirst({
      where: { customDomain: host }, select: { id: true },
    }));
    if (domainCache.size > 5000) domainCache.clear();
    domainCache.set(host, { ok, at: Date.now() });
    return ok;
  };
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || origins.includes(origin)) return cb(null, true);
      // Free development addresses: <subdomain>.e-resi.com.
      if (/^https:\/\/[a-z0-9-]+\.e-resi\.com$/.test(origin)) return cb(null, true);
      isCustomDomainOrigin(origin).then((ok) => cb(null, ok), () => cb(null, false));
    },
    credentials: true,
  });

  // Global prefix
  const prefix = config.get('API_PREFIX', 'api');
  app.setGlobalPrefix(prefix);

  // Global pipes, filters, interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('e-resi API')
    .setDescription('e-resi Immersive Real Estate Platform — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer(`http://localhost:${config.get('PORT', 4000)}`)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`\n🚀 e-resi API running at http://localhost:${port}/${prefix}`);
  console.log(`📖 Swagger docs at http://localhost:${port}/${prefix}/docs\n`);
}
bootstrap();
