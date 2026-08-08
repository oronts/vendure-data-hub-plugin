import { Trans } from '@lingui/react/macro';
import { ResourceReferenceSelector } from '../shared/ResourceReferenceSelector';

interface SecretReferenceInputProps {
    id?: string;
    value: string;
    onChange: (value?: string) => void;
    placeholder?: string;
    disabled?: boolean;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
}

export function SecretReferenceInput({
    id,
    value,
    onChange,
    placeholder,
    disabled,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
}: SecretReferenceInputProps) {
    return (
        <div className="space-y-1">
            <ResourceReferenceSelector
                id={id}
                resource="secret"
                value={value}
                onValueChange={next => onChange(next || undefined)}
                placeholder={placeholder}
                disabled={disabled}
                allowClear
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                aria-required={ariaRequired}
            />
            <p className="text-xs text-muted-foreground">
                <Trans>Choose an existing secret or type a new reference code.</Trans>
            </p>
        </div>
    );
}
