import React, { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

const FeedbackChat: React.FC = () => {
  const { user } = useAuthenticator();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<'Bug' | 'Feature' | 'General'>('General');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchUserAttributes()
      .then(attrs => setName(attrs.name ?? ''))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await client.models.Feedback.create({
        comment: comment.trim(),
        email: user?.signInDetails?.loginId ?? undefined,
        datetime: new Date().toISOString(),
        category,
        name: name.trim() || undefined,
      });
      setComment('');
      setCategory('General');
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setOpen(false);
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        className="feedback-fab"
        onClick={() => setOpen(true)}
        title="Suggestions? Leave us some feedback!"
        aria-label="Open feedback form"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && (
        <div className="feedback-overlay" onClick={() => setOpen(false)}>
          <div className="modal-content feedback-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button onClick={() => setOpen(false)} className="btn btn-close">🗙</button>
              <h3 style={{ margin: 0 }}>Feedback or suggestions?</h3>
            </div>

            {submitted ? (
              <p className="feedback-success">Thanks for your feedback! ✓</p>
            ) : (
              <>
                <p style={{ margin: '12px 0 8px', fontSize: 14, color: '#555' }}>
                  If you have a comment to share, we would love to hear your thoughts.
                </p>

                <div className="modal-row">
                  <label className="feedback-label" htmlFor="feedback-category">Category</label>
                  <select
                    id="feedback-category"
                    className="feedback-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as 'Bug' | 'Feature' | 'General')}
                  >
                    <option value="General">General</option>
                    <option value="Feature">Feature suggestion</option>
                    <option value="Bug">Bug report</option>
                  </select>
                </div>

                <div className="modal-row">
                  <label className="feedback-label" htmlFor="feedback-comment">Your feedback</label>
                  <textarea
                    id="feedback-comment"
                    className="feedback-textarea"
                    placeholder="Your feedback…"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                </div>

                <div className="modal-row">
                  <label className="feedback-label" htmlFor="feedback-name">Your name <span style={{ fontWeight: 400, color: '#888' }}>(optional — clear to submit anonymously)</span></label>
                  <input
                    id="feedback-name"
                    className="feedback-select"
                    type="text"
                    placeholder="Anonymous"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ fontFamily: 'inherit' }}
                  />
                </div>

                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
                  Along with your comment we'll record the date, time, and your account email.
                </p>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn" style={{ background: 'none', color: '#555', border: '1px solid #ccc' }} onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={submitting || !comment.trim()}
                    style={{ padding: '8px 20px', fontSize: 14 }}
                  >
                    {submitting ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackChat;
