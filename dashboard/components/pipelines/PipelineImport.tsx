import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from '@vendure/dashboard';
import { useLingui } from '@lingui/react';
import * as React from 'react';
import { getErrorMessage } from '../../../shared';
import { PIPELINE_DETAIL_TRANSLATION_IDS } from '../../constants';
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
    const { i18n } = useLingui();
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
                    ?? [i18n._(PIPELINE_DETAIL_TRANSLATION_IDS.INVALID_DEFINITION)];
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
                {i18n._(PIPELINE_DETAIL_TRANSLATION_IDS.IMPORT_JSON)}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>
                            {i18n._(PIPELINE_DETAIL_TRANSLATION_IDS.IMPORT_FROM_JSON)}
                        </DialogTitle>
                        <DialogDescription>
                            {i18n._(
                                PIPELINE_DETAIL_TRANSLATION_IDS.IMPORT_JSON_DESCRIPTION,
                            )}
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
                                    {i18n._(
                                        PIPELINE_DETAIL_TRANSLATION_IDS.VALIDATION_ERRORS,
                                    )}
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
                                    ? i18n._(PIPELINE_DETAIL_TRANSLATION_IDS.VALIDATING)
                                    : i18n._(PIPELINE_DETAIL_TRANSLATION_IDS.VALIDATE)}
                            </Button>
                            <Button onClick={handleImport} disabled={!currentDefinition}>
                                {i18n._(PIPELINE_DETAIL_TRANSLATION_IDS.IMPORT)}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
