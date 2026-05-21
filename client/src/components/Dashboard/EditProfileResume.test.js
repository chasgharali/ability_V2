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
  MultiSelectComponent: ({ id, 'aria-labelledby': ariaLabelledBy, placeholder }) => (
    <input
      id={id}
      aria-labelledby={ariaLabelledBy}
      placeholder={placeholder}
      onChange={() => {}}
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

  test('supports arrow-key navigation and removal for keyword chips', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords');

    fireEvent.change(keywordInput, { target: { value: 'JavaScript' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });

    fireEvent.change(keywordInput, { target: { value: 'React' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });

    await screen.findByRole('button', { name: 'Remove React' });
    expect(screen.getByRole('button', { name: 'Remove JavaScript' })).not.toBeNull();

    fireEvent.keyDown(keywordInput, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove React' }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove React' }), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove JavaScript' }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove JavaScript' }), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove React' }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove React' }), { key: 'Delete' });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove React' })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove JavaScript' }));
    });
  });

  test('announces keyword add and remove updates in live region', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords');
    const liveRegion = screen.getByText('0 keywords added.');

    fireEvent.change(keywordInput, { target: { value: 'Accessibility' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });

    await waitFor(() => {
      expect(liveRegion.textContent).toContain('Added keyword Accessibility. 1 total keywords.');
    });

    fireEvent.keyDown(keywordInput, { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove Accessibility' }), { key: 'Backspace' });

    await waitFor(() => {
      expect(liveRegion.textContent).toContain('Removed keyword Accessibility. 0 total keywords.');
    });
  });
});
