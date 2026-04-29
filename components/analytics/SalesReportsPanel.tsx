'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    FileText,
    Loader2,
    RefreshCw,
    Save,
    Upload,
    X,
} from 'lucide-react';

type ReportStatus = 'pending' | 'processing' | 'auto_published' | 'needs_review' | 'published' | 'failed';

interface DailySalesReport {
    report_date: string;
    cashier_name: string | null;
    shift_start_at: string | null;
    shift_end_at: string | null;
    topup_register_amount: number | null;
    freebies: number | null;
    deducted_amount: number | null;
    refund_balance: number | null;
    cashier_m_plus: number | null;
    cashier_user_m_plus: number | null;
    items_sales: number | null;
    user_purchase: number | null;
    free_items: number | null;
    point_redemption: number | null;
    cash_stock_in: number | null;
    received_from_last_shift: number | null;
    reserve_to_next_duty: number | null;
    reload_coupon: number | null;
    card_fee_registered: number | null;
    other_expenses: number | null;
    shift_income: number | null;
    total_cash: number | null;
    off_duty_amount: number | null;
    gross_sales: number | null;
    net_sales: number | null;
    discounts: number | null;
    tax: number | null;
    refunds: number | null;
    transaction_count: number | null;
    payment_breakdown: Record<string, number>;
    notes: string | null;
    confidence_score: number | null;
    validation_warnings: string[];
    is_published: boolean;
}

interface SalesReportItem {
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    status: ReportStatus;
    confidence_score: number | null;
    extraction_errors: string[] | null;
    created_at: string;
    processed_at: string | null;
    report: DailySalesReport | null;
}

interface SalesReportsApiError {
    error?: string;
    setupRequired?: boolean;
}

interface EditState {
    reportDate: string;
    cashierName: string;
    shiftStartAt: string;
    shiftEndAt: string;
    topupRegisterAmount: string;
    freebies: string;
    deductedAmount: string;
    refundBalance: string;
    cashierMPlus: string;
    cashierUserMPlus: string;
    itemsSales: string;
    userPurchase: string;
    freeItems: string;
    pointRedemption: string;
    cashStockIn: string;
    receivedFromLastShift: string;
    reserveToNextDuty: string;
    reloadCoupon: string;
    cardFeeRegistered: string;
    otherExpenses: string;
    shiftIncome: string;
    totalCash: string;
    offDutyAmount: string;
    grossSales: string;
    netSales: string;
    discounts: string;
    tax: string;
    refunds: string;
    transactionCount: string;
    paymentBreakdown: string;
    notes: string;
}

const emptyEditState: EditState = {
    reportDate: '',
    cashierName: '',
    shiftStartAt: '',
    shiftEndAt: '',
    topupRegisterAmount: '',
    freebies: '',
    deductedAmount: '',
    refundBalance: '',
    cashierMPlus: '',
    cashierUserMPlus: '',
    itemsSales: '',
    userPurchase: '',
    freeItems: '',
    pointRedemption: '',
    cashStockIn: '',
    receivedFromLastShift: '',
    reserveToNextDuty: '',
    reloadCoupon: '',
    cardFeeRegistered: '',
    otherExpenses: '',
    shiftIncome: '',
    totalCash: '',
    offDutyAmount: '',
    grossSales: '',
    netSales: '',
    discounts: '',
    tax: '',
    refunds: '',
    transactionCount: '',
    paymentBreakdown: '',
    notes: '',
};

const statusLabels: Record<ReportStatus, string> = {
    pending: 'Pending',
    processing: 'Processing',
    auto_published: 'Auto-published',
    needs_review: 'Needs review',
    published: 'Published',
    failed: 'Failed',
};

const statusStyles: Record<ReportStatus, string> = {
    pending: 'border-white/15 text-gray-300 bg-white/5',
    processing: 'border-blue-400/30 text-blue-300 bg-blue-500/10',
    auto_published: 'border-green-400/30 text-green-300 bg-green-500/10',
    needs_review: 'border-yellow-400/30 text-yellow-300 bg-yellow-500/10',
    published: 'border-green-400/30 text-green-300 bg-green-500/10',
    failed: 'border-red-400/30 text-red-300 bg-red-500/10',
};

