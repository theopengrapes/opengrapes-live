'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { getToken, getTurnCredentials, decodeJwt } from '@/lib/api';
import type { IceServer } from '@/lib/api';
import VideoRoom from '@/components/VideoRoom';
import PreJoinScreen from '@/components/classroom/PreJoinScreen';

interface ClassroomWrapperProps {
  roomName: string;
  sessionToken: string;
  userName: string;
  teacherName: string;
  className: string;
  role: string;
  onLeave: (reason: 'ended' | 'left') => void;
}

function ClassroomWrapper({
  roomName,
  sessionToken,
  userName,
  teacherName,
  className,
  role,
  onLeave,
}: ClassroomWrapperProps) {
  const [hasJoined, setHasJoined] = useState(false);
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFullyConnected, setIsFullyConnected] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<IceServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!hasJoined || !userName || !sessionToken) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    Promise.all([
      getToken(roomName, sessionToken),
      fetch('/api/livekit-url').then((r) => r.json()).then((d) => d.url as string),
      getTurnCredentials(),
    ])
      .then(([fetchedToken, livekitUrl, turnCredentials]) => {
        setToken(fetchedToken);
        setServerUrl(livekitUrl);
        setIceServers(turnCredentials);
      })
      .catch((err) => {
        console.error('Failed to initialize room:', err);
        setError(err.message || 'Failed to connect');
        fetchedRef.current = false; // Allow retry on error
      });
  }, [roomName, userName, hasJoined, sessionToken]);

  const handleJoin = (audioId: string, videoId: string, audioOn: boolean, videoOn: boolean) => {
    setAudioDeviceId(audioId);
    setVideoDeviceId(videoId);
    setAudioEnabled(audioOn);
    setVideoEnabled(videoOn);
    setIsConnecting(true);
    setHasJoined(true);
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <div className="bg-surface border border-red-500/30 rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/15">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-red-400">Connection Failed</h2>
          <p className="text-sm text-foreground/50">{error}</p>
          <p className="text-xs text-foreground/30">
            Make sure the backend server and tunneling ports are set up correctly.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#6366F1] hover:bg-[#4f46e5] rounded-lg text-sm transition-colors cursor-pointer text-white w-full font-semibold"
          >
            Retry Connection
          </button>
          <button
            onClick={() => onLeave('left')}
            className="px-6 py-2 bg-surface-light border border-border/40 rounded-lg text-sm hover:bg-border/30 transition-colors cursor-pointer text-white w-full"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const showRoom = token && serverUrl && iceServers;

  return (
    <div className="relative w-screen h-screen">
      {showRoom && (
        <VideoRoom
          token={token}
          roomName={roomName}
          serverUrl={serverUrl}
          userName={userName}
          iceServers={iceServers}
          onDisconnected={onLeave}
          sessionToken={sessionToken}
          audioDeviceId={audioDeviceId}
          videoDeviceId={videoDeviceId}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          onConnected={() => setIsFullyConnected(true)}
        />
      )}

      {!hasJoined && (
        <div className="absolute inset-0 z-50">
          <PreJoinScreen
            roomName={roomName}
            teacherName={teacherName}
            userName={userName}
            onJoin={handleJoin}
          />
        </div>
      )}

      {hasJoined && !isFullyConnected && (
        <div className="absolute inset-0 z-50 bg-[#030712] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#6366F1]/10 blur-[130px] animate-pulse" />
          </div>

          <div className="text-center space-y-8 z-10">
            <div className="space-y-3">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#E2E8F0] leading-relaxed max-w-xl mx-auto">
                Connecting you to{' '}
                <span className="text-[#6366F1]">{teacherName}</span>
                's{' '}
                <span className="text-indigo-400">{className ? className.toUpperCase() : roomName.toUpperCase()}</span>
              </h1>
              <p className="text-sm text-foreground/45 font-medium tracking-wide">
                Please wait while we establish your secure video connection...
              </p>
            </div>

            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-white/5" />
              <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              <div className="absolute inset-0 rounded-full bg-[#6366F1]/10 blur-md animate-pulse pointer-events-none" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login, user, isLoading } = useAuth();

  // Classroom States
  const [isClassroomMode, setIsClassroomMode] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tokenResolved, setTokenResolved] = useState(false);
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [role, setRole] = useState('');

  // Handoff check and session verification state

  // Core Handoff Check
  useEffect(() => {
    const checkSession = async () => {
      const tokenParam = searchParams.get('token');
      const roomIdParam = searchParams.get('roomId');
      const codeParam = searchParams.get('code');

      if (tokenParam) {
        // LMS Integration Redirect Path: Exchange LMS JWT token for native classroom tokens
        try {
          const res = await fetch('/api/exchange-lms-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenParam }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to exchange LMS token');
          }

          const data = await res.json();
          try {
            sessionStorage.setItem('classroom_access_token', data.accessToken);
            sessionStorage.setItem('classroom_refresh_token', data.refreshToken);
            sessionStorage.setItem('active_room_name', data.roomName);
            if (data.startedAtMs) {
              sessionStorage.setItem('classroom_session_started_at', data.startedAtMs.toString());
            }
          } catch (storageErr) {
            console.warn('sessionStorage write blocked or failed:', storageErr);
          }

          setRoomName(data.roomName);
          setAccessToken(data.accessToken);
          setIsClassroomMode(true);

          // Clean URL parameters instantly
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        } catch (e: any) {
          console.error(e);
          alert(e.message || 'LMS token exchange failed. Redirecting to dashboard...');
          redirectToLMS();
          return;
        }
      } else if (roomIdParam && codeParam) {
        // Direct Redirect Path: Exchange code for tokens
        try {
          const res = await fetch('/api/exchange-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: codeParam }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to exchange handoff code');
          }

          const data = await res.json();
          try {
            sessionStorage.setItem('classroom_access_token', data.accessToken);
            sessionStorage.setItem('classroom_refresh_token', data.refreshToken);
            sessionStorage.setItem('active_room_name', data.roomId);
            if (data.startedAtMs) {
              sessionStorage.setItem('classroom_session_started_at', data.startedAtMs.toString());
            }
          } catch (storageErr) {
            console.warn('sessionStorage write blocked or failed:', storageErr);
          }

          setRoomName(data.roomId);
          setAccessToken(data.accessToken);
          setIsClassroomMode(true);

          // Clean URL parameters instantly
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        } catch (e: any) {
          console.error(e);
          alert(e.message || 'Session verification failed. Redirecting to dashboard...');
          redirectToLMS();
          return;
        }
      } else {
        // Refresh check path: retrieve from sessionStorage safely
        try {
          const savedRoom = sessionStorage.getItem('active_room_name') || '';
          let savedAccess = sessionStorage.getItem('classroom_access_token') || '';
          const savedRefresh = sessionStorage.getItem('classroom_refresh_token') || '';

          if (savedRoom && savedAccess && savedRefresh) {
            // Verify access token lifetime client-side
            const decodedAccess = decodeJwt(savedAccess);
            const buffer = 10 * 1000; // 10s buffer

            if (decodedAccess && decodedAccess.exp * 1000 > Date.now() + buffer) {
              setRoomName(savedRoom);
              setAccessToken(savedAccess);
              setIsClassroomMode(true);
            } else {
              // Access token expired, attempt token renewal
              try {
                const res = await fetch('/api/renew-session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken: savedRefresh }),
                });

                if (!res.ok) throw new Error('Refresh expired or session ended');

                const data = await res.json();
                try {
                  sessionStorage.setItem('classroom_access_token', data.accessToken);
                } catch (storageErr) {
                  console.warn('sessionStorage write blocked or failed:', storageErr);
                }
                setRoomName(savedRoom);
                setAccessToken(data.accessToken);
                setIsClassroomMode(true);
              } catch (err) {
                console.warn('Session renewal failed:', err);
                handleClearSession();
                redirectToLMS();
                return;
              }
            }
          } else {
            // No active tokens or code. Redirect to LMS dashboard
            redirectToLMS();
            return;
          }
        } catch (storageErr) {
          console.warn('sessionStorage read blocked or failed:', storageErr);
        }
      }
      setTokenResolved(true);
    };

    checkSession();
  }, [searchParams]);

  // Decode JWT and verify identity info
  const [isVerifying, setIsVerifying] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!tokenResolved || !isClassroomMode) return;

    const decoded = decodeJwt(accessToken);
    if (!decoded) {
      handleClearSession();
      redirectToLMS();
      return;
    }

    if (decoded.name) setUserName(decoded.name);
    if (decoded.role) setRole(decoded.role);
    if (decoded.roomId) setClassName(decoded.roomId);
    setTeacherName(decoded.role === 'teacher' ? decoded.name : 'Teacher');
    setIsVerifying(false);
  }, [accessToken, tokenResolved, isClassroomMode]);

  // Local dashboard redirection removed

  const redirectToLMS = () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const dashboardUrl = isLocalhost ? 'http://localhost:3000' : 'https://opengrapes.com';
    window.location.href = dashboardUrl;
  };

  const handleClearSession = () => {
    try {
      sessionStorage.removeItem('classroom_access_token');
      sessionStorage.removeItem('classroom_refresh_token');
      sessionStorage.removeItem('active_room_name');
    } catch (err) {
      console.warn('sessionStorage remove blocked or failed:', err);
    }
    setIsClassroomMode(false);
  };

  // Local submit handler removed

  if (isClassroomMode) {
    if (isVerifying) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#030712]">
          <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      );
    }
    return (
      <ClassroomWrapper
        roomName={roomName}
        sessionToken={accessToken} // Passes access token in place of sessionToken
        userName={userName}
        teacherName={teacherName}
        className={className}
        role={role}
        onLeave={(reason) => {
          if (reason === 'ended') {
            handleClearSession();
          }
          router.push(`/ended?reason=${reason}`);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712]">
      <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

// Suspense-wrapped container to prevent static generation compiler errors
export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
