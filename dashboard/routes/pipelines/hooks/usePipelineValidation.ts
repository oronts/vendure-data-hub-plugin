import * as React from 'react';
import { api } from '@vendure/dashboard';
import { validatePipelineDefinitionDocument } from '../../../hooks';
import type { PipelineValidationResult, ValidationIssue } from '../../../types';
import type { ValidationState } from '../components';

/**
 * Hook for auto-validating a pipeline definition with debouncing.
 *
 * @param definition - The current pipeline definition to validate
 * @returns Validation state and pending status
 */
export function usePipelineValidation(definition: unknown): {
    validation: ValidationState;
    validationPending: boolean;
    setValidation: React.Dispatch<React.SetStateAction<ValidationState>>;
} {
    const [validation, setValidation] = React.useState<ValidationState>({
        isValid: null,
        count: 0,
        issues: [],
        warnings: [],
    });
    const [validationPending, setValidationPending] = React.useState(false);
    const requestIdRef = React.useRef(0);

    React.useEffect(() => {
        if (!definition) {
            setValidation({ isValid: null, count: 0, issues: [], warnings: [] });
            setValidationPending(false);
            return;
        }

        const requestId = ++requestIdRef.current;

        const timer = setTimeout(async () => {
            setValidationPending(true);
            try {
                const res = await api.mutate(validatePipelineDefinitionDocument, {
                    definition,
                    level: 'full',
                });
                if (requestId !== requestIdRef.current) return;

                const out = res?.validateDataHubPipelineDefinition as
                    | PipelineValidationResult
                    | undefined;

                const issues: ValidationIssue[] = Array.isArray(out?.issues)
                    ? out.issues.map((i) => ({
                          message: i.message,
                          stepKey: i.stepKey ?? null,
                          reason: i.reason ?? null,
                          field: i.field ?? null,
                      }))
                    : (Array.isArray(out?.errors) ? out.errors : []).map((m) => ({
                          message: String(m),
                      }));

                const warnings: ValidationIssue[] = Array.isArray(out?.warnings)
                    ? out.warnings.map((i) => ({
                          message: i.message,
                          stepKey: i.stepKey ?? null,
                          reason: i.reason ?? null,
                          field: i.field ?? null,
                      }))
                    : [];

                setValidation({
                    isValid: Boolean(out?.isValid),
                    count: issues.length,
                    issues,
                    warnings,
                });
            } catch (e) {
                if (requestId === requestIdRef.current) {
                    setValidation({
                        isValid: false,
                        count: 1,
                        issues: [
                            {
                                message:
                                    e instanceof Error ? e.message : 'Validation failed',
                            },
                        ],
                        warnings: [],
                    });
                }
            } finally {
                if (requestId === requestIdRef.current) {
                    setValidationPending(false);
                }
            }
        }, 300);

        return () => {
            clearTimeout(timer);
        };
    }, [definition]);

    return { validation, validationPending, setValidation };
}
