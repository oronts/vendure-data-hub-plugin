import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@vendure/dashboard';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    /** Optional error reporting callback for integration with error tracking services */
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        this.setState({ errorInfo });

        // Call custom error handler if provided
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }

    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return <DefaultErrorFallback error={this.state.error} onReset={this.handleReset} />;
        }
        return this.props.children;
    }
}

function DefaultErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
    const { t } = useLingui();

    return (
        <Card className="m-4" role="alert">
            <CardHeader>
                <CardTitle><Trans>Something went wrong</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                    {error?.message || t`An unexpected error occurred`}
                </p>
                <Button onClick={onReset}><Trans>Try again</Trans></Button>
            </CardContent>
        </Card>
    );
}
