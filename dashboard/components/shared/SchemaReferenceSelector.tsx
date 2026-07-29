import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { usePermissions } from '@vendure/dashboard';
import { useInfiniteSchemaReferences } from '../../hooks';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { DATAHUB_PERMISSIONS, DEBOUNCE_DELAYS } from '../../constants';
import {
    SearchableReferenceSelector,
    type SearchableSelectorOption,
} from './SearchableReferenceSelector';

export interface SchemaReferenceValue {
    schemaId: string;
    version: string;
}

interface SchemaReferenceSelectorProps {
    value?: SchemaReferenceValue;
    onChange: (value: SchemaReferenceValue | undefined) => void;
    disabled?: boolean;
}

export function SchemaReferenceSelector({
    value,
    onChange,
    disabled = false,
}: Readonly<SchemaReferenceSelectorProps>) {
    const { t } = useLingui();
    const { hasPermissions } = usePermissions();
    const canRead = hasPermissions([DATAHUB_PERMISSIONS.READ_SCHEMA]);
    const [open, setOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const search = useDebouncedValue(searchTerm, DEBOUNCE_DELAYS.DEFAULT);
    const query = useInfiniteSchemaReferences(search, open && canRead);
    const schemas = query.data?.pages.flatMap(page => page.items) ?? [];
    const options: SearchableSelectorOption[] = schemas.map(schema => ({
        value: encodeReference(schema.schemaId, schema.version),
        label: schema.schemaId,
        description: `${schema.version} · ${schema.compatibility}`,
    }));
    const selectedValue = value
        ? encodeReference(value.schemaId, value.version)
        : '';
    const totalItems = query.data?.pages[0]?.totalItems ?? 0;

    return (
        <SearchableReferenceSelector
            value={selectedValue}
            selectedLabel={value ? `${value.schemaId} · ${value.version}` : ''}
            options={options}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onValueChange={nextValue => {
                onChange(nextValue ? decodeReference(nextValue) : undefined);
                setOpen(false);
                setSearchTerm('');
            }}
            open={open}
            onOpenChange={nextOpen => {
                setOpen(nextOpen);
                if (!nextOpen) setSearchTerm('');
            }}
            placeholder={t`No registry schema`}
            searchPlaceholder={t`Search schema IDs`}
            emptyMessage={t`No schema versions found`}
            errorMessage={canRead
                ? t`Schema versions could not be loaded`
                : t`You do not have permission to view schemas`}
            allOption={{ value: '', label: t`No registry schema` }}
            disabled={disabled}
            isLoading={canRead && query.isLoading}
            isError={!canRead || query.isError}
            onRetry={canRead ? () => void query.refetch() : undefined}
            hasNextPage={canRead && query.hasNextPage}
            isFetchingNextPage={canRead && query.isFetchingNextPage}
            remaining={Math.max(0, totalItems - schemas.length)}
            onLoadMore={() => {
                if (canRead) void query.fetchNextPage();
            }}
        />
    );
}

const REFERENCE_SEPARATOR = '\u0000';

function encodeReference(schemaId: string, version: string): string {
    return `${schemaId}${REFERENCE_SEPARATOR}${version}`;
}

function decodeReference(value: string): SchemaReferenceValue {
    const separatorIndex = value.indexOf(REFERENCE_SEPARATOR);
    return {
        schemaId: value.slice(0, separatorIndex),
        version: value.slice(separatorIndex + REFERENCE_SEPARATOR.length),
    };
}
