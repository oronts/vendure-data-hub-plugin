import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import {
    CheckCircle2,
    Loader2,
    Play,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../../shared';
import {
    TEST_STATUS,
} from '../../../constants';
import { useOptionValues } from '../../../hooks/api/use-config-options';
import { previewExtract } from '../../../hooks/api/use-step-tester';
import { validateUrl } from '../../../utils/form-validation';
import { HeadersEditor } from '../../common/HeadersEditor';
import { IMPORT_PLACEHOLDERS } from './constants';
import { mergeApiSourceConfig } from './source-config';
import type {
    ApiMethod,
    ImportConfiguration,
} from './types';

const API_TEST_TIMEOUT_MS = 10_000;

interface SourceApiConfigProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

export function SourceApiConfig({
    config,
    updateConfig,
}: SourceApiConfigProps) {
    const { t } = useLingui();
    const { options: methods } = useOptionValues('httpMethods');
    const [testStatus, setTestStatus] = React.useState<
        typeof TEST_STATUS[keyof typeof TEST_STATUS]
    >(TEST_STATUS.IDLE);
    const updateApiConfig = React.useCallback(
        (updates: Parameters<typeof mergeApiSourceConfig>[1]) => {
            updateConfig({
                source: mergeApiSourceConfig(config.source, updates),
            });
        },
        [config.source, updateConfig],
    );

    const handleTestConnection = async () => {
        const url = config.source?.apiConfig?.url;
        if (!url) {
            toast.error(t`URL is required`);
            return;
        }

        const urlError = validateUrl(
            url,
            t`URL`,
        );
        if (urlError) {
            toast.error(t`Enter a valid URL`);
            return;
        }

        setTestStatus(TEST_STATUS.TESTING);
        try {
            await previewExtract({
                config: {
                    adapterCode: 'httpApi',
                    ...config.source?.apiConfig,
                    timeoutMs: API_TEST_TIMEOUT_MS,
                },
            }, 1);
            setTestStatus(TEST_STATUS.SUCCESS);
            toast.success(
                t`Connection successful`,
            );
        } catch (error) {
            setTestStatus(TEST_STATUS.ERROR);
            toast.error(
                t`Connection failed`,
                { description: getErrorMessage(error) },
            );
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    <Trans>API configuration</Trans>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                        <Label htmlFor="import-source-api-method">
                            <Trans>Method</Trans>
                        </Label>
                        <Select
                            value={config.source?.apiConfig?.method ?? 'GET'}
                            onValueChange={method =>
                                updateApiConfig({ method: method as ApiMethod })}
                        >
                            <SelectTrigger id="import-source-api-method">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {methods.map(method => (
                                    <SelectItem
                                        key={method.value}
                                        value={method.value}
                                    >
                                        {method.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="md:col-span-3">
                        <Label htmlFor="import-source-api-url">
                            <Trans>URL</Trans>
                        </Label>
                        <Input
                            id="import-source-api-url"
                            type="url"
                            value={config.source?.apiConfig?.url ?? ''}
                            onChange={event =>
                                updateApiConfig({ url: event.target.value })}
                            placeholder={IMPORT_PLACEHOLDERS.apiUrl}
                        />
                    </div>
                </div>

                <HeadersEditor
                    headers={config.source?.apiConfig?.headers ?? {}}
                    onChange={headers => updateApiConfig({ headers })}
                />

                <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={
                        testStatus === TEST_STATUS.TESTING
                        || !config.source?.apiConfig?.url
                    }
                >
                    {testStatus === TEST_STATUS.TESTING ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : testStatus === TEST_STATUS.SUCCESS ? (
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                    ) : testStatus === TEST_STATUS.ERROR ? (
                        <XCircle className="w-4 h-4 mr-2 text-red-600" />
                    ) : (
                        <Play className="w-4 h-4 mr-2" />
                    )}
                    {testStatus === TEST_STATUS.TESTING
                        ? t`Testing...`
                        : t`Test connection`}
                </Button>
            </CardContent>
        </Card>
    );
}
