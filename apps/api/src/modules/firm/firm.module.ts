import { Module } from '@nestjs/common';
import { FirmController } from './firm.controller';
import { FirmService } from './firm.service';
import { FirmInsightsService } from './firm-insights.service';

@Module({
  controllers: [FirmController],
  providers: [FirmService, FirmInsightsService],
  exports: [FirmService],
})
export class FirmModule {}
