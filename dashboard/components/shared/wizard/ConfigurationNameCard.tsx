import * as React from 'react';
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
    namePlaceholder = 'Configuration name',
    nameError,
    nameHelperText = 'A descriptive name to identify this configuration',
}: ConfigurationNameCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label>Name *</Label>
                    <Input
                        value={name}
                        onChange={e => onNameChange(e.target.value)}
                        placeholder={namePlaceholder}
                        className={nameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    <FieldError error={nameError} showImmediately />
                    {!nameError && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {nameHelperText}
                        </p>
                    )}
                </div>
                <div>
                    <Label>Description</Label>
                    <Textarea
                        value={description}
                        onChange={e => onDescriptionChange(e.target.value)}
                        placeholder="Optional description..."
                        rows={2}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
