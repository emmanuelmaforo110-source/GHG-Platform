import { Module } from '@nestjs/common';
import { ReportingPeriodsController } from './reporting-periods.controller';
import { ReportingPeriodsService } from './reporting-periods.service';
import { ActivityDataModule } from '../activity-data/activity-data.module';

@Module({
  imports: [ActivityDataModule], // reuse CalculationEngineService for the recalculation-threshold check
  controllers: [ReportingPeriodsController],
  providers: [ReportingPeriodsService],
})
export class ReportingPeriodsModule {}
