import * as React from 'react';
import {
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Switch,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { CODE_PATTERN, formatDateTime } from '../../../utils';
import type { PipelineEntity, ValidationState } from '../../../types';
import { ValidationStatusBadge } from './ValidationPanel';
import {
    PipelineCapabilityBadges,
    PipelineStatusBadge,
} from '../../../components/shared';

export interface PipelineFormFieldsProps<TFormValues extends FieldValues> {
    control: Control<TFormValues>;
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
    readOnly: boolean;
}

/**
 * Form fields for the pipeline detail page.
 * Includes name, code, enabled toggle, and status display for existing pipelines.
 */
export function PipelineFormFields<TFormValues extends FieldValues>({
    control,
    creating,
    entity,
    validation,
    validationPending,
    onShowIssues,
    readOnly,
}: Readonly<PipelineFormFieldsProps<TFormValues>>) {
    const { i18n, t } = useLingui();
    const fieldIdPrefix = React.useId();
    const fieldIds = {
        nameLabel: `${fieldIdPrefix}-name-label`,
        codeLabel: `${fieldIdPrefix}-code-label`,
        codeDescription: `${fieldIdPrefix}-code-description`,
        enabledLabel: `${fieldIdPrefix}-enabled-label`,
    } as const;

    return (
        <DetailFormGrid>
            <FormFieldWrapper
                name={'name' as Path<TFormValues>}
                label={(
                    <span id={fieldIds.nameLabel}>
                        <Trans>Name</Trans>
                    </span>
                )}
                control={control}
                rules={{
                    required: t`Name is required`,
                    minLength: {
                        value: 2,
                        message: t`Name must be at least 2 characters`,
                    },
                }}
                render={({ field }) => (
                    <Input
                        {...field}
                        aria-labelledby={fieldIds.nameLabel}
                        disabled={readOnly}
                        placeholder={t`My Pipeline`}
                        data-testid="pipeline-name-input"
                    />
                )}
            />
            <FormFieldWrapper
                name={'code' as Path<TFormValues>}
                label={(
                    <span id={fieldIds.codeLabel}>
                        <Trans>Code</Trans>
                    </span>
                )}
                description={(
                    <span id={fieldIds.codeDescription}>
                        <Trans>Letters, numbers, hyphens, and underscores only</Trans>
                    </span>
                )}
                control={control}
                rules={{
                    required: t`Code is required`,
                    pattern: {
                        value: CODE_PATTERN,
                        message: t`Must start with a letter and contain only letters, numbers, hyphens, and underscores`,
                    },
                }}
                render={({ field }) => (
                    <Input
                        {...field}
                        aria-labelledby={fieldIds.codeLabel}
                        aria-describedby={fieldIds.codeDescription}
                        placeholder={t`my-pipeline-code`}
                        disabled={readOnly}
                        data-testid="pipeline-code-input"
                    />
                )}
            />
            <FormFieldWrapper
                name={'enabled' as Path<TFormValues>}
                label={(
                    <span id={fieldIds.enabledLabel}>
                        <Trans>Enabled</Trans>
                    </span>
                )}
                control={control}
                render={({ field }) => (
                    <Switch
                        checked={Boolean(field.value)}
                        aria-labelledby={fieldIds.enabledLabel}
                        onCheckedChange={field.onChange}
                        disabled={readOnly}
                        data-testid="pipeline-enabled-toggle"
                    />
                )}
            />
            {!creating && entity && (
                <>
                    <div className="col-span-2 text-sm flex items-center gap-2">
                        <Trans>Status</Trans>:{' '}
                        <PipelineStatusBadge status={entity.status} />
                        <span className="text-muted-foreground">
                            v{entity.version ?? 0}
                        </span>
                    </div>
                    <div className="col-span-2 text-sm flex items-center gap-3">
                        <span>
                            <Trans>Published</Trans>:{' '}
                            {entity.publishedAt
                                ? formatDateTime(entity.publishedAt, undefined, i18n.locale)
                                : '-'}
                        </span>
                        <ValidationStatusBadge
                            validation={validation}
                            isLoading={validationPending}
                            onShowIssues={onShowIssues}
                        />
                    </div>
                    <div className="col-span-2 space-y-2 text-sm">
                        <span><Trans>Capabilities</Trans></span>
                        <PipelineCapabilityBadges
                            requiredCapabilities={entity.requiredCapabilities}
                            writeCapabilities={entity.writeCapabilities}
                        />
                    </div>
                </>
            )}
        </DetailFormGrid>
    );
}
