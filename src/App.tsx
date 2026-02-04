import { useAuthenticator } from '@aws-amplify/ui-react';
import { FileUploader } from '@aws-amplify/ui-react-storage';
import './styles.css';

function App() {
  const { user, signOut } = useAuthenticator();

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
        <h3>Upload Report</h3>
        <FileUploader
          acceptedFileTypes={['.xlsx']}
          path="public/"
          maxFileCount={1}
          onUploadSuccess={({ key }) => {
            console.log('Upload success:', key);
          }}
          onUploadError={(error) => {
            console.error('Upload error:', error);
          }}
        />
      </div>
    </main>
  );
}

export default App;