import React from 'react';
import { FileUploader } from '@aws-amplify/ui-react-storage';
import '@aws-amplify/ui-react/styles.css';

interface FileUploadProps {
  onUploadComplete: (fileName: string, fileSize: number, fileKey: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUploadComplete }) => {

  return (
    <FileUploader
      acceptedFileTypes={['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']}
      path="public/"
      maxFileCount={1}
      maxFileSize={1024 * 1024} // 1MB
      isResumable
      onUploadSuccess={({ key }) => {
        console.log('Upload success:', key);
        if (!key) return;
        const fileName = key.split('/').pop() || '';
        onUploadComplete(fileName, 0, key);
      }}
      onUploadError={(error) => {
        console.error('Upload error:', error);
      }}
    />
  );
};