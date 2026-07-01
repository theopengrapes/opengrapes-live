'use client';

import React from 'react';
import { ParticipantTile, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { IconPin, IconSpeakerphone, IconMicrophoneOff } from '@tabler/icons-react';

interface CustomVideoTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  isPinned?: boolean;
  onPin?: () => void;
  isSpotlighted?: boolean;
  onSpotlight?: () => void;
  showSpotlightBtn?: boolean;
  hideActions?: boolean;
  variant?: 'grid' | 'sidebar';
}

export default function CustomVideoTile({
  trackRef,
  isPinned = false,
  onPin,
  isSpotlighted = false,
  onSpotlight,
  showSpotlightBtn = false,
  hideActions = false,
  variant = 'grid',
}: CustomVideoTileProps) {
  const name = trackRef.participant.name || trackRef.participant.identity;
  const isSpeaking = trackRef.participant.isSpeaking;
  const isMuted = !trackRef.participant.isMicrophoneEnabled;
  const isCameraEnabled = trackRef.participant.isCameraEnabled;

  const isSidebar = variant === 'sidebar';

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden border transition-all duration-300 group flex items-center justify-center bg-[#0d1220] ${
        isSpeaking
          ? "border-indigo-500 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/30"
          : "border-white/5 hover:border-white/15"
      }`}
    >
      {/* 1. Video Stream or Gradient Placeholder */}
      {isCameraEnabled ? (
        <ParticipantTile
          trackRef={trackRef}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[#0d111d] flex items-center justify-center select-none p-4 text-center">
          <span
            className={`font-bold text-white/90 tracking-wide font-sans truncate max-w-[90%] ${
              isSidebar
                ? "text-xs md:text-sm"
                : "text-xl sm:text-2xl md:text-3xl"
            }`}
          >
            {name}
          </span>
        </div>
      )}

      {/* 2. Glassmorphic bottom label */}
      {(isCameraEnabled ||
        trackRef.participant.isLocal ||
        isMuted ||
        isSpeaking) && (
        <div
          className={`absolute bottom-1 left-1  rounded-lg px-1.5 py-1.5 flex items-center gap-2 select-none z-10 ${
            isSidebar ? "scale-90 origin-bottom-left" : ""
          }`}
        >
          {isCameraEnabled ? (
            <span className="text-sm font-semibold text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.6),0_0_2px_rgba(0,0,0,0.3)] truncate max-w-[120px]">
              {name}
            </span>
          ) : (
            trackRef.participant.isLocal && (
              <span className="text-sm font-semibold text-white/95 truncate max-w-[120px]">
                (You)
              </span>
            )
          )}
        </div>
      )}

      {/* 3. Mic on & off display section */}
      <div className="absolute top-2 right-2">
        {isMuted ? (
          <IconMicrophoneOff className="w-6 h-6 p-1 bg-black/30 rounded-full text-red-400" />
        ) : (
          isSpeaking && (
            <div className="flex items-end gap-0.5 h-6 w-6 p-1">
              <span
                className="w-0.5 bg-emerald-400 animate-bounce h-2"
                style={{ animationDelay: "0.1s" }}
              />
              <span
                className="w-0.5 bg-emerald-400 animate-bounce h-3"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="w-0.5 bg-emerald-400 animate-bounce h-1.5"
                style={{ animationDelay: "0s" }}
              />
            </div>
          )
        )}
      </div>

      {/* 4. Hover Overlay Actions */}
      {!hideActions && !isSidebar && onPin && (
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
              isPinned
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-[#111827]/80 border-white/10 text-white/80 hover:text-white hover:bg-white/10"
            }`}
            title={isPinned ? "Unpin tile" : "Pin tile"}
          >
            <IconPin className="w-4 h-4" />
          </button>

          {showSpotlightBtn && onSpotlight && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSpotlight();
              }}
              className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                isSpotlighted
                  ? "bg-amber-600 border-amber-500 text-white"
                  : "bg-[#111827]/80 border-white/10 text-white/80 hover:text-white hover:bg-white/10"
              }`}
              title={
                isSpotlighted ? "Cancel spotlight" : "Spotlight for everyone"
              }
            >
              <IconSpeakerphone className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* 5. Active Spotlight Badge */}
      {isSpotlighted && (
        <div
          className={`absolute bg-amber-500/20 backdrop-blur-md border border-amber-500/30 text-amber-300 rounded-xl px-2.5 py-1 font-bold uppercase tracking-wider select-none z-10 flex items-center gap-1.5 ${
            isSidebar
              ? "top-2 left-2 text-[8px] scale-90 origin-top-left"
              : "top-3 left-3 text-[10px]"
          }`}
        >
          <IconSpeakerphone className="w-3 h-3 animate-pulse" />
          Spotlighted
        </div>
      )}

      {/* 6. Pinned Badge */}
      {isPinned && (
        <div
          className={`absolute bg-indigo-500/25 backdrop-blur-md border border-indigo-500/35 text-indigo-300 rounded-xl select-none z-10 flex items-center justify-center ${
            isSidebar ? "top-2 right-2 p-1 scale-90" : "top-3 right-3 p-1.5"
          }`}
        >
          <IconPin className="w-3.5 h-3.5 fill-current" />
        </div>
      )}
    </div>
  );
}
