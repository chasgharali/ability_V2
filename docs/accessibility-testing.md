# Accessibility Testing Guide - Ability V2

This guide provides comprehensive accessibility testing procedures to ensure WCAG 2.1 AA compliance for the Ability V2 video interview platform.

## Testing Overview

### WCAG 2.1 AA Compliance Targets
- **Perceivable**: Information must be presentable in ways users can perceive
- **Operable**: Interface components must be operable
- **Understandable**: Information and UI operation must be understandable
- **Robust**: Content must be robust enough for various assistive technologies

### Testing Levels
1. **Automated Testing**: Tools and scripts for continuous validation
2. **Manual Testing**: Human evaluation of accessibility features
3. **Assistive Technology Testing**: Testing with screen readers and other AT
4. **User Testing**: Testing with actual users with disabilities

## Automated Testing

### 1. axe-core Integration

#### Installation
```bash
npm install --save-dev @axe-core/react jest-axe
```

#### React Testing Library Integration
```javascript
// src/setupTests.js
import { toHaveNoViolations } from 'jest-axe';
import 'jest-axe/extend-expect';

expect.extend(toHaveNoViolations);
```

#### Component Testing Example
```javascript
// src/components/__tests__/Button.test.js
import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import Button from '../Button';

expect.extend(toHaveNoViolations);

test('Button should not have accessibility violations', async () => {
  const { container } = render(
    <Button onClick={() => {}}>
      Test Button
    </Button>
  );
  
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

#### Page Testing Example
```javascript
// src/pages/__tests__/LoginPage.test.js
import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import LoginPage from '../LoginPage';

