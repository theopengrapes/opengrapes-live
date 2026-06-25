'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import { IconDotsVertical, IconMicrophone, IconMicrophoneOff, IconVideo, IconVideoOff, IconMessage, IconLock, IconX } from '@tabler/icons-react';
import Tooltip from './Tooltip';

interface ParticipantsTabProps {
  participants: Participant[];
  localParticipant: Participant;
  roomName: string;
  globalWhiteboardAllowed: boolean;
  globalScreenShareAllowed: boolean;
  allowedWhiteboardStudents: Record<string, boolean>;
  allowedScreenShareStudents: Record<string, boolean>;
  onToggleGlobalPermission?: (type: 'whiteboard' | 'screenshare') => void;
  onToggleStudentPermission?: (identity: string, type: 'whiteboard' | 'screenshare') => void;
  onStartDM: (p: Participant) => void;
}

export default function ParticipantsTab({
  participants,
  localParticipant,
  roomName,
  globalWhiteboardAllowed,
  globalScreenShareAllowed,
  allowedWhiteboardStudents,
  allowedScreenShareStudents,
  onToggleGlobalPermission,
  onToggleStudentPermission,
  onStartDM,
}: ParticipantsTabProps) {
  const [activeDropdownSid, setActiveDropdownSid] = useState<string | null>(null);
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLocalTeacher = localParticipant.metadata === 'teacher';

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownSid(null);
      }
    }
    if (activeDropdownSid) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDropdownSid]);

  const handleMuteToggle = async (p: Participant, trackType: 'audio' | 'video', shouldMute: boolean) => {
    const actionKey = `${p.identity}-${trackType}`;
    if (loadingActions[actionKey]) return;

    setLoadingActions((prev) => ({ ...prev, [actionKey]: true }));
    try {
      let accessToken = '';
      try {
        accessToken = sessionStorage.getItem('classroom_access_token') || '';
      } catch (err) {
        console.warn('sessionStorage read blocked or failed:', err);
      }

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

  const handleKickParticipant = async (p: Participant) => {
    if (!confirm(`Are you sure you want to kick student ${p.name || p.identity}?`)) return;

    const actionKey = `${p.identity}-kick`;
    setLoadingActions((prev) => ({ ...prev, [actionKey]: true }));
    try {
      let accessToken = '';
      try {
        accessToken = sessionStorage.getItem('classroom_access_token') || '';
      } catch (err) {
        console.warn('sessionStorage read blocked or failed:', err);
      }

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
      setActiveDropdownSid(null);
    } catch (error) {
      console.error('Error kicking participant:', error);
      alert('Error kicking participant');
    } finally {
      setLoadingActions((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col font-sans h-full">
      {isLocalTeacher && (
        <div className="mb-4 p-3.5 bg-[#161a26]/40 border border-white/5 rounded-xl space-y-3 font-sans">
          <div className="text-[10px] font-bold text-[#C2CCDE]/40 uppercase tracking-wider select-none">
            Global Class Permissions
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/95">Allow Student Whiteboard</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={globalWhiteboardAllowed}
                onChange={() => onToggleGlobalPermission?.('whiteboard')}
              />
              <div className="w-9 h-5 bg-[#2d3139] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#C2CCDE] after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/95">Allow Student Screen Share</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={globalScreenShareAllowed}
                onChange={() => onToggleGlobalPermission?.('screenshare')}
              />
              <div className="w-9 h-5 bg-[#2d3139] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#C2CCDE] after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white"></div>
            </label>
          </div>
        </div>
      )}

      <h4 className="text-xs font-semibold text-foreground/45 uppercase tracking-wider mb-3 select-none">
        In call ({participants.length})
      </h4>
      <div className="space-y-3 flex-1">
        {participants.map((p) => {
          const isLocal = p.identity === localParticipant.identity;
          const isTeacher = p.metadata === 'teacher';
          const pName = p.name || p.identity;

          const isMicLoading = loadingActions[`${p.identity}-audio`];
          const isCamLoading = loadingActions[`${p.identity}-video`];

          const isStudentWhiteboardAllowed = globalWhiteboardAllowed || !!allowedWhiteboardStudents[p.identity];
          const isStudentScreenShareAllowed = globalScreenShareAllowed || !!allowedScreenShareStudents[p.identity];
          const isStudentLocked = !isStudentWhiteboardAllowed && !isStudentScreenShareAllowed;

          return (
            <div
              key={p.sid}
              className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-surface/30 group relative hover:border-white/10 hover:bg-surface-light/20 transition-all duration-150"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0 select-none">
                  {pName.charAt(0).toUpperCase()}
                </div>

                {/* Name Details */}
                <div className="flex flex-col min-w-0 font-sans">
                  <span className="text-sm font-semibold text-white truncate pr-1">{pName}</span>
                  {isTeacher && (
                    <span className="text-[9px] text-primary font-bold uppercase tracking-wider leading-none mt-0.5 select-none">
                      Teacher
                    </span>
                  )}
                  {isLocal && (
                    <span className="text-[9px] text-[#C2CCDE]/40 font-bold uppercase tracking-wider leading-none mt-0.5 select-none">
                      You
                    </span>
                  )}
                </div>
              </div>

              {/* Media Status Indicators & Controls */}
              <div className="flex items-center gap-1.5">
                {/* Microphone Control */}
                {isLocalTeacher && !isLocal && p.metadata !== 'teacher' ? (
                  <Tooltip content={p.isMicrophoneEnabled ? "Mute Mic" : "Microphone Muted"} align="right">
                    <button
                      disabled={isMicLoading || !p.isMicrophoneEnabled}
                      onClick={() => handleMuteToggle(p, 'audio', true)}
                      className={`p-1.5 rounded-lg border transition-all ${
                        p.isMicrophoneEnabled
                          ? 'text-[#C2CCDE]/60 hover:text-white hover:bg-white/5 border-transparent cursor-pointer'
                          : 'text-red-500 bg-red-500/10 border-red-500/20 opacity-55 cursor-not-allowed'
                      }`}
                    >
                      {isMicLoading ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : p.isMicrophoneEnabled ? (
                        <IconMicrophone className="w-3.5 h-3.5" />
                      ) : (
                        <IconMicrophoneOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </Tooltip>
                ) : (
                  <div className={`p-1.5 rounded-md ${p.isMicrophoneEnabled ? 'text-[#C2CCDE]/40' : 'text-red-500 bg-red-500/10'}`}>
                    {p.isMicrophoneEnabled ? (
                      <IconMicrophone className="w-3.5 h-3.5" />
                    ) : (
                      <IconMicrophoneOff className="w-3.5 h-3.5" />
                    )}
                  </div>
                )}

                {/* Camera Control */}
                {isLocalTeacher && !isLocal && p.metadata !== 'teacher' ? (
                  <Tooltip content={p.isCameraEnabled ? "Turn Off Camera" : "Camera Disabled"} align="left">
                    <button
                      disabled={isCamLoading || !p.isCameraEnabled}
                      onClick={() => handleMuteToggle(p, 'video', true)}
                      className={`p-1.5 rounded-lg border transition-all ${
                        p.isCameraEnabled
                          ? 'text-[#C2CCDE]/60 hover:text-white hover:bg-white/5 border-transparent cursor-pointer'
                          : 'text-red-500 bg-red-500/10 border-red-500/20 opacity-55 cursor-not-allowed'
                      }`}
                    >
                      {isCamLoading ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : p.isCameraEnabled ? (
                        <IconVideo className="w-3.5 h-3.5" />
                      ) : (
                        <IconVideoOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </Tooltip>
                ) : (
                  <div className={`p-1.5 rounded-md ${p.isCameraEnabled ? 'text-[#C2CCDE]/40' : 'text-red-500 bg-red-500/10'}`}>
                    {p.isCameraEnabled ? (
                      <IconVideo className="w-3.5 h-3.5" />
                    ) : (
                      <IconVideoOff className="w-3.5 h-3.5" />
                    )}
                  </div>
                )}

                {/* Ellipsis menu for DMs and Kick (hidden for local user) */}
                {!isLocal && (
                  <div className="relative">
                    <button
                      onClick={() => setActiveDropdownSid(activeDropdownSid === p.sid ? null : p.sid)}
                      className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-[#C2CCDE]/50 hover:text-white transition-colors cursor-pointer relative"
                    >
                      {isLocalTeacher && p.metadata !== 'teacher' && isStudentLocked ? (
                        <div className="relative flex items-center justify-center">
                          <IconDotsVertical className="w-4 h-4" />
                          <IconLock className="w-2.5 h-2.5 absolute -top-1 -right-1 text-red-500 bg-[#0c101d] rounded-full p-[0.5px]" />
                        </div>
                      ) : (
                        <IconDotsVertical className="w-4 h-4" />
                      )}
                    </button>

                    {activeDropdownSid === p.sid && (
                      <div
                        ref={dropdownRef}
                        className="absolute right-7 top-1 w-48 bg-[#0c101d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1 z-40 animate-in fade-in slide-in-from-top-1 duration-100 font-sans"
                      >
                        <button
                          onClick={() => onStartDM(p)}
                          className="w-full text-left px-2.5 py-2 text-xs font-semibold hover:bg-white/5 rounded-lg text-[#C2CCDE] transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <IconMessage className="w-3.5 h-3.5" />
                          Direct Chat
                        </button>
                        {isLocalTeacher && p.metadata !== 'teacher' && (
                          <>
                            <button
                              onClick={() => {
                                onToggleStudentPermission?.(p.identity, 'whiteboard');
                                setActiveDropdownSid(null);
                              }}
                              className="w-full text-left px-2.5 py-2 text-xs font-semibold hover:bg-white/5 rounded-lg text-[#C2CCDE] transition-colors flex items-center justify-between cursor-pointer border-t border-white/5 mt-1"
                            >
                              <span className="flex items-center gap-2">
                                <IconLock className="w-3.5 h-3.5 text-zinc-400" />
                                Whiteboard Edit
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  allowedWhiteboardStudents[p.identity]
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-zinc-800 text-zinc-500'
                                }`}
                              >
                                {allowedWhiteboardStudents[p.identity] ? 'ON' : 'OFF'}
                              </span>
                            </button>
                            <button
                              onClick={() => {
                                onToggleStudentPermission?.(p.identity, 'screenshare');
                                setActiveDropdownSid(null);
                              }}
                              className="w-full text-left px-2.5 py-2 text-xs font-semibold hover:bg-white/5 rounded-lg text-[#C2CCDE] transition-colors flex items-center justify-between cursor-pointer mt-1"
                            >
                              <span className="flex items-center gap-2">
                                <IconLock className="w-3.5 h-3.5 text-zinc-400" />
                                Screen Share
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  allowedScreenShareStudents[p.identity]
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-zinc-800 text-zinc-500'
                                }`}
                              >
                                {allowedScreenShareStudents[p.identity] ? 'ON' : 'OFF'}
                              </span>
                            </button>
                            <button
                              onClick={() => handleKickParticipant(p)}
                              disabled={loadingActions[`${p.identity}-kick`]}
                              className="w-full text-left px-2.5 py-2 text-xs font-semibold hover:bg-red-500/10 rounded-lg text-red-400 transition-colors flex items-center gap-2 cursor-pointer border-t border-white/5 mt-1"
                            >
                              <IconX className="w-3.5 h-3.5 text-red-400" />
                              Kick Student
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
