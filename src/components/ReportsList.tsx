import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import { uploadData } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';

interface ReportsListProps {
  onUploadComplete: (fileName: string, fileSize: number, fileKey: string) => void;
  onDeleteReport: (report: Schema["PolicyReport"]["type"]) => void;
  client: ReturnType<typeof generateClient<Schema>> | null;
  reports: Array<Schema["PolicyReport"]["type"]>;
  user: any;
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'UPLOADING': return 'status-uploading';
    case 'PROCESSING': return 'status-processing';
    case 'COMPLETED': return 'status-completed';
    case 'FAILED': return 'status-failed';
    default: return 'status-default';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'UPLOADING': return 'Uploaded';
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

export const ReportsList: React.FC<ReportsListProps> = ({ onUploadComplete, onDeleteReport, reports, user }) => {
  const [selectedReport, setSelectedReport] = useState<Schema["PolicyReport"]["type"] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // No longer needed - reports come from props
  }, []);

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
              {report.status === 'COMPLETED' ? '📄 PDF' : '⏳'}
              <div className={`status-badge ${getStatusClass(report.status || 'PROCESSING')}`}>
                {getStatusText(report.status || 'PROCESSING')}
              </div>
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
            </div>
            <h4 className="report-title">{report.fileName}</h4>
            <p className="report-date">
              {report.uploadedAt ? new Date(report.uploadedAt).toLocaleDateString() : 'Processing...'}
            </p>
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
                <strong>Error:</strong> {selectedReport.errorMessage}
              </div>
            )}
            
            <div className="modal-footer">
              {selectedReport.status === 'COMPLETED' && selectedReport.pdfUrl && (
                <button 
                  onClick={async () => {
                    try {
                      const signedUrl = await getUrl({ path: selectedReport.pdfUrl! });
                      window.open(signedUrl.url.toString(), '_blank');
                    } catch (error) {
                      console.error('Failed to open PDF:', error);
                      alert('Failed to open PDF report');
                    }
                  }}
                  className="btn btn-primary"
                  style={{ marginRight: '10px' }}
                >
                  View PDF Report
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};