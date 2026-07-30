import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Textarea,
} from '@vendure/dashboard';
import type { UseFormReturn } from 'react-hook-form';
import { DataHubFeedFormat } from '../../gql/graphql';
import type { FeedFormValues } from './feed-form';

interface FeedFormatOption {
    code: DataHubFeedFormat;
    label: string;
    description: string;
}

interface FeedDefinitionFieldsProps {
    form: UseFormReturn<FeedFormValues>;
    formats: FeedFormatOption[];
    disabled: boolean;
}

export function FeedDefinitionFields({
    form,
    formats,
    disabled,
}: Readonly<FeedDefinitionFieldsProps>) {
    const { t } = useLingui();
    const fieldIdPrefix = React.useId();
    const fieldIds = {
        nameLabel: `${fieldIdPrefix}-name-label`,
        codeLabel: `${fieldIdPrefix}-code-label`,
        formatLabel: `${fieldIdPrefix}-format-label`,
        customGeneratorLabel: `${fieldIdPrefix}-custom-generator-label`,
        customGeneratorDescription: `${fieldIdPrefix}-custom-generator-description`,
        scheduleEnabledLabel: `${fieldIdPrefix}-schedule-enabled-label`,
        scheduleEnabledDescription: `${fieldIdPrefix}-schedule-enabled-description`,
        scheduleCronLabel: `${fieldIdPrefix}-schedule-cron-label`,
        scheduleCronDescription: `${fieldIdPrefix}-schedule-cron-description`,
        scheduleTimezoneLabel: `${fieldIdPrefix}-schedule-timezone-label`,
        scheduleTimezoneDescription: `${fieldIdPrefix}-schedule-timezone-description`,
    } as const;
    const format = form.watch('format');
    const scheduleEnabled = form.watch('scheduleEnabled');

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{t`Feed definition`}</CardTitle>
                    <CardDescription>
                        {t`The code is unique within the active channel. Changing a saved definition removes its previous artifact.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <DetailFormGrid>
                        <FormFieldWrapper
                            control={form.control}
                            name="name"
                            label={(
                                <span id={fieldIds.nameLabel}>
                                    {t`Name`}
                                </span>
                            )}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    aria-labelledby={fieldIds.nameLabel}
                                    disabled={disabled}
                                    placeholder={t`Google Shopping Germany`}
                                    maxLength={255}
                                />
                            )}
                        />
                        <FormFieldWrapper
                            control={form.control}
                            name="code"
                            label={(
                                <span id={fieldIds.codeLabel}>
                                    {t`Code`}
                                </span>
                            )}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    aria-labelledby={fieldIds.codeLabel}
                                    disabled={disabled}
                                    placeholder="google-shopping-de"
                                    maxLength={50}
                                    className="font-mono"
                                />
                            )}
                        />
                    </DetailFormGrid>
                    <FormFieldWrapper
                        control={form.control}
                        name="format"
                        label={(
                            <span id={fieldIds.formatLabel}>
                                {t`Format`}
                            </span>
                        )}
                        renderFormControl={false}
                        render={({ field }) => (
                            <Select
                                value={field.value}
                                onValueChange={value => field.onChange(value as DataHubFeedFormat)}
                                disabled={disabled}
                            >
                                <SelectTrigger aria-labelledby={fieldIds.formatLabel}>
                                    <SelectValue
                                        placeholder={t`Select a feed format`}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {formats.map(option => (
                                        <SelectItem key={option.code} value={option.code}>
                                            <span className="flex flex-col">
                                                <span>{option.label}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {option.description}
                                                </span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    />
                    {format === DataHubFeedFormat.CUSTOM && (
                        <FormFieldWrapper
                            control={form.control}
                            name="customGeneratorCode"
                            label={(
                                <span id={fieldIds.customGeneratorLabel}>
                                    {t`Custom generator code`}
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.customGeneratorDescription}>
                                    {t`Must match a custom feed generator registered by server configuration.`}
                                </span>
                            )}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    aria-labelledby={fieldIds.customGeneratorLabel}
                                    aria-describedby={fieldIds.customGeneratorDescription}
                                    disabled={disabled}
                                    placeholder="amazon-marketplace"
                                    className="font-mono"
                                />
                            )}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t`Schedule`}</CardTitle>
                    <CardDescription>
                        {t`Optionally regenerate this feed on a standard five-field cron schedule.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <FormFieldWrapper
                        control={form.control}
                        name="scheduleEnabled"
                        label={(
                            <span id={fieldIds.scheduleEnabledLabel}>
                                {t`Automatic generation`}
                            </span>
                        )}
                        description={(
                            <span id={fieldIds.scheduleEnabledDescription}>
                                {scheduleEnabled ? t`Enabled` : t`Manual only`}
                            </span>
                        )}
                        render={({ field }) => (
                            <Switch
                                checked={field.value}
                                aria-labelledby={fieldIds.scheduleEnabledLabel}
                                aria-describedby={fieldIds.scheduleEnabledDescription}
                                onCheckedChange={field.onChange}
                                disabled={disabled}
                            />
                        )}
                    />
                    {scheduleEnabled && (
                        <DetailFormGrid>
                            <FormFieldWrapper
                                control={form.control}
                                name="scheduleCron"
                                label={(
                                    <span id={fieldIds.scheduleCronLabel}>
                                        {t`Cron expression`}
                                    </span>
                                )}
                                description={(
                                    <span id={fieldIds.scheduleCronDescription}>
                                        {t`Minute, hour, day of month, month, and weekday.`}
                                    </span>
                                )}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        aria-labelledby={fieldIds.scheduleCronLabel}
                                        aria-describedby={fieldIds.scheduleCronDescription}
                                        disabled={disabled}
                                        placeholder="0 4 * * *"
                                        className="font-mono"
                                    />
                                )}
                            />
                            <FormFieldWrapper
                                control={form.control}
                                name="scheduleTimezone"
                                label={(
                                    <span id={fieldIds.scheduleTimezoneLabel}>
                                        {t`Timezone`}
                                    </span>
                                )}
                                description={(
                                    <span id={fieldIds.scheduleTimezoneDescription}>
                                        {t`Optional IANA timezone. Server timezone is used when empty.`}
                                    </span>
                                )}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        aria-labelledby={fieldIds.scheduleTimezoneLabel}
                                        aria-describedby={fieldIds.scheduleTimezoneDescription}
                                        disabled={disabled}
                                        placeholder="Europe/Berlin"
                                    />
                                )}
                            />
                        </DetailFormGrid>
                    )}
                </CardContent>
            </Card>

            <AdvancedFeedConfiguration form={form} disabled={disabled} />
        </div>
    );
}

