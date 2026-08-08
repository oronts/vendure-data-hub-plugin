import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button, ConfirmationDialog, usePermissions } from '@vendure/dashboard';
import { Download, Eye, Loader2, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../shared';
import { DATAHUB_PERMISSIONS } from '../../constants';
import { useDeleteFeed, useGenerateFeed } from '../../hooks/api/use-feeds';
import { downloadFeedArtifact } from './feed-download';
import { FeedPreviewDialog } from './FeedPreviewDialog';

export interface FeedActionTarget {
    id: string | number;
    code: string;
    downloadUrl?: string | null;
}

export interface FeedActionsProps {
    feed: FeedActionTarget;
    onDeleted?: () => void;
    compact?: boolean;
}

export function FeedActions({ feed, onDeleted, compact = false }: Readonly<FeedActionsProps>) {
    const { t } = useLingui();
    const generateFeed = useGenerateFeed();
    const deleteFeed = useDeleteFeed();
    const { hasPermissions } = usePermissions();
    const canDownload = hasPermissions([DATAHUB_PERMISSIONS.READ_FILES]);
    const [previewOpen, setPreviewOpen] = React.useState(false);
    const [downloading, setDownloading] = React.useState(false);

    const generate = () => {
        generateFeed.mutate(feed.code, {
            onSuccess: result => {
                if (!result.success) {
                    toast.error(t`Feed generation failed`, {
                        description: result.errors.join('\n')
                            || t`The generator did not produce an artifact`,
                    });
                    return;
                }
                toast.success(result.itemCount === 1
                    ? t`Generated 1 item`
                    : t`Generated ${result.itemCount} items`);
                if (result.warnings.length > 0) {
                    toast.warning(t`Feed generated with warnings`, {
                        description: result.warnings.join('\n'),
                    });
                }
            },
            onError: error => {
                toast.error(t`Feed generation failed`, {
                    description: getErrorMessage(error),
                });
            },
        });
    };

    const remove = () => {
        deleteFeed.mutate(String(feed.id), {
            onSuccess: () => {
                toast.success(t`Feed deleted`);
                onDeleted?.();
            },
            onError: error => {
                toast.error(t`Failed to delete feed`, {
                    description: getErrorMessage(error),
                });
            },
        });
    };

    const download = async () => {
        if (!feed.downloadUrl) return;
        setDownloading(true);
        try {
            await downloadFeedArtifact(
                feed.downloadUrl,
                feed.code,
                status => t`Download failed: ${status}`,
            );
        } catch (error) {
            toast.error(t`Failed to download feed`, {
                description: getErrorMessage(error),
            });
        } finally {
            setDownloading(false);
        }
    };

    const buttonSize = compact ? 'sm' : 'default';
    return (
        <>
            <div
                className="flex flex-wrap items-center gap-2"
                aria-label={t`Actions for feed ${feed.code}`}
            >
                <Button
                    type="button"
                    size={buttonSize}
                    variant="outline"
                    onClick={() => setPreviewOpen(true)}
                    aria-label={compact
                        ? t`Preview ${feed.code}`
                        : undefined}
                >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    {!compact && t`Preview`}
                </Button>
                <Button
                    type="button"
                    size={buttonSize}
                    variant="outline"
                    onClick={generate}
                    disabled={generateFeed.isPending}
                    aria-label={compact
                        ? t`Generate ${feed.code}`
                        : undefined}
                >
                    {generateFeed.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Play className="h-4 w-4" aria-hidden="true" />}
                    {!compact && (generateFeed.isPending ? t`Generating...` : t`Generate`)}
                </Button>
                {feed.downloadUrl && canDownload && (
                    <Button
                        type="button"
                        size={buttonSize}
                        variant="outline"
                        onClick={download}
                        disabled={downloading}
                        aria-label={compact
                            ? t`Download ${feed.code}`
                            : undefined}
                    >
                        {downloading
                            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            : <Download className="h-4 w-4" aria-hidden="true" />}
                        {!compact && (downloading ? t`Downloading...` : t`Download`)}
                    </Button>
                )}
                <ConfirmationDialog
                    title={t`Delete feed?`}
                    description={t`The ${feed.code} configuration and its current artifact will be permanently deleted.`}
                    confirmText={t`Delete feed`}
                    onConfirm={remove}
                >
                    <Button
                        type="button"
                        size={buttonSize}
                        variant="destructive"
                        disabled={deleteFeed.isPending}
                        aria-label={compact
                            ? t`Delete ${feed.code}`
                            : undefined}
                    >
                        {deleteFeed.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                        {!compact && (deleteFeed.isPending ? t`Deleting...` : t`Delete`)}
                    </Button>
                </ConfirmationDialog>
            </div>
            <FeedPreviewDialog
                feedCode={feed.code}
                open={previewOpen}
                onOpenChange={setPreviewOpen}
            />
        </>
    );
}
