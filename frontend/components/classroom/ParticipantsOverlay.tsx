'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import { 
  IconX, 
  IconMicrophone, 
  IconMicrophoneOff, 
  IconVideo, 
  IconVideoOff,
  IconMessage, 
  IconLock, 
  IconLockOpen, 
  IconTrash, 
  IconDots
} from '@tabler/icons-react';

interface ParticipantsOverlayProps {
  participants: Participant[];
  localParticipant: Participant;
  roomName: string;
  isTeacher: boolean;
  globalWhiteboardAllowed: boolean;
  globalScreenShareAllowed: boolean;
  allowedWhiteboardStudents: Record<string, boolean>;
  allowedScreenShareStudents: Record<string, boolean>;
  onToggleGlobalPermission?: (type: 'whiteboard' | 'screenshare') => void;
  onToggleStudentPermission?: (identity: string, type: 'whiteboard' | 'screenshare') => void;
  onClose: () => void;
  onStartDM: (p: Participant) => void;
  isMobile?: boolean;
}

export default function ParticipantsOverlay({
  participants,
  localParticipant,
  roomName,
  isTeacher,
  globalWhiteboardAllowed,
  globalScreenShareAllowed,
  allowedWhiteboardStudents,
  allowedScreenShareStudents,
  onToggleGlobalPermission,
  onToggleStudentPermission,
  onClose,
  onStartDM,
  isMobile = false,
}: ParticipantsOverlayProps) {
  
  const [expandedSid, setExpandedSid] = useState<string | null>(null);
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 2. Close on Escape press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMuteToggle = async (p: Participant, trackType: 'audio' | 'video', shouldMute: boolean) => {
    const actionKey = `${p.identity}-${trackType}`;
    if (loadingActions[actionKey]) return;

    setLoadingActions((prev) => ({ ...prev, [actionKey]: true }));
    try {
      const accessToken = sessionStorage.getItem('classroom_access_token') || '';
      const response = await fetch('/api/mute-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          roomId: roomName,
          participantIdentity: p.identity,
          trackType,
          muted: shouldMute,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Action failed' }));
        alert(data.error || 'Failed to change mute state');
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
      alert('Error toggling mute state');
    } finally {
      setLoadingActions((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleMuteAll = async () => {
    const unmutedStudents = participants.filter(p => p.metadata !== 'teacher' && p.isMicrophoneEnabled);
    if (unmutedStudents.length === 0) return;
    
    if (!confirm('Are you sure you want to mute all students?')) return;

    setLoadingActions((prev) => ({ ...prev, 'mute-all': true }));
    try {
      const accessToken = sessionStorage.getItem('classroom_access_token') || '';
      await Promise.all(unmutedStudents.map(p => 
        fetch('/api/mute-participant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            roomId: roomName,
            participantIdentity: p.identity,
            trackType: 'audio',
            muted: true,
          }),
        })
      ));
    } catch (err) {
      console.error('Mute all error:', err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, 'mute-all': false }));
    }
  };

  const handleKickParticipant = async (p: Participant) => {
    if (!confirm(`Are you sure you want to kick student ${p.name || p.identity}?`)) return;

    const actionKey = `${p.identity}-kick`;
    setLoadingActions((prev) => ({ ...prev, [actionKey]: true }));
    try {
      const accessToken = sessionStorage.getItem('classroom_access_token') || '';
      const response = await fetch('/api/kick-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          roomId: roomName,
          participantIdentity: p.identity,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Action failed' }));
        alert(data.error || 'Failed to kick participant');
      }
      setExpandedSid(null);
    } catch (error) {
      console.error('Error kicking participant:', error);
      alert('Error kicking participant');
    } finally {
      setLoadingActions((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  return (
    <div 
      ref={containerRef}
      className={isMobile
        ? 'fixed inset-0 z-[300] bg-[#090d1a]/98 backdrop-blur-2xl flex flex-col font-sans'
        : 'absolute right-4 top-4 w-[340px] max-h-[60vh] overflow-y-auto z-50 bg-surface border border-border rounded-xl shadow-2xl p-4 flex flex-col gap-3 scrollbar-thin text-text animate-in fade-in zoom-in-95 duration-150 font-sans'
      }
    >
      
      {/* Mobile-only top bar */}
      {isMobile ? (
        <div className="h-14 border-b border-border/20 flex items-center justify-between px-4 bg-surface/30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              type="button"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#C2CCDE] hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
            >
              <IconX className="w-5 h-5" />
            </button>
            <span className="text-base font-bold text-white tracking-wide">
              Participants ({participants.length})
            </span>
          </div>
          {isTeacher && (
            <button
              onClick={handleMuteAll}
              disabled={loadingActions['mute-all']}
              className="px-2.5 py-1 rounded bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-50"
            >
              Mute All
            </button>
          )}
        </div>
      ) : (
        /* Desktop header */
        <div className="flex items-center justify-between pb-2 border-b border-border/40 select-none">
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">In Call</span>
            <span className="text-sm font-extrabold text-white">Participants ({participants.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher && (
              <button
                onClick={handleMuteAll}
                disabled={loadingActions['mute-all']}
                className="px-2.5 py-1 rounded bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-50"
              >
                Mute All
              </button>
            )}
            <button 
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-surface-hi flex items-center justify-center text-text-muted hover:text-white transition-colors cursor-pointer"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content — scrollable on mobile */}
      <div className={isMobile ? 'flex-1 overflow-y-auto p-4 flex flex-col gap-3' : 'contents'}>

      {/* Global permissions row (Teacher Only) */}
      {isTeacher && (
        <div className="p-3 bg-surface-hi/45 border border-border/50 rounded-xl space-y-3 select-none">
          <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">
            Global Classroom Permissions
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">Allow Student Whiteboard</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={globalWhiteboardAllowed}
                onChange={() => onToggleGlobalPermission?.('whiteboard')}
              />
              <div className="w-8 h-4 bg-shell/80 border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent peer-checked:after:bg-white"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">Allow Student Screen Share</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={globalScreenShareAllowed}
                onChange={() => onToggleGlobalPermission?.('screenshare')}
              />
              <div className="w-8 h-4 bg-shell/80 border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent peer-checked:after:bg-white"></div>
            </label>
          </div>
        </div>
      )}

      {/* Participant List */}
      <div className="space-y-2 flex-1">
        {participants.map((p) => {
          const isLocal = p.identity === localParticipant.identity;
          const isTeacherUser = p.metadata === 'teacher';
          const pName = p.name || p.identity;
          
          const isStudentWhiteboardAllowed = globalWhiteboardAllowed || !!allowedWhiteboardStudents[p.identity];
          const isStudentScreenShareAllowed = globalScreenShareAllowed || !!allowedScreenShareStudents[p.identity];
          const isStudentLocked = !isStudentWhiteboardAllowed && !isStudentScreenShareAllowed;

          const isMicLoading = loadingActions[`${p.identity}-audio`];
          const isCamLoading = loadingActions[`${p.identity}-video`];

          const isExpanded = expandedSid === p.sid;

          return (
            <div 
              key={p.sid}
              className="flex flex-col p-2.5 rounded-xl border border-border/20 bg-surface-hi/10 hover:border-border/50 hover:bg-surface-hi/25 transition-all duration-150 gap-2.5"
            >
              {/* Row content */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/25 text-accent text-sm font-bold flex items-center justify-center flex-shrink-0 select-none">
                    {pName.charAt(0).toUpperCase()}
                  </div>

                  {/* Name Details */}
                  <div className="flex flex-col min-w-0 font-sans">
                    <span className="text-xs font-semibold text-white truncate pr-1">{pName}</span>
                    {isTeacherUser && (
                      <span className="text-[8px] text-accent font-bold uppercase tracking-wider mt-0.5 select-none">
                        Teacher
                      </span>
                    )}
                    {isLocal && (
                      <span className="text-[8px] text-text-muted font-bold uppercase tracking-wider mt-0.5 select-none">
                        You
                      </span>
                    )}
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1">
                  
                  {/* Mic status indicator */}
                  {isTeacher && !isLocal && p.metadata !== 'teacher' ? (
                    <button
                      disabled={isMicLoading || !p.isMicrophoneEnabled}
                      onClick={() => handleMuteToggle(p, 'audio', true)}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        p.isMicrophoneEnabled
                          ? 'text-text hover:text-white border-transparent hover:bg-surface-hi'
                          : 'text-danger bg-danger/10 border-danger/25 opacity-70'
                      }`}
                      title={p.isMicrophoneEnabled ? "Mute student" : "Microphone muted"}
                    >
                      {isMicLoading ? (
                        <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : p.isMicrophoneEnabled ? (
                        <IconMicrophone className="w-3.5 h-3.5" />
                      ) : (
                        <IconMicrophoneOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <div className={`p-1.5 rounded-lg border border-transparent ${p.isMicrophoneEnabled ? 'text-text-muted' : 'text-danger bg-danger/5 border-danger/10'}`}>
                      {p.isMicrophoneEnabled ? <IconMicrophone className="w-3.5 h-3.5" /> : <IconMicrophoneOff className="w-3.5 h-3.5" />}
                    </div>
                  )}

                  {/* Cam status indicator */}
                  {isTeacher && !isLocal && p.metadata !== 'teacher' ? (
                    <button
                      disabled={isCamLoading || !p.isCameraEnabled}
                      onClick={() => handleMuteToggle(p, 'video', true)}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        p.isCameraEnabled
                          ? 'text-text hover:text-white border-transparent hover:bg-surface-hi'
                          : 'text-danger bg-danger/10 border-danger/25 opacity-70'
                      }`}
                      title={p.isCameraEnabled ? "Stop camera feed" : "Camera turned off"}
                    >
                      {isCamLoading ? (
                        <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : p.isCameraEnabled ? (
                        <IconVideo className="w-3.5 h-3.5" />
                      ) : (
                        <IconVideoOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <div className={`p-1.5 rounded-lg border border-transparent ${p.isCameraEnabled ? 'text-text-muted' : 'text-danger bg-danger/5 border-danger/10'}`}>
                      {p.isCameraEnabled ? <IconVideo className="w-3.5 h-3.5" /> : <IconVideoOff className="w-3.5 h-3.5" />}
                    </div>
                  )}

                  {/* Actions dropdown trigger (hidden for local user) */}
                  {!isLocal && (
                    <button
                      onClick={() => setExpandedSid(isExpanded ? null : p.sid)}
                      className={`w-7 h-7 rounded-lg hover:bg-surface-hi flex items-center justify-center cursor-pointer transition-colors relative text-text-muted hover:text-text ${
                        isTeacher && p.metadata !== 'teacher' && isStudentLocked ? 'text-danger' : ''
                      }`}
                    >
                      <IconDots className="w-4 h-4" />
                      {isTeacher && p.metadata !== 'teacher' && isStudentLocked && (
                        <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-danger rounded-full" />
                      )}
                    </button>
                  )}

                </div>
              </div>

              {/* Expanded actions drawer */}
              {isExpanded && !isLocal && (
                <div className="pt-2 border-t border-border/40 flex flex-col gap-2 animate-in slide-in-from-top-1 duration-100 font-sans">
                  
                  {/* Direct message */}
                  <button
                    onClick={() => {
                      onStartDM(p);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-hi text-xs text-text cursor-pointer transition-colors"
                  >
                    <IconMessage className="w-3.5 h-3.5 text-text-muted" />
                    <span>Direct Chat</span>
                  </button>

                  {/* Teacher specific actions */}
                  {isTeacher && p.metadata !== 'teacher' && (
                    <>
                      {/* Student Whiteboard permissions toggle */}
                      <button
                        onClick={() => onToggleStudentPermission?.(p.identity, 'whiteboard')}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-surface-hi text-xs text-text cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isStudentWhiteboardAllowed ? (
                            <IconLockOpen className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <IconLock className="w-3.5 h-3.5 text-text-muted" />
                          )}
                          <span>Whiteboard Access</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase ${isStudentWhiteboardAllowed ? 'text-success' : 'text-text-muted'}`}>
                          {isStudentWhiteboardAllowed ? 'Allowed' : 'Locked'}
                        </span>
                      </button>

                      {/* Student Screen Share permissions toggle */}
                      <button
                        onClick={() => onToggleStudentPermission?.(p.identity, 'screenshare')}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-surface-hi text-xs text-text cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isStudentScreenShareAllowed ? (
                            <IconLockOpen className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <IconLock className="w-3.5 h-3.5 text-text-muted" />
                          )}
                          <span>Screen Share Access</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase ${isStudentScreenShareAllowed ? 'text-success' : 'text-text-muted'}`}>
                          {isStudentScreenShareAllowed ? 'Allowed' : 'Locked'}
                        </span>
                      </button>

                      {/* Kick Student */}
                      <button
                        disabled={loadingActions[`${p.identity}-kick`]}
                        onClick={() => handleKickParticipant(p)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-danger/10 text-xs text-danger font-semibold cursor-pointer transition-colors"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                        <span>Kick Student</span>
                      </button>
                    </>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </div>{/* end participant list */}
      </div>{/* end scrollable content */}

    </div>
  );
}
