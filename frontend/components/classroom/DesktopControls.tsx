'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  IconLock, 
  IconLayoutDashboard, 
  IconTableSpark, 
  IconLayoutGrid, 
  IconLayoutSidebarRight, 
  IconRectangle, 
  IconChalkboard, 
  IconChalkboardOff, 
  IconPhone,
  IconChevronUp
} from '@tabler/icons-react';
import Tooltip from './Tooltip';

interface DesktopControlsProps {
  roomName: string;
  isMicrophoneEnabled: boolean;
  toggleMicrophone: () => void;
  isCameraEnabled: boolean;
  toggleCamera: () => void;
  isScreenShareEnabled: boolean;
  toggleScreenShare: () => void;
  showWhiteboard: boolean;
  toggleWhiteboard: () => void;
  isTeacher: boolean;
  isExporting: boolean;
  handleEndClass: () => void;
  onLeave: () => void;
  exportedPdfUrl: string | null;
  activeRightPanelTab: 'chat' | 'participants' | 'doubt' | 'summary' | null;
  setActiveRightPanelTab: (tab: 'chat' | 'participants' | 'doubt' | 'summary' | null) => void;
  isWhiteboardAllowed?: boolean;
  isScreenShareAllowed?: boolean;
  layoutMode: 'auto' | 'tiled' | 'spotlight' | 'sidebar' | 'focus';
  setLayoutMode: (mode: 'auto' | 'tiled' | 'spotlight' | 'sidebar' | 'focus') => void;
  showSplitLayout: boolean;

  // Devices info passed from parent
  audioDevices: MediaDeviceInfo[];
  activeAudioId: string;
  setActiveAudioDevice: (id: string) => void;
  videoDevices: MediaDeviceInfo[];
  activeVideoId: string;
  setActiveVideoDevice: (id: string) => void;
}

