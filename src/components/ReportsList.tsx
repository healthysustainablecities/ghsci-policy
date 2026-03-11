import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import { uploadData } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';
import { ReportSettings, type ReportConfig } from './ReportSettings';

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

export const ReportsList: React.FC<ReportsListProps> = ({ onUploadComplete, onDeleteReport, onProcessReport, reports, user }) => {
  const [selectedReport, setSelectedReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [settingsReport, setSettingsReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const client = generateClient<Schema>();

  useEffect(() => {
    // No longer needed - reports come from props
  }, []);

  // Clean up object URL when modal closes
  useEffect(() => {
    return () => {
      if (pdfViewerUrl) {
        URL.revokeObjectURL(pdfViewerUrl);
      }
    };
  }, [pdfViewerUrl]);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      alert('Please upload an Excel (.xlsx) file');
      return;
    }

    if (file.size >= 1024 * 1024) {
      alert('File size must be less than 1MB');
      return;
    }

    // Check for duplicate filename (filter out null records from deserialization errors)
    const existingReport = reports.filter(r => r !== null).find(r => r.fileName === file.name);
    if (existingReport) {
      alert(`File "${file.name}" already exists. Please delete the existing report before uploading again.`);
      return;
    }

    setIsUploading(true);
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
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const openReport = async (report: Schema["PolicyReport"]["type"]) => {
      setSelectedReport(report);
      return;
  };

  const handleSaveSettings = async (config: ReportConfig) => {
    if (!settingsReport) return;
    
    try {
      console.log('=== SAVE SETTINGS START ===');
      console.log('Report ID:', settingsReport.id);
      console.log('Current report:', JSON.stringify(settingsReport, null, 2));
      console.log('Config to save:', JSON.stringify(config, null, 2));
      
      // Update the report in the database
      // Note: reportConfig field expects a JSON string, not an object
      const updateResult = await client.models.PolicyReport.update({
        id: settingsReport.id,
        reportConfig: JSON.stringify(config),
      });
      
      console.log('Update result:', JSON.stringify(updateResult, null, 2));
      
      // Wait for the database to process
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Fetch the updated report to verify it was saved
      const { data: verifyReport, errors: verifyErrors } = await client.models.PolicyReport.get({
        id: settingsReport.id
      });
      
      console.log('Verification fetch result:', JSON.stringify(verifyReport, null, 2));
      console.log('Verification errors:', verifyErrors);
      
      if (verifyReport) {
        console.log('Verified reportConfig type:', typeof verifyReport.reportConfig);
        console.log('Verified reportConfig value:', JSON.stringify(verifyReport.reportConfig, null, 2));
        
        // Update the settingsReport with fresh data
        setSettingsReport(verifyReport);
      } else {
        console.error('Failed to verify saved report - no data returned');
      }
      
      console.log('=== SAVE SETTINGS END ===');
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('=== SAVE SETTINGS ERROR ===');
      console.error('Error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      alert('Failed to save settings. Please try again.');
      throw error;
    }
  };

  const handleViewPdf = async (pdfPath: string) => {
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
    } catch (error) {
      console.error('Failed to open PDF:', error);
      alert('Failed to open PDF report');
    }
  };

  const handleDownloadPdf = async (pdfPath: string, fileName: string) => {
    try {
      const signedUrl = await getUrl({ path: pdfPath });
      const response = await fetch(signedUrl.url.toString());
      const blob = await response.blob();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.replace('.xlsx', '.pdf') || 'report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the object URL
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert('Failed to download PDF report');
    }
  };

  return (
    <>
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
              <div>📁<br/>Upload 1000 Cities Challenge policy checklist xlsx file</div>
            )}
          </div>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="file-input-grid"
          />
        </div>

        {/* Existing reports */}
        {reports.filter(report => report !== null).map((report) => (
          <div
            key={report.id}
            onClick={() => openReport(report)}
            className="report-card"
          >
            <div className="report-thumbnail">
              {report.status === 'COMPLETED' ? '📄 PDF' : report.status === 'FAILED' ? '⚠️' : '⏳'}
              <div className={`status-badge ${getStatusClass(report.status || 'PROCESSING')}`}>
                {getStatusText(report.status || 'PROCESSING')}
              </div>
              {report.status === 'FAILED' && report.errorMessage && (
                <div className="error-indicator" title={report.errorMessage}>
                  ⚠️ Error - Click for details
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteReport(report);
                }}
                className="btn btn-danger delete-btn"
                title="Delete report"
              >
                ×
              </button>
              {/* Action buttons for reports */}
              {(report.status === 'UPLOADED' || report.status === 'FAILED' || report.status === 'COMPLETED') && (
                <div className="action-buttons">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      // Fetch fresh report from database to ensure we have latest config
                      const { data: freshReport } = await client.models.PolicyReport.get({
                        id: report.id
                      });
                      console.log('Opening settings with fresh report:', freshReport?.reportConfig);
                      setSettingsReport(freshReport || report);
                    }}
                    className="btn-icon"
                    title="Report settings"
                  >
                    ⚙️
                  </button>
                  {report.status !== 'COMPLETED' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onProcessReport(report);
                      }}
                      className="btn-icon"
                      title="Process report"
                    >
                      ▶️
                    </button>
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
                    >
                      🔄
                    </button>
                  )}
                </div>
              )}
            </div>
            <h4 className="report-title">{report.fileName}</h4>
            <p className="report-date">
              {report.uploadedAt ? new Date(report.uploadedAt).toLocaleDateString() : 'Processing...'}
            </p>
            {report.status === 'FAILED' && report.errorMessage && (
              <p className="error-summary" title={report.errorMessage}>
                {report.errorMessage.length > 60 
                  ? report.errorMessage.substring(0, 60) + '...' 
                  : report.errorMessage}
              </p>
            )}
          </div>
        ))}
      </div>

      {selectedReport && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <button 
                onClick={() => setSelectedReport(null)}
                className="btn btn-close"
              >
                🗙
              </button>
              <h3>Report Status: {selectedReport.fileName}</h3>
            </div>
            
            <div className="modal-row">
              <strong>Status:</strong>
              <span className={`status-text ${getStatusClass(selectedReport.status || 'PROCESSING')}`}>
                {getStatusText(selectedReport.status || 'PROCESSING')}
              </span>
            </div>
            
            {selectedReport.uploadedAt && (
              <div className="modal-row">
                <strong>Uploaded:</strong> {new Date(selectedReport.uploadedAt).toLocaleString()}
              </div>
            )}
            
            {selectedReport.processedAt && (
              <div className="modal-row">
                <strong>Processing Started:</strong> {new Date(selectedReport.processedAt).toLocaleString()}
              </div>
            )}
            
            {selectedReport.completedAt && (
              <div className="modal-row">
                <strong>Completed:</strong> {new Date(selectedReport.completedAt).toLocaleString()}
              </div>
            )}
            
            {selectedReport.errorMessage && (
              <div className="modal-row error-text">
                <strong>Error:</strong> 
                <div style={{ marginTop: '8px', padding: '10px', backgroundColor: '#f8d7da', borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedReport.errorMessage}
                </div>
              </div>
            )}
            
            <div className="modal-footer">
              {selectedReport.status === 'COMPLETED' && selectedReport.pdfUrl && (
                <>
                  <button 
                    onClick={() => handleViewPdf(selectedReport.pdfUrl!)}
                    className="btn btn-primary"
                    style={{ marginRight: '10px' }}
                  >
                    View PDF Report
                  </button>
                  <button 
                    onClick={() => handleDownloadPdf(selectedReport.pdfUrl!, selectedReport.fileName || 'report')}
                    className="btn btn-secondary"
                    title="Download PDF"
                  >
                    ⬇️ Download
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {pdfViewerUrl && (
        <div className="modal-overlay" onClick={() => {
          URL.revokeObjectURL(pdfViewerUrl);
          setPdfViewerUrl(null);
        }}>
          <div className="modal-content pdf-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button 
                onClick={() => {
                  URL.revokeObjectURL(pdfViewerUrl);
                  setPdfViewerUrl(null);
                }}
                className="btn btn-close"
              >
                🗙
              </button>
              <h3>PDF Preview</h3>
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
    </>
  );
};