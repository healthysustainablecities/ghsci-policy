import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import { uploadData } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';

interface ReportsListProps {
  onUploadComplete: (fileName: string, fileSize: number, fileKey: string) => void;
  client: ReturnType<typeof generateClient<Schema>> | null;
  reports: Array<Schema["PolicyReport"]["type"]>;
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'PROCESSING': return 'status-processing';
    case 'COMPLETED': return 'status-completed';
    case 'FAILED': return 'status-failed';
    default: return 'status-default';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'PROCESSING': return 'Processing...';
    case 'COMPLETED': return 'Completed';
    case 'FAILED': return 'Failed';
    default: return 'Unknown';
  }
};

export const ReportsList: React.FC<ReportsListProps> = ({ onUploadComplete, client, reports }) => {
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

    // Check for duplicate filename
    const existingReport = reports.find(r => r.fileName === file.name);
    if (existingReport) {
      alert(`File "${file.name}" already exists. Please delete the existing report before uploading again.`);
      return;
    }

    setIsUploading(true);
    try {
      // Generate secure random path in user's folder (Amplify automatically adds public/user-id/)
      const randomId = crypto.randomUUID();
      const key = `${randomId}-${file.name}`;
      
      await uploadData({
        key,
        data: file,
        options: {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
      
      // Trigger processing after successful upload
      onUploadComplete(file.name, file.size, key);
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
    if (report.status !== 'COMPLETED' || !report.pdfUrl) {
      setSelectedReport(report);
      return;
    }
    
    try {
      const signedUrl = await getUrl({ 
        key: report.pdfUrl
      });
      window.open(signedUrl.url.toString(), '_blank');
    } catch (error) {
      console.error('Failed to open report:', error);
    }
  };

  const deleteReport = async (report: Schema["PolicyReport"]["type"]) => {
    if (!client) return;
    
    try {
      // Delete the database record - DynamoDB stream will trigger S3 cleanup
      await client.models.PolicyReport.delete({ id: report.id });
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert('Failed to delete report. Please try again.');
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
        {reports.map((report) => (
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
                  deleteReport(report);
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
              <button 
                onClick={() => setSelectedReport(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};