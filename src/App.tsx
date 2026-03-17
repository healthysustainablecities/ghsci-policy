import { useAuthenticator, Icon } from '@aws-amplify/ui-react';
import { useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { remove, uploadData } from 'aws-amplify/storage';
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
  const [loadingExample, setLoadingExample] = useState(false);
  // Tracks IDs that the user has explicitly set back to PROCESSING (regeneration),
  // so the subscription protection doesn't block that intentional transition.
  const processingOverrideIds = useRef(new Set<string>());

  const TranslateIcon = ({ title }: { title?: string }) => {
    const [showHelp, setShowHelp] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!showHelp) return;
      const handler = (e: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setShowHelp(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [showHelp]);
    return (
      <div ref={wrapperRef} className="btn-secondary translate-wrapper" title={showHelp ? undefined : title}>
        <Icon className="btn translate-btn-icon" onClick={() => setShowHelp(h => !h)}>
          <svg viewBox="0 0 16 16" width="24" height="24">
            <path fill="currentColor" fillOpacity="0.5" d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm7.138 9.995q.289.451.63.846c-.748.575-1.673 1.001-2.768 1.292.178.217.451.635.555.867 1.125-.359 2.08-.844 2.886-1.494.777.665 1.739 1.165 2.93 1.472.133-.254.414-.673.629-.89-1.125-.253-2.057-.694-2.82-1.284.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6 6 0 0 1-.415-.492 2 2 0 0 1-.94.31"/>
            <path fill="currentColor" d="M4.545 6.714 4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286zm1.634-.736L5.5 3.956h-.049l-.679 2.022z"/>
          </svg>
        </Icon>
        {showHelp && (
          <div className="translate-popover">
            <p>Use your browser's built-in translation:</p>
            <ul>
              <li><strong>Chrome / Edge:</strong> Click the translate icon in the address bar, or right-click the page and select "Translate to…"</li>
              <li><strong>Firefox:</strong> Click the translate icon in the address bar</li>
              <li><strong>Safari:</strong> Use the Page menu → "Translate Page"</li>
            </ul>
          </div>
        )}
      </div>
    );
  };

  const SignOutIcon = ({ title }: { title?: string }) => {
    return (
      <div title={title}>
        <Icon className="btn btn-secondary sign-out" onClick={signOut}>
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

  const handleLoadExample = async () => {
    if (loadingExample) return;
    const exampleFileName = 'gohsc-policy-indicator-checklist-example-ES-Las-Palmas-2023.xlsx';
    const existingReport = reports.filter(r => r !== null).find(r => r.fileName === exampleFileName);
    if (existingReport) {
      alert(`"${exampleFileName}" already exists. Please delete the existing report before uploading again.`);
      return;
    }
    setLoadingExample(true);
    try {
      const response = await fetch(`/${exampleFileName}`);
      if (!response.ok) throw new Error(`Failed to fetch example file: ${response.statusText}`);
      const blob = await response.blob();
      const file = new File([blob], exampleFileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const username = (user?.username || 'unknown').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
      const fileKey = `public/${username}/${exampleFileName}`;
      await uploadData({ path: fileKey, data: file, options: { contentType: file.type } }).result;
      await handleUploadComplete(exampleFileName, file.size, fileKey);
    } catch (error) {
      console.error('Failed to load example report:', error);
      alert(`Failed to load example report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingExample(false);
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
          <div className="title-row">
            <h1>GHSCI Policy</h1>
            <img src="/GOHSC - white logo transparent-01.svg" alt="GOHSC logo" className="title-logo" />
          </div>
          <h2>Global Healthy and Sustainable City Indicators Policy analysis and reporting tool</h2 >
          <p>A tool to support analysis and reporting of policy indicators for the Global Observatory of Healthy and Sustainable Cities' <a href="https://www.healthysustainablecities.org/1000cities/" target="_blank" rel="noopener noreferrer">1000 Cities Challenge</a>.</p>
          <p>Developed out of RMIT University's Centre for Urban Research by <a href="https://cur.org.au/people/carl-higgs/" target="_blank" rel="noopener noreferrer">Dr Carl Higgs</a> and <a href="https://cur.org.au/people/dr-melanie-lowe/" target="_blank" rel="noopener noreferrer">Dr Melanie Lowe</a> with the support of <a href="https://www.rmit.edu.au/partner/hubs/race" target="_blank" rel="noopener noreferrer">RMIT's Advanced Cloud Ecosystem Hub</a> and the <a href="https://www.healthysustainablecities.org/" target="_blank" rel="noopener noreferrer">Global Observatory of Healthy and Sustainable Cities</a>.
          </p>
          <p>To get started, visit the <a href="https://github.com/healthysustainablecities/global-indicators/wiki/1.-Policy-Indicators" target="_blank" rel="noopener noreferrer">GOHSC Policy Indicators</a> wiki and download the policy checklist Excel (.xlsx) audit tool.  Once the tool has been completed for city or region of interest, drop it in the app to get your city's score and generate a PDF report.</p>
          <p><button className="about-link" onClick={() => setShowAbout(true)}>Find out more</button></p>
          <p><button className="about-link" onClick={handleLoadExample} disabled={loadingExample}>{loadingExample ? 'Loading example...' : 'Load an example report'}</button></p>
          <p><button className="about-link" title="View and track feedback submitted using the feedback widget" onClick={() => setShowFeedbackGallery(true)}>Feedback gallery</button></p>
        </div>
        
        <div className="header-actions">
          <TranslateIcon title="Translate this page" />
          <SignOutIcon title={"Sign out: " + (user?.signInDetails?.loginId || undefined)}/>
        </div>
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
                Lowe M, Adlakha D, Sallis JF, Salvo D, Cerin E, Moudon AV, Higgs C, Hinckson E, Arundel J, Boeing G, Liu S, Mansour P, Gebel K, Puig-Ribera A, Mishra PB, Bozovic T, Carson J, Dygrýn J, Florindo AA, Ho TP, Hook H, Hunter RF, Lai P-C, Molina-García J, Nitvimol K, Oyeyemi AL, Ramos CDG, Resendiz E, Troelsen J, Witlox F, Giles-Corti B. City planning policies to support health and sustainability: an international comparison of policy indicators for 25 cities. The Lancet Global Health. 2022;10(6):e882-e894. en. <a href="https://doi.org/10.1016/S2214-109X(22)00069-9" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/S2214-109X(22)00069-9</a>.
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