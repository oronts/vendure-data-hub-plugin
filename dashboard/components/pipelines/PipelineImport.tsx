import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import * as React from 'react';
import { getErrorMessage } from '../../../shared';
import { useValidatePipelineDefinition } from '../../hooks';
import type { PipelineDefinition } from '../../types';
import {
    getCurrentValidatedDefinition,
    type ValidatedPipelineImport,
} from './pipeline-import-state';

interface Props {
    onImport: (definition: PipelineDefinition) => void;
}

export function PipelineImportDialog({ onImport }: Readonly<Props>) {
    const { t } = useLingui();
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState('');
    const [errors, setErrors] = React.useState<string[]>([]);
    const [validated, setValidated] = React.useState<ValidatedPipelineImport | null>(null);

    const validateMutation = useValidatePipelineDefinition();

    async function handleValidate() {
        setErrors([]);
        setValidated(null);
        const sourceText = text;
        try {
            const def = JSON.parse(sourceText) as PipelineDefinition;
            const result = await validateMutation.mutateAsync({
                definition: def as unknown as Record<string, unknown>,
            });
            if (result?.isValid) {
                setValidated({ sourceText, definition: def });
            } else {
                const issueMessages = (result?.issues as Array<{ message: string }> | undefined)
                    ?.map(issue => issue.message)
                    ?? [t`Invalid definition`];
                setErrors(issueMessages);
            }
        } catch (e) {
            setErrors([getErrorMessage(e)]);
        }
    }

    function handleImport() {
        const definition = getCurrentValidatedDefinition(validated, text);
        if (definition) {
            onImport(definition);
            setOpen(false);
            setText('');
            setErrors([]);
            setValidated(null);
        }
    }

    function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
        setText(event.target.value);
        setErrors([]);
        setValidated(null);
    }

    const currentDefinition = getCurrentValidatedDefinition(validated, text);

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Trans>Import JSON</Trans>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>
                            <Trans>Import pipeline from JSON</Trans>
                        </DialogTitle>
                        <DialogDescription>
                            <Trans>Paste a PipelineDefinition JSON and validate it before importing.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Textarea
                            value={text}
                            onChange={handleTextChange}
                            placeholder='{"version":1,"steps":[]}'
                            className="font-mono min-h-[260px]"
                        />
                        {errors.length > 0 && (
                            <div className="border border-destructive/40 rounded-md p-3">
                                <div className="text-sm font-medium text-destructive mb-1">
                                    <Trans>Validation errors</Trans>
                                </div>
                                <ul className="list-disc pl-5 text-sm">
                                    {/* Index as key acceptable - error messages are static after validation */}
                                    {errors.map((e, errorIndex) => (
                                        <li key={`error-${errorIndex}`}>{e}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleValidate} disabled={validateMutation.isPending}>
                                {validateMutation.isPending
                                    ? <Trans>Validating…</Trans>
                                    : <Trans>Validate</Trans>}
                            </Button>
                            <Button onClick={handleImport} disabled={!currentDefinition}>
                                <Trans>Import</Trans>
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
