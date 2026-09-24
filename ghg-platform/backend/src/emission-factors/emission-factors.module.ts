import { Module } from '@nestjs/common';
import { EmissionFactorsController } from './emission-factors.controller';
import { EmissionFactorsService } from './emission-factors.service';

@Module({
  controllers: [EmissionFactorsController],
  providers: [EmissionFactorsService],
})
export class EmissionFactorsModule {}
