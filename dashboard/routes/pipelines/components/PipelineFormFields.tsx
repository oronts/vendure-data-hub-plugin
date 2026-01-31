import * as React from 'react';
import {
    Badge,
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Switch,
} from '@vendure/dashboard';
import type { UseFormReturn, FieldValues } from 'react-hook-form';
import { FieldError } from '../../../components/common';
import { PIPELINE_STATUS, getStatusBadgeVariant, ERROR_MESSAGES } from '../../../constants';
import { CODE_PATTERN } from '../../../utils/form-validation';
import type { PipelineEntity, ValidationState } from '../../../types';
import { ValidationStatusBadge } from './ValidationPanel';

export interface PipelineFormFieldsProps {
    /** The form control instance from react-hook-form */
    form: UseFormReturn<FieldValues>;
    /** Whether the pipeline is being created (new) */
    creating: boolean;
    /** The pipeline entity (for existing pipelines) */
    entity?: PipelineEntity;
    /** Current validation state */
    validation: ValidationState;
    /** Whether validation is in progress */
    validationPending: boolean;
    /** Callback to show validation issues panel */
    onShowIssues: () => void;
}

/**
 * Form fields for the pipeline detail page.
 * Includes name, code, enabled toggle, and status display for existing pipelines.
 */
export function PipelineFormFields({
    form,
    creating,
    entity,
    validation,
    validationPending,
    onShowIssues,
}: Readonly<PipelineFormFieldsProps>) {
    return (
        <DetailFormGrid>
            <FormFieldWrapper
                name="name"
                label="Name"
                control={form.control}
                rules={{
                    required: ERROR_MESSAGES.NAME_REQUIRED,
                    minLength: {
                        value: 2,
                        message: ERROR_MESSAGES.MIN_LENGTH_2,
                    },
                }}
                render={({ field, fieldState }) => (
                    <div>
                        <Input
                            {...field}
                            placeholder="My Pipeline"
                            className={
                                fieldState.error
                                    ? 'border-destructive focus-visible:ring-destructive'
                                    : ''
                            }
                        />
                        <FieldError
                            error={fieldState.error?.message}
                            touched={fieldState.isTouched}
                        />
                    </div>
                )}
            />
            <FormFieldWrapper
                name="code"
                label="Code"
                control={form.control}
                rules={{
                    required: ERROR_MESSAGES.CODE_REQUIRED,
                    pattern: {
                        value: CODE_PATTERN,
                        message: ERROR_MESSAGES.CODE_PATTERN,
                    },
                }}
                render={({ field, fieldState }) => (
                    <div>
                        <Input
                            {...field}
                            placeholder="my-pipeline-code"
                            className={
                                fieldState.error
                                    ? 'border-destructive focus-visible:ring-destructive'
                                    : ''
                            }
                        />
                        <FieldError
                            error={fieldState.error?.message}
                            touched={fieldState.isTouched}
                        />
                        {!fieldState.error && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Letters, numbers, hyphens, and underscores only
                            </p>
                        )}
                    </div>
                )}
            />
            <FormFieldWrapper
                name="enabled"
                label="Enabled"
                control={form.control}
                render={({ field }) => (
                    <div className="flex items-center h-10">
                        <Switch
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                        />
                    </div>
                )}
            />
            {!creating && entity && (
                <>
                    <div className="col-span-2 text-sm flex items-center gap-2">
                        Status:{' '}
                        <Badge
                            variant={getStatusBadgeVariant(
                                entity.status ?? PIPELINE_STATUS.DRAFT
                            )}
                        >
                            {entity.status ?? PIPELINE_STATUS.DRAFT}
                        </Badge>
                        <span className="text-muted-foreground">
                            v{entity.version ?? 0}
                        </span>
                    </div>
                    <div className="col-span-2 text-sm flex items-center gap-3">
                        <span>
                            Published:{' '}
                            {entity.publishedAt
                                ? new Date(entity.publishedAt).toLocaleString()
                                : '-'}
                        </span>
                        <ValidationStatusBadge
                            validation={validation}
                            isLoading={validationPending}
                            onShowIssues={onShowIssues}
                        />
                    </div>
                </>
            )}
        </DetailFormGrid>
    );
}
