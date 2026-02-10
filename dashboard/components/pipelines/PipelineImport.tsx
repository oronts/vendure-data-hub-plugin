import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from '@vendure/dashboard';
import * as React from 'react';
import { useValidatePipelineDefinition } from '../../hooks';
import type { PipelineDefinition } from '../../types';

interface Props {
    onImport: (definition: PipelineDefinition) => void;
}

export function PipelineImportDialog({ onImport }: Readonly<Props>) {
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState('');
    const [errors, setErrors] = React.useState<string[]>([]);
    const [parsed, setParsed] = React.useState<PipelineDefinition | null>(null);

    const validateMutation = useValidatePipelineDefinition();

    async function handleValidate() {
        setErrors([]);
        setParsed(null);
        try {
            const def = JSON.parse(text);
            const result = await validateMutation.mutateAsync(def);
            if (result?.isValid) {
                setParsed(def);
            } else {
                setErrors(result?.errors ?? ['Invalid definition']);
            }
        } catch (e) {
            setErrors([e instanceof Error ? e.message : 'Invalid JSON']);
        }
    }

    function handleImport() {
        if (parsed) {
            onImport(parsed);
            setOpen(false);
            setText('');
            setErrors([]);
            setParsed(null);
        }
    }

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                Import JSON
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Import pipeline from JSON</DialogTitle>
                        <DialogDescription>Paste a PipelineDefinition JSON and validate before importing.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder='{"version":1,"steps":[]}'
                            className="font-mono min-h-[260px]"
                        />
                        {errors.length > 0 && (
                            <div className="border border-destructive/40 rounded-md p-3">
                                <div className="text-sm font-medium text-destructive mb-1">Validation errors</div>
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
                                {validateMutation.isPending ? 'Validating…' : 'Validate'}
                            </Button>
                            <Button onClick={handleImport} disabled={!parsed}>
                                Import
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
