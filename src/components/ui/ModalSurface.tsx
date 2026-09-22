import { cloneElement, useRef, type ReactElement, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

/** Keeps custom popup layouts while sharing focus, Escape and scroll behavior. */
export function ModalSurface({ children, title, onClose, embedded = false }: {
  children: ReactElement<{ children?: ReactNode }>;
  title: string;
  onClose: () => void;
  embedded?: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  if (embedded) return children;

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay asChild>
        <Dialog.Content
          asChild
          ref={surface}
          className="modal-surface"
          aria-describedby={undefined}
          onOpenAutoFocus={event => {
            event.preventDefault();
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            // Opening a sheet must not summon the phone keyboard.
            surface.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          }}
        >
          {cloneElement(children, undefined,
            <Dialog.Title className="sr-only">{title}</Dialog.Title>,
            children.props.children,
          )}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  </Dialog.Root>;
}
