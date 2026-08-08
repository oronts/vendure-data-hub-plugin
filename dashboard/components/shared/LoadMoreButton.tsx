import { useLingui } from '@lingui/react/macro';
import { Button } from '@vendure/dashboard';

export interface LoadMoreButtonProps {
    remaining: number;
    onClick: () => void;
    loading?: boolean;
    label?: string;
    loadingLabel?: string;
    /** Optional data-testid attribute for testing */
    'data-testid'?: string;
}

export function LoadMoreButton({
    remaining,
    onClick,
    loading = false,
    label,
    loadingLabel,
    'data-testid': testId,
}: LoadMoreButtonProps) {
    const { t } = useLingui();
    const defaultLabel = t`Load more (${remaining} remaining)`;
    const defaultLoadingLabel = t`Loading...`;

    return (
        <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={onClick} disabled={loading} data-testid={testId}>
                {loading ? (loadingLabel ?? defaultLoadingLabel) : (label ?? defaultLabel)}
            </Button>
        </div>
    );
}
