import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { BranchController } from './branch.controller';
import { BranchService } from './branch.service';

@Module({
  controllers: [OrgController, BranchController],
  providers: [OrgService, BranchService],
  exports: [OrgService, BranchService],
})
export class OrgModule {}
