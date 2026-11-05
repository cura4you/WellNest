import { useState, type KeyboardEvent } from 'react';
import { sendChatMessage } from '../services/vaultApi';
import { FileIcon, SendIcon, SparkleIcon } from './icons';

interface ChatTurn {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

let nextTurnId = 1;

export function AiAssistantCard({ onOpenFullChat }: { onOpenFullChat: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userTurn: ChatTurn = { id: nextTurnId++, role: 'user', content: text };
    const assistantTurn: ChatTurn = { id: nextTurnId++, role: 'assistant', content: '' };
    setTurns((prev) => [...prev, userTurn, assistantTurn]);

    try {
      for await (const event of sendChatMessage({ sessionId: sessionId ?? undefined, message: text })) {
        if (event.type === 'citations') {
          if (!sessionId) setSessionId(event.sessionId);
        } else if (event.type === 'token') {
          setTurns((prev) =>
            prev.map((t) => (t.id === assistantTurn.id ? { ...t, content: t.content + event.content } : t))
          );
        } else if (event.type === 'error') {
          setTurns((prev) =>
            prev.map((t) => (t.id === assistantTurn.id ? { ...t, content: event.message, isError: true } : t))
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat request failed.';
      setTurns((prev) => prev.map((t) => (t.id === assistantTurn.id ? { ...t, content: message, isError: true } : t)));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mv-card mv-ai-card">
      <div className="mv-ai-head">
        <SparkleIcon size={15} filled />
        <span className="mv-card-title">AI Assistant</span>
        <span className="mv-ai-tag">Your records</span>
      </div>

      {turns.length > 0 ? (
        <div className="mv-ai-body">
          {turns.map((turn) =>
            turn.role === 'user' ? (
              <div key={turn.id} className="mv-bubble-user">
                {turn.content}
              </div>
            ) : (
              <div key={turn.id} className={turn.isError ? 'mv-bubble-error' : 'mv-bubble-ai'}>
                {turn.content || '…'}
              </div>
            )
          )}
        </div>
      ) : (
        <div className="mv-ai-body">
          <div className="mv-bubble-ai" style={{ color: 'var(--mv-text-faint)' }}>
            Ask a question about your documents — I'll search your vault and cite what I used.
          </div>
        </div>
      )}

      <div className="mv-ai-input-row">
        <input
          className="mv-ai-input"
          placeholder="Ask about your records…"
          aria-label="Ask about your records"
          value={input}
          disabled={sending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="mv-ai-send" aria-label="Send message" onClick={handleSend} disabled={sending || !input.trim()}>
          <SendIcon size={13} />
        </button>
      </div>

      <div className="mv-ai-footer-link">
        <button type="button" onClick={onOpenFullChat}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <FileIcon size={11} /> Open full chat & history
          </span>
        </button>
      </div>
    </div>
  );
}
