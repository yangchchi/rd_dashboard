import { Module } from '@nestjs/common';

import { FilesController } from './files.controller';
import { OssService } from './oss.service';

@Module({
  controllers: [FilesController],
  providers: [OssService],
  exports: [OssService],
})
export class FilesModule {}
