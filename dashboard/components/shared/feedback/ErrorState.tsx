import * as React from 'react';
import { useCallback, memo } from 'react';
import { Button, Card, CardContent } from '@vendure/dashboard';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ICON_SIZES, COMPONENT_HEIGHTS } from '../../../constants';
import type { ErrorStateProps } from '../../../types';

function ErrorStateComponent({
    title = 'Something went wrong',
    message,
    onRetry,
    error,
    className = '',
}: ErrorStateProps) {
    const [showDetails, setShowDetails] = React.useState(false);

    const toggleDetails = useCallback(() => {
        setShowDetails(prev => !prev);
    }, []);

    return (
        <Card className={`border-destructive/50 ${className}`}>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="rounded-full bg-destructive/10 p-2">
                        <AlertCircle className={`${ICON_SIZES.MD} text-destructive`} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-medium text-destructive mb-1">{title}</h3>
                        <p className="text-sm text-muted-foreground mb-4">{message}</p>

                        <div className="flex items-center gap-2">
                            {onRetry && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onRetry}
                                    className="gap-2"
                                >
                                    <RefreshCw className={ICON_SIZES.SM} />
                                    Try again
                                </Button>
                            )}

                            {error && process.env.NODE_ENV === 'development' && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleDetails}
                                >
                                    {showDetails ? 'Hide' : 'Show'} details
                                </Button>
                            )}
                        </div>

                        {showDetails && error && (
                            <pre className={`mt-4 p-3 bg-muted rounded text-xs overflow-auto ${COMPONENT_HEIGHTS.SCROLL_AREA_XXS}`}>
                                {error.stack || error.message}
                            </pre>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export const ErrorState = memo(ErrorStateComponent);
