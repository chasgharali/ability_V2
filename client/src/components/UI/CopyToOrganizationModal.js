import React, { useEffect, useMemo, useState } from 'react';
import './CopyToAdminModal.css';

export default function CopyToOrganizationModal({
    isOpen,
    organizations = [],
    title = 'Copy to Organization',
    description = 'Select an organization and choose whether to overwrite existing copy.',
    onCancel,
    onConfirm
}) {
    const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
    const [overwrite, setOverwrite] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedOrganizationId('');
        setOverwrite(false);
    }, [isOpen]);

    const organizationOptions = useMemo(() => organizations.map((org) => ({
        value: org._id,
        label: org.name || org.slug || 'Unnamed organization'
    })), [organizations]);

    if (!isOpen) return null;

    return (
        <div className="copy-admin-modal__overlay" role="dialog" aria-modal="true" aria-labelledby="copy-org-title">
            <div className="copy-admin-modal__container">
                <h3 id="copy-org-title" className="copy-admin-modal__title">{title}</h3>
                <p className="copy-admin-modal__description">{description}</p>

                {organizationOptions.length === 0 ? (
                    <p className="copy-admin-modal__empty">No active organizations available.</p>
                ) : (
                    <>
                        <label htmlFor="copy-org-select" className="copy-admin-modal__label">Organization</label>
                        <select
                            id="copy-org-select"
                            className="copy-admin-modal__select"
                            value={selectedOrganizationId}
                            onChange={(e) => setSelectedOrganizationId(e.target.value)}
                        >
                            <option value="">Select organization</option>
                            {organizationOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>

                        <label className="copy-admin-modal__checkbox-row">
                            <input
                                type="checkbox"
                                checked={overwrite}
                                onChange={(e) => setOverwrite(e.target.checked)}
                            />
                            <span>Overwrite existing organization copy</span>
                        </label>
                    </>
                )}

                <div className="copy-admin-modal__actions">
                    <button type="button" className="dashboard-button" onClick={onCancel}>Cancel</button>
                    <button
                        type="button"
                        className="dashboard-button"
                        disabled={!selectedOrganizationId}
                        onClick={() => onConfirm(selectedOrganizationId, overwrite)}
                    >
                        Copy
                    </button>
                </div>
            </div>
        </div>
    );
}
