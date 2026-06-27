'use client';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
  useParticipants,
  useMediaDeviceSelect,
} from '@livekit/components-react';
import { Track, Room, RoomOptions, RoomConnectOptions, RoomEvent, DisconnectReason } from 'livekit-client';
import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import WhiteboardWrapper from './WhiteboardWrapper';
import { useAudioTranscriber } from '../hooks/useAudioTranscriber';
import { decodeJwt } from '@/lib/api';
import { useClassroomSession } from '@/hooks/useClassroomSession';
import type { IceServer } from '@/lib/api';
import { useMobileBackButton } from '../hooks/useMobileBackButton';

import { getPagesSorted } from './classroom/whiteboard-helpers';
import { 
  IconMaximize, 
  IconMinimize, 
  IconUsers,
  IconMicrophone,
  IconMicrophoneOff,
  IconVideo,
  IconVideoOff,
  IconScreenShare,
  IconChalkboard,
  IconChalkboardOff,
  IconLayoutDashboard,
  IconTableSpark,
  IconLayoutGrid,
  IconLayoutSidebarRight,
  IconRectangle,
  IconMessage,
  IconHelpCircle,
  IconSparkles,
  IconFileText,
  IconLock,
  IconGalaxy,
  IconFileTextSpark,
  IconChevronUp
} from '@tabler/icons-react';
import { Phone } from 'lucide-react';
import Tooltip from './classroom/Tooltip';

const STROKE_WIDTH = 1.75; // Shared stroke width for all control bar and LeftRail icons

import Controls from './classroom/Controls';
import FloatingTeacherTile from './classroom/FloatingTeacherTile';
import StudentSidebar from './classroom/StudentSidebar';
import GridView from './classroom/GridView';
import ChatPanel from './classroom/ChatPanel';
import LeftRail from './classroom/LeftRail';
import ParticipantsOverlay from './classroom/ParticipantsOverlay';

export interface ChatMessage {
  id: string;
  senderSid: string;
  senderName: string;
  senderIdentity: string;
  text: string;
  timestamp: number;
  recipientIdentity?: string;
  recipientName?: string;
}

