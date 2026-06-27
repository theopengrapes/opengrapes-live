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
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
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

    const availableWidth = containerWidth - (cols - 1) * gap - 40;
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
  currentPage,
  totalPages,
  onPageChange,
}: TiledViewProps) {
  const tiledLayout = useMemo(() => {
    const layout = calculateOptimalLayout(width, height, allParticipants.length);
    console.log('[TiledView Debug]', {
      containerWidth: width,
      containerHeight: height,
      participantCount: allParticipants.length,
      calculatedLayout: layout
    });
    return layout;
  }, [width, height, allParticipants.length]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4 min-h-0 min-w-0 overflow-hidden relative">
      <div
        className="flex flex-wrap gap-4 items-center justify-center transition-all duration-300 content-center"
        style={{
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

      {totalPages > 1 && (
        <>
          {/* Previous Page Button */}
          {currentPage > 0 && (
            <span
              onClick={() => onPageChange(currentPage - 1)}
              className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-[#0d111d]/75 hover:bg-[#1f293d]/90 border border-white/10 backdrop-blur-md text-white/80 hover:text-white cursor-pointer select-none transition-all duration-200 shadow-xl hover:scale-105 active:scale-95 animate-fade-in"
              title="Previous Page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </span>
          )}

          {/* Next Page Button */}
          {currentPage < totalPages - 1 && (
            <span
              onClick={() => onPageChange(currentPage + 1)}
              className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-[#0d111d]/75 hover:bg-[#1f293d]/90 border border-white/10 backdrop-blur-md text-white/80 hover:text-white cursor-pointer select-none transition-all duration-200 shadow-xl hover:scale-105 active:scale-95 animate-fade-in"
              title="Next Page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}

          {/* Page indicator dot/pill */}
          <span className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-[#0d111d]/75 border border-white/10 backdrop-blur-md text-xs font-semibold text-white/75 select-none shadow-lg tracking-wider animate-fade-in">
            {currentPage + 1} / {totalPages}
          </span>
        </>
      )}
    </div>
  );
}
