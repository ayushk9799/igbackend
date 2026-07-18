import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { createUserVersionReportHtml } from './lib/userVersionReportHtml.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
dotenv.config({ path: path.join(projectDirectory, '.env') });

// Matches the connection fallback currently used by server.js and existing scripts.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

const outputArgument = process.argv.find(argument => argument.startsWith('--output-dir='));
const outputDirectory = outputArgument
    ? path.resolve(process.cwd(), outputArgument.slice('--output-dir='.length))
    : path.join(projectDirectory, 'reports');

const toIsoString = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const csvEscape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const normalizePlatform = (value) => {
    const platform = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ['ios', 'android', 'web'].includes(platform) ? platform : 'unknown';
};

const getMissingFields = (user, platform) => {
    const missing = [];
    if (platform === 'unknown') missing.push('platform');
    if (typeof user.appVersion !== 'string' || !user.appVersion.trim()) missing.push('appVersion');
    if (!Number.isFinite(user.appBuildNumber) || user.appBuildNumber <= 0) missing.push('appBuildNumber');
    if (!user.deviceInfoUpdatedAt) missing.push('deviceInfoUpdatedAt');
    return missing;
};

const createUserRow = (user) => {
    const platform = normalizePlatform(user.platform);
    const missingFields = getMissingFields(user, platform);

    return {
        userId: user._id.toString(),
        name: user.name || '',
        email: user.email || '',
        platform,
        appVersion: typeof user.appVersion === 'string' ? user.appVersion.trim() : '',
        appBuildNumber: Number.isFinite(user.appBuildNumber) ? user.appBuildNumber : '',
        deviceInfoUpdatedAt: toIsoString(user.deviceInfoUpdatedAt),
        metadataComplete: missingFields.length === 0,
        missingFields,
        hasFcmToken: Boolean(user.fcmToken),
        isPaired: Boolean(user.partnerId),
        isOnline: Boolean(user.isOnline),
        lastSeen: toIsoString(user.lastSeen),
        createdAt: toIsoString(user.createdAt),
        updatedAt: toIsoString(user.updatedAt),
    };
};

const createSummary = (rows) => {
    const byPlatform = {};
    const versionCounts = new Map();
    const missing = {
        anyVersionMetadata: 0,
        platform: 0,
        appVersion: 0,
        appBuildNumber: 0,
        deviceInfoUpdatedAt: 0,
        fcmToken: 0,
    };

    for (const row of rows) {
        byPlatform[row.platform] ??= {
            total: 0,
            metadataComplete: 0,
            missingAppVersion: 0,
            missingAppBuildNumber: 0,
            withFcmToken: 0,
        };
        const platformSummary = byPlatform[row.platform];
        platformSummary.total += 1;
        if (row.metadataComplete) platformSummary.metadataComplete += 1;
        if (row.missingFields.includes('appVersion')) platformSummary.missingAppVersion += 1;
        if (row.missingFields.includes('appBuildNumber')) platformSummary.missingAppBuildNumber += 1;
        if (row.hasFcmToken) platformSummary.withFcmToken += 1;

        if (row.missingFields.length > 0) missing.anyVersionMetadata += 1;
        for (const field of row.missingFields) missing[field] += 1;
        if (!row.hasFcmToken) missing.fcmToken += 1;

        const versionKey = JSON.stringify([row.platform, row.appVersion || 'missing', row.appBuildNumber || 'missing']);
        versionCounts.set(versionKey, (versionCounts.get(versionKey) || 0) + 1);
    }

    const versions = [...versionCounts.entries()]
        .map(([key, count]) => {
            const [platform, appVersion, appBuildNumber] = JSON.parse(key);
            return { platform, appVersion, appBuildNumber, count };
        })
        .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));

    return {
        generatedAt: new Date().toISOString(),
        totalUsers: rows.length,
        metadataComplete: rows.filter(row => row.metadataComplete).length,
        withFcmToken: rows.filter(row => row.hasFcmToken).length,
        pairedUsers: rows.filter(row => row.isPaired).length,
        missing,
        byPlatform,
        versions,
    };
};

const createCsv = (rows) => {
    const columns = [
        'userId',
        'name',
        'email',
        'platform',
        'appVersion',
        'appBuildNumber',
        'deviceInfoUpdatedAt',
        'metadataComplete',
        'missingFields',
        'hasFcmToken',
        'isPaired',
        'isOnline',
        'lastSeen',
        'createdAt',
        'updatedAt',
    ];

    const lines = [columns.join(',')];
    for (const row of rows) {
        lines.push(columns.map(column => {
            const value = column === 'missingFields' ? row.missingFields.join('|') : row[column];
            return csvEscape(value);
        }).join(','));
    }
    return `${lines.join('\n')}\n`;
};

const run = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        const users = await User.find({})
            .select('_id name email platform appVersion appBuildNumber deviceInfoUpdatedAt fcmToken partnerId isOnline lastSeen createdAt updatedAt')
            .sort({ createdAt: 1 })
            .lean();

        const rows = users.map(createUserRow);
        const summary = createSummary(rows);
        const timestamp = summary.generatedAt.replaceAll(':', '-').replaceAll('.', '-');

        await fs.mkdir(outputDirectory, { recursive: true });
        const jsonPath = path.join(outputDirectory, `user-version-report-${timestamp}.json`);
        const csvPath = path.join(outputDirectory, `user-version-report-${timestamp}.csv`);
        const htmlPath = path.join(outputDirectory, `user-version-report-${timestamp}.html`);
        const report = { summary, users: rows };

        await Promise.all([
            fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
            fs.writeFile(csvPath, createCsv(rows), 'utf8'),
            fs.writeFile(htmlPath, createUserVersionReportHtml(report), 'utf8'),
        ]);

        console.log(JSON.stringify(summary, null, 2));
        console.log(`JSON report: ${jsonPath}`);
        console.log(`CSV report: ${csvPath}`);
        console.log(`HTML dashboard: ${htmlPath}`);
    } finally {
        await mongoose.disconnect();
    }
};

run().catch(error => {
    console.error('Failed to generate user version report:', error.message);
    process.exitCode = 1;
});
