'use client';

import React from 'react';
import { useMediaDeviceSelect } from '@livekit/components-react';
import DesktopControls from './DesktopControls';
import MobileControls from './MobileControls';

interface ControlsProps {
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
  isMobile?: boolean;
  mobileControlsVisible?: boolean;
  onHideControls?: () => void;
}

export default function Controls({
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
  isMobile = false,
  mobileControlsVisible = true,
  onHideControls,
}: ControlsProps) {
  // Query audio input devices
  const {
    devices: audioDevices,
    activeDeviceId: activeAudioId,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({ kind: 'audioinput', requestPermissions: true });

  // Query video input devices
  const {
    devices: videoDevices,
    activeDeviceId: activeVideoId,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({ kind: 'videoinput', requestPermissions: true });

  if (isMobile) {
    return (
      <MobileControls
        roomName={roomName}
        isMicrophoneEnabled={isMicrophoneEnabled}
        toggleMicrophone={toggleMicrophone}
        isCameraEnabled={isCameraEnabled}
        toggleCamera={toggleCamera}
        isScreenShareEnabled={isScreenShareEnabled}
        toggleScreenShare={toggleScreenShare}
        showWhiteboard={showWhiteboard}
        toggleWhiteboard={toggleWhiteboard}
        isTeacher={isTeacher}
        isExporting={isExporting}
        handleEndClass={handleEndClass}
        onLeave={onLeave}
        exportedPdfUrl={exportedPdfUrl}
        activeRightPanelTab={activeRightPanelTab}
        setActiveRightPanelTab={setActiveRightPanelTab}
        isWhiteboardAllowed={isWhiteboardAllowed}
        isScreenShareAllowed={isScreenShareAllowed}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        showSplitLayout={showSplitLayout}
        mobileControlsVisible={mobileControlsVisible}
        onHideControls={onHideControls || (() => {})}
        audioDevices={audioDevices}
        activeAudioId={activeAudioId || ''}
        setActiveAudioDevice={setActiveAudioDevice}
        videoDevices={videoDevices}
        activeVideoId={activeVideoId || ''}
        setActiveVideoDevice={setActiveVideoDevice}
      />
    );
  }

  return (
    <DesktopControls
      roomName={roomName}
      isMicrophoneEnabled={isMicrophoneEnabled}
      toggleMicrophone={toggleMicrophone}
      isCameraEnabled={isCameraEnabled}
      toggleCamera={toggleCamera}
      isScreenShareEnabled={isScreenShareEnabled}
      toggleScreenShare={toggleScreenShare}
      showWhiteboard={showWhiteboard}
      toggleWhiteboard={toggleWhiteboard}
      isTeacher={isTeacher}
      isExporting={isExporting}
      handleEndClass={handleEndClass}
      onLeave={onLeave}
      exportedPdfUrl={exportedPdfUrl}
      activeRightPanelTab={activeRightPanelTab}
      setActiveRightPanelTab={setActiveRightPanelTab}
      isWhiteboardAllowed={isWhiteboardAllowed}
      isScreenShareAllowed={isScreenShareAllowed}
      layoutMode={layoutMode}
      setLayoutMode={setLayoutMode}
      showSplitLayout={showSplitLayout}
      audioDevices={audioDevices}
      activeAudioId={activeAudioId || ''}
      setActiveAudioDevice={setActiveAudioDevice}
      videoDevices={videoDevices}
      activeVideoId={activeVideoId || ''}
      setActiveVideoDevice={setActiveVideoDevice}
    />
  );
}
