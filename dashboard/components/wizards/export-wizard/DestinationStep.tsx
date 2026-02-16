import { useCallback, memo } from 'react';
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
    FolderOpen,
    Server,
    Send,
    Cloud,
    HardDrive,
    Play,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WizardStepContainer } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { JsonTextarea } from '../../common/JsonTextarea';
import { STEP_CONTENT, PLACEHOLDERS } from './constants';
import type { ExportConfiguration, DestinationType, HttpMethod, HttpAuthType } from './types';
import {
    EXPORT_DESTINATION_TYPES,
    HTTP_METHODS,
    HTTP_AUTH_TYPES,
    EXPORT_DEFAULTS,
    UI_DEFAULTS,
    SENTINEL_VALUES,
    DESTINATION_TYPE,
} from '../../../constants';

interface DestinationStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

const DESTINATION_TYPE_ICONS: Record<string, LucideIcon> = {
    DOWNLOAD: FolderOpen,
    FILE: FolderOpen,
    SFTP: Server,
    HTTP: Send,
    S3: Cloud,
    GCS: Cloud,
    ASSET: HardDrive,
};

export function DestinationStep({ config, updateConfig, errors = {} }: DestinationStepProps) {
    const destination = config.destination ?? { type: 'FILE' };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.destination.title}
            description={STEP_CONTENT.destination.description}
        >
            <DestinationTypeSelection destination={destination} updateConfig={updateConfig} />

            {destination.type === DESTINATION_TYPE.FILE && (
                <FileDestinationConfig destination={destination} updateConfig={updateConfig} />
            )}

            {destination.type === DESTINATION_TYPE.SFTP && (
                <SftpDestinationConfig destination={destination} updateConfig={updateConfig} />
            )}

            {destination.type === DESTINATION_TYPE.HTTP && (
                <HttpDestinationConfig destination={destination} updateConfig={updateConfig} />
            )}
        </WizardStepContainer>
    );
}

