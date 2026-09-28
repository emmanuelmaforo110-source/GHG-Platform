import {
  Controller, Delete, Get, Param, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentsService } from './attachments.service';
import { safeFileName } from './attachment-key';
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

  /** Downloads one evidence file (all roles, so verifiers can check the bill behind a number). */
  @Get(':id/download')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityDataId') activityDataId: string,
    @Param('id') id: string,
  ) {
    const file = await this.service.download(user, activityDataId, id);
    return new StreamableFile(file.stream, {
      type: file.fileType,
      disposition: `attachment; filename="${safeFileName(file.fileName)}"`,
    });
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

  @Delete(':id')
  @Roles('admin', 'data_entry')
  @UseInterceptors(AuditLogInterceptor)
  @Audit({ action: 'delete', entityType: 'attachments' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityDataId') activityDataId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.remove(user, activityDataId, id, req);
  }
}
