// Test helper: make every letter still in flight for one account land now, so the receiving side
// (delivery sweep, push notification, socket event, "landed" UI) can be checked without waiting.
//
// It only moves `deliverAt` to now. The running backend's delivery sweep (every 60 s) then lands
// them through the normal path, exactly like a real arrival. Nothing else is changed.
//
//   node scripts/landLettersNow.js [email] [--dry-run]
import 'dotenv/config';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const email = (args.find((arg) => !arg.startsWith('--')) || 'ayushkumarsanu00@gmail.com').trim().toLowerCase();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;
try {
    const user = await db.collection('users').findOne(
        { email: new RegExp(`^${escape(email)}$`, 'i') },
        { projection: { _id: 1, email: 1, name: 1 } },
    );
    if (!user) {
        console.log(`No user with email ${email} in database "${db.databaseName}".`);
        process.exitCode = 1;
    } else {
        console.log(`User: ${user.email} (${user._id}) ${user.name ? `- ${user.name}` : ''}`);
        const now = new Date();
        const filter = { status: 'flying', $or: [{ senderId: user._id }, { recipientId: user._id }] };
        const letters = await db.collection('letters').find(filter)
            .project({ senderId: 1, bird: 1, deliverAt: 1 }).sort({ deliverAt: 1 }).toArray();
        console.log(`Letters in flight: ${letters.length}`);
        for (const letter of letters) {
            const direction = String(letter.senderId) === String(user._id) ? 'sent by them' : 'TO them     ';
            console.log(`  ${letter._id}  ${direction}  ${letter.bird.padEnd(7)}  was due ${letter.deliverAt.toISOString()}`);
        }
        if (dryRun) {
            console.log('Dry run: nothing changed.');
        } else if (letters.length) {
            const { modifiedCount } = await db.collection('letters').updateMany(
                { _id: { $in: letters.map((letter) => letter._id) }, status: 'flying' },
                { $set: { deliverAt: now } },
            );
            console.log(`Set ${modifiedCount} letter(s) due now (${now.toISOString()}).`);
            console.log('The running backend lands them within a minute (or on its next start).');
        }
    }
} finally {
    await mongoose.disconnect();
}
