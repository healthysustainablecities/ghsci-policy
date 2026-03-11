import React, { useEffect, useState } from 'react';
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

export const ReportsList: React.FC<ReportsListProps> = ({ onUploadComplete, onDeleteReport, onProcessReport, reports, user }) => {
  const [selectedReport, setSelectedReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [settingsReport, setSettingsReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [policyDataReport, setPolicyDataReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [policyChatReport, setPolicyChatReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfReport, setPdfReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
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

  const handleCopyJson = (jsonString: string) => {
    navigator.clipboard.writeText(jsonString).then(() => {
      alert('JSON copied to clipboard!');
    }).catch((error) => {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard.');
    });
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
      )}

      {pdfViewerUrl && pdfReport && (
        <div className="modal-overlay" onClick={() => {
          URL.revokeObjectURL(pdfViewerUrl);
          setPdfViewerUrl(null);
          setPdfReport(null);
        }}>
          <div className="modal-content pdf-viewer-modal" onClick={(e) => e.stopPropagation()}>
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
        <div className="modal-overlay" onClick={() => setPolicyDataReport(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
    </>
  );
};