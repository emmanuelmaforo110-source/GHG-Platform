import { Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentsService } from './attachments.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

@Controller('activity-data/:activityDataId/attachments')
@UseGuards(RolesGuard)
export class AttachmentsController {
  constructor(private service: AttachmentsService) {}

  @Get()
  @Roles('admin', 'data_entry', 'management', 'verifier')
  list(@CurrentUser() user: AuthenticatedUser, @Param('activityDataId') activityDataId: string) {
    return this.service.list(user, activityDataId);
  }

  @Post()
  @Roles('admin', 'data_entry') // matches the RBAC table: Management is view-only, cannot upload evidence
  @UseInterceptors(
    // memoryStorage() is required here: attachments.service.ts reads file.buffer to stream straight to
    // S3/MinIO. Without it, Multer defaults to disk storage and file.buffer would be undefined.
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }),
    AuditLogInterceptor,
  )
  @Audit({ action: 'create', entityType: 'attachments' })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityDataId') activityDataId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.upload(user, activityDataId, file);
  }
}
