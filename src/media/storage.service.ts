import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { randomBytes } from 'crypto';

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

  constructor(private readonly config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME', '');
    this.baseFolder = config.get<string>('CLOUDINARY_FOLDER', 'e-resi');

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
    const resourceType = this.resourceTypeFor(mimeType);
    const publicId = this.buildPublicId(folder);

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: resourceType,
            // keep the original filename as context for the media library
            context: { original_name: originalName },
            overwrite: false,
          },
          (err, res) => (err || !res ? reject(err ?? new Error('Empty upload response')) : resolve(res)),
        );
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

  async delete(key: string): Promise<void> {
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
    _mimeType: string,
    _expiresIn = 300,
  ): Promise<{
    uploadUrl: string;
    key: string;
    fileUrl: string;
    fields: Record<string, string | number>;
  }> {
    const publicId = this.buildPublicId(folder);
    const timestamp = Math.floor(Date.now() / 1000);
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET', '');
    const signature = cloudinary.utils.api_sign_request(
      { public_id: publicId, timestamp },
      apiSecret,
    );

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`,
      key: publicId,
      // final URL depends on the detected resource type — image is the common case
      fileUrl: `https://res.cloudinary.com/${this.cloudName}/image/upload/${publicId}`,
      fields: {
        public_id: publicId,
        timestamp,
        signature,
        api_key: this.config.get<string>('CLOUDINARY_API_KEY', ''),
      },
    };
  }
}
