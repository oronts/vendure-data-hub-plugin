import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { validatePipelineDefinitionDocument } from '../../../hooks';
import type { PipelineValidationResult, ValidationIssue } from '../../../types';
import { getErrorMessage } from '../../../../shared';
import type { ValidationState } from '../components';

/** Debounce delay (ms) before triggering validation after definition changes. */
const VALIDATION_DEBOUNCE_MS = 300;

const EMPTY_VALIDATION: ValidationState = {
    isValid: null,
    count: 0,
    issues: [],
    warnings: [],
};

/**
 * Parse the raw validation API response into a ValidationState.
 */
function parseValidationResult(out: PipelineValidationResult | undefined): ValidationState {
    const issues: ValidationIssue[] = Array.isArray(out?.issues)
        ? out.issues.map((i) => ({
              message: i.message,
              stepKey: i.stepKey ?? null,
              reason: i.reason ?? null,
              field: i.field ?? null,
          }))
        : [];

    const warnings: ValidationIssue[] = Array.isArray(out?.warnings)
        ? out.warnings.map((i) => ({
              message: i.message,
              stepKey: i.stepKey ?? null,
              reason: i.reason ?? null,
              field: i.field ?? null,
          }))
        : [];

    return {
        isValid: Boolean(out?.isValid),
        count: issues.length,
        issues,
        warnings,
    };
}

/**
 * Hook for auto-validating a pipeline definition with debouncing.
 *
 * Uses React Query `useMutation` for the API call while preserving
 * debounce (300ms) and race condition protection via a request counter.
 *
 * @param definition - The current pipeline definition to validate
 * @returns Validation state and pending status
 */
export function usePipelineValidation(definition: unknown): {
    validation: ValidationState;
    validationPending: boolean;
    setValidation: React.Dispatch<React.SetStateAction<ValidationState>>;
} {
    const [validation, setValidation] = React.useState<ValidationState>(EMPTY_VALIDATION);
    const requestIdRef = React.useRef(0);

    const validateMutation = useMutation({
        mutationFn: async (def: unknown) => {
            const res = await api.query(validatePipelineDefinitionDocument, {
                definition: def,
                level: 'FULL',
            });
            return res?.validateDataHubPipelineDefinition as PipelineValidationResult | undefined;
        },
    });

    React.useEffect(() => {
        if (!definition) {
            setValidation(EMPTY_VALIDATION);
            validateMutation.reset();
            return;
        }

        const requestId = ++requestIdRef.current;

        const timer = setTimeout(async () => {
            try {
                const out = await validateMutation.mutateAsync(definition);
                if (requestId !== requestIdRef.current) return;
                setValidation(parseValidationResult(out));
            } catch (e) {
                if (requestId !== requestIdRef.current) return;
                setValidation({
                    isValid: false,
                    count: 1,
                    issues: [
                        {
                            message: getErrorMessage(e),
                        },
                    ],
                    warnings: [],
                });
            }
        }, VALIDATION_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
        };
        // validateMutation is intentionally excluded: including it would cause infinite
        // re-triggers since useMutation returns a new object each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [definition]);

    return { validation, validationPending: validateMutation.isPending, setValidation };
}
