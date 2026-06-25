'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  IconLayoutDashboard, 
  IconTableSpark, 
  IconLayoutGrid, 
  IconLayoutSidebarRight, 
  IconRectangle, 
  IconChalkboard, 
  IconChalkboardOff, 
  IconPhone,
  IconMessage,
  IconGalaxy,
  IconDots,
  IconLock,
  IconChevronUp,
  IconMicrophone,
  IconMicrophoneOff,
  IconVideo,
  IconVideoOff,
  IconUsers
} from '@tabler/icons-react';
import Tooltip from './Tooltip';

interface MobileControlsProps {
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
  mobileControlsVisible: boolean;
  onHideControls: () => void;

  // Devices info passed from parent
  audioDevices: MediaDeviceInfo[];
  activeAudioId: string;
  setActiveAudioDevice: (id: string) => void;
  videoDevices: MediaDeviceInfo[];
  activeVideoId: string;
  setActiveVideoDevice: (id: string) => void;
}

export default function MobileControls({
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
  mobileControlsVisible,
  onHideControls,
  audioDevices,
  activeAudioId,
  setActiveAudioDevice,
  videoDevices,
  activeVideoId,
  setActiveVideoDevice,
}: MobileControlsProps) {
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close device settings when clicking outside
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

  // Reset collapsible submenus when settings main menu closes
  useEffect(() => {
    if (!showDeviceSettings) {
      setShowDevices(false);
      setShowLayoutMenu(false);
    }
  }, [showDeviceSettings]);

  return (
    <div
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('button') ||
          target.closest('input') ||
          target.closest('select') ||
          target.closest('textarea') ||
          target.closest('[role="button"]') ||
          target.closest('a')
        ) {
          return;
        }
        onHideControls();
      }}
      className={`w-full bg-[#090d1a]/95 border-t border-white/10 px-4 py-2 flex items-center justify-center z-[290] select-none transition-all duration-300 controls-bar fixed bottom-0 left-0 right-0 ${
        mobileControlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: 'calc(4rem + env(safe-area-inset-bottom))'
      }}
    >
      {/* Center side: Meeting controls */}
      <div className="flex items-center gap-2.5 justify-center w-full max-w-lg">
        
        {/* 1. Microphone Toggle */}
        <button
          onClick={toggleMicrophone}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0 ${
            isMicrophoneEnabled
              ? 'bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
        >
          {isMicrophoneEnabled ? (
            <IconMicrophone className="w-5.5 h-5.5" strokeWidth={1.8} />
          ) : (
            <IconMicrophoneOff className="w-5.5 h-5.5" strokeWidth={1.8} />
          )}
        </button>

        {/* 2. Camera Toggle */}
        <button
          onClick={toggleCamera}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0 ${
            isCameraEnabled
              ? 'bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
        >
          {isCameraEnabled ? (
            <IconVideo className="w-5.5 h-5.5" strokeWidth={1.8} />
          ) : (
            <IconVideoOff className="w-5.5 h-5.5" strokeWidth={1.8} />
          )}
        </button>

        {/* 3 & 4. Primary View/Utility Toggles based on Teacher vs Student */}
        {!isTeacher ? (
          <>
            {/* Student Utility: Chat */}
            <button
              onClick={() => setActiveRightPanelTab(activeRightPanelTab === 'chat' ? null : 'chat')}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0 ${
                activeRightPanelTab === 'chat'
                  ? 'bg-primary text-white'
                  : 'bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]'
              }`}
            >
              <IconMessage className="w-5.5 h-5.5" strokeWidth={1.8} />
            </button>

            {/* Student Utility: Ask AI */}
            <button
              onClick={() => setActiveRightPanelTab(activeRightPanelTab === 'doubt' ? null : 'doubt')}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0 ${
                activeRightPanelTab === 'doubt'
                  ? 'bg-primary text-white'
                  : 'bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]'
              }`}
            >
              <IconGalaxy className="w-5.5 h-5.5" strokeWidth={1.8} />
            </button>
          </>
        ) : (
          <>
            {/* Teacher Utility: Whiteboard */}
            <button
              onClick={toggleWhiteboard}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0 ${
                showWhiteboard
                  ? 'bg-primary text-white'
                  : 'bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]'
              }`}
            >
              {showWhiteboard ? (
                <IconChalkboard className="w-5.5 h-5.5" strokeWidth={1.8} />
              ) : (
                <IconChalkboardOff className="w-5.5 h-5.5" strokeWidth={1.8} />
              )}
            </button>

            {/* Teacher Utility: Screenshare */}
            <button
              disabled={!isScreenShareAllowed}
              onClick={toggleScreenShare}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0 ${
                !isScreenShareAllowed
                  ? 'opacity-40 cursor-not-allowed bg-transparent text-[#C2CCDE]/35 border border-white/5 shadow-none'
                  : isScreenShareEnabled
                  ? 'bg-primary text-white'
                  : 'bg-[#2d3139] hover:bg-[#3b3e45] text-[#C2CCDE]'
              }`}
            >
              <svg
                className="w-5.5 h-5.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.80001 4.87677C4.13727 4.87677 3.60001 5.41403 3.60001 6.07677V16.8768H9.63782C9.77103 17.3943 10.2409 17.7768 10.8 17.7768H13.2C13.7592 17.7768 14.229 17.3943 14.3622 16.8768H20.4V6.07677C20.4 5.41403 19.8628 4.87677 19.2 4.87677H4.80001Z"
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
            </button>
          </>
        )}

        {/* 5. Ellipses Toggle (More Options Settings Dropdown Menu) */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setShowDeviceSettings(!showDeviceSettings)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg ${
              showDeviceSettings
                ? 'bg-primary text-white'
                : 'bg-[#2d3139] hover:bg-[#3b3e45] text-white'
            }`}
          >
            <IconDots className="w-5.5 h-5.5" strokeWidth={1.8} />
          </button>

          {/* Collapsible Dropdown Settings Menu */}
          {showDeviceSettings && (
            <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-72 bg-[#0b0f19]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-1 text-[#C2CCDE] z-[300] animate-in fade-in slide-in-from-bottom-2 duration-150 animate-out fade-out duration-150">
              
              {/* Conditional Items inside Ellipses menu for Students */}
              {!isTeacher && (
                <div className="flex flex-col gap-1 border-b border-white/5 pb-1">
                  {/* Student Ellipses Whiteboard Option */}
                  <button
                    onClick={() => {
                      toggleWhiteboard();
                      setShowDeviceSettings(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left text-sm font-semibold select-none ${
                      showWhiteboard ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                    }`}
                  >
                    {showWhiteboard ? (
                      <IconChalkboard className="w-5 h-5" />
                    ) : (
                      <IconChalkboardOff className="w-5 h-5" />
                    )}
                    <span>Whiteboard</span>
                  </button>

                  {/* Student Ellipses Screenshare Option */}
                  <button
                    disabled={!isScreenShareAllowed}
                    onClick={() => {
                      toggleScreenShare();
                      setShowDeviceSettings(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left text-sm font-semibold select-none ${
                      !isScreenShareAllowed
                        ? 'opacity-40 cursor-not-allowed text-[#C2CCDE]/30'
                        : isScreenShareEnabled
                        ? 'text-indigo-400 bg-indigo-500/10 cursor-pointer'
                        : 'text-[#C2CCDE] cursor-pointer'
                    }`}
                  >
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
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
                    <span>Share Screen</span>
                  </button>
                </div>
              )}

              {/* Conditional Items inside Ellipses menu for Teachers */}
              {isTeacher && (
                <div className="flex flex-col gap-1 border-b border-white/5 pb-1">
                  {/* Teacher Ellipses Chat Option */}
                  <button
                    onClick={() => {
                      setActiveRightPanelTab(activeRightPanelTab === 'chat' ? null : 'chat');
                      setShowDeviceSettings(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left text-sm font-semibold select-none ${
                      activeRightPanelTab === 'chat' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                    }`}
                  >
                    <IconMessage className="w-5 h-5" />
                    <span>Chat</span>
                  </button>

                  {/* Teacher Ellipses Doubt Solver Option */}
                  <button
                    onClick={() => {
                      setActiveRightPanelTab(activeRightPanelTab === 'doubt' ? null : 'doubt');
                      setShowDeviceSettings(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left text-sm font-semibold select-none ${
                      activeRightPanelTab === 'doubt' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                    }`}
                  >
                    <IconGalaxy className="w-5 h-5" />
                    <span>Doubts</span>
                  </button>

                  {/* Teacher Ellipses Participants Option */}
                  <button
                    onClick={() => {
                      setActiveRightPanelTab(activeRightPanelTab === 'participants' ? null : 'participants');
                      setShowDeviceSettings(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left text-sm font-semibold select-none ${
                      activeRightPanelTab === 'participants' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                    }`}
                  >
                    <IconUsers className="w-5 h-5" />
                    <span>Participants</span>
                  </button>
                </div>
              )}

              {/* Adjust View Dropdown Collapsible Trigger */}
              <div className="flex flex-col">
                <button
                  onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left text-sm font-semibold select-none text-[#C2CCDE]"
                >
                  <div className="flex items-center gap-3">
                    <IconLayoutDashboard className="w-5 h-5" />
                    <span>Adjust View</span>
                  </div>
                  <IconChevronUp className={`w-4 h-4 transition-transform duration-200 ${showLayoutMenu ? '' : 'rotate-180'}`} />
                </button>

                {showLayoutMenu && (
                  <div className="mx-2 mb-2 p-1.5 grid grid-cols-2 gap-1 border-t border-white/5 pt-1.5 bg-black/20 rounded-xl">
                    <button
                      onClick={() => {
                        setLayoutMode('auto');
                        setShowDeviceSettings(false);
                      }}
                      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-center text-xs font-semibold select-none ${
                        layoutMode === 'auto' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                      }`}
                    >
                      <IconTableSpark className="w-4 h-4" />
                      <span>Auto</span>
                    </button>
                    <button
                      onClick={() => {
                        setLayoutMode('tiled');
                        setShowDeviceSettings(false);
                      }}
                      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-center text-xs font-semibold select-none ${
                        layoutMode === 'tiled' ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#C2CCDE]'
                      }`}
                    >
                      <IconLayoutGrid className="w-4 h-4" />
                      <span>Tiled</span>
                    </button>
                    <button
                      onClick={() => {
                        setLayoutMode('sidebar');
                        setShowDeviceSettings(false);
                      }}
                      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-center text-xs font-semibold select-none ${
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
                          setShowDeviceSettings(false);
                        }
                      }}
                      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-center text-xs font-semibold select-none ${
                        !showSplitLayout
                          ? 'opacity-40 cursor-not-allowed text-[#C2CCDE]/30'
                          : layoutMode === 'focus'
                          ? 'text-indigo-400 bg-indigo-500/10 cursor-pointer'
                          : 'text-[#C2CCDE] cursor-pointer'
                      }`}
                    >
                      <IconRectangle className="w-4 h-4" />
                      <span>Focus</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Device Settings Submenu Collapsible Trigger */}
              <div className="flex flex-col">
                <button
                  onClick={() => setShowDevices(!showDevices)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left text-sm font-semibold select-none text-[#C2CCDE]"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-[#C2CCDE]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1}
                      xmlns="http://www.w3.org/2000/svg"
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
                    <span>Device Settings</span>
                  </div>
                  <IconChevronUp className={`w-4 h-4 transition-transform duration-200 ${showDevices ? '' : 'rotate-180'}`} />
                </button>

                {showDevices && (
                  <div className="mx-2 mb-2 p-3 flex flex-col gap-3 border-t border-white/5 pt-3 bg-black/20 rounded-xl">
                    {/* Microphone selector */}
                    <div className="flex flex-col gap-1 border-b border-white/5 pb-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/50 select-none text-left">
                        Microphone
                      </label>
                      <div className="relative">
                        <select
                          value={activeAudioId}
                          onChange={(e) => setActiveAudioDevice(e.target.value)}
                          className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none pr-8 font-sans font-semibold"
                        >
                          {audioDevices.length === 0 ? (
                            <option value="">No microphones</option>
                          ) : (
                            audioDevices.map((device) => (
                              <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Mic ${device.deviceId.slice(0, 5)}`}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Camera selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#C2CCDE]/50 select-none text-left">
                        Camera
                      </label>
                      <div className="relative">
                        <select
                          value={activeVideoId}
                          onChange={(e) => setActiveVideoDevice(e.target.value)}
                          className="w-full bg-[#161a26] border border-white/10 hover:border-white/20 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer focus:border-primary/50 transition-colors appearance-none pr-8 font-sans font-semibold"
                        >
                          {videoDevices.length === 0 ? (
                            <option value="">No cameras</option>
                          ) : (
                            videoDevices.map((device) => (
                              <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Cam ${device.deviceId.slice(0, 5)}`}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Publish Notes / Download Notes (Teacher) */}
              {isTeacher && (
                <div className="flex flex-col gap-1 border-t border-white/5 pt-1.5 mt-1.5">
                  {exportedPdfUrl ? (
                    <a
                      href={exportedPdfUrl}
                      download={`${roomName}_notes.pdf`}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors cursor-pointer text-center font-sans"
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
                      className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-sans"
                    >
                      {isExporting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Publishing Notes...</span>
                        </>
                      ) : (
                        <span>Publish Notes</span>
                      )}
                    </button>
                  )}
                </div>
              )}

            </div>
          )}
        </div>

        {/* 6. End Call Button (rotated phone icon) */}
        <button
          onClick={onLeave}
          className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-lg shrink-0"
        >
          <IconPhone className="w-5.5 h-5.5 transform rotate-[135deg]" strokeWidth={1.8} />
        </button>

      </div>
    </div>
  );
}
