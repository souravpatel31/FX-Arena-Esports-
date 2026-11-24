import { useEffect, useId, useRef } from 'react';

/**
 * Safe modal back-button handler.
 * Never calls history.back() during route transitions or unmount cleanup,
 * preventing accidental back-navigation or app exit.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  const modalId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pushedRef = useRef(false);
  const closedByPopstateRef = useRef(false);
  const openedLocationRef = useRef('');

  useEffect(() => {
    if (!isOpen) {
      // Only pop the modal history entry if:
      // 1. We actually pushed it
      // 2. It wasn't already popped by user's back button
      // 3. User is still on the exact same route where modal was opened
      // 4. Current top history state belongs to THIS modal
      const currentLoc = window.location.pathname + window.location.search;
      if (
        pushedRef.current &&
        !closedByPopstateRef.current &&
        currentLoc === openedLocationRef.current &&
        window.history.state?.modalId === modalId
      ) {
        pushedRef.current = false;
        window.history.back();
      }
      pushedRef.current = false;
      closedByPopstateRef.current = false;
      return;
    }

    closedByPopstateRef.current = false;
    openedLocationRef.current = window.location.pathname + window.location.search;

    if (window.history.state?.modalId !== modalId) {
      window.history.pushState({ ...(window.history.state || {}), isModal: true, modalId }, '');
      pushedRef.current = true;
    }

    const handlePopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        closedByPopstateRef.current = true;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Do NOT call window.history.back() inside cleanup so navigating away
      // or StrictMode re-renders never pop the newly navigated route.
    };
  }, [isOpen, modalId]);
}
