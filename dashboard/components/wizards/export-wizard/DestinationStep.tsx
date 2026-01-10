/**
 * Export Wizard - Destination Step Component
 * Handles destination configuration
 */

import * as React from 'react';
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
    Textarea,
} from '@vendure/dashboard';
import {
    FolderOpen,
    Server,
    Send,
    Cloud,
    HardDrive,
    Play,
    AlertCircle,
} from 'lucide-react';
import type { ExportConfiguration, DestinationType, HttpMethod, HttpAuthType } from './types';

interface DestinationStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

const DESTINATION_TYPES = [
    { id: 'file', label: 'Local File', icon: FolderOpen, desc: 'Save to local filesystem' },
    { id: 'sftp', label: 'SFTP Upload', icon: Server, desc: 'Upload via SFTP' },
    { id: 'http', label: 'HTTP POST', icon: Send, desc: 'Send to HTTP endpoint' },
    { id: 's3', label: 'Amazon S3', icon: Cloud, desc: 'Upload to S3 bucket' },
    { id: 'asset', label: 'Vendure Asset', icon: HardDrive, desc: 'Store as Vendure asset' },
];

export function DestinationStep({ config, updateConfig }: DestinationStepProps) {
    const destination = config.destination ?? { type: 'file' };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Destination</h2>
                <p className="text-muted-foreground">
                    Choose where to deliver the exported data
                </p>
            </div>

            {/* Destination Type Selection */}
            <DestinationTypeSelection destination={destination} updateConfig={updateConfig} />

            {/* Destination Configuration */}
            {destination.type === 'file' && (
                <FileDestinationConfig destination={destination} updateConfig={updateConfig} />
            )}

            {destination.type === 'sftp' && (
                <SftpDestinationConfig destination={destination} updateConfig={updateConfig} />
            )}

            {destination.type === 'http' && (
                <HttpDestinationConfig destination={destination} updateConfig={updateConfig} />
            )}
        </div>
    );
}

interface DestinationTypeSelectionProps {
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function DestinationTypeSelection({ destination, updateConfig }: DestinationTypeSelectionProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {DESTINATION_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = destination.type === type.id;

                return (
                    <button
                        key={type.id}
                        className={`p-4 border rounded-lg text-center transition-all ${
                            isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'hover:border-primary/50'
                        }`}
                        onClick={() => updateConfig({ destination: { type: type.id as DestinationType } })}
                    >
                        <Icon className={`w-8 h-8 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="font-medium text-sm">{type.label}</div>
                    </button>
                );
            })}
        </div>
    );
}

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
                        value={destination.fileConfig?.directory ?? '/exports'}
                        onChange={e => updateConfig({
                            destination: {
                                ...destination,
                                fileConfig: { ...destination.fileConfig, directory: e.target.value, filename: destination.fileConfig?.filename ?? 'export.csv' },
                            },
                        })}
                        placeholder="/exports"
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
                        placeholder="export-{date}.csv"
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
                                    sftpConfig: { ...destination.sftpConfig, host: e.target.value, port: destination.sftpConfig?.port ?? 22, username: destination.sftpConfig?.username ?? '', remotePath: destination.sftpConfig?.remotePath ?? '/' },
                                },
                            })}
                            placeholder="sftp.example.com"
                        />
                    </div>
                    <div>
                        <Label>Port</Label>
                        <Input
                            type="number"
                            value={destination.sftpConfig?.port ?? 22}
                            onChange={e => updateConfig({
                                destination: {
                                    ...destination,
                                    sftpConfig: { ...destination.sftpConfig!, port: parseInt(e.target.value) || 22 },
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
                            value={destination.sftpConfig?.passwordSecretId ?? '__none__'}
                            onValueChange={passwordSecretId => updateConfig({
                                destination: {
                                    ...destination,
                                    sftpConfig: { ...destination.sftpConfig!, passwordSecretId: passwordSecretId === '__none__' ? undefined : passwordSecretId },
                                },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select secret" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">-- Select secret --</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <Label>Remote Path</Label>
                    <Input
                        value={destination.sftpConfig?.remotePath ?? '/'}
                        onChange={e => updateConfig({
                            destination: {
                                ...destination,
                                sftpConfig: { ...destination.sftpConfig!, remotePath: e.target.value },
                            },
                        })}
                        placeholder="/uploads/feeds"
                    />
                </div>

                <Button variant="outline">
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
                            value={destination.httpConfig?.method ?? 'POST'}
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
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
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
                            placeholder="https://api.example.com/import"
                        />
                    </div>
                </div>

                <div>
                    <Label>Authentication</Label>
                    <Select
                        value={destination.httpConfig?.authType ?? 'none'}
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
                            <SelectItem value="none">No Authentication</SelectItem>
                            <SelectItem value="basic">Basic Auth</SelectItem>
                            <SelectItem value="bearer">Bearer Token</SelectItem>
                            <SelectItem value="api-key">API Key</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <JsonHeadersField
                    value={destination.httpConfig?.headers ?? {}}
                    onChange={(headers) => updateConfig({
                        destination: {
                            ...destination,
                            httpConfig: { ...destination.httpConfig!, headers },
                        },
                    })}
                />
            </CardContent>
        </Card>
    );
}

/**
 * JSON Headers Field with debounced validation
 */
interface JsonHeadersFieldProps {
    value: Record<string, string>;
    onChange: (headers: Record<string, string>) => void;
}

function JsonHeadersField({ value, onChange }: JsonHeadersFieldProps) {
    const [text, setText] = React.useState(() => JSON.stringify(value ?? {}, null, 2));
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, setIsPending] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Sync with external value changes
    React.useEffect(() => {
        try {
            const currentParsed = text.trim() ? JSON.parse(text) : {};
            if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                setText(JSON.stringify(value ?? {}, null, 2));
                setError(null);
            }
        } catch {
            // Keep current text if comparison fails
        }
    }, [value]);

    const handleChange = (newText: string) => {
        setText(newText);
        setIsPending(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setIsPending(false);

            if (!newText.trim()) {
                setError(null);
                onChange({});
                return;
            }

            try {
                const parsed = JSON.parse(newText);
                if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                    setError('Headers must be a JSON object');
                    return;
                }
                setError(null);
                onChange(parsed);
            } catch (e) {
                const err = e as SyntaxError;
                let message = err.message.replace(/^JSON\.parse: /, '').replace(/^SyntaxError: /, '');
                const posMatch = message.match(/at position (\d+)/i);
                if (posMatch) {
                    const pos = parseInt(posMatch[1], 10);
                    const lines = newText.substring(0, pos).split('\n');
                    message = message.replace(/ at position \d+/, '').replace(/ in JSON at position \d+/, '');
                    setError(`Invalid JSON: ${message} (line ${lines.length}, col ${lines[lines.length - 1].length + 1})`);
                } else {
                    setError(`Invalid JSON: ${message}`);
                }
            }
        }, 300);
    };

    const getBorderClass = () => {
        if (error) return 'border-red-500 focus:border-red-500';
        if (isPending) return 'border-amber-400';
        return '';
    };

    return (
        <div className="space-y-1.5">
            <Label>Headers (JSON)</Label>
            <Textarea
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                placeholder='{"Content-Type": "application/json"}'
                rows={3}
                className={`font-mono text-sm ${getBorderClass()}`}
            />
            {error && (
                <div className="flex items-start gap-1.5 text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">{error}</p>
                </div>
            )}
        </div>
    );
}

export default DestinationStep;
