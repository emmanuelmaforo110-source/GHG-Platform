import { Module } from '@nestjs/common';
import { ActivityDataController } from './activity-data.controller';
import { ActivityDataService } from './activity-data.service';
import { CalculationEngineService } from './calculation-engine.service';

@Module({
  controllers: [ActivityDataController],
  providers: [ActivityDataService, CalculationEngineService],
  exports: [CalculationEngineService],
})
export class ActivityDataModule {}
