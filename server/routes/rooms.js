const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db/database');
const { generateId, generateInviteCode, hashPin, verifyPin } = require('../utils/crypto');
const { requireRoomMember, requireRoomHost } = require('../middleware/auth');

const router = express.Router();

const isTest = process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: isTest ? 1000 : 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }
});

function setSessionMembership(req, roomId, member) {
    if (!req.session.memberships) {
        req.session.memberships = {};
    }
    req.session.memberships[roomId] = {
        memberId: member.id,
        nickname: member.nickname,
        role: member.role
    };
}

function parseAllowedNicknames(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
        return null;
    }
}

// POST /api/rooms - 새 모임 생성 (생성자 = 방장)
router.post('/', authLimiter, (req, res) => {
    const { encryptedMeta, hostNickname, hostPin, maxMembers, allowedNicknames } = req.body || {};

    if (!encryptedMeta || typeof encryptedMeta !== 'string' || encryptedMeta.length > 10000) {
        return res.status(400).json({ error: '모임 정보(암호화 데이터)가 올바르지 않습니다.' });
    }
    const nickname = typeof hostNickname === 'string' ? hostNickname.trim() : '';
    const pin = typeof hostPin === 'string' ? hostPin.trim() : '';

    if (nickname.length < 1 || nickname.length > 20) {
        return res.status(400).json({ error: '닉네임은 1~20자 사이로 입력해 주세요.' });
    }
    if (pin.length < 4 || pin.length > 20) {
        return res.status(400).json({ error: 'PIN 비밀번호는 4~20자 사이로 입력해 주세요.' });
    }

    // Optional: Pre-registered nickname roster
    let cleanAllowed = null;
    if (Array.isArray(allowedNicknames) && allowedNicknames.length > 0) {
        const uniqueSet = new Set();
        uniqueSet.add(nickname); // Always include host nickname in the roster
        for (const n of allowedNicknames) {
            const trimmed = String(n || '').trim();
            if (trimmed.length >= 1 && trimmed.length <= 20) {
                uniqueSet.add(trimmed);
            }
        }
        cleanAllowed = Array.from(uniqueSet).slice(0, 100);
    }

    // Optional: Max members cap
    let cleanMax = null;
    if (maxMembers !== undefined && maxMembers !== null && maxMembers !== '') {
        const parsed = Number(maxMembers);
        if (!Number.isInteger(parsed) || parsed < 2 || parsed > 100) {
            return res.status(400).json({ error: '최대 인원은 2명에서 100명 사이로 설정해 주세요.' });
        }
        cleanMax = parsed;
    }
    if (cleanAllowed && cleanMax && cleanMax < cleanAllowed.length) {
        cleanMax = cleanAllowed.length;
    }

    const db = getDb();
    const roomId = generateId();
    const memberId = generateId();
    const now = new Date().toISOString();
    const pinHash = hashPin(pin);
    const deviceId = req.deviceId || null;

    let inviteCode = generateInviteCode(8);
    for (let attempt = 0; attempt < 5; attempt++) {
        const exists = db.prepare('SELECT 1 FROM rooms WHERE invite_code = ?').get(inviteCode);
        if (!exists) break;
        inviteCode = generateInviteCode(8);
    }

    db.exec('BEGIN');
    try {
        db.prepare(`
            INSERT INTO rooms (id, invite_code, encrypted_meta, is_revealed, max_members, allowed_nicknames, created_at)
            VALUES (?, ?, ?, 0, ?, ?, ?)
        `).run(roomId, inviteCode, encryptedMeta, cleanMax, cleanAllowed ? JSON.stringify(cleanAllowed) : null, now);

        db.prepare(`
            INSERT INTO room_members (id, room_id, nickname, pin_hash, role, device_id, created_at)
            VALUES (?, ?, ?, ?, 'host', ?, ?)
        `).run(memberId, roomId, nickname, pinHash, deviceId, now);

        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }

    const member = { id: memberId, nickname, role: 'host' };
    setSessionMembership(req, roomId, member);

    res.status(201).json({
        room: {
            id: roomId,
            inviteCode,
            encryptedMeta,
            isRevealed: false,
            maxMembers: cleanMax,
            allowedNicknames: cleanAllowed,
            createdAt: now
        },
        member
    });
});

