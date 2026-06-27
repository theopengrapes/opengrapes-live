'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import TiledView from './TiledView';
// import SpotlightView from './SpotlightView';
import SidebarView from './SidebarView';

interface GridViewProps {
  isTeacher: boolean;
  activeStudentTrack: TrackReferenceOrPlaceholder | null;
  teacherTrack: TrackReferenceOrPlaceholder | undefined;
  remoteStudents: TrackReferenceOrPlaceholder[];
  gridStudents: TrackReferenceOrPlaceholder[];
  cameraTracksCount: number;
  layoutMode: 'auto' | 'tiled' | 'spotlight' | 'sidebar';
  pinnedTrackSid: string | null;
  setPinnedTrackSid: (sid: string | null) => void;
  spotlightTrackSid: string | null;
  setSpotlightTrackSid: (sid: string | null) => void;
  onBroadcastSpotlight?: (sid: string | null) => void;
  localTrack: TrackReferenceOrPlaceholder | undefined;
  studentGridPage: number;
  setStudentGridPage: (page: number) => void;
}

// Custom ResizeObserver hook to measure container dimensions
function useContainerDimensions(ref: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current || typeof window === 'undefined') return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);

  return dimensions;
}

export default function GridView({
  isTeacher,
  activeStudentTrack,
  teacherTrack,
  remoteStudents,
  gridStudents,
  cameraTracksCount,
  layoutMode,
  pinnedTrackSid,
  setPinnedTrackSid,
  spotlightTrackSid,
  setSpotlightTrackSid,
  onBroadcastSpotlight,
  localTrack,
  studentGridPage,
  setStudentGridPage,
}: GridViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerDimensions(containerRef);

  // Dynamic page limits based on actual container width
  const tilesPerPage = useMemo(() => {
    if (width <= 0) return 9; // default fallback
    if (width < 640) return 4;
    if (width < 1024) return 6;
    return 9;
  }, [width]);

  const reservedList = useMemo(() => {
    const list: TrackReferenceOrPlaceholder[] = [];
    if (teacherTrack) {
      list.push(teacherTrack);
    }
    if (localTrack && (!teacherTrack || localTrack.participant.sid !== teacherTrack.participant.sid)) {
      list.push(localTrack);
    }
    return list;
  }, [teacherTrack, localTrack]);

  const studentsOnPage1 = useMemo(() => {
    return Math.max(0, tilesPerPage - reservedList.length);
  }, [tilesPerPage, reservedList.length]);

  const totalPages = useMemo(() => {
    const totalStudents = remoteStudents.length;
    if (totalStudents <= studentsOnPage1) return 1;
    return 1 + Math.ceil((totalStudents - studentsOnPage1) / tilesPerPage);
  }, [remoteStudents.length, studentsOnPage1, tilesPerPage]);

  // Auto-clamp page index if it goes out of bounds
  useEffect(() => {
    if (studentGridPage >= totalPages && totalPages > 0) {
      setStudentGridPage(totalPages - 1);
    }
  }, [studentGridPage, totalPages, setStudentGridPage]);

  const paginatedParticipants = useMemo(() => {
    if (studentGridPage === 0) {
      const pageStudents = remoteStudents.slice(0, studentsOnPage1);
      return [...reservedList, ...pageStudents];
    } else {
      const startIndex = studentsOnPage1 + (studentGridPage - 1) * tilesPerPage;
      const endIndex = startIndex + tilesPerPage;
      return remoteStudents.slice(startIndex, endIndex);
    }
  }, [studentGridPage, remoteStudents, studentsOnPage1, tilesPerPage, reservedList]);

  // Compile list of tiles depending on layout modes
  const allParticipants = useMemo(() => {
    const list = [teacherTrack, ...remoteStudents].filter((t): t is NonNullable<typeof t> => !!t);
    if (localTrack && !list.some((t) => t.participant.sid === localTrack.participant.sid)) {
      list.push(localTrack);
    }
    return list;
  }, [teacherTrack, remoteStudents, localTrack]);

  // Determine active featured tile (pinned locally, spotlighted globally, speaker focus, or teacher)
  const featuredTrack = useMemo(() => {
    // 1. Pinned locally
    if (pinnedTrackSid) {
      const found = allParticipants.find((t) => t.participant.sid === pinnedTrackSid);
      if (found) return found;
    }
    // 2. Spotlighted globally
    if (spotlightTrackSid) {
      const found = allParticipants.find((t) => t.participant.sid === spotlightTrackSid);
      if (found) return found;
    }
    // 3. Fallback depending on role
    return isTeacher ? activeStudentTrack : teacherTrack;
  }, [allParticipants, pinnedTrackSid, spotlightTrackSid, isTeacher, activeStudentTrack, teacherTrack]);

  // Handler for toggle pin
  const handleTogglePin = (sid: string) => {
    if (pinnedTrackSid === sid) {
      setPinnedTrackSid(null);
    } else {
      setPinnedTrackSid(sid);
    }
  };

  // Handler for toggle spotlight
  const handleToggleSpotlight = (sid: string) => {
    if (spotlightTrackSid === sid) {
      setSpotlightTrackSid(null);
      if (onBroadcastSpotlight) onBroadcastSpotlight(null);
    } else {
      setSpotlightTrackSid(sid);
      if (onBroadcastSpotlight) onBroadcastSpotlight(sid);
    }
  };

  // Check if spotlight mode or single participant spotlight
  const currentViewMode = useMemo(() => {
    if (layoutMode === 'spotlight') return 'spotlight';
    if (layoutMode === 'tiled') return 'tiled';
    if (layoutMode === 'sidebar') return 'sidebar';
    // 'auto' mode defaults to Tiled view
    return 'tiled';
  }, [layoutMode]);

  // Compute the list of participants for the sidebar (gridStudents + teacher/self custom layout)
  const sidebarParticipants = useMemo(() => {
    const teacher = isTeacher ? localTrack : teacherTrack;
    const self = localTrack;

    // Filter out self and teacher from the cloned gridStudents list first to avoid duplication
    const list = gridStudents.filter(t => 
      t.participant.sid !== self?.participant.sid && 
      t.participant.sid !== teacher?.participant.sid
    );
    
    const isTeacherFeatured = teacher && featuredTrack?.participant.sid === teacher.participant.sid;
    const isSelfFeatured = self && featuredTrack?.participant.sid === self.participant.sid;
    
    if (isTeacher) {
      if (!isTeacherFeatured && self) {
        list.unshift(self);
      }
    } else {
      if (isTeacherFeatured) {
        if (self) {
          list.unshift(self);
        }
      } else if (isSelfFeatured) {
        if (teacher) {
          list.unshift(teacher);
        }
      } else {
        if (self) {
          list.unshift(self);
        }
        if (teacher) {
          list.unshift(teacher);
        }
      }
    }
    
    return list;
  }, [gridStudents, teacherTrack, localTrack, isTeacher, featuredTrack]);

  if (cameraTracksCount === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <div className="text-center space-y-3 select-none">
          <svg
            className="w-12 h-12 mx-auto text-white/20 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          <p className="text-sm text-foreground/30 font-medium">Connecting you to the room...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 min-w-0">
      {/* SpotlightView is commented out
      {currentViewMode === 'spotlight' && (
        <SpotlightView
          featuredTrack={featuredTrack || null}
          isTeacher={isTeacher}
          pinnedTrackSid={pinnedTrackSid}
          spotlightTrackSid={spotlightTrackSid}
          onTogglePin={handleTogglePin}
          onToggleSpotlight={handleToggleSpotlight}
        />
      )}
      */}

      {currentViewMode === 'tiled' && (
        <TiledView
          allParticipants={paginatedParticipants}
          pinnedTrackSid={pinnedTrackSid}
          spotlightTrackSid={spotlightTrackSid}
          onTogglePin={handleTogglePin}
          onToggleSpotlight={handleToggleSpotlight}
          isTeacher={isTeacher}
          width={width}
          height={height}
          currentPage={studentGridPage}
          totalPages={totalPages}
          onPageChange={setStudentGridPage}
        />
      )}

      {currentViewMode === 'sidebar' && (
        <SidebarView
          featuredTrack={featuredTrack || null}
          gridStudents={sidebarParticipants}
          pinnedTrackSid={pinnedTrackSid}
          spotlightTrackSid={spotlightTrackSid}
          onTogglePin={handleTogglePin}
          onToggleSpotlight={handleToggleSpotlight}
          isTeacher={isTeacher}
        />
      )}
    </div>
  );
}
