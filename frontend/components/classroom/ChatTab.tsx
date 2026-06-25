'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import { IconMessage, IconSend, IconCornerUpLeft } from '@tabler/icons-react';
import { ChatMessage } from '../VideoRoom';
import Tooltip from './Tooltip';

interface ChatTabProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, targetIdentity?: string, targetName?: string) => void;
  participants: Participant[];
  localParticipant: Participant;
  activeChatTarget: { identity: string; name: string } | null;
  setActiveChatTarget: (target: { identity: string; name: string } | null) => void;
}

export default function ChatTab({
  messages,
  onSendMessage,
  participants,
  localParticipant,
  activeChatTarget,
  setActiveChatTarget,
}: ChatTabProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (activeChatTarget) {
      onSendMessage(inputText.trim(), activeChatTarget.identity, activeChatTarget.name);
    } else {
      onSendMessage(inputText.trim());
    }
    setInputText('');
  };

  const renderMessageText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative h-full">
      {/* Target Selector Bar */}
      <div className="px-4 py-2 border-b border-border/20 bg-surface-light/20 flex items-center gap-2">
        <span className="text-xs text-[#C2CCDE]/50 font-semibold select-none flex-shrink-0">To:</span>
        <div className="relative flex-1">
          <select
            value={activeChatTarget ? activeChatTarget.identity : 'everyone'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'everyone') {
                setActiveChatTarget(null);
              } else {
                const selectedPart = participants.find((p) => p.identity === val);
                if (selectedPart) {
                  setActiveChatTarget({
                    identity: selectedPart.identity,
                    name: selectedPart.name || selectedPart.identity,
                  });
                }
              }
            }}
            className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none pr-8 font-sans font-semibold"
          >
            <option value="everyone">Everyone (Public)</option>
            {participants
              .filter((p) => p.identity !== localParticipant.identity)
              .map((p) => (
                <option key={p.identity} value={p.identity}>
                  {p.name || p.identity} (Private)
                </option>
              ))}
          </select>
          <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-[#C2CCDE]/50">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-foreground/30 space-y-2 select-none">
            <IconMessage className="w-8 h-8 opacity-40" />
            <p className="text-xs font-semibold">Class chat is active</p>
            <p className="text-[10px] max-w-[180px]">
              Messages are ephemeral and disappear if you refresh the page.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isLocal = msg.senderIdentity === localParticipant.identity;
            const isPrivate = !!msg.recipientIdentity;

            if (isPrivate) {
              const isForUs = msg.recipientIdentity === localParticipant.identity;
              const isByUs = msg.senderIdentity === localParticipant.identity;
              if (!isForUs && !isByUs) return null;
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isPrivate
                    ? 'bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-2.5'
                    : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold truncate text-[#C2CCDE]">
                    {isLocal ? 'You' : msg.senderName}
                    {isPrivate && (
                      <span className="text-indigo-400 font-semibold ml-1.5 text-[10px] uppercase tracking-wider select-none">
                        {isLocal ? `(Private to ${msg.recipientName})` : '(Private message)'}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-foreground/35 select-none font-semibold">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 font-medium whitespace-pre-wrap break-words mt-1 leading-relaxed">
                  {renderMessageText(msg.text)}
                </p>
                {!isLocal && isPrivate && (
                  <div className="flex justify-end mt-1">
                    <Tooltip content="Reply here" align="right">
                      <button
                        onClick={() =>
                          setActiveChatTarget({
                            identity: msg.senderIdentity,
                            name: msg.senderName,
                          })
                        }
                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-[11px] font-semibold cursor-pointer transition-colors bg-transparent border-none p-0"
                      >
                        <IconCornerUpLeft className="w-3 h-3 text-indigo-400" />
                        <span className="underline">Reply</span>
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleSend} className="p-3 border-t border-border/30 bg-surface/30 flex gap-2 items-center">
        <input
          type="text"
          placeholder={activeChatTarget ? `Message ${activeChatTarget.name} (privately)...` : "Message everyone..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-[#161a26] border border-white/10 hover:border-white/20 focus:border-primary/50 text-white placeholder-foreground/35 text-sm rounded-xl px-3.5 py-2.5 outline-none transition-all duration-150 font-sans"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="w-10 h-10 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 shadow-md shadow-primary/10 active:scale-95 flex-shrink-0"
        >
          <IconSend className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