interface VideoRoomProps {
  token: string;
  roomName: string;
  serverUrl: string;
  userName?: string;
  iceServers?: IceServer[];
  onDisconnected?: (reason: 'ended' | 'left') => void;
  sessionToken?: string;
  audioDeviceId?: string;
  videoDeviceId?: string;
  onConnected?: () => void;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

interface RoomContentProps {
  roomName: string;
  userName?: string;
  onLeave: (reason?: 'teacher-absent' | 'ended-for-all') => void;
  onConnected?: () => void;
  sessionToken?: string;
}

function getSavedState<T>(roomName: string, keySuffix: string, defaultValue: T, sessionToken?: string): T {
  if (typeof window === 'undefined' || !sessionToken) return defaultValue;
  try {
    const decoded = decodeJwt(sessionToken);
    if (decoded?.role === 'teacher') {
      const saved = localStorage.getItem(`${keySuffix}_${roomName}`);
      if (saved !== null) return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to parse saved state:', e);
  }
  return defaultValue;
}

function RoomContent({ roomName, userName, onLeave, onConnected, sessionToken }: RoomContentProps) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const isTeacher = localParticipant?.metadata === 'teacher';

  const [cameraOn, setCameraOn] = useState(isCameraEnabled);
  const [micOn, setMicOn] = useState(isMicrophoneEnabled);
  const hasInitializedTogglesRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedTogglesRef.current && localParticipant) {
      setCameraOn(isCameraEnabled);
      setMicOn(isMicrophoneEnabled);
      hasInitializedTogglesRef.current = true;
    }
  }, [localParticipant, isCameraEnabled, isMicrophoneEnabled]);

  const handleCameraToggle = async () => {
    if (!localParticipant) return;
    const previous = cameraOn;
    setCameraOn(!previous);
    try {
      await localParticipant.setCameraEnabled(!previous);
    } catch (err) {
      setCameraOn(previous);
      alert("Camera toggle failed. Check permissions.");
    }
  };

  const handleMicToggle = async () => {
    if (!localParticipant) return;
    const previous = micOn;
    setMicOn(!previous);
    try {
      await localParticipant.setMicrophoneEnabled(!previous);
    } catch (err) {
      setMicOn(previous);
      alert("Microphone toggle failed. Check permissions.");
    }
  };

  const {
    devices: audioDevices,
    activeDeviceId: activeAudioId,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({ kind: 'audioinput', requestPermissions: true });

  const {
    devices: videoDevices,
    activeDeviceId: activeVideoId,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({ kind: 'videoinput', requestPermissions: true });

  const [startedAtMs] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const val = sessionStorage.getItem('classroom_session_started_at');
      if (val) return parseInt(val, 10);
    }
    return Date.now();
  });

  const participantId = localParticipant?.identity || '';
  const participantName = localParticipant?.name || userName || 'Participant';
  const participantRole = isTeacher ? 'teacher' : 'student';

  useAudioTranscriber({
    sessionId: roomName,
    participantId,
    role: participantRole,
    name: participantName,
    startedAtMs,
    isEnabled: connectionState === 'connected' && isMicrophoneEnabled,
  });

  const [topicNotes, setTopicNotes] = useState('');

  // Fetch and poll the active class topic notes
  useEffect(() => {
    const fetchTopic = async () => {
      try {
        const accessToken = sessionStorage.getItem('classroom_access_token');
        if (!accessToken) return;
        const res = await fetch(`/api/summary/${roomName}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTopicNotes(data.topicNotes || '');
        }
      } catch (err) {
        console.error('Failed to fetch topic notes:', err);
      }
    };

    fetchTopic();
    // Poll for topic updates every 10 seconds, particularly for students
    const interval = setInterval(fetchTopic, 10000);
    return () => clearInterval(interval);
  }, [roomName]);

  const handleUpdateTopic = async (newTopic: string) => {
    setTopicNotes(newTopic);
    try {
      const accessToken = sessionStorage.getItem('classroom_access_token');
      if (!accessToken) return;
      await fetch(`/api/transcript/${roomName}/topic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ topicNotes: newTopic })
      });
    } catch (err) {
      console.error('Failed to update topic notes:', err);
    }
  };

  useEffect(() => {
    if (connectionState === 'connected') {
      onConnected?.();
    }
  }, [connectionState, onConnected]);

  const [showWhiteboard, setShowWhiteboard] = useState(() =>
    getSavedState(roomName, 'whiteboard_active', false, sessionToken)
  );

  // Query all active camera feeds and screen shares
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const screenShareTrackRef = tracks.find(t => t.source === Track.Source.ScreenShare);
  const hasScreenShare = !!screenShareTrackRef;
  const cameraTracks = tracks.filter(t => t.source === Track.Source.Camera);

  // Whiteboard or Screen Share triggers the Split Layout (Main pane + right sidebar)
  const showSplitLayout = showWhiteboard || hasScreenShare;

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'spotlight' | 'sidebar' | 'focus'>('auto');
  const [pinnedTrackSid, setPinnedTrackSid] = useState<string | null>(null);
  const [spotlightTrackSid, setSpotlightTrackSid] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1024);
  const [isPhone, setIsPhone] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  const layoutLandscape = isLandscape || isFullscreen;

  const roomContainerRef = useRef<HTMLDivElement>(null);
  const isMouseOverControlsRef = useRef(false);
  // Used by whiteboard tap handler to track pointer start position/time for gesture detection
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const lowercaseUa = ua.toLowerCase();
    
    // Check if it's specifically a phone
    const isPhoneDevice = /iphone|ipod/.test(lowercaseUa) || 
                          (/android/.test(lowercaseUa) && /mobile/.test(lowercaseUa)) ||
                          /blackberry|iemobile|opera mini/i.test(lowercaseUa);
                          
    // Check if it's specifically a tablet
    const isTabletDevice = /ipad/.test(lowercaseUa) || 
                           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                           (/android/.test(lowercaseUa) && !/mobile/.test(lowercaseUa)) ||
                           /tablet|playbook|silk/i.test(lowercaseUa);

    setIsPhone(isPhoneDevice);
    setIsTablet(isTabletDevice);

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const landscape = width > height;
      
      setIsLandscape(landscape);
      setWindowWidth(width);

      const isPortraitTablet = isTabletDevice && !landscape;
      const isSmallScreen = width < 768;
      
      // Mobile controls/layout condition
      const treatAsMobile = isPhoneDevice || isPortraitTablet || isSmallScreen;
      setIsMobile(treatAsMobile);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen to fullscreen changes
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (!isCurrentlyFullscreen) {
        const orientation = (screen as any).orientation;
        if (orientation && typeof orientation.unlock === 'function') {
          try {
            orientation.unlock();
          } catch (err) {
            // ignore
          }
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);



  // Toggle controls on viewport click (ignoring interactive elements and controls bar itself)
  // Note: .whiteboard-container has its own pointer handlers below.
  // .screenshare-container is intentionally NOT excluded — tapping screen-share toggles controls.
  const handleViewportClick = useCallback((e: React.MouseEvent) => {
    if (!isMobile || (!isPhone && !isTablet)) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea') ||
      target.closest('[role="button"]') ||
      target.closest('a') ||
      target.closest('.whiteboard-container') ||
      target.closest('.student-sidebar') ||
      target.closest('.controls-bar')
    ) {
      return;
    }
    setControlsVisible(prev => !prev);
  }, [isMobile, isPhone, isTablet]);


  // Toggle fullscreen and lock screen orientation
  const handleToggleFullscreen = useCallback(async () => {
    if (!roomContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await roomContainerRef.current.requestFullscreen();
        const orientation = (screen as any).orientation;
        if (orientation && typeof orientation.lock === 'function') {
          await orientation.lock('landscape').catch(() => {});
        }
      } else {
        await document.exitFullscreen();
        const orientation = (screen as any).orientation;
        if (orientation && typeof orientation.unlock === 'function') {
          try {
            orientation.unlock();
          } catch (err) {
            // ignore
          }
        }
      }
    } catch (err) {
      console.error('Fullscreen/Orientation lock error:', err);
    }
  }, []);

  // Unified Mobile Layout state sync: Auto-switch focusMode and controls visibility
  useEffect(() => {
    if (isMobile) {
      if (layoutLandscape || isFullscreen || showWhiteboard) {
        setIsFocusMode(true);
        setLayoutMode('focus');
        setControlsVisible(true); // Always show controls overlay initially in landscape / fullscreen / whiteboard
      } else {
        setIsFocusMode(false);
        setLayoutMode(showSplitLayout ? 'sidebar' : 'tiled');
        setControlsVisible(true);
      }
    }
  }, [isMobile, layoutLandscape, isFullscreen, showWhiteboard, showSplitLayout]);

  // Auto-switch layout mode when a participant is pinned locally or spotlighted by teacher
  useEffect(() => {
    if (pinnedTrackSid || spotlightTrackSid) {
      setLayoutMode('sidebar');
    } else {
      setLayoutMode((prev) => (prev === 'focus' ? 'focus' : 'tiled'));
    }
  }, [pinnedTrackSid, spotlightTrackSid]);

  // Synchronize layoutMode and isFocusMode
  useEffect(() => {
    if (isFocusMode) {
      if (layoutMode !== 'focus') {
        setLayoutMode('focus');
      }
    } else {
      if (layoutMode === 'focus') {
        setLayoutMode(showSplitLayout ? 'sidebar' : 'tiled');
      }
    }
  }, [isFocusMode, showSplitLayout]);

  useEffect(() => {
    setIsFocusMode(layoutMode === 'focus');
  }, [layoutMode]);

  const [studentGridPage, setStudentGridPage] = useState(0);
  const [sidebarPage, setSidebarPage] = useState(0);
  const [lastActiveStudentSid, setLastActiveStudentSid] = useState<string | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedPdfUrl, setExportedPdfUrl] = useState<string | null>(null);

  const [showEndCallModal, setShowEndCallModal] = useState(false);

  const batchId = useMemo(() => {
    if (!sessionToken) return null;
    const decoded = decodeJwt(sessionToken);
    return decoded?.batchId || null;
  }, [sessionToken]);

  // Chat & Participants states
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'chat' | 'participants' | 'doubt' | 'summary' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChatTarget, setActiveChatTarget] = useState<{ identity: string; name: string } | null>(null);

  const [showParticipantsOverlay, setShowParticipantsOverlay] = useState(false);
  const [isChatPinned, setIsChatPinned] = useState(false);

  useMobileBackButton({
    isPanelOpen: activeRightPanelTab !== null || showParticipantsOverlay || showWhiteboard,
    onClosePanel: () => {
      setActiveRightPanelTab(null);
      setShowParticipantsOverlay(false);
      setShowWhiteboard(false);
    },
    onLeave: () => {
      if (isTeacher) {
        setShowEndCallModal(true);
      } else {
        onLeave();
      }
    },
    enabled: isMobile,
  });

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const micMenuRef = useRef<HTMLDivElement>(null);
  const [showCamMenu, setShowCamMenu] = useState(false);
  const camMenuRef = useRef<HTMLDivElement>(null);

  // Inactivity timer to auto-hide controls (Only for desktop narrow viewport < 768px)
  useEffect(() => {
    const isDesktopNarrow = !isPhone && !isTablet && isMobile;
    
    if (!isDesktopNarrow) {
      // If we are on desktop wide (or tablet landscape) where isMobile is false,
      // make sure controls are always visible (fixed bottom bar)
      if (!isPhone && !isTablet && !isMobile) {
        setControlsVisible(true);
      }
      return;
    }
    
    let timer: NodeJS.Timeout | null = null;
    let timerRunning = false;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timerRunning = true;
      timer = setTimeout(() => {
        // Auto-hide only if:
        // - no menus/popovers are open
        // - mouse is not hovering over the controls bar
        if (
          !showMicMenu &&
          !showCamMenu &&
          !showLayoutMenu &&
          !isMouseOverControlsRef.current
        ) {
          setControlsVisible(false);
          timerRunning = false;
        }
      }, 3500); // 3.5 seconds
    };

    const handleUserActivity = (e: MouseEvent | TouchEvent) => {
      const mouseEvent = e as MouseEvent;
      const isNearBottom = mouseEvent.clientY >= window.innerHeight * 0.85;
      const isNearTop = mouseEvent.clientY <= 68;
      if (isNearBottom || isNearTop) {
        setControlsVisible(true);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        timerRunning = false;
      } else {
        if (!timerRunning) {
          resetTimer();
        }
      }
    };

    if (controlsVisible) {
      resetTimer();
      window.addEventListener('mousemove', handleUserActivity);
      window.addEventListener('pointerdown', handleUserActivity as any);
      return () => {
        if (timer) clearTimeout(timer);
        window.removeEventListener('mousemove', handleUserActivity);
        window.removeEventListener('pointerdown', handleUserActivity as any);
      };
    } else {
      // If hidden, show controls ONLY when mouse moves or is clicked near the bottom (bottom 15%) or near the top (header + buffer)
      const handleActivityHidden = (e: MouseEvent) => {
        const isNearBottom = e.clientY >= window.innerHeight * 0.85;
        const isNearTop = e.clientY <= 68;
        if (isNearBottom || isNearTop) {
          setControlsVisible(true);
        }
      };
      window.addEventListener('mousemove', handleActivityHidden);
      window.addEventListener('pointerdown', handleActivityHidden as any);
      return () => {
        window.removeEventListener('mousemove', handleActivityHidden);
        window.removeEventListener('pointerdown', handleActivityHidden as any);
      };
    }
  }, [controlsVisible, showMicMenu, showCamMenu, showLayoutMenu, isMobile, isPhone, isTablet]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAtMs]);

  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num: number) => String(num).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const handleStartDM = useCallback((p: any) => {
    const pName = p.name || p.identity;
    setActiveChatTarget({ identity: p.identity, name: pName });
    setActiveRightPanelTab('chat');
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(event.target as Node)) {
        setShowLayoutMenu(false);
      }
    }
    if (showLayoutMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLayoutMenu]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (micMenuRef.current && !micMenuRef.current.contains(event.target as Node)) {
        setShowMicMenu(false);
      }
    }
    if (showMicMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMicMenu]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (camMenuRef.current && !camMenuRef.current.contains(event.target as Node)) {
        setShowCamMenu(false);
      }
    }
    if (showCamMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCamMenu]);

  const [globalWhiteboardAllowed, setGlobalWhiteboardAllowed] = useState(() =>
    getSavedState(roomName, 'global_whiteboard_allowed', false, sessionToken)
  );
  const [globalScreenShareAllowed, setGlobalScreenShareAllowed] = useState(() =>
    getSavedState(roomName, 'global_screenshare_allowed', false, sessionToken)
  );
  const [allowedWhiteboardStudents, setAllowedWhiteboardStudents] = useState<Record<string, boolean>>(() =>
    getSavedState<Record<string, boolean>>(roomName, 'allowed_whiteboard_students', {}, sessionToken)
  );
  const [allowedScreenShareStudents, setAllowedScreenShareStudents] = useState<Record<string, boolean>>(() =>
    getSavedState<Record<string, boolean>>(roomName, 'allowed_screenshare_students', {}, sessionToken)
  );
  const [teacherAbsentTimeLeft, setTeacherAbsentTimeLeft] = useState<number | null>(null);
  const participants = useParticipants();

  // Auto-disconnect student if teacher is not present in the room
  const hasTeacher = useMemo(() => {
    return participants.some(p => p.metadata === 'teacher');
  }, [participants]);

  useEffect(() => {
    if (isTeacher || connectionState !== 'connected') {
      setTeacherAbsentTimeLeft(null);
      return;
    }

    if (!hasTeacher) {
      setTeacherAbsentTimeLeft(600); // 10 minutes (600 seconds)
      const interval = setInterval(() => {
        setTeacherAbsentTimeLeft((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            alert("The teacher is not in the meeting. You will be redirected to the dashboard.");
            onLeave('teacher-absent');
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTeacherAbsentTimeLeft(null);
    }
  }, [isTeacher, hasTeacher, connectionState, onLeave]);

  const isWhiteboardAllowed = useMemo(() => {
    if (isTeacher) return true;
    if (globalWhiteboardAllowed) return true;
    if (!localParticipant) return false;
    return !!allowedWhiteboardStudents[localParticipant.identity];
  }, [isTeacher, globalWhiteboardAllowed, localParticipant, allowedWhiteboardStudents]);

  const isScreenShareAllowed = useMemo(() => {
    if (isTeacher) return true;
    if (globalScreenShareAllowed) return true;
    if (!localParticipant) return false;
    return !!allowedScreenShareStudents[localParticipant.identity];
  }, [isTeacher, globalScreenShareAllowed, localParticipant, allowedScreenShareStudents]);

  // --- Whiteboard tap-to-toggle controls ---
  // For read-only students: any touch toggles controls.
  // For students with edit permission (isWhiteboardAllowed && !isTeacher): only a stationary tap
  // (pointer moved <8px and held <300ms) toggles controls; a drawing stroke is ignored.
  const handleWhiteboardPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMobile || (!isPhone && !isTablet)) return;
    // Do not capture pointer here — let tldraw handle drawing normally
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, [isMobile, isPhone, isTablet]);

  const handleWhiteboardPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isMobile || (!isPhone && !isTablet)) return;
    const target = e.target as HTMLElement;
    // Never toggle when tapping interactive elements
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('[role="button"]') ||
      target.closest('a')
    ) {
      pointerStartRef.current = null;
      return;
    }
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    const dt = Date.now() - start.time;
    const isSimpleTap = dx < 8 && dy < 8 && dt < 300;

    // Read-only mode (student without edit permission) or teacher: toggle on any simple tap
    if (!isWhiteboardAllowed || isTeacher) {
      if (isSimpleTap) {
        setControlsVisible(prev => !prev);
      }
      return;
    }

    // Student with edit permission: only toggle on a stationary tap (not a stroke/draw)
    if (isSimpleTap) {
      setControlsVisible(prev => !prev);
    }
    // else: was a drag/draw — do not toggle, let tldraw handle the stroke
  }, [isMobile, isPhone, isTablet, isWhiteboardAllowed, isTeacher]);

  const handleToggleGlobalPermission = useCallback(async (type: 'whiteboard' | 'screenshare') => {
    if (!isTeacher || !localParticipant) return;

    let nextWhiteboard = globalWhiteboardAllowed;
    let nextScreenShare = globalScreenShareAllowed;

    if (type === 'whiteboard') {
      nextWhiteboard = !globalWhiteboardAllowed;
      setGlobalWhiteboardAllowed(nextWhiteboard);
    } else {
      nextScreenShare = !globalScreenShareAllowed;
      setGlobalScreenShareAllowed(nextScreenShare);
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'UPDATE_PERMISSIONS',
        globalWhiteboardAllowed: nextWhiteboard,
        globalScreenShareAllowed: nextScreenShare,
        allowedWhiteboardStudents,
        allowedScreenShareStudents,
      }));
      await localParticipant.publishData(data, { reliable: true });
    } catch (err) {
      console.error('Failed to broadcast global permissions update:', err);
    }
  }, [isTeacher, localParticipant, globalWhiteboardAllowed, globalScreenShareAllowed, allowedWhiteboardStudents, allowedScreenShareStudents]);

  const handleToggleStudentPermission = useCallback(async (studentIdentity: string, type: 'whiteboard' | 'screenshare') => {
    if (!isTeacher || !localParticipant) return;

    let nextAllowedWhiteboard = { ...allowedWhiteboardStudents };
    let nextAllowedScreenShare = { ...allowedScreenShareStudents };

    if (type === 'whiteboard') {
      nextAllowedWhiteboard[studentIdentity] = !allowedWhiteboardStudents[studentIdentity];
      setAllowedWhiteboardStudents(nextAllowedWhiteboard);
    } else {
      nextAllowedScreenShare[studentIdentity] = !allowedScreenShareStudents[studentIdentity];
      setAllowedScreenShareStudents(nextAllowedScreenShare);
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'UPDATE_PERMISSIONS',
        globalWhiteboardAllowed,
        globalScreenShareAllowed,
        allowedWhiteboardStudents: nextAllowedWhiteboard,
        allowedScreenShareStudents: nextAllowedScreenShare,
      }));
      await localParticipant.publishData(data, { reliable: true });
    } catch (err) {
      console.error('Failed to broadcast student permission update:', err);
    }
  }, [isTeacher, localParticipant, globalWhiteboardAllowed, globalScreenShareAllowed, allowedWhiteboardStudents, allowedScreenShareStudents]);

  const boundsCleanupRef = useRef<(() => void) | null>(null);

  // Clean up bounds listener on unmount
  useEffect(() => {
    return () => {
      if (boundsCleanupRef.current) {
        boundsCleanupRef.current();
      }
    };
  }, []);

  // Save whiteboard permissions/state to localStorage for teachers
  useEffect(() => {
    if (!isTeacher || typeof window === 'undefined') return;
    try {
      localStorage.setItem(`whiteboard_active_${roomName}`, JSON.stringify(showWhiteboard));
      localStorage.setItem(`global_whiteboard_allowed_${roomName}`, JSON.stringify(globalWhiteboardAllowed));
      localStorage.setItem(`global_screenshare_allowed_${roomName}`, JSON.stringify(globalScreenShareAllowed));
      localStorage.setItem(`allowed_whiteboard_students_${roomName}`, JSON.stringify(allowedWhiteboardStudents));
      localStorage.setItem(`allowed_screenshare_students_${roomName}`, JSON.stringify(allowedScreenShareStudents));
    } catch (e) {
      console.warn('[VideoRoom] Failed to save whiteboard state to localStorage:', e);
    }
  }, [
    isTeacher,
    roomName,
    showWhiteboard,
    globalWhiteboardAllowed,
    globalScreenShareAllowed,
    allowedWhiteboardStudents,
    allowedScreenShareStudents,
  ]);

  const hasBroadcastedInitialRef = useRef(false);

  // Broadcast whiteboard state on connection/reconnection
  useEffect(() => {
    if (connectionState !== 'connected') {
      hasBroadcastedInitialRef.current = false;
      return;
    }
    if (hasBroadcastedInitialRef.current) return;

    if (isTeacher && localParticipant) {
      hasBroadcastedInitialRef.current = true;
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'SET_WHITEBOARD',
        active: showWhiteboard,
        globalWhiteboardAllowed,
        globalScreenShareAllowed,
        allowedWhiteboardStudents,
        allowedScreenShareStudents,
      }));
      localParticipant.publishData(data, { reliable: true }).catch(err => {
        console.error('Failed to broadcast initial whiteboard state:', err);
      });
    }
  }, [
    connectionState,
    isTeacher,
    localParticipant,
    showWhiteboard,
    globalWhiteboardAllowed,
    globalScreenShareAllowed,
    allowedWhiteboardStudents,
    allowedScreenShareStudents,
  ]);

  // Auto-close chat/participants panel when entering focus mode
  useEffect(() => {
    if (isFocusMode) {
      setActiveRightPanelTab(null);
    }
  }, [isFocusMode]);

  const handleEditorMount = useCallback((editorInstance: any) => {
    setEditor(editorInstance);

    // Clean up previous listener if exists
    if (boundsCleanupRef.current) {
      boundsCleanupRef.current();
    }

    let cachedFramesBounds: { x: number; y: number; w: number; h: number }[] = [];

    const updateCachedFrames = () => {
      const frames = editorInstance.getCurrentPageShapes().filter((s: any) => s.type === 'frame');
      cachedFramesBounds = frames
        .map((f: any) => {
          const bounds = editorInstance.getShapePageBounds(f.id);
          return bounds ? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } : null;
        })
        .filter((b: any): b is { x: number; y: number; w: number; h: number } => !!b);
    };

    // Initialize cache
    updateCachedFrames();

    // Invalidate/update cache when frames change
    const cleanupFrames = editorInstance.store.listen((event: any) => {
      const hasAddedFrame = event.changes.added && 
        Object.values(event.changes.added).some((s: any) => s.typeName === 'shape' && s.type === 'frame');
      const hasRemovedFrame = event.changes.removed && 
        Object.values(event.changes.removed).some((s: any) => s.typeName === 'shape' && s.type === 'frame');
      const hasUpdatedFrame = event.changes.updated && 
        Object.values(event.changes.updated).some(([prev, curr]: any) => curr.typeName === 'shape' && curr.type === 'frame');

      if (hasAddedFrame || hasRemovedFrame || hasUpdatedFrame) {
        updateCachedFrames();
      }
    }, { scope: 'document' });

    // Register listener to enforce frame boundaries using cached bounds
    const cleanupEnforcer = editorInstance.store.listen((event: any) => {
      if (event.source !== 'user') return;

      const isShapeInsideAnyFrame = (shape: any) => {
        if (shape.type === 'frame') return true;

        // Check if parent is a frame
        if (shape.parentId && shape.parentId !== editorInstance.getCurrentPageId()) {
          const parent = editorInstance.getShape(shape.parentId);
          if (parent && parent.type === 'frame') return true;
        }

        // Check bounds
        try {
          const shapeBounds = editorInstance.getShapePageBounds(shape.id);
          if (!shapeBounds) return false;

          const shapeCenter = {
            x: shapeBounds.x + shapeBounds.w / 2,
            y: shapeBounds.y + shapeBounds.h / 2,
          };

          // See if center is inside any frame
          for (const fb of cachedFramesBounds) {
            if (
              shapeCenter.x >= fb.x &&
              shapeCenter.x <= fb.x + fb.w &&
              shapeCenter.y >= fb.y &&
              shapeCenter.y <= fb.y + fb.h
            ) {
              return true;
            }
          }
        } catch (e) {
          // If shape is not fully initialized in layout, assume it is inside/valid for now
          return true;
        }

        return false;
      };

      // 1. Handle shapes added outside frames
      if (event.changes.added) {
        const shapesToDelete: string[] = [];
        Object.values(event.changes.added).forEach((shape: any) => {
          if (shape.typeName === 'shape') {
            if (!isShapeInsideAnyFrame(shape)) {
              shapesToDelete.push(shape.id);
            }
          }
        });

        if (shapesToDelete.length > 0) {
          editorInstance.run(() => {
            editorInstance.deleteShapes(shapesToDelete);
          });
        }
      }

      // 2. Handle shapes moved/resized outside frames
      if (event.changes.updated) {
        const shapesToDelete: string[] = [];
        Object.keys(event.changes.updated).forEach((id) => {
          const shape = editorInstance.getShape(id);
          if (shape && !isShapeInsideAnyFrame(shape)) {
            shapesToDelete.push(id);
          }
        });

        if (shapesToDelete.length > 0) {
          editorInstance.run(() => {
            editorInstance.deleteShapes(shapesToDelete);
          });
        }
      }
    }, { scope: 'document' });

    boundsCleanupRef.current = () => {
      cleanupFrames();
      cleanupEnforcer();
    };
  }, []);

  const sendMessage = useCallback(async (text: string, targetIdentity?: string, targetName?: string) => {
    if (!localParticipant) return;
    try {
      const messageId = crypto.randomUUID();
      const msgObj: ChatMessage = {
        id: messageId,
        senderSid: localParticipant.sid,
        senderName: userName || localParticipant.name || localParticipant.identity,
        senderIdentity: localParticipant.identity,
        text,
        timestamp: Date.now(),
        recipientIdentity: targetIdentity,
        recipientName: targetName,
      };

      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'CHAT_MESSAGE',
        ...msgObj,
      }));

      const publishOptions: any = { reliable: true };
      if (targetIdentity) {
        publishOptions.destinationIdentities = [targetIdentity];
      }

      await localParticipant.publishData(data, publishOptions);

      // Add locally since LiveKit doesn't loop back published messages to the sender
      setMessages((prev) => [...prev, msgObj]);
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  }, [localParticipant, userName]);



  const handleEndClass = async (bypassConfirm = false) => {
    if (!bypassConfirm) {
      const confirmEnd = confirm('Are you sure you want to end the class for all users?');
      if (!confirmEnd) return;
    }

    setIsExporting(true);
    let hasNotes = false;
    try {
      // 1. Export whiteboard notes if editor is initialized
      if (editor) {
        const sortedFrames = getPagesSorted(editor);
        
        if (sortedFrames.length > 0) {
          const { jsPDF } = await import('jspdf');
          let pdf: any = null;
          let addedPageCount = 0;

          for (const frame of sortedFrames) {
            const bounds = editor.getShapePageBounds(frame.id);
            if (!bounds) continue;

            const childIds = editor.getSortedChildIdsForParent(frame.id);

            // Initialize or add page
            if (addedPageCount === 0) {
              pdf = new jsPDF({
                orientation: bounds.width > bounds.height ? 'landscape' : 'portrait',
                unit: 'pt',
                format: [bounds.width, bounds.height],
              });
            } else {
              pdf.addPage([bounds.width, bounds.height], bounds.width > bounds.height ? 'landscape' : 'portrait');
            }
            addedPageCount++;

            // If frame has child shapes, export them; otherwise leave page blank
            if (childIds && childIds.length > 0) {
              const { blob } = await editor.toImage(childIds, {
                format: 'jpeg',
                background: true,
                quality: 0.75, // Compressed quality to respect the 3-4 MB size limit
                scale: 1.5,    // Balanced scale for crisp text and smaller file size
                bounds,
              });

              const reader = new FileReader();
              const dataUrl = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              pdf.addImage(dataUrl, 'JPEG', 0, 0, bounds.width, bounds.height, undefined, 'FAST');
            }
          }

          if (pdf && addedPageCount > 0) {
            const pdfBlob = pdf.output('blob');
            const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
            const uploadUrl = `${SYNC_WORKER_URL}/api/pdf/${roomName}`;

            await fetch(uploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/pdf' },
              body: pdfBlob,
            });

            hasNotes = true;

            if (localParticipant) {
              const encoder = new TextEncoder();
              const data = encoder.encode(JSON.stringify({ type: 'NOTES_EXPORTED' }));
              await localParticipant.publishData(data, { reliable: true }).catch(() => {});
            }
          }
        }
      }

      // 2. Call backend to mark class as completed and terminate LiveKit room
      let accessToken = null;
      try {
        accessToken = sessionStorage.getItem('classroom_access_token');
      } catch (e) {
        console.warn('[VideoRoom] Failed to read classroom_access_token from sessionStorage:', e);
      }

      if (batchId && accessToken) {
        await fetch('/api/end-class', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ batchId, hasNotes })
        }).catch(err => console.error('Failed to notify backend of class end:', err));
      }

      alert('Class ended successfully for all participants.');
    } catch (err) {
      console.error('Error ending class:', err);
      alert('Class ended, but whiteboard notes could not be exported.');
    } finally {
      setIsExporting(false);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(`whiteboard_active_${roomName}`);
          localStorage.removeItem(`global_whiteboard_allowed_${roomName}`);
          localStorage.removeItem(`global_screenshare_allowed_${roomName}`);
          localStorage.removeItem(`allowed_whiteboard_students_${roomName}`);
          localStorage.removeItem(`allowed_screenshare_students_${roomName}`);
        } catch (e) {
          console.warn('[VideoRoom] Failed to clean up localStorage keys:', e);
        }
      }
      onLeave('ended-for-all');
    }
  };



  // Invite links copy mechanism removed

  const toggleMicrophone = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    }
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleCamera = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    }
  }, [localParticipant, isCameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (localParticipant) {
      try {
        // Optimize publishing options for screen sharing legible text:
        // Set 1080p, 15fps framerate limit, and text optimization hint
        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
          audio: true,
          contentHint: 'text',
          resolution: { width: 1920, height: 1080, frameRate: 15 },
        }, {
          simulcast: true,
          screenShareEncoding: {
            maxFramerate: 15,
            maxBitrate: 1500000,
          }
        });
      } catch (err) {
        console.error('Failed to toggle screen share:', err);
      }
    }
  }, [localParticipant, isScreenShareEnabled]);

  // Whiteboard Toggle that broadcasts state to all participants
  const toggleWhiteboard = useCallback(async () => {
    const nextState = !showWhiteboard;
    setShowWhiteboard(nextState);
    if (isTeacher && localParticipant) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify({
          type: 'SET_WHITEBOARD',
          active: nextState,
          globalWhiteboardAllowed,
          globalScreenShareAllowed,
          allowedWhiteboardStudents,
          allowedScreenShareStudents,
        }));
        await localParticipant.publishData(data, { reliable: true });
      } catch (err) {
        console.error('Failed to broadcast whiteboard state:', err);
      }
    }
  }, [showWhiteboard, isTeacher, localParticipant, globalWhiteboardAllowed, globalScreenShareAllowed, allowedWhiteboardStudents, allowedScreenShareStudents]);

  // Teacher broadcast spotlight callback
  const handleBroadcastSpotlight = useCallback((sid: string | null) => {
    if (!isTeacher || !localParticipant) return;
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'FORCE_SPOTLIGHT',
        participantSid: sid
      }));
      localParticipant.publishData(data, { reliable: true });
    } catch (err) {
      console.error('Failed to broadcast spotlight state:', err);
    }
  }, [isTeacher, localParticipant]);

  // Listen for whiteboard state broadcasts, note exports, and chat messages
  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant: any, kind?: any, topic?: string) => {
      if (topic === 'wb-stroke') return; // Handled directly in StrokeOverlay for performance
      try {
        const decoder = new TextDecoder();
        const msg = JSON.parse(decoder.decode(payload));
        if (msg.type === 'SET_WHITEBOARD') {
          setShowWhiteboard(msg.active);
          if (msg.globalWhiteboardAllowed !== undefined) setGlobalWhiteboardAllowed(msg.globalWhiteboardAllowed);
          if (msg.globalScreenShareAllowed !== undefined) setGlobalScreenShareAllowed(msg.globalScreenShareAllowed);
          if (msg.allowedWhiteboardStudents !== undefined) setAllowedWhiteboardStudents(msg.allowedWhiteboardStudents);
          if (msg.allowedScreenShareStudents !== undefined) setAllowedScreenShareStudents(msg.allowedScreenShareStudents);
        } else if (msg.type === 'QUERY_WHITEBOARD_STATE') {
          if (isTeacher && localParticipant) {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({
              type: 'SET_WHITEBOARD',
              active: showWhiteboard,
              globalWhiteboardAllowed,
              globalScreenShareAllowed,
              allowedWhiteboardStudents,
              allowedScreenShareStudents,
            }));
            localParticipant.publishData(data, { reliable: true }).catch(err => {
              console.error('Failed to reply to whiteboard query:', err);
            });
          }
        } else if (msg.type === 'UPDATE_PERMISSIONS') {
          if (msg.globalWhiteboardAllowed !== undefined) setGlobalWhiteboardAllowed(msg.globalWhiteboardAllowed);
          if (msg.globalScreenShareAllowed !== undefined) setGlobalScreenShareAllowed(msg.globalScreenShareAllowed);
          if (msg.allowedWhiteboardStudents !== undefined) setAllowedWhiteboardStudents(msg.allowedWhiteboardStudents);
          if (msg.allowedScreenShareStudents !== undefined) setAllowedScreenShareStudents(msg.allowedScreenShareStudents);
        } else if (msg.type === 'NOTES_EXPORTED') {
          const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
          setExportedPdfUrl(`${SYNC_WORKER_URL}/api/pdf/${roomName}`);
        } else if (msg.type === 'CHAT_MESSAGE') {
          setMessages((prev) => [...prev, msg]);
        } else if (msg.type === 'FORCE_SPOTLIGHT') {
          setSpotlightTrackSid(msg.participantSid);
        }
      } catch (err) {
        console.error('Failed to parse data channel message:', err);
      }
    };
    room.on('dataReceived', handleDataReceived);
    return () => {
      room.off('dataReceived', handleDataReceived);
    };
  }, [room, isTeacher, showWhiteboard, localParticipant, roomName, globalWhiteboardAllowed, globalScreenShareAllowed, allowedWhiteboardStudents, allowedScreenShareStudents]);

  // Query whiteboard state when joining
  useEffect(() => {
    if (!room || isTeacher || !localParticipant) return;
    const timer = setTimeout(() => {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'QUERY_WHITEBOARD_STATE' }));
      localParticipant.publishData(data, { reliable: true }).catch(err => {
        console.error('Failed to query whiteboard state:', err);
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [room, isTeacher, localParticipant]);

  // Auto screen share revocation for students
  useEffect(() => {
    if (!isTeacher && isScreenShareEnabled && !isScreenShareAllowed) {
      localParticipant.setScreenShareEnabled(false).catch(err => {
        console.error('Failed to auto-stop screen share:', err);
      });
    }
  }, [isTeacher, isScreenShareEnabled, isScreenShareAllowed, localParticipant]);



  // Extract separate camera track categories
  const remoteStudents = useMemo(() => {
    return cameraTracks.filter(t => 
      t.participant.metadata !== 'teacher' && 
      t.participant.sid !== localParticipant?.sid
    );
  }, [cameraTracks, localParticipant]);

  const teacherTrack = useMemo(() => {
    return cameraTracks.find(t => t.participant.metadata === 'teacher');
  }, [cameraTracks]);

  const localTrack = useMemo(() => {
    return cameraTracks.find(t => t.participant.sid === localParticipant?.sid);
  }, [cameraTracks, localParticipant]);

  const activeStudentTrack = useMemo(() => {
    if (remoteStudents.length === 0) return null;
    const active = remoteStudents.find(t => t.participant.sid === lastActiveStudentSid);
    return active || remoteStudents[0];
  }, [remoteStudents, lastActiveStudentSid]);

  // Sorted list of remote student camera tracks
  const [orderedRemoteStudents, setOrderedRemoteStudents] = useState<typeof remoteStudents>([]);
  // Keep track of the last spoke timestamps for the remote student queue
  const lastSpokeRef = useRef<Record<string, number>>({});

  // Synchronize orderedRemoteStudents queue when participants join/leave or change camera states
  useEffect(() => {
    setOrderedRemoteStudents(prev => {
      const filtered = prev
        .map(p => remoteStudents.find(r => r.participant.sid === p.participant.sid))
        .filter((t): t is NonNullable<typeof t> => !!t);
      const added = remoteStudents.filter(r => !filtered.some(f => f.participant.sid === r.participant.sid));
      const nextQueue = [...filtered, ...added];
      
      // Prevent infinite loops by returning prev if tracks and participants are identical
      const isIdentical = prev.length === nextQueue.length && 
                          prev.every((t, i) => {
                            const nextItem = nextQueue[i];
                            return t.participant === nextItem.participant &&
                                   t.source === nextItem.source &&
                                   t.publication === nextItem.publication;
                          });
      
      if (isIdentical) {
        return prev;
      }
      return nextQueue;
    });
  }, [remoteStudents]);

  const tilesPerPage = useMemo(() => {
    if (windowWidth < 640) return 4;
    if (windowWidth < 1024) return 6;
    return 9;
  }, [windowWidth]);

  const reservedCount = useMemo(() => {
    let count = 0;
    const hasTeacher = !!teacherTrack;
    const hasSelf = !!localTrack;
    if (hasTeacher) count++;
    if (hasSelf && (!hasTeacher || localTrack?.participant.sid !== teacherTrack?.participant.sid)) {
      count++;
    }
    return count;
  }, [teacherTrack, localTrack]);

  const studentsOnPage1 = useMemo(() => {
    return Math.max(0, tilesPerPage - reservedCount);
  }, [tilesPerPage, reservedCount]);

  // Track active speaker student with queue swap logic
  useEffect(() => {
    if (!room) return;

    const handleActiveSpeakers = (speakers: any[]) => {
      // Find remote student speakers
      const studentSpeakers = speakers.filter(s => 
        s.metadata === 'student' && 
        s.sid !== localParticipant?.sid
      );
      
      if (studentSpeakers.length === 0) return;

      // Update timestamps
      const now = Date.now();
      studentSpeakers.forEach(s => {
        lastSpokeRef.current[s.sid] = now;
      });

      // Update teacher's large featured tile last active speaker student
      const activeSpeaker = studentSpeakers[0];
      setLastActiveStudentSid(activeSpeaker.sid);

      // Perform queue swapping to keep speaking students visible
      setOrderedRemoteStudents(prev => {
        if (prev.length === 0) return prev;

        const visibleLimit = showSplitLayout
          ? (isMobile ? 1 : 2)
          : studentsOnPage1;
        
        // Find if this speaker is in the top visible slots
        const visibleIndex = prev.findIndex(t => t.participant.sid === activeSpeaker.sid);
        
        // If speaker is not in top slots, swap them in
        if (visibleIndex >= visibleLimit || visibleIndex === -1) {
          const newQueue = [...prev];
          const sIndex = prev.findIndex(t => t.participant.sid === activeSpeaker.sid);
          if (sIndex === -1) return prev; // No camera track for this speaker
 
          // Find the visible slot (0 to visibleLimit-1) that spoke least recently
          let oldestIndex = 0;
          let oldestTime = lastSpokeRef.current[prev[0]?.participant.sid] || 0;
          
          const limit = Math.min(prev.length, visibleLimit);
          for (let i = 1; i < limit; i++) {
            const sid = prev[i].participant.sid;
            const time = lastSpokeRef.current[sid] || 0;
            if (time < oldestTime) {
              oldestTime = time;
              oldestIndex = i;
            }
          }
          
          // Swap the oldest visible student with the speaking student
          const temp = newQueue[oldestIndex];
          newQueue[oldestIndex] = newQueue[sIndex];
          newQueue[sIndex] = temp;
          
          return newQueue;
        }
        
        return prev;
      });
    };
 
    room.on('activeSpeakersChanged', handleActiveSpeakers);
    return () => {
      room.off('activeSpeakersChanged', handleActiveSpeakers);
    };
  }, [room, localParticipant, showSplitLayout, isMobile, studentsOnPage1]);

  // Check R2 bucket periodically for exported notes PDF
  useEffect(() => {
    let active = true;
    const checkPdf = async () => {
      try {
        const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
        const res = await fetch(`${SYNC_WORKER_URL}/api/pdf/${roomName}`, { method: 'HEAD' });
        if (res.ok && active) {
          setExportedPdfUrl(`${SYNC_WORKER_URL}/api/pdf/${roomName}`);
        }
      } catch (err) {
        // ignore
      }
    };
    checkPdf();
    const interval = setInterval(checkPdf, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [roomName]);

  // Featured track helper for gridStudents filter
  const featuredTrackSid = useMemo(() => {
    if (pinnedTrackSid) return pinnedTrackSid;
    if (spotlightTrackSid) return spotlightTrackSid;
    return isTeacher ? activeStudentTrack?.participant.sid : teacherTrack?.participant.sid;
  }, [pinnedTrackSid, spotlightTrackSid, isTeacher, activeStudentTrack, teacherTrack]);

  // Grid View student list (uses orderedRemoteStudents and filters out featured track)
  const gridStudents = useMemo(() => {
    const list = [...orderedRemoteStudents];
    const filteredList = list.filter(t => 
      t.participant.sid !== featuredTrackSid && 
      t.participant.sid !== localParticipant?.sid
    );
    if (!isTeacher && localTrack && localParticipant?.sid !== featuredTrackSid) {
      filteredList.push(localTrack);
    }
    return filteredList;
  }, [orderedRemoteStudents, featuredTrackSid, localParticipant?.sid, isTeacher, localTrack]);

  // Sidebar student list (uses orderedRemoteStudents and places localTrack at Slot 3 / index 2)
  const sidebarStudents = useMemo(() => {
    if (isTeacher) {
      return orderedRemoteStudents;
    } else {
      const list = [...orderedRemoteStudents];
      const filteredList = list.filter(t => t.participant.sid !== localParticipant?.sid);
      if (localTrack) {
        filteredList.splice(2, 0, localTrack);
      }
      return filteredList.filter((t): t is NonNullable<typeof t> => !!t);
    }
  }, [isTeacher, orderedRemoteStudents, localTrack, localParticipant?.sid]);

  const showReconnecting = connectionState === 'reconnecting';

  if (connectionState === 'disconnected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-white">
        <div className="bg-surface border border-red-500/30 rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/15">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-red-400">Disconnected</h2>
          <p className="text-sm text-foreground/50">You have been disconnected from the class session.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary hover:bg-primary-hover rounded-lg text-sm transition-colors cursor-pointer text-white w-full font-semibold"
          >
            Rejoin Class
          </button>
          <button
            onClick={() => onLeave()}
            className="px-6 py-2 bg-surface-light border border-border/40 rounded-lg text-sm hover:bg-border/30 transition-colors cursor-pointer text-white w-full"
          >
            Leave Class
          </button>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      /* MOBILE ONLY START */
      <div 
        ref={roomContainerRef}
        className="flex flex-col h-screen w-screen bg-[#030712] text-foreground overflow-hidden relative font-sans"
      >
        {/* Mobile Top Bar — slides up/down in sync with footer controls */}
        <div
          className={`absolute top-0 left-0 right-0 z-[120] bg-[#090d1a]/95 border-b border-white/10 flex items-center justify-between px-4 select-none transition-all duration-300 pointer-events-auto ${
            controlsVisible
              ? 'translate-y-0 opacity-100'
              : '-translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(48px + env(safe-area-inset-top))' }}
        >
          {/* Left: Branding & Timer */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-wider text-white">
              OpenGrapes Live
            </span>
            <div className="w-px h-4 bg-white/20" />
            <span className="text-xs font-mono font-bold text-accent-hi">
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
          {/* Right: Participants Button */}
          <button
            onClick={() => setShowParticipantsOverlay(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              showParticipantsOverlay
                ? 'bg-accent text-white shadow-lg shadow-accent/25'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <IconUsers className="w-3.5 h-3.5" />
            <span>{participants.length}</span>
          </button>
        </div>
        
        {/* Reconnecting Overlay */}
        {showReconnecting && (
          <div className="absolute inset-0 bg-[#030712]/80 backdrop-blur-md z-50 flex items-center justify-center pointer-events-auto">
            <div className="text-center space-y-4">
              <svg className="w-12 h-12 animate-spin text-primary mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div>
                <p className="text-lg font-semibold text-white">Connection Lost</p>
                <p className="text-sm text-foreground/50 mt-1">Reconnecting to class session...</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace + Sidebars (Top Flex Row) */}
        <div className="flex-1 flex flex-row min-h-0 relative overflow-hidden">
          
          {isWhiteboardAllowed && (
            <LeftRail 
              editor={editor} 
              showWhiteboard={showWhiteboard} 
              strokeWidth={STROKE_WIDTH}
              isTeacher={isTeacher}
              topPadding={56}
              bottomPadding={80}
            />
          )}

          {/* LEFT / CENTER PANE: Active Content (Grid OR Whiteboard OR Screen Share) */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">

            {/* Content Viewport */}
            <div 
              className="flex-1 overflow-hidden relative bg-[#060b18]"
              onClick={handleViewportClick}
            >
              

              
              <FloatingTeacherTile
                teacherTrack={teacherTrack}
                isFocusMode={isFocusMode}
                showSplitLayout={showSplitLayout}
                isOverlayOpen={showParticipantsOverlay || !!activeRightPanelTab || (isMobile && !layoutLandscape && controlsVisible)}
              />

              {teacherAbsentTimeLeft !== null && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4">
                  <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-500/30 text-amber-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-amber-950/20">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-amber-100">Teacher Disconnected</span>
                        <span className="text-[10px] text-amber-200/70">
                          {teacherAbsentTimeLeft > 180
                            ? "Waiting for them to rejoin..."
                            : `${Math.floor(teacherAbsentTimeLeft / 60)}:${(teacherAbsentTimeLeft % 60).toString().padStart(2, '0')} until meeting ends automatically`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fullscreen Button for Mobile (when Whiteboard or Screen Sharing is active) */}
              {isMobile && (isPhone || isTablet) && (showWhiteboard || (hasScreenShare && screenShareTrackRef)) && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFullscreen();
                  }}
                  className={`absolute right-4 z-50 p-2.5 rounded-xl bg-black/60 hover:bg-black/85 text-white/80 hover:text-white border border-white/10 shadow-lg cursor-pointer transition-all duration-200 ${
                    controlsVisible
                      ? 'bottom-20'
                      : 'bottom-4'
                  }`}
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? (
                    <IconMinimize className="w-5 h-5" />
                  ) : (
                    <IconMaximize className="w-5 h-5" />
                  )}
                </button>
              )}

              {/* Whiteboard Wrapper (always mounted but hidden if not showWhiteboard to preserve editor state) */}
              <div
                className={`z-10 bg-white whiteboard-container transition-all duration-300 ${
                  showWhiteboard 
                    ? `absolute inset-0 m-auto aspect-video border border-white/10 rounded-lg shadow-2xl overflow-hidden ${
                        controlsVisible
                          ? 'w-[calc(100%-32px)] max-h-[calc(100%-80px)]'
                          : 'w-[calc(100%-32px)] max-h-[calc(100%-32px)]'
                      }`
                    : 'absolute inset-0 opacity-0 pointer-events-none'
                }`}
                onPointerDown={handleWhiteboardPointerDown}
                onPointerUp={handleWhiteboardPointerUp}
              >
                <WhiteboardWrapper 
                  roomName={roomName} 
                  userName={userName} 
                  onEditorMount={handleEditorMount} 
                  isTeacher={isTeacher}
                  isWritable={isWhiteboardAllowed}
                  room={room}
                  localParticipant={localParticipant}
                  isSidebarOpen={!isFocusMode}
                  isMobile={isMobile}
                  globalWhiteboardAllowed={globalWhiteboardAllowed}
                  allowedWhiteboardStudents={allowedWhiteboardStudents}
                />


              </div>

              {!showWhiteboard && (
                hasScreenShare && screenShareTrackRef ? (
                  /* Screen Share takes center stage */
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <div className={`overflow-hidden border border-border/20 bg-surface/50 shadow-2xl relative rounded-xl screenshare-container transition-all duration-300 ${
                      isMobile
                        ? `absolute inset-0 m-auto aspect-video border border-white/10 rounded-lg shadow-2xl ${
                            controlsVisible
                              ? 'w-[calc(100%-32px)] max-h-[calc(100%-80px)]'
                              : 'w-[calc(100%-32px)] max-h-[calc(100%-32px)]'
                          }`
                        : 'w-full h-full max-h-full aspect-video'
                    }`}>
                      <ParticipantTile trackRef={screenShareTrackRef} className="w-full h-full lk-screen-share-tile" />
                    </div>
                  </div>
                ) : (
                  <GridView
                    isTeacher={isTeacher}
                    activeStudentTrack={activeStudentTrack}
                    teacherTrack={teacherTrack}
                    remoteStudents={orderedRemoteStudents}
                    gridStudents={gridStudents}
                    cameraTracksCount={cameraTracks.length}
                    layoutMode={layoutMode === 'focus' ? 'tiled' : layoutMode}
                    pinnedTrackSid={pinnedTrackSid}
                    setPinnedTrackSid={setPinnedTrackSid}
                    spotlightTrackSid={spotlightTrackSid}
                    setSpotlightTrackSid={setSpotlightTrackSid}
                    onBroadcastSpotlight={handleBroadcastSpotlight}
                    localTrack={localTrack}
                    studentGridPage={studentGridPage}
                    setStudentGridPage={setStudentGridPage}
                  />
                )
              )}

            </div>

          </div>

          {/* RIGHT PANE: Participant Videos Sidebar (Only visible when Whiteboard or Screen Share is active) */}
          {showSplitLayout && (
            <StudentSidebar
              showWhiteboard={showWhiteboard}
              teacherTrack={teacherTrack}
              sidebarStudents={sidebarStudents}
              isOpen={!isFocusMode}
              onToggle={() => {
                const nextFocus = !isFocusMode;
                setIsFocusMode(nextFocus);
                setLayoutMode(nextFocus ? 'focus' : 'sidebar');
              }}
              isMobile={isMobile}
              mobileControlsVisible={controlsVisible}
              isLandscape={layoutLandscape}
              isFullscreen={isFullscreen}
              hasLeftRail={isWhiteboardAllowed && showWhiteboard}
            />
          )}

          {/* RIGHT PANE: Chat & Participants Panel */}
          {activeRightPanelTab && localParticipant && (
            <ChatPanel
              activeTab={activeRightPanelTab}
              setActiveTab={setActiveRightPanelTab}
              messages={messages}
              onSendMessage={sendMessage}
              participants={participants}
              localParticipant={localParticipant}
              activeChatTarget={activeChatTarget}
              setActiveChatTarget={setActiveChatTarget}
              roomName={roomName}
              globalWhiteboardAllowed={globalWhiteboardAllowed}
              globalScreenShareAllowed={globalScreenShareAllowed}
              allowedWhiteboardStudents={allowedWhiteboardStudents}
              allowedScreenShareStudents={allowedScreenShareStudents}
              onToggleGlobalPermission={handleToggleGlobalPermission}
              onToggleStudentPermission={handleToggleStudentPermission}
              isMobile={isMobile}
              isTeacher={isTeacher}
              editor={editor}
            />
          )}

        </div>

        {/* BOTTOM ROW: Full-width Google Meet Style Footer */}
        {!activeRightPanelTab && (
          <div
            onMouseEnter={() => { isMouseOverControlsRef.current = true; setControlsVisible(true); }}
            onMouseLeave={() => { isMouseOverControlsRef.current = false; }}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <Controls
              roomName={roomName}
              isMicrophoneEnabled={isMobile ? micOn : isMicrophoneEnabled}
              toggleMicrophone={isMobile ? handleMicToggle : toggleMicrophone}
              isCameraEnabled={isMobile ? cameraOn : isCameraEnabled}
              toggleCamera={isMobile ? handleCameraToggle : toggleCamera}
              isScreenShareEnabled={isScreenShareEnabled}
              toggleScreenShare={toggleScreenShare}
              showWhiteboard={showWhiteboard}
              toggleWhiteboard={toggleWhiteboard}
              isTeacher={isTeacher}
              isExporting={isExporting}
              handleEndClass={handleEndClass}
              onLeave={() => {
                if (isTeacher) {
                  setShowEndCallModal(true);
                } else {
                  onLeave();
                }
              }}
              exportedPdfUrl={exportedPdfUrl}
              activeRightPanelTab={activeRightPanelTab}
              setActiveRightPanelTab={setActiveRightPanelTab}
              isWhiteboardAllowed={isWhiteboardAllowed}
              isScreenShareAllowed={isScreenShareAllowed}
              layoutMode={layoutMode}
              setLayoutMode={setLayoutMode}
              showSplitLayout={showSplitLayout}
              isMobile={isMobile}
              mobileControlsVisible={controlsVisible}
              onHideControls={() => setControlsVisible(false)}
            />
          </div>
        )}

        {/* Participants Overlay (mobile — full screen fixed panel) */}
        {showParticipantsOverlay && localParticipant && (
          <ParticipantsOverlay
            participants={participants}
            localParticipant={localParticipant}
            roomName={roomName}
            isTeacher={isTeacher}
            globalWhiteboardAllowed={globalWhiteboardAllowed}
            globalScreenShareAllowed={globalScreenShareAllowed}
            allowedWhiteboardStudents={allowedWhiteboardStudents}
            allowedScreenShareStudents={allowedScreenShareStudents}
            onToggleGlobalPermission={handleToggleGlobalPermission}
            onToggleStudentPermission={handleToggleStudentPermission}
            onClose={() => setShowParticipantsOverlay(false)}
            onStartDM={handleStartDM}
            isMobile={true}
          />
        )}

        {/* End Call Options Modal for Teachers */}
        {showEndCallModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0b0f19]/90 border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <h3 className="text-lg font-bold text-white text-center font-sans">End Session</h3>
              <p className="text-sm text-foreground/60 text-center leading-normal font-sans">
                Choose how you want to exit the class session.
              </p>
              <div className="flex flex-col gap-2.5 pt-2 font-sans">
                <button
                  onClick={() => {
                    setShowEndCallModal(false);
                    handleEndClass(true);
                  }}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  End Call for All
                </button>
                <button
                  onClick={() => {
                    setShowEndCallModal(false);
                    onLeave();
                  }}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[#ffffff] font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Leave Meeting
                </button>
                <button
                  onClick={() => setShowEndCallModal(false)}
                  className="w-full py-2 text-xs text-foreground/45 hover:text-white font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Exporting / Publishing Notes Overlay */}
        {isExporting && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
            <div className="flex flex-col items-center space-y-4 max-w-sm text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                <div className="absolute inset-2 rounded-full border-4 border-b-emerald-400 border-t-transparent border-r-transparent border-l-transparent animate-spin duration-1000 ease-in-out"></div>
                <div className="absolute inset-5.5 rounded-full bg-white/20 animate-pulse"></div>
              </div>
              <h3 className="text-xl font-bold text-white font-sans mt-4">Publishing Notes</h3>
              <p className="text-sm text-foreground/60 leading-relaxed font-sans">
                Generating high-fidelity multi-page PDF notes and uploading them. Please wait a moment...
              </p>
            </div>
          </div>
        )}

      </div>
      /* MOBILE ONLY END */
    );
  }

  /* DESKTOP ONLY START */
  return (
    <div 
      ref={roomContainerRef}
      className="grid h-screen w-screen overflow-hidden bg-shell text-text relative font-sans"
      style={{ 
        gridTemplateRows: '48px minmax(0, 1fr) 72px', 
        gridTemplateColumns: (showWhiteboard && isWhiteboardAllowed) ? '52px 1fr' : '1fr',
        isolation: 'isolate' 
      }}
    >
      
      {/* Reconnecting Overlay */}
      {showReconnecting && (
        <div className="absolute inset-0 bg-[#030712]/80 backdrop-blur-md z-50 flex items-center justify-center pointer-events-auto">
          <div className="text-center space-y-4">
            <svg className="w-12 h-12 animate-spin text-primary mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div>
              <p className="text-lg font-semibold text-white">Connection Lost</p>
              <p className="text-sm text-foreground/50 mt-1">Reconnecting to class session...</p>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP BAR (48px tall, spans full width) */}
      <div className="row-start-1 col-start-1 col-span-full h-[48px] bg-surface border-b border-border flex items-center justify-between px-6 relative z-50 select-none">
        {/* Left: Pulsing red dot, Branding & Timer (adjacent) */}
        <div className="flex items-center gap-1">
          <div className="flex items-center">
            {/* <span className="relative flex h-2 w-2">
              <span className="animate-pulse-recording absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
            </span> */}
            <span className="font-semibold text-sm tracking-wider bg-clip-texttext-text">
              OpenGrapes Live
            </span>
          </div>
          <div className="w-px h-4 bg-border/20" />
          <span className="text-xs font-mono font-bold text-accent-hi">
            {formatDuration(elapsedSeconds)}
          </span>
        </div>

        {/* Right: Participants button with count badge */}
        <button
            onClick={() => setShowParticipantsOverlay(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
              showParticipantsOverlay 
                ? 'bg-accent text-white shadow-lg shadow-accent/25' 
                : 'bg-surface-hi text-text hover:bg-border/40'
            }`}
          >
            <IconUsers className="w-4 h-4" />
            <span>{participants.length}</span>
          </button>
      </div>

      {isWhiteboardAllowed && (
        <LeftRail 
          editor={editor} 
          showWhiteboard={showWhiteboard} 
          strokeWidth={STROKE_WIDTH}
          isTeacher={isTeacher}
        />
      )}

      {/* 3. CONTENT ZONE (row 2, col 2) */}
      <div 
        className={`row-start-2 ${(showWhiteboard && isWhiteboardAllowed) ? 'col-start-2' : 'col-start-1 col-span-full'} relative overflow-hidden z-10 h-full min-h-0 ${
          showSplitLayout || (isChatPinned && activeRightPanelTab) ? 'flex flex-row' : 'block'
        }`}
      >
        {/* Main Viewport Container */}
        <div 
          className={`h-full min-h-0 relative overflow-hidden bg-[#060b18] ${
            showSplitLayout || (isChatPinned && activeRightPanelTab) ? 'flex-1 min-w-0' : 'w-full'
          }`}
          onClick={handleViewportClick}
        >


          {/* Floating Teacher video tile */}
          <FloatingTeacherTile
            teacherTrack={teacherTrack}
            isFocusMode={isFocusMode}
            showSplitLayout={showSplitLayout}
            isOverlayOpen={showParticipantsOverlay || (!isChatPinned && !!activeRightPanelTab)}
          />

          {/* Teacher absent timer */}
          {teacherAbsentTimeLeft !== null && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4">
              <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-500/30 text-amber-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-amber-950/20 animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-amber-100">Teacher Disconnected</span>
                    <span className="text-[10px] text-amber-200/70">
                      {teacherAbsentTimeLeft > 180
                        ? "Waiting for them to rejoin..."
                        : `${Math.floor(teacherAbsentTimeLeft / 60)}:${(teacherAbsentTimeLeft % 60).toString().padStart(2, '0')} until meeting ends automatically`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Whiteboard container (always mounted but hidden if not showWhiteboard) */}
          <div className={`z-10 bg-white whiteboard-container transition-all duration-300 ${
            showWhiteboard ? 'w-full h-full relative block' : 'absolute inset-0 opacity-0 pointer-events-none'
          }`}>
            <WhiteboardWrapper 
              roomName={roomName} 
              userName={userName} 
              onEditorMount={handleEditorMount} 
              isTeacher={isTeacher}
              isWritable={isWhiteboardAllowed}
              room={room}
              localParticipant={localParticipant}
              isSidebarOpen={!isFocusMode}
              isMobile={false}
              globalWhiteboardAllowed={globalWhiteboardAllowed}
              allowedWhiteboardStudents={allowedWhiteboardStudents}
            />

          </div>

          {/* Video Grid or Screen Share when whiteboard is not visible */}
          {!showWhiteboard && (
            hasScreenShare && screenShareTrackRef ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                <div className="w-full h-full max-h-full aspect-video overflow-hidden border border-border bg-surface/50 shadow-2xl relative rounded-xl screenshare-container">
                  <ParticipantTile trackRef={screenShareTrackRef} className="w-full h-full lk-screen-share-tile" />
                </div>
              </div>
            ) : (
              <GridView
                isTeacher={isTeacher}
                activeStudentTrack={activeStudentTrack}
                teacherTrack={teacherTrack}
                remoteStudents={orderedRemoteStudents}
                gridStudents={gridStudents}
                cameraTracksCount={cameraTracks.length}
                layoutMode={layoutMode === 'focus' ? 'tiled' : layoutMode}
                pinnedTrackSid={pinnedTrackSid}
                setPinnedTrackSid={setPinnedTrackSid}
                spotlightTrackSid={spotlightTrackSid}
                setSpotlightTrackSid={setSpotlightTrackSid}
                onBroadcastSpotlight={handleBroadcastSpotlight}
                localTrack={localTrack}
                studentGridPage={studentGridPage}
                setStudentGridPage={setStudentGridPage}
              />
            )
          )}

        </div>

        {/* Student Sidebar for Desktop (only when Split Layout is active) */}
        {showSplitLayout && (
          <StudentSidebar
            showWhiteboard={showWhiteboard}
            teacherTrack={teacherTrack}
            sidebarStudents={sidebarStudents}
            isOpen={!isFocusMode}
            onToggle={() => {
              const nextFocus = !isFocusMode;
              setIsFocusMode(nextFocus);
              setLayoutMode(nextFocus ? 'focus' : 'sidebar');
            }}
            isMobile={false}
            isLandscape={layoutLandscape}
            isFullscreen={isFullscreen}
          />
        )}

        {/* Chat Panel for Desktop when active */}
        {activeRightPanelTab && localParticipant && (
          <ChatPanel
            activeTab={activeRightPanelTab}
            setActiveTab={setActiveRightPanelTab}
            messages={messages}
            onSendMessage={sendMessage}
            participants={participants}
            localParticipant={localParticipant}
            activeChatTarget={activeChatTarget}
            setActiveChatTarget={setActiveChatTarget}
            roomName={roomName}
            globalWhiteboardAllowed={globalWhiteboardAllowed}
            globalScreenShareAllowed={globalScreenShareAllowed}
            allowedWhiteboardStudents={allowedWhiteboardStudents}
            allowedScreenShareStudents={allowedScreenShareStudents}
            onToggleGlobalPermission={handleToggleGlobalPermission}
            onToggleStudentPermission={handleToggleStudentPermission}
            isMobile={false}
            isTeacher={isTeacher}
            editor={editor}
            isPinned={isChatPinned}
            onTogglePin={() => setIsChatPinned(!isChatPinned)}
          />
        )}

        {/* Participants dropdown overlay */}
        {showParticipantsOverlay && (
          <ParticipantsOverlay
            participants={participants}
            localParticipant={localParticipant}
            roomName={roomName}
            isTeacher={isTeacher}
            globalWhiteboardAllowed={globalWhiteboardAllowed}
            globalScreenShareAllowed={globalScreenShareAllowed}
            allowedWhiteboardStudents={allowedWhiteboardStudents}
            allowedScreenShareStudents={allowedScreenShareStudents}
            onToggleGlobalPermission={handleToggleGlobalPermission}
            onToggleStudentPermission={handleToggleStudentPermission}
            onClose={() => setShowParticipantsOverlay(false)}
            onStartDM={handleStartDM}
          />
        )}

      </div>
      {/* 4. BOTTOM BAR (72px, spans full width, row 3) */}
      <div 
        className="row-start-3 col-start-1 col-span-full h-[72px] bg-surface border-t border-border px-6 py-1.5 flex items-center justify-between z-50 relative"
      >
        
        {/* Controls container (spaced evenly) */}
        <div className="flex items-center gap-3">
          {/* Mic Button */}
          <div className="relative" ref={micMenuRef}>
            <div className={`relative w-[84px] h-[60px] rounded-xl border text-text flex items-center p-0.5 transition-all duration-200 ${
              isMicrophoneEnabled ? 'border-border/15 bg-surface-hi/20' : 'border-transparent bg-transparent'
            }`}>
              {/* Mute/Unmute main toggle button */}
              <Tooltip content={isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"} align="left" className="flex-1 h-full">
                <button
                  onClick={toggleMicrophone}
                  className="w-full h-full flex flex-col items-center justify-center rounded-lg hover:bg-white/5 transition-colors cursor-pointer gap-0.5"
                >
                  {isMicrophoneEnabled ? (
                    <IconMicrophone className="w-5.5 h-5.5" strokeWidth={STROKE_WIDTH} />
                  ) : (
                    <IconMicrophoneOff className="w-5.5 h-5.5 text-danger" strokeWidth={STROKE_WIDTH} />
                  )}
                  <span className="text-[11px] font-medium leading-none select-none">Audio</span>
                </button>
              </Tooltip>

              {/* Chevron split button on the right */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMicMenu(prev => !prev);
                }}
                className="w-5.5 h-full flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-white transition-colors cursor-pointer"
              >
                <IconChevronUp className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Mic device select dropdown menu */}
            {showMicMenu && (
              <div 
                className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-64 bg-surface border border-border rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 text-text z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans"
              >
                <div className="px-3 py-1.5 border-b border-border/20 select-none text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Select Microphone</span>
                </div>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                  {audioDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={() => {
                        setActiveAudioDevice(device.deviceId);
                        setShowMicMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors cursor-pointer text-left text-xs font-semibold select-none ${
                        activeAudioId === device.deviceId ? 'text-accent font-bold bg-accent/10' : 'text-text'
                      }`}
                    >
                      <span className="truncate">{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</span>
                    </button>
                  ))}
                  {audioDevices.length === 0 && (
                    <span className="px-3 py-2 text-xs text-text-muted">No microphones found</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Camera Button */}
          <div className="relative" ref={camMenuRef}>
            <div className={`relative w-[84px] h-[60px] rounded-xl border text-text flex items-center p-0.5 transition-all duration-200 ${
              isCameraEnabled ? 'border-border/15 bg-surface-hi/20' : 'border-transparent bg-transparent'
            }`}>
              {/* Video Toggle main button */}
              <Tooltip content={isCameraEnabled ? "Turn Off Camera" : "Turn On Camera"} align="left" className="flex-1 h-full">
                <button
                  onClick={toggleCamera}
                  className="w-full h-full flex flex-col items-center justify-center rounded-lg hover:bg-white/5 transition-colors cursor-pointer gap-0.5"
                >
                  {isCameraEnabled ? (
                    <IconVideo className="w-5.5 h-5.5" strokeWidth={STROKE_WIDTH} />
                  ) : (
                    <IconVideoOff className="w-5.5 h-5.5 text-danger" strokeWidth={STROKE_WIDTH} />
                  )}
                  <span className="text-[11px] font-medium leading-none select-none">Video</span>
                </button>
              </Tooltip>

              {/* Chevron split button on the right */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCamMenu(prev => !prev);
                }}
                className="w-5.5 h-full flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-white transition-colors cursor-pointer"
              >
                <IconChevronUp className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Camera device select dropdown menu */}
            {showCamMenu && (
              <div 
                className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-64 bg-surface border border-border rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 text-text z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans"
              >
                <div className="px-3 py-1.5 border-b border-border/20 select-none text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Select Camera</span>
                </div>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                  {videoDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={() => {
                        setActiveVideoDevice(device.deviceId);
                        setShowCamMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors cursor-pointer text-left text-xs font-semibold select-none ${
                        activeVideoId === device.deviceId ? 'text-accent font-bold bg-accent/10' : 'text-text'
                      }`}
                    >
                      <span className="truncate">{device.label || `Camera ${device.deviceId.slice(0, 5)}`}</span>
                    </button>
                  ))}
                  {videoDevices.length === 0 && (
                    <span className="px-3 py-2 text-xs text-text-muted">No cameras found</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-border/30 self-center mx-1" />

          {/* Screen Share Button */}
          <div className="relative">
            <Tooltip content={!isScreenShareAllowed ? "Screen Share Disabled by Teacher" : "Toggle Screen Share"}>
              <button
                disabled={!isScreenShareAllowed}
                onClick={toggleScreenShare}
                className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                  !isScreenShareAllowed
                    ? 'opacity-40 cursor-not-allowed text-text-muted border-transparent bg-transparent'
                    : isScreenShareEnabled
                    ? 'text-accent bg-accent/10 border-accent/30 font-semibold hover:bg-accent/20'
                    : 'text-text border-transparent bg-transparent hover:bg-surface-hi/50'
                }`}
              >
                <IconScreenShare className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
                <span className="text-[11px] font-medium leading-none select-none">Share</span>
              </button>
            </Tooltip>
            {!isScreenShareAllowed && (
              <span className="absolute top-1 right-1.5 w-3.5 h-3.5 bg-danger rounded-full flex items-center justify-center text-white border border-[#090d1a] shadow-md z-10 scale-90">
                <IconLock className="w-2.5 h-2.5" strokeWidth={STROKE_WIDTH} />
              </span>
            )}
          </div>

          {/* Whiteboard Button */}
          <Tooltip content="Toggle Whiteboard">
            <button
              onClick={toggleWhiteboard}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                showWhiteboard 
                  ? 'text-accent bg-accent/10 border-accent/30 font-semibold hover:bg-accent/20' 
                  : 'text-text border-transparent bg-transparent hover:bg-surface-hi/50'
              }`}
            >
              {showWhiteboard ? (
                <IconChalkboard className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
              ) : (
                <IconChalkboardOff className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
              )}
              <span className="text-[11px] font-medium leading-none select-none tracking-tight">Whiteboard</span>
            </button>
          </Tooltip>

          {/* View Mode Button with Dropdown arrow */}
          <div className="relative">
            <Tooltip content="Adjust View">
              <button
                onClick={() => setShowLayoutMenu(prev => !prev)}
                className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                  showLayoutMenu 
                    ? 'text-accent bg-accent/10 border-accent/30 font-semibold hover:bg-accent/20' 
                    : 'text-text border-transparent bg-transparent hover:bg-surface-hi/50'
                }`}
              >
                <IconLayoutDashboard className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
                <span className="text-[11px] font-medium leading-none select-none">View</span>
              </button>
            </Tooltip>

            {/* Existing View switcher dropdown menu */}
            {showLayoutMenu && (
              <div 
                ref={layoutMenuRef}
                className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-64 bg-surface border border-border rounded-xl shadow-2xl p-2.5 flex flex-col gap-1.5 text-text z-[300] animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans"
              >
                <div className="px-3 py-1 border-b border-border/20 select-none text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Adjust View</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => { setLayoutMode('auto'); setShowLayoutMenu(false); }}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg hover:bg-surface-hi transition-colors cursor-pointer text-center text-xs font-semibold select-none ${
                      layoutMode === 'auto' ? 'text-accent font-bold bg-accent/10 border border-accent/20' : 'text-text border border-transparent'
                    }`}
                  >
                    <IconTableSpark className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
                    <span>Auto</span>
                  </button>
                  <button
                    onClick={() => { setLayoutMode('tiled'); setShowLayoutMenu(false); }}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg hover:bg-surface-hi transition-colors cursor-pointer text-center text-xs font-semibold select-none ${
                      layoutMode === 'tiled' ? 'text-accent font-bold bg-accent/10 border border-accent/20' : 'text-text border border-transparent'
                    }`}
                  >
                    <IconLayoutGrid className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
                    <span>Tiled</span>
                  </button>
                  <button
                    onClick={() => { setLayoutMode('sidebar'); setShowLayoutMenu(false); }}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg hover:bg-surface-hi transition-colors cursor-pointer text-center text-xs font-semibold select-none ${
                      layoutMode === 'sidebar' ? 'text-accent font-bold bg-accent/10 border border-accent/20' : 'text-text border border-transparent'
                    }`}
                  >
                    <IconLayoutSidebarRight className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
                    <span>Sidebar</span>
                  </button>
                  <button
                    disabled={!showSplitLayout}
                    onClick={() => {
                      if (showSplitLayout) {
                        setLayoutMode('focus');
                        setShowLayoutMenu(false);
                      }
                    }}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg hover:bg-surface-hi transition-colors text-center text-xs font-semibold select-none ${
                      !showSplitLayout
                        ? 'opacity-40 cursor-not-allowed text-text-muted border border-transparent'
                        : layoutMode === 'focus'
                        ? 'text-accent font-bold bg-accent/10 border border-accent/20 cursor-pointer'
                        : 'text-text border border-transparent cursor-pointer'
                    }`}
                  >
                    <IconRectangle className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
                    <span>Focus</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-border/30 self-center mx-1" />

          {/* Chat Button */}
          <Tooltip content="Chat Panel">
            <button
              onClick={() => setActiveRightPanelTab(activeRightPanelTab === 'chat' ? null : 'chat')}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                activeRightPanelTab === 'chat' 
                  ? 'text-accent bg-accent/10 border-accent/30 font-semibold hover:bg-accent/20' 
                  : 'text-text border-transparent bg-transparent hover:bg-surface-hi/50'
              }`}
            >
              <IconMessage className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
              <span className="text-[11px] font-medium leading-none select-none">Chat</span>
            </button>
          </Tooltip>

          {/* Ask AI Button */}
          <Tooltip content={isTeacher ? "Student Doubts" : "Ask AI"}>
            <button
              onClick={() => setActiveRightPanelTab(activeRightPanelTab === 'doubt' ? null : 'doubt')}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                activeRightPanelTab === 'doubt' 
                  ? 'text-accent bg-accent/10 border-accent/30 font-semibold hover:bg-accent/20' 
                  : 'text-text border-transparent bg-transparent hover:bg-surface-hi/50'
              }`}
            >
              <IconGalaxy className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
              <span className="text-[11px] font-medium leading-none select-none">
                {isTeacher ? "Doubts" : "Ask AI"}
              </span>
            </button>
          </Tooltip>

          {/* Summary Button */}
          <Tooltip content="Class Summary">
            <button
              onClick={() => setActiveRightPanelTab(activeRightPanelTab === 'summary' ? null : 'summary')}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                activeRightPanelTab === 'summary' 
                  ? 'text-accent bg-accent/10 border-accent/30 font-semibold hover:bg-accent/20' 
                  : 'text-text border-transparent bg-transparent hover:bg-surface-hi/50'
              }`}
            >
              <IconFileTextSpark className="w-6 h-6" strokeWidth={STROKE_WIDTH} />
              <span className="text-[11px] font-medium leading-none select-none">Summary</span>
            </button>
          </Tooltip>
        </div>

        {/* Group 4: End Class / Leave (pushed to far right via ml-auto wrapper) */}
        <div className="ml-auto flex items-center">
          <Tooltip content={isTeacher ? "End Class" : "Leave Classroom"} align="right">
            <button
              onClick={() => {
                if (isTeacher) {
                  setShowEndCallModal(true);
                } else {
                  onLeave();
                }
              }}
              className="w-[48px] h-[48px] rounded-full border border-transparent flex items-center justify-center transition-all cursor-pointer text-white bg-danger hover:bg-danger/90 shadow-md"
            >
              <Phone className="w-5 h-5 transform rotate-[135deg]" strokeWidth={STROKE_WIDTH} />
            </button>
          </Tooltip>
        </div>

      </div>

      {/* End Call Options Modal for Teachers */}
      {showEndCallModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-white text-center font-sans">End Session</h3>
            <p className="text-sm text-text-muted text-center leading-normal font-sans">
              Choose how you want to exit the class session.
            </p>
            <div className="flex flex-col gap-2.5 pt-2 font-sans">
              <button
                onClick={() => {
                  setShowEndCallModal(false);
                  handleEndClass(true);
                }}
                className="w-full py-3 bg-danger hover:bg-danger/90 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                End Call for All
              </button>
              <button
                onClick={() => {
                  setShowEndCallModal(false);
                  onLeave();
                }}
                className="w-full py-3 bg-surface-hi hover:bg-border/30 border border-border text-text font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Leave Meeting
              </button>
              <button
                onClick={() => setShowEndCallModal(false)}
                className="w-full py-2 text-xs text-text-muted hover:text-white font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exporting / Publishing Notes Overlay */}
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="flex flex-col items-center space-y-4 max-w-sm text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
              <div className="absolute inset-2 rounded-full border-4 border-b-success border-t-transparent border-r-transparent border-l-transparent animate-spin duration-1000 ease-in-out"></div>
              <div className="absolute inset-5.5 rounded-full bg-white/20 animate-pulse"></div>
            </div>
            <h3 className="text-xl font-bold text-white font-sans mt-4">Publishing Notes</h3>
            <p className="text-sm text-text-muted leading-relaxed font-sans">
              Generating high-fidelity multi-page PDF notes and uploading them. Please wait...
            </p>
          </div>
        </div>
      )}


    </div>
  );
  /* DESKTOP ONLY END */
}

