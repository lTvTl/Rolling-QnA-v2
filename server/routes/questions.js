const express = require('express');
const { getDb } = require('../db/database');
const { generateId, getAnonymousAuthorKey } = require('../utils/crypto');
const { requireRoomMember } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const VALID_TYPES = new Set(['subjective', 'multiple', 'essay']);

// GET /api/rooms/:roomId/questions - 모임 내 질문 목록 + 본인 답변 상태
router.get('/', requireRoomMember, (req, res) => {
    const db = getDb();
    const roomId = req.room.id;
    const member = req.member;

    const questions = db.prepare(`
        SELECT q.id, q.type, q.encrypted_payload, q.is_anonymous, q.creator_member_id, q.created_at,
               m.nickname AS creator_nickname,
               (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count
        FROM questions q
        LEFT JOIN room_members m ON m.id = q.creator_member_id
        WHERE q.room_id = ?
        ORDER BY q.created_at ASC
    `).all(roomId);

    const findAnswerStmt = db.prepare('SELECT encrypted_answer, updated_at FROM answers WHERE question_id = ? AND author_key = ?');

    const result = questions.map(q => {
        const isAnon = q.is_anonymous === 1;
        const authorKey = isAnon
            ? getAnonymousAuthorKey(roomId, q.id, member.id)
            : member.id;
        const myAns = findAnswerStmt.get(q.id, authorKey);

        return {
            id: q.id,
            type: q.type,
            encryptedPayload: q.encrypted_payload,
            isAnonymous: isAnon,
            creatorNickname: q.creator_nickname || '알 수 없음',
            canEdit: q.creator_member_id === member.id || member.role === 'host',
            answerCount: q.answer_count,
            answered: Boolean(myAns),
            myEncryptedAnswer: myAns ? myAns.encrypted_answer : null,
            myUpdatedAt: myAns ? myAns.updated_at : null,
            createdAt: q.created_at
        };
    });

    res.json(result);
});

// POST /api/rooms/:roomId/questions - 단일 또는 다중(질문 은행 일괄 추가) 질문 등록
router.post('/', requireRoomMember, (req, res) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [req.body];

    if (rawItems.length === 0 || rawItems.length > 30) {
        return res.status(400).json({ error: '질문은 한 번에 1개에서 30개까지 등록할 수 있습니다.' });
    }

    for (const item of rawItems) {
        if (!item || !VALID_TYPES.has(item.type)) {
            return res.status(400).json({ error: '올바른 질문 유형(subjective, multiple, essay)을 선택해 주세요.' });
        }
        if (!item.encryptedPayload || typeof item.encryptedPayload !== 'string' || item.encryptedPayload.length > 50000) {
            return res.status(400).json({ error: '암호화된 질문 데이터가 올바르지 않습니다.' });
        }
    }

    const db = getDb();
    const insertStmt = db.prepare(`
        INSERT INTO questions (id, room_id, creator_member_id, type, encrypted_payload, is_anonymous, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const createdIds = [];
    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
        for (const item of rawItems) {
            const id = generateId();
            insertStmt.run(
                id,
                req.room.id,
                req.member.id,
                item.type,
                item.encryptedPayload,
                item.isAnonymous ? 1 : 0,
                now
            );
            createdIds.push(id);
        }
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }

    res.status(201).json({
        message: `${createdIds.length}개의 질문이 등록되었습니다.`,
        ids: createdIds
    });
});

// PUT /api/rooms/:roomId/questions/:questionId - 질문 수정 (익명 설정은 데이터 정합성을 위해 변경 불가)
router.put('/:questionId', requireRoomMember, (req, res) => {
    const { questionId } = req.params;
    const { type, encryptedPayload } = req.body || {};

    if (!VALID_TYPES.has(type)) {
        return res.status(400).json({ error: '올바른 질문 유형을 선택해 주세요.' });
    }
    if (!encryptedPayload || typeof encryptedPayload !== 'string' || encryptedPayload.length > 50000) {
        return res.status(400).json({ error: '암호화된 질문 데이터가 올바르지 않습니다.' });
    }

    const db = getDb();
    const question = db.prepare('SELECT id, creator_member_id FROM questions WHERE id = ? AND room_id = ?').get(questionId, req.room.id);
    if (!question) {
        return res.status(404).json({ error: '존재하지 않는 질문입니다.' });
    }

    const isCreator = question.creator_member_id === req.member.id;
    const isHost = req.member.role === 'host';
    if (!isCreator && !isHost) {
        return res.status(403).json({ error: '질문을 수정할 권한이 없습니다.' });
    }

    db.prepare('UPDATE questions SET type = ?, encrypted_payload = ? WHERE id = ? AND room_id = ?')
        .run(type, encryptedPayload, questionId, req.room.id);

    res.json({ message: '질문이 수정되었습니다.' });
});

// DELETE /api/rooms/:roomId/questions/:questionId - 질문 삭제 (연관 답변 CASCADE 삭제)
router.delete('/:questionId', requireRoomMember, (req, res) => {
    const { questionId } = req.params;
    const db = getDb();

    const question = db.prepare('SELECT id, creator_member_id FROM questions WHERE id = ? AND room_id = ?').get(questionId, req.room.id);
    if (!question) {
        return res.status(404).json({ error: '존재하지 않는 질문입니다.' });
    }

    const isCreator = question.creator_member_id === req.member.id;
    const isHost = req.member.role === 'host';
    if (!isCreator && !isHost) {
        return res.status(403).json({ error: '질문을 삭제할 권한이 없습니다.' });
    }

    db.prepare('DELETE FROM questions WHERE id = ? AND room_id = ?').run(questionId, req.room.id);
    res.json({ message: '질문이 삭제되었습니다.' });
});

module.exports = router;
