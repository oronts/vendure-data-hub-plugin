import { Badge } from '@vendure/dashboard';

export interface PipelineCapabilityBadgesProps {
    readonly requiredCapabilities: readonly string[];
    readonly writeCapabilities: readonly string[];
}

export function PipelineCapabilityBadges({
    requiredCapabilities,
    writeCapabilities,
}: Readonly<PipelineCapabilityBadgesProps>) {
    if (requiredCapabilities.length === 0 && writeCapabilities.length === 0) {
        return <span className="text-muted-foreground">—</span>;
    }

    return (
        <div className="flex flex-wrap gap-1">
            {requiredCapabilities.map(capability => (
                <Badge key={`required-${capability}`} variant="outline">
                    {capability}
                </Badge>
            ))}
            {writeCapabilities.map(capability => (
                <Badge key={`write-${capability}`} variant="secondary">
                    {capability}
                </Badge>
            ))}
        </div>
    );
}
