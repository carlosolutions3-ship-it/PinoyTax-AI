import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { FormsService } from './forms.service';

@ApiTags('forms')
@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Public()
  @Get()
  async list(@Query('agency') agency?: string) {
    return this.formsService.listForms(agency);
  }

  @Public()
  @Get(':formCode')
  async get(@Param('formCode') formCode: string) {
    return this.formsService.getForm(formCode);
  }

  @Public()
  @Get(':formCode/download')
  async download(@Param('formCode') formCode: string) {
    return this.formsService.getDownloadUrl(formCode);
  }
}
