import { Module } from '@nestjs/common';
import { ReductionController } from './reduction.controller';
import { ReductionService } from './reduction.service';

@Module({
  controllers: [ReductionController],
  providers: [ReductionService],
  exports: [ReductionService],
})
export class ReductionModule {}
