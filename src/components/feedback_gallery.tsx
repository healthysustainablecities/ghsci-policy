import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

type Feedback = Schema['Feedback']['type'];

interface FeedbackGalleryProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  Bug: 'Bug report',
  Feature: 'Feature suggestion',
  General: 'General',
};

const CATEGORY_COLORS: Record<string, string> = {
  Bug: '#dc3545',
  Feature: '#6f42c1',
  General: '#17a2b8',
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const FeedbackGallery: React.FC<FeedbackGalleryProps> = ({ onClose }) => {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const feedbackRes = await client.models.Feedback.list();
      if (!cancelled) {
        const sorted = [...(feedbackRes.data ?? [])].sort((a, b) =>
          new Date(b.datetime ?? 0).getTime() - new Date(a.datetime ?? 0).getTime()
        );
        setItems(sorted);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content feedback-gallery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button onClick={onClose} className="btn btn-close">🗙</button>
          <h3 style={{ margin: 0 }}>Feedback gallery</h3>
        </div>

        <div className="feedback-gallery-body">
          {loading && <p style={{ color: '#888', fontSize: 14 }}>Loading feedback…</p>}

          {!loading && items.length === 0 && (
            <p style={{ color: '#888', fontSize: 14 }}>No feedback submitted yet.</p>
          )}

          {!loading && items.map((item) => {
            return (
              <div key={item.id} className="feedback-gallery-item">
                <div className="feedback-gallery-item-header">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {item.category && (
                      <span
                        className="status-badge"
                        style={{ backgroundColor: CATEGORY_COLORS[item.category] ?? '#6c757d' }}
                      >
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                    )}
                    {item.resolved && (
                      <span className="status-badge" style={{ backgroundColor: '#28a745' }}>Resolved</span>
                    )}
                  </div>
                  <span className="feedback-gallery-date">{formatDate(item.datetime)}</span>
                </div>

                <p className="feedback-gallery-comment">{item.comment}</p>

                {item.url && (
                  <p className="feedback-gallery-url">
                    <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a>
                  </p>
                )}

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FeedbackGallery;
