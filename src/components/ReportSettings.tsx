import React, { useState, useEffect } from 'react';
import { uploadData, getUrl } from 'aws-amplify/storage';
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
    custom_text_box_fontsize?: number; // Optional custom font size for report blurb, e.g. 11 for 11px
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
        '1': { file: 'Example image of a vibrant, walkable, urban neighbourhood - landscape.jpg', credit: 'e.g. Image Licence Owner Name, YYYY' },
        '2': { file: 'Example image 2-Landscape.jpg', credit: 'e.g. Image Licence Owner Name, YYYY' },
        '3': { file: 'Example image of a vibrant, walkable, urban neighbourhood - square.jpg', credit: 'e.g. Image Licence Owner Name, YYYY' },
        '4': { file: 'Example image of climate resilient lively city watercolor-Square.jpg', credit: 'e.g. Image Licence Owner Name, YYYY' },
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
      },
      custom_text_box_fontsize: 12
    }
  });

  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<{ [key: string]: string }>({});
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<{ [key: string]: string }>({});

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
            languages: existingConfig?.reporting?.languages || config.reporting?.languages || {},
            custom_text_box_fontsize: existingConfig?.reporting?.custom_text_box_fontsize || 12
          }
        };
        
        setConfig(loadedConfig);
        
        // Load image URLs for summary view
        loadImageUrls(loadedConfig);
      } catch (error) {
        console.error('Failed to parse existing config:', error);
      }
    }
  }, [report.id]);

  const loadImageUrls = async (cfg: ReportConfig) => {
    const images = cfg.reporting?.images || {};
    const urls: { [key: string]: string } = {};
    
    for (const [num, img] of Object.entries(images)) {
      if (img.s3Key) {
        try {
          const { url } = await getUrl({ path: img.s3Key });
          urls[num] = url.toString();
        } catch (error) {
          console.error(`Failed to load image ${num}:`, error);
        }
      }
    }
    
    setImageUrls(urls);
  };

  const handleImageUpload = async (imageNumber: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
      alert('Please upload a JPG or PNG image');
      return;
    }

    // Skip upload if the same file is already stored for this image slot
    const existing = config.reporting?.images?.[imageNumber];
    if (existing?.s3Key && existing?.file === file.name) {
      return;
    }

    setUploadingImage(imageNumber);
    
    // Generate preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreviews(prev => ({
        ...prev,
        [imageNumber]: reader.result as string
      }));
    };
    reader.readAsDataURL(file);

    try {
      const username = sanitizeUserId(user?.username || 'unknown');
      // Use filename-based key (no timestamp) so re-uploading the same file reuses the same S3 object
      const key = `${username}/images/${file.name}`;
      
      await uploadData({
        path: `public/${key}`,
        data: file,
        options: {
          contentType: file.type
        }
      });

      // Update config with S3 key
      const newConfig = {
        ...config,
        reporting: {
          ...config.reporting,
          images: {
            ...config.reporting?.images,
            [imageNumber]: {
              ...config.reporting?.images?.[imageNumber],
              file: file.name,
              s3Key: `public/${key}`
            }
          }
        }
      };
      setConfig(newConfig);
      
      // Update imageUrls for immediate display
      const { url } = await getUrl({ path: `public/${key}` });
      setImageUrls(prev => ({
        ...prev,
        [imageNumber]: url.toString()
      }));
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleDrag = (e: React.DragEvent, imageNumber: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(imageNumber);
    } else if (e.type === "dragleave") {
      setDragActive(null);
    }
  };

  const handleDrop = (e: React.DragEvent, imageNumber: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleImageUpload(imageNumber, file);
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
      <div className="settings-summary" translate="no">
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
              <strong>{key}</strong> <div className="summary-text">{summary}</div>
            </div>
          );
        })}
        <div className="summary-item">
          <strong>Custom text box font size</strong> {config.reporting?.custom_text_box_fontsize ?? 12}
        </div>
        {['1', '2', '3', '4'].map(num => {
          const img = images[num];
          const hasImage = img?.file && img.file !== 'Not set';
          return (
            <div key={num} className="summary-item summary-item-image">
              <strong>Image {num}</strong>
              {hasImage ? (
                <div className="summary-image-content">
                  {imageUrls[num] || imagePreviews[num] ? (
                    <img 
                      src={imageUrls[num] || imagePreviews[num]} 
                      alt={`Image ${num}`} 
                      className="summary-thumbnail" 
                    />
                  ) : null}
                  <div className="summary-image-info">
                    <div className="image-filename">✓ {img.file}</div>
                    {img?.credit && (
                      <div className="image-credit">
                        <strong>Credit</strong> {img.credit}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <span>Not set</span>
              )}
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
            <span>DOI (optional)</span>
            <input
              type="text"
              placeholder="https://doi.org/10.xxxxx"
              value={config.reporting?.doi || ''}
              onChange={(e) => updateConfig(['reporting', 'doi'], e.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>City Name</span>
            <input
              type="text"
              value={config.reporting?.languages?.English?.name || ''}
              onChange={(e) => updateConfig(['reporting', 'languages', 'English', 'name'], e.target.value)}
            />
          </label>
          
          <label className="settings-field">
            <span>Country</span>
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
                <span>{key}</span>
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
          
          <label className="settings-field">
            <span>Custom text box font size</span>
            <input
              type="number"
              min={6}
              max={20}
              step={0.5}
              value={config.reporting?.custom_text_box_fontsize ?? 12}
              onChange={(e) => updateConfig(['reporting', 'custom_text_box_fontsize'], parseFloat(e.target.value) || 12)}
            />
          </label>

          {['1', '2', '3', '4'].map(num => (
            <div key={num} className="image-upload-item">
              <label>Image {num} {parseInt(num) in [1, 2] ? '(Landscape; 21:10 ratio, e.g. 2100px × 1000px)' : '(Square; 1:1 ratio, e.g. 1000px × 1000px)'}</label>
              
              <div 
                className={`image-dropzone ${dragActive === num ? 'drag-active' : ''}`}
                onDragEnter={(e) => handleDrag(e, num)}
                onDragLeave={(e) => handleDrag(e, num)}
                onDragOver={(e) => handleDrag(e, num)}
                onDrop={(e) => handleDrop(e, num)}
                onClick={() => document.getElementById(`file-input-${num}`)?.click()}
              >
                {uploadingImage === num ? (
                  <div className="dropzone-content">
                    <span className="uploading-text">⏳ Uploading...</span>
                  </div>
                ) : imagePreviews[num] ? (
                  <div className="dropzone-content">
                    <img src={imagePreviews[num]} alt={`Preview ${num}`} className="image-thumbnail" />
                    <span className="image-filename">✓ {config.reporting?.images?.[num]?.file}</span>
                  </div>
                ) : config.reporting?.images?.[num]?.file ? (
                  <div className="dropzone-content">
                    <span className="image-filename">✓ {config.reporting.images[num].file}</span>
                    <p className="dropzone-hint">Click or drag to replace</p>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <span className="dropzone-icon">📷</span>
                    <p className="dropzone-text">Drag and drop JPG/PNG image here</p>
                    <p className="dropzone-hint">or click to browse</p>
                  </div>
                )}
              </div>
              
              <input
                id={`file-input-${num}`}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(num, file);
                }}
                disabled={uploadingImage === num}
                style={{ display: 'none' }}
              />
              
              <label className="credit-label">Credit</label>
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
    <div className="modal-overlay">
      <div className="modal-content settings-modal">
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
