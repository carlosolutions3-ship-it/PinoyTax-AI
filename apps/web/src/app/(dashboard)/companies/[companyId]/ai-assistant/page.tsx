'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Send, Sparkles } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/lib/auth-context';
import { aiApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { AiMessage, ConfidenceFlag } from '@/lib/types';

const MAX_MESSAGE_LENGTH = 4000; // matches SendMessageDto's server-side limit

const CONFIDENCE_LABEL: Record<ConfidenceFlag, { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  grounded: { label: 'Grounded in sources', tone: 'green' },
  low_confidence: { label: 'Low confidence', tone: 'amber' },
  missing_info: { label: 'Missing information', tone: 'slate' },
};

const SUGGESTED_PROMPTS = [
  'When is the 2551Q percentage tax return due this quarter?',
  "What's the difference between VAT and percentage tax registration?",
  'What are the SSS, PhilHealth, and Pag-IBIG contribution deadlines?',
  'What documents do I need to file BIR Form 1701Q?',
];

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
  const { user } = useAuth();
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
  }, [messages, isSending]);

  const startNewConversation = useCallback(() => {
    sessionStorage.removeItem(conversationStorageKey(companyId));
    setConversationId(null);
    setMessages([]);
    setError(null);
  }, [companyId]);

  const sendContent = useCallback(
    async (content: string) => {
      if (!content || isSending) return;
      setError(null);
      setIsSending(true);
      setDraft('');
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
    },
    [companyId, conversationId, isSending],
  );

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    await sendContent(draft.trim());
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Tax Assistant</h1>
            <p className="text-xs text-slate-500">Grounded in PinoyTax AI&apos;s regulatory database</p>
          </div>
        </div>
        <Button variant="secondary" onClick={startNewConversation}>
          New conversation
        </Button>
      </div>

      <Card padded={false} className="flex h-[65vh] flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {!isLoading && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Sparkles className="h-7 w-7" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-slate-800">Ask about BIR, SSS, PhilHealth, or Pag-IBIG</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  Filing requirements, deadlines, and forms. The assistant will tell you when it doesn&apos;t know
                  something rather than guess — for computed peso amounts, use the Tax and Payroll tools.
                </p>
              </div>
              <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendContent(prompt)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs text-slate-600 shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} userName={user ? `${user.firstName} ${user.lastName}` : 'You'} />
            ))}
            {isSending && <TypingIndicator />}
          </div>
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-200 p-4">
          <ErrorText>{error}</ErrorText>
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="Ask a question…"
              maxLength={MAX_MESSAGE_LENGTH}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <Button type="submit" isLoading={isSending} disabled={!draft.trim()}>
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Send</span>
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, userName }: { message: AiMessage; userName: string }) {
  const isUser = message.sender === 'user';
  const confidence = message.confidenceFlag ? CONFIDENCE_LABEL[message.confidenceFlag] : null;

  return (
    <div className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <Avatar name={userName} size="sm" />
      ) : (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? 'rounded-tr-sm bg-brand-600 text-white'
            : 'rounded-tl-sm border border-slate-200 bg-white text-slate-900 shadow-soft'
        }`}
      >
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
