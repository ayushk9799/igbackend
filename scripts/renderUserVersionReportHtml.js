import fs from 'node:fs/promises';
import path from 'node:path';
import { createUserVersionReportHtml } from './lib/userVersionReportHtml.js';

const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;

if (!inputPath) {
    console.error('Usage: npm run report:user-versions:html -- reports/user-version-report-....json');
    process.exit(1);
}

try {
    const report = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    if (!report?.summary || !Array.isArray(report?.users)) {
        throw new Error('Expected a report containing summary and users');
    }

    const outputPath = inputPath.toLowerCase().endsWith('.json')
        ? `${inputPath.slice(0, -5)}.html`
        : `${inputPath}.html`;

    await fs.writeFile(outputPath, createUserVersionReportHtml(report), 'utf8');
    console.log(`HTML dashboard: ${outputPath}`);
} catch (error) {
    console.error('Failed to render user version report:', error.message);
    process.exitCode = 1;
}