interface QueuedFile {
    file: File;
    status: 'queued' | 'uploading' | 'uploaded' | 'error';
    error?: string;
    documentId?: string;
}

interface SalesReportSummary {
    period: string;
    publishedCount: number;
    totalDocuments: number;
    grossSalesTotal: number;
    netSalesTotal: number;
    shiftIncomeTotal: number;
    transactionCount: number;
    averageTicket: number;
    paymentBreakdown: Record<string, number>;
    reportDates: string[];
}

function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function SalesReportsPanel() {
    const [reports, setReports] = useState<SalesReportItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editState, setEditState] = useState<EditState>(emptyEditState);
    const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
    const [batchUploading, setBatchUploading] = useState(false);
    const [batchProcessing, setBatchProcessing] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, message: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupRequired, setSetupRequired] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
    const [summary, setSummary] = useState<SalesReportSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);

    const selectedReport = useMemo(
        () => reports.find(report => report.id === selectedId) ?? null,
        [reports, selectedId],
    );

    useEffect(() => {
        void refreshReports();
    }, []);

    useEffect(() => {
        void loadSummary();
    }, [selectedMonth]);

    useEffect(() => {
        if (!selectedId && reports[0]) {
            setSelectedId(reports[0].id);
        }
    }, [reports, selectedId]);

    useEffect(() => {
        if (!selectedReport) {
            setEditState(emptyEditState);
            return;
        }

        setEditState(toEditState(selectedReport.report));
    }, [selectedReport]);

    const refreshReports = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/analytics-reports');

            if (!response.ok) {
                const payload = await response.json().catch(() => ({})) as SalesReportsApiError;

                if (payload.setupRequired) {
                    setSetupRequired(true);
                    setReports([]);
                    setError(payload.error ?? 'Sales report storage is not set up yet.');
                    return;
                }

                throw new Error(payload.error || 'Failed to load reports');
            }

            const data = await response.json() as { reports: SalesReportItem[] };
            setSetupRequired(false);
            setReports(data.reports);
        } catch (err) {
            console.error('Failed to load sales reports:', err);
            setError('Could not load sales reports.');
        } finally {
            setIsLoading(false);
        }
    };

    const loadSummary = async () => {
        setSummaryLoading(true);

        try {
            const [y, m] = selectedMonth.split('-');
            const response = await fetch(`/api/analytics-reports/summary?year=${y}&month=${m}`);

            if (response.ok) {
                const data = await response.json() as SalesReportSummary;
                setSummary(data);
            } else {
                setSummary(null);
            }
        } catch {
            setSummary(null);
        } finally {
            setSummaryLoading(false);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files;

        if (!selected || selected.length === 0) {
            setFileQueue([]);
            return;
        }

        const queued: QueuedFile[] = Array.from(selected).map(file => ({
            file,
            status: 'queued' as const,
        }));

        setFileQueue(queued);
        event.target.value = '';
    };

    const removeFileFromQueue = (index: number) => {
        setFileQueue(prev => prev.filter((_, i) => i !== index));
    };

    const batchUploadAndProcess = async () => {
        if (fileQueue.length === 0 || batchUploading || batchProcessing) {
            return;
        }

        setBatchUploading(true);
        setError(null);
        setMessage(null);

        try {
            const formData = new FormData();

            for (const qf of fileQueue) {
                formData.append('files', qf.file);
            }

            const uploadResponse = await fetch('/api/analytics-reports/batch', {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) {
                const payload = await uploadResponse.json().catch(() => ({})) as SalesReportsApiError;
                throw new Error(payload.error || 'Batch upload failed');
            }

            const uploadPayload = await uploadResponse.json() as {
                results: Array<{ id: string; fileName: string; status: string; error?: string }>;
                summary: { total: number; succeeded: number; failed: number };
            };

            const updatedQueue = fileQueue.map((qf) => {
                const result = uploadPayload.results.find(r => r.fileName === qf.file.name);

                if (!result) {
                    return { ...qf, status: 'error' as const, error: 'Unknown result' };
                }

                if (result.status === 'created') {
                    return { ...qf, status: 'uploaded' as const, documentId: result.id };
                }

                return { ...qf, status: 'error' as const, error: result.error };
            });

            setFileQueue(updatedQueue);

            const uploadedIds = updatedQueue
                .filter(qf => qf.status === 'uploaded' && qf.documentId)
                .map(qf => qf.documentId!);

            if (uploadedIds.length === 0) {
                throw new Error('No files were uploaded successfully');
            }

            setBatchUploading(false);
            setBatchProcessing(true);
            setBatchProgress({ current: 0, total: uploadedIds.length, message: 'Starting batch processing...' });

            const CHUNK_SIZE = 10;

            for (let i = 0; i < uploadedIds.length; i += CHUNK_SIZE) {
                const chunk = uploadedIds.slice(i, i + CHUNK_SIZE);

                const processResponse = await fetch('/api/analytics-reports/batch-process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ documentIds: chunk }),
                });

                if (!processResponse.ok) {
                    throw new Error('Batch processing failed');
                }

                const processPayload = await processResponse.json() as {
                    results: Array<{ id: string; status: string; error?: string }>;
                    summary: { total: number; succeeded: number; needsReview: number; failed: number };
                };

                const processed = i + chunk.length;

                setBatchProgress({
                    current: Math.min(processed, uploadedIds.length),
                    total: uploadedIds.length,
                    message: `Processed ${Math.min(processed, uploadedIds.length)} of ${uploadedIds.length} (${processPayload.summary.succeeded} ok, ${processPayload.summary.failed} failed)`,
                });
            }

            await refreshReports();
            await loadSummary();
            setBatchProgress({ current: uploadedIds.length, total: uploadedIds.length, message: 'Batch processing complete.' });
            setMessage('Batch processing complete.');
        } catch (err) {
            console.error('Batch operation failed:', err);
            setError(err instanceof Error ? err.message : 'Batch operation failed');
            await refreshReports();
        } finally {
            setBatchUploading(false);
            setBatchProcessing(false);
        }
    };

    const uploadAndProcess = async () => {
        const singleFile = fileQueue.find(qf => qf.status === 'queued');

        if (!singleFile) {
            return;
        }

        setBusyId('upload');
        setError(null);
        setMessage(null);

        try {
            const formData = new FormData();
            formData.append('file', singleFile.file);

            const uploadResponse = await fetch('/api/analytics-reports', {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) {
                const payload = await uploadResponse.json().catch(() => ({})) as SalesReportsApiError;

                if (payload.setupRequired) {
                    setSetupRequired(true);
                }

                throw new Error(payload.error || 'Upload failed');
            }

            const uploadPayload = await uploadResponse.json() as { document: SalesReportItem };
            setSelectedId(uploadPayload.document.id);
            setFileQueue([]);

            await processReport(uploadPayload.document.id, false);
            setMessage('Sales report uploaded and processed.');
            await loadSummary();
        } catch (err) {
            console.error('Failed to upload sales report:', err);
            setError(err instanceof Error ? err.message : 'Failed to upload sales report.');
        } finally {
            setBusyId(null);
        }
    };

    const processReport = async (id: string, showMessage = true) => {
        setBusyId(id);
        setError(null);

        try {
            const response = await fetch(`/api/analytics-reports/${id}/process`, {
                method: 'POST',
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({})) as SalesReportsApiError;
                throw new Error(payload.error || 'Processing failed');
            }

            if (showMessage) {
                setMessage('Sales report processed.');
            }

            await refreshReports();
        } catch (err) {
            console.error('Failed to process sales report:', err);
            setError(err instanceof Error ? err.message : 'Failed to process sales report.');
            await refreshReports();
        } finally {
            setBusyId(null);
        }
    };

    const saveReport = async (publish: boolean) => {
        if (!selectedReport) {
            return;
        }

        setBusyId(selectedReport.id);
        setError(null);
        setMessage(null);

        try {
            const response = await fetch(`/api/analytics-reports/${selectedReport.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    publish,
                    report: {
                        reportDate: editState.reportDate,
                        cashierName: editState.cashierName,
                        shiftStartAt: editState.shiftStartAt || null,
                        shiftEndAt: editState.shiftEndAt || null,
                        topupRegisterAmount: editState.topupRegisterAmount || null,
                        freebies: editState.freebies || null,
                        deductedAmount: editState.deductedAmount || null,
                        refundBalance: editState.refundBalance || null,
                        cashierMPlus: editState.cashierMPlus || null,
                        cashierUserMPlus: editState.cashierUserMPlus || null,
                        itemsSales: editState.itemsSales || null,
                        userPurchase: editState.userPurchase || null,
                        freeItems: editState.freeItems || null,
                        pointRedemption: editState.pointRedemption || null,
                        cashStockIn: editState.cashStockIn || null,
                        receivedFromLastShift: editState.receivedFromLastShift || null,
                        reserveToNextDuty: editState.reserveToNextDuty || null,
                        reloadCoupon: editState.reloadCoupon || null,
                        cardFeeRegistered: editState.cardFeeRegistered || null,
                        otherExpenses: editState.otherExpenses || null,
                        shiftIncome: editState.shiftIncome || null,
                        totalCash: editState.totalCash || null,
                        offDutyAmount: editState.offDutyAmount || null,
                        grossSales: editState.grossSales || null,
                        netSales: editState.netSales || null,
                        discounts: editState.discounts || null,
                        tax: editState.tax || null,
                        refunds: editState.refunds || null,
                        transactionCount: editState.transactionCount || null,
                        paymentBreakdown: parsePaymentBreakdown(editState.paymentBreakdown),
                        notes: editState.notes,
                        confidence: publish ? 1 : selectedReport.report?.confidence_score ?? 0.75,
                    },
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({})) as SalesReportsApiError;
                throw new Error(payload.error || 'Save failed');
            }

            setMessage(publish ? 'Sales report published.' : 'Sales report saved for review.');
            await refreshReports();
        } catch (err) {
            console.error('Failed to save sales report:', err);
            setError(err instanceof Error ? err.message : 'Failed to save sales report.');
        } finally {
            setBusyId(null);
        }
    };

    const updateField = (field: keyof EditState, value: string) => {
        setEditState(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    return (
        <section className="glass-panel rounded-xl border border-white/10 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-neon" />
                        <h2 className="font-heading text-xl font-bold">Daily Sales Reports</h2>
                    </div>
                    <p className="mt-1 text-sm text-gray-400">
                        Upload PDF or image sales reports, review extracted totals, then publish them into AI analytics.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[340px]">
                    <input
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={handleFileSelect}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-neon file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-racing-dark"
                    />
                    {fileQueue.length > 0 && (
                        <div className="max-h-[200px] overflow-auto rounded-lg border border-white/10 bg-white/[0.03]">
                            {fileQueue.map((qf, index) => (
                                <div key={`${qf.file.name}-${index}`} className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-xs last:border-b-0">
                                    <span className="min-w-0 flex-1 truncate text-gray-300">{qf.file.name}</span>
                                    <span className="ml-2 shrink-0 whitespace-nowrap text-gray-500">
                                        {qf.status === 'queued' && 'Queued'}
                                        {qf.status === 'uploading' && '...'}
                                        {qf.status === 'uploaded' && 'Done'}
                                        {qf.status === 'error' && <span className="text-red-400">{qf.error ?? 'Failed'}</span>}
                                    </span>
                                    {(qf.status === 'queued') && (
                                        <button
                                            onClick={() => removeFileFromQueue(index)}
                                            className="ml-2 shrink-0 text-gray-500 hover:text-red-400"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {batchProcessing && (
                        <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {batchProgress.message}
                            </div>
                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-neon transition-all"
                                    style={{ width: batchProgress.total > 0 ? `${(batchProgress.current / batchProgress.total) * 100}%` : '0%' }}
                                />
                            </div>
                        </div>
                    )}
                    <div className="flex gap-2">
                        {fileQueue.length > 1 ? (
                            <button
                                onClick={batchUploadAndProcess}
                                disabled={fileQueue.length === 0 || batchUploading || batchProcessing || setupRequired}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-neon px-4 py-2 text-sm font-medium text-racing-dark transition-colors hover:bg-neon/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {(batchUploading || batchProcessing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                {batchProcessing ? 'Processing...' : `Upload All (${fileQueue.length})`}
                            </button>
                        ) : (
                            <button
                                onClick={uploadAndProcess}
                                disabled={fileQueue.length === 0 || busyId === 'upload' || setupRequired}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-neon px-4 py-2 text-sm font-medium text-racing-dark transition-colors hover:bg-neon/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {busyId === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                Upload & process
                            </button>
                        )}
                        <button
                            onClick={refreshReports}
                            disabled={isLoading}
                            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                            aria-label="Refresh reports"
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    {fileQueue.length > 0 && (
                        <button
                            onClick={() => setFileQueue([])}
                            className="text-xs text-gray-500 hover:text-gray-300"
                        >
                            Clear queue
                        </button>
                    )}
                </div>
            </div>

            {(message || error) && (
                <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-green-500/30 bg-green-500/10 text-green-300'}`}>
                    {error ?? message}
                </div>
            )}

            {setupRequired && (
                <div className="mt-4 rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                    Run <span className="font-mono text-yellow-50">supabase/sales-reports.sql</span> in your Supabase SQL editor, then refresh this page.
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="flex items-end gap-2">
                    <label className="block">
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Month</span>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="mt-0.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-neon/50"
                        />
                    </label>
                    {summaryLoading && <Loader2 className="mb-1.5 h-4 w-4 animate-spin text-gray-400" />}
                </div>
                {summary && (
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                        <span className="text-gray-400">
                            <span className="text-white font-medium">{summary.publishedCount}</span> published
                            {summary.totalDocuments > 0 && <> / {summary.totalDocuments} uploaded</>}
                        </span>
                        <span className="text-gray-400">
                            Gross: <span className="text-green-300 font-medium">RM {summary.grossSalesTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                        </span>
                        <span className="text-gray-400">
                            Net: <span className="text-green-300 font-medium">RM {summary.netSalesTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                        </span>
                        {summary.shiftIncomeTotal > 0 && (
                            <span className="text-gray-400">
                                Shift income: <span className="text-green-300 font-medium">RM {summary.shiftIncomeTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                            </span>
                        )}
                        <span className="text-gray-400">
                            {summary.transactionCount} txn
                        </span>
                        <span className="text-gray-400">
                            Avg <span className="text-white font-medium">RM {summary.averageTicket.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>/txn
                        </span>
                    </div>
                )}
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
                <div className="overflow-hidden rounded-xl border border-white/10">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs uppercase tracking-[0.2em] text-gray-500">
                        <span>Document</span>
                        <span>Status</span>
                        <span>Confidence</span>
                    </div>
                    <div className="max-h-[420px] overflow-auto">
                        {reports.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">
                                No sales reports uploaded yet.
                            </div>
                        )}

                        {reports.map(report => (
                            <button
                                key={report.id}
                                onClick={() => setSelectedId(report.id)}
                                className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/10 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.04] ${selectedReport?.id === report.id ? 'bg-white/[0.06]' : ''}`}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-white">{report.file_name}</span>
                                    <span className="text-xs text-gray-500">{formatFileSize(report.file_size)} · {formatDateTime(report.created_at)}</span>
                                </span>
                                <StatusBadge status={report.status} />
                                <span className="text-sm text-gray-300">{formatConfidence(report.confidence_score)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-white/10 p-4">
                    {!selectedReport ? (
                        <div className="py-12 text-center text-sm text-gray-400">
                            Select a report to review extracted sales totals.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-heading text-lg font-bold">{selectedReport.file_name}</h3>
                                    <p className="text-xs text-gray-500">
                                        {selectedReport.processed_at ? `Processed ${formatDateTime(selectedReport.processed_at)}` : 'Not processed yet'}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => processReport(selectedReport.id)}
                                        disabled={busyId === selectedReport.id}
                                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                                    >
                                        {busyId === selectedReport.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                        Reprocess
                                    </button>
                                    <button
                                        onClick={() => saveReport(false)}
                                        disabled={busyId === selectedReport.id}
                                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                                    >
                                        <Save className="h-4 w-4" />
                                        Save
                                    </button>
                                    <button
                                        onClick={() => saveReport(true)}
                                        disabled={busyId === selectedReport.id}
                                        className="inline-flex items-center gap-2 rounded-lg bg-neon px-3 py-2 text-sm font-medium text-racing-dark transition-colors hover:bg-neon/90 disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Publish
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Report date" value={editState.reportDate} onChange={value => updateField('reportDate', value)} type="date" />
                                <Field label="Cashier" value={editState.cashierName} onChange={value => updateField('cashierName', value)} />
                                <Field label="Shift start" value={editState.shiftStartAt} onChange={value => updateField('shiftStartAt', value)} />
                                <Field label="Shift end" value={editState.shiftEndAt} onChange={value => updateField('shiftEndAt', value)} />
                            </div>

                            <div>
                                <h4 className="mb-3 text-xs uppercase tracking-[0.2em] text-gray-500">Topup / M-Plus</h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Topup/Register Amount" value={editState.topupRegisterAmount} onChange={value => updateField('topupRegisterAmount', value)} type="number" />
                                    <Field label="Freebies" value={editState.freebies} onChange={value => updateField('freebies', value)} type="number" />
                                    <Field label="Deducted Amount" value={editState.deductedAmount} onChange={value => updateField('deductedAmount', value)} type="number" />
                                    <Field label="Refund Balance" value={editState.refundBalance} onChange={value => updateField('refundBalance', value)} type="number" />
                                    <Field label="Cashier M-Plus" value={editState.cashierMPlus} onChange={value => updateField('cashierMPlus', value)} type="number" />
                                    <Field label="Cashier + User M-Plus" value={editState.cashierUserMPlus} onChange={value => updateField('cashierUserMPlus', value)} type="number" />
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-3 text-xs uppercase tracking-[0.2em] text-gray-500">Items / Stock</h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Items" value={editState.itemsSales} onChange={value => updateField('itemsSales', value)} type="number" />
                                    <Field label="User Purchase" value={editState.userPurchase} onChange={value => updateField('userPurchase', value)} type="number" />
                                    <Field label="Free Items" value={editState.freeItems} onChange={value => updateField('freeItems', value)} type="number" />
                                    <Field label="Point Redemption" value={editState.pointRedemption} onChange={value => updateField('pointRedemption', value)} type="number" />
                                    <Field label="Cash Stock In" value={editState.cashStockIn} onChange={value => updateField('cashStockIn', value)} type="number" />
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-3 text-xs uppercase tracking-[0.2em] text-gray-500">Cash Control</h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Received From Last Shift" value={editState.receivedFromLastShift} onChange={value => updateField('receivedFromLastShift', value)} type="number" />
                                    <Field label="Reserve to Next-Duty" value={editState.reserveToNextDuty} onChange={value => updateField('reserveToNextDuty', value)} type="number" />
                                    <Field label="Reload coupon" value={editState.reloadCoupon} onChange={value => updateField('reloadCoupon', value)} type="number" />
                                    <Field label="Card Fee Registered" value={editState.cardFeeRegistered} onChange={value => updateField('cardFeeRegistered', value)} type="number" />
                                    <Field label="Other Expenses" value={editState.otherExpenses} onChange={value => updateField('otherExpenses', value)} type="number" />
                                    <Field label="Shift Income" value={editState.shiftIncome} onChange={value => updateField('shiftIncome', value)} type="number" />
                                    <Field label="Total Cash" value={editState.totalCash} onChange={value => updateField('totalCash', value)} type="number" />
                                    <Field label="Off Duty Amount" value={editState.offDutyAmount} onChange={value => updateField('offDutyAmount', value)} type="number" />
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-3 text-xs uppercase tracking-[0.2em] text-gray-500">Analytics Mapping</h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Gross sales" value={editState.grossSales} onChange={value => updateField('grossSales', value)} type="number" />
                                    <Field label="Net sales" value={editState.netSales} onChange={value => updateField('netSales', value)} type="number" />
                                    <Field label="Discounts" value={editState.discounts} onChange={value => updateField('discounts', value)} type="number" />
                                    <Field label="Tax" value={editState.tax} onChange={value => updateField('tax', value)} type="number" />
                                    <Field label="Refunds" value={editState.refunds} onChange={value => updateField('refunds', value)} type="number" />
                                    <Field label="Transactions" value={editState.transactionCount} onChange={value => updateField('transactionCount', value)} type="number" />
                                </div>
                            </div>

                            <label className="block">
                                <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Payment mix</span>
                                <input
                                    value={editState.paymentBreakdown}
                                    onChange={(event) => updateField('paymentBreakdown', event.target.value)}
                                    placeholder="cash=120, card=240, ewallet=80"
                                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-neon/50"
                                />
                            </label>

                            <label className="block">
                                <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Notes</span>
                                <textarea
                                    value={editState.notes}
                                    onChange={(event) => updateField('notes', event.target.value)}
                                    rows={3}
                                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-neon/50"
                                />
                            </label>

                            {selectedReport.report?.validation_warnings && selectedReport.report.validation_warnings.length > 0 && (
                                <div className="rounded-lg border border-yellow-400/20 bg-yellow-500/10 p-3">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-200">
                                        <AlertTriangle className="h-4 w-4" />
                                        Review warnings
                                    </div>
                                    <ul className="space-y-1 text-sm text-yellow-100/80">
                                        {selectedReport.report.validation_warnings.map(warning => (
                                            <li key={warning}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function Field({
    label,
    value,
    onChange,
    type,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
}) {
    return (
        <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-gray-500">{label}</span>
            <input
                type={type ?? 'text'}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-neon/50"
            />
        </label>
    );
}

function StatusBadge({ status }: { status: ReportStatus }) {
    return (
        <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${statusStyles[status]}`}>
            {statusLabels[status]}
        </span>
    );
}

function toEditState(report: DailySalesReport | null): EditState {
    if (!report) {
        return emptyEditState;
    }

    return {
        reportDate: report.report_date ?? '',
        cashierName: report.cashier_name ?? '',
        shiftStartAt: toDateTimeInputValue(report.shift_start_at),
        shiftEndAt: toDateTimeInputValue(report.shift_end_at),
        topupRegisterAmount: toInputValue(report.topup_register_amount),
        freebies: toInputValue(report.freebies),
        deductedAmount: toInputValue(report.deducted_amount),
        refundBalance: toInputValue(report.refund_balance),
        cashierMPlus: toInputValue(report.cashier_m_plus),
        cashierUserMPlus: toInputValue(report.cashier_user_m_plus),
        itemsSales: toInputValue(report.items_sales),
        userPurchase: toInputValue(report.user_purchase),
        freeItems: toInputValue(report.free_items),
        pointRedemption: toInputValue(report.point_redemption),
        cashStockIn: toInputValue(report.cash_stock_in),
        receivedFromLastShift: toInputValue(report.received_from_last_shift),
        reserveToNextDuty: toInputValue(report.reserve_to_next_duty),
        reloadCoupon: toInputValue(report.reload_coupon),
        cardFeeRegistered: toInputValue(report.card_fee_registered),
        otherExpenses: toInputValue(report.other_expenses),
        shiftIncome: toInputValue(report.shift_income),
        totalCash: toInputValue(report.total_cash),
        offDutyAmount: toInputValue(report.off_duty_amount),
        grossSales: toInputValue(report.gross_sales),
        netSales: toInputValue(report.net_sales),
        discounts: toInputValue(report.discounts),
        tax: toInputValue(report.tax),
        refunds: toInputValue(report.refunds),
        transactionCount: toInputValue(report.transaction_count),
        paymentBreakdown: Object.entries(report.payment_breakdown ?? {})
            .map(([label, value]) => `${label}=${value}`)
            .join(', '),
        notes: report.notes ?? '',
    };
}

function parsePaymentBreakdown(value: string) {
    const entries = value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [label, amount] = part.split('=').map(segment => segment.trim());
            return [label, amount] as const;
        })
        .filter(([label, amount]) => label && amount);

    return Object.fromEntries(entries);
}

function toInputValue(value: number | null) {
    return value === null || value === undefined ? '' : String(value);
}

function toDateTimeInputValue(value: string | null) {
    if (!value) {
        return '';
    }

    return value.replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function formatConfidence(value: number | null) {
    return value === null || value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat('en-MY', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}
