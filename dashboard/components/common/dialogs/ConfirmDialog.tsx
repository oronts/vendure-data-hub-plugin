import * as React from 'react';
import { useCallback, memo } from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@vendure/dashboard';
import type { ConfirmDialogProps } from '../../../types';

function ConfirmDialogComponent({
    open,
    onClose,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
}: ConfirmDialogProps) {
    const handleConfirm = useCallback(() => {
        onConfirm();
        onClose();
    }, [onConfirm, onClose]);

    return (
        <Dialog open={open} onOpenChange={() => onClose()}>
            <DialogContent className="max-w-md" data-testid="datahub-confirm-dialog">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{message}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} data-testid="datahub-confirm-dialog-cancel">
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={destructive ? 'destructive' : 'default'}
                        onClick={handleConfirm}
                        data-testid="datahub-confirm-dialog-confirm"
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export const ConfirmDialog = memo(ConfirmDialogComponent);
