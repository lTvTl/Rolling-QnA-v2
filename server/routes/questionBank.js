const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db/database');
const { generateId } = require('../utils/crypto');

const router = express.Router();

const VALID_TYPES = new Set(['subjective', 'multiple', 'essay']);
const isTest = process.env.NODE_ENV === 'test';

const contributeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: isTest ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '질문 등록 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }
});

// GET /api/question-bank - 공용 질문 은행 조회 (카테고리/유형/검색어 필터)
router.get('/', (req, res) => {
    const { category, type, search } = req.query;
    const db = getDb();

    const conditions = [];
    const params = [];

    if (category && category !== '전체') {
        conditions.push('category = ?');
        params.push(String(category));
    }
    if (type && VALID_TYPES.has(String(type))) {
        conditions.push('type = ?');
        params.push(String(type));
    }
    if (search && String(search).trim()) {
        conditions.push('question_text LIKE ?');
        params.push(`%${String(search).trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`
        SELECT id, category, type, question_text, options_json, author_label, usage_count, created_at
        FROM question_bank
        ${whereClause}
        ORDER BY usage_count DESC, created_at DESC
    `).all(...params);

    const categories = db.prepare('SELECT DISTINCT category FROM question_bank ORDER BY category ASC')
        .all()
        .map(r => r.category);

    res.json({
        categories,
        items: rows.map(r => ({
            id: r.id,
            category: r.category,
            type: r.type,
            questionText: r.question_text,
            options: JSON.parse(r.options_json || '[]'),
            authorLabel: r.author_label,
            usageCount: r.usage_count,
            createdAt: r.created_at
        }))
    });
});

// POST /api/question-bank - 질문 은행에 새 질문 템플릿 공유 등록
router.post('/', contributeLimiter, (req, res) => {
    const { category, type, questionText, options, authorLabel } = req.body || {};

    const cleanCategory = typeof category === 'string' ? category.trim() : '';
    const cleanText = typeof questionText === 'string' ? questionText.trim() : '';
    const cleanAuthor = typeof authorLabel === 'string' && authorLabel.trim()
        ? authorLabel.trim().slice(0, 20)
        : '사용자 공유';

    if (cleanCategory.length < 1 || cleanCategory.length > 30) {
        return res.status(400).json({ error: '카테고리는 1~30자 사이로 입력해 주세요.' });
    }
    if (!VALID_TYPES.has(type)) {
        return res.status(400).json({ error: '올바른 질문 유형을 선택해 주세요.' });
    }
    if (cleanText.length < 2 || cleanText.length > 300) {
        return res.status(400).json({ error: '질문 내용은 2~300자 사이로 입력해 주세요.' });
    }

    let cleanOptions = [];
    if (type === 'multiple') {
        if (!Array.isArray(options)) {
            return res.status(400).json({ error: '객관식 보기를 입력해 주세요.' });
        }
        cleanOptions = options
            .map(o => String(o || '').trim())
            .filter(o => o.length > 0)
            .slice(0, 10);
        if (cleanOptions.length < 2) {
            return res.status(400).json({ error: '객관식 보기는 최소 2개 이상 필요합니다.' });
        }
    }

    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO question_bank (id, category, type, question_text, options_json, author_label, usage_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, cleanCategory, type, cleanText, JSON.stringify(cleanOptions), cleanAuthor, now);

    res.status(201).json({
        id,
        category: cleanCategory,
        type,
        questionText: cleanText,
        options: cleanOptions,
        authorLabel: cleanAuthor,
        usageCount: 0,
        createdAt: now
    });
});

// POST /api/question-bank/use - 질문 은행 사용 횟수 일괄 증가
router.post('/use', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 30) : [];
    if (ids.length === 0) {
        return res.json({ updated: 0 });
    }
    const db = getDb();
    const stmt = db.prepare('UPDATE question_bank SET usage_count = usage_count + 1 WHERE id = ?');
    let updated = 0;
    db.exec('BEGIN');
    try {
        for (const id of ids) {
            const info = stmt.run(String(id));
            updated += info.changes;
        }
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
    res.json({ updated });
});

module.exports = router;
