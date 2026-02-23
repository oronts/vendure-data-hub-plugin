import { Button } from '@vendure/dashboard';

export interface LoadMoreButtonProps {
    remaining: number;
    onClick: () => void;
    /** Optional data-testid attribute for testing */
    'data-testid'?: string;
}

export function LoadMoreButton({ remaining, onClick, 'data-testid': testId }: LoadMoreButtonProps) {
    return (
        <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={onClick} data-testid={testId}>
                Load More ({remaining} remaining)
            </Button>
        </div>
    );
}
