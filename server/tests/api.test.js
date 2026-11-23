process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { createApp } = require('../index');
const { closeDb } = require('../db/database');

class TestClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cookies = new Map();
    }

    async request(method, path, body) {
        const headers = {};
        if (this.cookies.size > 0) {
            headers['Cookie'] = Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
        }
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        for (const sc of setCookies) {
            const pair = sc.split(';')[0];
            const eqIdx = pair.indexOf('=');
            if (eqIdx > 0) {
                this.cookies.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
            }
        }

        const data = await res.json().catch(() => null);
        return { status: res.status, data };
    }
}

async function runTests() {
    const app = createApp();
    const server = await new Promise(resolve => {
        const s = app.listen(0, () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const host = new TestClient(baseUrl);
        const memberA = new TestClient(baseUrl);
        const outsider = new TestClient(baseUrl);

        // 1. Question Bank seed & contribute
        let res = await host.request('GET', '/api/question-bank');
        assert.equal(res.status, 200);
        assert.ok(res.data.items.length >= 15, 'Default question bank seeded');
        assert.ok(res.data.categories.includes('밸런스게임'));

        res = await host.request('POST', '/api/question-bank', {
            category: '아이스브레이킹',
            type: 'subjective',
            questionText: '가장 좋아하는 계절 음식은?',
            authorLabel: '테스터'
        });
        assert.equal(res.status, 201);
        const bankId = res.data.id;

        // 2. Host creates Room 1 (with encryptedMeta)
        res = await host.request('POST', '/api/rooms', {
            encryptedMeta: 'ENC_META_ROOM_1',
            hostNickname: '방장진성',
            hostPin: '1234'
        });
        assert.equal(res.status, 201);
        const room1 = res.data.room;
        assert.equal(res.data.member.role, 'host');

        // 3. Outsider cannot access Room 1 questions
        res = await outsider.request('GET', `/api/rooms/${room1.id}/questions`);
        assert.equal(res.status, 401);

        // 4. Member A joins Room 1 via invite code
        res = await memberA.request('POST', `/api/rooms/invite/${room1.inviteCode}/join`, {
            nickname: '친구A',
            pin: '9999'
        });
        assert.equal(res.status, 201);
        assert.equal(res.data.member.role, 'member');

        // Wrong PIN for existing nickname fails
        const wrongPinClient = new TestClient(baseUrl);
        res = await wrongPinClient.request('POST', `/api/rooms/invite/${room1.inviteCode}/join`, {
            nickname: '친구A',
            pin: '0000'
        });
        assert.equal(res.status, 401);

        // 5. Batch add questions (1 normal + 1 anonymous)
        res = await host.request('POST', `/api/rooms/${room1.id}/questions`, {
            items: [
                { type: 'multiple', encryptedPayload: 'ENC_Q1', isAnonymous: false },
                { type: 'subjective', encryptedPayload: 'ENC_Q2_ANON', isAnonymous: true }
            ]
        });
        assert.equal(res.status, 201);
        const [qNormalId, qAnonId] = res.data.ids;

        // Increment bank usage
        res = await host.request('POST', '/api/question-bank/use', { ids: [bankId] });
        assert.equal(res.status, 200);
        assert.equal(res.data.updated, 1);

        // 6. Member A submits answers to both questions
        res = await memberA.request('PUT', `/api/rooms/${room1.id}/questions/${qNormalId}/answer`, {
            encryptedAnswer: 'ENC_ANS_A_NORMAL'
        });
        assert.equal(res.status, 200);

        res = await memberA.request('PUT', `/api/rooms/${room1.id}/questions/${qAnonId}/answer`, {
            encryptedAnswer: 'ENC_ANS_A_ANON'
        });
        assert.equal(res.status, 200);

        // 7. Member A CANNOT view reveal while isRevealed is false
        res = await memberA.request('GET', `/api/rooms/${room1.id}/reveal`);
        assert.equal(res.status, 403);

        // 8. Host CAN view reveal; anonymous question hides nickname!
        res = await host.request('GET', `/api/rooms/${room1.id}/reveal`);
        assert.equal(res.status, 200);
        assert.equal(res.data.answers.length, 2);
        const normalAns = res.data.answers.find(a => a.questionId === qNormalId);
        const anonAns = res.data.answers.find(a => a.questionId === qAnonId);
        assert.equal(normalAns.authorNickname, '친구A');
        assert.equal(anonAns.authorNickname, null);

        // 9. Member A CANNOT delete answers (v1 bug fixed!)
        res = await memberA.request('DELETE', `/api/rooms/${room1.id}/answers/${normalAns.id}`);
        assert.equal(res.status, 403);

        // 10. Host toggles reveal ON -> Member A can now view reveal
        res = await host.request('PATCH', `/api/rooms/${room1.id}/reveal`, { isRevealed: true });
        assert.equal(res.status, 200);
        assert.equal(res.data.isRevealed, true);

        res = await memberA.request('GET', `/api/rooms/${room1.id}/reveal`);
        assert.equal(res.status, 200);

        // 11. Host deletes room -> Member A gets 404
        res = await host.request('DELETE', `/api/rooms/${room1.id}`);
        assert.equal(res.status, 200);

        res = await memberA.request('GET', `/api/rooms/${room1.id}/questions`);
        assert.equal(res.status, 404);

        // 12. Production SPA static & fallback serving check
        const rootRes = await fetch(`${baseUrl}/`);
        assert.equal(rootRes.status, 200);
        const rootHtml = await rootRes.text();
        assert.ok(rootHtml.includes('id="root"'), 'Serves built React SPA');

        const spaFallbackRes = await fetch(`${baseUrl}/room/TESTCODE`);
        assert.equal(spaFallbackRes.status, 200);

        const healthRes = await fetch(`${baseUrl}/api/health`);
        assert.equal(healthRes.status, 200);

        // 13. Anti-duplicate: 1 browser/device = 1 account + pre-registered roster + maxMembers
        const host2 = new TestClient(baseUrl);
        const rosterMember = new TestClient(baseUrl);
        const intruder = new TestClient(baseUrl);

        res = await host2.request('POST', '/api/rooms', {
            encryptedMeta: 'ENC_META_ROSTER',
            hostNickname: '방장',
            hostPin: '1234',
            maxMembers: 2,
            allowedNicknames: ['민수']
        });
        assert.equal(res.status, 201);
        const room2 = res.data.room;

        // Same device (host2) tries to create a second nickname -> blocked (409)
        res = await host2.request('POST', `/api/rooms/invite/${room2.inviteCode}/join`, {
            nickname: '민수',
            pin: '5678'
        });
        assert.equal(res.status, 409);

        // Unlisted nickname on another device -> blocked (403)
        res = await intruder.request('POST', `/api/rooms/invite/${room2.inviteCode}/join`, {
            nickname: '외부인',
            pin: '5678'
        });
        assert.equal(res.status, 403);

        // Listed nickname joins -> allowed (201)
        res = await rosterMember.request('POST', `/api/rooms/invite/${room2.inviteCode}/join`, {
            nickname: '민수',
            pin: '5678'
        });
        assert.equal(res.status, 201);

        // Existing member rejoins with correct PIN even at maxMembers -> allowed (200)
        res = await rosterMember.request('POST', `/api/rooms/invite/${room2.inviteCode}/join`, {
            nickname: '민수',
            pin: '5678'
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.rejoined, true);

        console.log('✅ All 13 backend API, security, anti-duplicate & SPA integration tests passed!');
    } finally {
        server.close();
        closeDb();
    }
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
