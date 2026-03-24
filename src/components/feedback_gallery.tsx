import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

type Feedback = Schema['Feedback']['type'];
type FeedbackStatus = 'resolved' | 'planned' | 'not_planned';

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

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  resolved: 'Resolved',
  planned: 'Planned',
  not_planned: 'Not planned',
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  resolved: '#28a745',
  planned: '#007bff',
  not_planned: '#6c757d',
};

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatDevDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_SHORT[d.getMonth()];
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${mon} ${yyyy}, ${hh}:${mm}`;
};

async function checkIsAdmin(): Promise<boolean> {
  try {
    const session = await fetchAuthSession();
    const groups = session.tokens?.accessToken?.payload?.['cognito:groups'];
    return Array.isArray(groups) && groups.includes('Admins');
  } catch {
    return false;
  }
}

interface AdminCardState {
  status: FeedbackStatus | '';
  devComment: string;
  saving: boolean;
  dirty: boolean;
}

export const FeedbackGallery: React.FC<FeedbackGalleryProps> = ({ onClose }) => {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminState, setAdminState] = useState<Record<string, AdminCardState>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [feedbackRes, adminCheck, userAttrs] = await Promise.all([
        client.models.Feedback.list(),
        checkIsAdmin(),
        fetchUserAttributes().catch(() => ({} as Record<string, string | undefined>)),
      ]);
      if (!cancelled) {
        const sorted = [...(feedbackRes.data ?? [])].sort((a, b) =>
          new Date(b.datetime ?? 0).getTime() - new Date(a.datetime ?? 0).getTime()
        );
        setItems(sorted);
        setIsAdmin(adminCheck);
        // Initialise admin editing state from existing data
        if (adminCheck) {
          setAdminName(userAttrs.name ?? '');
          setAdminName(userAttrs.name ?? '');
          const initial: Record<string, AdminCardState> = {};
          for (const item of sorted) {
            initial[item.id] = {
              status: (item.status as FeedbackStatus) ?? '',
              devComment: item.devComment ?? '',
              saving: false,
              dirty: false,
            };
          }
          setAdminState(initial);
        }
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const updateAdminField = (id: string, field: keyof Pick<AdminCardState, 'status' | 'devComment'>, value: string) => {
    setAdminState(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value, dirty: true },
    }));
  };

  const handleSave = async (item: Feedback) => {
    const state = adminState[item.id];
    if (!state) return;
    setAdminState(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: true } }));
    try {
      const updated = await client.models.Feedback.update({
        id: item.id,
        status: state.status || undefined,
        devComment: state.devComment || undefined,
        devCommentAuthor: state.devComment.trim() ? (adminName || undefined) : undefined,
        devCommentAt: state.devComment.trim() ? new Date().toISOString() : undefined,
        // Keep resolved in sync for backwards compat
        resolved: state.status === 'resolved' ? true : (item.resolved ?? undefined),
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...(updated.data ?? {}) } : i));
      setAdminState(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: false, dirty: false } }));
    } catch (err) {
      console.error('Failed to save feedback update:', err);
      setAdminState(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: false } }));
    }
  };

  const handleDelete = async (item: Feedback) => {
    if (!window.confirm('Delete this feedback item? This cannot be undone.')) return;
    try {
      await client.models.Feedback.delete({ id: item.id });
      setItems(prev => prev.filter(i => i.id !== item.id));
      setAdminState(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete feedback:', err);
      alert('Failed to delete feedback. Please try again.');
    }
  };

  const effectiveStatus = (item: Feedback): FeedbackStatus | null => {
    if (item.status) return item.status as FeedbackStatus;
    if (item.resolved) return 'resolved';
    return null;
  };

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
            const status = effectiveStatus(item);
            const aState = adminState[item.id];
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
                    {status && (
                      <span className="status-badge" style={{ backgroundColor: STATUS_COLORS[status] }}>
                        {STATUS_LABELS[status]}
                      </span>
                    )}
                  </div>
                  <span className="feedback-gallery-date">{formatDate(item.datetime)}</span>
                </div>

                <p className="feedback-gallery-comment">{item.comment}</p>

                {item.name && (
                  <p className="feedback-gallery-submitter">Submitted by {item.name}</p>
                )}

                {/* Developer response — visible to all users */}
                {item.devComment && !isAdmin && (
                  <div className="feedback-dev-comment">
                    <span className="feedback-dev-comment-label">
                      {item.devCommentAuthor
                        ? `${item.devCommentAuthor}${item.devCommentAt ? ` · ${formatDevDate(item.devCommentAt)}` : ''}`
                        : 'Developer response'}
                    </span>
                    <p className="feedback-dev-comment-text">{item.devComment}</p>
                  </div>
                )}

                {/* Admin controls */}
                {isAdmin && aState && (
                  <div className="feedback-admin-controls">
                    <div className="feedback-admin-row">
                      <label className="feedback-admin-label" htmlFor={`status-${item.id}`}>Status</label>
                      <select
                        id={`status-${item.id}`}
                        className="feedback-admin-select"
                        value={aState.status}
                        onChange={(e) => updateAdminField(item.id, 'status', e.target.value)}
                      >
                        <option value="">— No status —</option>
                        <option value="resolved">Resolved</option>
                        <option value="planned">Planned</option>
                        <option value="not_planned">Not planned</option>
                      </select>
                    </div>
                    <div className="feedback-admin-row">
                      <label className="feedback-admin-label" htmlFor={`devcomment-${item.id}`}>Developer comment</label>
                      <textarea
                        id={`devcomment-${item.id}`}
                        className="feedback-admin-textarea"
                        placeholder="Optional response or update visible to all users…"
                        value={aState.devComment}
                        rows={2}
                        onChange={(e) => updateAdminField(item.id, 'devComment', e.target.value)}
                      />
                    </div>
                    <div className="feedback-admin-actions">
                      <button
                        className="btn btn-primary feedback-admin-save"
                        onClick={() => handleSave(item)}
                        disabled={aState.saving || !aState.dirty}
                      >
                        {aState.saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="btn feedback-admin-delete"
                        onClick={() => handleDelete(item)}
                        disabled={aState.saving}
                      >
                        Delete
                      </button>
                    </div>
                    {/* Show dev comment preview while in admin mode */}
                    {aState.devComment && (
                      <div className="feedback-dev-comment feedback-dev-comment-preview">
                        <span className="feedback-dev-comment-label">
                          {adminName ? `${adminName} · on save` : 'Developer response (preview)'}
                        </span>
                        <p className="feedback-dev-comment-text">{aState.devComment}</p>
                      </div>
                    )}
                  </div>
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
