import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import wsManager from '../api/websocket';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * True once the websocket of an established session dropped. 'unauthorized'
 * ends the session (not an outage); 'connected' recovers it.
 */
function useSocketDown(enabled: boolean): boolean {
  const [down, setDown] = useState(false);

  useEffect(
    () =>
      wsManager.onConnectionState((state) => {
        if (state === 'disconnected' || state === 'error') setDown(true);
        else setDown(false);
      }),
    [],
  );

  // No session (login page, after logout): a missing socket is not "offline".
  return enabled && down;
}

export default function OfflineBanner() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const socketDown = useSocketDown(Boolean(user));

  if (online && !socketDown) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-toast bg-amber-600 py-1 text-center text-xs font-medium text-white"
    >
      Sin conexión
    </div>
  );
}
