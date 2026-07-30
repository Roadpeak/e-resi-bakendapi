import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import { extname } from 'path';

export type UploadFolder = 'properties' | 'rentals' | 'avatars' | 'logos' | 'documents' | 'tours';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnBase: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('AWS_S3_BUCKET', 'homvr-media');
    this.cdnBase = config.get<string>('CDN_BASE_URL', '');

    this.client = new S3Client({
      region: config.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
      // Cloudflare R2 support — set endpoint if provided
      ...(config.get<string>('AWS_ENDPOINT') && {
        endpoint: config.get<string>('AWS_ENDPOINT'),
        forcePathStyle: true,
      }),
    });
  }

  private buildKey(folder: UploadFolder, originalName: string): string {
    const ext = extname(originalName).toLowerCase() || '.bin';
    const id = randomBytes(12).toString('hex');
    return `${folder}/${id}${ext}`;
  }

  private buildUrl(key: string): string {
    return this.cdnBase
      ? `${this.cdnBase}/${key}`
      : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  async upload(
    folder: UploadFolder,
    originalName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ url: string; key: string; sizeBytes: number }> {
    const key = this.buildKey(folder, originalName);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err) {
      this.logger.error(`S3 upload failed: ${key}`, err);
      throw new InternalServerErrorException('File upload failed');
    }

    return { url: this.buildUrl(key), key, sizeBytes: buffer.byteLength };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // Log but don't throw — deletion failures shouldn't block the response
      this.logger.warn(`S3 delete failed: ${key}`, err);
    }
  }

  async presignedUploadUrl(
    folder: UploadFolder,
    originalName: string,
    mimeType: string,
    expiresIn = 300,
  ): Promise<{ uploadUrl: string; key: string; fileUrl: string }> {
    const key = this.buildKey(folder, originalName);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
    return { uploadUrl, key, fileUrl: this.buildUrl(key) };
  }
}
