export interface FieldValidationError {
    field: string;
    message: string;
    type: 'required' | 'format' | 'range' | 'custom';
}

export interface FormValidationResult {
    isValid: boolean;
    errors: FieldValidationError[];
    errorsByField: Record<string, string>;
}

type TranslationValues = Record<string, string | number>;
export type FormValidationTranslate = (id: string, values?: TranslationValues) => string;

export function localizedMessage(
    translate: FormValidationTranslate | undefined,
    id: string,
    fallback: string,
    values?: TranslationValues,
): string {
    return translate?.(id, values) ?? fallback;
}

export function createValidationResult(
    errors: FieldValidationError[],
): FormValidationResult {
    return {
        isValid: errors.length === 0,
        errors,
        errorsByField: Object.fromEntries(
            errors.map(error => [error.field, error.message]),
        ),
    };
}
