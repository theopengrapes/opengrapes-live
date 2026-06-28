'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import CustomVideoTile from './CustomVideoTile';
import Tooltip from './Tooltip';

interface StudentSidebarProps {
  showWhiteboard: boolean;
  teacherTrack: TrackReferenceOrPlaceholder | undefined;
  sidebarStudents: TrackReferenceOrPlaceholder[];
  isOpen: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  mobileControlsVisible?: boolean;
  isLandscape?: boolean;
  isFullscreen?: boolean;
  hasLeftRail?: boolean;
}

// Bandwidth-optimized video tile with lazy-subscription (Intersection Observer)
function LazyParticipantTile({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      { threshold: 0.1, rootMargin: '50px' } // Pre-load slightly before entering viewport
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  const name = trackRef.participant.name || trackRef.participant.identity;

  return (
    <div 
      ref={ref} 
      className="aspect-video w-full relative rounded-xl overflow-hidden border border-white/5 bg-surface-light/10 shadow-md group flex items-center justify-center"
    >
      {isIntersecting ? (
        <CustomVideoTile 
          trackRef={trackRef} 
          variant="sidebar" 
          hideActions={true} 
        />
      ) : (
        <div className="absolute inset-0 bg-[#0d111d] flex items-center justify-center select-none p-4 text-center">
          <span className="text-xs font-bold text-white/90 truncate max-w-[90%] font-sans">{name}</span>
        </div>
      )}
    </div>
  );
}

export default function StudentSidebar({
  showWhiteboard,
  teacherTrack,
  sidebarStudents,
  isOpen,
  onToggle,
  isMobile = false,
  mobileControlsVisible = true,
  isLandscape = false,
  isFullscreen = false,
  hasLeftRail = false,
}: StudentSidebarProps) {
  return (
    <>
      {/* 1. Desktop & Tablet Landscape View (inline or sliding drawer from right) */}
      {!isMobile ? (
        <div 
          className={`flex flex-col border-l border-white/10 bg-[#090d1a]/85 backdrop-blur-xl h-full transition-all duration-300 relative z-40 ${
            isOpen ? 'w-80' : 'w-0 border-l-0'
          }`}
        >
          {/* Toggle Pull Handle on Desktop/Tablet left border */}
          <button
              onClick={onToggle}
              className={`absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#111827] border border-white/10 flex items-center justify-center text-[#C2CCDE] hover:text-white cursor-pointer hover:bg-surface-light shadow-lg z-50 transition-all duration-200 ${
                isOpen ? '-left-4' : '-left-4 hover:-translate-x-1.5'
              }`}
            >
              {isOpen ? (
                <IconLayoutSidebarLeftCollapse className="w-5 h-5" />
              ) : (
                <IconLayoutSidebarLeftExpand className="w-5 h-5" />
              )}
            </button>

          {isOpen && (
            <div className="flex flex-col h-full overflow-hidden">


              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {/* Slot 1: Fixed Teacher Tile */}
                {teacherTrack ? (
                  <LazyParticipantTile trackRef={teacherTrack} />
                ) : (
                  <div className="aspect-video w-full relative rounded-xl overflow-hidden border border-white/5 bg-surface-light/10 shadow-md group flex items-center justify-center min-h-[120px] text-foreground/30 text-xs font-semibold">
                    No Teacher Camera
                  </div>
                )}

                {/* Slot 2+: Dynamic Student list */}
                {sidebarStudents.map((trackRef) => (
                  <LazyParticipantTile key={trackRef.participant.sid} trackRef={trackRef} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 2. Mobile Bottom Horizontal Feeds Row */
        <div 
          className={`fixed right-0 z-[100] transition-all duration-300 student-sidebar ${
            isLandscape || isFullscreen || !mobileControlsVisible
              ? 'pointer-events-none opacity-0 translate-y-20'
              : 'opacity-100 translate-y-0'
          }`}
          style={{
            left: hasLeftRail ? '52px' : '0px',
            bottom: '64px',
          }}
        >
          {/* Horizontal scrollable container for student tiles + Teacher */}
          <div className="flex flex-row overflow-x-auto gap-3 w-full p-3 scrollbar-none bg-[#060b18]/60 backdrop-blur-md border-t border-white/5">
            {/* Teacher Tile */}
            {teacherTrack && (
              <div className="h-[120px] aspect-video shrink-0">
                <LazyParticipantTile trackRef={teacherTrack} />
              </div>
            )}

            {/* Student Tiles */}
            {sidebarStudents.map((trackRef) => (
              <div key={trackRef.participant.sid} className="h-[120px] aspect-video shrink-0">
                <LazyParticipantTile trackRef={trackRef} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
