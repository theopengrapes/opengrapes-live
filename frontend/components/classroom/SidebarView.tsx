'use client';

import React from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { IconUsers } from '@tabler/icons-react';
import CustomVideoTile from './CustomVideoTile';

interface SidebarViewProps {
  featuredTrack: TrackReferenceOrPlaceholder | null;
  gridStudents: TrackReferenceOrPlaceholder[];
  pinnedTrackSid: string | null;
  spotlightTrackSid: string | null;
  onTogglePin: (sid: string) => void;
  onToggleSpotlight: (sid: string) => void;
  isTeacher: boolean;
}

export default function SidebarView({
  featuredTrack,
  gridStudents,
  pinnedTrackSid,
  spotlightTrackSid,
  onTogglePin,
  onToggleSpotlight,
  isTeacher,
}: SidebarViewProps) {
  return (
    <div className="w-full h-full flex flex-col md:flex-row gap-6 p-4 md:p-6 overflow-y-auto md:overflow-hidden min-h-0">
      {/* Featured Stage (Left on desktop, Top on mobile) */}
      <div className="w-full aspect-video md:flex-1 shrink-0 min-w-0 min-h-0 flex items-center justify-center relative md:h-full">
        {featuredTrack ? (
          <div className="w-full h-full aspect-video max-h-full">
            <CustomVideoTile
              trackRef={featuredTrack}
              isPinned={pinnedTrackSid === featuredTrack.participant.sid}
              onPin={() => onTogglePin(featuredTrack.participant.sid)}
              isSpotlighted={spotlightTrackSid === featuredTrack.participant.sid}
              onSpotlight={() => onToggleSpotlight(featuredTrack.participant.sid)}
              showSpotlightBtn={isTeacher}
            />
          </div>
        ) : (
          <div className="w-full aspect-video flex flex-col items-center justify-center bg-surface border border-white/5 rounded-2xl text-foreground/30 font-medium">
            <IconUsers className="w-12 h-12 text-white/20 mb-3" />
            <span>{isTeacher ? 'Waiting for students...' : 'Connecting to teacher...'}</span>
          </div>
        )}
      </div>

      {/* Grid of Other Students (Right scrollable column on desktop, Bottom grid on mobile) */}
      {/* Hardcoded to md:w-80 lg:w-80 (320px) to match other sidebar panels */}
      <div className="w-full md:w-80 lg:w-80 shrink-0 h-auto md:h-full min-w-0 min-h-0 flex flex-col relative justify-start">
        {gridStudents.length === 0 ? (
          <div className="text-center text-foreground/30 text-sm font-medium py-10">
            No other participants active
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto w-full pr-1 gap-4 grid grid-cols-2 md:flex md:flex-col max-h-[35vh] md:max-h-full scrollbar-thin">
            {gridStudents.map((trackRef) => (
              <div key={trackRef.participant.sid} className="w-full aspect-video shrink-0 relative">
                <CustomVideoTile
                  trackRef={trackRef}
                  isPinned={pinnedTrackSid === trackRef.participant.sid}
                  onPin={() => onTogglePin(trackRef.participant.sid)}
                  isSpotlighted={spotlightTrackSid === trackRef.participant.sid}
                  onSpotlight={() => onToggleSpotlight(trackRef.participant.sid)}
                  showSpotlightBtn={isTeacher}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
