'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PreJoinScreenProps {
  roomName: string;
  teacherName: string;
  userName: string;
  onJoin: (audioDeviceId: string, videoDeviceId: string, audioEnabled: boolean, videoEnabled: boolean) => void;
}

export default function PreJoinScreen({
  roomName,
  teacherName,
  userName,
  onJoin,
}: PreJoinScreenProps) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [showDeviceSettings, setShowDeviceSettings] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(true);
  const [isCamEnabled, setIsCamEnabled] = useState<boolean>(true);

  const [hasCamPermission, setHasCamPermission] = useState<boolean>(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(false);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    if (node && previewStreamRef.current) {
      node.srcObject = previewStreamRef.current;
    }
  }, []);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const settingsCardRef = useRef<HTMLDivElement>(null);

  const isCamEnabledRef = useRef(isCamEnabled);
  const isMicEnabledRef = useRef(isMicEnabled);

  useEffect(() => {
    isCamEnabledRef.current = isCamEnabled;
  }, [isCamEnabled]);

  useEffect(() => {
    isMicEnabledRef.current = isMicEnabled;
  }, [isMicEnabled]);

  const startPreviewStream = useCallback(async (vId?: string, aId?: string) => {
    try {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => track.stop());
        previewStreamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: vId ? { deviceId: { exact: vId } } : true,
        audio: aId ? { deviceId: { exact: aId } } : true,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (errVideo) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          } catch (errAudio) {
            throw errAudio;
          }
        }
      }

      previewStreamRef.current = stream;

      stream.getVideoTracks().forEach(t => t.enabled = isCamEnabledRef.current);
      stream.getAudioTracks().forEach(t => t.enabled = isMicEnabledRef.current);
      
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream;
      }

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      setHasCamPermission(videoTracks.length > 0);
      setHasMicPermission(audioTracks.length > 0);

      const activeVid = videoTracks[0]?.getSettings().deviceId;
      const activeAud = audioTracks[0]?.getSettings().deviceId;

      if (activeVid && !vId) setSelectedVideoId(activeVid);
      if (activeAud && !aId) setSelectedAudioId(activeAud);

      setErrorMsg(null);
    } catch (err: any) {
      console.error('Error starting preview stream:', err);
      setErrorMsg(err.message || 'Permission denied or no devices found.');
    }
  }, []);

  const enumerateDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audios = allDevices.filter((d) => d.kind === 'audioinput');
      const videos = allDevices.filter((d) => d.kind === 'videoinput');
      setAudioDevices(audios);
      setVideoDevices(videos);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      await startPreviewStream();
      if (active) {
        await enumerateDevices();
      }
    }
    init();

    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startPreviewStream, enumerateDevices]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    startPreviewStream(selectedVideoId, selectedAudioId);
  }, [selectedVideoId, selectedAudioId, startPreviewStream]);

  useEffect(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMicEnabled;
      });
    }
  }, [isMicEnabled]);

  useEffect(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isCamEnabled;
      });
    }
  }, [isCamEnabled]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsCardRef.current && !settingsCardRef.current.contains(event.target as Node)) {
        setShowDeviceSettings(false);
      }
    }
    if (showDeviceSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeviceSettings]);

  const handleJoinClick = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }

    onJoin(selectedAudioId, selectedVideoId, isMicEnabled, isCamEnabled);
  };

  const displayTeacherName = teacherName || 'Teacher';

  return (
    <div className="min-h-screen w-screen bg-[#030712] text-white flex flex-col relative overflow-hidden font-sans select-none">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[140px]" />
      </div>

      {/* Header bar */}
      <header className="h-16 w-full border-b border-white/5 flex items-center px-8 bg-[#030712]/40 backdrop-blur-md z-10 shrink-0">
        <span className="text-[#fff] text-sm font-semibold tracking-wider">
          OpenGrapes Live
        </span>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-3xl mx-auto flex flex-col items-center justify-center gap-8 p-8 lg:p-12 z-10 min-h-0">
        {/* Preview & Device Setup */}
        <div className="w-full flex flex-col items-center justify-center space-y-6 text-center min-h-0">
          <div className="space-y-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#E2E8F0] mx-auto">
              Connecting you to{" "}
              <span className="text-[#6366F1] font-extrabold">
                {displayTeacherName}
              </span>
              's <span className="text-indigo-400 ">{roomName}</span> session
            </h1>
            <p className="text-sm text-foreground/50">
              Welcome,{" "}
              <span className="font-semibold text-white">{userName}</span>. Set
              up your devices before joining the class.
            </p>
          </div>

          {/* Self video feed box */}
          <div className="w-full max-w-xl md:max-w-2xl aspect-video rounded-2xl border border-white/10 bg-[#202124] shadow-2xl relative flex items-center justify-center overflow-hidden group">
            {!isCamEnabled ? (
              <div className="flex flex-col items-center justify-center text-foreground/20 space-y-3 p-6 select-none">
                <span className="text-2xl font-semibold text-foreground/60 font-sans">
                  Camera is off
                </span>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                <svg
                  className="w-12 h-12 text-red-500/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
                  />
                </svg>
                <span className="text-sm font-semibold text-red-400 max-w-xs">
                  {errorMsg}
                </span>
              </div>
            ) : !hasCamPermission ? (
              <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-md">
                <div className="w-16 h-16 rounded-full bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center text-[#6366F1] animate-pulse">
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                    />
                  </svg>
                </div>
                <p className="text-base font-bold text-[#E2E8F0] leading-relaxed">
                  Allow permission to access microphone and camera
                </p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            )}
          </div>

          {/* Floating Controls Bar under the self video feed */}
          <div
            className="flex items-center gap-3 relative z-30"
            ref={settingsCardRef}
          >
            {/* Microphone Toggle Button */}
            <button
              onClick={() => setIsMicEnabled(!isMicEnabled)}
              className={`relative group w-15 h-12 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg ${
                isMicEnabled
                  ? "bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }`}
            >
              <svg
                className="w-8 h-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.30001 6.30001C9.30001 4.80884 10.5088 3.60001 12 3.60001C13.4912 3.60001 14.7 4.80884 14.7 6.30001V11.7C14.7 13.1912 13.4912 14.4 12 14.4C10.5088 14.4 9.30001 13.1912 9.30001 11.7V6.30001Z"
                  fill="currentColor"
                  fillOpacity={0.25}
                  stroke="none"
                />
                <path
                  d="M15 20.4H9.00001M12 16.5V20.4M12 16.5C9.34905 16.5 7.20001 14.351 7.20001 11.7V9.30001M12 16.5C14.651 16.5 16.8 14.351 16.8 11.7V9.30001M12 14.4C10.5088 14.4 9.30001 13.1912 9.30001 11.7V6.30001C9.30001 4.80884 10.5088 3.60001 12 3.60001C13.4912 3.60001 14.7 4.80884 14.7 6.30001V11.7C14.7 13.1912 13.4912 14.4 12 14.4Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {!isMicEnabled && (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3l18 18"
                  />
                )}
              </svg>
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#1e2230]/95 backdrop-blur border border-white/10 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-75 scale-95 group-hover:scale-100 origin-bottom whitespace-nowrap shadow-xl z-50">
                {isMicEnabled ? "Mute Microphone" : "Unmute Microphone"}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#1e2230]/95" />
              </div>
            </button>

            {/* Camera Toggle Button */}
            <button
              onClick={() => setIsCamEnabled(!isCamEnabled)}
              className={`relative group w-15 h-12 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg ${
                isCamEnabled
                  ? "bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }`}
            >
              <svg
                className="w-8 h-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.39999 7.2C2.39999 6.53726 2.93725 6 3.59999 6H15C15.6627 6 16.2 6.53726 16.2 7.2V16.8C16.2 17.4627 15.6627 18 15 18H3.59999C2.93725 18 2.39999 17.4627 2.39999 16.8V7.2Z"
                  fill="currentColor"
                  fillOpacity={0.25}
                  stroke="none"
                />
                <path
                  d="M16.2 14.5737L20.762 16.5446C21.1581 16.7157 21.6 16.4253 21.6 15.9938V8.21945C21.6 7.78795 21.1581 7.49752 20.762 7.66866L16.2 9.6396V14.5737Z"
                  fill="currentColor"
                  fillOpacity={0.25}
                  stroke="none"
                />
                <path
                  d="M2.39999 7.2C2.39999 6.53726 2.93725 6 3.59999 6H15C15.6627 6 16.2 6.53726 16.2 7.2V16.8C16.2 17.4627 15.6627 18 15 18H3.59999C2.93725 18 2.39999 17.4627 2.39999 16.8V7.2Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16.2 14.5737L20.762 16.5446C21.1581 16.7157 21.6 16.4253 21.6 15.9938V8.21945C21.6 7.78795 21.1581 7.49752 20.762 7.66866L16.2 9.6396V14.5737Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {!isCamEnabled && (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3l18 18"
                  />
                )}
              </svg>
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#1e2230]/95 backdrop-blur border border-white/10 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-75 scale-95 group-hover:scale-100 origin-bottom whitespace-nowrap shadow-xl z-50">
                {isCamEnabled ? "Turn Off Camera" : "Turn On Camera"}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#1e2230]/95" />
              </div>
            </button>

            {/* Device Settings Toggle Button */}
            <button
              onClick={() => setShowDeviceSettings(!showDeviceSettings)}
              className={`relative group w-15 h-12 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg ${
                showDeviceSettings
                  ? "bg-primary text-white hover:bg-primary-hover"
                  : "bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]"
              }`}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M9.90705 4.26083C9.92771 4.00148 10.1128 3.78282 10.3687 3.73596C11.3596 3.55454 12.376 3.55465 13.3669 3.73627C13.6228 3.78317 13.8078 4.00181 13.8285 4.26112L13.9398 5.65808C13.9585 5.89328 14.1144 6.09328 14.3312 6.18654C14.5539 6.28236 14.7723 6.39175 14.9853 6.51472C15.1984 6.63775 15.4025 6.77231 15.5969 6.91735C15.786 7.05845 16.0372 7.0935 16.2503 6.99212L17.515 6.39035C17.75 6.27856 18.0319 6.32955 18.2004 6.52778C18.853 7.29531 19.3611 8.17569 19.6992 9.12473C19.7865 9.36976 19.6896 9.63931 19.4754 9.78684L18.3221 10.5811C18.1278 10.7149 18.0326 10.9499 18.0602 11.1843C18.0885 11.425 18.103 11.6688 18.103 11.9147C18.103 12.1607 18.0885 12.4047 18.0601 12.6455C18.0325 12.8799 18.1277 13.1149 18.3221 13.2488L19.4748 14.0426C19.689 14.1901 19.7858 14.4598 19.6985 14.7048C19.3601 15.6538 18.8518 16.5341 18.199 17.3016C18.0304 17.4997 17.7486 17.5506 17.5137 17.4389L16.2499 16.8376C16.0369 16.7362 15.7857 16.7712 15.5966 16.9123C15.4023 17.0573 15.1983 17.1918 14.9853 17.3147C14.7723 17.4377 14.5539 17.5471 14.3312 17.6429C14.1145 17.7361 13.9585 17.9361 13.9398 18.1714L13.8287 19.5665C13.808 19.8258 13.623 20.0444 13.3671 20.0913C12.3761 20.273 11.3596 20.2731 10.3685 20.0916C10.1126 20.0448 9.92753 19.8261 9.90687 19.5668L9.79572 18.1715C9.77699 17.9363 9.62104 17.7362 9.40429 17.643C9.18151 17.5472 8.96299 17.4377 8.74993 17.3147C8.53698 17.1918 8.33306 17.0573 8.13876 16.9124C7.94963 16.7713 7.69846 16.7363 7.4854 16.8377L6.22074 17.4394C5.98586 17.5512 5.70401 17.5002 5.53545 17.3021C4.88262 16.5348 4.37423 15.6546 4.03581 14.7058C3.9484 14.4607 4.04522 14.191 4.2595 14.0435L5.41319 13.2489C5.60753 13.1151 5.70277 12.88 5.67514 12.6457C5.64674 12.4048 5.63224 12.1608 5.63224 11.9147C5.63224 11.6688 5.64673 11.4249 5.6751 11.1841C5.70271 10.9498 5.60747 10.7147 5.41314 10.5809L4.25886 9.78598C4.04462 9.63843 3.9478 9.36885 4.03512 9.12381C4.37329 8.17489 4.88142 7.29463 5.53401 6.52721C5.70254 6.32901 5.98446 6.27804 6.21939 6.38982L7.48506 6.99204C7.69813 7.09342 7.94931 7.05837 8.13844 6.91728C8.33284 6.77227 8.53687 6.63773 8.74993 6.51472C8.963 6.3917 9.18154 6.28227 9.40432 6.18643C9.62108 6.09318 9.77702 5.89318 9.79576 5.65796L9.90705 4.26083ZM13.4264 9.21482C12.4617 8.6579 11.2733 8.6579 10.3087 9.21482C9.34405 9.77175 8.74983 10.801 8.74983 11.9148C8.74983 13.0287 9.34405 14.0579 10.3087 14.6148C11.2733 15.1717 12.4617 15.1717 13.4264 14.6148C14.391 14.0579 14.9852 13.0287 14.9852 11.9148C14.9852 10.801 14.391 9.77175 13.4264 9.21482Z"
                  fill="currentColor"
                  fillOpacity={0.25}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#1e2230]/95 backdrop-blur border border-white/10 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-75 scale-95 group-hover:scale-100 origin-bottom whitespace-nowrap shadow-xl z-50">
                Device settings
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#1e2230]/95" />
              </div>
            </button>

            {/* Dropdown Menu Card */}
            {showDeviceSettings && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-80 bg-[#0b0f19]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 text-left z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                    <svg
                      className="w-4 h-4 text-[#C2CCDE]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992V12Z"
                      />
                    </svg>
                    Device Settings
                  </div>
                  <button
                    onClick={() => setShowDeviceSettings(false)}
                    className="text-foreground/40 hover:text-white cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Microphone Select */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/40">
                    Microphone
                  </label>
                  <div className="relative">
                    <select
                      value={selectedAudioId}
                      onChange={(e) => setSelectedAudioId(e.target.value)}
                      className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-3 py-2 text-sm outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none pr-8"
                    >
                      {audioDevices.length === 0 ? (
                        <option value="">No microphones found</option>
                      ) : (
                        audioDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label ||
                              `Microphone ${device.deviceId.slice(0, 5)}`}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-[#C2CCDE]/50">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Camera Select */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/40">
                    Camera
                  </label>
                  <div className="relative">
                    <select
                      value={selectedVideoId}
                      onChange={(e) => setSelectedVideoId(e.target.value)}
                      className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-3 py-2 text-sm outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none pr-8"
                    >
                      {videoDevices.length === 0 ? (
                        <option value="">No cameras found</option>
                      ) : (
                        videoDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label ||
                              `Camera ${device.deviceId.slice(0, 5)}`}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-[#C2CCDE]/50">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Join class button right in the center */}
          <div className="w-full max-w-md pt-4 z-20">
            <button
              onClick={handleJoinClick}
              className="w-full py-4 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-primary/40 cursor-pointer flex items-center justify-center gap-2 text-sm"
            >
              <span>Join class</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
