"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = require("crypto");
const path_1 = require("path");
let StorageService = StorageService_1 = class StorageService {
    config;
    logger = new common_1.Logger(StorageService_1.name);
    client;
    bucket;
    cdnBase;
    constructor(config) {
        this.config = config;
        this.bucket = config.get('AWS_S3_BUCKET', 'homvr-media');
        this.cdnBase = config.get('CDN_BASE_URL', '');
        this.client = new client_s3_1.S3Client({
            region: config.get('AWS_REGION', 'us-east-1'),
            credentials: {
                accessKeyId: config.get('AWS_ACCESS_KEY_ID', ''),
                secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', ''),
            },
            ...(config.get('AWS_ENDPOINT') && {
                endpoint: config.get('AWS_ENDPOINT'),
                forcePathStyle: true,
            }),
        });
    }
    buildKey(folder, originalName) {
        const ext = (0, path_1.extname)(originalName).toLowerCase() || '.bin';
        const id = (0, crypto_1.randomBytes)(12).toString('hex');
        return `${folder}/${id}${ext}`;
    }
    buildUrl(key) {
        return this.cdnBase
            ? `${this.cdnBase}/${key}`
            : `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    async upload(folder, originalName, buffer, mimeType) {
        const key = this.buildKey(folder, originalName);
        try {
            await this.client.send(new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                CacheControl: 'public, max-age=31536000, immutable',
            }));
        }
        catch (err) {
            this.logger.error(`S3 upload failed: ${key}`, err);
            throw new common_1.InternalServerErrorException('File upload failed');
        }
        return { url: this.buildUrl(key), key, sizeBytes: buffer.byteLength };
    }
    async delete(key) {
        try {
            await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        }
        catch (err) {
            this.logger.warn(`S3 delete failed: ${key}`, err);
        }
    }
    async presignedUploadUrl(folder, originalName, mimeType, expiresIn = 300) {
        const key = this.buildKey(folder, originalName);
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: mimeType,
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn });
        return { uploadUrl, key, fileUrl: this.buildUrl(key) };
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StorageService);
//# sourceMappingURL=storage.service.js.map