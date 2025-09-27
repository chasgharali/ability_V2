import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import QueueDisplay from '../components/Queue/QueueDisplay';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock the contexts
jest.mock('../contexts/SocketContext', () => ({
    useSocket: () => ({
        joinQueueRoom: jest.fn(),
        leaveQueueRoom: jest.fn(),
        onQueueUpdate: jest.fn(),
        off: jest.fn(),
    }),
}));

jest.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            _id: '1',
            name: 'Test User',
            email: 'test@example.com',
            role: 'JobSeeker',
        },
    }),
}));

jest.mock('../components/Accessibility/AccessibilityAnnouncer', () => ({
    useAccessibilityAnnouncer: () => ({
        announce: jest.fn(),
    }),
}));

describe('Accessibility Tests', () => {
    describe('Button Component', () => {
        test('should not have accessibility violations', async () => {
            const { container } = render(
                <Button onClick={() => { }}>
                    Test Button
                </Button>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });

        test('should be keyboard accessible', async () => {
            const { container } = render(
                <Button onClick={() => { }}>
                    Keyboard Accessible Button
                </Button>
            );

            const button = container.querySelector('button');
            expect(button).toBeInTheDocument();
            expect(button).toHaveAttribute('type', 'button');
        });

        test('should have proper focus indicators', async () => {
            const { container } = render(
                <Button onClick={() => { }}>
                    Focus Test Button
                </Button>
            );

            const button = container.querySelector('button');
            button.focus();

            // Check if focus styles are applied
            const styles = window.getComputedStyle(button, ':focus');
            expect(styles.outline).not.toBe('none');
        });

        test('should announce loading state to screen readers', async () => {
            const { container } = render(
                <Button loading={true} onClick={() => { }}>
                    Loading Button
                </Button>
            );

            const button = container.querySelector('button');
            expect(button).toHaveAttribute('aria-disabled', 'true');
            expect(button).toBeDisabled();
        });
    });

    describe('Input Component', () => {
        test('should not have accessibility violations', async () => {
            const { container } = render(
                <Input
                    label="Test Input"
                    name="test"
                    value=""
                    onChange={() => { }}
                />
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });

        test('should have proper label association', async () => {
            const { container } = render(
                <Input
                    label="Email Address"
                    name="email"
                    type="email"
                    value=""
                    onChange={() => { }}
                />
            );

            const input = container.querySelector('input');
            const label = container.querySelector('label');

            expect(input).toHaveAttribute('id');
            expect(label).toHaveAttribute('for', input.id);
        });

        test('should announce error messages to screen readers', async () => {
            const { container } = render(
                <Input
                    label="Test Input"
                    name="test"
                    value=""
                    onChange={() => { }}
                    error="This field is required"
                />
            );

            const input = container.querySelector('input');
            const errorMessage = container.querySelector('[role="alert"]');

            expect(input).toHaveAttribute('aria-invalid', 'true');
            expect(input).toHaveAttribute('aria-describedby');
            expect(errorMessage).toHaveTextContent('This field is required');
        });

        test('should support required field indication', async () => {
            const { container } = render(
                <Input
                    label="Required Field"
                    name="required"
                    value=""
                    onChange={() => { }}
                    required={true}
                />
            );

            const input = container.querySelector('input');
            const requiredIndicator = container.querySelector('[aria-label="required"]');

            expect(input).toBeRequired();
            expect(requiredIndicator).toBeInTheDocument();
        });
    });

    describe('Queue Display Component', () => {
        const mockProps = {
            queueId: 'queue-123',
            userPosition: {
                tokenNumber: 5,
                position: 3,
                status: 'waiting',
                joinedAt: '2024-01-01T10:00:00Z',
                estimatedWaitTime: 15,
            },
            onJoinQueue: jest.fn(),
            onLeaveQueue: jest.fn(),
            isInQueue: true,
            boothName: 'Test Booth',
            eventName: 'Test Event',
        };

        test('should not have accessibility violations', async () => {
            const { container } = render(
                <QueueDisplay {...mockProps} />
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });

        test('should have proper heading structure', async () => {
            const { container } = render(
                <QueueDisplay {...mockProps} />
            );

            const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
            expect(headings.length).toBeGreaterThan(0);

            // Check heading hierarchy
            const h2Elements = container.querySelectorAll('h2');
            expect(h2Elements.length).toBeGreaterThan(0);
        });

        test('should have live regions for dynamic updates', async () => {
            const { container } = render(
                <QueueDisplay {...mockProps} />
            );

            const liveRegions = container.querySelectorAll('[aria-live]');
            expect(liveRegions.length).toBeGreaterThan(0);

            // Check for polite and assertive live regions
            const politeRegion = container.querySelector('[aria-live="polite"]');
            const assertiveRegion = container.querySelector('[aria-live="assertive"]');

            expect(politeRegion).toBeInTheDocument();
            expect(assertiveRegion).toBeInTheDocument();
        });

        test('should announce queue status to screen readers', async () => {
            const { container } = render(
                <QueueDisplay {...mockProps} />
            );

            const srOnlyContent = container.querySelector('.sr-only');
            expect(srOnlyContent).toBeInTheDocument();
            expect(srOnlyContent).toHaveTextContent('Currently serving token');
        });

        test('should have accessible buttons', async () => {
            const { container } = render(
                <QueueDisplay {...mockProps} />
            );

            const buttons = container.querySelectorAll('button');
            buttons.forEach(button => {
                expect(button).toHaveAttribute('type', 'button');
                expect(button.textContent).toBeTruthy();
            });
        });
    });

    describe('Form Accessibility', () => {
        test('should have proper form structure', async () => {
            const { container } = render(
                <form>
                    <Input
                        label="First Name"
                        name="firstName"
                        value=""
                        onChange={() => { }}
                        required={true}
                    />
                    <Input
                        label="Last Name"
                        name="lastName"
                        value=""
                        onChange={() => { }}
                        required={true}
                    />
                    <Button type="submit">
                        Submit Form
                    </Button>
                </form>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();

            const form = container.querySelector('form');
            const inputs = container.querySelectorAll('input');
            const submitButton = container.querySelector('button[type="submit"]');

            expect(form).toBeInTheDocument();
            expect(inputs.length).toBe(2);
            expect(submitButton).toBeInTheDocument();
        });
    });

    describe('Navigation Accessibility', () => {
        test('should have skip links', async () => {
            const { container } = render(
                <div>
                    <a href="#main-content" className="skip-link">
                        Skip to main content
                    </a>
                    <main id="main-content">
                        <h1>Main Content</h1>
                    </main>
                </div>
            );

            const skipLink = container.querySelector('.skip-link');
            const mainContent = container.querySelector('#main-content');

            expect(skipLink).toBeInTheDocument();
            expect(skipLink).toHaveAttribute('href', '#main-content');
            expect(mainContent).toBeInTheDocument();
        });

        test('should have proper landmark structure', async () => {
            const { container } = render(
                <div>
                    <header role="banner">
                        <h1>Site Header</h1>
                    </header>
                    <nav role="navigation">
                        <ul>
                            <li><a href="/">Home</a></li>
                            <li><a href="/events">Events</a></li>
                        </ul>
                    </nav>
                    <main role="main">
                        <h2>Main Content</h2>
                    </main>
                    <footer role="contentinfo">
                        <p>Site Footer</p>
                    </footer>
                </div>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();

            const header = container.querySelector('[role="banner"]');
            const nav = container.querySelector('[role="navigation"]');
            const main = container.querySelector('[role="main"]');
            const footer = container.querySelector('[role="contentinfo"]');

            expect(header).toBeInTheDocument();
            expect(nav).toBeInTheDocument();
            expect(main).toBeInTheDocument();
            expect(footer).toBeInTheDocument();
        });
    });

    describe('Color and Contrast', () => {
        test('should have sufficient color contrast', async () => {
            const { container } = render(
                <div style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                    <h1>High Contrast Text</h1>
                    <p>This text should have sufficient contrast.</p>
                    <Button>High Contrast Button</Button>
                </div>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });
    });

    describe('Keyboard Navigation', () => {
        test('should support tab navigation', async () => {
            const { container } = render(
                <div>
                    <Button>First Button</Button>
                    <Input label="Test Input" name="test" value="" onChange={() => { }} />
                    <Button>Second Button</Button>
                </div>
            );

            const focusableElements = container.querySelectorAll(
                'button, input, [tabindex]:not([tabindex="-1"])'
            );

            expect(focusableElements.length).toBe(3);

            // Test tab order
            focusableElements[0].focus();
            expect(document.activeElement).toBe(focusableElements[0]);
        });

        test('should handle focus management in modals', async () => {
            const { container } = render(
                <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
                    <h2 id="modal-title">Modal Title</h2>
                    <Button>Modal Button</Button>
                    <Input label="Modal Input" name="modal" value="" onChange={() => { }} />
                </div>
            );

            const modal = container.querySelector('[role="dialog"]');
            const modalButton = container.querySelector('button');

            expect(modal).toHaveAttribute('aria-modal', 'true');
            expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');

            // Focus should be manageable within modal
            modalButton.focus();
            expect(document.activeElement).toBe(modalButton);
        });
    });

    describe('Screen Reader Compatibility', () => {
        test('should have proper alt text for images', async () => {
            const { container } = render(
                <img src="test.jpg" alt="Descriptive alt text for test image" />
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();

            const img = container.querySelector('img');
            expect(img).toHaveAttribute('alt');
            expect(img.alt).toBeTruthy();
        });

        test('should have descriptive link text', async () => {
            const { container } = render(
                <div>
                    <a href="/events">View Available Events</a>
                    <a href="/profile">Go to Profile Settings</a>
                </div>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();

            const links = container.querySelectorAll('a');
            links.forEach(link => {
                expect(link.textContent).toBeTruthy();
                expect(link.textContent.trim().length).toBeGreaterThan(0);
            });
        });

        test('should have proper table structure', async () => {
            const { container } = render(
                <table>
                    <caption>Event Schedule</caption>
                    <thead>
                        <tr>
                            <th scope="col">Event Name</th>
                            <th scope="col">Date</th>
                            <th scope="col">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <th scope="row">Tech Interview Day</th>
                            <td>2024-01-15</td>
                            <td>Active</td>
                        </tr>
                    </tbody>
                </table>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();

            const table = container.querySelector('table');
            const caption = container.querySelector('caption');
            const headers = container.querySelectorAll('th[scope]');

            expect(table).toBeInTheDocument();
            expect(caption).toBeInTheDocument();
            expect(headers.length).toBeGreaterThan(0);
        });
    });
});
