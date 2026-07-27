import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ComplianceService } from '../../modules/compliance/compliance.service';
import { QUEUE_NAMES } from '../queue-names';

export interface ComplianceScanJobData {
  companyId: string;
}

@Processor(QUEUE_NAMES.COMPLIANCE_SCAN)
export class ComplianceScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ComplianceScanProcessor.name);

  constructor(private readonly complianceService: ComplianceService) {
    super();
  }

  async process(job: Job<ComplianceScanJobData>): Promise<void> {
    this.logger.log(`Processing compliance scan for company ${job.data.companyId} (job ${job.id})`);
    await this.complianceService.runComplianceScan(job.data.companyId);
  }
}
