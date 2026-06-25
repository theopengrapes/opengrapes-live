/*
'use client';

import React from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import CustomVideoTile from './CustomVideoTile';

interface SpotlightViewProps {
  featuredTrack: TrackReferenceOrPlaceholder | null;
  isTeacher: boolean;
  pinnedTrackSid: string | null;
  spotlightTrackSid: string | null;
  onTogglePin: (sid: string) => void;
  onToggleSpotlight: (sid: string) => void;
}

export default function SpotlightView({
  featuredTrack,
  isTeacher,
  pinnedTrackSid,
  spotlightTrackSid,
  onTogglePin,
  onToggleSpotlight,
}: SpotlightViewProps) {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      {featuredTrack ? (
        <div className="w-full h-full max-w-5xl aspect-video relative">
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
        <div className="text-center text-[#C2CCDE]/30">No target for spotlight</div>
      )}
    </div>
  );
}
*/
export default function SpotlightView() {
  return null;
}
