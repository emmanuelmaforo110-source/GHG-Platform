import { Module } from '@nestjs/common';
import { ActivityDataController } from './activity-data.controller';
import { ActivityDataService } from './activity-data.service';
import { CalculationEngineService } from './calculation-engine.service';
import { ImportExportService } from './import-export.service';

@Module({
  controllers: [ActivityDataController],
  providers: [ActivityDataService, CalculationEngineService, ImportExportService],
  exports: [CalculationEngineService, ActivityDataService],
})
export class ActivityDataModule {}
