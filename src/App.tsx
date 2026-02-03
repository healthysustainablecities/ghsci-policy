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
          acceptedFileTypes={['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']}
          path="uploads/"
          maxFileCount={1}
          maxFileSize={1024 * 1024} // 1MB
          isResumable
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