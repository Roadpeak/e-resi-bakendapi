import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
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
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly baseFolder: string;
  private readonly cloudName: string;
  /** True when no real Cloudinary credentials exist — files go to local disk. */
  private readonly localMode: boolean;

  constructor(private readonly config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME', '');
    this.baseFolder = config.get<string>('CLOUDINARY_FOLDER', 'e-resi');
    this.localMode = !this.cloudName || this.cloudName.startsWith('your_');

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

  /** Reconstruct our `<resourceType>:<publicId>` key from a Cloudinary delivery URL. */
  keyFromUrl(url: string): string | null {
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
      this.logger.error(`Cloudinary upload failed: ${publicId}`, err as Error);
      throw new InternalServerErrorException('File upload failed');
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
