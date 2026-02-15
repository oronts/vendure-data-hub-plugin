import * as React from 'react';
import { useCallback } from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@vendure/dashboard';
import { Wand2, AlertCircle, X, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { computeAutoMappings } from '../../../utils';
import { UI_LIMITS, SENTINEL_VALUES, formatAutoMapped } from '../../../constants';
import type { FieldMappingEditorProps } from './Types';

export function FieldMappingEditor({ sourceColumns, targetSchema, mappings, onChange }: FieldMappingEditorProps) {
    const [showUnmapped, setShowUnmapped] = React.useState(true);

    const handleAutoMap = useCallback(() => {
        const sourceNames = sourceColumns.map(c => c.name);
        const targetNames = targetSchema.map(t => t.name);
        const requiredFields = targetSchema.filter(t => t.required).map(t => t.name);
        const results = computeAutoMappings(sourceNames, targetNames, {
            includeDots: false,
            includeUnmatchedRequired: true,
            requiredFields,
        });
        const autoMappings = results.map(r => ({ sourceField: r.sourceField, targetField: r.targetField }));
        onChange(autoMappings);
        toast.success(formatAutoMapped(autoMappings.filter(m => m.sourceField).length));
    }, [sourceColumns, targetSchema, onChange]);

    const updateMapping = useCallback((targetField: string, sourceField: string) => {
        const existing = mappings.find(m => m.targetField === targetField);
        if (existing) {
            onChange(mappings.map(m => m.targetField === targetField ? { ...m, sourceField } : m));
        } else {
            onChange([...mappings, { sourceField, targetField }]);
        }
    }, [mappings, onChange]);

    const removeMapping = useCallback((targetField: string) => {
        onChange(mappings.filter(m => m.targetField !== targetField));
    }, [mappings, onChange]);

    const getMappedSource = useCallback((targetField: string) => {
        return mappings.find(m => m.targetField === targetField)?.sourceField || '';
    }, [mappings]);

    const unmappedSourceFields = React.useMemo(() => sourceColumns.filter(
        col => !mappings.some(m => m.sourceField === col.name)
    ), [sourceColumns, mappings]);

    const unmappedTargetFields = React.useMemo(() => targetSchema.filter(
        field => !mappings.some(m => m.targetField === field.name && m.sourceField)
    ), [targetSchema, mappings]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">
                        {mappings.filter(m => m.sourceField).length} / {targetSchema.length} mapped
                    </Badge>
                    {unmappedTargetFields.some(f => f.required) && (
                        <Badge variant="destructive">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {unmappedTargetFields.filter(f => f.required).length} required fields unmapped
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleAutoMap} data-testid="datahub-field-mapping-auto-map-button">
                        <Wand2 className="w-4 h-4 mr-2" />
                        Auto-Map
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowUnmapped(!showUnmapped)}
                    >
                        {showUnmapped ? 'Hide' : 'Show'} Unmapped
                    </Button>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
                <Table data-testid="datahub-field-mapping-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-1/3">Target Field</TableHead>
                            <TableHead className="w-12 text-center" />
                            <TableHead className="w-1/3">Source Field</TableHead>
                            <TableHead>Preview</TableHead>
                            <TableHead className="w-12" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {targetSchema.map(target => {
                            const mappedSource = getMappedSource(target.name);
                            const sourceCol = sourceColumns.find(c => c.name === mappedSource);

                            return (
                                <TableRow key={target.name}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{target.name}</span>
                                            {target.required && (
                                                <Badge variant="destructive" className="text-xs">Required</Badge>
                                            )}
                                            <Badge variant="outline" className="text-xs">{target.type}</Badge>
                                        </div>
                                        {target.description && (
                                            <p className="text-xs text-muted-foreground mt-1">{target.description}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {mappedSource ? (
                                            <Link2 className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Unlink className="w-4 h-4 text-muted-foreground" />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={mappedSource || SENTINEL_VALUES.NONE}
                                            onValueChange={v => updateMapping(target.name, v === SENTINEL_VALUES.NONE ? '' : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select source field" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={SENTINEL_VALUES.NONE}>
                                                    <span className="text-muted-foreground">- None -</span>
                                                </SelectItem>
                                                {sourceColumns.map(col => (
                                                    <SelectItem key={col.name} value={col.name}>
                                                        <div className="flex items-center gap-2">
                                                            <span>{col.name}</span>
                                                            <Badge variant="outline" className="text-xs">{col.type}</Badge>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        {sourceCol?.sampleValues.slice(0, UI_LIMITS.SAMPLE_VALUES_LIMIT).join(', ') || '-'}
                                    </TableCell>
                                    <TableCell>
                                        {mappedSource && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => removeMapping(target.name)}
                                                aria-label={`Remove mapping for ${target.name}`}
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {showUnmapped && unmappedSourceFields.length > 0 && (
                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                            Unmapped Source Fields ({unmappedSourceFields.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                        <div className="flex flex-wrap gap-2">
                            {unmappedSourceFields.map(col => (
                                <TooltipProvider key={col.name}>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Badge variant="secondary" className="cursor-help">
                                                {col.name}
                                                <span className="ml-1 opacity-60">{col.type}</span>
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Sample: {col.sampleValues.slice(0, UI_LIMITS.SAMPLE_VALUES_LIMIT).join(', ')}</p>
                                            <p className="text-xs opacity-60">{col.uniqueCount} unique values</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
