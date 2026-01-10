import * as React from 'react';
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
import { autoMap } from './helpers';
import type { FieldMappingEditorProps } from './types';

export function FieldMappingEditor({ sourceColumns, targetSchema, mappings, onChange }: FieldMappingEditorProps) {
    const [showUnmapped, setShowUnmapped] = React.useState(true);

    const handleAutoMap = () => {
        const autoMappings = autoMap(sourceColumns, targetSchema);
        onChange(autoMappings);
        toast.success(`Auto-mapped ${autoMappings.filter(m => m.sourceField).length} fields`);
    };

    const updateMapping = (targetField: string, sourceField: string) => {
        const existing = mappings.find(m => m.targetField === targetField);
        if (existing) {
            onChange(mappings.map(m => m.targetField === targetField ? { ...m, sourceField } : m));
        } else {
            onChange([...mappings, { sourceField, targetField }]);
        }
    };

    const removeMapping = (targetField: string) => {
        onChange(mappings.filter(m => m.targetField !== targetField));
    };

    const getMappedSource = (targetField: string) => {
        return mappings.find(m => m.targetField === targetField)?.sourceField || '';
    };

    const unmappedSourceFields = sourceColumns.filter(
        col => !mappings.some(m => m.sourceField === col.name)
    );

    const unmappedTargetFields = targetSchema.filter(
        field => !mappings.some(m => m.targetField === field.name && m.sourceField)
    );

    return (
        <div className="space-y-4">
            {/* Toolbar */}
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
                    <Button variant="outline" size="sm" onClick={handleAutoMap}>
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

            {/* Mapping Table */}
            <div className="border rounded-lg overflow-hidden">
                <Table>
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
                                            value={mappedSource || '__none__'}
                                            onValueChange={v => updateMapping(target.name, v === '__none__' ? '' : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select source field" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">
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
                                        {sourceCol?.sampleValues.slice(0, 2).join(', ') || '-'}
                                    </TableCell>
                                    <TableCell>
                                        {mappedSource && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => removeMapping(target.name)}
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

            {/* Unmapped Source Fields */}
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
                                            <p>Sample: {col.sampleValues.slice(0, 3).join(', ')}</p>
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

export default FieldMappingEditor;
