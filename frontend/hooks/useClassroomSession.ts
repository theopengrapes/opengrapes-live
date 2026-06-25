'use client';

import { useState, useEffect } from 'react';
import { decodeJwt } from '@/lib/api';

export function useClassroomSession(
  token: string,
  roomName: string,
  sessionToken?: string
) {
  const [currentToken, setCurrentToken] = useState(token);

  useEffect(() => {
    setCurrentToken(token);
  }, [token]);

  // Proactive token refresh loop for Classroom Access Token and LiveKit connection token
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isUnmounted = false;

    const scheduleRefresh = () => {
      if (isUnmounted) return;

      let accessToken = sessionToken;
      try {
        const storedAccess = sessionStorage.getItem('classroom_access_token');
        if (storedAccess) {
          accessToken = storedAccess;
        }
      } catch (e) {
        console.warn('[useClassroomSession] Failed to read classroom_access_token from sessionStorage:', e);
      }

      if (!accessToken) return;

      const decoded = decodeJwt(accessToken);
      if (!decoded || !decoded.exp) return;

      const expiryTime = decoded.exp * 1000;
      const refreshBuffer = 5 * 60 * 1000; // 5 minutes before expiry
      const delay = expiryTime - Date.now() - refreshBuffer;

      // Schedule the refresh call (or execute immediately if already past the buffer time)
      timeoutId = setTimeout(() => {
        refreshInterval(0).catch((err) => {
          console.error('[TokenRefresh] Error inside refreshInterval promise chain:', err);
        });
      }, Math.max(0, delay));
    };

    const refreshInterval = async (retryCount = 0) => {
      if (isUnmounted) return;

      let savedRefresh = '';
      try {
        savedRefresh = sessionStorage.getItem('classroom_refresh_token') || '';
      } catch (e) {
        console.warn('[useClassroomSession] Failed to read classroom_refresh_token from sessionStorage:', e);
      }

      if (!savedRefresh) return;

      try {
        // Step 1: Renew the Classroom Access Token
        const res = await fetch('/api/renew-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: savedRefresh }),
        });

        if (!res.ok) throw new Error('Failed to renew session token');
        const data = await res.json();
        
        try {
          sessionStorage.setItem('classroom_access_token', data.accessToken);
        } catch (e) {
          console.warn('[useClassroomSession] Failed to save classroom_access_token to sessionStorage:', e);
        }

        // Step 2: Renew the LiveKit connection token using the new access token
        const tokenRes = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomName, sessionToken: data.accessToken }),
        });
        if (!tokenRes.ok) throw new Error('Failed to fetch new LiveKit token');

        const tokenData = await tokenRes.json();
        
        if (!isUnmounted) {
          setCurrentToken(tokenData.token);
          console.log('[TokenRefresh] Successfully renewed Classroom Access Token and LiveKit token proactively.');
          // Schedule the next refresh
          scheduleRefresh();
        }
      } catch (err) {
        console.error('[TokenRefresh] Failed to renew tokens proactively:', err);
        if (isUnmounted) return;

        if (retryCount < 1) {
          console.log('[TokenRefresh] Retrying renewal in 30 seconds...');
          timeoutId = setTimeout(() => {
            refreshInterval(retryCount + 1).catch((err) => {
              console.error('[TokenRefresh] Error inside retry refreshInterval:', err);
            });
          }, 30000);
        } else {
          alert('Warning: Your session credentials could not be automatically renewed. You might experience a disconnection shortly.');
        }
      }
    };

    scheduleRefresh();

    return () => {
      isUnmounted = true;
      clearTimeout(timeoutId);
    };
  }, [roomName, sessionToken]);

  return currentToken;
}
