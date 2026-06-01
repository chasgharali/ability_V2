import { getAdminResume, getAdminResumeFileUrl } from '../services/resumes';

function buildResumeHtml(resume) {
  const c = resume.content || {};
  const title = resume.title || 'Resume';

  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const contactParts = [c.email, c.phone, c.location, c.linkedIn, c.website].filter(Boolean);

  const experienceHtml = (c.experience || []).map(exp => `
    <div class="entry">
      <div class="entry-header">
        <strong>${esc(exp.title)}</strong>
        <span>${esc(exp.company)}${exp.location ? ` &mdash; ${esc(exp.location)}` : ''}</span>
        <span class="dates">${esc(exp.startDate)}${exp.startDate && (exp.endDate || exp.current) ? ' &ndash; ' : ''}${exp.current ? 'Present' : esc(exp.endDate)}</span>
      </div>
      ${(exp.bullets || []).filter(Boolean).length ? `<ul>${exp.bullets.filter(Boolean).map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    </div>`).join('');

  const educationHtml = (c.education || []).map(edu => `
    <div class="entry">
      <div class="entry-header">
        <strong>${esc(edu.degree)}${edu.field ? ` in ${esc(edu.field)}` : ''}</strong>
        <span>${esc(edu.institution)}</span>
        <span class="dates">${esc(edu.graduationDate)}</span>
      </div>
      ${edu.gpa ? `<p>GPA: ${esc(edu.gpa)}</p>` : ''}
    </div>`).join('');

  const certsHtml = (c.certifications || []).filter(x => x.name).map(cert => `
    <div class="entry">
      <strong>${esc(cert.name)}</strong>${cert.issuer ? ` &mdash; ${esc(cert.issuer)}` : ''}${cert.date ? `<span class="dates"> ${esc(cert.date)}</span>` : ''}
    </div>`).join('');

  const customSectionsHtml = (c.customSections || []).filter(s => s.title).map(sec => `
    <section>
      <h2>${esc(sec.title)}</h2>
      <p style="white-space:pre-wrap">${esc(sec.content)}</p>
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 1.8rem; margin: 0 0 4px; }
    .contact { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.85rem; color: #555; margin-bottom: 20px; }
    h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 24px 0 10px; color: #333; }
    .entry { margin-bottom: 12px; }
    .entry-header { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: baseline; }
    .dates { font-size: 0.82rem; color: #666; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { margin-bottom: 3px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${esc(c.name || title)}</h1>
  ${contactParts.length ? `<div class="contact">${contactParts.map(p => `<span>${esc(p)}</span>`).join('')}</div>` : ''}
  ${c.summary ? `<section><h2>Professional Summary</h2><p>${esc(c.summary)}</p></section>` : ''}
  ${experienceHtml ? `<section><h2>Experience</h2>${experienceHtml}</section>` : ''}
  ${educationHtml ? `<section><h2>Education</h2>${educationHtml}</section>` : ''}
  ${(c.skills || []).filter(Boolean).length ? `<section><h2>Skills</h2><p>${(c.skills).filter(Boolean).map(esc).join(' &middot; ')}</p></section>` : ''}
  ${(c.languages || []).filter(Boolean).length ? `<section><h2>Languages</h2><p>${(c.languages).filter(Boolean).map(esc).join(' &middot; ')}</p></section>` : ''}
  ${certsHtml ? `<section><h2>Certifications</h2>${certsHtml}</section>` : ''}
  ${(c.awards || []).filter(Boolean).length ? `<section><h2>Awards &amp; Honors</h2><ul>${(c.awards).filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('')}</ul></section>` : ''}
  ${customSectionsHtml}
</body>
</html>`;
}

export async function openResumeInNewTab(resumeId, resumeUrl) {
  if (resumeId) {
    // Open window synchronously (must happen before any await or browser blocks it)
    const win = window.open('', '_blank');
    if (win) {
      win.document.write('<html><body style="font-family:sans-serif;padding:40px">Loading resume…</body></html>');
    }
    try {
      const data = await getAdminResume(resumeId);
      const html = buildResumeHtml(data.resume);
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
      }
    } catch {
      if (win) win.close();
      alert('Failed to load resume.');
    }
    return;
  }
  if (resumeUrl) {
    // Open window synchronously first, then fetch fresh presigned URL
    const win = window.open('', '_blank');
    try {
      const freshUrl = await getAdminResumeFileUrl(resumeUrl);
      if (win) win.location.href = freshUrl;
    } catch {
      // Fallback to the original URL (can still work if it's already valid).
      if (win) {
        win.location.href = resumeUrl;
      } else {
        alert('Failed to generate resume download link.');
      }
    }
  }
}
