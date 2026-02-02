import React, { useState, useCallback } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Alert } from '@aws-amplify/ui-react';

interface FileUploadProps {
  onUploadComplete: (fileName: string, fileSize: number) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUploadComplete }) => {
  const { user } = useAuthenticator();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    
    if (!file.name.endsWith('.xlsx')) {
      setError('Please upload an Excel (.xlsx) file');
      return;
    }

    if (file.size >= 1024 * 1024) {
      setError('File size must be less than 1MB');
      return;
    }

    setIsUploading(true);
    try {
      const key = `uploads/${file.name}`;
      await uploadData({
        key,
        data: file,
        options: {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
      onUploadComplete(file.name, file.size);
    } catch (error) {
      console.error('Upload failed:', error);
      setError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [user, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  return (
    <div>
      {error && (
        <Alert 
          variation="error" 
          isDismissible 
          onDismiss={() => setError(null)}
          style={{ marginBottom: '15px' }}
        >
          {error}
        </Alert>
      )}
      
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
      >
        {isUploading ? (
          <p>Uploading...</p>
        ) : (
          <>
            <p>Drag and drop your Excel file here, or</p>
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="file-input"
            />
            <label htmlFor="file-input" className="file-input-label">
              Browse Files
            </label>
          </>
        )}
      </div>
    </div>
  );
};