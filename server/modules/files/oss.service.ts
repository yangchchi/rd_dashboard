import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import OSS from 'ali-oss';
import { randomUUID } from 'node:crypto';

import {
  buildOssObjectKey,
  buildOssPublicUrl,
  extensionForImageMime,
  isAllowedMarkdownImageMime,
  parseOssRegionFromEndpoint,
} from '@shared/oss-upload';

export interface IOssUploadResult {
  url: string;
  objectKey: string;
  mime: string;
  size: number;
}

@Injectable()
export class OssService implements OnModuleInit {
  private readonly logger = new Logger(OssService.name);
  private client: OSS | null = null;

  onModuleInit(): void {
    if (this.isConfigured()) {
      this.logger.log('OSS 图片上传已启用');
    } else {
      this.logger.warn(
        'OSS 未配置：Markdown 图片上传将返回 503。请在 .env 配置 OSS_BUCKET_NAME、OSS_ENDPOINT、OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_ACCESS_URL 后重启后端',
      );
    }
  }

  private getConfig() {
    const bucket = String(process.env.OSS_BUCKET_NAME || '').trim();
    const endpoint = String(process.env.OSS_ENDPOINT || '').trim();
    const accessKeyId = String(process.env.OSS_ACCESS_KEY_ID || '').trim();
    const accessKeySecret = String(process.env.OSS_ACCESS_KEY_SECRET || '').trim();
    const accessUrl = String(process.env.OSS_ACCESS_URL || '').trim();
    const prefix = String(process.env.OSS_PREFIX || 'file').trim() || 'file';
    const maxBytes = Number(process.env.OSS_MAX_IMAGE_BYTES || 5 * 1024 * 1024);

    if (!bucket || !endpoint || !accessKeyId || !accessKeySecret || !accessUrl) {
      return null;
    }

    return { bucket, endpoint, accessKeyId, accessKeySecret, accessUrl, prefix, maxBytes };
  }

  isConfigured(): boolean {
    return this.getConfig() != null;
  }

  private getClient(): OSS {
    if (this.client) return this.client;
    const cfg = this.getConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'OSS 未配置，请在 .env 中设置 OSS_BUCKET_NAME、OSS_ENDPOINT、OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_ACCESS_URL',
      );
    }

    const region = parseOssRegionFromEndpoint(cfg.endpoint);
    const endpointHost = cfg.endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    this.client = new OSS({
      region,
      endpoint: endpointHost,
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      bucket: cfg.bucket,
      secure: true,
    });
    return this.client;
  }

  async uploadMarkdownImage(file: Express.Multer.File): Promise<IOssUploadResult> {
    const cfg = this.getConfig();
    if (!cfg) {
      throw new ServiceUnavailableException('OSS 未配置，无法上传图片');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('未收到图片文件');
    }

    const mime = String(file.mimetype || '').trim();
    if (!isAllowedMarkdownImageMime(mime)) {
      throw new BadRequestException('仅支持 PNG、JPEG、WebP、GIF 图片');
    }

    if (file.size > cfg.maxBytes) {
      const mb = Math.round(cfg.maxBytes / (1024 * 1024));
      throw new BadRequestException(`图片大小不能超过 ${mb}MB`);
    }

    const ext = extensionForImageMime(mime);
    if (!ext) {
      throw new BadRequestException('无法识别图片类型');
    }

    const objectKey = buildOssObjectKey({
      prefix: cfg.prefix,
      ext,
      id: randomUUID(),
    });

    const client = this.getClient();
    try {
      await client.put(objectKey, file.buffer, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`OSS put 失败: ${detail}`);
      throw new InternalServerErrorException(`OSS 上传失败：${detail}`);
    }

    return {
      url: buildOssPublicUrl(cfg.accessUrl, objectKey),
      objectKey,
      mime,
      size: file.size,
    };
  }
}
