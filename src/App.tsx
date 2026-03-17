import { useAuthenticator, Icon } from '@aws-amplify/ui-react';
import { useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { remove } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';
import { ReportsList } from './components/ReportsList';
import FeedbackChat from './components/feedback_chat';
import FeedbackGallery from './components/feedback_gallery';
import outputs from '../amplify_outputs.json';
import './styles.css';

const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [reports, setReports] = useState<Array<Schema["PolicyReport"]["type"]>>([]);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedbackGallery, setShowFeedbackGallery] = useState(false);
  // Tracks IDs that the user has explicitly set back to PROCESSING (regeneration),
  // so the subscription protection doesn't block that intentional transition.
  const processingOverrideIds = useRef(new Set<string>());



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
        setReports(prevReports => {
          const prevMap = new Map(prevReports.map(r => [r.id, r]));
          // Deduplicate incoming items by id (last occurrence wins)
          const deduped = Array.from(new Map(items.map(item => [item.id, item])).values());
          const merged = deduped.map(item => {
            const prev = prevMap.get(item.id);
            const prevIsTerminal = prev?.status === 'COMPLETED' || prev?.status === 'FAILED';
            const incomingIsDowngrade = !item.status || item.status === 'PROCESSING' || item.status === 'UPLOADED';
            // Block the subscription from downgrading a terminal status unless the user
            // explicitly triggered reprocessing for this specific report.
            if (prevIsTerminal && incomingIsDowngrade && !processingOverrideIds.current.has(item.id)) {
              return { ...item, status: prev!.status };
            }
            // Once the subscription confirms the PROCESSING state we allowed, clear the override.
            if (item.status === 'PROCESSING' && processingOverrideIds.current.has(item.id)) {
              processingOverrideIds.current.delete(item.id);
            }
            return item;
          });
          return [...merged].sort((a, b) =>
            new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
          );
        });
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
      // Deduplicate by id before setting state
      const deduped = Array.from(new Map(data.map(item => [item.id, item])).values());
      setReports([...deduped].sort((a, b) =>
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

      // Delete uploaded images from S3
      try {
        let reportConfig = report.reportConfig;
        while (typeof reportConfig === 'string') {
          try { reportConfig = JSON.parse(reportConfig); } catch { break; }
        }
        const images = (reportConfig as any)?.reporting?.images;
        if (images && typeof images === 'object') {
          for (const img of Object.values(images) as any[]) {
            if (img?.s3Key) {
              try {
                await remove({ path: img.s3Key });
                console.log('Deleted image:', img.s3Key);
              } catch (err) {
                console.error('Failed to delete image:', img.s3Key, err);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse reportConfig for image cleanup:', err);
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

      // Allow the subscription to accept the PROCESSING transition for this report,
      // even if its current local status is a terminal state (COMPLETED/FAILED).
      processingOverrideIds.current.add(report.id);
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
      // result.data may be a JSON string (AppSync returns .json() as string for custom mutations)
      let triggerResult: { success?: boolean; message?: string } | null = null;
      if (typeof result?.data === 'string') {
        try { triggerResult = JSON.parse(result.data); } catch { triggerResult = null; }
      } else {
        triggerResult = result?.data as { success?: boolean; message?: string } | null;
      }
      if (!triggerResult?.success) {
        throw new Error(triggerResult?.message || 'Failed to trigger processing');
      }
      
      alert(isRegeneration 
        ? 'Report regeneration started. This may take a few minutes.' 
        : 'Report processing started. This may take a few minutes.');
    } catch (error) {
      console.error('Failed to start processing:', error);
      alert('Failed to start processing. Please try again.');
      
      // Revert status on error and record the error message
      try {
        await client.models.PolicyReport.update({
          id: report.id,
          status: isRegeneration ? 'FAILED' : 'UPLOADED',
          errorMessage: error instanceof Error ? error.message : String(error),
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
          <h1>GHSCI Policy</h1>
          <h2>Global Healthy and Sustainable City Indicators Policy analysis and reporting tool</h2 >
          <p>A tool to support analysis and reporting of policy indicators for the Global Observatory of Healthy and Sustainable Cities' <a href="https://www.healthysustainablecities.org/1000cities/" target="_blank" rel="noopener noreferrer">1000 Cities Challenge</a>.</p>
          <p>Developed out of RMIT University's Centre for Urban Research by <a href="https://cur.org.au/people/carl-higgs/" target="_blank" rel="noopener noreferrer">Dr Carl Higgs</a> and <a href="https://cur.org.au/people/dr-melanie-lowe/" target="_blank" rel="noopener noreferrer">Dr Melanie Lowe</a> with the support of <a href="https://www.rmit.edu.au/partner/hubs/race" target="_blank" rel="noopener noreferrer">RMIT's Advanced Cloud Ecosystem Hub</a> and the <a href="https://www.healthysustainablecities.org/" target="_blank" rel="noopener noreferrer">Global Observatory of Healthy and Sustainable Cities</a>.
          </p>
          <p>To get started, visit the <a href="https://github.com/healthysustainablecities/global-indicators/wiki/1.-Policy-Indicators" target="_blank" rel="noopener noreferrer">GOHSC Policy Indicators</a> wiki and download the policy checklist Excel (.xlsx) audit tool.  Once the tool has been completed for city or region of interest, drop it in the app to get your city's score and generate a PDF report.</p>
          <p><button className="about-link" onClick={() => setShowAbout(true)}>Find out more</button></p>
          <p><button className="about-link" title="View and track feedback submitted using the feedback widget" onClick={() => setShowFeedbackGallery(true)}>Feedback gallery</button></p>
        </div>
        
        <SignOutIcon title={user?.signInDetails?.loginId || undefined}/>
      </header>

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="modal-content about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button onClick={() => setShowAbout(false)} className="btn btn-close">🗙</button>
              <h3 style={{ margin: 0 }}>About GHSCI-Policy</h3>
            </div>
            <div className="about-body">
              <p>
                The <strong>Global Healthy and Sustainable City Indicators (GHSCI) Policy</strong> analysis and reporting tool has been developed to support
                stakeholders participating in the <a href="https://www.healthysustainablecities.org/1000cities/" target="_blank" rel="noopener noreferrer">1000 Cities Challenge</a> of
                the <a href="https://www.healthysustainablecities.org/" target="_blank" rel="noopener noreferrer">Global Observatory of Healthy and Sustainable Cities (GOHSC)</a>.
              </p>
              <h4>Development team</h4>
              <p>
                <strong> Dr Carl Higgs</strong> — GOHSC Software Working Group co-lead; RMIT University, Centre for Urban Research
                </p>
                <p>
                <strong>Dr Melanie Lowe</strong> — GOHSC Co-Director; RMIT University, Centre for Urban Research
              </p>
              <p>
                We gratefully acknowledge the funding support for access to Amazon Web Services awarded through the <strong>RMIT Advanced Cloud Ecosystem (RACE) hub</strong> merit allocation scheme.
              </p>
              <p>
                The tool will also provide opportunities for early feedback that will inform a tangential research project led by <strong>Dr Natalia Cadavid Aguilar</strong> and
                <strong> Dr Eugen Resendiz-Bontrud</strong> at the Center for the Future of Cities,
                Tecnológico de Monterrey, Mexico, exploring the potential for large language models to assist in policy review for diverse global contexts.  <a href="https://wun.ac.uk/wun/research/view/policybridge-policy-assessment-reporting-for-healthy-sustainable-cities/" target="blacnk" rel="noopener noreferrer">PolicyBridge</a> aims to help cities and researchers bridge the gap between data and action by providing a streamlined platform for assessing, comparing, and reporting on policies that drive urban health and sustainability.
              </p>
              <h4>About the GOHSC and 1000 Cities Challenge</h4>
              <p>
                The GOHSC is a leading global source of evidence-based, open-access urban policy and spatial
                indicators, providing tools to measure and track progress towards healthy and sustainable cities.
                The evidence-based indicators measure what matters — walkability, access to public space, food
                stores and public transport, urban heat vulnerability, and the quality of policies that support
                healthy and sustainable outcomes. By leveraging global open data and a rigorous, standardised
                measurement approach, the GOHSC provides actionable neighbourhood-level insights and enables
                comparable city measurement worldwide.
              </p>
              <p>
                Through the 1000 Cities Challenge, the GOHSC aims to upscale its reach and support more cities
                to measure and act on these indicators. Indicator reports — produced in English and local
                languages — strengthen advocacy capabilities and equip policymakers with the information needed
                to make evidence-informed decisions and track city planning outcomes.
              </p>

              <h4>Policy checklist</h4>
              <p>
                The policy review checklist was developed by <strong>Melanie Lowe</strong> and <strong>Deepti Adlakha</strong> as
                part of the <a href="https://www.thelancet.com/series-do/urban-design-transport-and-health" target="_blank" rel="noopener noreferrer">Lancet Global Health Series on Urban Design, Transport and Health (2022)</a>.
              </p>
              <blockquote>
                Boeing G, Higgs C, Liu S, Giles-Corti B, Sallis JF, Cerin E, Lowe M, Adlakha D, Hinckson E, Moudon AV, Salvo D, Adams MA, Barrozo LV, Bozovic T, Delclòs-Alió X, Dygrýn J, Ferguson S, Gebel K, Ho TP, Lai P-C, Martori JC, Nitvimol K, Queralt A, Roberts JD, Sambo GH, Schipperijn J, Vale D, Van de Weghe N, Vich G, Arundel J. Using open data and open-source software to develop spatial indicators of urban design and transport features for achieving healthy and sustainable cities. The Lancet Global Health. 2022 2022/06//;10(6):e907-e918. en. doi: <a href="https://doi.org/10.1016/S2214-109X(22)00072-9" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/S2214-109X(22)00072-9</a>.
              </blockquote>
            </div>
          </div>
        </div>
      )}

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

      {showFeedbackGallery && (
        <FeedbackGallery onClose={() => setShowFeedbackGallery(false)} />
      )}

      <FeedbackChat />
    </main>
  );
}

export default App;