export default function DesktopControls({
  roomName,
  isMicrophoneEnabled,
  toggleMicrophone,
  isCameraEnabled,
  toggleCamera,
  isScreenShareEnabled,
  toggleScreenShare,
  showWhiteboard,
  toggleWhiteboard,
  isTeacher,
  isExporting,
  handleEndClass,
  onLeave,
  exportedPdfUrl,
  activeRightPanelTab,
  setActiveRightPanelTab,
  isWhiteboardAllowed = true,
  isScreenShareAllowed = true,
  layoutMode,
  setLayoutMode,
  showSplitLayout,
  audioDevices,
  activeAudioId,
  setActiveAudioDevice,
  videoDevices,
  activeVideoId,
  setActiveVideoDevice,
}: DesktopControlsProps) {
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);

  const [showMicMenu, setShowMicMenu] = useState(false);
  const micMenuRef = useRef<HTMLDivElement>(null);
  const [showCamMenu, setShowCamMenu] = useState(false);
  const camMenuRef = useRef<HTMLDivElement>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Determine the meeting start time from roomName or fallback to component mount time
  const startTime = useMemo(() => {
    const parts = roomName.split('-');
    if (parts.length >= 3) {
      const tsPart = parts.find((part) => /^\d{13}$/.test(part));
      if (tsPart) {
        const ts = parseInt(tsPart, 10);
        if (Date.now() - ts > 0 && Date.now() - ts < 24 * 60 * 60 * 1000) {
          return ts;
        }
      }
    }
    return Date.now();
  }, [roomName]);

  // Update meeting duration timer
  useEffect(() => {
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Formatter for elapsedSeconds to hh:mm:ss
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

  // Close menus when clicking outside
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
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  useEffect(() => {
    if (!showDeviceSettings) {
      setShowDevices(false);
    }
  }, [showDeviceSettings]);

  return (
    <div className="w-full h-[72px] bg-[#090d1a]/95 border-t border-white/10 px-4 lg:px-6 py-1.5 flex items-center justify-between z-40 select-none transition-all duration-300 controls-bar relative translate-y-0 opacity-100">
      {/* Left side: Class details & time */}
      <div className="hidden md:flex flex-col min-w-[120px] lg:min-w-[200px]">
        <span className="font-bold text-sm text-white tracking-wider">OpenGrapes Live</span>
        <span className="text-xs text-[#C2CCDE]/50 font-semibold mt-0.5">
          {formatDuration(elapsedSeconds)}
        </span>
      </div>

      {/* Center side: Meeting controls */}
      <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3">
        {/* Microphone Toggle */}
        <div className="relative" ref={micMenuRef}>
          <div className={`relative w-[84px] h-[60px] rounded-xl border text-[#C2CCDE] transition-all duration-200 flex items-center p-0.5 ${
            isMicrophoneEnabled ? 'border-white/10 bg-white/5' : 'border-transparent bg-transparent'
          }`}>
            {/* Mute/Unmute main toggle button */}
            <Tooltip content={isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"} className="flex-1 h-full">
              <button
                onClick={toggleMicrophone}
                className="w-full h-full flex flex-col items-center justify-center rounded-lg hover:bg-white/5 transition-colors cursor-pointer gap-0.5"
              >
                {isMicrophoneEnabled ? (
                  <svg
                    className="w-6 h-6"
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
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6 text-red-500"
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  </svg>
                )}
                <span className="text-[11px] font-medium leading-none select-none text-[#C2CCDE]">Audio</span>
              </button>
            </Tooltip>

            {/* Chevron split button on the right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMicMenu(prev => !prev);
              }}
              className="w-5.5 h-full flex items-center justify-center rounded-lg hover:bg-white/10 text-[#C2CCDE]/50 hover:text-white transition-colors cursor-pointer"
            >
              <IconChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Audio selector menu */}
          {showMicMenu && (
            <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-64 bg-[#0b0f19]/95 border border-white/10 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 text-[#C2CCDE] z-[200] animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans">
              <div className="px-3 py-1.5 border-b border-white/5 select-none text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/40">Select Microphone</span>
              </div>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {audioDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      setActiveAudioDevice(device.deviceId);
                      setShowMicMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-left text-xs font-semibold select-none ${
                      activeAudioId === device.deviceId ? 'text-indigo-400 font-bold bg-indigo-500/10' : 'text-[#C2CCDE]'
                    }`}
                  >
                    <span className="truncate">{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</span>
                  </button>
                ))}
                {audioDevices.length === 0 && (
                  <span className="px-3 py-2 text-xs text-[#C2CCDE]/40">No microphones found</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Camera Toggle */}
        <div className="relative" ref={camMenuRef}>
          <div className={`relative w-[84px] h-[60px] rounded-xl border text-[#C2CCDE] transition-all duration-200 flex items-center p-0.5 ${
            isCameraEnabled ? 'border-white/10 bg-white/5' : 'border-transparent bg-transparent'
          }`}>
            {/* Video Toggle main button */}
            <Tooltip content={isCameraEnabled ? "Turn Off Camera" : "Turn On Camera"} className="flex-1 h-full">
              <button
                onClick={toggleCamera}
                className="w-full h-full flex flex-col items-center justify-center rounded-lg hover:bg-white/5 transition-colors cursor-pointer gap-0.5"
              >
                {isCameraEnabled ? (
                  <svg
                    className="w-6 h-6"
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
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6 text-red-500"
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  </svg>
                )}
                <span className="text-[11px] font-medium leading-none select-none text-[#C2CCDE]">Video</span>
              </button>
            </Tooltip>

            {/* Chevron split button on the right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCamMenu(prev => !prev);
              }}
              className="w-5.5 h-full flex items-center justify-center rounded-lg hover:bg-white/10 text-[#C2CCDE]/50 hover:text-white transition-colors cursor-pointer"
            >
              <IconChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Camera selector menu */}
          {showCamMenu && (
            <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-64 bg-[#0b0f19]/95 border border-white/10 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 text-[#C2CCDE] z-[200] animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans">
              <div className="px-3 py-1.5 border-b border-white/5 select-none text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/40">Select Camera</span>
              </div>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {videoDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      setActiveVideoDevice(device.deviceId);
                      setShowCamMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-left text-xs font-semibold select-none ${
                      activeVideoId === device.deviceId ? 'text-indigo-400 font-bold bg-indigo-500/10' : 'text-[#C2CCDE]'
                    }`}
                  >
                    <span className="truncate">{device.label || `Camera ${device.deviceId.slice(0, 5)}`}</span>
                  </button>
                ))}
                {videoDevices.length === 0 && (
                  <span className="px-3 py-2 text-xs text-[#C2CCDE]/40">No cameras found</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Screen Share Toggle */}
        <div className="hidden md:block relative">
          <Tooltip
            content={
              !isScreenShareAllowed
                ? 'Screen Sharing Disabled by Teacher'
                : isScreenShareEnabled
                ? 'Stop Screen Sharing'
                : 'Share Screen'
            }
          >
            <button
              disabled={!isScreenShareAllowed}
              onClick={toggleScreenShare}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                !isScreenShareAllowed
                  ? 'opacity-45 cursor-not-allowed text-[#C2CCDE]/30 border-transparent bg-transparent'
                  : isScreenShareEnabled
                  ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold'
                  : 'text-[#C2CCDE] border-transparent bg-transparent hover:bg-white/10 cursor-pointer'
              }`}
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.80001 4.87677C4.13727 4.87677 3.60001 5.41403 3.60001 6.07677V16.8768H9.63782C9.77103 17.3943 10.2409 17.7768 10.8 17.7768H13.2C13.7592 17.7768 14.229 17.3943 14.3622 16.8768H20.4V6.07677C20.4 5.41403 19.8628 4.87677 19.2 4.87677H4.80001Z"
                  fill="currentColor"
                  fillOpacity={isScreenShareEnabled ? 0.4 : 0.25}
                  stroke="none"
                />
                <path
                  d="M9.63782 16.8768H1.24566C1.22045 16.8768 1.20001 16.9224 1.20001 16.9224C1.20001 18.2227 2.25409 19.2768 3.55437 19.2768H20.4457C21.7459 19.2768 22.8 18.2227 22.8 16.9224C22.8 16.8972 22.7796 16.8768 22.7544 16.8768H14.3622C14.229 17.3943 13.7592 17.7768 13.2 17.7768H10.8C10.2409 17.7768 9.77103 17.3943 9.63782 16.8768Z"
                  fill="currentColor"
                  fillOpacity={isScreenShareEnabled ? 0.4 : 0.25}
                  stroke="none"
                />
                <path
                  d="M9.63782 16.8768H1.24566C1.22045 16.8768 1.20001 16.9224 1.20001 16.9224C1.20001 18.2227 2.25409 19.2768 3.55437 19.2768H20.4457C21.7459 19.2768 22.8 18.2227 22.8 16.9224C22.8 16.8972 22.7796 16.8768 22.7544 16.8768H14.3622C14.229 17.3943 13.7592 17.7768 13.2 17.7768H10.8C10.2409 17.7768 9.77103 17.3943 9.63782 16.8768H20.4V6.07677C20.4 5.41403 19.8628 4.87677 19.2 4.87677H4.80001C4.13727 4.87677 3.60001 5.41403 3.60001 6.07677V16.8768H9.63782"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 7.38614V9.5968M12 9.6V13.05M9.60001 9.6L11.6818 7.5182C11.8575 7.34247 12.1425 7.34247 12.3182 7.5182L14.4 9.6M9.60001 14.25H14.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11px] font-medium leading-none select-none">Share</span>
            </button>
          </Tooltip>
          {!isScreenShareAllowed && (
            <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-600 rounded-full flex items-center justify-center text-white border border-[#090d1a] shadow-md z-10">
              <IconLock className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Whiteboard Toggle */}
        <div className="hidden md:block relative">
          <Tooltip
            content={
              showWhiteboard
                ? !isWhiteboardAllowed
                  ? 'Close Whiteboard (Read-Only)'
                  : 'Close Collaborative Whiteboard'
                : !isWhiteboardAllowed
                ? 'Open Whiteboard (Read-Only)'
                : 'Open Collaborative Whiteboard'
            }
          >
            <button
              onClick={toggleWhiteboard}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                showWhiteboard
                  ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold'
                  : 'text-[#C2CCDE] border-transparent bg-transparent hover:bg-white/10'
              }`}
            >
              {showWhiteboard ? (
                <IconChalkboard className="w-6 h-6" />
              ) : (
                <IconChalkboardOff className="w-6 h-6" />
              )}
              <span className="text-[11px] font-medium leading-none select-none tracking-tight">Whiteboard</span>
            </button>
          </Tooltip>
          {!isWhiteboardAllowed && (
            <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-[#d97706] rounded-full flex items-center justify-center text-white border border-[#090d1a] shadow-md z-10">
              <IconLock className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Adjust View Toggle Button */}
        <div ref={layoutMenuRef} className="relative">
          <Tooltip content="Adjust view">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                showLayoutMenu
                  ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold'
                  : 'text-[#C2CCDE] border-transparent bg-transparent hover:bg-white/10'
              }`}
            >
              <IconLayoutDashboard className="w-6 h-6" />
              <span className="text-[11px] font-medium leading-none select-none">View</span>
            </button>
          </Tooltip>

          {/* Adjust View Dropdown Menu */}
          {showLayoutMenu && (
            <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-72 bg-[#0b0f19]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-1 text-[#C2CCDE] z-[300] animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans">
              <div className="px-3 py-1.5 border-b border-white/5 select-none text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/40">Adjust view</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => {
                    setLayoutMode('auto');
                    setShowLayoutMenu(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 px-2.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-center text-xs font-semibold select-none ${
                    layoutMode === 'auto' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                  }`}
                >
                  <IconTableSpark className="w-4 h-4" />
                  <span>Auto</span>
                </button>

                <button
                  onClick={() => {
                    setLayoutMode('tiled');
                    setShowLayoutMenu(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 px-2.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-center text-xs font-semibold select-none ${
                    layoutMode === 'tiled' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                  }`}
                >
                  <IconLayoutGrid className="w-4 h-4" />
                  <span>Tiled</span>
                </button>

                <button
                  onClick={() => {
                    setLayoutMode('sidebar');
                    setShowLayoutMenu(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 px-2.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-center text-xs font-semibold select-none ${
                    layoutMode === 'sidebar' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                  }`}
                >
                  <IconLayoutSidebarRight className="w-4 h-4" />
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
                  className={`flex flex-col items-center gap-1.5 px-2.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-center text-xs font-semibold select-none ${
                    !showSplitLayout
                      ? 'opacity-40 cursor-not-allowed text-[#C2CCDE]/50'
                      : layoutMode === 'focus'
                      ? 'text-indigo-400 bg-indigo-500/10 cursor-pointer'
                      : 'text-[#C2CCDE] cursor-pointer'
                  }`}
                  title={!showSplitLayout ? 'Focus View (Only available during presentations)' : ''}
                >
                  <IconRectangle className="w-4 h-4" />
                  <span>Focus</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Settings gear with sub-menu for device outputs */}
        <div ref={menuRef} className="relative">
          <Tooltip content="Settings / Devices">
            <button
              onClick={() => setShowDeviceSettings(!showDeviceSettings)}
              className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                showDeviceSettings
                  ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold'
                  : 'text-[#C2CCDE] border-transparent bg-transparent hover:bg-white/10'
              }`}
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11px] font-medium leading-none select-none">Settings</span>
            </button>
          </Tooltip>

          {/* Devices Settings Menu */}
          {showDeviceSettings && (
            <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-72 bg-[#0b0f19]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-1 text-[#C2CCDE] z-[200] animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans">
              <div className="px-3.5 py-2 border-b border-white/5 flex items-center justify-between select-none">
                <span className="text-xs font-bold uppercase tracking-wider text-[#C2CCDE]/40">Settings</span>
                {isTeacher && (
                  <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase select-none">
                    Teacher Mode
                  </span>
                )}
              </div>

              {/* Audio Source Select */}
              <div className="px-3.5 py-2 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-[#C2CCDE]/45 uppercase select-none text-left">
                  Microphone Source
                </span>
                <select
                  value={activeAudioId}
                  onChange={(e) => setActiveAudioDevice(e.target.value)}
                  className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-2.5 py-2 text-xs outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none font-sans font-semibold pr-8"
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Video Source Select */}
              <div className="px-3.5 py-2 flex flex-col gap-1.5 border-b border-white/5 pb-3">
                <span className="text-[10px] font-bold text-[#C2CCDE]/45 uppercase select-none text-left">
                  Camera Source
                </span>
                <select
                  value={activeVideoId}
                  onChange={(e) => setActiveVideoDevice(e.target.value)}
                  className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-2.5 py-2 text-xs outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none font-sans font-semibold pr-8"
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* PDF export buttons for Teachers */}
              {isTeacher && (
                <div className="px-1 py-1">
                  {exportedPdfUrl ? (
                    <a
                      href={exportedPdfUrl}
                      download={`${roomName}_notes.pdf`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
                    >
                      Download Board PDF
                    </a>
                  ) : (
                    <button
                      onClick={() => {
                        handleEndClass();
                        setShowDeviceSettings(false);
                      }}
                      disabled={isExporting}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
                    >
                      Export Board to PDF
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* End Call / Leave Button */}
        <Tooltip content={isTeacher ? 'End class session' : 'Leave classroom'}>
          <button
            onClick={onLeave}
            className="w-[60px] h-[60px] rounded-full border border-transparent flex items-center justify-center transition-all cursor-pointer text-white bg-red-600 hover:bg-red-500 shadow-md"
          >
            <IconPhone className="w-6.5 h-6.5 transform rotate-[135deg]" />
          </button>
        </Tooltip>
      </div>

      {/* Right side: Sidebar toggles */}
      <div className="hidden md:flex items-center gap-3 min-w-[120px] lg:min-w-[200px] justify-end">
        {/* Chat Toggle */}
        <Tooltip content={activeRightPanelTab === 'chat' ? 'Hide Chat' : 'Show Chat'} align="right">
          <button
            onClick={() => setActiveRightPanelTab(activeRightPanelTab === 'chat' ? null : 'chat')}
            className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
              activeRightPanelTab === 'chat'
                ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold'
                : 'text-[#C2CCDE] border-transparent bg-transparent hover:bg-white/10'
            }`}
          >
            <svg
              className="w-6 h-6"
              viewBox="0 0 85 77"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M24 21L56 21"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M24 43H56"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M31 32H63"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M26.5625 11.55C18.9341 11.55 12.75 17.152 12.75 24.0625V41.3875C12.75 47.9741 18.368 53.372 25.5 53.8635V65.45L42.5 53.9H58.4375C66.0659 53.9 72.25 48.2979 72.25 41.3875V24.0625C72.25 17.152 66.0659 11.55 58.4375 11.55H26.5625Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'chat' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[11px] font-medium leading-none select-none">Chat</span>
          </button>
        </Tooltip>

        {/* Participants Toggle */}
        <Tooltip
          content={activeRightPanelTab === 'participants' ? 'Hide Participants' : 'Show Participants'}
          align="right"
        >
          <button
            onClick={() =>
              setActiveRightPanelTab(activeRightPanelTab === 'participants' ? null : 'participants')
            }
            className={`w-[72px] h-[60px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
              activeRightPanelTab === 'participants'
                ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold'
                : 'text-[#C2CCDE] border-transparent bg-transparent hover:bg-white/10'
            }`}
          >
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.49006 11.7919C7.37766 12.3267 7.03202 12.7833 6.54775 13.0366C6.01672 13.3143 5.38333 13.3143 4.8523 13.0366C4.36803 12.7833 4.02239 12.3267 3.90999 11.7919L3.87102 11.6065C3.75534 11.0561 3.87948 10.4824 4.21238 10.029L4.27549 9.94309C4.60846 9.48962 5.13744 9.22178 5.70002 9.22178C6.26261 9.22178 6.79158 9.48962 7.12456 9.94309L7.18767 10.029C7.52057 10.4824 7.64471 11.0561 7.52903 11.6065L7.49006 11.7919Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'participants' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.40002 16.8399C2.40002 17.1492 2.65075 17.3999 2.96003 17.3999H6.39322C6.61397 16.4192 7.21453 15.5619 8.06255 15.0195C7.90992 14.9106 7.74197 14.8199 7.56123 14.7509L7.43468 14.7026C6.31753 14.2763 5.08252 14.2763 3.96537 14.7026L3.83882 14.7509C2.97243 15.0815 2.40002 15.9126 2.40002 16.8399Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'participants' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21.04 17.4H17.6068C17.3861 16.4193 16.7856 15.5619 15.9375 15.0195C16.0902 14.9107 16.2581 14.8199 16.4388 14.7509L16.5654 14.7027C17.6825 14.2763 18.9175 14.2763 20.0347 14.7027L20.1612 14.7509C21.0276 15.0816 21.6 15.9127 21.6 16.84C21.6 17.1493 21.3493 17.4 21.04 17.4Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'participants' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16.51 11.792C16.6224 12.3268 16.968 12.7834 17.4523 13.0366C17.9833 13.3144 18.6167 13.3144 19.1478 13.0366C19.632 12.7834 19.9777 12.3268 20.0901 11.792L20.129 11.6066C20.2447 11.0561 20.1206 10.4825 19.7877 10.0291L19.7246 9.94316C19.3916 9.48969 18.8626 9.22184 18.3 9.22184C17.7374 9.22184 17.2085 9.48969 16.8755 9.94316L16.8124 10.0291C16.4795 10.4825 16.3553 11.0561 16.471 11.6066L16.51 11.792Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'participants' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16.74 19.2H7.26003C6.72983 19.2 6.30002 18.7702 6.30002 18.24C6.30002 16.651 7.28292 15.2277 8.76888 14.6649L9.01835 14.5705C10.9395 13.8428 13.0605 13.8428 14.9817 14.5705L15.2312 14.6649C16.7171 15.2277 17.7 16.651 17.7 18.24C17.7 18.7702 17.2702 19.2 16.74 19.2Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'participants' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.5424 11.7234C11.4563 12.1977 12.5438 12.1977 13.4576 11.7234C14.2981 11.2871 14.899 10.4972 15.0952 9.57076L15.1566 9.2808C15.3579 8.32986 15.1423 7.33822 14.5642 6.55681L14.4651 6.42288C13.8868 5.64132 12.9722 5.18028 12 5.18028C11.0278 5.18028 10.1132 5.64132 9.53498 6.42288L9.4359 6.55681C8.85778 7.33822 8.64211 8.32986 8.84347 9.2808L8.90487 9.57076C9.10104 10.4972 9.70191 11.2871 10.5424 11.7234Z"
                fill="currentColor"
                fillOpacity={activeRightPanelTab === 'participants' ? 0.4 : 0.25}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[11px] font-medium leading-none mt-1 select-none">Participants</span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
