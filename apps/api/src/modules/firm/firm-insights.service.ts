import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface PortfolioInsightInput {
  totalClients: number;
  avgCompliancePercentage: number;
  totalOverdueFilings: number;
  totalOpenCriticalIssues: number;
  totalOpenHighIssues: number;
  clientsNeedingAttention: Array<{
    businessName: string;
    compliancePercentage: number;
    overdueFilings: number;
    openCriticalIssues: number;
  }>;
}

const SYSTEM_PROMPT = `You summarize an accounting firm's client portfolio for the firm's staff.
You are given REAL, already-computed structured data below — never invent a
number, client name, or fact that is not present in it. Your only job is to
prioritize and phrase what's already there.

Rules:
1. Use ONLY the structured data provided. Do not estimate, guess, or add
   any figure not present in it.
2. If the data shows a genuinely clear portfolio (no overdue filings, no
   critical/high issues), say so plainly — do not manufacture urgency.
3. Keep it to 2-4 short sentences: lead with what needs attention first
   (by client name, if any), then a brief overall read of the portfolio.
4. Never perform tax arithmetic or state a computed tax/contribution amount
   yourself — this is a prioritization summary, not a computation.`;

/**
 * Generates a short, grounded natural-language summary of a firm's client
 * portfolio — the "AI insights" surfaced on the Firm Dashboard. Mirrors the
 * AI Tax Assistant's anti-hallucination discipline (AiAssistantService):
 * the model is only ever handed real, already-computed aggregate numbers
 * and asked to prioritize/phrase them, never to originate facts.
 */
@Injectable()
export class FirmInsightsService {
  private readonly logger = new Logger(FirmInsightsService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.anthropic = new Anthropic({ apiKey: this.config.get<string>('ai.anthropicApiKey') });
  }

  async generatePortfolioInsight(input: PortfolioInsightInput): Promise<string | null> {
    if (input.totalClients === 0) {
      return "This firm doesn't have any client companies yet.";
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `STRUCTURED PORTFOLIO DATA:\n${JSON.stringify(input, null, 2)}`,
          },
        ],
      });
      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock && 'text' in textBlock ? textBlock.text : null;
    } catch (err) {
      // The dashboard's other panels are all real computed data and must
      // still render if the model call fails (rate limit, timeout,
      // outage) — this is a soft-fail enhancement, not a hard dependency.
      this.logger.warn(`Portfolio insight generation failed: ${(err as Error).message}`);
      return null;
    }
  }
}
