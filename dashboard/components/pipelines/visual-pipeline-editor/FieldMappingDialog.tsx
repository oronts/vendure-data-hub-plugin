import * as React from 'react';
import {
    Button,
    Badge,
    ScrollArea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { Wand2, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import type { FieldMappingDialogProps } from './types';

export function FieldMappingDialog({ open, onClose, sourceFields, targetSchema, mappings: initialMappings, onSave }: FieldMappingDialogProps) {
    const [mappings, setMappings] = React.useState<Record<string, string>>(initialMappings);

    React.useEffect(() => {
        setMappings(initialMappings);
    }, [initialMappings]);

    const autoMap = () => {
        if (!targetSchema) return;

        const newMappings: Record<string, string> = {};
        for (const field of targetSchema.fields) {
            // Exact match
            const exactMatch = sourceFields.find(s => s.toLowerCase() === field.key.toLowerCase());
            if (exactMatch) {
                newMappings[field.key] = exactMatch;
                continue;
            }
            // Fuzzy match
            const fuzzyMatch = sourceFields.find(s => {
                const src = s.toLowerCase().replace(/[_\-\s]/g, '');
                const tgt = field.key.toLowerCase().replace(/[_\-\s]/g, '');
                return src.includes(tgt) || tgt.includes(src);
            });
            if (fuzzyMatch) {
                newMappings[field.key] = fuzzyMatch;
            }
        }
        setMappings(newMappings);
        toast.success(`Auto-mapped ${Object.keys(newMappings).length} fields`);
    };

    return (
        <Dialog open={open} onOpenChange={() => onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Field Mapping</DialogTitle>
                    <DialogDescription>
                        Map source fields to {targetSchema?.label || 'target'} fields
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between mb-4">
                    <Badge variant="outline">
                        {Object.values(mappings).filter(Boolean).length} / {targetSchema?.fields.length || 0} mapped
                    </Badge>
                    <Button variant="outline" size="sm" onClick={autoMap}>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Auto-Map
                    </Button>
                </div>

                <ScrollArea className="max-h-[400px]">
                    <div className="space-y-2">
                        {targetSchema?.fields.map(field => (
                            <div key={field.key} className="flex items-center gap-4 p-2 rounded border">
                                <div className="w-1/3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{field.key}</span>
                                        {field.required && (
                                            <Badge variant="destructive" className="text-xs h-4">Required</Badge>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{field.type}</div>
                                </div>
                                <div className="flex items-center">
                                    {mappings[field.key] ? (
                                        <Link2 className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <Unlink className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <Select
                                        value={mappings[field.key] || '__none__'}
                                        onValueChange={v => setMappings(m => ({ ...m, [field.key]: v === '__none__' ? '' : v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select source field" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">
                                                <span className="text-muted-foreground">-- None --</span>
                                            </SelectItem>
                                            {sourceFields.map(f => (
                                                <SelectItem key={f} value={f}>{f}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => { onSave(mappings); onClose(); }}>
                        Save Mappings
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default FieldMappingDialog;