interface DestinationTypeSelectionProps {
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function DestinationTypeSelection({ destination, updateConfig }: DestinationTypeSelectionProps) {
    return (
        <SelectableCardGrid columns={3}>
            {EXPORT_DESTINATION_TYPES.map(type => (
                <DestinationTypeCard
                    key={type.value}
                    type={type}
                    destination={destination}
                    updateConfig={updateConfig}
                />
            ))}
        </SelectableCardGrid>
    );
}

interface DestinationTypeCardProps {
    type: typeof EXPORT_DESTINATION_TYPES[number];
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

const DestinationTypeCard = memo(function DestinationTypeCard({
    type,
    destination,
    updateConfig,
}: DestinationTypeCardProps) {
    const handleClick = useCallback(() => {
        updateConfig({ destination: { type: type.value as DestinationType } });
    }, [type.value, updateConfig]);

    return (
        <SelectableCard
            icon={DESTINATION_TYPE_ICONS[type.value] ?? FolderOpen}
            title={type.label}
            selected={destination.type === type.value}
            onClick={handleClick}
            data-testid={`datahub-export-destination-${type.value}-btn`}
        />
    );
});

interface DestinationConfigProps {
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function FileDestinationConfig({ destination, updateConfig }: DestinationConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>File Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label>Directory</Label>
                    <Input
                        value={destination.fileConfig?.directory ?? EXPORT_DEFAULTS.DIRECTORY}
                        onChange={e => updateConfig({
                            destination: {
                                ...destination,
                                fileConfig: { ...destination.fileConfig, directory: e.target.value, filename: destination.fileConfig?.filename ?? EXPORT_DEFAULTS.FILENAME },
                            },
                        })}
                        placeholder={EXPORT_DEFAULTS.DIRECTORY}
                    />
                </div>

                <div>
                    <Label>Filename Pattern</Label>
                    <Input
                        value={destination.fileConfig?.filename ?? ''}
                        onChange={e => updateConfig({
                            destination: {
                                ...destination,
                                fileConfig: { ...destination.fileConfig!, filename: e.target.value },
                            },
                        })}
                        placeholder={PLACEHOLDERS.filename}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Available placeholders: {'{date}'}, {'{datetime}'}, {'{entity}'}, {'{timestamp}'}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function SftpDestinationConfig({ destination, updateConfig }: DestinationConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>SFTP Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <Label>Host</Label>
                        <Input
                            value={destination.sftpConfig?.host ?? ''}
                            onChange={e => updateConfig({
                                destination: {
                                    ...destination,
                                    sftpConfig: { ...destination.sftpConfig, host: e.target.value, port: destination.sftpConfig?.port ?? UI_DEFAULTS.DEFAULT_SFTP_PORT, username: destination.sftpConfig?.username ?? '', remotePath: destination.sftpConfig?.remotePath ?? EXPORT_DEFAULTS.SFTP_REMOTE_PATH },
                                },
                            })}
                            placeholder={PLACEHOLDERS.sftpHost}
                        />
                    </div>
                    <div>
                        <Label>Port</Label>
                        <Input
                            type="number"
                            value={destination.sftpConfig?.port ?? UI_DEFAULTS.DEFAULT_SFTP_PORT}
                            onChange={e => updateConfig({
                                destination: {
                                    ...destination,
                                    sftpConfig: { ...destination.sftpConfig!, port: parseInt(e.target.value) || UI_DEFAULTS.DEFAULT_SFTP_PORT },
                                },
                            })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Username</Label>
                        <Input
                            value={destination.sftpConfig?.username ?? ''}
                            onChange={e => updateConfig({
                                destination: {
                                    ...destination,
                                    sftpConfig: { ...destination.sftpConfig!, username: e.target.value },
                                },
                            })}
                        />
                    </div>
                    <div>
                        <Label>Password (Secret)</Label>
                        <Select
                            value={destination.sftpConfig?.passwordSecretId ?? SENTINEL_VALUES.NONE}
                            onValueChange={passwordSecretId => updateConfig({
                                destination: {
                                    ...destination,
                                    sftpConfig: { ...destination.sftpConfig!, passwordSecretId: passwordSecretId === SENTINEL_VALUES.NONE ? undefined : passwordSecretId },
                                },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select secret" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={SENTINEL_VALUES.NONE}>-- Select secret --</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <Label>Remote Path</Label>
                    <Input
                        value={destination.sftpConfig?.remotePath ?? EXPORT_DEFAULTS.SFTP_REMOTE_PATH}
                        onChange={e => updateConfig({
                            destination: {
                                ...destination,
                                sftpConfig: { ...destination.sftpConfig!, remotePath: e.target.value },
                            },
                        })}
                        placeholder={PLACEHOLDERS.remotePath}
                    />
                </div>

                <Button variant="outline" aria-label="Test connection to destination" data-testid="datahub-export-test-connection-btn">
                    <Play className="w-4 h-4 mr-2" />
                    Test Connection
                </Button>
            </CardContent>
        </Card>
    );
}

function HttpDestinationConfig({ destination, updateConfig }: DestinationConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>HTTP Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <Label>Method</Label>
                        <Select
                            value={destination.httpConfig?.method ?? EXPORT_DEFAULTS.HTTP_METHOD}
                            onValueChange={method => updateConfig({
                                destination: {
                                    ...destination,
                                    httpConfig: { ...destination.httpConfig, method: method as HttpMethod, url: destination.httpConfig?.url ?? '' },
                                },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {HTTP_METHODS.map(method => (
                                    <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="col-span-3">
                        <Label>URL</Label>
                        <Input
                            value={destination.httpConfig?.url ?? ''}
                            onChange={e => updateConfig({
                                destination: {
                                    ...destination,
                                    httpConfig: { ...destination.httpConfig!, url: e.target.value },
                                },
                            })}
                            placeholder={PLACEHOLDERS.httpUrl}
                        />
                    </div>
                </div>

                <div>
                    <Label>Authentication</Label>
                    <Select
                        value={destination.httpConfig?.authType ?? EXPORT_DEFAULTS.AUTH_TYPE}
                        onValueChange={authType => updateConfig({
                            destination: {
                                ...destination,
                                httpConfig: { ...destination.httpConfig!, authType: authType as HttpAuthType },
                            },
                        })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {HTTP_AUTH_TYPES.map(authType => (
                                <SelectItem key={authType.value} value={authType.value}>{authType.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <JsonTextarea
                    label="Headers (JSON)"
                    value={destination.httpConfig?.headers ?? {}}
                    onChange={(headers) => updateConfig({
                        destination: {
                            ...destination,
                            httpConfig: { ...destination.httpConfig!, headers: headers as Record<string, string> },
                        },
                    })}
                    placeholder='{"Content-Type": "application/json"}'
                    rows={3}
                    expectedType="object"
                    allowEmpty={true}
                    showStatus={false}
                />
            </CardContent>
        </Card>
    );
}
