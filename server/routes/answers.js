const express = require('express');
const { getDb } = require('../db/database');
const { generateId, getAnonymousAuthorKey } = require('../utils/crypto');
const { requireRoomMember, requireRoomHost } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// PUT /api/rooms/:roomId/questions/:questionId/answer - 답변 작성/수정 (UPSERT)
router.put('/questions/:questionId/answer', requireRoomMember, (req, res) => {
    const { questionId } = req.params;
    const { encryptedAnswer } = req.body || {};

    if (!encryptedAnswer || typeof encryptedAnswer !== 'string' || encryptedAnswer.length > 50000) {
        return res.status(400).json({ error: '암호화된 답변 데이터가 올바르지 않습니다.' });
    }

    const db = getDb();
    const question = db.prepare('SELECT id, is_anonymous FROM questions WHERE id = ? AND room_id = ?').get(questionId, req.room.id);
    if (!question) {
        return res.status(404).json({ error: '존재하지 않는 질문입니다.' });
    }

    const isAnon = question.is_anonymous === 1;
    const authorKey = isAnon
        ? getAnonymousAuthorKey(req.room.id, questionId, req.member.id)
        : req.member.id;
    const authorNickname = isAnon ? null : req.member.nickname;
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO answers (id, room_id, question_id, author_key, author_nickname, encrypted_answer, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(question_id, author_key)
        DO UPDATE SET encrypted_answer = excluded.encrypted_answer, updated_at = excluded.updated_at
    `).run(generateId(), req.room.id, questionId, authorKey, authorNickname, encryptedAnswer, now);

    res.json({ message: '답변이 안전하게 저장되었습니다.', updatedAt: now });
});

// GET /api/rooms/:roomId/reveal - 답변 공개 모드 데이터 조회 (방장 또는 결과 공개 ON 상태)
router.get('/reveal', requireRoomMember, (req, res) => {
    const canReveal = req.member.role === 'host' || req.room.is_revealed === 1;
    if (!canReveal) {
        return res.status(403).json({ error: '방장이 아직 답변 결과를 공개하지 않았습니다.' });
    }

    const db = getDb();
    const questions = db.prepare(`
        SELECT id, type, encrypted_payload, is_anonymous, created_at
        FROM questions
        WHERE room_id = ?
        ORDER BY created_at ASC
    `).all(req.room.id);

    const answers = db.prepare(`
        SELECT a.id, a.question_id, a.author_nickname, a.encrypted_answer, a.updated_at, q.is_anonymous
        FROM answers a
        INNER JOIN questions q ON q.id = a.question_id
        WHERE a.room_id = ?
        ORDER BY a.updated_at ASC
    `).all(req.room.id);

    res.json({
        room: {
            id: req.room.id,
            inviteCode: req.room.invite_code,
            encryptedMeta: req.room.encrypted_meta,
            isRevealed: req.room.is_revealed === 1
        },
        questions: questions.map(q => ({
            id: q.id,
            type: q.type,
            encryptedPayload: q.encrypted_payload,
            isAnonymous: q.is_anonymous === 1,
            createdAt: q.created_at
        })),
        answers: answers.map(a => ({
            id: a.id,
            questionId: a.question_id,
            authorNickname: a.is_anonymous === 1 ? null : a.author_nickname,
            isAnonymous: a.is_anonymous === 1,
            encryptedAnswer: a.encrypted_answer,
            updatedAt: a.updated_at
        }))
    });
});

// DELETE /api/rooms/:roomId/answers/:answerId - 방장 전용 답변 삭제
router.delete('/answers/:answerId', requireRoomMember, requireRoomHost, (req, res) => {
    const { answerId } = req.params;
    const db = getDb();

    const result = db.prepare('DELETE FROM answers WHERE id = ? AND room_id = ?').run(answerId, req.room.id);
    if (result.changes === 0) {
        return res.status(404).json({ error: '해당 답변을 찾을 수 없습니다.' });
    }

    res.json({ message: '답변이 삭제되었습니다.' });
});

module.exports = router;
