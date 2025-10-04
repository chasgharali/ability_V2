import React from 'react';
import './CallInviteModal.css';

export default function CallInviteModal({
  recruiterName,
  boothName,
  eventName,
  audioInputs,
  videoInputs,
  selectedAudioId,
  selectedVideoId,
  onChangeAudio,
  onChangeVideo,
  onAccept,
  onDecline
}) {
  return (
    <div className="call-invite-modal-overlay" role="dialog" aria-modal="true">
      <div className="call-invite-modal" role="document">
        <div className="call-invite-header">
          <h3 className="call-invite-title">Video Call Invitation</h3>
          <button className="call-invite-close" aria-label="Close" onClick={onDecline}>×</button>
        </div>
        <hr className="call-invite-divider" />
        <div className="call-invite-body">
          <p className="call-invite-text">
            You are invited by <strong>{recruiterName || 'Recruiter'}</strong> to join a video call
            {boothName ? <> at <strong>{boothName}</strong></> : null}
            {eventName ? <> for <strong>{eventName}</strong></> : null}.
          </p>
          <p className="call-invite-subtext">Please select your camera and microphone before joining.</p>

          <div className="call-invite-device-grid">
            <div className="call-invite-field">
              <label className="call-invite-label" htmlFor="mic-select">Microphone</label>
              <select
                id="mic-select"
                className="call-invite-select"
                value={selectedAudioId || ''}
                onChange={e => onChangeAudio(e.target.value)}
              >
                {audioInputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                ))}
              </select>
            </div>

            <div className="call-invite-field">
              <label className="call-invite-label" htmlFor="cam-select">Camera</label>
              <select
                id="cam-select"
                className="call-invite-select"
                value={selectedVideoId || ''}
                onChange={e => onChangeVideo(e.target.value)}
              >
                {videoInputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <hr className="call-invite-divider" />
        <div className="call-invite-actions">
          <button className="call-invite-btn call-invite-decline" onClick={onDecline}>Decline</button>
          <button className="call-invite-btn call-invite-accept" onClick={onAccept}>Join Call</button>
        </div>
      </div>
    </div>
  );
}
