'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';

interface Student {
  id: number;
  name: string;
  email: string;
}

interface ActiveSession {
  roomId: string;
  startedAt: string;
}

interface PastSession {
  roomId: string;
  startedAt: string;
  endedAt: string;
  hasNotes: boolean;
  hasMom?: boolean;
}

interface Batch {
  id: number;
  name: string;
  teacherName: string;
  studentCount: number;
  students: Student[];
  activeSession: ActiveSession | null;
  pastSessions?: PastSession[];
}

const renderBoldText = (text: string) => {
  const parts = text.split('**');
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return <strong key={index} className="font-semibold text-foreground">{part}</strong>;
    }
    return part;
  });
};

const renderMarkdown = (text: string) => {
  return text.split('\n').map((line, idx) => {
    let cleanLine = line.trim();
    if (cleanLine.startsWith('### ')) {
      return <h4 key={idx} className="text-sm font-bold text-foreground mt-3 mb-1">{cleanLine.replace('### ', '')}</h4>;
    }
    if (cleanLine.startsWith('## ')) {
      return <h3 key={idx} className="text-base font-bold text-indigo-400 mt-4 mb-2">{cleanLine.replace('## ', '')}</h3>;
    }
    if (cleanLine.startsWith('# ')) {
      return <h2 key={idx} className="text-lg font-bold text-indigo-400 mt-4 mb-2">{cleanLine.replace('# ', '')}</h2>;
    }
    if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
      const content = cleanLine.substring(2);
      return (
        <li key={idx} className="list-disc ml-5 text-xs text-foreground/80 mb-1 leading-relaxed">
          {renderBoldText(content)}
        </li>
      );
    }
    if (cleanLine.length === 0) {
      return <div key={idx} className="h-2" />;
    }
    return <p key={idx} className="text-xs text-foreground/80 leading-relaxed mb-1.5">{renderBoldText(cleanLine)}</p>;
  });
};

