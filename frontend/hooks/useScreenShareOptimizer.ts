import { useEffect, useRef, useState } from 'react';
import { LocalParticipant, LocalVideoTrack, Track } from 'livekit-client';

export type ScreenShareQualityMode = 'low' | 'standard' | 'high';

interface UseScreenShareOptimizerProps {
  localParticipant: LocalParticipant | undefined;
  isScreenShareEnabled: boolean;
  quality: ScreenShareQualityMode;
}

export function useScreenShareOptimizer({
  localParticipant,
  isScreenShareEnabled,
  quality,
}: UseScreenShareOptimizerProps) {
  const [optimizerMode, setOptimizerMode] = useState<'static' | 'motion' | 'disabled'>('disabled');
  const workerRef = useRef<Worker | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const activeTrackRef = useRef<LocalVideoTrack | null>(null);
  const lastModeRef = useRef<'static' | 'motion'>('motion');
  const lastModeTimeRef = useRef<number>(0);
  const rvfcIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Constants for bandwidth presets
  const BITRATE_PRESETS = {
    low: { fps: 10, bitrate: 800_000 },
    standard: { maxFps: 30, staticFps: 5, bitrate: 2_000_000 },
    high: { maxFps: 30, staticFps: 5, bitrate: 3_000_000 },
  };

  // Safe helper to apply WebRTC framerate and bitrate constraints
  const applyConstraints = async (
    track: LocalVideoTrack,
    fps: number,
    bitrateBps: number
  ) => {
    // 1. FrameRate constraint (applied at browser capture driver layer)
    try {
      const currentConstraints = track.mediaStreamTrack.getConstraints();
      if (currentConstraints.frameRate !== fps) {
        await track.mediaStreamTrack.applyConstraints({ frameRate: fps });
      }
    } catch (err) {
      console.warn('[ScreenShareOptimizer] Failed to apply frameRate constraint:', err);
    }

    // 2. MaxBitrate constraint (applied at RTCRtpSender WebRTC encoding layer)
    try {
      const sender = track.sender;
      if (sender) {
        const params = sender.getParameters();
        if (params.encodings && params.encodings[0]) {
          const currentBitrate = params.encodings[0].maxBitrate;
          if (currentBitrate !== bitrateBps) {
            params.encodings[0].maxBitrate = bitrateBps;
            await sender.setParameters(params);
            console.log(
              `[ScreenShareOptimizer] Dynamic constraint applied: FPS = ${fps}, MaxBitrate = ${bitrateBps / 1000} Kbps`
            );
          }
        }
      }
    } catch (err) {
      console.warn('[ScreenShareOptimizer] Failed to set maxBitrate on sender:', err);
    }
  };

  // Main optimization coordinator effect
  useEffect(() => {
    // Feature flag check (check localStorage)
    const isFeatureEnabled =
      typeof window !== 'undefined' &&
      localStorage.getItem('enableEnhancedScreenShare') !== 'false';

    if (!isFeatureEnabled || !isScreenShareEnabled || !localParticipant) {
      cleanup();
      setOptimizerMode('disabled');
      return;
    }

    // Find the screenshare video track publication
    const screenTrackPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const track = screenTrackPub?.videoTrack as LocalVideoTrack | undefined;

    if (!track) {
      // Re-check in a short while if track isn't ready immediately
      const checkTimeout = setTimeout(() => {
        const retryPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const retryTrack = retryPub?.videoTrack as LocalVideoTrack | undefined;
        if (retryTrack) {
          activeTrackRef.current = retryTrack;
          initializeOptimizer(retryTrack);
        }
      }, 500);
      return () => clearTimeout(checkTimeout);
    }

    activeTrackRef.current = track;
    initializeOptimizer(track);

    return () => {
      cleanup();
    };
  }, [localParticipant, isScreenShareEnabled]);

  // Apply new quality constraints dynamically when user changes mode mid-stream
  useEffect(() => {
    const track = activeTrackRef.current;
    if (!track) return;

    if (quality === 'low') {
      // Lock to low presets and disable worker monitoring adjustments
      applyConstraints(track, BITRATE_PRESETS.low.fps, BITRATE_PRESETS.low.bitrate);
      setOptimizerMode('static');
      
      // Stop dynamic loops
      if (rvfcIdRef.current && videoElementRef.current) {
        if ('cancelVideoFrameCallback' in videoElementRef.current) {
          (videoElementRef.current as any).cancelVideoFrameCallback(rvfcIdRef.current);
        }
        rvfcIdRef.current = null;
      }
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    } else {
      // Re-apply standard/high constraints based on last observed frame mode
      const preset = BITRATE_PRESETS[quality === 'high' ? 'high' : 'standard'];
      const targetFps = lastModeRef.current === 'static' ? preset.staticFps : preset.maxFps;
      applyConstraints(track, targetFps, preset.bitrate);
      setOptimizerMode(lastModeRef.current);

      // Re-start worker frame sampling loop if it wasn't running
      if (!rvfcIdRef.current && !timeoutIdRef.current && videoElementRef.current) {
        startSamplingLoop();
      }
    }
  }, [quality]);

  // Clean up all resources
  const cleanup = () => {
    // Clear dynamic loops
    if (rvfcIdRef.current && videoElementRef.current) {
      if ('cancelVideoFrameCallback' in videoElementRef.current) {
        (videoElementRef.current as any).cancelVideoFrameCallback(rvfcIdRef.current);
      }
      rvfcIdRef.current = null;
    }
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    // Clean up video element
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.srcObject = null;
      videoElementRef.current = null;
    }

    // Terminate worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    activeTrackRef.current = null;
  };

  // Initialize background worker and hidden video stream
  const initializeOptimizer = (track: LocalVideoTrack) => {
    // If Quality Mode is set to 'low', bypass dynamic analysis and lock to low-bandwidth constraints
    if (quality === 'low') {
      applyConstraints(track, BITRATE_PRESETS.low.fps, BITRATE_PRESETS.low.bitrate);
      setOptimizerMode('static');
      return;
    }

    // Create Web Worker
    try {
      workerRef.current = new Worker('/workers/screenShareWorker.js');
    } catch (err) {
      console.error('[ScreenShareOptimizer] Failed to create Web Worker:', err);
      // Fallback: apply default standard constraints without worker
      applyConstraints(track, BITRATE_PRESETS.standard.maxFps, BITRATE_PRESETS.standard.bitrate);
      return;
    }

    // Setup offscreen video element
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    // Attach stream track
    const stream = new MediaStream([track.mediaStreamTrack]);
    video.srcObject = stream;
    videoElementRef.current = video;

    // Handle worker results
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'result') {
        handleOptimizerResult(e.data.mode);
      }
    };

    video.play()
      .then(() => {
        startSamplingLoop();
      })
      .catch((err) => {
        console.warn('[ScreenShareOptimizer] Video element play failed:', err);
      });
  };

  // Throttled frame sampling loop
  const startSamplingLoop = () => {
    const video = videoElementRef.current;
    if (!video || !workerRef.current) return;

    let lastSampleTime = 0;
    const sampleInterval = 500; // Sample every 500ms (2Hz)

    const processFrame = () => {
      const now = performance.now();
      const videoTrack = activeTrackRef.current;

      if (!video || !workerRef.current || !videoTrack) return;

      // Ensure we maintain the 500ms throttle
      if (now - lastSampleTime >= sampleInterval) {
        lastSampleTime = now;

        if (video.videoWidth > 0 && video.videoHeight > 0) {
          // Grab current frame as an ImageBitmap (fast offscreen GPU capture)
          createImageBitmap(video)
            .then((bitmap) => {
              if (workerRef.current) {
                // Transfer bitmap ownership to Worker to prevent copying memory
                workerRef.current.postMessage(
                  { type: 'analyze', imageBitmap: bitmap },
                  [bitmap]
                );
              } else {
                bitmap.close();
              }
            })
            .catch(() => {
              // Fail silently on frame capture errors (e.g. if tab is minimized)
            });
        }
      }

      // Re-queue next frame callback
      if ('requestVideoFrameCallback' in video) {
        rvfcIdRef.current = (video as any).requestVideoFrameCallback(processFrame);
      } else {
        timeoutIdRef.current = setTimeout(processFrame, 1000 / 30); // 30 FPS polling fallback
      }
    };

    if ('requestVideoFrameCallback' in video) {
      rvfcIdRef.current = (video as any).requestVideoFrameCallback(processFrame);
    } else {
      timeoutIdRef.current = setTimeout(processFrame, 1000 / 30);
    }
  };

  // Process worker result and apply dynamic constraints (FPS only to avoid stutters)
  const handleOptimizerResult = (mode: 'static' | 'motion' | 'scene-change') => {
    const track = activeTrackRef.current;
    if (!track) return;

    const preset = BITRATE_PRESETS[quality === 'high' ? 'high' : 'standard'];
    const now = Date.now();

    // Scene changes (e.g. Alt-Tab) are debounced to prevent visual oscillation
    if (mode === 'scene-change') {
      return;
    }

    // Cooldown logic: enforce minimum 5 seconds on static mode to avoid constant FPS flip-flopping
    if (mode !== lastModeRef.current) {
      if (mode === 'static' && now - lastModeTimeRef.current < 5000) {
        return; // static cooldown active
      }
      
      lastModeRef.current = mode;
      lastModeTimeRef.current = now;
      setOptimizerMode(mode);
    }

    // Apply computed constraints
    const targetFps = mode === 'static' ? preset.staticFps : preset.maxFps;
    applyConstraints(track, targetFps, preset.bitrate);
  };

  return { optimizerMode };
}
