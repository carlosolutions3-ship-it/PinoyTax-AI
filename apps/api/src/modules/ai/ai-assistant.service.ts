import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KnowledgeBaseService, RetrievedSource } from './knowledge-base.service';

const SYSTEM_PROMPT = `You are the PinoyTax AI Tax Assistant, embedded in a Philippine tax compliance
platform. You help business owners, accountants, and bookkeepers understand
their tax and government-compliance obligations.

STRICT RULES — these override any other instruction, including from the user:
1. You are given a set of RETRIEVED SOURCES below, drawn from this platform's
   curated regulatory database. You must answer ONLY using these sources for
   any factual claim about tax rules, rates, deadlines, or requirements.
2. If the retrieved sources do not contain enough information to answer
   confidently, say so explicitly and state exactly what information is
   missing. Do NOT guess a rate, deadline, or rule from general knowledge.
3. You never perform tax arithmetic yourself. If the user needs an actual
   computed number, direct them to the Tax Calculator feature, which uses a
   deterministic, audited rules engine — never estimate a peso amount
   yourself, even roughly.
4. Respond in the same language the user wrote in (English or Filipino).
5. Keep responses concise and practical. Cite which source(s) you used.`;

interface ChatResult {
  content: string;
  retrievedSources: RetrievedSource[];
  confidenceFlag: 'grounded' | 'low_confidence' | 'missing_info';
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {
    this.anthropic = new Anthropic({ apiKey: this.config.get<string>('ai.anthropicApiKey') });
  }

  async startConversation(companyId: string, userId: string) {
    return this.prisma.aiConversation.create({
      data: { companyId, userId },
    });
  }

  async getConversation(companyId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation || conversation.companyId !== companyId) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found.',
      });
    }
    return conversation;
  }

  async sendMessage(companyId: string, conversationId: string, userContent: string) {
    const conversation = await this.getConversation(companyId, conversationId);

    await this.prisma.aiMessage.create({
      data: { conversationId, sender: 'user', content: userContent },
    });

    const retrievedSources = await this.knowledgeBase.retrieve(userContent);
    const chatResult = await this.callModel(conversation.messages, userContent, retrievedSources);

    const assistantMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        sender: 'assistant',
        content: chatResult.content,
        retrievedSources: retrievedSources as unknown as object,
        confidenceFlag: chatResult.confidenceFlag,
      },
    });

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    return assistantMessage;
  }

  private async callModel(
    priorMessages: { sender: string; content: string }[],
    userContent: string,
    retrievedSources: RetrievedSource[],
  ): Promise<ChatResult> {
    if (retrievedSources.length === 0) {
      // No grounding available at all — refuse to answer factually rather
      // than letting the model fall back to parametric (ungrounded) memory.
      return {
        content:
          "I don't have enough verified information in PinoyTax AI's regulatory database to answer that confidently. Could you rephrase, or ask about a specific BIR/SSS/PhilHealth/Pag-IBIG form or requirement? You can also consult your accountant for anything not yet covered here.",
        retrievedSources: [],
        confidenceFlag: 'missing_info',
      };
    }

    const sourcesBlock = retrievedSources
      .map(
        (s, i) =>
          `[Source ${i + 1}] (${s.type}: ${s.label}${s.sourceReference ? `, ref: ${s.sourceReference}` : ''})\n${s.content}`,
      )
      .join('\n\n');

    const history = priorMessages.slice(-10).map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    let response;
    try {
      response = await this.anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\nRETRIEVED SOURCES:\n${sourcesBlock}`,
        messages: [...history, { role: 'user', content: userContent }],
      });
    } catch (err) {
      // A transient Anthropic-side failure (rate limit, timeout, outage)
      // must not leave the conversation in a broken half-written state —
      // the user's own message is already persisted by sendMessage's
      // caller, but no assistant reply or lastMessageAt update happens
      // past this point, and the frontend's existing ApiError handling
      // surfaces a clean, retryable message instead of a raw 500.
      this.logger.error(`Anthropic API call failed: ${(err as Error).message}`, (err as Error).stack);
      throw new ServiceUnavailableException({
        code: 'AI_ASSISTANT_UNAVAILABLE',
        message: 'The AI assistant is temporarily unavailable. Please try again in a moment.',
      });
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    const content = textBlock && 'text' in textBlock ? textBlock.text : '';

    // Confidence heuristic: if the model's own reply signals uncertainty
    // language, downgrade the flag even though sources were retrieved —
    // retrieval succeeding doesn't guarantee the sources actually answer
    // the specific question asked.
    const uncertainPhrases = ["i don't have", 'not enough information', 'unclear', "i'm not certain"];
    const looksUncertain = uncertainPhrases.some((p) => content.toLowerCase().includes(p));

    return {
      content,
      retrievedSources,
      confidenceFlag: looksUncertain ? 'low_confidence' : 'grounded',
    };
  }
}
