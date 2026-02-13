import { normalizeString } from './string-helpers';

export const FIELD_VARIATIONS: Record<string, string[]> = {
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

interface FieldMappingResult {
    sourceField: string;
    targetField: string;
}

interface AutoMapOptions {
    includeDots?: boolean;
    customVariations?: Record<string, string[]>;
    includeUnmatchedRequired?: boolean;
    requiredFields?: string[];
}

export function computeAutoMappings(
    sourceFields: string[],
    targetFields: string[],
    options: AutoMapOptions = {}
): FieldMappingResult[] {
    const {
        includeDots = true,
        customVariations = {},
        includeUnmatchedRequired = false,
        requiredFields = [],
    } = options;

    const mappings: FieldMappingResult[] = [];
    const usedSources = new Set<string>();

    const variations: Record<string, string[]> = {
        ...FIELD_VARIATIONS,
        ...customVariations,
    };

    for (const target of targetFields) {
        const exactMatch = sourceFields.find(
            s => s.toLowerCase() === target.toLowerCase() && !usedSources.has(s)
        );

        if (exactMatch) {
            mappings.push({ sourceField: exactMatch, targetField: target });
            usedSources.add(exactMatch);
            continue;
        }

        const targetNormalized = normalizeString(target, { includeDots });

        const fuzzyMatch = sourceFields.find(s => {
            if (usedSources.has(s)) return false;
            const sourceNormalized = normalizeString(s, { includeDots });
            return sourceNormalized.includes(targetNormalized) || targetNormalized.includes(sourceNormalized);
        });

        if (fuzzyMatch) {
            mappings.push({ sourceField: fuzzyMatch, targetField: target });
            usedSources.add(fuzzyMatch);
            continue;
        }

        const targetLower = target.toLowerCase();
        const variationMatch = sourceFields.find(s => {
            if (usedSources.has(s)) return false;
            const sourceLower = normalizeString(s, { includeDots });

            const targetVariations = variations[targetLower] || [];
            if (targetVariations.some(v => normalizeString(v, { includeDots }) === sourceLower)) {
                return true;
            }

            for (const [base, vars] of Object.entries(variations)) {
                if (normalizeString(base, { includeDots }) === sourceLower &&
                    vars.some(v => normalizeString(v, { includeDots }) === targetNormalized)) {
                    return true;
                }
            }

            return false;
        });

        if (variationMatch) {
            mappings.push({ sourceField: variationMatch, targetField: target });
            usedSources.add(variationMatch);
            continue;
        }

        if (includeUnmatchedRequired && requiredFields.includes(target)) {
            mappings.push({ sourceField: '', targetField: target });
        }
    }

    return mappings;
}

function mappingsToRecord(mappings: FieldMappingResult[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const mapping of mappings) {
        if (mapping.sourceField) {
            result[mapping.targetField] = mapping.sourceField;
        }
    }
    return result;
}
