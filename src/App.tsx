import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Alert } from '@aws-amplify/ui-react';
import { uploadData } from 'aws-amplify/storage';
import './styles.css';

function App() {
  const { user, signOut } = useAuthenticator();
  const [alert, setAlert] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setAlert({ type: 'error', message: 'Please upload an Excel (.xlsx) file' });
      setTimeout(() => setAlert(null), 3000);
      return;
    }

    setIsUploading(true);
    try {
      const randomId = crypto.randomUUID();
      const key = `private/uploads/${randomId}-${file.name}`;
      
      await uploadData({
        key,
        data: file,
        options: {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
      
      setAlert({
        type: 'success',
        message: `File ${file.name} uploaded successfully!`
      });
      setTimeout(() => setAlert(null), 3000);
    } catch (error) {
      console.error('Upload failed:', error);
      setAlert({ type: 'error', message: 'Upload failed. Please try again.' });
      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <main className="main-container">
      <header className="header">
        <div>
          <h1>Global Healthy and Sustainable Cities</h1>
          <h2>Policy Report Generator</h2>
        </div>
        <button className="btn btn-secondary" onClick={signOut} title={user?.signInDetails?.loginId || undefined}>
          Sign out
        </button>
      </header>

      {alert && (
        <Alert 
          variation={alert.type} 
          isDismissible 
          onDismiss={() => setAlert(null)}
          style={{ marginBottom: '20px' }}
        >
          {alert.message}
        </Alert>
      )}

      <div>
        <h3>Upload Report</h3>
        <div 
          className={`upload-card ${isDragging ? 'dragging' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="upload-thumbnail">
            {isUploading ? (
              <div>⏳<br/>Uploading...</div>
            ) : (
              <div>📁<br/>Upload completed 1000 Cities Challenge policy checklist xlsx file</div>
            )}
          </div>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            disabled={isUploading}
            style={{ display: 'none' }}
            id="file-input"
          />
        </div>
      </div>
    </main>
  );
}

export default App;