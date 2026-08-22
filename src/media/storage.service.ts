import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { extname, join } from 'path';

/**
 * Cloudinary's plain upload_stream rejects anything over 100MB. Switching a
 * little below that keeps a safety margin for multipart overhead.
 */
const CHUNKED_UPLOAD_THRESHOLD = 90 * 1024 * 1024;

export type UploadFolder = 'properties' | 'rentals' | 'avatars' | 'logos' | 'documents' | 'tours';

type CloudinaryResourceType = 'image' | 'video' | 'raw';

/**
 * Media storage on Cloudinary.
 *
 * - Images and videos are stored with `resource_type` inferred from the mime
 *   type (everything else goes to `raw`), under `<CLOUDINARY_FOLDER>/<folder>/`.
 * - The `key` we return/accept is `<resourceType>:<publicId>` so deletion
 *   knows which Cloudinary namespace to target.
 * - Delivery URLs are Cloudinary `secure_url`s (CDN-backed, transformable).
 */
/**
 * Where uploaded files live.
 *
 * Two stores, split by what each is good at:
 *
 *   images            Cloudinary — transforms, srcsets, f_auto
 *   video, raw, glb   DigitalOcean Spaces — no meaningful per-file cap
 *
 * Environment:
 *   SPACES_BUCKET, SPACES_REGION, SPACES_ACCESS_KEY, SPACES_SECRET_KEY
 *   SPACES_ENDPOINT       optional, defaults to <region>.digitaloceanspaces.com
 *   SPACES_CDN_BASE_URL   optional, falls back to the origin host
 *
 * With none of those set, everything goes to Cloudinary exactly as before, so
 * the code can ship ahead of the secrets.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly baseFolder: string;
  private readonly cloudName: string;
  /** True when no real Cloudinary credentials exist — files go to local disk. */
  private readonly localMode: boolean;
  private readonly s3: S3Client | null;
  private readonly spacesBucket: string;
  private readonly spacesBase: string;
  private readonly spacesEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME', '');
    this.baseFolder = config.get<string>('CLOUDINARY_FOLDER', 'e-resi');
    this.localMode = !this.cloudName || this.cloudName.startsWith('your_');

    /**
     * Anything that is not an image goes to Spaces.
     *
     * Cloudinary caps non-image files far below images on every plan — 10 MB
     * on the free tier — and a .glb is stored as a raw file, so a scan of any
     * real building is refused. Spaces has no practical per-file limit and
     * costs a fraction of the Cloudinary tier that would lift the cap.
     *
     * Images stay on Cloudinary: transforms, srcsets and f_auto are what it is
     * actually good at, and nothing about an image was ever the problem.
     */
    const bucket = config.get<string>('SPACES_BUCKET', '');
    const region = config.get<string>('SPACES_REGION', 'fra1');
    const accessKey = config.get<string>('SPACES_ACCESS_KEY', '');
    const secretKey = config.get<string>('SPACES_SECRET_KEY', '');

    this.spacesBucket = bucket;
    // Falls back to the origin URL, so the CDN can be switched on in the DO
    // console later without a deploy.
    this.spacesBase = config.get<string>('SPACES_CDN_BASE_URL', '')
      || `https://${bucket}.${region}.digitaloceanspaces.com`;

    // Configured only when there is something to configure — a half-set
    // environment should fall back to Cloudinary rather than fail at upload.
    this.spacesEnabled = Boolean(bucket && accessKey && secretKey)
      && !accessKey.startsWith('your_');

    this.s3 = this.spacesEnabled
      ? new S3Client({
          region,
          endpoint: config.get<string>('SPACES_ENDPOINT', `https://${region}.digitaloceanspaces.com`),
          forcePathStyle: false,
          credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        })
      : null;

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: config.get<string>('CLOUDINARY_API_KEY', ''),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET', ''),
      secure: true,
    });
  }

  private resourceTypeFor(mimeType: string): CloudinaryResourceType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'raw';
  }

  private buildPublicId(folder: UploadFolder): string {
    return `${this.baseFolder}/${folder}/${randomBytes(12).toString('hex')}`;
  }

  /** Reconstruct our `<store>:<id>` key from a delivery URL. */
  keyFromUrl(url: string): string | null {
    // Spaces, with or without the CDN host, and whatever the bucket is called:
    // matching on the provider rather than the bucket name means renaming the
    // bucket does not orphan every file already stored in it.
    const spaces = url.match(/\/\/([^/.]+)\.[^/]*digitaloceanspaces\.com\/(.+)$/);
    if (spaces) return `spaces:${spaces[2]}`;

    // https://res.cloudinary.com/<cloud>/<resource>/upload/[transforms/]v123/<publicId>.<ext>
    const match = url.match(
      /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/,
    );
    if (!match) return null;
    return `${match[1]}:${match[2]}`;
  }

  async upload(
    folder: UploadFolder,
    originalName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ url: string; key: string; sizeBytes: number }> {
    if (this.localMode) return this.uploadLocal(folder, originalName, buffer);

    const resourceType = this.resourceTypeFor(mimeType);

    // Everything that is not an image, when Spaces is configured. See the
    // constructor for why.
    if (this.spacesEnabled && resourceType !== 'image') {
      return this.uploadToSpaces(folder, originalName, buffer, mimeType);
    }

    const publicId = this.buildPublicId(folder);

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const options = {
          public_id: publicId,
          resource_type: resourceType,
          // keep the original filename as context for the media library
          context: { original_name: originalName },
          overwrite: false,
        } as const;

        const callback = (err: unknown, res?: UploadApiResponse) =>
          (err || !res ? reject(err ?? new Error('Empty upload response')) : resolve(res));

        // upload_stream caps at 100MB. Tour videos routinely exceed that, so
        // anything large goes through the chunked uploader instead — same
        // result, sent in pieces Cloudinary will accept.
        const stream = buffer.byteLength > CHUNKED_UPLOAD_THRESHOLD
          ? cloudinary.uploader.upload_chunked_stream(
              { ...options, chunk_size: 20 * 1024 * 1024 },
              callback,
            )
          : cloudinary.uploader.upload_stream(options, callback);

        stream.end(buffer);
      });

      return {
        url: result.secure_url,
        key: `${resourceType}:${result.public_id}`,
        sizeBytes: result.bytes ?? buffer.byteLength,
      };
    } catch (err) {
      const e = err as { http_code?: number; message?: string };
      const message = e?.message ?? String(err);
      const mb = (buffer.byteLength / 1048576).toFixed(1);

      this.logger.error(
        `Cloudinary upload failed: ${publicId} (${resourceType}, ${mb} MB) — `
        + `http ${e?.http_code ?? '?'}: ${message}`,
      );

      /**
       * Say what actually went wrong.
       *
       * A generic 500 sent whoever uploaded a 45 MB model off to check quotas
       * and network — the real cause was a storage limit that no amount of
       * retrying would clear. A size rejection is something the person on the
       * other end can act on, so it is passed through rather than flattened.
       *
       * Cloudinary caps non-image, non-video files far lower than media on
       * every plan, and lower still on the free tier; a .glb travels as raw.
       */
      const tooLarge = e?.http_code === 413
        || /file size too large|maximum is|too large/i.test(message);

      if (tooLarge) {
        throw new BadRequestException(
          `That file is ${mb} MB, which is over the storage limit for this file type. `
          + 'Compress the model with Draco or Meshopt and bake its textures to KTX2 — '
          + 'that usually brings a scan under the limit — or raise the plan\'s raw file cap.',
        );
      }

      throw new InternalServerErrorException(
        `Upload failed: ${message.slice(0, 200)}`,
      );
    }
  }

  /**
   * Store a file in Spaces.
   *
   * Keys keep the `<store>:<id>` shape the rest of the system already uses, so
   * delete() can dispatch on the prefix and older Cloudinary keys keep working
   * untouched.
   */
  private async uploadToSpaces(
    folder: UploadFolder,
    originalName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ url: string; key: string; sizeBytes: number }> {
    const ext = extname(originalName).toLowerCase();
    const key = `${this.baseFolder}/${folder}/${randomBytes(12).toString('hex')}${ext}`;

    try {
      await this.s3!.send(new PutObjectCommand({
        Bucket: this.spacesBucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
        // Keys are random and a file is never rewritten, so anything fetched
        // once can be cached indefinitely.
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      return {
        url: `${this.spacesBase}/${key}`,
        key: `spaces:${key}`,
        sizeBytes: buffer.byteLength,
      };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(
        `Spaces upload failed: ${key} (${(buffer.byteLength / 1048576).toFixed(1)} MB) — ${message}`,
      );
      throw new InternalServerErrorException(`Upload failed: ${message.slice(0, 200)}`);
    }
  }

  /** [SANDBOX] Cloudinary not configured — persist to ./uploads and serve statically. */
  private async uploadLocal(
    folder: UploadFolder,
    originalName: string,
    buffer: Buffer,
  ): Promise<{ url: string; key: string; sizeBytes: number }> {
    const ext = (extname(originalName) || '.bin').toLowerCase();
    const id = randomBytes(12).toString('hex');
    const rel = join(folder, `${id}${ext}`);
    const dir = join(process.cwd(), 'uploads', folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(process.cwd(), 'uploads', rel), buffer);
    const base = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:4000');
    this.logger.warn(`[SANDBOX] Cloudinary not configured — stored ${rel} on local disk`);
    return { url: `${base}/uploads/${folder}/${id}${ext}`, key: `local:${rel}`, sizeBytes: buffer.byteLength };
  }

  async delete(key: string): Promise<void> {
    if (key.startsWith('local:')) {
      await unlink(join(process.cwd(), 'uploads', key.slice(6))).catch(() => {});
      return;
    }

    if (key.startsWith('spaces:')) {
      try {
        await this.s3?.send(new DeleteObjectCommand({
          Bucket: this.spacesBucket,
          Key: key.slice('spaces:'.length),
        }));
      } catch (err) {
        // Same as Cloudinary below: a file left behind costs pennies, a failed
        // response costs the user their action.
        this.logger.warn(`Spaces delete failed: ${key}`, err as Error);
      }
      return;
    }
    const [resourceType, publicId] = key.includes(':')
      ? (key.split(/:(.+)/) as [CloudinaryResourceType, string])
      : (['image', key] as [CloudinaryResourceType, string]);

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (err) {
      // Log but don't throw — deletion failures shouldn't block the response
      this.logger.warn(`Cloudinary delete failed: ${key}`, err as Error);
    }
  }

  /**
   * Signed direct-upload parameters — the client POSTs multipart form-data to
   * `uploadUrl` with the returned `fields` plus its `file`. Cloudinary infers
   * image/video automatically (`auto` endpoint).
   */
  async presignedUploadUrl(
    folder: UploadFolder,
    _originalName: string,
    mimeType: string,
    _expiresIn = 300,
  ): Promise<{
    uploadUrl: string;
    key: string;
    fileUrl: string;
    /** Null when Cloudinary is unconfigured — callers fall back to the API. */
    fields: Record<string, string | number> | null;
    resourceType: CloudinaryResourceType;
    /** False in sandbox: the caller must post to the API instead. */
    direct: boolean;
  }> {
    const resourceType = this.resourceTypeFor(mimeType);

    /**
     * Non-images go through the API when Spaces is in play.
     *
     * upload() routes them to Spaces, so signing a direct-to-Cloudinary upload
     * here would put the same kind of file in two different stores depending
     * on which path the client happened to take — and a video uploaded direct
     * would still meet the cap this move exists to escape. `direct: false`
     * makes the client post to the API instead, which it already handles as
     * the sandbox fallback.
     */
    if (this.spacesEnabled && resourceType !== 'image') {
      return { uploadUrl: '', key: '', fileUrl: '', fields: null, resourceType, direct: false };
    }

    // Without credentials there is nothing to sign, and handing back a URL
    // that cannot work would fail at the browser with no useful error.
    if (this.localMode) {
      return {
        uploadUrl: '',
        key: '',
        fileUrl: '',
        fields: null,
        resourceType,
        direct: false,
      };
    }

    const publicId = this.buildPublicId(folder);
    const timestamp = Math.floor(Date.now() / 1000);
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET', '');

    // Every parameter the browser sends must be in the signature, or
    // Cloudinary rejects the upload. resource_type is part of the URL rather
    // than the form, so it is deliberately not signed here.
    const signature = cloudinary.utils.api_sign_request(
      { public_id: publicId, timestamp },
      apiSecret,
    );

    return {
      // Pinned to the detected resource type rather than `auto`: `auto`
      // decides server-side, which would leave us guessing the delivery URL.
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
      key: `${resourceType}:${publicId}`,
      // Previously hardcoded to /image/, so every direct-uploaded video came
      // back with a URL that 404s.
      fileUrl: `https://res.cloudinary.com/${this.cloudName}/${resourceType}/upload/${publicId}`,
      fields: {
        public_id: publicId,
        timestamp,
        signature,
        api_key: this.config.get<string>('CLOUDINARY_API_KEY', ''),
      },
      resourceType,
      direct: true,
    };
  }
}
