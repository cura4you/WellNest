import { useEffect, useRef, useState } from 'react';
import {
  sendChatMessage,
  listChatSessions,
  getChatSession,
  deleteChatSession,
} from '../../services/vaultApi';
import './chat.css';

export default function ChatPanel() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const refreshSessions = async () => {
    try {
      const list = await listChatSessions();
      setSessions(list);
      return list;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => { refreshSessions(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openSession = async (sessionId) => {
    if (sending) return;
    setError('');
    setActiveSessionId(sessionId);
    try {
      const msgs = await getChatSession(sessionId);
      setMessages(msgs);
    } catch (err) {
      setError(err.message);
    }
  };

  const startNewChat = () => {
    if (sending) return;
    setActiveSessionId(null);
    setMessages([]);
    setError('');
  };

  const handleDeleteSession = async (sessionId, event) => {
    event.stopPropagation();
    try {
      await deleteChatSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) startNewChat();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setError('');
    setSending(true);

    const userMessage = { id: `pending-${Date.now()}`, role: 'user', content: text, citations: [] };
    const assistantMessage = { id: `pending-assistant-${Date.now()}`, role: 'assistant', content: '', citations: [], phase: 'searching' };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      let sessionIdForThisMessage = activeSessionId;
      for await (const event of sendChatMessage({ sessionId: activeSessionId, message: text })) {
        if (event.type === 'status') {
          sessionIdForThisMessage = event.sessionId;
          if (event.sessionId) setActiveSessionId(event.sessionId);
          setMessages((prev) => prev.map((m) => m.id === assistantMessage.id ? { ...m, status: event.message } : m));
        } else if (event.type === 'sources') {
          setMessages((prev) => prev.map((m) => m.id === assistantMessage.id ? { ...m, sources: event.sources } : m));
        } else if (event.type === 'citations') {
          sessionIdForThisMessage = event.sessionId;
          if (!activeSessionId) setActiveSessionId(event.sessionId);
          setMessages((prev) => prev.map((m) => (m.id === assistantMessage.id ? { ...m, citations: event.citations, status: 'Preparing an answer…', phase: 'thinking' } : m)));
        } else if (event.type === 'token') {
          setMessages((prev) => prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: m.content + event.content, phase: 'streaming' } : m)));
        } else if (event.type === 'error') {
          setError(event.message);
        } else if (event.type === 'done') {
          setMessages((prev) => prev.map((m) => (m.id === assistantMessage.id ? { ...m, id: event.messageId, phase: 'done' } : m)));
        }
      }
      if (sessionIdForThisMessage) {
        await refreshSessions();
      }
    } catch (err) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessage.id));
    } finally {
      setMessages((prev) => prev.map((m) => m.id === assistantMessage.id ? { ...m, phase: 'done' } : m));
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-panel">
      <aside className="chat-sessions">
        <button type="button" className="btn btn-primary chat-new-btn" onClick={startNewChat}>
          + New Chat
        </button>
        {loadingSessions ? (
          <p className="dashboard-empty-state">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="dashboard-empty-state">No chats yet.</p>
        ) : (
          <ul className="chat-session-list">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={`chat-session-item${s.id === activeSessionId ? ' is-active' : ''}`}
                onClick={() => openSession(s.id)}
              >
                <span className="chat-session-title">{s.title || 'Untitled chat'}</span>
                <button
                  type="button"
                  className="chat-session-delete"
                  aria-label="Delete chat"
                  disabled={sending}
                  onClick={(e) => handleDeleteSession(s.id, e)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="chat-main">
        {error ? <p className="chat-error">{error}</p> : null}

        <div className="chat-messages">
          {messages.length === 0 ? (
            <p className="dashboard-empty-state chat-intro">
              Ask a question about the documents you have access to. MediVault will retrieve relevant excerpts and answer using only that content.
            </p>
          ) : (
            messages.map((m) => {
              const uniqueCitations = m.citations && m.citations.length > 0
                ? [...new Map(m.citations.map((c) => [c.documentId, { ...c, numbers: m.citations.flatMap((item, index) => item.documentId === c.documentId ? [index + 1] : []) }])).values()]
                : [];
              const showStatus = m.role === 'assistant' && !m.content && (m.phase === 'searching' || m.phase === 'thinking');

              return (
                <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
                  {showStatus ? (
                    <div className="chat-status">
                      <span className="chat-status-dots"><span></span><span></span><span></span></span>
                      <span className="chat-status-text">
                        {m.status || (m.phase === 'searching'
                          ? 'Searching your documents…'
                          : uniqueCitations.length > 0
                            ? `Found ${uniqueCitations.length} relevant document${uniqueCitations.length > 1 ? 's' : ''}. Thinking…`
                            : 'Preparing an answer…')}
                      </span>
                    </div>
                  ) : (
                    <div className="chat-bubble-content">
                      {m.content}
                      {m.role === 'assistant' && m.phase === 'streaming' ? <span className="chat-cursor" /> : null}
                    </div>
                  )}
                  {m.sources?.length > 0 && !showStatus && <div className="chat-citations">{m.sources.map((source) => <span className="dashboard-badge chat-citation-badge" key={source.label}>{source.label}</span>)}</div>}
                  {uniqueCitations.length > 0 && !showStatus ? (
                    <div className="chat-citations">
                      {uniqueCitations.map((c) => (
                        <span key={c.documentId} className="dashboard-badge chat-citation-badge">
                          Doc {c.numbers.join(', ')}: {c.documentName || c.originalFilename}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-row">
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your documents…"
            disabled={sending}
            rows={2}
          />
          <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending || !input.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
