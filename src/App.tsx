import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Alert } from '@aws-amplify/ui-react';
import { generateClient } from "aws-amplify/data";
import { ReportsList } from './components/ReportsList';
import './styles.css';

const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [reports, setReports] = useState<Array<Schema["PolicyReport"]["type"]>>([]);
  const [alert, setAlert] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);

  useEffect(() => {
    client.models.PolicyReport.observeQuery().subscribe({
      next: (data) => setReports([...data.items]),
    });
  }, []);

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
