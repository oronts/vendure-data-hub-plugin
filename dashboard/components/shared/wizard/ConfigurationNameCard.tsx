import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Textarea,
} from '@vendure/dashboard';
import { FieldError } from '../../common/ValidationFeedback';
import type { ConfigurationNameCardProps } from '../../../types';

export function ConfigurationNameCard({
    title,
    name,
    description,
    onNameChange,
    onDescriptionChange,
    namePlaceholder,
    nameError,
    nameHelperText,
}: ConfigurationNameCardProps) {
    const { t } = useLingui();
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="config-name">
                        <Trans>Name</Trans> *
                    </Label>
                    <Input
                        id="config-name"
                        value={name}
                        onChange={e => onNameChange(e.target.value)}
                        placeholder={namePlaceholder ?? t`Enter a name`}
                        aria-invalid={Boolean(nameError)}
                        className={nameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    <FieldError error={nameError} showImmediately />
                    {!nameError && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {nameHelperText ?? t`Use a clear, descriptive name`}
                        </p>
                    )}
                </div>
                <div>
                    <Label htmlFor="config-description">
                        <Trans>Description</Trans>
                    </Label>
                    <Textarea
                        id="config-description"
                        value={description}
                        onChange={e => onDescriptionChange(e.target.value)}
                        placeholder={t`Describe this configuration`}
                        rows={2}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
