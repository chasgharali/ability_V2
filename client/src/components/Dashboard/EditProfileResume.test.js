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

describe('EditProfileResume Accessibility', () => {
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

    const keywordInput = await screen.findByLabelText('* Keywords (Skills and Experience)');
    const instructions = screen.getByText(/enter keywords and press enter after each keyword entry/i);
    const describedBy = keywordInput.getAttribute('aria-describedby') || '';

    expect(instructions).not.toBeNull();
    expect(describedBy).toContain('keyword-input-instructions');
    expect(describedBy).toContain('keyword-input-status');
  });

  test('updates keyword values through Syncfusion MultiSelect change handler', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords (Skills and Experience)');

    fireEvent.change(keywordInput, { target: { value: 'JavaScript, React, JavaScript' } });

    await waitFor(() => {
      expect(keywordInput.value).toBe('JavaScript, React');
    });
  });

  test('announces keyword count updates in live region', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const keywordInput = await screen.findByLabelText('* Keywords (Skills and Experience)');
    const liveRegion = screen.getByText('0 keywords selected.');

    fireEvent.change(keywordInput, { target: { value: 'Accessibility, Screen Reader' } });

    await waitFor(() => {
      expect(liveRegion.textContent).toContain('2 keywords selected.');
    });
  });

  test.each([
    {
      label: '* Primary Job Experience (maximum 2)',
      instructionText: 'Select one or two Primary Job Experience',
      instructionsId: 'primaryExperience-instructions',
    },
    {
      label: '* Employment Types',
      instructionText: 'Select one or more Employment Types',
      instructionsId: 'employmentTypes-instructions',
    },
    {
      label: '* Language(s)',
      instructionText: 'Select one or more Language(s)',
      instructionsId: 'languages-instructions',
    },
  ])('connects $label combobox to screen-reader instructions', async ({ label, instructionText, instructionsId }) => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const combobox = await screen.findByLabelText(label);
    const instructions = screen.getByText(instructionText);
    const describedBy = combobox.getAttribute('aria-describedby') || '';

    expect(instructions.className).toContain('sr-only');
    expect(describedBy).toContain(instructionsId);
  });

  test('wires resume upload button to helper text and status region', async () => {
    render(<EditProfileResume embedded onValidationChange={jest.fn()} />);

    const uploadButton = await screen.findByRole('button', { name: /choose file to upload/i });
    const uploadHelpText = screen.getByText(/accepted file types: pdf and doc/i);
    const statusRegion = screen.getByRole('status');
    const describedBy = uploadButton.getAttribute('aria-describedby') || '';

    expect(uploadButton.getAttribute('aria-required')).toBe('true');
    expect(uploadHelpText).not.toBeNull();
    expect(statusRegion).not.toBeNull();
    expect(describedBy).toContain('resume-file-types');
    expect(describedBy).toContain('resume-file-status');
  });

  test('renders inline resume error and marks upload control invalid', async () => {
    render(
      <EditProfileResume
        embedded
        onValidationChange={jest.fn()}
        resumeError="Resume upload is required"
      />
    );

    const uploadButton = await screen.findByRole('button', { name: /choose file to upload/i });
    const errorMessage = screen.getByText('Resume upload is required');
    const describedBy = uploadButton.getAttribute('aria-describedby') || '';

    expect(errorMessage.getAttribute('role')).toBe('alert');
    expect(describedBy).toContain('resume-upload-error');
  });
});
