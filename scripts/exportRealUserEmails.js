import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI is not defined in .env');
    process.exit(1);
}

// RFC 5322 compliant regex for practical email validation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Domains to exclude (Apple private relay, robot/test accounts)
const EXCLUDED_DOMAIN_SUFFIXES = [
    'privaterelay.appleid.com',
    'example.com',
    'cloudtestlabaccounts.com'
];

function isApplePrivateRelay(email) {
    const lower = email.toLowerCase();
    return lower.includes('privaterelay.appleid.com') || lower.endsWith('@appleid.com');
}

function isTestOrDummyAccount(email) {
    const lower = email.toLowerCase();
    return EXCLUDED_DOMAIN_SUFFIXES.some(suffix => lower.endsWith(`@${suffix}`));
}

async function exportEmails() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB successfully.');

        const usersCollection = mongoose.connection.collection('users');
        const users = await usersCollection.find(
            {},
            {
                projection: {
                    email: 1,
                    name: 1,
                    nickname: 1,
                    platform: 1,
                    preferredLanguage: 1,
                    createdAt: 1,
                    lastSeen: 1
                }
            }
        ).toArray();

        console.log(`Fetched ${users.length} total user records from database.`);

        const seenEmails = new Set();
        const validEmailsList = [];
        const validUsersDetailed = [];

        let stats = {
            totalUsers: users.length,
            missingOrEmptyEmail: 0,
            invalidFormat: 0,
            applePrivateRelay: 0,
            testOrDummyAccounts: 0,
            duplicates: 0,
            validRealEmails: 0
        };

        const domainBreakdown = {};

        for (const user of users) {
            if (!user.email || typeof user.email !== 'string') {
                stats.missingOrEmptyEmail++;
                continue;
            }

            const cleanEmail = user.email.trim().toLowerCase();

            if (!cleanEmail) {
                stats.missingOrEmptyEmail++;
                continue;
            }

            if (!EMAIL_REGEX.test(cleanEmail)) {
                stats.invalidFormat++;
                continue;
            }

            if (isApplePrivateRelay(cleanEmail)) {
                stats.applePrivateRelay++;
                continue;
            }

            if (isTestOrDummyAccount(cleanEmail)) {
                stats.testOrDummyAccounts++;
                continue;
            }

            if (seenEmails.has(cleanEmail)) {
                stats.duplicates++;
                continue;
            }

            seenEmails.add(cleanEmail);
            validEmailsList.push(cleanEmail);

            const domain = cleanEmail.split('@')[1];
            domainBreakdown[domain] = (domainBreakdown[domain] || 0) + 1;

            validUsersDetailed.push({
                email: cleanEmail,
                name: user.name || user.nickname || null,
                platform: user.platform || 'unknown',
                preferredLanguage: user.preferredLanguage || 'en',
                createdAt: user.createdAt || null,
                lastSeen: user.lastSeen || null
            });
        }

        stats.validRealEmails = validEmailsList.length;

        // Output paths
        const baseDir = path.join(__dirname, '..');
        const simpleJsonPath = path.join(baseDir, 'valid_user_emails.json');
        const detailedJsonPath = path.join(baseDir, 'valid_users_detailed.json');
        const reportJsonPath = path.join(baseDir, 'reports/valid_emails_summary.json');

        // 1. Simple array of emails
        fs.writeFileSync(simpleJsonPath, JSON.stringify(validEmailsList, null, 2), 'utf-8');
        console.log(`Saved ${validEmailsList.length} emails to: ${simpleJsonPath}`);

        // 2. Detailed user list
        fs.writeFileSync(detailedJsonPath, JSON.stringify(validUsersDetailed, null, 2), 'utf-8');
        console.log(`Saved detailed user records to: ${detailedJsonPath}`);

        // 3. Summary report
        const reportData = {
            exportedAt: new Date().toISOString(),
            statistics: stats,
            topDomains: Object.entries(domainBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([domain, count]) => ({ domain, count })),
            allDomainsCount: Object.keys(domainBreakdown).length
        };
        fs.writeFileSync(reportJsonPath, JSON.stringify(reportData, null, 2), 'utf-8');
        console.log(`Saved export summary report to: ${reportJsonPath}`);

        console.log('\n--- Extraction Summary ---');
        console.table(stats);

        await mongoose.disconnect();
        console.log('MongoDB connection closed.');
    } catch (error) {
        console.error('Error during email export:', error);
        process.exit(1);
    }
}

exportEmails();