export default function VideoRoom({
  token,
  roomName,
  serverUrl,
  userName,
  iceServers,
  onDisconnected,
  sessionToken,
  audioDeviceId,
  videoDeviceId,
  onConnected,
  audioEnabled = true,
  videoEnabled = true,
}: VideoRoomProps) {
  const currentToken = useClassroomSession(token, roomName, sessionToken);
  
  const isEndingClassForAll = useRef(false);
  const isTeacherAbsentDisconnect = useRef(false);

  // Create stable Room instance to prevent reconnection loops in React strict mode
  const room = useMemo(() => {
    const roomOptions: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 960, height: 540, frameRate: 24 },
        deviceId: videoDeviceId || undefined,
      },
      audioCaptureDefaults: {
        deviceId: audioDeviceId || undefined,
      },
    };
    return new Room(roomOptions);
  }, [audioDeviceId, videoDeviceId]);

  // Build connect options with TURN/STUN servers for cross-network calls
  const connectOptions: RoomConnectOptions = useMemo(() => {
    const opts: RoomConnectOptions = {};
    if (iceServers && iceServers.length > 0) {
      opts.rtcConfig = {
        iceServers: iceServers.map(s => ({
          urls: s.urls,
          username: s.username,
          credential: s.credential,
        })),
      };
    }
    return opts;
  }, [iceServers]);

  // Clean up the room connection on unmount
  useEffect(() => {
    return () => {
      room.disconnect().catch(() => {});
    };
  }, [room]);

  const handleLeave = useCallback((reason?: 'teacher-absent' | 'ended-for-all') => {
    if (reason === 'teacher-absent') {
      isTeacherAbsentDisconnect.current = true;
    } else if (reason === 'ended-for-all') {
      isEndingClassForAll.current = true;
    }
    room.disconnect().catch(() => {});
  }, [room]);

  // Listen to RoomEvent.Disconnected to distinguish between user leaving and teacher ending class
  useEffect(() => {
    const handleDisconnected = (reason?: DisconnectReason) => {
      console.log('[VideoRoom] Room disconnected, reason:', reason);
      const wasTeacherEnded = 
        isEndingClassForAll.current || 
        isTeacherAbsentDisconnect.current ||
        reason === DisconnectReason.ROOM_DELETED || 
        reason === DisconnectReason.ROOM_CLOSED || 
        reason === DisconnectReason.SERVER_SHUTDOWN;
      
      if (onDisconnected) {
        onDisconnected(wasTeacherEnded ? 'ended' : 'left');
      }
    };

    room.on(RoomEvent.Disconnected, handleDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [room, onDisconnected]);

  return (
    <LiveKitRoom
      room={room}
      token={currentToken}
      serverUrl={serverUrl}
      connectOptions={connectOptions}
      connect={true}
      video={videoEnabled}
      audio={audioEnabled}
    >
      <RoomContent 
        roomName={roomName} 
        userName={userName} 
        onLeave={handleLeave} 
        onConnected={onConnected}
        sessionToken={sessionToken}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
