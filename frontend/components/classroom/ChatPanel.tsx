'use client';

import React from 'react';
import { Participant } from 'livekit-client';
import { IconX, IconMessage, IconHelpCircle, IconSparkles, IconPin } from '@tabler/icons-react';
import { ChatMessage } from '../VideoRoom';
import ChatTab from './ChatTab';
import DoubtSolverTab from './DoubtSolverTab';
import ClassSummaryTab from './ClassSummaryTab';

interface ChatPanelProps {
  activeTab: 'chat' | 'participants' | 'doubt' | 'summary';
  setActiveTab: (tab: 'chat' | 'participants' | 'doubt' | 'summary' | null) => void;
  messages: ChatMessage[];
  onSendMessage: (text: string, targetIdentity?: string, targetName?: string) => void;
  participants: Participant[];
  localParticipant: Participant;
  activeChatTarget: { identity: string; name: string } | null;
  setActiveChatTarget: (target: { identity: string; name: string } | null) => void;
  roomName: string;
  globalWhiteboardAllowed?: boolean;
  globalScreenShareAllowed?: boolean;
  allowedWhiteboardStudents?: Record<string, boolean>;
  allowedScreenShareStudents?: Record<string, boolean>;
  onToggleGlobalPermission?: (type: 'whiteboard' | 'screenshare') => void;
  onToggleStudentPermission?: (identity: string, type: 'whiteboard' | 'screenshare') => void;
  isMobile?: boolean;
  isTeacher: boolean;
  editor: any; // Tldraw editor reference
  isPinned?: boolean;
  onTogglePin?: () => void;
}

export default function ChatPanel({
  activeTab,
  setActiveTab,
  messages,
  onSendMessage,
  participants,
  localParticipant,
  activeChatTarget,
  setActiveChatTarget,
  roomName,
  isMobile = false,
  isTeacher,
  editor,
  isPinned = false,
  onTogglePin,
}: ChatPanelProps) {

  const getMobileTitle = () => {
    switch (activeTab) {
      case 'chat': return 'In-call messages';
      case 'doubt': return isTeacher ? 'Student Doubts Feed' : 'AI Doubt Solver';
      case 'summary': return 'Class Summary';
      default: return '';
    }
  };

  // Determine wrapper classes dynamically based on mobile vs pinned vs unpinned overlay on desktop
  const getWrapperClasses = () => {
    if (isMobile) {
      return 'fixed inset-0 w-full h-full z-[300] bg-[#090d1a]/98 backdrop-blur-2xl flex flex-col font-sans';
    }
    if (isPinned) {
      return 'w-80 shrink-0 h-full border-l border-border bg-surface flex flex-col relative z-30 font-sans';
    }
    return 'absolute right-0 top-0 bottom-0 w-80 z-50 bg-surface/90 backdrop-blur-md border-l border-border flex flex-col font-sans';
  };

  return (
    <aside className={getWrapperClasses()}>
      
      {/* MOBILE-ONLY HEADER */}
      {isMobile && (
        <div className="h-14 border-b border-border/20 flex items-center justify-between px-4 bg-surface/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab(null)}
              type="button"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#C2CCDE] hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
            >
              <IconX className="w-5 h-5" />
            </button>
            <span className="text-base font-bold text-white tracking-wide">
              {getMobileTitle()}
            </span>
          </div>
        </div>
      )}

      {/* MOBILE-ONLY TAB SELECTOR BAR */}
      {isMobile && (
        <div className="flex border-b border-border/10 bg-surface/10 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('chat')}
            type="button"
            className={`flex-1 min-w-[70px] py-3.5 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'border-primary text-white bg-white/[0.02]'
                : 'border-transparent text-[#C2CCDE] hover:text-white'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('doubt')}
            type="button"
            className={`flex-1 min-w-[70px] py-3.5 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'doubt'
                ? 'border-primary text-white bg-white/[0.02]'
                : 'border-transparent text-[#C2CCDE] hover:text-white'
            }`}
          >
            {isTeacher ? 'Doubts' : 'Ask AI'}
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            type="button"
            className={`flex-1 min-w-[70px] py-3.5 text-xs font-semibold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'summary'
                ? 'border-primary text-white bg-white/[0.02]'
                : 'border-transparent text-[#C2CCDE] hover:text-white'
            }`}
          >
            Summary
          </button>
        </div>
      )}

      {/* DESKTOP HEADER (3 tabs: Chat, Ask AI, Summary + Pin toggle + Close) */}
      {!isMobile && (
        <div className="h-16 border-b border-border/30 flex items-center justify-between px-3 bg-surface/30 select-none">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
            <button
              onClick={() => setActiveTab('chat')}
              type="button"
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'chat'
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
              title="Chat Messages"
            >
              <IconMessage className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('doubt')}
              type="button"
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'doubt'
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
              title="Ask AI Doubt Solver"
            >
              <IconHelpCircle className="w-3.5 h-3.5" />
              <span>{isTeacher ? 'Doubts' : 'Ask AI'}</span>
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              type="button"
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'summary'
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
              title="Rolling Class Summary"
            >
              <IconSparkles className="w-3.5 h-3.5" />
              <span>Summary</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {/* Pin Toggle Button */}
            <button
              onClick={onTogglePin}
              type="button"
              className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                isPinned 
                  ? 'bg-accent/15 text-accent border border-accent/20 hover:bg-accent/20' 
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
              title={isPinned ? "Unpin Chat" : "Pin Chat to side"}
            >
              <IconPin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : 'rotate-45'}`} />
            </button>

            {/* Close Button */}
            <button
              onClick={() => setActiveTab(null)}
              type="button"
              className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer"
              title="Close Panel"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeTab === 'chat' && (
          <ChatTab
            messages={messages}
            onSendMessage={onSendMessage}
            participants={participants}
            localParticipant={localParticipant}
            activeChatTarget={activeChatTarget}
            setActiveChatTarget={setActiveChatTarget}
          />
        )}
        {activeTab === 'doubt' && (
          <DoubtSolverTab
            sessionId={roomName}
            isTeacher={isTeacher}
            editor={editor}
          />
        )}
        {activeTab === 'summary' && (
          <ClassSummaryTab
            sessionId={roomName}
            isTeacher={isTeacher}
          />
        )}
      </div>

    </aside>
  );
}
