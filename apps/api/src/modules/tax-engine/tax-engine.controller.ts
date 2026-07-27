import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaxEngineService } from './tax-engine.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { ComputeTaxDto } from './dto/compute-tax.dto';
import { Audit } from '../audit/audit.decorator';

@ApiTags('tax-computations')
@ApiBearerAuth('access-token')
@Controller('companies/:companyId/tax-computations')
@UseGuards(PermissionsGuard)
export class TaxEngineController {
  constructor(private readonly taxEngineService: TaxEngineService) {}

  @Post()
  @RequirePermissions('tax:compute')
  async compute(@Param('companyId') companyId: string, @Body() dto: ComputeTaxDto) {
    return this.taxEngineService.compute(companyId, dto);
  }

  @Get()
  @RequirePermissions('tax:compute')
  async list(@Param('companyId') companyId: string) {
    return this.taxEngineService.listForCompany(companyId);
  }

  @Get(':computationId')
  @RequirePermissions('tax:compute')
  async getOne(@Param('companyId') companyId: string, @Param('computationId') computationId: string) {
    return this.taxEngineService.getById(companyId, computationId);
  }

  @Post(':computationId/confirm')
  @RequirePermissions('tax:confirm')
  @Audit({ action: 'tax_computation.confirm', entityType: 'tax_computation' })
  async confirm(@Param('companyId') companyId: string, @Param('computationId') computationId: string) {
    return this.taxEngineService.confirm(companyId, computationId);
  }
}
