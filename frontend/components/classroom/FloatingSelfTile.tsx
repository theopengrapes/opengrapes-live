'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ParticipantTile, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { IconX, IconPin, IconSpeakerphone, IconMicrophoneOff, IconMicrophone, IconMaximize, IconMinimize } from '@tabler/icons-react';

interface FloatingSelfTileProps {
  localTrack: TrackReferenceOrPlaceholder | undefined;
  localParticipant: any;
  isTeacher: boolean;
  pinnedTrackSid: string | null;
  onPin: () => void;
  spotlightTrackSid: string | null;
  onSpotlight: () => void;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
}

export default function FloatingSelfTile({
  localTrack,
  localParticipant,
  isTeacher,
  pinnedTrackSid,
  onPin,
  spotlightTrackSid,
  onSpotlight,
  isVisible,
  setIsVisible,
}: FloatingSelfTileProps) {
  const [width, setWidth] = useState(240);
  const height = useMemo(() => Math.round(width * (9 / 16)), [width]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);

  const tileRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const hasBeenPositioned = useRef(false);
  const hasMoved = useRef(false);

  const isPinned = pinnedTrackSid === localParticipant?.sid;
  const isSpotlighted = spotlightTrackSid === localParticipant?.sid;

  // Initialize position to bottom right of viewport
  useEffect(() => {
    if (typeof window !== 'undefined' && !hasBeenPositioned.current && isVisible) {
      const timer = setTimeout(() => {
        const defaultWidth = 240;
        const defaultHeight = 135;
        setPosition({
          x: window.innerWidth - defaultWidth - 24,
          y: window.innerHeight - defaultHeight - 110, // Avoid bottom controls
        });
        hasBeenPositioned.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Handle pointer down for dragging the tile
  const handleDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Prevent dragging if clicking buttons or the resize handle
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.resize-handle')) {
      return;
    }

    hasMoved.current = false;
    const tile = tileRef.current;
    if (!tile) return;
    tile.setPointerCapture(e.pointerId);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    e.stopPropagation();
  }, [position]);

  // Handle dragging movement
  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved.current = true;
    }

    let newX = dragRef.current.posX + dx;
    let newY = dragRef.current.posY + dy;

    const tile = tileRef.current;
    if (!tile) return;
    const tileWidth = tile.offsetWidth;
    const tileHeight = tile.offsetHeight;

    // Clamp coordinates to viewport
    newX = Math.max(10, Math.min(newX, window.innerWidth - tileWidth - 10));
    newY = Math.max(10, Math.min(newY, window.innerHeight - tileHeight - 110)); // Safe distance from bottom controls

    setPosition({ x: newX, y: newY });
    e.stopPropagation();
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const tile = tileRef.current;
      if (tile) {
        tile.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
    }
  }, []);

  // Handle pointer down for resizing
  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    resizeRef.current = {
      startX: e.clientX,
      startWidth: width,
    };
  }, [width]);

  // Handle resizing movement
  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    e.stopPropagation();
    
    const dx = e.clientX - resizeRef.current.startX;
    let newWidth = resizeRef.current.startWidth + dx;

    // Clamp width between 160px and 480px
    newWidth = Math.max(160, Math.min(newWidth, 480));
    setWidth(newWidth);
  }, []);

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      resizeRef.current = null;
    }
  }, []);

  // Determine user avatar/initials
  const initials = useMemo(() => {
    const name = localParticipant?.name || localParticipant?.identity || 'U';
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [localParticipant]);

  const isMuted = !localParticipant?.isMicrophoneEnabled;

  // Don't render if not visible, if user is teacher (teacher has fixed grid tile 1), or if locally pinned/spotlighted on stage
  if (!isVisible || isTeacher || isPinned || isSpotlighted || !localParticipant) return null;

  return (
    <div
      ref={tileRef}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      className={`transition-shadow shadow-2xl border border-white/10 select-none overflow-hidden ${
        isMinimized 
          ? 'rounded-full bg-[#111827]/90 backdrop-blur-md flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing' 
          : 'rounded-2xl bg-[#111827]/80 backdrop-blur-md flex flex-col group cursor-grab active:cursor-grabbing'
      }`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isMinimized ? '160px' : `${width}px`,
        height: isMinimized ? '48px' : `${height}px`,
        zIndex: 250,
        touchAction: 'none',
      }}
    >
      {isMinimized ? (
        // MINIMIZED BAR VIEW
        <>
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-indigo-600/80 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white tracking-wider">{initials}</span>
            </div>
            {/* Name/Mic Status */}
            <div className="flex items-center gap-1 min-w-0">
              {isMuted ? (
                <IconMicrophoneOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
              ) : (
                <IconMicrophone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="text-[10px] font-semibold text-white/90 truncate max-w-[60px]">
                {localParticipant.name || 'You'}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setIsMinimized(false)}
              className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
              title="Expand video"
            >
              <IconMaximize className="w-3.5 h-3.5" />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setIsVisible(false)}
              className="w-6 h-6 rounded-full hover:bg-red-500/20 flex items-center justify-center text-white/70 hover:text-red-400 cursor-pointer transition-colors"
              title="Close tile"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      ) : (
        // EXPANDED VIDEO VIEW
        <div className="relative w-full h-full pointer-events-none">
          {localTrack ? (
            <ParticipantTile trackRef={localTrack} className="w-full h-full object-cover rounded-2xl" />
          ) : (
            <div className="absolute inset-0 bg-[#0d111d] flex items-center justify-center select-none p-4 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-indigo-600 border border-indigo-400/30 flex items-center justify-center">
                <span className="text-sm font-bold text-white tracking-wider">{initials}</span>
              </div>
            </div>
          )}

          {/* Hover Action Overlays */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2.5 z-20 pointer-events-auto">
            <button
              onClick={onPin}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                isPinned
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-[#111827]/80 border-white/10 text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title={isPinned ? 'Unpin self' : 'Pin self to main stage'}
            >
              <IconPin className="w-3.5 h-3.5" />
            </button>

            {isTeacher && (
              <button
                onClick={onSpotlight}
                className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                  isSpotlighted
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-[#111827]/80 border-white/10 text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title={isSpotlighted ? 'Cancel spotlight' : 'Spotlight yourself for everyone'}
              >
                <IconSpeakerphone className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => setIsMinimized(true)}
              className="w-8 h-8 rounded-lg bg-[#111827]/80 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all"
              title="Minimize view"
            >
              <IconMinimize className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsVisible(false)}
              className="w-8 h-8 rounded-lg bg-[#111827]/80 border border-white/10 text-white/80 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center cursor-pointer transition-all"
              title="Hide self view"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bottom name tag */}
          <div className="absolute bottom-2.5 left-2.5 bg-[#090d1a]/60 backdrop-blur-md border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1.5 select-none z-10 scale-90 origin-bottom-left pointer-events-auto">
            <span className="text-[10px] font-semibold text-white/95">You</span>
            {isMuted && <IconMicrophoneOff className="w-3 h-3 text-red-400" />}
          </div>

          {/* Resize handle in bottom-right corner */}
          <div
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            className="absolute bottom-1 right-1 w-4.5 h-4.5 cursor-se-resize z-30 pointer-events-auto resize-handle flex items-end justify-end p-0.5"
            title="Drag to resize"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-white/40 group-hover:text-white/70">
              <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.5" />
              <line x1="6" y1="3" x2="3" y2="6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
