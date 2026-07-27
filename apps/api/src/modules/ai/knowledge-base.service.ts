import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RetrievedSource {
  type: 'tax_rule' | 'form_template';
  id: string;
  label: string;
  sourceReference: string | null;
  content: string;
}

/**
 * Retrieval layer for the AI Tax Assistant's RAG pipeline (Phase 1 §6.1).
 *
 * This is a LEXICAL (keyword-overlap) retriever over the curated
 * tax_engine.tax_rules and forms.form_templates tables. It intentionally
 * does NOT call out to any external knowledge — the assistant is grounded
 * only in what this platform's regulatory content owners have entered and
 * verified.
 *
 * Production hardening path: replace `scoreOverlap` with embedding-based
 * similarity search (e.g. pgvector) once the knowledge base grows past what
 * keyword overlap can retrieve reliably. The service's public interface
 * (`retrieve`) is written so that swap doesn't require changes in
 * AiAssistantService.
 */
@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(query: string, limit = 5): Promise<RetrievedSource[]> {
    const terms = this.tokenize(query);
    if (terms.length === 0) return [];

    const [rules, forms] = await Promise.all([
      this.prisma.taxRule.findMany({
        where: { effectiveTo: null },
        include: { ratesHistory: true },
      }),
      this.prisma.formTemplate.findMany(),
    ]);

    const ruleCandidates: RetrievedSource[] = rules.map((rule) => ({
      type: 'tax_rule' as const,
      id: rule.id,
      label: rule.ruleCode,
      sourceReference: rule.sourceReference,
      content: [
        rule.ruleCode,
        rule.description ?? '',
        rule.appliesTo ?? '',
        ...rule.ratesHistory.map(
          (r) => `rate ${r.rateValue} effective ${r.effectiveFrom.toISOString().slice(0, 10)}`,
        ),
      ].join(' — '),
    }));

    const formCandidates: RetrievedSource[] = forms.map((form) => ({
      type: 'form_template' as const,
      id: form.id,
      label: form.formCode,
      sourceReference: null,
      content: [
        form.formCode,
        form.title,
        form.description ?? '',
        form.purpose ?? '',
        form.filingFrequency ?? '',
      ].join(' — '),
    }));

    const scored = [...ruleCandidates, ...formCandidates]
      .map((candidate) => ({ candidate, score: this.scoreOverlap(terms, candidate.content) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.candidate);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private scoreOverlap(queryTerms: string[], content: string): number {
    const contentTerms = new Set(this.tokenize(content));
    let score = 0;
    for (const term of queryTerms) {
      if (contentTerms.has(term)) score += 1;
    }
    return score;
  }
}