function AdvancedFeedConfiguration({
    form,
    disabled,
}: Readonly<Pick<FeedDefinitionFieldsProps, 'form' | 'disabled'>>) {
    const { t } = useLingui();
    const fieldIdPrefix = React.useId();
    const fields = [
        {
            name: 'filters',
            label: t`Filters`,
            description: t`Product selection, such as inStock, hasPrice, minPrice, maxPrice, or categories.`,
            placeholder: '{\n  "inStock": true,\n  "minPrice": 10\n}',
        },
        {
            name: 'fieldMappings',
            label: t`Field mappings`,
            description: t`Output fields mapped to source paths or mapping objects.`,
            placeholder: '{\n  "title": "product.name",\n  "sku": { "source": "sku" }\n}',
        },
        {
            name: 'options',
            label: t`Generator options`,
            description: t`Format settings such as currency, language, baseUrl, imageSize, or UTM parameters.`,
            placeholder: '{\n  "currency": "EUR",\n  "baseUrl": "https://shop.example.com"\n}',
        },
    ] as const;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t`Advanced configuration`}</CardTitle>
                <CardDescription>
                    {t`Optional JSON objects passed to the product query and selected generator.`}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {fields.map(config => {
                    const labelId = `${fieldIdPrefix}-${config.name}-label`;
                    const descriptionId = `${fieldIdPrefix}-${config.name}-description`;
                    return (
                        <FormFieldWrapper
                            key={config.name}
                            control={form.control}
                            name={config.name}
                            label={<span id={labelId}>{config.label}</span>}
                            description={<span id={descriptionId}>{config.description}</span>}
                            render={({ field }) => (
                                <Textarea
                                    {...field}
                                    aria-labelledby={labelId}
                                    aria-describedby={descriptionId}
                                    disabled={disabled}
                                    value={field.value}
                                    rows={6}
                                    placeholder={config.placeholder}
                                    className="font-mono text-xs"
                                    spellCheck={false}
                                />
                            )}
                        />
                    );
                })}
            </CardContent>
        </Card>
    );
}
