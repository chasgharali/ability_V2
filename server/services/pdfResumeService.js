const PDFDocument = require('pdfkit');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

// Match print CSS: padding 1.5cm top/bottom, 2cm left/right
const MARGIN_H = 57;  // 2cm ≈ 56.7pt
const MARGIN_T = 43;  // 1.5cm ≈ 42.5pt
const PAGE_W = 612;
const CONTENT_W = PAGE_W - MARGIN_H * 2; // 498pt

// Use Times (built-in serif) to match Georgia used in the HTML preview
const F_BODY = 'Times-Roman';
const F_BOLD = 'Times-Bold';
const F_ITALIC = 'Times-Italic';

function generateResumePdfBuffer(resume) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            margins: { top: MARGIN_T, bottom: MARGIN_T, left: MARGIN_H, right: MARGIN_H },
            size: 'LETTER'
        });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const c = resume.content || {};
        const name = (c.name || resume.title || 'Resume').toUpperCase();

        // ── HEADER ────────────────────────────────────────────────────────────
        // Matches .rb-doc-header h1: 18pt bold, centered, text-transform uppercase, letter-spacing 0.04em
        doc.fontSize(18).font(F_BOLD).fillColor('#111111')
            .text(name, MARGIN_H, MARGIN_T, { width: CONTENT_W, align: 'center', characterSpacing: 1.2 });

        // Matches .rb-doc-contact: 8.5pt, #444, centered, gap with bullets
        const contactParts = [c.email, c.phone, c.location, c.linkedIn, c.website].filter(Boolean);
        if (contactParts.length) {
            doc.moveDown(0.4).fontSize(8.5).font(F_BODY).fillColor('#444444')
                .text(contactParts.join('   •   '), MARGIN_H, doc.y, { width: CONTENT_W, align: 'center', lineGap: 3 });
        }

        // Matches .rb-doc-header border-bottom: 2px solid #111
        doc.moveDown(0.5);
        doc.moveTo(MARGIN_H, doc.y).lineTo(MARGIN_H + CONTENT_W, doc.y)
            .strokeColor('#111111').lineWidth(1.5).stroke();
        doc.moveDown(0.65);

        // ── HELPERS ───────────────────────────────────────────────────────────

        // Matches .rb-doc-section h2: 9pt bold uppercase, letter-spacing 0.08em, border-bottom 1px #888
        function sectionHeader(label) {
            doc.moveDown(1.5);
            doc.fontSize(9).font(F_BOLD).fillColor('#111111')
                .text(label.toUpperCase(), MARGIN_H, doc.y, { width: CONTENT_W, characterSpacing: 1.0 });
            const lineY = doc.y + 1;
            doc.moveTo(MARGIN_H, lineY).lineTo(MARGIN_H + CONTENT_W, lineY)
                .strokeColor('#888888').lineWidth(0.5).stroke();
            doc.moveDown(0.8).fillColor('#111111');
        }

        // Matches .rb-doc-entry-header (flex row): bold title + normal company on same line,
        // date pushed to the right via margin-left:auto.
        // PDFKit: write bold title with continued:true, append normal company inline,
        // then place date at explicit right coord using lineBreak:false.
        function entryRow(boldLeft, normalLeft, dateRight) {
            const DATE_W = 108;
            const LEFT_W = CONTENT_W - DATE_W - 8;
            const startY = doc.y;
            const hasCompany = normalLeft && normalLeft.trim();

            // Bold title (9.5pt), continued if there's a company to append inline
            if (boldLeft) {
                doc.fontSize(9.5).font(F_BOLD).fillColor('#111111')
                    .text(boldLeft, MARGIN_H, startY, { continued: !!hasCompany, width: LEFT_W });
            }

            // Normal company inline on same line (8.8pt, #444) — matches flex-row layout
            if (hasCompany) {
                doc.fontSize(8.8).font(F_BODY).fillColor('#444444')
                    .text(`   ${normalLeft}`, { continued: false });
            }

            const afterLeftY = doc.y;

            // Italic date right-aligned (8.5pt, #555) at startY — matches .rb-doc-dates
            if (dateRight && dateRight.trim()) {
                doc.fontSize(8.5).font(F_ITALIC).fillColor('#555555')
                    .text(dateRight, MARGIN_H + CONTENT_W - DATE_W, startY,
                        { width: DATE_W, align: 'right', lineBreak: false });
            }

            doc.fillColor('#111111');
            if (doc.y < afterLeftY) {
                doc.text('', MARGIN_H, afterLeftY);
            }
        }

        // ── SUMMARY ───────────────────────────────────────────────────────────
        if (c.summary) {
            sectionHeader('Professional Summary');
            // Matches .rb-doc-section p: 9.2pt, line-height 1.55
            doc.fontSize(9.2).font(F_BODY).fillColor('#111111')
                .text(c.summary, MARGIN_H, doc.y, { width: CONTENT_W, lineGap: 3.5 });
        }

        // ── EXPERIENCE ────────────────────────────────────────────────────────
        if ((c.experience || []).length) {
            sectionHeader('Experience');
            c.experience.forEach((exp, i) => {
                if (i > 0) doc.moveDown(1.2);
                const dateStr = [exp.startDate, exp.current ? 'Present' : exp.endDate]
                    .filter(Boolean).join(' – ');
                const subtitle = exp.company
                    ? `${exp.company}${exp.location ? `  —  ${exp.location}` : ''}`
                    : '';
                entryRow(exp.title || '', subtitle, dateStr);
                // Matches .rb-doc-section ul: 9pt, margin-left 1.2rem ≈ 12pt
                (exp.bullets || []).filter(Boolean).forEach(b => {
                    doc.fontSize(9).font(F_BODY).fillColor('#111111')
                        .text(`•  ${b}`, MARGIN_H + 12, doc.y, { width: CONTENT_W - 12, lineGap: 2.5 });
                });
            });
        }

        // ── EDUCATION ─────────────────────────────────────────────────────────
        if ((c.education || []).length) {
            sectionHeader('Education');
            c.education.forEach((edu, i) => {
                if (i > 0) doc.moveDown(1.0);
                const degree = [edu.degree, edu.field ? `in ${edu.field}` : '']
                    .filter(Boolean).join(' ');
                entryRow(
                    degree || edu.institution || '',
                    degree && edu.institution ? edu.institution : '',
                    edu.graduationDate || ''
                );
                if (edu.gpa) {
                    doc.fontSize(8.5).font(F_BODY).fillColor('#555555')
                        .text(`GPA: ${edu.gpa}`, MARGIN_H + 12, doc.y);
                }
            });
        }

        // ── SKILLS ────────────────────────────────────────────────────────────
        const skills = (c.skills || []).filter(Boolean);
        if (skills.length) {
            sectionHeader('Skills');
            doc.fontSize(9.2).font(F_BODY).fillColor('#111111')
                .text(skills.join('  ·  '), MARGIN_H, doc.y, { width: CONTENT_W, lineGap: 3 });
        }

        // ── LANGUAGES ─────────────────────────────────────────────────────────
        const langs = (c.languages || []).filter(Boolean);
        if (langs.length) {
            sectionHeader('Languages');
            doc.fontSize(9.2).font(F_BODY).fillColor('#111111')
                .text(langs.join('  ·  '), MARGIN_H, doc.y, { width: CONTENT_W, lineGap: 3 });
        }

        // ── CERTIFICATIONS ────────────────────────────────────────────────────
        const certs = (c.certifications || []).filter(x => x.name);
        if (certs.length) {
            sectionHeader('Certifications');
            certs.forEach(cert => {
                const line = [
                    cert.name,
                    cert.issuer ? `— ${cert.issuer}` : '',
                    cert.date ? `(${cert.date})` : ''
                ].filter(Boolean).join('  ');
                doc.fontSize(9.2).font(F_BODY).fillColor('#111111')
                    .text(line, MARGIN_H, doc.y, { width: CONTENT_W, lineGap: 3 });
            });
        }

        // ── AWARDS ────────────────────────────────────────────────────────────
        const awards = (c.awards || []).filter(Boolean);
        if (awards.length) {
            sectionHeader('Awards & Honors');
            awards.forEach(a => {
                doc.fontSize(9).font(F_BODY).fillColor('#111111')
                    .text(`•  ${a}`, MARGIN_H + 12, doc.y, { width: CONTENT_W - 12, lineGap: 2 });
            });
        }

        // ── CUSTOM SECTIONS ───────────────────────────────────────────────────
        (c.customSections || []).filter(s => s.title).forEach(sec => {
            sectionHeader(sec.title);
            doc.fontSize(9.2).font(F_BODY).fillColor('#111111')
                .text(sec.content || '', MARGIN_H, doc.y, { width: CONTENT_W, lineGap: 3 });
        });

        doc.end();
    });
}

async function generateAndUploadResumePdf(resume, userId) {
    const pdfBuffer = await generateResumePdfBuffer(resume);
    const key = `resume/${userId}/generated/${Date.now()}_${resume._id}.pdf`;

    await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
    }).promise();

    const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return s3Url;
}

module.exports = { generateAndUploadResumePdf };
