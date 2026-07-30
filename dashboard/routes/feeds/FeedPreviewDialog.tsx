import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@vendure/dashboard';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '../../components/shared';
import { usePreviewFeed } from '../../hooks/api/use-feeds';
import { getErrorMessage } from '../../../shared';
import { UI_DEFAULTS, UI_LIMITS } from '../../constants';

export interface FeedPreviewDialogProps {
    feedCode: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function FeedPreviewDialog({
    feedCode,
    open,
    onOpenChange,
}: Readonly<FeedPreviewDialogProps>) {
    const { t } = useLingui();
    const preview = usePreviewFeed();
    const { mutate, reset } = preview;
    const [copied, setCopied] = React.useState(false);

    const loadPreview = React.useCallback(() => {
        mutate({ feedCode, limit: UI_LIMITS.TABLE_PREVIEW_ROWS });
    }, [feedCode, mutate]);

    React.useEffect(() => {
        if (open) loadPreview();
        else {
            reset();
            setCopied(false);
        }
    }, [loadPreview, open, reset]);

    const copyPreview = async () => {
        if (!preview.data?.content) return;
        try {
            await navigator.clipboard.writeText(preview.data.content);
            setCopied(true);
            window.setTimeout(
                () => setCopied(false),
                UI_DEFAULTS.COPY_FEEDBACK_TIMEOUT_MS,
            );
        } catch {
            toast.error(t`Could not copy the preview`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {t`Preview ${feedCode}`}
                    </DialogTitle>
                    <DialogDescription>
                        {t`Generates an in-memory sample from the active channel without replacing the stored artifact.`}
                    </DialogDescription>
                </DialogHeader>

                {preview.isPending ? (
                    <LoadingState message={t`Generating preview...`} />
                ) : preview.isError ? (
                    <ErrorState
                        title={t`Preview failed`}
                        message={getErrorMessage(preview.error)}
                        onRetry={loadPreview}
                    />
                ) : preview.data ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                            <span>
                                {preview.data.itemCount === 1
                                    ? t`1 item`
                                    : t`${preview.data.itemCount} items`}
                                {' · '}
                                {preview.data.contentType}
                            </span>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={loadPreview}>
                                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                    {t`Refresh`}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={copyPreview}>
                                    {copied
                                        ? <Check className="h-4 w-4" aria-hidden="true" />
                                        : <Copy className="h-4 w-4" aria-hidden="true" />}
                                    {copied ? t`Copied` : t`Copy`}
                                </Button>
                            </div>
                        </div>
                        <pre
                            className="min-h-[18rem] flex-1 overflow-auto rounded-md border bg-muted/40 p-4 text-xs"
                            tabIndex={0}
                            aria-label={t`Preview content for ${feedCode}`}
                        >
                            {preview.data.content}
                        </pre>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
