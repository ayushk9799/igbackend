import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import memoriesRouter from '../routes/memories.js';
import Couple from '../models/Couple.js';
import Memory from '../models/Memory.js';

const getHandler = (method, path) => {
    const layer = memoriesRouter.stack.find(
        (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
    );
    return layer?.route?.stack[0]?.handle;
};

const makeResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
});

test('PATCH /:id extracts memory id from req.params and updates successfully', async () => {
    const patchHandler = getHandler('PATCH', '/:id');
    assert.ok(patchHandler, 'PATCH /:id handler should exist');

    const validId = new mongoose.Types.ObjectId().toString();
    const validUserId = new mongoose.Types.ObjectId().toString();
    const validCoupleId = new mongoose.Types.ObjectId();

    const originalFindByPartner = Couple.findByPartner;
    const originalFindOneAndUpdate = Memory.findOneAndUpdate;

    try {
        Couple.findByPartner = async () => ({
            _id: validCoupleId,
            partner1: validUserId,
            partner2: new mongoose.Types.ObjectId().toString(),
        });

        Memory.findOneAndUpdate = async (filter, update) => ({
            _id: filter._id,
            title: update.$set.title,
            caption: update.$set.caption,
        });

        const req = {
            params: { id: validId },
            body: {
                userId: validUserId,
                title: 'Updated Title',
                caption: 'Updated Caption',
            },
        };
        const res = makeResponse();

        await patchHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.title, 'Updated Title');
    } finally {
        Couple.findByPartner = originalFindByPartner;
        Memory.findOneAndUpdate = originalFindOneAndUpdate;
    }
});

test('PATCH /:id returns 400 for invalid memory id without crashing', async () => {
    const patchHandler = getHandler('PATCH', '/:id');
    const req = {
        params: { id: 'invalid-id-format' },
        body: { userId: new mongoose.Types.ObjectId().toString() },
    };
    const res = makeResponse();

    await patchHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid memory id');
});

test('GET / supports sort=desc with descending sort order in mongo query', async () => {
    const getHandlerFn = getHandler('GET', '/');
    assert.ok(getHandlerFn, 'GET / handler should exist');

    const validUserId = new mongoose.Types.ObjectId().toString();
    const validCoupleId = new mongoose.Types.ObjectId();

    const originalFindByPartner = Couple.findByPartner;
    const originalFind = Memory.find;

    let capturedSort = null;
    let capturedQuery = null;

    try {
        Couple.findByPartner = async () => ({
            _id: validCoupleId,
            partner1: validUserId,
            partner2: new mongoose.Types.ObjectId().toString(),
        });

        Memory.find = (query) => {
            capturedQuery = query;
            return {
                sort(sortSpec) {
                    capturedSort = sortSpec;
                    return {
                        limit() {
                            return {
                                lean: async () => [
                                    {
                                        _id: new mongoose.Types.ObjectId(),
                                        capturedAt: new Date('2026-05-01'),
                                        title: 'Recent Memory',
                                    },
                                ],
                            };
                        },
                    };
                },
            };
        };

        const req = {
            query: {
                userId: validUserId,
                sort: 'desc',
            },
        };
        const res = makeResponse();

        await getHandlerFn(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.deepEqual(capturedSort, { capturedAt: -1, _id: -1 });
        assert.equal(capturedQuery.coupleId, validCoupleId);
    } finally {
        Couple.findByPartner = originalFindByPartner;
        Memory.find = originalFind;
    }
});
