import React, { useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import { uploadData } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';
import { ReportSettings, type ReportConfig } from './ReportSettings';
import { PolicyChat } from './PolicyChat';

interface ReportsListProps {
  onUploadComplete: (fileName: string, fileSize: number, fileKey: string) => void;
  onDeleteReport: (report: Schema["PolicyReport"]["type"]) => void;
  onProcessReport: (report: Schema["PolicyReport"]["type"]) => Promise<void>;
  client: ReturnType<typeof generateClient<Schema>> | null;
  reports: Array<Schema["PolicyReport"]["type"]>;
  user: any;
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'UPLOADED': return 'status-uploaded';
    case 'PROCESSING': return 'status-processing';
    case 'COMPLETED': return 'status-completed';
    case 'FAILED': return 'status-failed';
    default: return 'status-default';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'UPLOADED': return 'Uploaded';
    case 'PROCESSING': return 'Processing...';
    case 'COMPLETED': return 'Completed';
    case 'FAILED': return 'Failed';
    default: return 'Unknown';
  }
};

const sanitizeUserId = (userId: string): string => {
  // Remove special characters and limit length for safe file paths
  return userId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
};

// ── Data helpers ─────────────────────────────────────────────────────────────

const parsePolicyData = (
  report: Schema["PolicyReport"]["type"]
): Record<string, Record<string, { identified: string; aligns: string; measurable: string }>> | null => {
  if (!report.policyData) return null;
  try {
    let data: any = report.policyData;
    while (typeof data === 'string') data = JSON.parse(data);
    return data;
  } catch {
    return null;
  }
};

const parseReportMeta = (
  report: Schema["PolicyReport"]["type"]
): { city: string | null; country: string | null; reviewer: string | null; year: string | null } => {
  const empty = { city: null, country: null, reviewer: null, year: null };
  if (!report.reportConfig) return empty;
  try {
    let cfg: any = report.reportConfig;
    while (typeof cfg === 'string') cfg = JSON.parse(cfg);
    const lang = cfg?.reporting?.languages?.English;
    return {
      city: cfg?.city || lang?.name || null,
      country: cfg?.country || lang?.country || null,
      reviewer: cfg?.reviewer || cfg?.reporting?.exceptions?.English?.author_names || null,
      year: cfg?.year || null,
    };
  } catch {
    return empty;
  }
};

const extractImageS3Key = (
  report: Schema["PolicyReport"]["type"]
): string | null => {
  if (!report.reportConfig) return null;
  try {
    let cfg: any = report.reportConfig;
    while (typeof cfg === 'string') cfg = JSON.parse(cfg);
    return cfg?.reporting?.images?.['1']?.s3Key || null;
  } catch {
    return null;
  }
};

const EXCLUDED_MEASURE = 'Transport and planning combined in one government department';
const ALIGN_SCORE: Record<string, number> = { '✔': 1, '✔/✘': -0.5, '✘': -1 };
const MEASURABLE_SCORE: Record<string, number> = { '✔': 2, '✘': 1, '-': 0 };

const computeScores = (
  policyData: Record<string, any> | null
) => {
  if (!policyData) return null;
  // Prefer the authoritative scores saved by get_policy_presence_quality_score_dictionary()
  // (stored under '_scores' by the Lambda).  These match the PDF report exactly.
  if (policyData['_scores']) {
    const s = policyData['_scores'] as {
      presence: { numerator: number; denominator: number };
      quality: { numerator: number; denominator: number };
    };
    if (
      typeof s.presence?.numerator === 'number' &&
      typeof s.presence?.denominator === 'number' &&
      typeof s.quality?.numerator === 'number' &&
      typeof s.quality?.denominator === 'number'
    ) {
      return s;
    }
  }
  // Fallback: recompute from policyData for older records without _scores
  const seen = new Map<string, { identified: string; aligns: string; measurable: string }>();
  for (const [key, topic] of Object.entries(policyData)) {
    if (key.startsWith('_')) continue;
    for (const [measure, vals] of Object.entries(topic as Record<string, any>)) {
      if (!seen.has(measure)) seen.set(measure, vals as any);
    }
  }
  let presenceNum = 0;
  const presenceDen = seen.size;
  let qualityNum = 0;
  let qualityDen = 0;
  for (const [measure, vals] of seen.entries()) {
    if (vals.identified === '✔') presenceNum++;
    if (measure !== EXCLUDED_MEASURE) {
      const aScore = ALIGN_SCORE[vals.aligns] ?? 0;
      const mScore = MEASURABLE_SCORE[vals.measurable] ?? 0;
      qualityNum += aScore * mScore;
      qualityDen += 2;
    }
  }
  return {
    presence: { numerator: presenceNum, denominator: presenceDen },
    quality: { numerator: qualityNum, denominator: qualityDen },
  };
};

