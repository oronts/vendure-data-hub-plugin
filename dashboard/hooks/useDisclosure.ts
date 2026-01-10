/**
 * useDisclosure Hook
 * Manages disclosure state for modals, dialogs, and other expandable UI
 */

import * as React from 'react';

export interface UseDisclosureReturn {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useDisclosure(initialState: boolean = false): UseDisclosureReturn {
    const [isOpen, setIsOpen] = React.useState(initialState);

    const open = React.useCallback(() => {
        setIsOpen(true);
    }, []);

    const close = React.useCallback(() => {
        setIsOpen(false);
    }, []);

    const toggle = React.useCallback(() => {
        setIsOpen(v => !v);
    }, []);

    return {
        isOpen,
        open,
        close,
        toggle,
        setIsOpen,
    };
}

export default useDisclosure;
