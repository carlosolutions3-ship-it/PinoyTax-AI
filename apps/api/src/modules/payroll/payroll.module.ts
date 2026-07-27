import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';

@Module({
  imports: [TaxEngineModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
