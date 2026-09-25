import {
  BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ActivityDataService } from './activity-data.service';
import { ImportExportService } from './import-export.service';
import { CreateActivityDataDto } from './dto/create-activity-data.dto';
import { UpdateActivityDataDto } from './dto/update-activity-data.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FacilityScopeGuard } from '../common/guards/facility-scope.guard';
import { AuditLogInterceptor, Audit } from '../common/interceptors/audit-log.interceptor';

// Note: JwtAuthGuard is applied globally in app.module.ts (APP_GUARD), so it's not repeated here.
@Controller('activity-data')
@UseGuards(RolesGuard, FacilityScopeGuard)
@UseInterceptors(AuditLogInterceptor)
export class ActivityDataController {
  constructor(private service: ActivityDataService, private importExport: ImportExportService) {}

  @Get()
  @Roles('admin', 'data_entry', 'management', 'verifier')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('reportingPeriodId') reportingPeriodId?: string,
    @Query('facilityId') facilityId?: string,
  ) {
    return this.service.list(user, reportingPeriodId, facilityId);
  }

  /** CSV template for bulk import (open in Excel, fill in, "Save as" CSV). */
  @Get('import/template')
  @Roles('admin', 'data_entry')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="activity-data-import-template.csv"')
  importTemplate() {
    return this.importExport.templateCsv();
  }

  /**
   * Bulk import from a CSV file. With commit=false (the default) nothing is saved: every row is
   * checked and calculated so the user can review it. With commit=true the rows are saved, but
   * only if every row is valid.
   */
  @Post('import')
  @Roles('admin', 'data_entry')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  @Audit({ action: 'create', entityType: 'activity_data_import' })
  async import(
    @CurrentUser() user: AuthenticatedUser,
    @Query('reportingPeriodId') reportingPeriodId: string,
    @Query('commit') commit: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Attach a CSV file.');
    const result = await this.importExport.importCsv(user, reportingPeriodId, file.buffer.toString('utf8'), commit === 'true');
    req.auditContext = {
      newValue: { fileName: file.originalname, reportingPeriodId, committed: result.committed, created: result.created, summary: result.summary },
    };
    return result;
  }

  /** CSV export of every entry in a reporting period, with the factor and calculation details. */
  @Get('export')
  @Roles('admin', 'data_entry', 'management', 'verifier')
  @Audit({ action: 'export', entityType: 'activity_data' })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query('reportingPeriodId', ParseUUIDPipe) reportingPeriodId: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const { filename, csv } = await this.importExport.exportCsv(user, reportingPeriodId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    req.auditContext = { newValue: { reportingPeriodId, filename } };
    return csv;
  }

  @Post()
  @Roles('admin', 'data_entry')
  @Audit({ action: 'create', entityType: 'activity_data' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateActivityDataDto, @Req() req: any) {
    return this.service.create(user, dto, req);
  }

  @Patch(':id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'update', entityType: 'activity_data' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDataDto,
    @Req() req: any,
  ) {
    return this.service.update(user, id, dto, req);
  }

  @Delete(':id')
  @Roles('admin', 'data_entry')
  @Audit({ action: 'delete', entityType: 'activity_data' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.remove(user, id, req);
  }
}
