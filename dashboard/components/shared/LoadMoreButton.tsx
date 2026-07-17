import { Button } from '@vendure/dashboard';

export interface LoadMoreButtonProps {
    remaining: number;
    onClick: () => void;
    loading?: boolean;
    /** Optional data-testid attribute for testing */
    'data-testid'?: string;
}

export function LoadMoreButton({ remaining, onClick, loading = false, 'data-testid': testId }: LoadMoreButtonProps) {
    return (
        <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={onClick} disabled={loading} data-testid={testId}>
                {loading ? 'Loading…' : `Load More (${remaining} remaining)`}
            </Button>
        </div>
    );
}
