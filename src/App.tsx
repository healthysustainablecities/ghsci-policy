import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Alert } from '@aws-amplify/ui-react';
import { generateClient } from "aws-amplify/data";
import { list } from 'aws-amplify/storage';
import { ReportsList } from './components/ReportsList';
import './styles.css';

function App() {
  const { user, signOut } = useAuthenticator();
  const [reports, setReports] = useState<Array<Schema["PolicyReport"]["type"]>>([]);
  const [alert, setAlert] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);
  const client = generateClient<Schema>();

  useEffect(() => {
    client.models.PolicyReport.observeQuery().subscribe({
      next: (data) => setReports([...data.items]),
    });
    
    // Sync S3 files with database on load
    syncWithS3();
  }, []);

  const syncWithS3 = async () => {
    try {
      const [s3Files, dbReports] = await Promise.all([
        list({ options: { listAll: true } }),
        client.models.PolicyReport.list()
      ]);

      const xlsxFiles = s3Files.items.filter(f => f.key?.endsWith('.xlsx'));
      const existingReports = dbReports.data || [];

      // Create reports for S3 files without database records
      for (const file of xlsxFiles) {
        if (!file.key) continue;
        
        const fileName = file.key.split('-').slice(1).join('-'); // Remove UUID prefix
        const existing = existingReports.find(r => r.fileKey === file.key);
        
        if (!existing) {
          await client.models.PolicyReport.create({
            fileName,
            fileKey: file.key,
            status: 'PROCESSING',
            fileSize: file.size || 0,
            uploadedAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to sync with S3:', error);
    }
  };

  const handleUploadComplete = async (fileName: string, fileSize: number, fileKey: string) => {
    try {
      // Create new report record
      await client.models.PolicyReport.create({
        fileName,
        fileKey,
        status: 'PROCESSING',
        fileSize,
        uploadedAt: new Date().toISOString()
      });
      
      setAlert({
        type: 'success',
        message: `File ${fileName} uploaded successfully! Processing will begin automatically.`
      });
      setTimeout(() => setAlert(null), 5000);
    } catch (error) {
      console.error('Failed to create report record:', error);
      setAlert({
        type: 'error',
        message: 'Upload completed but failed to track progress.'
      });
      setTimeout(() => setAlert(null), 5000);
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
        <h3>Your Reports ({reports.length})</h3>
        <ReportsList onUploadComplete={handleUploadComplete} />
      </div>
    </main>
  );
}

export default App;
