'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText } from '@/components/ui';
import { aiApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { AiMessage, ConfidenceFlag } from '@/lib/types';

const MAX_MESSAGE_LENGTH = 4000; // matches SendMessageDto's server-side limit

const CONFIDENCE_LABEL: Record<ConfidenceFlag, { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  grounded: { label: 'Grounded in sources', tone: 'green' },
  low_confidence: { label: 'Low confidence', tone: 'amber' },
  missing_info: { label: 'Missing information', tone: 'slate' },
};

function conversationStorageKey(companyId: string): string {
  return `pinoytax_ai_conversation_${companyId}`;
}

export default function AiAssistantPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <AiAssistantContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function AiAssistantContent({ companyId }: { companyId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedId = sessionStorage.getItem(conversationStorageKey(companyId));
    if (!storedId) {
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const conversation = await aiApi.getConversation(companyId, storedId);
        setConversationId(conversation.id);
        setMessages(conversation.messages ?? []);
      } catch {
        // Stale/invalid stored id (e.g. from a different account) — start fresh silently.
        sessionStorage.removeItem(conversationStorageKey(companyId));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startNewConversation = useCallback(() => {
    sessionStorage.removeItem(conversationStorageKey(companyId));
    setConversationId(null);
    setMessages([]);
    setError(null);
  }, [companyId]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    setError(null);
    setIsSending(true);
    setDraft('');
    // Optimistically show the user's message immediately.
    setMessages((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        conversationId: conversationId ?? '',
        sender: 'user',
        content,
        retrievedSources: null,
        confidenceFlag: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const conversation = await aiApi.startConversation(companyId);
        activeConversationId = conversation.id;
        setConversationId(conversation.id);
        sessionStorage.setItem(conversationStorageKey(companyId), conversation.id);
      }
      const assistantMessage = await aiApi.sendMessage(companyId, activeConversationId, content);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Tax Assistant</h1>
        <Button variant="secondary" onClick={startNewConversation}>
          New conversation
        </Button>
      </div>

      <Card className="flex h-[60vh] flex-col">
        <div className="flex-1 overflow-y-auto pr-2">
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {!isLoading && messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
              Ask about BIR/SSS/PhilHealth/Pag-IBIG filing requirements, deadlines, or forms. Answers are grounded
              in PinoyTax AI&apos;s regulatory database — the assistant will tell you when it doesn&apos;t know
              something rather than guess. For computed peso amounts, use the Tax and Payroll tools.
            </div>
          )}
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
          <div ref={bottomRef} />
        </div>

        <ErrorText>{error}</ErrorText>

        <form onSubmit={handleSend} className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Ask a question…"
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <Button type="submit" isLoading={isSending} disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.sender === 'user';
  const confidence = message.confidenceFlag ? CONFIDENCE_LABEL[message.confidenceFlag] : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${isUser ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && confidence && (
          <div className="mt-2">
            <Badge tone={confidence.tone}>{confidence.label}</Badge>
          </div>
        )}
        {!isUser && message.retrievedSources && message.retrievedSources.length > 0 && (
          <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
            <p className="font-medium">Sources</p>
            <ul className="mt-1 list-inside list-disc">
              {message.retrievedSources.map((s, i) => (
                <li key={i}>
                  {s.label}
                  {s.sourceReference ? ` — ${s.sourceReference}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
