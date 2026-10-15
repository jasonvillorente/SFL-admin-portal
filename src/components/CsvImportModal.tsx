import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle, 
  FileText, 
  HelpCircle,
  MapPin,
  RefreshCw,
  Info,
  RotateCcw
} from 'lucide-react';
import { DangerZone } from '../types';
import { 
  parseZoneCsv, 
  generateCsvTemplate, 
  CsvParsedRow, 
  mergeZoneData,
  sanitizeFirestorePayload
} from '../utils/zoneUtils';
import { 
  DUPLICATE_DISTANCE_METERS, 
  MAX_BATCH_SIZE, 
  PRIVACY_DATA_HINT,
  STUDY_AREA_BOUNDS 
} from '../utils/zoneConstants';

export interface FailedRowDetail {
  rowName: string;
  reason: string;
  code?: string;
}

export interface ImportSummaryResult {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  batchId?: string;
  errorCode?: string;
  errorMessage?: string;
  failedRows?: FailedRowDetail[];
}

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingZones: DangerZone[];
  onExecuteImport: (
    toAdd: Omit<DangerZone, 'id'>[],
    toUpdate: { id: string; changes: Partial<DangerZone> }[],
    skippedCount: number,
    batchId?: string,
    importedAt?: string
  ) => Promise<ImportSummaryResult>;
  onUndoImport?: (batchId: string) => Promise<{ deletedCount: number }>;
}

