import { Module } from '@nestjs/common';
import { TaxEngineController } from './tax-engine.controller';
import { TaxEngineService } from './tax-engine.service';

@Module({
  controllers: [TaxEngineController],
  providers: [TaxEngineService],
  exports: [TaxEngineService],
})
export class TaxEngineModule {}
