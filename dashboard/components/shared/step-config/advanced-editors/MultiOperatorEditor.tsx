import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { MOVE_DIRECTION, type MoveDirection } from '../../../../constants';
import { useStableKeys } from '../../../../hooks';
import {
    OperatorCard,
    type OperatorConfig,
    type StepOperatorDefinition,
} from '../OperatorCard';
import { buildInitialOperatorArgs } from './editor-utils';

interface MultiOperatorEditorProps {
    operators: OperatorConfig[];
    availableOperators: StepOperatorDefinition[];
    onChange: (operators: OperatorConfig[]) => void;
}

export function MultiOperatorEditor({
    operators,
    availableOperators,
    onChange,
}: MultiOperatorEditorProps) {
    const { t } = useLingui();
    const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
    const [addingNew, setAddingNew] = React.useState(false);
    const fieldIdPrefix = React.useId();
    const newOperatorId = `${fieldIdPrefix}-operator`;
    const addPanelId = `${fieldIdPrefix}-add-panel`;
    const operatorKeys = useStableKeys(operators, 'op');
    const count = operators.length;

    React.useEffect(() => {
        setExpandedIndex(current => (
            current !== null && current >= operators.length ? null : current
        ));
    }, [operators.length]);

    const updateOperator = React.useCallback((
        index: number,
        updates: Partial<OperatorConfig>,
    ) => {
        onChange(operators.map((operator, operatorIndex) => (
            operatorIndex === index ? { ...operator, ...updates } : operator
        )));
    }, [onChange, operators]);

    const updateOperatorArg = React.useCallback((
        index: number,
        key: string,
        value: unknown,
    ) => {
        onChange(operators.map((operator, operatorIndex) => (
            operatorIndex === index
                ? { ...operator, args: { ...operator.args, [key]: value } }
                : operator
        )));
    }, [onChange, operators]);

    const removeOperator = React.useCallback((index: number) => {
        onChange(operators.filter((_operator, operatorIndex) => operatorIndex !== index));
        setExpandedIndex(current => {
            if (current === index) return null;
            return current !== null && current > index ? current - 1 : current;
        });
    }, [onChange, operators]);

    const addOperator = React.useCallback((operatorCode: string) => {
        const definition = availableOperators.find(operator => operator.code === operatorCode);
        if (!definition) return;
        onChange([
            ...operators,
            {
                op: operatorCode,
                args: buildInitialOperatorArgs(definition.schema?.fields),
            },
        ]);
        setAddingNew(false);
        setExpandedIndex(operators.length);
    }, [availableOperators, onChange, operators]);

    const moveOperator = React.useCallback((index: number, direction: MoveDirection) => {
        const newIndex = direction === MOVE_DIRECTION.UP ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= operators.length) return;
        const nextOperators = [...operators];
        [nextOperators[index], nextOperators[newIndex]] = [
            nextOperators[newIndex],
            nextOperators[index],
        ];
        onChange(nextOperators);
        setExpandedIndex(current => {
            if (current === index) return newIndex;
            if (current === newIndex) return index;
            return current;
        });
    }, [onChange, operators]);

    return (
        <Card>
            <CardHeader className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">{t`Transform operators (${count})`}</CardTitle>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingNew(current => !current)}
                        disabled={availableOperators.length === 0}
                        aria-expanded={addingNew}
                        aria-controls={addPanelId}
                    >
                        {addingNew ? t`Cancel` : t`Add operator`}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {addingNew && (
                    <div id={addPanelId} className="rounded-md border border-dashed bg-muted/30 p-3">
                        <Label htmlFor={newOperatorId} className="text-xs">
                            <Trans>Select an operator to add:</Trans>
                        </Label>
                        <Select onValueChange={addOperator}>
                            <SelectTrigger id={newOperatorId} className="mt-1">
                                <SelectValue placeholder={t`Choose operator...`} />
                            </SelectTrigger>
                            <SelectContent>
                                {availableOperators.map(operator => (
                                    <SelectItem key={operator.code} value={operator.code}>
                                        <div>
                                            <div className="font-medium">{operator.name}</div>
                                            {operator.description && (
                                                <div className="text-xs text-muted-foreground">
                                                    {operator.description}
                                                </div>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {operators.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                        <Trans>No operators configured. Click “Add operator” to add one.</Trans>
                    </p>
                ) : (
                    <div className="space-y-2">
                        {operators.map((operator, index) => (
                            <OperatorCard
                                key={operatorKeys[index]}
                                operator={operator}
                                index={index}
                                isExpanded={expandedIndex === index}
                                totalCount={operators.length}
                                availableOperators={availableOperators}
                                onToggleExpand={() => setExpandedIndex(
                                    expandedIndex === index ? null : index,
                                )}
                                onUpdate={updates => updateOperator(index, updates)}
                                onUpdateArg={(key, value) => updateOperatorArg(index, key, value)}
                                onRemove={() => removeOperator(index)}
                                onMove={direction => moveOperator(index, direction)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
