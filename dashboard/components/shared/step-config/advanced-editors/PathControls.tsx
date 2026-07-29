import { memo, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';

interface PathButtonProps {
    path: string;
    isSelected: boolean;
    onSelect: (path: string) => void;
}

export const PathButton = memo(function PathButton({
    path,
    isSelected,
    onSelect,
}: PathButtonProps) {
    const { t } = useLingui();
    const handleClick = useCallback(() => onSelect(path), [onSelect, path]);

    return (
        <button
            type="button"
            className={`rounded px-2 py-1 text-left text-[11px] ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            onClick={handleClick}
            aria-pressed={isSelected}
            aria-label={t`Select field path ${path}`}
        >
            {path}
        </button>
    );
});

interface InsertPathButtonProps {
    path: string;
    onInsert: (path: string) => void;
}

export const InsertPathButton = memo(function InsertPathButton({
    path,
    onInsert,
}: InsertPathButtonProps) {
    const { t } = useLingui();
    const handleClick = useCallback(() => onInsert(path), [onInsert, path]);

    return (
        <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-muted"
            onClick={handleClick}
            aria-label={t`Insert ${path} at the cursor`}
        >
            {path}
        </button>
    );
});
