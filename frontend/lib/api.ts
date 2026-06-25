export async function getToken(roomName: string, sessionToken: string): Promise<string> {
  const response = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, sessionToken }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to get token');
  }

  const data = await response.json();
  return data.token;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export async function getTurnCredentials(): Promise<IceServer[]> {
  const response = await fetch('/api/turn');

  if (!response.ok) {
    console.warn('Failed to fetch TURN credentials, falling back to STUN only');
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  const data = await response.json();
  return data.iceServers;
}

export function decodeJwt(token: string): any {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode JWT:', e);
    return null;
  }
}
