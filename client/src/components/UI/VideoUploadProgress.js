import React from 'react';
import './VideoUploadProgress.css';

const VideoUploadProgress = ({ progress, fileName, isUploading }) => {
  if (!isUploading) return null;

  return (
    <div className="video-upload-overlay">
      <div className="video-upload-modal">
        <div className="video-upload-header">
          <h3>Uploading Media</h3>
        </div>
        <div className="video-upload-body">
          <div className="video-upload-file-info">
            <svg className="video-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
            </svg>
            <div className="video-upload-file-name">{fileName}</div>
          </div>
          
          <div className="video-upload-progress-container">
            <div className="video-upload-progress-bar">
              <div 
                className="video-upload-progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="video-upload-progress-text">{Math.round(progress)}%</div>
          </div>
          
          <div className="video-upload-status">
            {progress < 100 ? 'Uploading to cloud storage...' : 'Processing...'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoUploadProgress;