// GET /api/rooms/invite/:inviteCode - 초대 코드로 모임 기본 정보 조회 (입장 전)
router.get('/invite/:inviteCode', (req, res) => {
    const inviteCode = String(req.params.inviteCode || '').trim().toUpperCase();
    if (!inviteCode) {
        return res.status(400).json({ error: '초대 코드가 올바르지 않습니다.' });
    }

    const db = getDb();
    const room = db.prepare(`
        SELECT id, invite_code, encrypted_meta, is_revealed, max_members, allowed_nicknames, created_at
        FROM rooms
        WHERE invite_code = ?
    `).get(inviteCode);
    if (!room) {
        return res.status(404).json({ error: '존재하지 않거나 삭제된 모임입니다.' });
    }

    const memberRows = db.prepare('SELECT id, nickname, role, device_id FROM room_members WHERE room_id = ?').all(room.id);
    const sessionMember = req.session?.memberships?.[room.id];
    let currentMember = null;

    if (sessionMember) {
        const dbMember = memberRows.find(m => m.id === sessionMember.memberId);
        if (dbMember) {
            currentMember = { id: dbMember.id, nickname: dbMember.nickname, role: dbMember.role };
        } else {
            delete req.session.memberships[room.id];
        }
    }

    const deviceMember = req.deviceId
        ? memberRows.find(m => m.device_id === req.deviceId)
        : null;

    res.json({
        room: {
            id: room.id,
            inviteCode: room.invite_code,
            encryptedMeta: room.encrypted_meta,
            isRevealed: room.is_revealed === 1,
            maxMembers: room.max_members || null,
            allowedNicknames: parseAllowedNicknames(room.allowed_nicknames),
            joinedNicknames: memberRows.map(m => m.nickname),
            createdAt: room.created_at,
            memberCount: memberRows.length
        },
        currentMember,
        deviceMemberNickname: deviceMember ? deviceMember.nickname : null
    });
});

// POST /api/rooms/invite/:inviteCode/join - 닉네임 + PIN으로 모임 입장 또는 재접속
router.post('/invite/:inviteCode/join', authLimiter, (req, res) => {
    const inviteCode = String(req.params.inviteCode || '').trim().toUpperCase();
    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    if (nickname.length < 1 || nickname.length > 20) {
        return res.status(400).json({ error: '닉네임은 1~20자 사이로 입력해 주세요.' });
    }
    if (pin.length < 4 || pin.length > 20) {
        return res.status(400).json({ error: 'PIN 비밀번호는 4~20자 사이로 입력해 주세요.' });
    }

    const db = getDb();
    const room = db.prepare(`
        SELECT id, invite_code, encrypted_meta, is_revealed, max_members, allowed_nicknames, created_at
        FROM rooms
        WHERE invite_code = ?
    `).get(inviteCode);
    if (!room) {
        return res.status(404).json({ error: '존재하지 않거나 삭제된 모임입니다.' });
    }

    const existing = db.prepare('SELECT id, nickname, pin_hash, role FROM room_members WHERE room_id = ? AND nickname = ?').get(room.id, nickname);

    // 1) Existing nickname -> Rejoin via PIN verification
    if (existing) {
        if (!verifyPin(pin, existing.pin_hash)) {
            return res.status(401).json({ error: '이미 사용 중인 닉네임이거나 PIN이 일치하지 않습니다.' });
        }
        const member = { id: existing.id, nickname: existing.nickname, role: existing.role };
        setSessionMembership(req, room.id, member);
        return res.json({
            rejoined: true,
            room: {
                id: room.id,
                inviteCode: room.invite_code,
                encryptedMeta: room.encrypted_meta,
                isRevealed: room.is_revealed === 1,
                maxMembers: room.max_members || null,
                allowedNicknames: parseAllowedNicknames(room.allowed_nicknames),
                createdAt: room.created_at
            },
            member
        });
    }

    // 2) New member registration checks:
    // (a) 1 browser/device = 1 account per room
    if (req.deviceId) {
        const deviceMember = db.prepare('SELECT nickname FROM room_members WHERE room_id = ? AND device_id = ?').get(room.id, req.deviceId);
        if (deviceMember) {
            return res.status(409).json({
                error: `이 기기에서는 이미 '${deviceMember.nickname}' 닉네임으로 참여했습니다. 중복 생성 대신 기존 닉네임과 PIN으로 재접속해 주세요.`
            });
        }
    }

    // (b) Pre-registered roster check (if enabled)
    const allowedList = parseAllowedNicknames(room.allowed_nicknames);
    if (allowedList && !allowedList.includes(nickname)) {
        return res.status(403).json({
            error: '사전 등록된 참여자 명단에 없는 닉네임입니다. 명단에서 본인 이름을 선택해 주세요.'
        });
    }

    // (c) Max members cap check (if enabled)
    if (room.max_members) {
        const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM room_members WHERE room_id = ?').get(room.id);
        if (countRow && countRow.cnt >= room.max_members) {
            return res.status(403).json({
                error: `모임 정원(${room.max_members}명)이 가득 차 새로운 닉네임으로 입장할 수 없습니다.`
            });
        }
    }

    const memberId = generateId();
    const now = new Date().toISOString();
    const pinHash = hashPin(pin);

    db.prepare(`
        INSERT INTO room_members (id, room_id, nickname, pin_hash, role, device_id, created_at)
        VALUES (?, ?, ?, ?, 'member', ?, ?)
    `).run(memberId, room.id, nickname, pinHash, req.deviceId || null, now);

    const member = { id: memberId, nickname, role: 'member' };
    setSessionMembership(req, room.id, member);

    res.status(201).json({
        rejoined: false,
        room: {
            id: room.id,
            inviteCode: room.invite_code,
            encryptedMeta: room.encrypted_meta,
            isRevealed: room.is_revealed === 1,
            maxMembers: room.max_members || null,
            allowedNicknames: allowedList,
            createdAt: room.created_at
        },
        member
    });
});

