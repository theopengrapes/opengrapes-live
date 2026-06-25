import { useEffect, useRef } from 'react';

interface UseMobileBackButtonProps {
  isPanelOpen: boolean;
  onClosePanel: () => void;
  onLeave: () => void;
  enabled?: boolean;
}

export function useMobileBackButton({
  isPanelOpen,
  onClosePanel,
  onLeave,
  enabled = true,
}: UseMobileBackButtonProps) {
  const isPanelOpenRef = useRef(isPanelOpen);
  const onClosePanelRef = useRef(onClosePanel);
  const onLeaveRef = useRef(onLeave);

  useEffect(() => {
    isPanelOpenRef.current = isPanelOpen;
    onClosePanelRef.current = onClosePanel;
    onLeaveRef.current = onLeave;
  }, [isPanelOpen, onClosePanel, onLeave]);

  useEffect(() => {
    if (!enabled) return;

    // Push initial entry state to capture back button clicks when no panels are open
    window.history.pushState({ entry: true }, '');

    const handlePopState = (event: PopStateEvent) => {
      if (isPanelOpenRef.current) {
        onClosePanelRef.current();
      } else {
        const confirmLeave = window.confirm("Leave the meeting?");
        if (confirmLeave) {
          onLeaveRef.current();
        } else {
          // Re-push the entry state since they decided to stay
          window.history.pushState({ entry: true }, '');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled]);

  // Track panel opening transitions
  const prevPanelOpenRef = useRef(isPanelOpen);
  useEffect(() => {
    if (!enabled) return;

    if (isPanelOpen && !prevPanelOpenRef.current) {
      window.history.pushState({ panel: 'active' }, '');
    }
    prevPanelOpenRef.current = isPanelOpen;
  }, [isPanelOpen, enabled]);
}
