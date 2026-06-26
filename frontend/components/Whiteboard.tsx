'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  isMobile = false
}: WhiteboardProps) {
  // generate a unique client/session ID for this browser connection
  const [clientId] = useState(() => uniqueId());

  // useSync connects to our self-hosted Cloudflare worker sync endpoint
  const wsUri = SYNC_WORKER_URL.replace(/^http/, 'ws');
  const store = useSync({
    uri: `${wsUri}/api/connect/${roomName}?clientSessionId=${clientId}`,

    assets: multiplayerAssetStore,
  });


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
      // Don't overwrite if it already has createdBy (e.g. synced from another user)
      if (shape.meta?.createdBy) {
        return shape;
      }
      const metaUpdate: any = {
        ...shape.meta,
        createdBy: localParticipantRef.current?.identity ?? 'unknown',
      };
      if (activeStrokeIdRef.current !== null) {
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
      colorScheme: 'light',
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

  // Capture active writer coordinates (teacher or writable students)
  useStrokeCapture({ editor, localParticipant, isWritable, activeStrokeIdRef });
  useCursorBroadcast({ editor, localParticipant, isWritable, userName: userName || 'Participant', isTeacher });

  return (
    <div className="w-full h-full relative touch-none" style={{ touchAction: 'none' }}>
      <Tldraw 
        store={store} 
        onMount={handleMount}
        components={whiteboardComponents}
        overrides={whiteboardOverrides}
        overlayUtils={[HiddenCollaboratorCursorOverlayUtil, HiddenCollaboratorHintOverlayUtil]}
      />



      {/* Read-Only Mode Status Badge for Students */}
      {!isTeacher && !isWritable && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c101d]/90 border border-amber-500/30 text-amber-500 backdrop-blur-md rounded-full text-xs font-semibold shadow-lg">
            <svg className="w-3.5 h-3.5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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

      {/* Floating "Resume Following Teacher" Button for Students */}
      <ResumeFollowingButton 
        editor={editor} 
        isTeacher={isTeacher} 
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

function ResumeFollowingButton({ 
  editor, 
  isTeacher, 
  isSidebarOpen, 
  isMobile 
}: { 
  editor: any; 
  isTeacher: boolean; 
  isSidebarOpen: boolean; 
  isMobile: boolean 
}) {
  const [isFollowingTeacher, setIsFollowingTeacher] = useState(false);

  useEffect(() => {
    if (!editor || isTeacher) return;

    const checkAndFollowTeacher = () => {
      const instanceState = editor.getInstanceState();
      const currentFollowing = instanceState.followingUserId;
      const teacher = editor.getCollaborators().find((c: any) => c.userName?.endsWith('(Teacher)'));

      if (teacher) {
        if (!currentFollowing || currentFollowing !== teacher.userId) {
          editor.startFollowingUser(teacher.userId);
          setIsFollowingTeacher(true);
        }
      } else {
        setIsFollowingTeacher(false);
      }
    };

    checkAndFollowTeacher();

    // Listen to remote presence changes
    const cleanupPresence = editor.store.listen(
      () => {
        checkAndFollowTeacher();
      },
      { source: 'remote', scope: 'presence' }
    );

    // Track if user manually stopped following (pans/zooms)
    const cleanupLocalFollow = editor.store.listen(
      () => {
        const instanceState = editor.getInstanceState();
        const teacher = editor.getCollaborators().find((c: any) => c.userName?.endsWith('(Teacher)'));
        setIsFollowingTeacher(!!teacher && instanceState.followingUserId === teacher.userId);
      },
      { scope: 'session', source: 'user' }
    );

    return () => {
      cleanupPresence();
      cleanupLocalFollow();
    };
  }, [editor, isTeacher]);

  if (isTeacher || isFollowingTeacher || !editor) return null;

  const hasTeacher = editor.getCollaborators().some((c: any) => c.userName?.endsWith('(Teacher)'));
  if (!hasTeacher) return null;

  return (
    <button
      onClick={() => {
        const teacher = editor.getCollaborators().find((c: any) => c.userName?.endsWith('(Teacher)'));
        if (teacher) {
          editor.startFollowingUser(teacher.userId);
          setIsFollowingTeacher(true);
        }
      }}
      className="absolute z-40 flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-lg hover:shadow-primary/25 cursor-pointer font-sans transition-all duration-300 border border-primary/20 bottom-4 right-4 md:bottom-6 md:right-6"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      Resume Following Teacher
    </button>
  );
}