const pct = (n: number, d: number) =>
  d === 0 ? '–' : `${((100 * n) / d).toFixed(1)}%`;

const cellClass = (v: string) => {
  if (v === '✔') return 'cell-tick';
  if (v === '✘' || v === '✔/✘') return 'cell-cross';
  return 'cell-dash';
};

export const ReportsList: React.FC<ReportsListProps> = ({ onUploadComplete, onDeleteReport, onProcessReport, reports, user }) => {
  const [selectedReport, setSelectedReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [settingsReport, setSettingsReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [policyDataReport, setPolicyDataReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [policyChatReport, setPolicyChatReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfReport, setPdfReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);
  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'uploadDate' | 'completedDate' | 'cityCountry' | 'countryCity' | 'author'>('uploadDate');
  const [showStatusInfo, setShowStatusInfo] = useState(false);
  const fetchedS3KeysRef = useRef<Set<string>>(new Set());
  const client = generateClient<Schema>();

  useEffect(() => {
    // No longer needed - reports come from props
  }, []);

  useEffect(() => {
    if (selectedReport) {
      setExpandedIndicator(null);
    }
  }, [selectedReport?.id]);

  // Clean up object URL when modal closes
  useEffect(() => {
    return () => {
      if (pdfViewerUrl) {
        URL.revokeObjectURL(pdfViewerUrl);
      }
    };
  }, [pdfViewerUrl]);

  // Fetch signed URLs for custom uploaded images (keyed by s3Key so updates are picked up)
  useEffect(() => {
    const fetchImageUrls = async () => {
      const updates: Record<string, string> = {};
      for (const report of reports.filter(r => r !== null)) {
        const s3Key = extractImageS3Key(report);
        if (!s3Key || fetchedS3KeysRef.current.has(s3Key)) continue;
        fetchedS3KeysRef.current.add(s3Key);
        try {
          const { url } = await getUrl({ path: s3Key });
          updates[s3Key] = url.toString();
        } catch {
          // image not accessible, skip
        }
      }
      if (Object.keys(updates).length > 0) {
        setImageUrlMap(prev => ({ ...prev, ...updates }));
      }
    };
    fetchImageUrls();
  }, [reports]);

  const handleFiles = async (files: File[]) => {
    const xlsxFiles = files.filter(f => f.name.endsWith('.xlsx'));
    const rejected = files.filter(f => !f.name.endsWith('.xlsx'));

    if (rejected.length > 0) {
      alert(`Skipped ${rejected.length} non-xlsx file(s): ${rejected.map(f => f.name).join(', ')}`);
    }

    if (xlsxFiles.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of xlsxFiles) {
        if (file.size >= 1024 * 1024) {
          alert(`"${file.name}" exceeds 1MB and was skipped.`);
          continue;
        }

        // Check for duplicate filename (filter out null records from deserialization errors)
        const existingReport = reports.filter(r => r !== null).find(r => r.fileName === file.name);
        if (existingReport) {
          alert(`"${file.name}" already exists. Please delete the existing report before uploading again.`);
          continue;
        }

        try {
          // Generate S3 key using sanitized username for organization
          // Format: public/{sanitized-username}/{filename}
          const username = sanitizeUserId(user?.username || 'unknown');
          const key = `${username}/${file.name}`;

          await uploadData({
            path: `public/${key}`,
            data: file,
            options: {
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
          });

          // Trigger processing after successful upload (fileName is original, fileKey is user-specific)
          onUploadComplete(file.name, file.size, `public/${key}`);
        } catch (error) {
          console.error('Upload failed:', error);
          alert(`Upload failed for "${file.name}". Please try again.`);
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
    // Reset input so the same file can be re-selected after deletion
    e.target.value = '';
  };

  const openReport = async (report: Schema["PolicyReport"]["type"]) => {
      setSelectedReport(report);
      return;
  };

  const handleSaveSettings = async (config: ReportConfig) => {
    if (!settingsReport) return;
    
    try {
      console.log('Saving settings for:', settingsReport.fileName);
      
      // Update the report in the database
      // Note: reportConfig field expects a JSON string, not an object
      await client.models.PolicyReport.update({
        id: settingsReport.id,
        reportConfig: JSON.stringify(config),
      });
      
      // Wait for DynamoDB eventual consistency
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch the updated report to verify
      const { data: verifyReport } = await client.models.PolicyReport.get({
        id: settingsReport.id
      });
      
      if (verifyReport) {
        console.log('Settings saved successfully');
        setSettingsReport(verifyReport);
      }
      
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
      throw error;
    }
  };

  const handleViewPdf = async (pdfPath: string, report: Schema["PolicyReport"]["type"]) => {
    try {
      const signedUrl = await getUrl({ path: pdfPath });
      
      // Fetch the PDF as a blob to avoid download prompt
      const response = await fetch(signedUrl.url.toString());
      const arrayBuffer = await response.arrayBuffer();
      
      // Create a blob with explicit PDF MIME type
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      
      // Create a local object URL that can be displayed inline
      const objectUrl = URL.createObjectURL(blob);
      setPdfViewerUrl(objectUrl);
      setPdfReport(report);
    } catch (error) {
      console.error('Failed to open PDF:', error);
      alert('Failed to open PDF report');
    }
  };

  const handleCopyJson = (jsonString: string) => {
    navigator.clipboard.writeText(jsonString).then(() => {
      alert('JSON copied to clipboard!');
    }).catch((error) => {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard.');
    });
  };

  const handleDownloadXlsx = async (report: ReportsListProps['reports'][number]) => {
    if (!report?.fileKey) return;
    try {
      const { url } = await getUrl({ path: report.fileKey });
      const link = document.createElement('a');
      link.href = url.toString();
      link.download = report.fileName || 'policy_checklist.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download xlsx:', error);
      alert('Failed to download the policy checklist file.');
    }
  };

  const handleDownloadPdf = async (report: ReportsListProps['reports'][number]) => {
    if (!report?.pdfUrl) return;
    try {
      const { url } = await getUrl({ path: report.pdfUrl });
      const link = document.createElement('a');
      link.href = url.toString();
      const meta = parseReportMeta(report);
      link.download = (meta.city && meta.country)
        ? `${meta.city}_${meta.country}_policy_report.pdf`
        : report.fileName.replace('.xlsx', '_policy_report.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download pdf:', error);
      alert('Failed to download the PDF report.');
    }
  };

  const handleDownloadJson = (jsonString: string, fileName: string) => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace('.xlsx', '')}_policy_data.json` || 'policy_data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatDateYYYYMMDD = (dateString: string | undefined | null): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleToggleSelect = (reportId: string) => {
    setSelectedReportIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reportId)) {
        newSet.delete(reportId);
      } else {
        newSet.add(reportId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const validReports = reports.filter(r => r !== null);
    const allIds = new Set(validReports.map(r => r.id));
    setSelectedReportIds(allIds);
  };

  const handleClearSelection = () => {
    setSelectedReportIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedReportIds.size === 0) {
      alert('No reports selected');
      return;
    }
    
    const count = selectedReportIds.size;
    if (!confirm(`Delete ${count} selected report(s)?`)) {
      return;
    }

    // Delete each selected report
    const reportsToDelete = reports.filter(r => r !== null && selectedReportIds.has(r.id));
    reportsToDelete.forEach(report => onDeleteReport(report));
    
    // Clear selection
    setSelectedReportIds(new Set());
  };

  const handleDownloadSelected = async () => {
    if (selectedReportIds.size === 0) {
      alert('No reports selected');
      return;
    }

    const reportsToDownload = reports.filter(r => r !== null && selectedReportIds.has(r.id));
    
    // Download PDFs for completed reports
    for (const report of reportsToDownload) {
      if (report.status === 'COMPLETED' && report.pdfUrl) {
        try {
          const signedUrl = await getUrl({ path: report.pdfUrl });
          const response = await fetch(signedUrl.url.toString());
          const blob = await response.blob();
          
          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const meta = parseReportMeta(report);
          const fileName = meta.city && meta.country 
            ? `${meta.city}_${meta.country}_policy_report.pdf`
            : report.fileName.replace('.xlsx', '_policy_report.pdf');
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          // Small delay between downloads to avoid browser blocking
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Failed to download PDF for ${report.fileName}:`, error);
        }
      }
    }
  };

  const getSortedReports = () => {
    const validReports = reports.filter(report => report !== null);
    
    return [...validReports].sort((a, b) => {
      const metaA = parseReportMeta(a);
      const metaB = parseReportMeta(b);
      
      switch (sortBy) {
        case 'cityCountry': {
          const cityA = metaA.city || '';
          const cityB = metaB.city || '';
          const countryA = metaA.country || '';
          const countryB = metaB.country || '';
          const compareCity = cityA.localeCompare(cityB);
          return compareCity !== 0 ? compareCity : countryA.localeCompare(countryB);
        }
        case 'countryCity': {
          const cityA = metaA.city || '';
          const cityB = metaB.city || '';
          const countryA = metaA.country || '';
          const countryB = metaB.country || '';
          const compareCountry = countryA.localeCompare(countryB);
          return compareCountry !== 0 ? compareCountry : cityA.localeCompare(cityB);
        }
        case 'author': {
          const authorA = metaA.reviewer || '';
          const authorB = metaB.reviewer || '';
          return authorA.localeCompare(authorB);
        }
        case 'completedDate': {
          const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return dateB - dateA; // Most recent first
        }
        case 'uploadDate':
        default: {
          const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
          const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
          return dateB - dateA; // Most recent first
        }
      }
    });
  };

  const sortedReports = getSortedReports();

  return (
    <>
      {/* Toolbar above the grid */}
      <div className="reports-toolbar">
        <div className="toolbar-left">
        </div>
        <div className="toolbar-right">
          {selectedReportIds.size > 0 ? (
            <div className="selection-controls">
              <span className="selection-text">Selection ({selectedReportIds.size}):</span>
              <button 
                onClick={handleDeleteSelected}
                className="btn-link btn-link-danger"
                title={`Delete ${selectedReportIds.size} selected report(s)`}
              >
                Delete
              </button>
              <button 
                onClick={handleDownloadSelected}
                className="btn-link btn-link-primary"
                title={`Download ${selectedReportIds.size} selected report(s)`}
              >
                Download
              </button>
              <button 
                onClick={handleClearSelection}
                className="btn-link btn-link-secondary"
                title="Clear selection"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="selection-controls">
              <button 
                onClick={handleSelectAll}
                className="btn-link btn-link-primary"
                title="Select all reports"
                disabled={reports.filter(r => r !== null).length === 0}
              >
                Select all
              </button>
            </div>
          )}
          <label className="sort-label">
            Sort by:
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="sort-select"
            >
              <option value="uploadDate">Upload date</option>
              <option value="completedDate">Completed date</option>
              <option value="cityCountry">City, Country</option>
              <option value="countryCity">Country, City</option>
              <option value="author">Author</option>
            </select>
          </label>
        </div>
      </div>

      <div className="reports-grid">
        {/* Upload area as first item */}
        <div
          className={`upload-card ${isDragging ? 'dragging' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => document.getElementById('file-input-grid')?.click()}
        >
          <div className="upload-thumbnail">
            {isUploading ? (
              <div>⏳<br/>Uploading...</div>
            ) : (
              <div>📁<br/>Upload 1000 Cities Challenge policy checklist xlsx file(s)</div>
            )}
          </div>
          <input
            type="file"
            accept=".xlsx"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="file-input-grid"
          />
        </div>

        {/* Existing reports */}
        {sortedReports.map((report) => {
          const meta = parseReportMeta(report);
          const policyData = parsePolicyData(report);
          const scores = computeScores(policyData);
          const titleLine = (meta.city && meta.country)
            ? `${meta.city}, ${meta.country}`
            : meta.city || meta.country || report.fileName;
          const cardS3Key = extractImageS3Key(report);
          const bgUrl = cardS3Key ? imageUrlMap[cardS3Key] : undefined;
          const isSelected = selectedReportIds.has(report.id);
          return (
          <div
            key={report.id}
            className={`report-card ${isSelected ? 'report-card-selected' : ''}`}
          >
            {/* Header with checkbox and status */}
            <div className="report-card-header">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleSelect(report.id);
                }}
                className="report-checkbox"
                title="Select for deletion"
              />
              <span>
                <div
                  className="status-badge xlsx-badge"
                  onClick={(e) => { e.stopPropagation(); handleDownloadXlsx(report); }}
                  style={{ cursor: 'pointer' }}
                  title="Download policy checklist .xlsx file"
                >
                  xlsx
                </div>
                {report.status === 'COMPLETED' && report.pdfUrl && (
                  <div
                    className="status-badge pdf-badge"
                    onClick={(e) => { e.stopPropagation(); handleDownloadPdf(report); }}
                    style={{ cursor: 'pointer' }}
                    title="Download PDF report"
                  >
                    pdf
                  </div>
                )}
                <div 
                  className={`status-badge ${getStatusClass(report.status || 'PROCESSING')}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStatusInfo(true);
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Click for status info"
                >
                  {getStatusText(report.status || 'PROCESSING')}
                </div>
              </span>
            </div>

            {/* Clickable thumbnail/scorecard */}
            <div
              className="report-thumbnail"
              onClick={() => openReport(report)}
              style={bgUrl ? {
                backgroundImage: `linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.9)), url("${bgUrl}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : undefined}
            >
              {/* Centre content */}
              <div className="thumbnail-center">
                {report.status === 'COMPLETED' && scores ? (
                  <div className="report-scores">
                    <div className="score-row">
                      <span className="score-label">Policy presence</span>
                      <span className="score-label">Policy quality</span>
                    </div>
                    <div className="score-row">
                      <span className="score-pct">{pct(scores.presence.numerator, scores.presence.denominator)}</span>
                      <span className="score-pct">{pct(scores.quality.numerator, scores.quality.denominator)}</span>
                    </div>
                    <div className="score-row">
                      <span className="score-detail">{scores.presence.numerator}/{scores.presence.denominator}</span>
                      <span className="score-detail">{scores.quality.numerator.toFixed(1)}/{scores.quality.denominator}</span>
                    </div>
                  </div>
                ) : report.status === 'FAILED' ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32 }}>⚠️</div>
                    {report.errorMessage && (
                      <div className="error-indicator" title={report.errorMessage}>
                        Click for details
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 32 }}>⏳</div>
                )}
              </div>

              {/* Action buttons – centred at bottom */}
              {(report.status === 'UPLOADED' || report.status === 'FAILED' || report.status === 'COMPLETED') && (
                <div className="action-buttons-bar">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { data: freshReport } = await client.models.PolicyReport.get({ id: report.id });
                      setSettingsReport(freshReport || report);
                    }}
                    className="btn-icon"
                    title="Report settings"
                  >⚙️</button>
                  {report.status !== 'COMPLETED' ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onProcessReport(report); }}
                      className="btn-icon"
                      title="Process report"
                    >▶️</button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('This will regenerate the report with current settings. Continue?')) {
                          onProcessReport(report);
                        }
                      }}
                      className="btn-icon"
                      title="Regenerate report"
                    >🔄</button>
                  )}
                  {report.status === 'COMPLETED' && report.pdfUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewPdf(report.pdfUrl!, report); }}
                      className="btn-icon"
                      title="View PDF"
                    >📄</button>
                  )}
                </div>
              )}
            </div>

            {/* Card body */}
            <div className="report-card-body">
              <div className="report-card-city">{titleLine}</div>
              {meta.reviewer && <div className="report-card-reviewer">{meta.reviewer}</div>}
              {(meta.city || meta.country) && (
                <div className="report-card-filename">{report.fileName}</div>
              )}
              <div className="report-card-date">
                {formatDateYYYYMMDD(report.uploadedAt)}
              </div>
              {report.status === 'FAILED' && report.errorMessage && (
                <p className="error-summary" title={report.errorMessage}>
                  {report.errorMessage.length > 60
                    ? report.errorMessage.substring(0, 60) + '...'
                    : report.errorMessage}
                </p>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {selectedReport && (() => {
        const meta = parseReportMeta(selectedReport);
        const policyData = parsePolicyData(selectedReport);
        const scores = computeScores(policyData);
        const titleLine = (meta.city && meta.country)
          ? `${meta.city}, ${meta.country}`
          : meta.city || meta.country || selectedReport.fileName;
        return (
        <div className="modal-overlay" onClick={() => setSelectedReport(null)}>
          <div className="modal-content report-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-top">
              <h3 className="modal-title">{titleLine}</h3>
              <table className="report-detail-info">
                <tbody>
                  {meta.reviewer && (
                    <tr>
                      <td className="detail-label">Reviewer</td>
                      <td>{meta.reviewer}</td>
                    </tr>
                  )}
                  {meta.year && (
                    <tr>
                      <td className="detail-label">Date of review</td>
                      <td>{meta.year}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="detail-label">Status</td>
                    <td><span className={`status-badge ${getStatusClass(selectedReport.status || 'PROCESSING')}`}>{getStatusText(selectedReport.status || 'PROCESSING')}</span></td>
                  </tr>
                  {selectedReport.uploadedAt && (
                    <tr>
                      <td className="detail-label">Uploaded</td>
                      <td>{formatDateYYYYMMDD(selectedReport.uploadedAt)}</td>
                    </tr>
                  )}
                  {selectedReport.completedAt && (
                    <tr>
                      <td className="detail-label">Completed</td>
                      <td>{formatDateYYYYMMDD(selectedReport.completedAt)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedReport.errorMessage && (
              <div className="modal-error">
                <span className="detail-label">Error: </span>
                <span>{selectedReport.errorMessage}</span>
              </div>
            )}

            {/* Scores */}
            {scores && (
              <div className="modal-scores">
                <div className="score-box">
                  <div className="score-box-label">Policy presence</div>
                  <div className="score-box-pct">{pct(scores.presence.numerator, scores.presence.denominator)}</div>
                  <div className="score-box-detail">{scores.presence.numerator} of {scores.presence.denominator} measures identified</div>
                </div>
                <div className="score-box">
                  <div className="score-box-label">Policy quality</div>
                  <div className="score-box-pct">{pct(scores.quality.numerator, scores.quality.denominator)}</div>
                  <div className="score-box-detail">Score: {scores.quality.numerator.toFixed(1)} / {scores.quality.denominator}</div>
                </div>
              </div>
            )}

            {/* Checklist tables */}
            {policyData && (
              <div className="checklist-section" translate="no">
                {Object.entries(policyData).filter(([k]) => !k.startsWith('_')).map(([indicator, measures]) => {
                  const isOpen = expandedIndicator === indicator;
                  return (
                    <div key={indicator} className="checklist-indicator">
                      <h4
                        className={`checklist-indicator-title checklist-indicator-toggle${isOpen ? ' is-open' : ''}`}
                        onClick={() => setExpandedIndicator(isOpen ? null : indicator)}
                      >
                        {indicator}
                        <span className="accordion-chevron">{isOpen ? '▲' : '▼'}</span>
                      </h4>
                      {isOpen && (
                        <table className="checklist-table">
                          <thead>
                            <tr>
                              <th className="col-measure">Measure</th>
                              <th className="col-score">Identified</th>
                              <th className="col-score">Aligns</th>
                              <th className="col-score">Measurable</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(measures).map(([measure, vals]: [string, any]) => (
                              <tr key={measure}>
                                <td className="col-measure">{measure}</td>
                                <td className={`col-score ${cellClass(vals.identified)}`}>{vals.identified}</td>
                                <td className={`col-score ${cellClass(vals.aligns)}`}>{vals.aligns}</td>
                                <td className={`col-score ${cellClass(vals.measurable)}`}>{vals.measurable}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="modal-footer">
              {selectedReport.status === 'COMPLETED' && selectedReport.pdfUrl && (
                <>
                  <button
                    onClick={() => handleViewPdf(selectedReport.pdfUrl!, selectedReport)}
                    className="btn btn-primary"
                    style={{ marginRight: '10px' }}
                  >
                    View PDF
                  </button>
                  <button
                    onClick={() => setPolicyDataReport(selectedReport)}
                    className="btn btn-secondary"
                    title="View Policy Data JSON"
                    style={{ marginRight: '10px' }}
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => {
                      if (selectedReport.policyData) {
                        setPolicyChatReport(selectedReport);
                        setSelectedReport(null);
                      } else {
                        alert('Policy data not available. Please regenerate the report to extract policy data.');
                      }
                    }}
                    className="btn btn-secondary"
                    title="Chat with AI about this policy data"
                  >
                    💬 Ask AI
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {pdfViewerUrl && pdfReport && (
        <div className="modal-overlay">
          <div className="modal-content pdf-viewer-modal">
            <div className="modal-header">
              <button 
                onClick={() => {
                  URL.revokeObjectURL(pdfViewerUrl);
                  setPdfViewerUrl(null);
                  setPdfReport(null);
                }}
                className="btn btn-close"
              >
                🗙
              </button>
              <h3>PDF Preview - {pdfReport.fileName}</h3>
            </div>
            <div className="pdf-viewer-container">
              <iframe
                src={pdfViewerUrl}
                title="PDF Viewer"
                style={{
                  width: '100%',
                  height: '70vh',
                  border: 'none',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {settingsReport && (
        <ReportSettings
          report={settingsReport}
          user={user}
          onClose={() => setSettingsReport(null)}
          onSave={handleSaveSettings}
        />
      )}

      {policyDataReport && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '90%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <button 
                onClick={() => setPolicyDataReport(null)}
                className="btn btn-close"
              >
                🗙
              </button>
              <h3>Policy Data - {policyDataReport.fileName}</h3>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              {policyDataReport.policyData ? (
                <pre style={{ 
                  backgroundColor: '#f5f5f5', 
                  padding: '15px', 
                  borderRadius: '4px', 
                  overflow: 'auto',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  margin: 0,
                  whiteSpace: 'pre',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                }}>
                  {(() => {
                    try {
                      let jsonData = policyDataReport.policyData;
                      
                      // Parse if it's a string
                      while (typeof jsonData === 'string') {
                        try {
                          jsonData = JSON.parse(jsonData);
                        } catch {
                          // If parse fails, break out to prevent infinite loop
                          break;
                        }
                      }
                      
                      // Pretty print with 2-space indentation
                      return JSON.stringify(jsonData, null, 2);
                    } catch (error) {
                      console.error('JSON parse error:', error);
                      // If parsing fails, show raw data
                      return String(policyDataReport.policyData);
                    }
                  })()}
                </pre>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{ marginBottom: '15px' }}>
                    Policy data is not available for this report.
                  </p>
                  <p style={{ fontSize: '14px', color: '#666' }}>
                    This could be because:
                  </p>
                  <ul style={{ textAlign: 'left', display: 'inline-block', fontSize: '14px', color: '#666' }}>
                    <li>The report was generated before the policy data feature was added</li>
                    <li>The backend needs to be deployed with the latest changes</li>
                    <li>An error occurred during processing</li>
                  </ul>
                  <p style={{ marginTop: '15px', fontSize: '14px' }}>
                    Try regenerating the report to extract policy data.
                  </p>
                </div>
              )}
            </div>
            {policyDataReport.policyData && (
              <div className="modal-footer" style={{ borderTop: '1px solid #ddd', padding: '15px', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => {
                    try {
                      let jsonData = policyDataReport.policyData;
                      
                      // Parse multiple times if needed (handles double-encoding)
                      while (typeof jsonData === 'string') {
                        try {
                          jsonData = JSON.parse(jsonData);
                        } catch {
                          break;
                        }
                      }
                      
                      const jsonString = JSON.stringify(jsonData, null, 2);
                      handleCopyJson(jsonString);
                    } catch (error) {
                      alert('Failed to copy JSON. The data might be corrupted.');
                    }
                  }}
                  className="btn btn-secondary"
                  title="Copy JSON to clipboard"
                >
                  📋 Copy
                </button>
                <button 
                  onClick={() => {
                    try {
                      let jsonData = policyDataReport.policyData;
                      
                      // Parse multiple times if needed (handles double-encoding)
                      while (typeof jsonData === 'string') {
                        try {
                          jsonData = JSON.parse(jsonData);
                        } catch {
                          break;
                        }
                      }
                      
                      const jsonString = JSON.stringify(jsonData, null, 2);
                      handleDownloadJson(jsonString, policyDataReport.fileName || 'policy_data');
                    } catch (error) {
                      alert('Failed to download JSON. The data might be corrupted.');
                    }
                  }}
                  className="btn btn-primary"
                  title="Download JSON file"
                >
                  ⬇️ Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {policyChatReport && (
        <PolicyChat
          report={policyChatReport}
          onClose={() => setPolicyChatReport(null)}
        />
      )}

      {/* Status Info Modal */}
      {showStatusInfo && (
        <div className="modal-overlay" onClick={() => setShowStatusInfo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button onClick={() => setShowStatusInfo(false)} className="btn btn-close">🗙</button>
              <h3>Report Status Guide</h3>
            </div>
            <div className="status-info-content">
              <div className="status-info-item">
                <div className={`status-badge ${getStatusClass('PROCESSING')}`}>
                  {getStatusText('PROCESSING')}
                </div>
                <p>The policy checklist report is currently being generated. This typically takes under a minute. The page will automatically update when complete.</p>
              </div>
              <div className="status-info-item">
                <div className={`status-badge ${getStatusClass('COMPLETED')}`}>
                  {getStatusText('COMPLETED')}
                </div>
                <p>The policy checklist report has been successfully generated. You can view summary details, download the PDF, check and re-configure settings with updated summary prose and images, and regenerate using updated configuration settings.</p>
              </div>
              <div className="status-info-item">
                <div className={`status-badge ${getStatusClass('FAILED')}`}>
                  {getStatusText('FAILED')}
                </div>
                <p>An error occurred during report generation. Click the report card to view error details, then try processing again after fixing any issues.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};