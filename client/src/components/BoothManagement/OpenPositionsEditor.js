import React, { useMemo, useState } from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { Input, MultiSelect } from '../UI/FormComponents';
import { BOOTH_LOCATION_SUGGESTIONS } from '../../constants/options';

export const MAX_OPEN_POSITIONS = 50;

// Sentinel dropdown entry that reveals the free-text location field. It is never
// stored on the booth — selecting it only opens the input.
const OTHER_LOCATION_VALUE = '__other__';

const emptyPosition = () => ({ title: '', locations: [] });

/** Trim, drop empties, and case-insensitive dedupe while preserving first-seen order. */
const uniqueLines = (text, maxLength) => {
  const seen = new Set();
  const values = [];
  String(text || '')
    .split('\n')
    .forEach((line) => {
      let value = (line || '').trim();
      if (!value) return;
      if (maxLength) value = value.slice(0, maxLength);
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      values.push(value);
    });
  return values;
};

const serializePositionsText = (rows) =>
  rows
    .map((row) => (row.title || '').trim())
    .filter(Boolean)
    .join('\n');

const serializeLocationsText = (rows) => {
  const seen = new Set();
  const values = [];
  rows.forEach((row) => {
    (row.locations || []).forEach((location) => {
      const value = (location || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      values.push(value);
    });
  });
  return values.join('\n');
};

/** Each title becomes a position; the shared location list is applied to every position. */
export const parseQuickOpenPositions = (positionsText, locationsText) => {
  const titles = uniqueLines(positionsText, 150).slice(0, MAX_OPEN_POSITIONS);
  const locations = uniqueLines(locationsText, 100);
  return titles.map((title) => ({ title, locations: [...locations] }));
};

/**
 * Repeatable editor for a booth's open positions. Each position has a title and
 * one or more locations; job seekers pick from these before joining the queue.
 * Supports Form (cards) and Quick (paste lists) modes.
 */
export default function OpenPositionsEditor({ positions, onChange }) {
  const rows = useMemo(() => (Array.isArray(positions) ? positions : []), [positions]);
  const [customLocation, setCustomLocation] = useState({});
  const [otherOpen, setOtherOpen] = useState({});
  const [mode, setMode] = useState('form');
  const [positionsText, setPositionsText] = useState('');
  const [locationsText, setLocationsText] = useState('');

  // Suggestions plus anything already saved on the booth, so custom locations
  // added earlier stay selectable after a reload.
  const locationOptions = useMemo(() => {
    const seen = new Set();
    const values = [];
    [...BOOTH_LOCATION_SUGGESTIONS, ...rows.flatMap((row) => row.locations || [])].forEach((label) => {
      const value = (label || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      values.push({ value, label: value });
    });
    values.push({ value: OTHER_LOCATION_VALUE, label: 'Other (add your own)' });
    return values;
  }, [rows]);

  const applyQuickText = (nextPositionsText = positionsText, nextLocationsText = locationsText) => {
    onChange(parseQuickOpenPositions(nextPositionsText, nextLocationsText));
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'quick') {
      setPositionsText(serializePositionsText(rows));
      setLocationsText(serializeLocationsText(rows));
    } else {
      applyQuickText();
    }
    setMode(nextMode);
  };

  const updateRow = (index, changes) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };

  const addPosition = () => {
    if (rows.length >= MAX_OPEN_POSITIONS) return;
    onChange([...rows, emptyPosition()]);
  };

  const removePosition = (index) => {
    onChange(rows.filter((_, i) => i !== index));
    setCustomLocation((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setOtherOpen((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  // "Other" is a UI-only toggle, so keep it out of the saved locations.
  const handleLocationsChange = (index, nextValue) => {
    const selected = Array.isArray(nextValue) ? nextValue : [];
    const wantsOther = selected.includes(OTHER_LOCATION_VALUE);
    setOtherOpen((prev) => ({ ...prev, [index]: wantsOther }));
    if (!wantsOther) {
      setCustomLocation((prev) => ({ ...prev, [index]: '' }));
    }
    updateRow(index, { locations: selected.filter((value) => value !== OTHER_LOCATION_VALUE) });
  };

  const addCustomLocation = (index) => {
    const value = (customLocation[index] || '').trim();
    if (!value) return;
    const current = rows[index]?.locations || [];
    const exists = current.some((location) => location.toLowerCase() === value.toLowerCase());
    if (!exists) {
      updateRow(index, { locations: [...current, value] });
    }
    setCustomLocation((prev) => ({ ...prev, [index]: '' }));
  };

  const titleCount = uniqueLines(positionsText, 150).length;
  const atPositionLimit = titleCount >= MAX_OPEN_POSITIONS;

  return (
    <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, margin: '0 0 1.25rem 0' }}>
      <legend style={{ padding: '0 6px', fontSize: 14, fontWeight: 600, color: '#111827' }}>
        Open Positions
      </legend>

      <div className="open-positions-mode-toggle" role="tablist" aria-label="Open positions edit mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'form'}
          className={`open-positions-mode-btn${mode === 'form' ? ' is-active' : ''}`}
          onClick={() => switchMode('form')}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'quick'}
          className={`open-positions-mode-btn${mode === 'quick' ? ' is-active' : ''}`}
          onClick={() => switchMode('quick')}
        >
          Quick
        </button>
      </div>

      <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#6b7280' }}>
        Add the roles this booth is hiring for and where each role is based. Job seekers must
        choose a position and location before joining the queue, and recruiters can filter the
        queue by them. Leave this empty to skip the selection.
      </p>

      {mode === 'quick' ? (
        <div className="open-positions-quick">
          <p id="open-positions-quick-hint-id" className="form-hint open-positions-quick-hint">
            Paste one position title per line and one location per line. Locations are shared
            across all positions. Switching to Form applies the lists to every position card.
          </p>
          <div className="form-group open-positions-quick-field">
            <label htmlFor="open-positions-quick-titles">Positions</label>
            <textarea
              id="open-positions-quick-titles"
              value={positionsText}
              onChange={(e) => {
                const next = e.target.value;
                setPositionsText(next);
                applyQuickText(next, locationsText);
              }}
              onBlur={() => applyQuickText()}
              placeholder={'Software Engineer\nSales Associate\nCustomer Support'}
              rows={8}
              aria-describedby="open-positions-quick-hint-id"
            />
          </div>
          <div className="form-group open-positions-quick-field">
            <label htmlFor="open-positions-quick-locations">Locations</label>
            <textarea
              id="open-positions-quick-locations"
              value={locationsText}
              onChange={(e) => {
                const next = e.target.value;
                setLocationsText(next);
                applyQuickText(positionsText, next);
              }}
              onBlur={() => applyQuickText()}
              placeholder={'Remote\nNew York\nCalifornia'}
              rows={8}
            />
          </div>
          <p className="form-hint open-positions-quick-hint" aria-live="polite">
            {titleCount} position{titleCount === 1 ? '' : 's'}
            {atPositionLimit ? ` (maximum ${MAX_OPEN_POSITIONS})` : ''}. Extra title lines beyond{' '}
            {MAX_OPEN_POSITIONS} are ignored.
          </p>
        </div>
      ) : (
        <>
          {rows.length === 0 && (
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#6b7280' }}>
              No open positions added yet.
            </p>
          )}

          {rows.map((row, index) => (
            <div
              key={`open-position-${index}`}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                background: '#f8fafc',
                padding: 12,
                marginBottom: 12
              }}
            >
              <div className="open-position-card-header">
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  Position {index + 1}
                </h4>
                <ButtonComponent
                  cssClass="e-outline e-danger e-small"
                  type="button"
                  onClick={() => removePosition(index)}
                >
                  Remove
                </ButtonComponent>
              </div>
              <Input
                label="Title"
                value={row.title || ''}
                onChange={(e) => updateRow(index, { title: e.target.value })}
                placeholder="e.g. Software Engineer"
                maxLength="150"
              />
              <MultiSelect
                label="Locations"
                value={otherOpen[index] ? [...(row.locations || []), OTHER_LOCATION_VALUE] : (row.locations || [])}
                onChange={(e) => handleLocationsChange(index, e.target.value)}
                options={locationOptions}
                placeholder="Select locations"
              />
              {otherOpen[index] && (
                <>
                  <div className="open-position-add-location-row">
                    <Input
                      label="Other location"
                      value={customLocation[index] || ''}
                      onChange={(e) => setCustomLocation((prev) => ({ ...prev, [index]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomLocation(index);
                        }
                      }}
                      placeholder="e.g. San Francisco, CA"
                      maxLength="100"
                      aria-describedby={`open-position-${index}-location-hint`}
                      className="open-position-custom-location"
                    />
                    <ButtonComponent
                      cssClass="e-outline e-primary e-small"
                      type="button"
                      onClick={() => addCustomLocation(index)}
                      disabled={!(customLocation[index] || '').trim()}
                    >
                      Add
                    </ButtonComponent>
                  </div>
                  <p id={`open-position-${index}-location-hint`} className="form-hint open-position-add-location-hint">
                    Type a location and select Add. It joins the list above and stays available for other positions.
                  </p>
                </>
              )}
            </div>
          ))}

          <ButtonComponent
            cssClass="e-outline e-primary"
            type="button"
            onClick={addPosition}
            disabled={rows.length >= MAX_OPEN_POSITIONS}
          >
            Add Position
          </ButtonComponent>
          {rows.length >= MAX_OPEN_POSITIONS && (
            <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#6b7280' }}>
              Maximum of {MAX_OPEN_POSITIONS} positions reached.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