test('Login page should not have accessibility violations', async () => {
  const { container } = render(<LoginPage />);
  
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### 2. Lighthouse CI Integration

#### Installation
```bash
npm install --save-dev @lhci/cli
```

#### Configuration (.lighthouserc.js)
```javascript
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

#### GitHub Actions Integration
```yaml
# .github/workflows/accessibility.yml
name: Accessibility Testing

on: [push, pull_request]

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
      
      - name: Run accessibility tests
        run: npm run test:accessibility
      
      - name: Run Lighthouse CI
        run: npx lhci autorun
```

### 3. Pa11y Testing

#### Installation
```bash
npm install --save-dev pa11y pa11y-ci
```

#### Configuration (.pa11yci)
```json
{
  "defaults": {
    "timeout": 10000,
    "wait": 2000,
    "standard": "WCAG2AA"
  },
  "urls": [
    "http://localhost:3000",
    "http://localhost:3000/login",
    "http://localhost:3000/register",
    "http://localhost:3000/events",
    "http://localhost:3000/queue/123"
  ]
}
```

## Manual Testing Procedures

### 1. Keyboard Navigation Testing

#### Test Procedure
1. **Tab Navigation**: Use Tab key to navigate through all interactive elements
2. **Shift+Tab**: Navigate backwards through elements
3. **Enter/Space**: Activate buttons and links
4. **Arrow Keys**: Navigate within components (dropdowns, lists)
5. **Escape**: Close modals and dropdowns
6. **Focus Indicators**: Verify visible focus indicators

#### Test Checklist
- [ ] All interactive elements are reachable via keyboard
- [ ] Tab order is logical and intuitive
- [ ] Focus indicators are clearly visible
- [ ] No keyboard traps
- [ ] Skip links work properly
- [ ] Modal focus management works
- [ ] Form navigation is logical

#### Test Script
```javascript
// Manual keyboard testing script
const keyboardTest = {
  // Test tab navigation
  testTabNavigation: () => {
    const focusableElements = document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    focusableElements.forEach((element, index) => {
      element.focus();
      console.log(`Element ${index}:`, element.tagName, element.textContent);
    });
  },
  
  // Test focus indicators
  testFocusIndicators: () => {
    const elements = document.querySelectorAll('*');
    elements.forEach(element => {
      element.focus();
      const styles = window.getComputedStyle(element, ':focus');
      if (styles.outline === 'none' && !styles.boxShadow) {
        console.warn('Element lacks focus indicator:', element);
      }
    });
  }
};
```

### 2. Screen Reader Testing

#### NVDA Testing (Windows)

**Setup:**
1. Download and install NVDA from https://www.nvaccess.org/
2. Use Chrome or Firefox browser
3. Enable NVDA and navigate to the application

**Test Procedure:**
1. **Page Structure**: Use H key to navigate headings
2. **Landmarks**: Use D key to navigate landmarks
3. **Links**: Use K key to navigate links
4. **Forms**: Use F key to navigate form fields
5. **Lists**: Use L key to navigate lists
6. **Tables**: Use T key to navigate tables

**Test Checklist:**
- [ ] Page title is announced correctly
- [ ] Headings are properly structured (H1, H2, H3, etc.)
- [ ] Form labels are associated with inputs
- [ ] Error messages are announced
- [ ] Live regions announce dynamic updates
- [ ] Images have appropriate alt text
- [ ] Links have descriptive text
- [ ] Tables have proper headers

#### JAWS Testing (Windows)

**Setup:**
1. Install JAWS screen reader
2. Use Internet Explorer or Chrome
3. Enable JAWS and navigate to the application

**Test Procedure:**
1. **Quick Navigation**: Use Q key for headings, L for links
2. **Forms Mode**: Use Enter to enter forms mode
3. **Table Navigation**: Use Ctrl+Alt+Arrow keys
4. **Landmarks**: Use semicolon key

#### VoiceOver Testing (macOS)

**Setup:**
1. Enable VoiceOver (Cmd+F5)
2. Use Safari browser
3. Navigate to the application

**Test Procedure:**
1. **Rotor**: Use Ctrl+Option+U to access rotor
2. **Headings**: Use Ctrl+Option+H
3. **Links**: Use Ctrl+Option+L
4. **Forms**: Use Ctrl+Option+F
5. **Landmarks**: Use Ctrl+Option+U then R

### 3. Color and Contrast Testing

#### Automated Tools
```bash
# Install color contrast analyzer
npm install --save-dev color-contrast-analyzer

# Test color contrast
npx color-contrast-analyzer --url http://localhost:3000
```

#### Manual Testing
1. **High Contrast Mode**: Test in Windows High Contrast mode
2. **Color Blindness**: Use Color Oracle or similar tools
3. **Contrast Ratios**: Use WebAIM Contrast Checker
4. **Grayscale**: Test in grayscale mode

#### Test Checklist
- [ ] Text contrast ratio is at least 4.5:1 (normal text)
- [ ] Large text contrast ratio is at least 3:1
- [ ] UI components have sufficient contrast
- [ ] Color is not the only means of conveying information
- [ ] Application works in high contrast mode
- [ ] Application works in grayscale

### 4. Zoom and Magnification Testing

#### Test Procedure
1. **Browser Zoom**: Test at 200%, 300%, 400% zoom levels
2. **System Magnification**: Test with system magnification tools
3. **Responsive Design**: Verify layout adapts to zoom levels
4. **Horizontal Scrolling**: Ensure no horizontal scrolling at 200% zoom

#### Test Checklist
- [ ] Content remains readable at 200% zoom
- [ ] No horizontal scrolling at 200% zoom
- [ ] Interactive elements remain accessible
- [ ] Layout adapts gracefully to zoom
- [ ] Text remains readable at high zoom levels

### 5. Reduced Motion Testing

#### CSS Media Query Test
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

#### Test Procedure
1. Enable reduced motion in system preferences
2. Navigate through the application
3. Verify animations are reduced or disabled
4. Test that functionality remains intact

## Assistive Technology Testing

### 1. Screen Reader Testing Matrix

| Feature | NVDA | JAWS | VoiceOver | TalkBack |
|---------|------|------|-----------|----------|
| Registration | ✅ | ✅ | ✅ | ✅ |
| Login | ✅ | ✅ | ✅ | ✅ |
| Event List | ✅ | ✅ | ✅ | ✅ |
| Queue Join | ✅ | ✅ | ✅ | ✅ |
| Queue Status | ✅ | ✅ | ✅ | ✅ |
| Video Call | ✅ | ✅ | ✅ | ✅ |
| Chat | ✅ | ✅ | ✅ | ✅ |
| File Upload | ✅ | ✅ | ✅ | ✅ |

### 2. Voice Control Testing

#### Dragon NaturallySpeaking (Windows)
1. Install Dragon NaturallySpeaking
2. Train the software for web navigation
3. Test voice commands for form filling
4. Test voice commands for navigation

#### Voice Control (macOS)
1. Enable Voice Control in System Preferences
2. Test voice commands for navigation
3. Test voice commands for form interaction

### 3. Switch Control Testing

#### iOS Switch Control
1. Enable Switch Control in Accessibility settings
2. Configure switches for navigation
3. Test navigation through the application

#### Android Switch Access
1. Enable Switch Access in Accessibility settings
2. Configure switches for navigation
3. Test navigation through the application

## User Testing

### 1. Recruiting Test Users

#### Target User Groups
- **Visual Impairments**: Users with blindness, low vision, color blindness
- **Motor Impairments**: Users with limited dexterity, tremors, paralysis
- **Cognitive Impairments**: Users with ADHD, dyslexia, memory issues
- **Hearing Impairments**: Users who are deaf or hard of hearing

#### Recruitment Methods
- Local disability organizations
- Accessibility testing services
- Online communities
- University accessibility programs

### 2. Testing Scenarios

#### Scenario 1: Job Seeker Registration and Queue Join
1. Navigate to registration page
2. Fill out registration form
3. Verify email confirmation
4. Browse available events
5. Join a booth queue
6. Monitor queue position
7. Leave queue with message

#### Scenario 2: Recruiter Dashboard and Call Management
1. Login to recruiter dashboard
2. View active queues
3. Serve next person in queue
4. Initiate video call
5. Request interpreter
6. Conduct interview
7. Submit feedback

#### Scenario 3: Interpreter Support
1. Receive interpreter request notification
2. Accept interpreter request
3. Join video call
4. Provide interpretation services
5. Leave call when complete

### 3. Testing Metrics

#### Success Criteria
- **Task Completion Rate**: >95% for all user groups
- **Error Rate**: <5% for all user groups
- **Time to Complete**: Within 2x of sighted users
- **User Satisfaction**: >4.0/5.0 rating

#### Data Collection
- Screen recordings (with permission)
- Think-aloud protocols
- Post-test interviews
- Usability questionnaires
- Error logs and analytics

## Continuous Accessibility Monitoring

### 1. Automated Monitoring

#### Daily Checks
```bash
# Run accessibility tests in CI/CD
npm run test:accessibility

# Check for new accessibility issues
npm run audit:accessibility
```

#### Weekly Reports
- Lighthouse accessibility scores
- axe-core violation reports
- Color contrast analysis
- Keyboard navigation tests

### 2. Manual Monitoring

#### Monthly Reviews
- Screen reader testing
- Keyboard navigation testing
- Color and contrast review
- User feedback analysis

#### Quarterly Assessments
- Full accessibility audit
- User testing sessions
- Assistive technology updates
- Compliance review

### 3. Issue Tracking

#### Accessibility Issue Template
```markdown
## Accessibility Issue Report

**Issue ID**: ACC-001
**Severity**: High/Medium/Low
**WCAG Level**: A/AA/AAA
**WCAG Criteria**: 1.1.1, 1.4.3, etc.

**Description**:
Brief description of the accessibility issue

**Steps to Reproduce**:
1. Navigate to...
2. Use screen reader to...
3. Observe that...

**Expected Behavior**:
What should happen for accessibility

**Actual Behavior**:
What actually happens

**Assistive Technology**:
- Screen Reader: NVDA/JAWS/VoiceOver
- Browser: Chrome/Firefox/Safari
- OS: Windows/macOS/Linux

**Impact**:
How this affects users with disabilities

**Proposed Solution**:
Suggested fix for the issue
```

## Testing Tools and Resources

### 1. Automated Testing Tools
- **axe-core**: Comprehensive accessibility testing
- **Lighthouse**: Google's accessibility auditing
- **Pa11y**: Command-line accessibility testing
- **WAVE**: Web accessibility evaluation
- **Tenon**: API-based accessibility testing

### 2. Manual Testing Tools
- **Color Oracle**: Color blindness simulation
- **WebAIM Contrast Checker**: Color contrast analysis
- **Keyboard Navigation Tester**: Keyboard accessibility testing
- **Screen Reader Testing Tools**: Various screen reader simulators

### 3. Browser Extensions
- **axe DevTools**: Browser extension for axe-core
- **WAVE**: Web accessibility evaluation extension
- **Color Contrast Analyzer**: Contrast checking extension
- **Accessibility Insights**: Microsoft's accessibility testing tool

### 4. Screen Readers
- **NVDA**: Free Windows screen reader
- **JAWS**: Commercial Windows screen reader
- **VoiceOver**: Built-in macOS screen reader
- **TalkBack**: Built-in Android screen reader
- **Narrator**: Built-in Windows screen reader

## Compliance Documentation

### 1. Accessibility Statement

Create an accessibility statement that includes:
- Commitment to accessibility
- WCAG compliance level
- Known limitations
- Contact information for accessibility issues
- Testing methods used

### 2. VPAT (Voluntary Product Accessibility Template)

Create a VPAT documenting:
- WCAG 2.1 AA compliance
- Section 508 compliance
- EN 301 549 compliance
- Testing methods and results

### 3. Testing Reports

Maintain documentation of:
- Automated testing results
- Manual testing results
- User testing results
- Issue resolution tracking
- Compliance audit reports

## Best Practices

### 1. Development Process
- Include accessibility in design phase
- Test early and often
- Use semantic HTML
- Implement ARIA properly
- Test with real assistive technologies

### 2. Testing Process
- Test with multiple screen readers
- Test with keyboard only
- Test with high contrast mode
- Test with zoom at 200%
- Test with reduced motion

### 3. Maintenance Process
- Regular accessibility audits
- Monitor for new issues
- Update testing procedures
- Train development team
- Stay current with accessibility standards

This comprehensive accessibility testing guide ensures that the Ability V2 platform meets WCAG 2.1 AA standards and provides an excellent experience for all users, including those with disabilities.
