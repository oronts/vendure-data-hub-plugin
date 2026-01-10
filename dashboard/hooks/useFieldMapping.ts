/**
 * useFieldMapping Hook
 * Custom hook for auto-mapping and managing field mappings between source and target schemas
 */

import * as React from 'react';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

export interface FieldMapping {
    sourceField: string;
    targetField: string;
    transform?: string;
    defaultValue?: any;
}

export interface SourceField {
    name: string;
    type?: string;
    sampleValues?: any[];
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
    initialMappings?: FieldMapping[];
    autoMapOnInit?: boolean;
}

export interface UseFieldMappingResult {
    mappings: FieldMapping[];
    setMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>;
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

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

function normalizeSourceFields(fields: SourceField[] | string[]): SourceField[] {
    return fields.map(f => typeof f === 'string' ? { name: f } : f);
}

function normalizeTargetFields(fields: TargetField[] | string[]): TargetField[] {
    return fields.map(f => typeof f === 'string' ? { name: f } : f);
}

// =============================================================================
// AUTO-MAPPING ALGORITHM
// =============================================================================

function computeAutoMappings(
    sourceFields: SourceField[],
    targetFields: TargetField[]
): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    const usedSources = new Set<string>();

    for (const target of targetFields) {
        // Try exact match first (case-insensitive)
        const exactMatch = sourceFields.find(
            s => s.name.toLowerCase() === target.name.toLowerCase() && !usedSources.has(s.name)
        );

        if (exactMatch) {
            mappings.push({ sourceField: exactMatch.name, targetField: target.name });
            usedSources.add(exactMatch.name);
            continue;
        }

        // Try fuzzy match (removing separators and comparing)
        const normalize = (str: string) => str.toLowerCase().replace(/[_\-\s.]/g, '');
        const targetNormalized = normalize(target.name);

        const fuzzyMatch = sourceFields.find(s => {
            if (usedSources.has(s.name)) return false;
            const sourceNormalized = normalize(s.name);
            return sourceNormalized.includes(targetNormalized) || targetNormalized.includes(sourceNormalized);
        });

        if (fuzzyMatch) {
            mappings.push({ sourceField: fuzzyMatch.name, targetField: target.name });
            usedSources.add(fuzzyMatch.name);
            continue;
        }

        // Try common field name variations
        const variations: Record<string, string[]> = {
            'id': ['identifier', 'uid', 'uuid', 'key'],
            'name': ['title', 'label', 'displayname'],
            'description': ['desc', 'summary', 'details', 'content'],
            'price': ['cost', 'amount', 'value'],
            'sku': ['productcode', 'itemcode', 'code', 'articleno', 'articlenumber'],
            'quantity': ['qty', 'stock', 'count', 'inventory'],
            'email': ['mail', 'emailaddress'],
            'phone': ['tel', 'telephone', 'phonenumber', 'mobile'],
            'address': ['street', 'streetaddress'],
            'city': ['town'],
            'country': ['countrycode', 'nation'],
            'image': ['photo', 'picture', 'img', 'imageurl', 'pictureurl'],
            'category': ['categoryname', 'productcategory', 'type'],
            'brand': ['manufacturer', 'vendor', 'supplier'],
            'weight': ['mass'],
            'enabled': ['active', 'status', 'available', 'isenabled', 'isactive'],
            'createdat': ['created', 'creationdate', 'datecreated'],
            'updatedat': ['updated', 'modifiedat', 'modified', 'lastmodified'],
        };

        const targetLower = target.name.toLowerCase();
        const variationMatch = sourceFields.find(s => {
            if (usedSources.has(s.name)) return false;
            const sourceLower = normalize(s.name);

            // Check if source matches any variation of target
            const targetVariations = variations[targetLower] || [];
            if (targetVariations.some(v => normalize(v) === sourceLower)) return true;

            // Check if target matches any variation of source
            for (const [base, vars] of Object.entries(variations)) {
                if (normalize(base) === sourceLower && vars.some(v => normalize(v) === targetNormalized)) {
                    return true;
                }
            }

            return false;
        });

        if (variationMatch) {
            mappings.push({ sourceField: variationMatch.name, targetField: target.name });
            usedSources.add(variationMatch.name);
        }
    }

    return mappings;
}

// =============================================================================
// HOOK
// =============================================================================

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

    const [mappings, setMappings] = React.useState<FieldMapping[]>(initialMappings);

    // Auto-map on init if requested
    React.useEffect(() => {
        if (autoMapOnInit && mappings.length === 0 && sourceFields.length > 0 && targetFields.length > 0) {
            const autoMappings = computeAutoMappings(sourceFields, targetFields);
            setMappings(autoMappings);
        }
    }, [autoMapOnInit, sourceFields, targetFields]);

    const autoMap = React.useCallback(() => {
        const autoMappings = computeAutoMappings(sourceFields, targetFields);
        setMappings(autoMappings);
        const mappedCount = autoMappings.filter(m => m.sourceField).length;
        toast.success(`Auto-mapped ${mappedCount} fields`);
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

export default useFieldMapping;
