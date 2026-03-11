import { useAuthenticator, Icon } from '@aws-amplify/ui-react';
import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { remove } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';
import { ReportsList } from './components/ReportsList';
import outputs from '../amplify_outputs.json';
import './styles.css';

const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [reports, setReports] = useState<Array<Schema["PolicyReport"]["type"]>>([]);



  const SignOutIcon = ({ title }: { title?: string }) => {
    return (
      <div title={title}>
        <Icon className="btn btn-secondary" onClick={signOut}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        </Icon>
      </div>
    );
  };

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
      // Create record with PROCESSING status since S3 auto-triggers processing on upload
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

  const handleProcessReport = async (report: Schema["PolicyReport"]["type"]) => {
    if (!report.fileKey) {
      alert('Cannot process report: file key is missing');
      return;
    }

    const isRegeneration = report.status === 'COMPLETED';

    try {
      // Update status to PROCESSING and clear any previous errors
      const updateData: any = {
        id: report.id,
        status: 'PROCESSING',
        processedAt: new Date().toISOString(),
      };
      
      // Clear error message if regenerating
      if (report.errorMessage) {
        updateData.errorMessage = null;
      }
      
      await client.models.PolicyReport.update(updateData);

      // Get the bucket name from amplify outputs
      const bucketName = outputs.storage?.bucket_name;
      
      if (!bucketName) {
        throw new Error('Storage bucket name not found in configuration');
      }

      // Trigger processing via custom mutation
      const result = await client.mutations.triggerReportProcessing({
        fileKey: report.fileKey,
        reportConfig: typeof report.reportConfig === 'string' 
          ? report.reportConfig 
          : JSON.stringify(report.reportConfig),
        bucket: bucketName,
      });

      console.log('Processing triggered:', result);
      
      // Check if trigger was successful
      const triggerResult = result?.data as { success?: boolean; message?: string } | null;
      if (!triggerResult?.success) {
        throw new Error(triggerResult?.message || 'Failed to trigger processing');
      }
      
      alert(isRegeneration 
        ? 'Report regeneration started. This may take a few minutes.' 
        : 'Report processing started. This may take a few minutes.');
    } catch (error) {
      console.error('Failed to start processing:', error);
      alert('Failed to start processing. Please try again.');
      
      // Revert status on error
      try {
        await client.models.PolicyReport.update({
          id: report.id,
          status: isRegeneration ? 'COMPLETED' : 'UPLOADED',
        });
      } catch (revertError) {
        console.error('Failed to revert status:', revertError);
      }
    }
  };

  return (
    <main className="main-container">
      <header className="header">
        <div>
          <h1>Global Healthy and Sustainable Cities</h1>
          <h2>Policy Report Generator</h2>
          <p>A tool to support analysis and reporting of policy indicators for the Global Observatory of Healthy and Sustainable Cities' <a href="https://www.healthysustainablecities.org/1000cities/" target="_blank" rel="noopener noreferrer">1000 Cities Challenge</a>.</p>
        </div>
        
        <SignOutIcon title={user?.signInDetails?.loginId || undefined}/>
      </header>
      <div>
        <ReportsList 
          onUploadComplete={handleUploadComplete}
          onDeleteReport={handleDeleteReport}
          onProcessReport={handleProcessReport}
          client={client}
          reports={reports}
          user={user}
        />
      </div>
    </main>
  );
}

export default App;