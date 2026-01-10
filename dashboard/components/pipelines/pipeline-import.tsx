import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from '@vendure/dashboard';
import * as React from 'react';
import { graphql } from '@/gql';
import { api } from '@vendure/dashboard';

interface Props {
    onImport: (definition: any) => void;
}

const validateDocument = graphql(`
    mutation ValidatePipelineDefForImport($definition: JSON!) {
        validateDataHubPipelineDefinition(definition: $definition) {
            isValid
            errors
        }
    }
`);

export function PipelineImportDialog({ onImport }: Readonly<Props>) {
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState('');
    const [errors, setErrors] = React.useState<string[]>([]);
    const [validating, setValidating] = React.useState(false);
    const [parsed, setParsed] = React.useState<any | null>(null);

    async function handleValidate() {
        setErrors([]);
        setParsed(null);
        try {
            const def = JSON.parse(text);
            setValidating(true);
            const res = await api.mutate(validateDocument, { definition: def });
            const result = res?.validateDataHubPipelineDefinition;
            if (result?.isValid) {
                setParsed(def);
            } else {
                setErrors(result?.errors ?? ["Invalid definition"]);
            }
        } catch (e) {
            setErrors([e instanceof Error ? e.message : 'Invalid JSON']);
        } finally {
            setValidating(false);
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
                            onChange={e => setText(e.target.value)}
                            placeholder='{"version":1,"steps":[]}'
                            className="font-mono min-h-[260px]"
                        />
                        {errors.length > 0 && (
                            <div className="border border-destructive/40 rounded-md p-3">
                                <div className="text-sm font-medium text-destructive mb-1">Validation errors</div>
                                <ul className="list-disc pl-5 text-sm">
                                    {errors.map((e, i) => (
                                        <li key={i}>{e}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleValidate} disabled={validating}>
                                {validating ? 'Validating…' : 'Validate'}
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

