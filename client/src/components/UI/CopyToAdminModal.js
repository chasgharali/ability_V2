import React, { useEffect, useMemo, useState } from 'react';
import './CopyToAdminModal.css';

export default function CopyToAdminModal({
    isOpen,
    admins = [],
    title = 'Copy to Admin',
    description = 'Select organization admin and confirm copy.',
    onCancel,
    onConfirm
}) {
    const [selectedAdminId, setSelectedAdminId] = useState('');
    const [overwrite, setOverwrite] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedAdminId('');
        setOverwrite(false);
    }, [isOpen]);

    const adminOptions = useMemo(() => admins.map((admin) => ({
        value: admin._id,
        label: `${admin.name || admin.email} (${admin.email})`
    })), [admins]);

    if (!isOpen) return null;

    return (
        <div className="copy-admin-modal__overlay" role="dialog" aria-modal="true" aria-labelledby="copy-admin-title">
            <div className="copy-admin-modal__container">
                <h3 id="copy-admin-title" className="copy-admin-modal__title">{title}</h3>
                <p className="copy-admin-modal__description">{description}</p>

                {adminOptions.length === 0 ? (
                    <p className="copy-admin-modal__empty">No organization admins available.</p>
                ) : (
                    <>
                        <label htmlFor="copy-admin-select" className="copy-admin-modal__label">Organization Admin</label>
                        <select
                            id="copy-admin-select"
                            className="copy-admin-modal__select"
                            value={selectedAdminId}
                            onChange={(e) => setSelectedAdminId(e.target.value)}
                        >
                            <option value="">Select admin</option>
                            {adminOptions.map((option) => (
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
                        disabled={!selectedAdminId}
                        onClick={() => onConfirm(selectedAdminId, overwrite)}
                    >
                        Copy
                    </button>
                </div>
            </div>
        </div>
    );
}
