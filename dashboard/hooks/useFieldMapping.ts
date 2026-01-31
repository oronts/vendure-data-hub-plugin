import * as React from 'react';
import { toast } from 'sonner';
import type { JsonValue } from '../../shared/types';
import { computeAutoMappings as computeAutoMappingsUtil } from '../utils';
import { formatAutoMapped } from '../constants';

export interface UIFieldMapping {
    sourceField: string;
    targetField: string;
    transform?: string;
    defaultValue?: JsonValue;
}

export interface SourceField {
    name: string;
    type?: string;
    sampleValues?: JsonValue[];
}

export interface TargetField {
    name: string;
    type?: string;
    required?: boolean;
    description?: string;
}

export interface UseFieldMappingOptions {
    sourceFields: SourceField[] | string[];
    targetFields: TargetField[] | string[];
    initialMappings?: UIFieldMapping[];
    autoMapOnInit?: boolean;
}

export interface UseFieldMappingResult {
    mappings: UIFieldMapping[];
    setMappings: React.Dispatch<React.SetStateAction<UIFieldMapping[]>>;
    autoMap: () => void;
    updateMapping: (targetField: string, sourceField: string) => void;
    removeMapping: (targetField: string) => void;
    clearMappings: () => void;
    getMappedSource: (targetField: string) => string | undefined;
    unmappedSourceFields: string[];
    unmappedTargetFields: string[];
    requiredUnmappedFields: string[];
    mappingCount: number;
    isComplete: boolean;
}

function normalizeSourceFields(fields: SourceField[] | string[]): SourceField[] {
    return fields.map(f => typeof f === 'string' ? { name: f } : f);
}

function normalizeTargetFields(fields: TargetField[] | string[]): TargetField[] {
    return fields.map(f => typeof f === 'string' ? { name: f } : f);
}

function computeAutoMappings(
    sourceFields: SourceField[],
    targetFields: TargetField[]
): UIFieldMapping[] {
    const sourceNames = sourceFields.map(s => s.name);
    const targetNames = targetFields.map(t => t.name);

    const results = computeAutoMappingsUtil(sourceNames, targetNames, { includeDots: true });

    return results.map(r => ({
        sourceField: r.sourceField,
        targetField: r.targetField,
    }));
}

export function useFieldMapping(options: UseFieldMappingOptions): UseFieldMappingResult {
    const {
        sourceFields: sourceFieldsInput,
        targetFields: targetFieldsInput,
        initialMappings = [],
        autoMapOnInit = false,
    } = options;

    const sourceFields = React.useMemo(
        () => normalizeSourceFields(sourceFieldsInput),
        [sourceFieldsInput]
    );

    const targetFields = React.useMemo(
        () => normalizeTargetFields(targetFieldsInput),
        [targetFieldsInput]
    );

    const [mappings, setMappings] = React.useState<UIFieldMapping[]>(initialMappings);
    const hasAutoMappedRef = React.useRef(false);

    React.useEffect(() => {
        if (autoMapOnInit && !hasAutoMappedRef.current && sourceFields.length > 0 && targetFields.length > 0) {
            hasAutoMappedRef.current = true;
            const autoMappings = computeAutoMappings(sourceFields, targetFields);
            setMappings(autoMappings);
        }
    }, [autoMapOnInit, sourceFields, targetFields]);

    const autoMap = React.useCallback(() => {
        const autoMappings = computeAutoMappings(sourceFields, targetFields);
        setMappings(autoMappings);
        const mappedCount = autoMappings.filter(m => m.sourceField).length;
        toast.success(formatAutoMapped(mappedCount));
    }, [sourceFields, targetFields]);

    const updateMapping = React.useCallback((targetField: string, sourceField: string) => {
        setMappings(prev => {
            const existing = prev.find(m => m.targetField === targetField);
            if (existing) {
                return prev.map(m =>
                    m.targetField === targetField
                        ? { ...m, sourceField }
                        : m
                );
            } else {
                return [...prev, { sourceField, targetField }];
            }
        });
    }, []);

    const removeMapping = React.useCallback((targetField: string) => {
        setMappings(prev => prev.filter(m => m.targetField !== targetField));
    }, []);

    const clearMappings = React.useCallback(() => {
        setMappings([]);
    }, []);

    const getMappedSource = React.useCallback((targetField: string): string | undefined => {
        return mappings.find(m => m.targetField === targetField)?.sourceField;
    }, [mappings]);

    const unmappedSourceFields = React.useMemo(() => {
        const mappedSources = new Set(mappings.filter(m => m.sourceField).map(m => m.sourceField));
        return sourceFields.filter(f => !mappedSources.has(f.name)).map(f => f.name);
    }, [sourceFields, mappings]);

    const unmappedTargetFields = React.useMemo(() => {
        const mappedTargets = new Set(mappings.filter(m => m.sourceField).map(m => m.targetField));
        return targetFields.filter(f => !mappedTargets.has(f.name)).map(f => f.name);
    }, [targetFields, mappings]);

    const requiredUnmappedFields = React.useMemo(() => {
        const mappedTargets = new Set(mappings.filter(m => m.sourceField).map(m => m.targetField));
        return targetFields
            .filter(f => f.required && !mappedTargets.has(f.name))
            .map(f => f.name);
    }, [targetFields, mappings]);

    const mappingCount = React.useMemo(() => {
        return mappings.filter(m => m.sourceField).length;
    }, [mappings]);

    const isComplete = React.useMemo(() => {
        return requiredUnmappedFields.length === 0;
    }, [requiredUnmappedFields]);

    return {
        mappings,
        setMappings,
        autoMap,
        updateMapping,
        removeMapping,
        clearMappings,
        getMappedSource,
        unmappedSourceFields,
        unmappedTargetFields,
        requiredUnmappedFields,
        mappingCount,
        isComplete,
    };
}
