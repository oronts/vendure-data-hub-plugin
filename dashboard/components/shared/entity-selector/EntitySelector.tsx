import * as React from "react";
import { memo } from "react";
import { useLingui } from "@lingui/react/macro";
import { Badge } from "@vendure/dashboard";
import { Check } from "lucide-react";
import { useEntityLoaders } from "../../../hooks/api/use-entity-loaders";
import { useEntityFieldSchemas } from "../../../hooks/api/use-entity-field-schemas";
import type { EntitySelectorProps } from "../../../types";
import { EmptyState, ErrorState, LoadingState } from "../feedback";
import { getErrorMessage, screamingSnakeToKebab } from "../../../../shared";

export interface EntitySelectorItem {
  code: string;
  name: string;
  description?: string | null;
  fieldCount: number;
}

interface EntitySelectorViewProps extends EntitySelectorProps {
  entities: readonly EntitySelectorItem[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
}

function EntitySelectorComponent({
  value,
  onChange,
  className = "",
}: EntitySelectorProps) {
  const entitiesQuery = useEntityLoaders();
  const fieldsQuery = useEntityFieldSchemas();
  const entities = entitiesQuery.entities.map((entity) => ({
    ...entity,
    fieldCount: fieldsQuery.getFields(entity.code).length,
  }));

  return (
    <EntitySelectorView
      value={value}
      onChange={onChange}
      className={className}
      entities={entities}
      isLoading={entitiesQuery.isLoading || fieldsQuery.isLoading}
      isError={entitiesQuery.isError || fieldsQuery.isError}
      error={entitiesQuery.error ?? fieldsQuery.error}
      onRetry={() => {
        void entitiesQuery.refetch();
        void fieldsQuery.refetch();
      }}
    />
  );
}

export function EntitySelectorView({
  value,
  onChange,
  className = "",
  entities,
  isLoading,
  isError,
  error,
  onRetry,
}: EntitySelectorViewProps) {
  const { t } = useLingui();

  if (isLoading) {
    return (
      <LoadingState
        type="card"
        rows={3}
        message={t`Loading entity catalog...`}
      />
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t`Entity catalog unavailable`}
        message={
          (error ? getErrorMessage(error) : undefined) ||
          t`Entity metadata could not be loaded.`
        }
        onRetry={onRetry}
      />
    );
  }

  if (entities.length === 0) {
    return (
      <EmptyState
        title={t`No supported entities`}
        description={t`No entity loaders are registered on this server.`}
      />
    );
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 ${className}`}>
      {entities.map((entity) => {
        const isSelected = value === entity.code;
        return (
          <button
            key={entity.code}
            type="button"
            aria-label={t`Select ${entity.name}`}
            className={`p-4 border rounded-lg text-left transition-all ${
              isSelected
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "hover:border-primary/50"
            }`}
            onClick={() => onChange(entity.code)}
            data-testid={`datahub-entityselector-entity-${screamingSnakeToKebab(entity.code)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{entity.name}</span>
              {isSelected && <Check className="w-4 h-4 text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {entity.description}
            </p>
            <Badge variant="secondary" className="text-xs">
              {entity.fieldCount === 1
                ? t`${entity.fieldCount} field`
                : t`${entity.fieldCount} fields`}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

export const EntitySelector = memo(EntitySelectorComponent);
