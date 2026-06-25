'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function EndedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get('reason') || 'left';

  const handleGoToDashboard = () => {
    try {
      sessionStorage.removeItem('classroom_access_token');
      sessionStorage.removeItem('classroom_refresh_token');
      sessionStorage.removeItem('active_room_name');
      sessionStorage.removeItem('classroom_session_started_at');
    } catch (err) {
      console.warn('Failed to clear session storage:', err);
    }

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const dashboardUrl = isLocalhost ? 'http://localhost:3000' : 'https://opengrapes.com';

    // Try to open the LMS dashboard in a new tab
    window.open(dashboardUrl, '_blank');
    
    // Attempt to close the current tab
    try {
      window.close();
    } catch (e) {
      console.warn('Browser blocked window.close()', e);
    }

    // Fallback: If current tab wasn't closed, redirect it to the dashboard
    setTimeout(() => {
      window.location.href = dashboardUrl;
    }, 100);
  };

  const handleRejoin = () => {
    router.push('/');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#030712] px-4 relative overflow-hidden font-sans text-[#f9fafb]">
      {/* Ambient glowing background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#6366F1]/10 blur-[128px] animate-pulse" />
      </div>

      <div className="relative w-full max-w-md bg-[#13131F]/80 backdrop-blur-xl border border-[#2C2C42]/50 rounded-2xl shadow-2xl p-8 space-y-8 text-center animate-in fade-in zoom-in-95 duration-300">
        {/* Animated Visual/Icon */}
        <div className="flex justify-center">
          <div className="relative w-20 h-20 flex items-center justify-center">
            {/* Outer rings */}
            <div className="absolute inset-0 rounded-full bg-[#6366F1]/5 animate-ping duration-1000" />
            <div className="absolute inset-2 rounded-full bg-[#6366F1]/10 border border-[#6366F1]/20 animate-pulse" />
            
            {/* Main Circle Icon container */}
            <div className="relative w-16 h-16 rounded-full bg-[#6366F1]/15 border border-[#6366F1]/30 flex items-center justify-center">
              {reason === 'ended' ? (
                // Calendar/Clock or Phone-off Icon
                <svg className="w-8 h-8 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ) : (
                // Leave/Arrow-Left Icon
                <svg className="w-8 h-8 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Text Headers */}
        <div className="space-y-3">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#E2E8F0] leading-tight">
            {reason === 'ended' ? 'The meeting has ended' : 'You left the meeting'}
          </h1>
          <p className="text-sm text-[#f9fafb]/50 leading-relaxed max-w-sm mx-auto font-medium font-sans">
            {reason === 'ended'
              ? 'The class session has been completed by the teacher. You can now return to the OpenGrapes dashboard.'
              : 'You have disconnected from the live classroom. You can rejoin the session if it is still active, or return to the dashboard.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3.5 pt-2">
          {reason === 'left' && (
            <button
              onClick={handleRejoin}
              className="w-full py-3.5 bg-[#6366F1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-semibold rounded-xl text-sm transition-all duration-150 shadow-lg shadow-[#6366F1]/25 hover:shadow-[#6366F1]/40 cursor-pointer border border-transparent font-sans"
            >
              Rejoin Meeting
            </button>
          )}

          <button
            onClick={handleGoToDashboard}
            className={`w-full py-3.5 font-semibold rounded-xl text-sm transition-all duration-150 cursor-pointer border border-transparent font-sans ${
              reason === 'ended'
                ? 'bg-[#6366F1] hover:bg-[#4f46e5] text-white shadow-lg shadow-[#6366F1]/25 hover:shadow-[#6366F1]/40 active:scale-[0.98]'
                : 'bg-[#1f2937]/80 hover:bg-[#1f2937] text-white border-[#2C2C42] active:scale-[0.98]'
            }`}
          >
            Go to OpenGrapes Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

export default function EndedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <svg className="w-8 h-8 text-[#6366F1] animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <EndedContent />
    </Suspense>
  );
}
