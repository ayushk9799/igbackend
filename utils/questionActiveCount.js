import Counter from '../models/Counter.js';

const ACTIVE_COUNT_FIELD = 'totalActiveQuestions';

const adjustActiveQuestionCount = async (topicId, delta) => {
    if (!delta) return;

    await Counter.findByIdAndUpdate(
        topicId,
        { $inc: { [ACTIVE_COUNT_FIELD]: delta } },
        { upsert: true }
    );
};

const getUpdateIsActive = (update = {}) => {
    if (Object.prototype.hasOwnProperty.call(update, 'isActive')) {
        return update.isActive;
    }

    if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'isActive')) {
        return update.$set.isActive;
    }

    return undefined;
};

export const addActiveQuestionCountHooks = (schema, topicId) => {
    schema.statics.getTotalActiveQuestions = async function () {
        let counter = await Counter.findById(topicId).lean();

        if (typeof counter?.[ACTIVE_COUNT_FIELD] !== 'number') {
            const totalActiveQuestions = await this.countDocuments({ isActive: true });
            counter = await Counter.findByIdAndUpdate(
                topicId,
                { $set: { [ACTIVE_COUNT_FIELD]: totalActiveQuestions } },
                { new: true, upsert: true }
            ).lean();
        }

        return counter[ACTIVE_COUNT_FIELD] || 0;
    };

    schema.pre('save', async function (next) {
        try {
            this._activeCountWasNew = this.isNew;

            if (!this.isNew && this.isModified('isActive')) {
                const existing = await this.constructor.findById(this._id).select('isActive').lean();
                this._activeCountWasActive = !!existing?.isActive;
            }

            next();
        } catch (error) {
            next(error);
        }
    });

    schema.post('save', async function (doc, next) {
        try {
            let delta = 0;

            if (doc._activeCountWasNew) {
                delta = doc.isActive ? 1 : 0;
            } else if (doc._activeCountWasActive !== undefined && doc._activeCountWasActive !== !!doc.isActive) {
                delta = doc.isActive ? 1 : -1;
            }

            await adjustActiveQuestionCount(topicId, delta);
            next();
        } catch (error) {
            next(error);
        }
    });

    schema.pre('findOneAndUpdate', async function (next) {
        try {
            const nextIsActive = getUpdateIsActive(this.getUpdate());
            this._activeCountNextIsActive = nextIsActive;

            if (nextIsActive !== undefined) {
                const existing = await this.model.findOne(this.getQuery()).select('isActive').lean();
                this._activeCountWasActive = !!existing?.isActive;
            }

            next();
        } catch (error) {
            next(error);
        }
    });

    schema.post('findOneAndUpdate', async function (doc, next) {
        try {
            const nextIsActive = this._activeCountNextIsActive;

            if (doc && nextIsActive !== undefined && this._activeCountWasActive !== !!nextIsActive) {
                await adjustActiveQuestionCount(topicId, nextIsActive ? 1 : -1);
            }

            next();
        } catch (error) {
            next(error);
        }
    });
};
