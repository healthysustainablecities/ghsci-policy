import React, { useState, useEffect } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export interface ReportConfig {
  reporting?: {
    doi?: string;
    images?: {
      [key: string]: {
        file?: string;
        credit?: string;
        s3Key?: string; // Store S3 path for uploaded images
      };
    };
    languages?: {
      English?: {
        name?: string;
        country?: string;
        summary_policy?: string;
        context?: Array<{
          [key: string]: Array<{
            summary?: string;
          }>;
        }>;
      };
    };
  };
}

interface ReportSettingsProps {
  report: any;
  user: any;
  onClose: () => void;
  onSave: (config: ReportConfig) => Promise<void>;
}

const sanitizeUserId = (userId: string): string => {
  return userId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
};

export const ReportSettings: React.FC<ReportSettingsProps> = ({ report, user, onClose, onSave }) => {
  const [config, setConfig] = useState<ReportConfig>({
    reporting: {
      doi: '',
      images: {
        '1': { file: 'Example image of a vibrant, walkable, urban neighbourhood - landscape.jpg', credit: 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Carl Higgs, Bing Image Creator, 2023' },
        '2': { file: 'Example image 2-Landscape.jpg', credit: 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Eugen Resendiz, Bing Image Creator, 2023' },
        '3': { file: 'Example image of a vibrant, walkable, urban neighbourhood - square.jpg', credit: 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Carl Higgs, Bing Image Creator, 2023' },
        '4': { file: 'Example image of climate resilient lively city watercolor-Square.jpg', credit: 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Eugen Resendiz, Bing Image Creator, 2023' },
      },
      languages: {
        English: {
          name: 'City name',
          country: 'Country name',
          summary_policy: 'After reviewing policy indicator results for your city, provide a contextualised summary by modifying the "summary_policy" text for each configured language within the region configuration file.',
          context: [
            {
              'City context': [
                { summary: 'Contextual information about your study region.' }
              ]
            },
            {
              'Demographics and health equity': [
                { summary: 'Demographics and health equity summary.' }
              ]
            },
            {
              'Environmental disaster context': [
                { summary: 'Environmental disaster context.' }
              ]
            },
            {
              'Levels of government': [
                { summary: '' }
              ]
            }
          ]
        }
      }
    }
  });

  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // Load existing config from report if available
    if (report.reportConfig) {
      try {
        let existingConfig = report.reportConfig;
        
        // Parse multiple times if needed (handles double-encoding from a.json() + JSON.stringify)
        while (typeof existingConfig === 'string') {
          try {
            existingConfig = JSON.parse(existingConfig);
          } catch {
            break;
          }
        }
        
        console.log('Settings loaded:', existingConfig?.reporting?.languages?.English?.name || 'No name found');
        
        // Use existing config directly, only provide defaults for missing top-level structures
        const loadedConfig = {
          reporting: {
            doi: existingConfig?.reporting?.doi || '',
            images: existingConfig?.reporting?.images || config.reporting?.images || {},
            languages: existingConfig?.reporting?.languages || config.reporting?.languages || {}
          }
        };
        
        setConfig(loadedConfig);
      } catch (error) {
        console.error('Failed to parse existing config:', error);
      }
    }
  }, [report.id]);

  const handleImageUpload = async (imageNumber: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setUploadingImage(imageNumber);
    try {
      const username = sanitizeUserId(user?.username || 'unknown');
      const timestamp = Date.now();
      const key = `${username}/images/${timestamp}-${file.name}`;
      
      await uploadData({
        path: `public/${key}`,
        data: file,
        options: {
          contentType: file.type
        }
      });

      // Update config with S3 key
      setConfig(prev => ({
        ...prev,
        reporting: {
          ...prev.reporting,
          images: {
            ...prev.reporting?.images,
            [imageNumber]: {
              ...prev.reporting?.images?.[imageNumber],
              file: file.name,
              s3Key: `public/${key}`
            }
          }
        }
      }));
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log('Saving config changes...');
      
      // Ensure config is properly formatted as a plain object
      const cleanConfig = JSON.parse(JSON.stringify(config));
      
      await onSave(cleanConfig);
      
      // Wait briefly for success feedback
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Exit edit mode after successful save
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (path: string[], value: any) => {
    setConfig(prev => {
      const newConfig = JSON.parse(JSON.stringify(prev));
      let current = newConfig;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newConfig;
    });
  };

  const handleRevert = async () => {
    try {
      console.log('Reverting to initial config...');
      const { data: freshReport } = await client.models.PolicyReport.get({ id: report.id });
      
      // Handle both array and single object responses
      const reportData = Array.isArray(freshReport) ? freshReport[0] : freshReport;
      
      if (reportData?.initialReportConfig) {
        const initialConfig = typeof reportData.initialReportConfig === 'string'
          ? JSON.parse(reportData.initialReportConfig)
          : reportData.initialReportConfig;
        
        setConfig(JSON.parse(JSON.stringify(initialConfig))); // Deep copy
        setIsEditing(false);
        alert('Settings reverted to original Excel-parsed configuration.');
      } else {
        alert('No initial configuration found. Try re-uploading the file.');
      }
    } catch (error) {
      console.error('Failed to revert settings:', error);
      alert('Failed to revert settings. Please try again.');
    }
  };

  const renderSummary = () => {
    const doi = config.reporting?.doi || 'Not specified';
    const city = config.reporting?.languages?.English?.name || 'Not specified';
    const country = config.reporting?.languages?.English?.country || 'Not specified';
    const images = config.reporting?.images || {};
    
    return (
      <div className="settings-summary">
        <div className="summary-item"><strong>DOI:</strong> {doi}</div>
        <div className="summary-item"><strong>City:</strong> {city}</div>
        <div className="summary-item"><strong>Country:</strong> {country}</div>
        
        {config.reporting?.languages?.English?.context?.filter((item) => {
          const key = Object.keys(item)[0];
          // Exclude auto-populated fields from Excel
          return key !== 'Environmental disaster context' && key !== 'Levels of government';
        }).map((item, idx) => {
          const key = Object.keys(item)[0];
          const summary = item[key][0]?.summary || 'Not set';
          return (
            <div key={idx} className="summary-item">
              <strong>{key}:</strong> {summary.substring(0, 100)}{summary.length > 100 ? '...' : ''}
            </div>
          );
        })}
        
        {['1', '2', '3', '4'].map(num => {
          const img = images[num];
          const filename = img?.file || 'Not set';
          const credit = img?.credit ? ` (${img.credit.substring(0, 50)}${img.credit.length > 50 ? '...' : ''})` : '';
          return (
            <div key={num} className="summary-item">
              <strong>Image {num}:</strong> {filename}{credit}
            </div>
          );
        })}
      </div>
    );
  };

  const renderEditForm = () => {
    return (
      <div className="settings-content">
        <div className="settings-section">
          <label className="settings-field">
            <span>DOI (optional):</span>
            <input
              type="text"
              placeholder="https://doi.org/10.xxxxx"
              value={config.reporting?.doi || ''}
              onChange={(e) => updateConfig(['reporting', 'doi'], e.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>City Name:</span>
            <input
              type="text"
              value={config.reporting?.languages?.English?.name || ''}
              onChange={(e) => updateConfig(['reporting', 'languages', 'English', 'name'], e.target.value)}
            />
          </label>
          
          <label className="settings-field">
            <span>Country:</span>
            <input
              type="text"
              value={config.reporting?.languages?.English?.country || ''}
              onChange={(e) => updateConfig(['reporting', 'languages', 'English', 'country'], e.target.value)}
            />
          </label>

          {config.reporting?.languages?.English?.context?.filter((item) => {
            const key = Object.keys(item)[0];
            // Exclude auto-populated fields from Excel
            return key !== 'Environmental disaster context' && key !== 'Levels of government';
          }).map((item, idx) => {
            const key = Object.keys(item)[0];
            const data = item[key][0];
            // Find the actual index in the original context array
            const actualIdx = config.reporting?.languages?.English?.context?.findIndex(ctx => Object.keys(ctx)[0] === key) || idx;
            return (
              <label key={actualIdx} className="settings-field">
                <span>{key}:</span>
                <textarea
                  rows={3}
                  value={data.summary || ''}
                  onChange={(e) => {
                    const newContext = [...(config.reporting?.languages?.English?.context || [])];
                    newContext[actualIdx][key][0].summary = e.target.value;
                    updateConfig(['reporting', 'languages', 'English', 'context'], newContext);
                  }}
                />
              </label>
            );
          })}

          <p className="settings-help" style={{ marginTop: '20px' }}>Images 1-2: 2100px × 1000px (21:10 ratio), Images 3-4: 1000px × 1000px (1:1 ratio)</p>
          {['1', '2', '3', '4'].map(num => (
            <div key={num} className="image-upload-item">
              <label>Image {num}:</label>
              <input
                type="file"
                accept="image/jpeg,image/jpg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(num, file);
                }}
                disabled={uploadingImage === num}
              />
              {uploadingImage === num && <span className="uploading-text">Uploading...</span>}
              {config.reporting?.images?.[num]?.file && (
                <span className="image-filename">✓ {config.reporting.images[num].file}</span>
              )}
              <input
                type="text"
                placeholder="Image credit/licence"
                value={config.reporting?.images?.[num]?.credit || ''}
                onChange={(e) => updateConfig(['reporting', 'images', num, 'credit'], e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button onClick={onClose} className="btn btn-close">🗙</button>
          <h3>Report Settings: {report.fileName}</h3>
          {report.status === 'COMPLETED' && (
            <p style={{ fontSize: '14px', color: '#666', margin: '5px 0 0 0' }}>
              ℹ️ Modifying settings will require regenerating the report
            </p>
          )}
        </div>

        {/* Fixed action buttons */}
        <div className="settings-actions">
          {!isEditing ? (
            <>
              <button 
                onClick={handleRevert} 
                className="btn-icon btn-icon-secondary"
                title="Revert to Original Excel Config"
              >
                ↶
              </button>
              <button 
                onClick={() => setIsEditing(true)} 
                className="btn-icon"
                title="Edit Settings"
              >
                ✏️
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={handleSave} 
                className="btn-icon btn-icon-primary"
                disabled={isSaving}
                title={isSaving ? 'Saving...' : 'Save Changes'}
              >
                {isSaving ? '⏳' : '💾'}
              </button>
              <button 
                onClick={() => setIsEditing(false)} 
                className="btn-icon btn-icon-secondary"
                title="Cancel"
              >
                ✖️
              </button>
            </>
          )}
        </div>

        {/* Scrollable settings content */}
        <div className="settings-content-scroll">
          {isEditing ? renderEditForm() : renderSummary()}
        </div>
      </div>
    </div>
  );
};
