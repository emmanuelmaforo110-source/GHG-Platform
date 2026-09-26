import { Module } from '@nestjs/common';
import { OffsetsController } from './offsets.controller';
import { OffsetsService } from './offsets.service';
import { ReductionModule } from '../reduction/reduction.module';

@Module({
  imports: [ReductionModule], // reuses the inventory totals and target progress for claim checks
  controllers: [OffsetsController],
  providers: [OffsetsService],
})
export class OffsetsModule {}
