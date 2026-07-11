import { useCallback, useRef, type PointerEvent } from 'react';

interface UseBackdropCloseOptions {
  onClose: () => void | Promise<void>;
  stopPropagation?: boolean;
}

export const useBackdropClose = <T extends HTMLElement>({
  onClose,
  stopPropagation = false,
}: UseBackdropCloseOptions) => {
  const pointerStartedOnBackdropRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: PointerEvent<T>) => {
      if (stopPropagation) {
        event.stopPropagation();
      }
      pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
    },
    [stopPropagation]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<T>) => {
      if (stopPropagation) {
        event.stopPropagation();
      }

      if (pointerStartedOnBackdropRef.current && event.target === event.currentTarget) {
        void onClose();
      }

      pointerStartedOnBackdropRef.current = false;
    },
    [onClose, stopPropagation]
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<T>) => {
      if (stopPropagation) {
        event.stopPropagation();
      }
      pointerStartedOnBackdropRef.current = false;
    },
    [stopPropagation]
  );

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };
};