// GET /api/rooms/:roomId - 모임 상세 정보 + 참여자 목록
router.get('/:roomId', requireRoomMember, (req, res) => {
    const db = getDb();
    const roomFull = db.prepare(`
        SELECT id, invite_code, encrypted_meta, is_revealed, max_members, allowed_nicknames, created_at
        FROM rooms WHERE id = ?
    `).get(req.room.id);
    const members = db.prepare('SELECT id, nickname, role, created_at FROM room_members WHERE room_id = ? ORDER BY created_at ASC').all(req.room.id);

    res.json({
        room: {
            id: roomFull.id,
            inviteCode: roomFull.invite_code,
            encryptedMeta: roomFull.encrypted_meta,
            isRevealed: roomFull.is_revealed === 1,
            maxMembers: roomFull.max_members || null,
            allowedNicknames: parseAllowedNicknames(roomFull.allowed_nicknames),
            createdAt: roomFull.created_at
        },
        currentMember: {
            id: req.member.id,
            nickname: req.member.nickname,
            role: req.member.role
        },
        members
    });
});

// POST /api/rooms/:roomId/leave - 현재 브라우저 세션에서 모임 나가기(로그아웃)
router.post('/:roomId/leave', (req, res) => {
    const { roomId } = req.params;
    if (req.session?.memberships?.[roomId]) {
        delete req.session.memberships[roomId];
    }
    res.json({ message: '모임에서 로그아웃되었습니다.' });
});

// PATCH /api/rooms/:roomId/reveal - 방장이 결과 공개 스위치 토글
router.patch('/:roomId/reveal', requireRoomMember, requireRoomHost, (req, res) => {
    const isRevealed = Boolean(req.body?.isRevealed);
    const db = getDb();
    db.prepare('UPDATE rooms SET is_revealed = ? WHERE id = ?').run(isRevealed ? 1 : 0, req.room.id);
    res.json({ isRevealed });
});

// DELETE /api/rooms/:roomId - 방장이 모임 및 모든 데이터 완전 삭제
router.delete('/:roomId', requireRoomMember, requireRoomHost, (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.room.id);
    if (req.session?.memberships?.[req.room.id]) {
        delete req.session.memberships[req.room.id];
    }
    res.json({ message: '모임과 모든 질문·답변 데이터가 완전히 삭제되었습니다.' });
});

module.exports = router;