export default function Dashboard() {
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const [selectedMomSessionId, setSelectedMomSessionId] = useState<string | null>(null);
  const [momContent, setMomContent] = useState<string>('');
  const [isMomLoading, setIsMomLoading] = useState<boolean>(false);
  const [momError, setMomError] = useState<string | null>(null);

  const handleOpenMom = async (sessionId: string) => {
    setSelectedMomSessionId(sessionId);
    setIsMomLoading(true);
    setMomContent('');
    setMomError(null);
    try {
      const response = await fetch(`/api/mom/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setMomContent(data.mom || 'No notes found for this session.');
      } else {
        const data = await response.json();
        setMomError(data.error || 'Failed to load class summary.');
      }
    } catch (err) {
      console.error('Error fetching MoM:', err);
      setMomError('Error connecting to server.');
    } finally {
      setIsMomLoading(false);
    }
  };

  // Redirect to home if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Fetch batches helper
  const fetchBatches = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsFetching(true);
    try {
      const response = await fetch('/api/my-batches', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setBatches(data.batches || []);
      }
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      if (showLoading) setIsFetching(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    if (token) {
      fetchBatches(true);
      const interval = setInterval(() => {
        fetchBatches(false);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const handleStartClass = async (batchId: number) => {
    if (!token) return;
    setActionLoadingId(batchId);
    try {
      const response = await fetch('/api/start-class', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ batchId })
      });
      const data = await response.json();
      if (response.ok) {
        // Redirect using the one-time code returned by the updated API
        const liveClassroomBase = process.env.NEXT_PUBLIC_LIVE_CLASSROOM_URL || window.location.origin;
        const targetUrl = `${liveClassroomBase}/?roomId=${encodeURIComponent(data.roomId)}&code=${encodeURIComponent(data.code)}`;
        window.location.href = targetUrl;
      } else {
        alert(data.error || 'Failed to start class');
      }
    } catch (error) {
      console.error('Error starting class:', error);
      alert('Error starting class');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleJoinClass = async (batchId: number) => {
    if (!token) return;
    setActionLoadingId(batchId);
    try {
      const response = await fetch('/api/join-class', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ batchId })
      });
      const data = await response.json();
      if (response.ok) {
        // Redirect using the one-time code returned by the updated API
        const liveClassroomBase = process.env.NEXT_PUBLIC_LIVE_CLASSROOM_URL || window.location.origin;
        const targetUrl = `${liveClassroomBase}/?roomId=${encodeURIComponent(data.roomId)}&code=${encodeURIComponent(data.code)}`;
        window.location.href = targetUrl;
      } else {
        alert(data.error || 'Failed to join class');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      alert('Error joining class');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEndClass = async (batchId: number) => {
    if (!token) return;
    if (!confirm('Are you sure you want to end this class session?')) return;
    setActionLoadingId(batchId);
    try {
      const response = await fetch('/api/end-class', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ batchId })
      });
      if (response.ok) {
        await fetchBatches(false);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to end class');
      }
    } catch (error) {
      console.error('Error ending class:', error);
      alert('Error ending class');
    } finally {
      setActionLoadingId(null);
    }
  };

  const [downloadingSessionId, setDownloadingSessionId] = useState<string | null>(null);

  const handleDownloadPdf = async (batchName: string, roomId: string, startedAt: string) => {
    setDownloadingSessionId(roomId);
    try {
      const SYNC_WORKER_URL = process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787';
      const pdfUrl = `${SYNC_WORKER_URL}/api/pdf/${encodeURIComponent(roomId)}`;
      
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        alert('Notes PDF file not found on the server.');
        return;
      }
      
      const blob = await response.blob();
      
      // Sanitize batchName for filename (replace spaces and special characters with underscores)
      const sanitizedBatchName = batchName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
      
      // Format startedAt timestamp for filename
      let formattedTime = 'session';
      try {
        const date = new Date(startedAt);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        formattedTime = `${yyyy}-${mm}-${dd}_${hh}-${min}`;
      } catch (e) {
        console.error('Failed to parse date for filename:', e);
      }

      const fileName = `${sanitizedBatchName}_${formattedTime}.pdf`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download notes PDF:', error);
      alert('Failed to download PDF.');
    } finally {
      setDownloadingSessionId(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const isTeacher = user.role === 'teacher';

  return (
    <main className="min-h-screen bg-background text-foreground pb-12">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight">OpenGrapes Live</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-foreground/40 capitalize">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 border border-border/50 hover:bg-surface-light rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-bold tracking-tight">Welcome back, {user.name}</h2>
          <p className="text-sm text-foreground/50">
            {isTeacher 
              ? 'Manage your batches, view active sessions, and start your live classes' 
              : 'Access your enrolled batches and join live interactive classes'}
          </p>
        </div>

        {isFetching && batches.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-20 bg-surface/40 border border-border/30 rounded-2xl p-8 max-w-lg mx-auto">
            <p className="text-foreground/50 font-medium">No batches found</p>
            <p className="text-xs text-foreground/30 mt-1">
              {isTeacher 
                ? 'You are not registered as a teacher for any active batches.' 
                : 'You are not enrolled in any active batches.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {batches.map((batch) => {
              const isLive = batch.activeSession !== null;
              const isLoadingAction = actionLoadingId === batch.id;
              
              return (
                <div 
                  key={batch.id} 
                  className="bg-surface/65 backdrop-blur-xl border border-border/40 hover:border-border/80 rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-primary/80 uppercase tracking-wider">
                          {isTeacher ? `Batch ID: ${batch.id}` : batch.teacherName}
                        </span>
                        <h3 className="text-lg font-bold leading-snug">{batch.name}</h3>
                      </div>
                      
                      {/* Status indicator */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isLive 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-foreground/5 text-foreground/40 border border-border/30'
                      }`}>
                        {isLive && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        )}
                        {isLive ? 'LIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    {/* Metadata details */}
                    <div className="text-sm space-y-2 border-t border-border/20 pt-4">
                      {isTeacher ? (
                        <div className="flex items-center justify-between text-foreground/60">
                          <span>Enrolled Students:</span>
                          <span className="font-semibold text-foreground">{batch.studentCount}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-foreground/60">
                          <span>Teacher:</span>
                          <span className="font-semibold text-foreground">{batch.teacherName}</span>
                        </div>
                      )}
                      
                      {isLive && (
                        <div className="flex items-center justify-between text-foreground/60">
                          <span>Started At:</span>
                          <span className="text-xs text-foreground">
                            {new Date(batch.activeSession!.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions & Expandable Students */}
                  <div className="mt-6 space-y-4">
                    {/* Actions */}
                    <div className="flex gap-3">
                      {isTeacher ? (
                        isLive ? (
                          <button
                            onClick={() => handleStartClass(batch.id)}
                            disabled={isLoadingAction}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
                          >
                            {isLoadingAction ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            )}
                            Go to Class
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartClass(batch.id)}
                            disabled={isLoadingAction}
                            className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                          >
                            {isLoadingAction && (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            Start Class
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleJoinClass(batch.id)}
                          disabled={!isLive || isLoadingAction}
                          className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:bg-surface-light disabled:border disabled:border-border/30 disabled:text-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-primary/10"
                        >
                          {isLoadingAction && (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                          Join Class
                        </button>
                      )}
                    </div>

                    {/* Past Sessions PDFs (Both Teacher & Student) */}
                    {batch.pastSessions && batch.pastSessions.length > 0 && (
                      <div className="border-t border-border/20 pt-3">
                        <span className="text-[10px] text-foreground/40 font-bold uppercase tracking-wider block mb-2 select-none">
                          Past Class Notes
                        </span>
                        <ul className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {batch.pastSessions.map((session) => {
                            const dateStr = new Date(session.startedAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            });
                            const timeStr = new Date(session.startedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                            const isDownloading = downloadingSessionId === session.roomId;

                            return (
                              <li 
                                key={session.roomId} 
                                className="text-xs flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-surface-light/35 border border-border/15"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-foreground/85 truncate">
                                    Class from {dateStr}
                                  </span>
                                  <span className="text-[10px] text-foreground/45">
                                    {timeStr}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3.5 flex-shrink-0">
                                  {session.hasMom && (
                                    <button
                                      onClick={() => handleOpenMom(session.roomId)}
                                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                                      </svg>
                                      <span>Summary</span>
                                    </button>
                                  )}

                                  {session.hasNotes ? (
                                    <button
                                      onClick={() => handleDownloadPdf(batch.name, session.roomId, session.startedAt)}
                                      disabled={isDownloading}
                                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {isDownloading ? (
                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                        </svg>
                                      )}
                                      <span>Download</span>
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-foreground/35 select-none font-medium italic">
                                      No notes
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Expandable Students list (Teacher only) */}
                    {isTeacher && batch.students.length > 0 && (
                      <div className="border-t border-border/20 pt-3">
                        <button
                          onClick={() => setExpandedBatchId(expandedBatchId === batch.id ? null : batch.id)}
                          className="text-xs text-foreground/40 hover:text-primary flex items-center gap-1 transition-colors cursor-pointer w-full text-left font-medium uppercase tracking-wider"
                        >
                          <span>{expandedBatchId === batch.id ? 'Hide' : 'Show'} Student List</span>
                          <svg className={`w-3.5 h-3.5 transform transition-transform ${expandedBatchId === batch.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {expandedBatchId === batch.id && (
                          <ul className="mt-2.5 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {batch.students.map((student) => (
                              <li key={student.id} className="text-xs flex justify-between py-1 px-2 rounded bg-surface-light/40 border border-border/20">
                                <span className="font-semibold text-foreground/85">{student.name}</span>
                                <span className="text-foreground/45">{student.email}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectedMomSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#0c101d]/90 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white font-sans">
            {/* Header */}
            <div className="p-5 border-b border-border/20 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-indigo-400">Class Summary & Minutes</h3>
                <p className="text-[10px] text-foreground/45 mt-0.5">Generated via AI Speech Transcription</p>
              </div>
              <button
                onClick={() => setSelectedMomSessionId(null)}
                className="p-1.5 hover:bg-border/30 rounded-lg text-foreground/60 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 pr-4">
              {isMomLoading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <svg className="w-8 h-8 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-xs text-foreground/50 font-medium">Fetching summary notes...</p>
                </div>
              )}

              {momError && (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center text-red-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-red-400">{momError}</p>
                </div>
              )}

              {!isMomLoading && !momError && (
                <div className="prose prose-invert max-w-none space-y-2">
                  {renderMarkdown(momContent)}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border/20 bg-surface/30 flex justify-end">
              <button
                onClick={() => setSelectedMomSessionId(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-white"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
