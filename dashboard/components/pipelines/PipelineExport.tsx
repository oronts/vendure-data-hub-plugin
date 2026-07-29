import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from '@vendure/dashboard';
import { Trans } from '@lingui/react/macro';
import * as React from 'react';
import {
    DIALOG_DIMENSIONS,
    TEXTAREA_HEIGHTS,
} from '../../constants';
import { toPipelineTs } from './pipeline-source';

interface Props {
    definition: unknown;
}

export function PipelineExportDialog({ definition }: Readonly<Props>) {
    const [open, setOpen] = React.useState(false);
    const code = React.useMemo(() => toPipelineTs(definition), [definition]);

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            // Clipboard API failed - silently ignore (user can still use download)
        }
    }

    function downloadFile() {
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'pipeline.ts';
        downloadLink.click();
        URL.revokeObjectURL(url);
    }

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Trans>Export to code</Trans>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className={`${DIALOG_DIMENSIONS.MAX_WIDTH_2XL} ${DIALOG_DIMENSIONS.MAX_HEIGHT_80VH} flex flex-col`}>
                    <DialogHeader className="flex-none">
                        <DialogTitle>
                            <Trans>Export pipeline</Trans>
                        </DialogTitle>
                        <DialogDescription>
                            <Trans>Copy or download the TypeScript DSL.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <Textarea value={code} readOnly className={`font-mono text-xs flex-1 ${TEXTAREA_HEIGHTS.CODE_EXPORT_MIN} ${TEXTAREA_HEIGHTS.CODE_EXPORT_MAX} resize-none`} />
                        <div className="flex gap-2 flex-none">
                            <Button onClick={copyToClipboard}>
                                <Trans>Copy</Trans>
                            </Button>
                            <Button variant="secondary" onClick={downloadFile}>
                                <Trans>Download</Trans>
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
