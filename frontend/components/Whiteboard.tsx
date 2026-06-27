'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
const DEBUG_PERF = false;
import { 
  Tldraw, 
  TLAssetStore, 
  uniqueId,
  DefaultMainMenu,
  EditSubmenu, 
  ViewSubmenu, 
  PreferencesGroup, 
  KeyboardShortcutsMenuItem,
  TldrawUiMenuGroup,
  CollaboratorCursorOverlayUtil,
  CollaboratorHintOverlayUtil
} from 'tldraw';

class HiddenCollaboratorCursorOverlayUtil extends CollaboratorCursorOverlayUtil {
  override render() {
    // intentionally draw nothing
  }
}

class HiddenCollaboratorHintOverlayUtil extends CollaboratorHintOverlayUtil {
  override render() {
    // intentionally draw nothing
  }
}
import 'tldraw/tldraw.css';
import { useSync } from '@tldraw/sync';
import { IconPencil as Pen, IconHandStop as Hand } from '@tabler/icons-react';
import { useStrokeCapture } from '../hooks/useStrokeCapture';
import { useCursorBroadcast } from '../hooks/useCursorBroadcast';
import StrokeOverlay from './whiteboard/StrokeOverlay';

interface WhiteboardProps {
  roomName: string;
  userName?: string;
  isTeacher: boolean;
  isWritable: boolean;
  onEditorMount?: (editor: any) => void;
  room?: any;
  localParticipant?: any;
  isSidebarOpen?: boolean;
  isMobile?: boolean;
  globalWhiteboardAllowed?: boolean;
  allowedWhiteboardStudents?: Record<string, boolean>;
}

const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');

