import React, { useState, useEffect, useRef } from 'react';
import './RatingModal.css';

const RatingModal = ({ isOpen, onClose, onSubmit, jobSeekerName, loading = false }) => {
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [hoveredRating, setHoveredRating] = useState(0);
    const modalRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (rating === 0) {
            alert('Please select a rating');
            return;
        }
        onSubmit({ rating, feedback });
    };

    const handleClose = () => {
        if (!loading) {
            setRating(0);
            setFeedback('');
            setHoveredRating(0);
            onClose();
        }
    };

    const handleStarClick = (starRating) => {
        setRating(starRating);
    };

    const handleStarHover = (starRating) => {
        setHoveredRating(starRating);
    };

    const handleStarLeave = () => {
        setHoveredRating(0);
    };

    useEffect(() => {
        if (isOpen && modalRef.current) {
            modalRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div 
            className="rating-modal-overlay" 
            onClick={handleClose}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    handleClose();
                }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
            tabIndex={-1}
        >
            <div 
                ref={modalRef}
                className="rating-modal" 
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="document"
                tabIndex={-1}
            >
                <div className="rating-modal-header">
                    <h2 id="modal-title">Rate Your Meeting</h2>
                    <button 
                        className="close-button" 
                        onClick={handleClose}
                        disabled={loading}
                        aria-label="Close rating modal"
                    >
                        ×
                    </button>
                </div>

                <div className="rating-modal-content">
                    <div className="meeting-info">
                        <p id="modal-description">How would you rate your meeting with <strong>{jobSeekerName}</strong>?</p>
                    </div>

                    <form onSubmit={handleSubmit} aria-labelledby="modal-title" aria-describedby="modal-description">
                        <fieldset className="rating-section">
                            <legend className="rating-label">Rating *</legend>
                            <div className="star-rating" role="radiogroup" aria-label="Rating out of 5 stars">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        className={`star ${
                                            star <= (hoveredRating || rating) ? 'filled' : 'empty'
                                        }`}
                                        onClick={() => handleStarClick(star)}
                                        onMouseEnter={() => handleStarHover(star)}
                                        onMouseLeave={handleStarLeave}
                                        disabled={loading}
                                        aria-label={`Rate ${star} out of 5 stars`}
                                        title={`Rate ${star} out of 5 stars`}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>
                            <div className="rating-labels">
                                <span>Poor</span>
                                <span>Excellent</span>
                            </div>
                        </fieldset>

                        <div className="feedback-section">
                            <label htmlFor="feedback" className="feedback-label">
                                Feedback (Optional)
                            </label>
                            <textarea
                                id="feedback"
                                className="feedback-textarea"
                                placeholder="Share your thoughts about the meeting, candidate's performance, or any notes for future reference..."
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                maxLength={1000}
                                rows={4}
                                disabled={loading}
                            />
                            <div className="character-count">
                                {feedback.length}/1000 characters
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={handleClose}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn-submit"
                                disabled={loading || rating === 0}
                            >
                                {loading ? (
                                    <>
                                        <span className="loading-spinner-small"></span>
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit Rating'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default RatingModal;