export default function CsvImportModal({
  isOpen,
  onClose,
  existingZones,
  onExecuteImport,
  onUndoImport
}: CsvImportModalProps) {
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedResult, setParsedResult] = useState<ReturnType<typeof parseZoneCsv> | null>(null);
  const [duplicateResolutions, setDuplicateResolutions] = useState<Record<number, 'skip' | 'update' | 'add_anyway'>>({});
  const [filterTab, setFilterTab] = useState<'all' | 'needs_location' | 'duplicates' | 'errors' | 'valid'>('all');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<ImportSummaryResult | null>(null);

  // Undo import state
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const [undoStatusMessage, setUndoStatusMessage] = useState<string | null>(null);
  const [showUndoConfirmDialog, setShowUndoConfirmDialog] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reactively re-run parsing whenever existingZones changes (e.g. loaded from Firestore after page refresh)
  useEffect(() => {
    if (csvContent) {
      const parsed = parseZoneCsv(csvContent, existingZones);
      setParsedResult(parsed);
      setDuplicateResolutions(prev => {
        const next: Record<number, 'skip' | 'update' | 'add_anyway'> = {};
        parsed.rows.forEach(r => {
          if (r.duplicateOf) {
            next[r.rowIndex] = prev[r.rowIndex] || 'skip';
          }
        });
        return next;
      });
    }
  }, [existingZones, csvContent]);

  // Check if the same file name or the same batch contents were imported previously
  const duplicateBatchWarning = useMemo(() => {
    if (!parsedResult || parsedResult.rows.length === 0) return null;

    let history: Array<{ fileName: string; batchId: string; timestamp: string; zoneNames: string[] }> = [];
    try {
      const stored = localStorage.getItem('saferoute_import_history');
      if (stored) history = JSON.parse(stored);
    } catch (_) {}

    // 1. Same file name previously imported
    if (fileName) {
      const matchFile = history.find(h => h.fileName.toLowerCase() === fileName.toLowerCase());
      if (matchFile) {
        return {
          title: 'Duplicate File Previously Imported',
          message: `The file "${fileName}" was already imported on ${new Date(matchFile.timestamp).toLocaleString()} (Batch ID: ${matchFile.batchId}). Re-importing may duplicate hazard records.`
        };
      }
    }

    // 2. Matching contents (all zone names match a prior recorded import)
    const currentNames = parsedResult.rows.map(r => r.name.trim().toLowerCase()).filter(Boolean);
    for (const h of history) {
      if (h.zoneNames && h.zoneNames.length > 0) {
        const matchCount = currentNames.filter(n => h.zoneNames.includes(n)).length;
        if (matchCount === currentNames.length && matchCount > 0) {
          return {
            title: 'Identical Batch Contents Detected',
            message: `All ${matchCount} danger zone names in this file match a previous import from ${new Date(h.timestamp).toLocaleString()} (Batch ID: ${h.batchId}).`
          };
        }
      }
    }

    // 3. Existing zones check (if existing zones already contain this exact batch of names)
    if (existingZones && existingZones.length > 0) {
      const batchCounts = new Map<string, number>();
      currentNames.forEach(name => {
        const matchingZone = existingZones.find(z => (z.locationName || '').trim().toLowerCase() === name);
        if (matchingZone && matchingZone.importBatchId) {
          batchCounts.set(matchingZone.importBatchId, (batchCounts.get(matchingZone.importBatchId) || 0) + 1);
        }
      });

      for (const [bId, count] of batchCounts.entries()) {
        if (count >= currentNames.length && count > 0) {
          return {
            title: 'Matching Active Zone Batch In Registry',
            message: `All ${count} hazard areas from this file already exist in the database under Batch ID ${bId}. Re-importing without skipping will create redundant duplicates.`
          };
        }
      }
    }

    return null;
  }, [parsedResult, fileName, existingZones]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const csv = generateCsvTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'barangay_palanan_danger_zones_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processCsvText = (text: string) => {
    setCsvContent(text);
    const parsed = parseZoneCsv(text, existingZones);
    setParsedResult(parsed);

    // Default duplicate resolution to 'skip'
    const initRes: Record<number, 'skip' | 'update' | 'add_anyway'> = {};
    parsed.rows.forEach(r => {
      if (r.duplicateOf) {
        initRes[r.rowIndex] = 'skip';
      }
    });
    setDuplicateResolutions(initRes);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportSummary(null);
    setUndoStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      processCsvText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportSummary(null);
    setUndoStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      processCsvText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  // Bulk duplicate controls only support 'skip' and 'update'
  // Requirement 3: "Add anyway" requires an explicit click per row!
  const handleSetAllDuplicates = (choice: 'skip' | 'update') => {
    if (!parsedResult) return;
    const next = { ...duplicateResolutions };
    parsedResult.rows.forEach(r => {
      if (r.duplicateOf) {
        next[r.rowIndex] = choice;
      }
    });
    setDuplicateResolutions(next);
  };

  const handleConfirmImport = async () => {
    if (!parsedResult) return;
    setIsImporting(true);

    const toAdd: Omit<DangerZone, 'id'>[] = [];
    const toUpdate: { id: string; changes: Partial<DangerZone> }[] = [];
    let skipped = 0;

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const importedAt = new Date().toISOString();

    for (const row of parsedResult.rows) {
      if (row.status === 'error') {
        skipped++;
        continue;
      }

      if (row.duplicateOf) {
        const userChoice = duplicateResolutions[row.rowIndex] || 'skip';
        if (userChoice === 'skip') {
          skipped++;
          continue;
        }
        if (userChoice === 'update') {
          const existing = row.duplicateOf.zone;
          const updateChanges: Partial<DangerZone> = {
            locationName: row.name,
            latitude: row.lat !== null ? row.lat : existing.latitude,
            longitude: row.lng !== null ? row.lng : existing.longitude,
            radius: row.radius,
            category: row.category,
            description: row.description,
            source: row.source,
            activeTime: row.activeTime,
            startHour: row.startHour,
            endHour: row.endHour,
            nightCrimeCount: row.nightCrimeCount,
            dayCrimeCount: row.dayCrimeCount,
            crimeCount: row.crimeCount,
            crimeTypes: row.crimeTypes || {},
            importBatchId: batchId,
            importedAt: importedAt
          };
          if (row.dataPeriod && row.dataPeriod.trim()) {
            updateChanges.dataPeriod = row.dataPeriod.trim();
          }
          if (row.lastIncidentDate && row.lastIncidentDate.trim()) {
            updateChanges.lastIncidentDate = row.lastIncidentDate.trim();
          }

          const merged = mergeZoneData(existing, updateChanges);
          toUpdate.push({ id: existing.id, changes: sanitizeFirestorePayload(merged) });
          continue;
        }
        // If 'add_anyway', fall through to toAdd
      }

      // Add new zone without any undefined fields.
      // CRITICAL: Rows flagged needsLocation are saved with NO latitude/longitude (omit fields completely)
      const zonePayload: Omit<DangerZone, 'id'> = {
        zoneId: '',
        locationName: row.name,
        radius: row.radius,
        category: row.category,
        description: row.description || 'Imported via Barangay CSV data entry.',
        source: row.source,
        activeTime: row.activeTime,
        startHour: row.startHour,
        endHour: row.endHour,
        nightCrimeCount: row.nightCrimeCount,
        dayCrimeCount: row.dayCrimeCount,
        crimeCount: row.crimeCount,
        crimeTypes: row.crimeTypes || {},
        status: row.needsLocation ? 'inactive' : 'active',
        active: !row.needsLocation,
        needsLocation: row.needsLocation,
        importBatchId: batchId,
        importedAt: importedAt,
        createdAt: new Date().toISOString()
      };

      if (!row.needsLocation && row.lat !== null && row.lng !== null) {
        zonePayload.latitude = row.lat;
        zonePayload.longitude = row.lng;
      }
      if (row.dataPeriod && row.dataPeriod.trim()) {
        zonePayload.dataPeriod = row.dataPeriod.trim();
      }
      if (row.lastIncidentDate && row.lastIncidentDate.trim()) {
        zonePayload.lastIncidentDate = row.lastIncidentDate.trim();
      }
      toAdd.push(sanitizeFirestorePayload(zonePayload));
    }

    try {
      const summary = await onExecuteImport(toAdd, toUpdate, skipped, batchId, importedAt);
      const effectiveBatch = summary.batchId || batchId;
      setImportSummary({
        ...summary,
        batchId: effectiveBatch
      });

      // Record successful batch to local storage history to warn against re-import
      if (summary.added > 0 || summary.updated > 0) {
        try {
          const historyEntry = {
            fileName: fileName || 'batch_import.csv',
            batchId: effectiveBatch,
            timestamp: importedAt,
            zoneNames: parsedResult.rows.map(r => r.name.trim().toLowerCase()).filter(Boolean)
          };
          const existing = JSON.parse(localStorage.getItem('saferoute_import_history') || '[]');
          existing.unshift(historyEntry);
          localStorage.setItem('saferoute_import_history', JSON.stringify(existing.slice(0, 25)));
        } catch (_) {}
      }
    } catch (err: any) {
      console.error('Import execution failed:', err);
      const eCode = err?.code || (err?.name || 'import-error');
      const eMsg = err?.message || String(err);
      setImportSummary({
        added: 0,
        updated: 0,
        skipped,
        failed: toAdd.length + toUpdate.length,
        batchId,
        errorCode: eCode,
        errorMessage: eMsg,
        failedRows: toAdd.map(a => ({
          rowName: a.locationName,
          reason: eMsg,
          code: eCode
        }))
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleUndoCurrentImport = async () => {
    if (!onUndoImport || !importSummary?.batchId) return;
    setIsUndoing(true);
    setUndoStatusMessage(null);
    try {
      const res = await onUndoImport(importSummary.batchId);
      setUndoStatusMessage(`Successfully reverted import batch ${importSummary.batchId}: deleted ${res.deletedCount} danger zone documents.`);
      setShowUndoConfirmDialog(false);
    } catch (err: any) {
      setUndoStatusMessage(`Undo failed: ${err.message || String(err)}`);
    } finally {
      setIsUndoing(false);
    }
  };

  const visibleRows = (parsedResult?.rows || []).filter(r => {
    if (filterTab === 'needs_location') return r.needsLocation;
    if (filterTab === 'duplicates') return !!r.duplicateOf;
    if (filterTab === 'errors') return r.status === 'error';
    if (filterTab === 'valid') return r.status === 'valid' && !r.duplicateOf;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-slate-50">
          <div>
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900 font-display">Bulk CSV Danger Zone Importer</h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Rapid ingestion for Barangay Palanan crime incidence data. Batched writes up to {MAX_BATCH_SIZE} records.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Privacy Hint Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start space-x-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900">
              <span className="font-semibold">Privacy Data Notice: </span>
              {PRIVACY_DATA_HINT}
            </div>
          </div>

          {/* Import Summary after completion */}
          {importSummary && (
            <div className={`border rounded-lg p-4 ${
              importSummary.failed > 0 && importSummary.added === 0 && importSummary.updated === 0
                ? 'bg-rose-50 border-rose-300'
                : importSummary.failed > 0
                ? 'bg-amber-50 border-amber-300'
                : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 border-slate-200">
                <div className="flex items-center space-x-2">
                  {importSummary.failed > 0 && importSummary.added === 0 && importSummary.updated === 0 ? (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  ) : importSummary.failed > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  <h4 className="font-bold text-slate-900 text-sm">
                    {importSummary.failed > 0 && importSummary.added === 0 && importSummary.updated === 0
                      ? 'CSV Import Failed'
                      : importSummary.failed > 0
                      ? 'CSV Import Completed with Errors'
                      : 'CSV Import Completed Successfully'}
                  </h4>
                </div>
                {importSummary.batchId && (
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white border border-slate-300 rounded font-mono text-[11px] text-slate-800 shadow-2xs">
                    <span className="font-semibold text-slate-500 uppercase text-[9px]">Batch ID:</span>
                    <span className="font-bold select-all">{importSummary.batchId}</span>
                  </div>
                )}
              </div>

              {/* Exact Error Code & Error Message Display (Requirement 1 & 3) */}
              {importSummary.errorMessage && (
                <div className="mt-3 p-3 bg-white border border-rose-300 rounded-md shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-rose-800 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Firestore Error Details {importSummary.errorCode ? `(${importSummary.errorCode})` : ''}:</span>
                  </div>
                  <div className="mt-1.5 p-2 bg-rose-50 rounded text-rose-900 font-mono text-xs break-all select-all border border-rose-100">
                    {importSummary.errorMessage}
                  </div>
                  {importSummary.errorCode === 'permission-denied' && (
                    <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                      <strong>Permission Notice:</strong> Firestore returned <code>permission-denied</code>. This occurs when writing directly without an active Firebase Auth user token or when the user profile does not meet security rules requirements. The system automatically elevates fallback writes through the administrative bridge.
                    </div>
                  )}
                </div>
              )}

              {/* Failed Rows Breakdown (Requirement 5) */}
              {importSummary.failedRows && importSummary.failedRows.length > 0 && (
                <div className="mt-3 bg-white p-3 rounded-md border border-rose-200 shadow-2xs">
                  <div className="text-xs font-bold text-rose-900 mb-2 flex items-center justify-between">
                    <span>Failed Rows Breakdown ({importSummary.failedRows.length}):</span>
                    <span className="text-[10px] font-normal text-slate-500">Individual row reasons</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {importSummary.failedRows.map((f, idx) => (
                      <div key={idx} className="p-2 bg-rose-50/70 rounded border border-rose-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="font-semibold text-slate-900 truncate">{f.rowName}</span>
                        <span className="text-rose-700 font-mono text-[11px] break-all">{f.code ? `[${f.code}] ` : ''}{f.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-3 mt-3 text-center">
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Added</span>
                  <span className="text-lg font-bold text-emerald-700">{importSummary.added}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Updated</span>
                  <span className="text-lg font-bold text-indigo-700">{importSummary.updated}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Skipped</span>
                  <span className="text-lg font-bold text-amber-600">{importSummary.skipped}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Failed</span>
                  <span className="text-lg font-bold text-rose-600">{importSummary.failed}</span>
                </div>
              </div>

              {/* Undo status banner */}
              {undoStatusMessage && (
                <div className={`mt-3 p-3 rounded text-xs font-medium border ${
                  undoStatusMessage.includes('Successfully')
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {undoStatusMessage}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                {onUndoImport && importSummary.batchId && (importSummary.added > 0 || importSummary.updated > 0) && (
                  <button
                    type="button"
                    onClick={() => setShowUndoConfirmDialog(true)}
                    disabled={isUndoing}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-semibold rounded flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                    <span>{isUndoing ? 'Undoing batch...' : `Undo this import (${importSummary.added} added)`}</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded shadow-sm cursor-pointer ml-auto"
                >
                  Close & View Zones
                </button>
              </div>
            </div>
          )}

          {/* Upload Area & Template Download */}
          {!importSummary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="md:col-span-2 border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors text-center"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-indigo-600 mb-2" />
                <span className="text-xs font-semibold text-slate-800">
                  {fileName ? `Loaded: ${fileName}` : 'Click to select or drag and drop a CSV file'}
                </span>
                <span className="text-[11px] text-gray-500 mt-1">
                  Supports UTF-8 BOM, quoted commas, and Palanan coordinates bounding check
                </span>
              </div>

              {/* Download Template Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center space-x-1.5">
                    <Download className="w-4 h-4 text-slate-600" />
                    <span>Download Template</span>
                  </h4>
                  <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                    Includes headers for crime counts (night/day split or single total), operating hours, types, and sample Palanan streets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="mt-3 w-full inline-flex items-center justify-center space-x-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold py-2 px-3 rounded shadow-2xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .CSV Template</span>
                </button>
              </div>

            </div>
          )}

          {/* Warning when same file or same batch contents were imported before */}
          {duplicateBatchWarning && !importSummary && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded shadow-2xs flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-bold flex items-center space-x-1.5">
                  <span>{duplicateBatchWarning.title}</span>
                </p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">{duplicateBatchWarning.message}</p>
              </div>
            </div>
          )}

          {/* Preview & Duplicate Reconciliation Table */}
          {parsedResult && !importSummary && (
            <div className="space-y-3">
              
              {/* Stats Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">Preview Parsed Records:</span>
                  <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded">
                    Total: {parsedResult.totalRows}
                  </span>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-mono px-2 py-0.5 rounded">
                    Valid: {parsedResult.validRows}
                  </span>
                  {parsedResult.needsLocationRows > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-800 font-mono px-2 py-0.5 rounded">
                      Needs Location: {parsedResult.needsLocationRows}
                    </span>
                  )}
                  {parsedResult.errorRows > 0 && (
                    <span className="text-xs bg-rose-100 text-rose-800 font-mono px-2 py-0.5 rounded">
                      Errors: {parsedResult.errorRows}
                    </span>
                  )}
                </div>

                {/* Duplicate bulk helper (Requirement 3: "Add anyway" requires explicit per-row selection) */}
                {parsedResult.rows.some(r => r.duplicateOf) && (
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-semibold text-slate-600">All Duplicates ({DUPLICATE_DISTANCE_METERS}m / name):</span>
                    <button
                      type="button"
                      onClick={() => handleSetAllDuplicates('skip')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-medium cursor-pointer"
                    >
                      Skip All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllDuplicates('update')}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-medium cursor-pointer"
                    >
                      Update All
                    </button>
                    <span className="text-[10px] text-amber-700 italic hidden sm:inline">
                      ("Add anyway" requires explicit click per row)
                    </span>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`text-xs px-3 py-1.5 font-medium border-b-2 ${filterTab === 'all' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  All Rows ({parsedResult.rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('needs_location')}
                  className={`text-xs px-3 py-1.5 font-medium border-b-2 ${filterTab === 'needs_location' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  Needs Location ({parsedResult.needsLocationRows})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('duplicates')}
                  className={`text-xs px-3 py-1.5 font-medium border-b-2 ${filterTab === 'duplicates' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  Likely Duplicates ({parsedResult.rows.filter(r => !!r.duplicateOf).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('errors')}
                  className={`text-xs px-3 py-1.5 font-medium border-b-2 ${filterTab === 'errors' ? 'border-rose-600 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  Errors ({parsedResult.errorRows})
                </button>
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded overflow-x-auto max-h-72">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Row</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Status</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Location Name</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Coords / Geo</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Crimes</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Active Hours</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Source</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase text-[10px]">Action / Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-gray-400 italic">
                          No rows match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((r) => {
                        const resolution = duplicateResolutions[r.rowIndex] || 'skip';
                        return (
                          <tr key={r.rowIndex} className={r.status === 'error' ? 'bg-rose-50/50' : r.duplicateOf ? 'bg-amber-50/30' : ''}>
                            <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">#{r.rowIndex}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.status === 'valid' && !r.duplicateOf && !r.needsLocation && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  Valid
                                </span>
                              )}
                              {r.needsLocation && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                  Needs Location
                                </span>
                              )}
                              {r.duplicateOf && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
                                  Duplicate
                                </span>
                              )}
                              {r.status === 'error' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">
                                  Error
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600 font-mono">
                              {r.lat !== null && r.lng !== null 
                                ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` 
                                : <span className="text-amber-600 italic">Missing coordinates</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                              <span className="font-bold text-slate-900">{r.crimeCount}</span>
                              <span className="text-[10px] text-gray-500 ml-1">
                                (N:{r.nightCrimeCount}, D:{r.dayCrimeCount})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap text-[11px]">
                              {r.activeTime} ({r.startHour}:00 - {r.endHour}:00)
                            </td>
                            <td className="px-3 py-2 text-slate-600 text-[11px]">{r.source}</td>
                            <td className="px-3 py-2">
                              {r.duplicateOf ? (
                                <div className="space-y-1">
                                  <div className="text-[10px] text-amber-800 font-medium">
                                    Matches "{r.duplicateOf.zone.locationName}"
                                    {r.duplicateOf.distanceMeters !== undefined && ` (${Math.round(r.duplicateOf.distanceMeters)}m)`}
                                  </div>
                                  <div className="flex items-center space-x-1.5">
                                    <label className="inline-flex items-center text-[10px]">
                                      <input
                                        type="radio"
                                        name={`dup-${r.rowIndex}`}
                                        checked={resolution === 'skip'}
                                        onChange={() => setDuplicateResolutions(prev => ({ ...prev, [r.rowIndex]: 'skip' }))}
                                        className="mr-1 text-slate-600"
                                      />
                                      Skip
                                    </label>
                                    <label className="inline-flex items-center text-[10px] text-indigo-700 font-semibold">
                                      <input
                                        type="radio"
                                        name={`dup-${r.rowIndex}`}
                                        checked={resolution === 'update'}
                                        onChange={() => setDuplicateResolutions(prev => ({ ...prev, [r.rowIndex]: 'update' }))}
                                        className="mr-1 text-indigo-600"
                                      />
                                      Update
                                    </label>
                                    <label className="inline-flex items-center text-[10px] text-amber-800">
                                      <input
                                        type="radio"
                                        name={`dup-${r.rowIndex}`}
                                        checked={resolution === 'add_anyway'}
                                        onChange={() => setDuplicateResolutions(prev => ({ ...prev, [r.rowIndex]: 'add_anyway' }))}
                                        className="mr-1 text-amber-600"
                                      />
                                      Add anyway
                                    </label>
                                  </div>
                                </div>
                              ) : r.issues.length > 0 ? (
                                <div className="text-[10px] text-rose-700 font-medium">
                                  {r.issues.join(', ')}
                                </div>
                              ) : (
                                <span className="text-[10px] text-emerald-600">Ready to import</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-slate-50">
          <div className="text-xs text-gray-500">
            {parsedResult && (
              <span>
                Ready to commit: {
                  parsedResult.rows.filter(r => r.status !== 'error' && (!r.duplicateOf || duplicateResolutions[r.rowIndex] !== 'skip')).length
                } zones
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!parsedResult || isImporting || (parsedResult.rows.filter(r => r.status !== 'error').length === 0)}
              onClick={handleConfirmImport}
              className="inline-flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-sm transition-colors"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Batch Write...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Confirm & Save to Firestore</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Confirmation Dialog for Undoing an Import Batch */}
      {showUndoConfirmDialog && importSummary && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-900">Undo Import Batch Confirmation</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete the <strong>{importSummary.added}</strong> danger zones created in import batch:
                </p>
                <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 break-all select-all font-bold">
                  {importSummary.batchId}
                </div>
                <p className="text-[11px] text-rose-600 mt-2 font-semibold">
                  This will remove only documents with this batch ID from the registry. Existing zones updated by this batch will not be deleted.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUndoConfirmDialog(false)}
                disabled={isUndoing}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUndoCurrentImport}
                disabled={isUndoing}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isUndoing ? 'Deleting...' : `Confirm Delete (${importSummary.added} zones)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
