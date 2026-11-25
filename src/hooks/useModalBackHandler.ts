import { useEffect, useId, useRef } from 'react';

interface ModalStackEntry {
  id: string;
  close: () => void;
}

const openModalStack: ModalStackEntry[] = [];

function removeModalFromStack(id: string) {
  const idx = openModalStack.findIndex((entry) => entry.id === id);
  if (idx !== -1) {
    openModalStack.splice(idx, 1);
  }
}

/**
 * Closes the topmost currently open modal (if any).
 * Returns true if a modal was closed, false otherwise.
 */
export function closeTopOpenModal(): boolean {
  if (window.history.state?.isModal) {
    window.history.back();
    return true;
  }
  const top = openModalStack[openModalStack.length - 1];
  if (top) {
    removeModalFromStack(top.id);
    top.close();
    return true;
  }
  return false;
}

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
      removeModalFromStack(modalId);
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
    removeModalFromStack(modalId);
    openModalStack.push({ id: modalId, close: () => onCloseRef.current() });

    if (window.history.state?.modalId !== modalId) {
      window.history.pushState({ ...(window.history.state || {}), isModal: true, modalId }, '');
      pushedRef.current = true;
    }

    const handlePopState = () => {
      const topEntry = openModalStack[openModalStack.length - 1];
      if ((topEntry && topEntry.id !== modalId) || window.history.state?.modalId === modalId) {
        return;
      }
      if (pushedRef.current) {
        pushedRef.current = false;
        closedByPopstateRef.current = true;
        removeModalFromStack(modalId);
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      removeModalFromStack(modalId);
      // Do NOT call window.history.back() inside cleanup so navigating away
      // or StrictMode re-renders never pop the newly navigated route.
    };
  }, [isOpen, modalId]);
}
