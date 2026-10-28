import test from 'node:test';
import assert from 'node:assert/strict';

const turn = { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'test-user', credential: 'test-credential' };
let moduleId = 0;
const setup = async (t, policy = 'relay') => {
    const names = ['CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN', 'WEBRTC_ICE_TRANSPORT_POLICY'];
    const saved = names.map(name => process.env[name]);
    const savedFetch = globalThis.fetch;
    const savedNow = Date.now;
    process.env.WEBRTC_ICE_TRANSPORT_POLICY = policy;
    process.env.CLOUDFLARE_TURN_KEY_ID = 'test-key';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'test-token';
    t.after(() => {
        names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
        globalThis.fetch = savedFetch;
        Date.now = savedNow;
    });
    return import(`../utils/iceServers.js?test=${++moduleId}`);
};

test('relay mode returns authenticated TURN servers and policy together', async t => {
    const { getIceConfiguration } = await setup(t);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ iceServers: [turn] }) }; };
    assert.deepEqual(await getIceConfiguration(), { iceServers: [turn], iceTransportPolicy: 'relay' });
    await getIceConfiguration();
    assert.equal(calls, 1);
});

test('relay mode fails closed when Cloudflare credentials are missing', async t => {
    const { getIceConfiguration } = await setup(t);
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    await assert.rejects(getIceConfiguration(), { code: 'TURN_UNAVAILABLE' });
});

test('relay mode fails closed on credential rejection or STUN-only responses', async t => {
    const { getIceServers } = await setup(t);
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(getIceServers(), { code: 'TURN_UNAVAILABLE' });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ iceServers: [{ urls: 'stun:example.test' }] }) });
    await assert.rejects(getIceServers(), { code: 'TURN_UNAVAILABLE' });
});

test('expired cached credentials cannot conceal a provider failure in relay mode', async t => {
    const { getIceServers } = await setup(t);
    let now = 1000000;
    Date.now = () => now;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ iceServers: [turn] }) });
    await getIceServers();
    now += 86400001;
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(getIceServers(), { code: 'TURN_UNAVAILABLE' });
});

test('an explicit all policy preserves legacy STUN fallback', async t => {
    const { getIceConfiguration } = await setup(t, 'all');
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    const configuration = await getIceConfiguration();
    assert.equal(configuration.iceTransportPolicy, 'all');
    assert.ok(configuration.iceServers.every(server => server.urls.startsWith('stun:')));
});

test('misspelled policy cannot silently enable direct media', async t => {
    const { getIceConfiguration } = await setup(t, 'realy');
    await assert.rejects(getIceConfiguration(), /must be all or relay/);
});