// Custom asset store to upload images/videos directly to the Cloudflare Worker (which puts them in R2)
const multiplayerAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    const id = uniqueId();
    const objectName = `${id}-${file.name}`.replace(/[^a-zA-Z0-9.]/g, '-');
    const url = `${SYNC_WORKER_URL}/api/uploads/${objectName}`;

    const response = await fetch(url, {
      method: 'POST',
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload asset: ${response.statusText}`);
    }

    return { src: url };
  },
  resolve(asset) {
    return asset.props.src;
  },
};

// Custom components to hide native PageMenu, MainMenu, SharePanel, PeopleMenu, and HelperButtons
const whiteboardComponents = {
  PageMenu: () => null,
  MainMenu: () => null,
  SharePanel: () => null,
  PeopleMenu: () => null,
  HelperButtons: () => null,
  Toasts: () => null,
  Toolbar: () => null,
  StylePanel: () => null,
  NavigationPanel: () => null,
};

// Custom overrides to remove export, copy-as, upload-media, insert-embed actions, and toggle-focus-mode action
const whiteboardOverrides = {
  actions: (editor: any, actions: any) => {
    const newActions = { ...actions };
    delete newActions['copy-as-svg'];
    delete newActions['copy-as-png'];
    delete newActions['copy-as-json'];
    delete newActions['export-as-svg'];
    delete newActions['export-as-png'];
    delete newActions['export-as-json'];
    delete newActions['insert-media'];
    delete newActions['upload-media'];
    delete newActions['insert-embed'];
    delete newActions['toggle-focus-mode'];
    return newActions;
  },
  toolbar: (editor: any, toolbarItems: any, { tools }: any) => {
    // Filter out the 'media' and 'asset' tools from the bottom toolbar
    return toolbarItems.filter((item: any) => item.id !== 'media' && item.id !== 'asset');
  },
  tools: (editor: any, tools: any) => {
    const newTools = { ...tools };
    // Clear keyboard shortcuts and delete the tools from the UI
    if (newTools['media']) {
      newTools['media'] = {
        ...newTools['media'],
        kbd: '',
      };
    }
    if (newTools['asset']) {
      newTools['asset'] = {
        ...newTools['asset'],
        kbd: '',
      };
    }
    delete newTools['media'];
    delete newTools['asset'];
    return newTools;
  },
  keyboardShortcuts: (editor: any, shortcuts: any) => {
    const newShortcuts = { ...shortcuts };
    // Clear keyboard shortcuts associated with media upload
    delete newShortcuts['insert-media'];
    delete newShortcuts['upload-media'];
    delete newShortcuts['media'];
    delete newShortcuts['asset'];
    return newShortcuts;
  },
};

export default function Whiteboard({ 
  roomName, 
  userName, 
  isTeacher, 
  isWritable, 
  onEditorMount,
  room,
  localParticipant,
  isSidebarOpen = false,
  isMobile = false,
  globalWhiteboardAllowed = false,
  allowedWhiteboardStudents = {} as Record<string, boolean>
}: WhiteboardProps) {
  // generate a unique client/session ID for this browser connection
  const [clientId] = useState(() => uniqueId());

  // useSync connects to our self-hosted Cloudflare worker sync endpoint
  const wsUri = SYNC_WORKER_URL.replace(/^http/, 'ws');
  const store = useSync({
    uri: `${wsUri}/api/connect/${roomName}?clientSessionId=${clientId}`,

    assets: multiplayerAssetStore,
  });

  // Warm up DO on session start
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const OriginalWebSocket = window.WebSocket;

    class WarmupWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        
        const urlStr = url.toString();
        if (urlStr.includes('/api/connect/')) {
          this.addEventListener('open', () => {
            try {
              this.send(JSON.stringify({ type: 'warmup' }));
              console.log('[Whiteboard] Sent warmup message to Durable Object.');
            } catch (err) {
              console.error('[Whiteboard] Failed to send warmup message:', err);
            }
          });
        }
      }
    }

    window.WebSocket = WarmupWebSocket as any;

    return () => {
      window.WebSocket = OriginalWebSocket;
    };
  }, []);

  const [editor, setEditor] = useState<any>(null);

  const localParticipantRef = useRef(localParticipant);
  const activeStrokeIdRef = useRef<string | null>(null);
  const isTeacherRef = useRef(isTeacher);
  const isWritableRef = useRef(isWritable);

  const stylusMode = true;
  const stylusModeRef = { current: true };
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const previousToolRef = useRef<string | null>(null);

  // Keep refs up-to-date
  useEffect(() => {
    localParticipantRef.current = localParticipant;
  }, [localParticipant]);

  useEffect(() => {
    isTeacherRef.current = isTeacher;
  }, [isTeacher]);

  useEffect(() => {
    isWritableRef.current = isWritable;
  }, [isWritable]);

  const handleMount = useCallback((editorInstance: any) => {
    setEditor(editorInstance);

    // Default to Hand tool and clear active selections if student starts in read-only mode
    const targetWritable = isTeacherRef.current || isWritableRef.current;
    if (!targetWritable) {
      editorInstance.setCurrentTool('hand');
      editorInstance.selectNone();
    }

    // Register side effects for shape permission & ownership
    editorInstance.sideEffects.registerBeforeCreateHandler('shape', (shape: any, source: any) => {
      if (source === 'remote') {
        return shape;
      }
      // Don't overwrite if it already has strokeId (e.g. synced from another user)
      if (shape.meta?.strokeId) {
        return shape;
      }
      const metaUpdate: any = {
        ...shape.meta,
        createdBy: localParticipantRef.current?.identity ?? 'unknown',
      };
      if (shape.type === 'draw') {
        const strokeId = `${localParticipantRef.current?.identity ?? 'unknown'}-${Date.now()}`;
        metaUpdate.strokeId = strokeId;
        activeStrokeIdRef.current = strokeId;
      } else if (activeStrokeIdRef.current !== null) {
        metaUpdate.strokeId = activeStrokeIdRef.current;
      }
      return {
        ...shape,
        meta: metaUpdate,
      };
    });

    editorInstance.sideEffects.registerBeforeChangeHandler('shape', (prev: any, next: any, source: any) => {
      if (source === 'remote') {
        return next;
      }
      if (isTeacherRef.current) {
        return next;
      }
      const createdBy = prev.meta?.createdBy || 'unknown';
      const myIdentity = localParticipantRef.current?.identity || 'unknown';
      if (createdBy !== myIdentity) {
        return prev;
      }
      return next;
    });

    editorInstance.sideEffects.registerBeforeDeleteHandler('shape', (shape: any, source: any) => {
      // Prevent eraser tool from deleting images or frames
      if (editorInstance.getCurrentToolId() === 'eraser') {
        if (shape.type === 'image' || shape.type === 'frame') {
          return false;
        }
      }

      if (source === 'remote') {
        return true;
      }
      if (isTeacherRef.current) {
        return true;
      }
      const createdBy = shape.meta?.createdBy || 'unknown';
      const myIdentity = localParticipantRef.current?.identity || 'unknown';
      if (createdBy !== myIdentity) {
        return false;
      }
      return true;
    });

    if (onEditorMount) {
      onEditorMount(editorInstance);
    }
  }, [onEditorMount]);

  // Temporary Performance Instrumentation (to be removed after diagnosis)
  useEffect(() => {
    if (!DEBUG_PERF) return;
    if (!editor || typeof window === 'undefined') return;

    console.log('[PERF_MONITOR] Initializing whiteboard sync performance monitors...');

    const OriginalWebSocket = window.WebSocket;

    class InstrumentedWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        console.log(`[PERF_MONITOR][WS Connect] Connected to: ${url}`);

        const originalSend = this.send;
        this.send = function (data: any) {
          const sendTime = Date.now();
          let size = 0;
          if (typeof data === 'string') size = data.length;
          else if (data instanceof ArrayBuffer) size = data.byteLength;
          else if (data instanceof Blob) size = data.size;

          console.log(`[PERF_MONITOR][WS Send] time: ${sendTime}, size: ${size} bytes`);
          return originalSend.call(this, data);
        };

        this.addEventListener('message', (event) => {
          const recvTime = performance.now();
          let size = 0;
          if (typeof event.data === 'string') size = event.data.length;
          else if (event.data instanceof ArrayBuffer) size = event.data.byteLength;
          else if (event.data instanceof Blob) size = event.data.size;

          console.log(`[PERF_MONITOR][WS Recv] time: ${Date.now()}, size: ${size} bytes`);
          (window as any).__lastWsRecvTime = recvTime;
        });
      }
    }

    window.WebSocket = InstrumentedWebSocket as any;

    const cleanupStore = editor.store.listen((event: any) => {
      const now = Date.now();
      const perfNow = performance.now();

      if (event.source === 'remote') {
        const lastRecv = (window as any).__lastWsRecvTime;
        if (lastRecv) {
          const processingDuration = perfNow - lastRecv;
          console.log(`[PERF_MONITOR][Remote Apply] time: ${now}, processing time: ${processingDuration.toFixed(2)}ms`);
        }

        if (event.changes.added) {
          Object.values(event.changes.added).forEach((shape: any) => {
            if (shape.meta && shape.meta.sentAt) {
              const latency = now - shape.meta.sentAt;
              console.log(`[PERF_MONITOR][Latency E2E Add] Shape: ${shape.id}, Latency: ${latency}ms`);
            }
          });
        }
        if (event.changes.updated) {
          Object.values(event.changes.updated).forEach(([prev, curr]: any) => {
            if (curr.meta && curr.meta.sentAt) {
              const latency = now - curr.meta.sentAt;
              console.log(`[PERF_MONITOR][Latency E2E Update] Shape: ${curr.id}, Latency: ${latency}ms`);
            }
          });
        }
      }

      if (event.source === 'user') {
        let modified = false;
        editor.run(() => {
          if (event.changes.added) {
            Object.values(event.changes.added).forEach((shape: any) => {
              if (shape.type !== 'pointer' && (!shape.meta || !shape.meta.sentAt)) {
                editor.updateShape({
                  id: shape.id,
                  meta: { ...shape.meta, sentAt: now }
                });
                modified = true;
              }
            });
          }
          if (event.changes.updated) {
            Object.values(event.changes.updated).forEach(([prev, curr]: any) => {
              if (curr.type !== 'pointer' && (!curr.meta || curr.meta.sentAt !== now)) {
                editor.updateShape({
                  id: curr.id,
                  meta: { ...curr.meta, sentAt: now }
                });
                modified = true;
              }
            });
          }
        });
        if (modified) {
          console.log(`[PERF_MONITOR][Local Send Timestamp Injected] time: ${now}`);
        }
      }
    }, { scope: 'document' });

    return () => {
      window.WebSocket = OriginalWebSocket;
      cleanupStore();
      console.log('[PERF_MONITOR] Whiteboard sync performance monitors cleaned up.');
    };
  }, [editor]);

  // Set the user name and keyboard shortcut preferences in Tldraw
  useEffect(() => {
    if (!editor || !userName) return;
    const nameToSet = isTeacher ? `${userName} (Teacher)` : userName;
    const targetWritable = isTeacher || isWritable;
    editor.user.updateUserPreferences({
      name: nameToSet,
      areKeyboardShortcutsEnabled: targetWritable,
    });
  }, [editor, userName, isTeacher, isWritable]);

  // Enforce read-only and focus modes based on permissions
  const lastAppliedWritable = useRef<boolean | null>(null);
  useEffect(() => {
    if (!editor) return;
    const targetWritable = isTeacher || isWritable;
    if (lastAppliedWritable.current !== targetWritable) {
      editor.updateInstanceState({
        isReadonly: !targetWritable,
        isFocusMode: !targetWritable,
      });

      // Lock read-only students to Hand tool and clear any active selections
      if (!targetWritable) {
        editor.setCurrentTool('hand');
        editor.selectNone();
      }

      lastAppliedWritable.current = targetWritable;
    }
  }, [editor, isTeacher, isWritable]);

  // Camera and zoom confinement logic
  useEffect(() => {
    if (!editor) return;

    let isClamping = false;
    const maxYRef = { current: 810 };

    const updateMaxY = () => {
      const frames = editor.getCurrentPageShapes().filter((s: any) => s.type === 'frame');
      maxYRef.current = frames.length > 0
        ? frames.reduce((max: number, f: any) => {
            const h = (f.props.h as number) ?? 810;
            return Math.max(max, f.y + h);
          }, 0)
        : 810;
    };

    const clampCamera = () => {
      if (isClamping) return;

      // Skip clamping if the user is a participant and currently following the teacher
      const instanceState = editor.getInstanceState();
      if (!isTeacher && instanceState?.followingUserId) {
        return;
      }

      const camera = editor.getCamera();
      const screen = editor.getViewportScreenBounds();
      if (!screen || screen.width === 0 || screen.height === 0) return;

      // 1. Calculate boundaries (100px padding from all 4 directions)
      const minCanvasX = -100;
      const maxCanvasX = 1440 + 100;

      const minCanvasY = -100;
      const maxCanvasY = maxYRef.current + 100;

      // 2. Clamp Zoom
      const minZoomX = screen.width / (maxCanvasX - minCanvasX);
      const minZoomY = screen.height / (maxCanvasY - minCanvasY);
      
      // We clamp zoom to be at least minZoomX and minZoomY so they can't zoom out past the pages
      const MAX_ZOOM = 4;
      let clampedZ = Math.max(camera.z, minZoomX, minZoomY);
      clampedZ = Math.min(clampedZ, MAX_ZOOM);

      // 3. Clamp Positions
      const viewportWidthInCanvas = screen.width / clampedZ;
      const viewportHeightInCanvas = screen.height / clampedZ;

      // Current viewport top-left in page (canvas) coordinates
      const viewX = -camera.x;
      const viewY = -camera.y;

      let clampedViewX = viewX;
      if (viewportWidthInCanvas > (maxCanvasX - minCanvasX)) {
        clampedViewX = minCanvasX + (maxCanvasX - minCanvasX - viewportWidthInCanvas) / 2;
      } else {
        clampedViewX = Math.max(minCanvasX, Math.min(maxCanvasX - viewportWidthInCanvas, viewX));
      }

      let clampedViewY = viewY;
      if (viewportHeightInCanvas > (maxCanvasY - minCanvasY)) {
        clampedViewY = minCanvasY + (maxCanvasY - minCanvasY - viewportHeightInCanvas) / 2;
      } else {
        clampedViewY = Math.max(minCanvasY, Math.min(maxCanvasY - viewportHeightInCanvas, viewY));
      }

      const clampedX = -clampedViewX;
      const clampedY = -clampedViewY;

      // 4. Update if changed
      const EPSILON = 0.01;
      if (
        Math.abs(camera.x - clampedX) > EPSILON ||
        Math.abs(camera.y - clampedY) > EPSILON ||
        Math.abs(camera.z - clampedZ) > EPSILON
      ) {
        isClamping = true;
        try {
          editor.setCamera({ x: clampedX, y: clampedY, z: clampedZ });
        } finally {
          isClamping = false;
        }
      }
    };

    // Run clamp on mount or whenever editor changes
    updateMaxY();
    clampCamera();

    // Invalidate/update cache and re-clamp when frames change in document
    const cleanupFrames = editor.store.listen(
      (event: any) => {
        const hasAddedFrame = event.changes.added && 
          Object.values(event.changes.added).some((s: any) => s.typeName === 'shape' && s.type === 'frame');
        const hasRemovedFrame = event.changes.removed && 
          Object.values(event.changes.removed).some((s: any) => s.typeName === 'shape' && s.type === 'frame');
        const hasUpdatedFrame = event.changes.updated && 
          Object.values(event.changes.updated).some(([prev, curr]: any) => curr.typeName === 'shape' && curr.type === 'frame');

        if (hasAddedFrame || hasRemovedFrame || hasUpdatedFrame) {
          updateMaxY();
          clampCamera();
        }
      },
      { scope: 'document' }
    );

    // clampCamera only re-runs when the LOCAL user pans/zooms their own camera.
    const cleanupCamera = editor.store.listen(
      () => {
        clampCamera();
      },
      { scope: 'session', source: 'user' }
    );

    return () => {
      cleanupFrames();
      cleanupCamera();
    };
  }, [editor]);

  // Enforce shape selection permissions:
  // 1. Read-only students cannot select any shapes on the whiteboard.
  // 2. Editor students can only select shapes they created (cannot select teacher's drawings).
  useEffect(() => {
    if (!editor) return;

    const cleanupSelection = editor.store.listen((event: any) => {
      if (event.source === 'user') {
        if (isTeacherRef.current) return;

        const selectedIds = editor.getSelectedShapeIds();
        if (selectedIds.length === 0) return;

        const targetWritable = isTeacherRef.current || isWritableRef.current;
        if (!targetWritable) {
          editor.selectNone();
          return;
        }

        const myIdentity = localParticipantRef.current?.identity || 'unknown';
        const allowedIds = selectedIds.filter((id: string) => {
          const shape = editor.getShape(id);
          return shape && shape.meta?.createdBy === myIdentity;
        });

        if (allowedIds.length !== selectedIds.length) {
          if (allowedIds.length === 0) {
            editor.selectNone();
          } else {
            editor.select(...allowedIds);
          }
        }
      }
    }, { scope: 'session' });

    return () => {
      cleanupSelection();
    };
  }, [editor]);

  // Overrides for separating Apple Pencil (pen) and finger touch (touch) inputs
  useEffect(() => {
    if (!editor) return;

    const handleBeforeEvent = (info: any) => {
      if (info.type !== 'pointer') return;

      const pointerType = info.pointerType || info.srcEvent?.pointerType;
      const pointerId = info.pointerId ?? info.srcEvent?.pointerId;

      // If stylus pen is used and we are currently in hand tool but have a saved previous tool, restore it immediately
      if (pointerType === 'pen') {
        if (editor.getCurrentToolId() === 'hand' && previousToolRef.current) {
          editor.setCurrentTool(previousToolRef.current);
          previousToolRef.current = null;
        }
      }

      if (stylusModeRef.current && pointerType === 'touch') {
        if (info.name === 'pointer_down') {
          if (pointerId !== undefined) {
            activeTouchPointersRef.current.add(pointerId);
          }

          const currentTool = editor.getCurrentToolId();
          if (currentTool !== 'hand' && !previousToolRef.current) {
            previousToolRef.current = currentTool;
            editor.setCurrentTool('hand');
          }
        }
      }
    };

    const handleEvent = (info: any) => {
      if (info.type !== 'pointer') return;

      const pointerType = info.pointerType || info.srcEvent?.pointerType;
      const pointerId = info.pointerId ?? info.srcEvent?.pointerId;

      if (stylusModeRef.current && pointerType === 'touch') {
        if (info.name === 'pointer_up' || info.name === 'pointer_cancel') {
          if (pointerId !== undefined) {
            activeTouchPointersRef.current.delete(pointerId);
          }

          if (activeTouchPointersRef.current.size === 0 && previousToolRef.current) {
            editor.setCurrentTool(previousToolRef.current);
            previousToolRef.current = null;
          }
        }
      }
    };

    editor.on('before-event', handleBeforeEvent);
    editor.on('event', handleEvent);

    return () => {
      editor.off('before-event', handleBeforeEvent);
      editor.off('event', handleEvent);
    };
  }, [editor]);

  const getShapeVisibility = useCallback((shape: any) => {
    const isMyShape = shape.meta?.createdBy === localParticipantRef.current?.identity;
    if (!isMyShape && shape.meta?.strokeId && shape.props?.isComplete === false) {
      return 'hidden';
    }
    return 'inherit';
  }, []);

  // Capture active writer coordinates (teacher or writable students)
  useStrokeCapture({ editor, localParticipant, isWritable, activeStrokeIdRef });
  useCursorBroadcast({ editor, localParticipant, isWritable, userName: userName || 'Participant', isTeacher });

  return (
    <div
      className="w-full h-full relative touch-none"
      style={{ touchAction: "none" }}
    >
      <Tldraw
        store={store}
        onMount={handleMount}
        components={whiteboardComponents}
        overrides={whiteboardOverrides}
        overlayUtils={[
          HiddenCollaboratorCursorOverlayUtil,
          HiddenCollaboratorHintOverlayUtil,
        ]}
        getShapeVisibility={getShapeVisibility}
        licenseKey="tldraw-2026-10-04/WyJuVUp6Z2RVOSIsWyIqIl0sMTYsIjIwMjYtMTAtMDQiXQ.zXszL8E54vL/Z2ZhQnXogE9n9sFkAz4jBMrR81a4ILvlXAQCR6H1J3tk/SXzk73DrP8QmDcwm2AUbsMWpstNuQ"
      />

      {/* Read-Only Mode Status Badge for Students */}
      {!isTeacher && !isWritable && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c101d]/90 border border-amber-500/30 text-amber-500 backdrop-blur-md rounded-full text-xs font-semibold shadow-lg">
            <svg
              className="w-3.5 h-3.5 animate-pulse"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span>Read-Only View</span>
          </div>
        </div>
      )}

      {/* Stroke Overlay Canvas */}
      <StrokeOverlay
        editor={editor}
        room={room}
        localParticipant={localParticipant}
      />

      {/* Empty Whiteboard Placeholder Overlay */}
      <EmptyWhiteboardOverlay editor={editor} isTeacher={isTeacher} />

      {/* Floating Follow active whiteboard editors Split-Button */}
      <FollowManagerButton
        editor={editor}
        isTeacher={isTeacher}
        isWritable={isWritable}
        room={room}
        globalWhiteboardAllowed={globalWhiteboardAllowed}
        allowedWhiteboardStudents={allowedWhiteboardStudents}
        isSidebarOpen={isSidebarOpen}
        isMobile={isMobile}
      />
    </div>
  );
}

function EmptyWhiteboardOverlay({ editor, isTeacher }: { editor: any; isTeacher: boolean }) {
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!editor) return;

    const checkEmpty = () => {
      const frames = editor.getCurrentPageShapes().filter((s: any) => s.type === 'frame');
      setIsEmpty(frames.length === 0);
    };

    checkEmpty();

    const cleanup = editor.store.listen((event: any) => {
      checkEmpty();
    }, { scope: 'document' });

    return () => {
      cleanup();
    };
  }, [editor]);

  if (!isEmpty) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50/50 pointer-events-none z-40 animate-in fade-in duration-200">
      <div className="text-center p-6 max-w-sm rounded-2xl bg-white/85 border border-zinc-300 shadow-md backdrop-blur-md">
        <p className="text-sm font-semibold text-zinc-500 font-sans leading-relaxed">
          {isTeacher 
            ? "Click on + Add page to start writing"
            : "Waiting for the teacher to start writing..."}
        </p>
      </div>
    </div>
  );
}

interface FollowManagerButtonProps {
  editor: any;
  isTeacher: boolean;
  isWritable: boolean;
  room: any;
  globalWhiteboardAllowed: boolean;
  allowedWhiteboardStudents: Record<string, boolean>;
  isSidebarOpen: boolean;
  isMobile: boolean;
}

function FollowManagerButton({
  editor,
  isTeacher,
  isWritable,
  room,
  globalWhiteboardAllowed,
  allowedWhiteboardStudents,
  isSidebarOpen,
  isMobile,
}: FollowManagerButtonProps) {
  const [followingTarget, setFollowingTarget] = useState<{ userId: string; userName: string } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const lastTargetIdRef = useRef<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // 1. Calculate active remote whiteboard editors
  const collaborators = editor?.getCollaborators() || [];
  const teacher = collaborators.find((c: any) => c.userName?.endsWith('(Teacher)'));

  const remoteStudentWriters = collaborators.filter((c: any) => {
    if (!c.userName) return false;
    if (c.userName.endsWith('(Teacher)')) return false;
    if (globalWhiteboardAllowed) return true;

    const participant = Array.from(room?.remoteParticipants?.values() || [])
      .find((p: any) => p.name === c.userName || p.identity === c.userName) as any;
    return participant ? !!allowedWhiteboardStudents?.[participant.identity] : false;
  });

  const hasRemoteStudentWriters = remoteStudentWriters.length > 0;

  // 2. Compute list of followable targets for the local user
  const followableTargets = useMemo(() => {
    const list: { userId: string; userName: string }[] = [];
    if (isTeacher) {
      remoteStudentWriters.forEach((c: any) => {
        list.push({ userId: c.userId, userName: c.userName });
      });
    } else if (isWritable) {
      if (teacher) {
        list.push({ userId: teacher.userId, userName: teacher.userName });
      }
    } else {
      if (teacher) {
        list.push({ userId: teacher.userId, userName: teacher.userName });
      }
      remoteStudentWriters.forEach((c: any) => {
        list.push({ userId: c.userId, userName: c.userName });
      });
    }
    return list;
  }, [isTeacher, isWritable, teacher, remoteStudentWriters]);

  // 3. Keep target state synced with available list
  useEffect(() => {
    if (followableTargets.length === 0) {
      setFollowingTarget(null);
      return;
    }

    const isCurrentTargetValid = followingTarget && followableTargets.some(t => t.userId === followingTarget.userId);
    if (!isCurrentTargetValid) {
      const defaultTarget = followableTargets.find(t => t.userName.endsWith('(Teacher)')) || followableTargets[0];
      setFollowingTarget(defaultTarget);
    }
  }, [followableTargets, followingTarget]);

  // 4. Track if we are actively following the target
  useEffect(() => {
    if (!editor || !followingTarget) {
      setIsFollowing(false);
      return;
    }

    const updateFollowState = () => {
      const instanceState = editor.getInstanceState();
      setIsFollowing(instanceState.followingUserId === followingTarget.userId);
    };

    updateFollowState();
    const cleanup = editor.store.listen(updateFollowState, { scope: 'session' });
    return () => cleanup();
  }, [editor, followingTarget]);

  // 5. Auto-follow on target change/mount
  useEffect(() => {
    if (!editor || !followingTarget) return;

    if (lastTargetIdRef.current !== followingTarget.userId) {
      lastTargetIdRef.current = followingTarget.userId;
      editor.startFollowingUser(followingTarget.userId);
      setIsFollowing(true);
    }
  }, [editor, followingTarget]);

  // 6. Handle click outside dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [isDropdownOpen]);

  // 7. Check visibility rules
  if (!editor || !followingTarget) return null;

  // Case A: Only Teacher is writing
  if (!hasRemoteStudentWriters) {
    if (isTeacher) return null; // Teacher does not need to follow anyone
    if (isFollowing) return null; // Auto-hide for student if actively following
  } else {
    // Case B: Student(s) also have edit permission
    if (isTeacher && followableTargets.length === 0) return null;
    if (isWritable && !isTeacher && isFollowing) return null; // Editor student auto-hides when following the teacher
  }

  const showChevron = followableTargets.length > 1;

  const handleFollowClick = () => {
    editor.startFollowingUser(followingTarget.userId);
    setIsFollowing(true);
  };

  const handleSelectTarget = (target: { userId: string; userName: string }) => {
    setFollowingTarget(target);
    setIsDropdownOpen(false);
  };

  const cleanName = (name: string) => {
    return name.replace(/\s*\(Teacher\)\s*$/, '');
  };

  return (
    <div 
      ref={dropdownRef}
      className={`absolute z-40 flex items-center rounded-xl shadow-lg border font-sans transition-all duration-300 bottom-4 right-4 md:bottom-6 md:right-6 overflow-hidden ${
        isFollowing 
          ? 'bg-[#0c101d]/80 hover:bg-[#0c101d]/90 text-white/90 border-white/10 backdrop-blur-md shadow-black/20' 
          : 'bg-primary hover:bg-primary-hover text-white border-primary/20 shadow-primary/25'
      }`}
    >
      <button
        onClick={handleFollowClick}
        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-colors duration-200 ${
          showChevron 
            ? isFollowing 
              ? 'border-r border-white/10 hover:bg-white/5' 
              : 'border-r border-white/20 hover:bg-black/10' 
            : isFollowing 
              ? 'hover:bg-white/5' 
              : 'hover:bg-black/10'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span>
          {isFollowing ? 'Following' : 'Resume Following'} {cleanName(followingTarget.userName)}
        </span>
      </button>

      {showChevron && (
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`px-3 py-2.5 cursor-pointer flex items-center justify-center transition-colors duration-200 ${
            isFollowing ? 'hover:bg-white/5' : 'hover:bg-black/10'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}

      {isDropdownOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
          <div className="px-3.5 py-2 border-b border-zinc-150 dark:border-zinc-800 text-[10px] uppercase tracking-wider font-bold text-zinc-400 dark:text-zinc-500">
            Select Editor to Follow
          </div>
          <div className="max-h-48 overflow-y-auto">
            {followableTargets.map((target) => {
              const isCurrent = target.userId === followingTarget.userId;
              return (
                <button
                  key={target.userId}
                  onClick={() => handleSelectTarget(target)}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors duration-150 ${
                    isCurrent 
                      ? 'bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:text-primary-light' 
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>{cleanName(target.userName)}</span>
                  {isCurrent && (
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
