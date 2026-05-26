import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { RequireAnyPermission } from '../auth/permissions.decorator';
import { OssService } from './oss.service';

const MAX_IMAGE_BYTES = Number(process.env.OSS_MAX_IMAGE_BYTES || 5 * 1024 * 1024);

@Controller(['files', 'api/files'])
export class FilesController {
  constructor(private readonly oss: OssService) {}

  @Post('upload-image')
  @RequireAnyPermission('page.prd', 'page.requirements', 'page.specification')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  uploadMarkdownImage(@UploadedFile() file: Express.Multer.File) {
    return this.oss.uploadMarkdownImage(file);
  }
}
