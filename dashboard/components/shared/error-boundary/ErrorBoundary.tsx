import React from 'react';
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

/**
 * Error tracking service integration point.
 * Replace this with your preferred error tracking service (Sentry, Datadog, etc.)
 */
function reportError(error: Error, errorInfo: React.ErrorInfo): void {
    // In production, send to error tracking service
    // Example: Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

    // For development/debugging, log structured error data
    if (process.env.NODE_ENV === 'development') {
        // Using structured logging format that can be parsed by log aggregators
        const errorReport = {
            type: 'DataHub.ErrorBoundary',
            timestamp: new Date().toISOString(),
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
            componentStack: errorInfo.componentStack,
        };
        // eslint-disable-next-line no-console
        console.error('[DataHub Error]', JSON.stringify(errorReport, null, 2));
    }
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

        // Report to error tracking service
        reportError(error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <Card className="m-4">
                    <CardHeader>
                        <CardTitle>Something went wrong</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <Button onClick={this.handleReset}>Try Again</Button>
                    </CardContent>
                </Card>
            );
        }
        return this.props.children;
    }
}
