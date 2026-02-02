import { useAuthenticator } from '@aws-amplify/ui-react';
import { ReportsList } from './components/ReportsList';
import './styles.css';

function App() {
  const { user, signOut } = useAuthenticator();

  const handleUploadComplete = (fileName: string, fileSize: number, fileKey: string) => {
    console.log('Upload completed:', { fileName, fileSize, fileKey });
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
        <h3>Your Reports (0)</h3>
        <ReportsList onUploadComplete={handleUploadComplete} client={null} reports={[]} />
      </div>
    </main>
  );
}

export default App;