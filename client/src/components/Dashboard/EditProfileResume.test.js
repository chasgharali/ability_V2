import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditProfileResume from './EditProfileResume';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      _id: 'user-1',
      name: 'Test Job Seeker',
      role: 'JobSeeker'
    }
  })
}));

jest.mock('../../contexts/RoleMessagesContext', () => ({
  useRoleMessages: () => ({
    getMessage: () => ''
  })
}));

jest.mock('../../services/resumes', () => ({
  listResumes: jest.fn(() => Promise.resolve([])),
  setDefaultResume: jest.fn(() => Promise.resolve({}))
}));

jest.mock('@syncfusion/ej2-react-dropdowns', () => ({
  MultiSelectComponent: ({ id, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy, placeholder, value = [], change }) => (
    <input
      id={id}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      placeholder={placeholder}
      value={Array.isArray(value) ? value.join(', ') : ''}
      onChange={(e) => {
        const values = e.target.value.split(',').map((item) => item.trim()).filter(Boolean);
        change?.({ value: values });
      }}
    />
  )
}));

describe('EditProfileResume Keywords Accessibility', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      if (url === '/api/users/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            user: {},
            profile: {}
          })
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('connects keywords input to screen-reader instructions', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords');
    const instructions = screen.getByText(/add job skills, job titles, certifications, and tools\./i);
    const describedBy = keywordInput.getAttribute('aria-describedby') || '';

    expect(instructions).not.toBeNull();
    describedBy.split(' ').forEach((id) => {
      if (id) {
        expect(document.getElementById(id)).not.toBeNull();
      }
    });
  });

  test('updates keyword values through Syncfusion MultiSelect change handler', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords');

    fireEvent.change(keywordInput, { target: { value: 'JavaScript, React, JavaScript' } });

    await waitFor(() => {
      expect(keywordInput.value).toBe('JavaScript, React');
    });
  });

  test('announces keyword count updates in live region', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords');
    const liveRegion = screen.getByText('0 keywords selected.');

    fireEvent.change(keywordInput, { target: { value: 'Accessibility, Screen Reader' } });

    await waitFor(() => {
      expect(liveRegion.textContent).toContain('2 keywords selected.');
    });
  });
});
