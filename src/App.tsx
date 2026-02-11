import { useAuthenticator } from '@aws-amplify/ui-react';
import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { remove } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';
import { ReportsList } from './components/ReportsList';
import './styles.css';

const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [reports, setReports] = useState<Array<Schema["PolicyReport"]["type"]>>([]);

  useEffect(() => {
    // Fetch user's reports on mount
    fetchReports();

    // Subscribe to real-time updates
    const subscription = client.models.PolicyReport.observeQuery().subscribe({
      next: ({ items }) => {
        console.log('Subscription update received:', items.length, 'items');
        items.forEach(item => {
          console.log('  - Item:', item?.fileName, 'Status:', item?.status);
        });
        setReports([...items].sort((a, b) => 
          new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
        ));
      },
      error: (error) => {
        console.error('Subscription error:', error);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Poll for updates when reports are processing
  useEffect(() => {
    const hasProcessingReports = reports.some(r => r?.status === 'PROCESSING');
    
    if (!hasProcessingReports) {
      return; // No polling needed
    }

    console.log('Starting polling for processing reports...');
    const pollInterval = setInterval(() => {
      console.log('Polling for updates...');
      fetchReports();
    }, 5000); // Poll every 5 seconds

    return () => {
      console.log('Stopping polling');
      clearInterval(pollInterval);
    };
  }, [reports]);

  const fetchReports = async () => {
    try {
      const { data } = await client.models.PolicyReport.list();
      setReports([...data].sort((a, b) => 
        new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
      ));
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    }
  };

  const handleUploadComplete = async (fileName: string, fileSize: number, fileKey: string) => {
    try {
      // Create record with PROCESSING status since Lambda triggers immediately
      const result = await client.models.PolicyReport.create({
        fileName,
        fileSize,
        fileKey,
        status: 'PROCESSING',
        uploadedAt: new Date().toISOString(),
      });
      
      console.log('Created report record:', result);
    } catch (error) {
      console.error('Failed to create report record:', error);
      alert('Failed to create report record. The file was uploaded but may not be processed.');
    }
  };

  const handleDeleteReport = async (report: Schema["PolicyReport"]["type"]) => {
    console.log('Attempting to delete report:', {
      id: report.id,
      fileName: report.fileName,
      currentUser: user?.username,
      userDetails: user
    });
    
    // Optimistically remove from UI
    const previousReports = [...reports];
    setReports(reports.filter(r => r.id !== report.id));
    
    try {
      // Delete S3 files first
      if (report.fileKey) {
        try {
          await remove({ path: report.fileKey });
          console.log('Deleted Excel file:', report.fileKey);
        } catch (err) {
          console.error('Failed to delete Excel file:', err);
        }
      }
      
      if (report.pdfUrl) {
        try {
          await remove({ path: report.pdfUrl });
          console.log('Deleted PDF file:', report.pdfUrl);
        } catch (err) {
          console.error('Failed to delete PDF file:', err);
        }
      }
      
      // Delete from database
      const { data, errors } = await client.models.PolicyReport.delete({ id: report.id });
      
      if (errors && errors.length > 0) {
        console.error('Database deletion errors:', errors);
        throw new Error(`Failed to delete from database: ${errors.map(e => e.message).join(', ')}`);
      }
      
      console.log('Deleted database record:', report.id, data);
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert(`Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Rollback on error
      setReports(previousReports);
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
      <div>
        <h3>Completed checklists</h3>
        <div><i>(Report processing is in development and likely does not yet work!)</i></div>
        <br/>
        <ReportsList 
          onUploadComplete={handleUploadComplete}
          onDeleteReport={handleDeleteReport}
          client={client}
          reports={reports}
        />
      </div>
    </main>
  );
}

export default App;