'use client';

import React, { useMemo, useRef } from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import CustomVideoTile from './CustomVideoTile';

interface TiledViewProps {
  allParticipants: TrackReferenceOrPlaceholder[];
  pinnedTrackSid: string | null;
  spotlightTrackSid: string | null;
  onTogglePin: (sid: string) => void;
  onToggleSpotlight: (sid: string) => void;
  isTeacher: boolean;
  width: number;
  height: number;
}

// Optimal layout fitting calculation (Google Meet style)
function calculateOptimalLayout(
  containerWidth: number,
  containerHeight: number,
  tileCount: number,
  aspectRatio: number = 16 / 9
) {
  let bestWidth = 0;
  let bestHeight = 0;
  let bestCols = 1;
  let bestRows = 1;
  let maxArea = 0;

  if (containerWidth <= 0 || containerHeight <= 0 || tileCount <= 0) {
    return { tileWidth: 0, tileHeight: 0, cols: 1, rows: 1 };
  }

  const gap = 16; // gap-4 (16px)

  for (let cols = 1; cols <= tileCount; cols++) {
    const rows = Math.ceil(tileCount / cols);

    const availableWidth = containerWidth - (cols - 1) * gap - 24;
    const availableHeight = containerHeight - (rows - 1) * gap - 24;

    const w = availableWidth / cols;
    const h = availableHeight / rows;

    if (w <= 0 || h <= 0) continue;

    let tileW = w;
    let tileH = h;

    if (w / h > aspectRatio) {
      tileW = h * aspectRatio;
      tileH = h;
    } else {
      tileW = w;
      tileH = w / aspectRatio;
    }

    const area = tileW * tileH * tileCount;
    if (area > maxArea) {
      maxArea = area;
      bestWidth = tileW;
      bestHeight = tileH;
      bestCols = cols;
      bestRows = rows;
    }
  }

  return {
    tileWidth: Math.floor(bestWidth),
    tileHeight: Math.floor(bestHeight),
    cols: bestCols,
    rows: bestRows,
  };
}

export default function TiledView({
  allParticipants,
  pinnedTrackSid,
  spotlightTrackSid,
  onTogglePin,
  onToggleSpotlight,
  isTeacher,
  width,
  height,
}: TiledViewProps) {
  const tiledLayout = useMemo(() => {
    return calculateOptimalLayout(width, height, allParticipants.length);
  }, [width, height, allParticipants.length]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4 min-h-0 min-w-0 overflow-hidden">
      <div
        className="grid gap-4 items-center justify-center transition-all duration-300"
        style={{
          gridTemplateColumns: `repeat(${tiledLayout.cols}, minmax(0, 1fr))`,
          width: tiledLayout.cols * tiledLayout.tileWidth + (tiledLayout.cols - 1) * 16,
          height: tiledLayout.rows * tiledLayout.tileHeight + (tiledLayout.rows - 1) * 16,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {allParticipants.map((trackRef) => (
          <div
            key={trackRef.participant.sid}
            style={{
              width: tiledLayout.tileWidth,
              height: tiledLayout.tileHeight,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
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
    </div>
  );
}
