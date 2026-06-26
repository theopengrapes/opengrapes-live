import dynamic from 'next/dynamic';

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

// Tldraw uses browser APIs (window, document) that crash during SSR.
// Dynamic import with ssr: false is required for Next.js App Router.
const WhiteboardWrapperInstance = dynamic(() => import('./Whiteboard'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface text-foreground/40">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-primary/50" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Loading whiteboard...</span>
      </div>
    </div>
  ),
});

export default function WhiteboardWrapper(props: WhiteboardProps) {
  return <WhiteboardWrapperInstance {...props} />;
}
