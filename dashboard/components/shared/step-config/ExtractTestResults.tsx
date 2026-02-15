import * as React from 'react';
import { memo } from 'react';
import {
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { formatCellValue } from '../../../utils/Formatters';
import { TEST_STATUS } from '../../../constants/UiStates';
import type { TestResult } from './StepTestHandlers';
import { TestResultContainer, JsonDisplay } from './TestResultContainer';

interface ExtractTestResultsProps {
    result: TestResult;
    resultView: 'table' | 'json';
    onViewChange: (view: 'table' | 'json') => void;
}

/**
 * Status badge component for test results
 */
export const StatusBadge = memo(function StatusBadge({ status }: { status: TestResult['status'] }) {
    switch (status) {
        case TEST_STATUS.SUCCESS:
            return (
                <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Success
                </Badge>
            );
        case TEST_STATUS.ERROR:
            return (
                <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> Error
                </Badge>
            );
        case TEST_STATUS.WARNING:
            return (
                <Badge variant="secondary" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Warning
                </Badge>
            );
    }
});

/**
 * Table display for record arrays
 */
export const RecordsTable = memo(function RecordsTable({ records }: { records: Array<Record<string, unknown>> }) {
    if (!records.length) {
        return <div className="text-muted-foreground text-sm">No records</div>;
    }

    const allKeys = Array.from(new Set(records.flatMap(r => Object.keys(r)))).slice(0, 8);

    return (
        <div className="border rounded overflow-auto max-h-[300px]">
            <Table>
                <TableHeader>
                    <TableRow>
                        {allKeys.map(key => (
                            <TableHead key={key} className="text-xs whitespace-nowrap">
                                {key}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* Index as key acceptable - static test result data, not reordered */}
                    {records.slice(0, 20).map((rec, recordIndex) => (
                        <TableRow key={`record-${recordIndex}`}>
                            {allKeys.map(key => (
                                <TableCell key={key} className="text-xs py-1 max-w-[200px] truncate">
                                    {formatCellValue(rec[key])}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {records.length > 20 && (
                <div className="text-xs text-muted-foreground p-2 border-t">
                    Showing 20 of {records.length} records
                </div>
            )}
        </div>
    );
});

/**
 * View toggle for switching between table and JSON views
 */
export const ViewToggle = memo(function ViewToggle({
    resultView,
    onViewChange,
}: {
    resultView: 'table' | 'json';
    onViewChange: (view: 'table' | 'json') => void;
}) {
    return (
        <Tabs value={resultView} onValueChange={v => onViewChange(v as 'table' | 'json')}>
            <TabsList className="h-7">
                <TabsTrigger value="table" className="text-xs h-6 px-2">
                    Table
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs h-6 px-2">
                    JSON
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
});

/**
 * Display component for EXTRACT step test results
 */
export const ExtractTestResults = memo(function ExtractTestResults({ result, resultView, onViewChange }: ExtractTestResultsProps) {
    if (!result.records) {
        return null;
    }

    return (
        <TestResultContainer
            result={result}
            showViewToggle
            resultView={resultView}
            onViewChange={onViewChange}
        >
            {resultView === 'table' ? (
                <RecordsTable records={result.records} />
            ) : (
                <JsonDisplay data={result.records} />
            )}
        </TestResultContainer>
    );
});
