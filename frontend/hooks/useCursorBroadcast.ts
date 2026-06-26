import { useEffect, useRef } from 'react';
import { encodeStrokeMessage, STROKE_TOPIC } from '../lib/whiteboard/stroke-protocol';

interface UseCursorBroadcastProps {
  editor: any;
  localParticipant: any;
  isWritable: boolean;
  userName: string;
  isTeacher: boolean;
}

/**
 * Streams the local user's cursor position to all other participants via
 * LiveKit data channel (lossy). Students see a smooth real-time cursor dot.
 */
export function useCursorBroadcast({
  editor,
  localParticipant,
  isWritable,
  userName,
  isTeacher,
}: UseCursorBroadcastProps) {
  const userNameRef = useRef(userName);
  const lastSentTimeRef = useRef(0);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    if (!editor || !localParticipant || !isWritable) return;

    const handleEvent = (info: any) => {
      if (info.type !== 'pointer') return;
      if (info.name !== 'pointer_move') return;

      const now = Date.now();
      if (now - lastSentTimeRef.current < 25) { // Throttle to 40Hz (25ms interval)
        return;
      }
      lastSentTimeRef.current = now;

      const point = editor.inputs.currentPagePoint;

      // Calculate total participants dynamically from editor collaborators + ourselves
      const collaborators = editor.getCollaborators() || [];
      const numWriters = collaborators.length + 1;

      const payload = encodeStrokeMessage({
        type: 'CURSOR_MOVE',
        userId: localParticipant.identity,
        userName: userNameRef.current || localParticipant.name || localParticipant.identity,
        pageId: editor.getCurrentPageId(),
        x: point.x,
        y: point.y,
        numWriters,
        role: isTeacher ? 'teacher' : 'student',
      });

      // Fire-and-forget, lossy — highest frequency message
      localParticipant.publishData(payload, { reliable: false, topic: STROKE_TOPIC }).catch(() => {});
    };

    editor.on('event', handleEvent);
    return () => {
      editor.off('event', handleEvent);
    };
  }, [editor, localParticipant, isWritable, isTeacher]);
}
