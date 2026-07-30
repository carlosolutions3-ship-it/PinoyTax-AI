import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
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

  // BullMQ's default retry/backoff (see queue.module.ts) silently drops a
  // job into Redis once every attempt is exhausted — nobody is paged. This
  // at least puts a distinguishable error-level log line in front of
  // whatever alerting is watching structured logs, for the specific case
  // that actually needs a human: final-attempt failure, not a retry that's
  // about to succeed.
  @OnWorkerEvent('failed')
  onFailed(job: Job<ComplianceScanJobData>, error: Error): void {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      this.logger.error(
        `Compliance scan job ${job.id} for company ${job.data.companyId} failed permanently after ${attempts} attempts: ${error.message}`,
        error.stack,
      );
    } else {
      this.logger.warn(
        `Compliance scan job ${job.id} for company ${job.data.companyId} failed (attempt ${job.attemptsMade}/${attempts}), will retry: ${error.message}`,
      );
    }
  }
}
