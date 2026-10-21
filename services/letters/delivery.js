import Letter from '../../models/Letter.js';
import { notifyLetterDelivered } from './letterEvents.js';

export const LETTER_DELIVERY_INTERVAL_MS = 60 * 1000;
const DELIVERY_BATCH_SIZE = 50;

let deliveryTimer = null;
let deliveryRunning = false;

/**
 * Mark every due letter as delivered and notify its recipient.
 * The status check inside the update makes each letter flip exactly once,
 * so a sweep and a request delivering the same letter can't double-notify.
 */
export const deliverDueLetters = async ({
    now = new Date(),
    filter = {},
    notify = notifyLetterDelivered,
} = {}) => {
    const due = await Letter.find({ ...filter, status: 'flying', deliverAt: { $lte: now } })
        .sort({ deliverAt: 1 })
        .limit(DELIVERY_BATCH_SIZE)
        .select('_id')
        .lean();

    const delivered = [];
    for (const { _id } of due) {
        const letter = await Letter.findOneAndUpdate(
            { _id, status: 'flying' },
            { $set: { status: 'delivered', deliveredAt: now } },
            { new: true },
        );
        if (!letter) continue;
        delivered.push(letter);
        try {
            await notify(letter);
        } catch (error) {
            console.error('💌 [LETTERS] Delivery notification failed:', error);
        }
    }
    return delivered;
};

const runDeliverySweep = async () => {
    if (deliveryRunning) return;
    deliveryRunning = true;
    try {
        // Keep going while full batches come back, e.g. after downtime.
        let delivered;
        do {
            delivered = await deliverDueLetters();
        } while (delivered.length === DELIVERY_BATCH_SIZE);
    } catch (error) {
        console.error('💌 [LETTERS] Delivery sweep failed:', error);
    } finally {
        deliveryRunning = false;
    }
};

// Letters live in the database, so a restart only delays delivery until
// the first sweep runs again.
export const startLetterDeliveryLoop = (intervalMs = LETTER_DELIVERY_INTERVAL_MS) => {
    if (deliveryTimer) return deliveryTimer;
    runDeliverySweep();
    deliveryTimer = setInterval(runDeliverySweep, intervalMs);
    deliveryTimer.unref?.();
    return deliveryTimer;
};

export const stopLetterDeliveryLoop = () => {
    if (deliveryTimer) clearInterval(deliveryTimer);
    deliveryTimer = null;
};
