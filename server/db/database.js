const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { seedQuestionBank } = require('./seedQuestionBank');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'rolling_qna.db');

let dbInstance = null;

function getDb() {
    if (dbInstance) return dbInstance;

    const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
    if (dbPath !== ':memory:') {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');

    initSchema(db);
    seedQuestionBank(db);

    dbInstance = db;
    return dbInstance;
}

function initSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            invite_code TEXT NOT NULL UNIQUE,
            encrypted_meta TEXT NOT NULL,
            is_revealed INTEGER NOT NULL DEFAULT 0,
            max_members INTEGER,
            allowed_nicknames TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS room_members (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            nickname TEXT NOT NULL,
            pin_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('host', 'member')),
            device_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            UNIQUE(room_id, nickname)
        );

        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            creator_member_id TEXT,
            type TEXT NOT NULL CHECK(type IN ('subjective', 'multiple', 'essay')),
            encrypted_payload TEXT NOT NULL,
            is_anonymous INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY (creator_member_id) REFERENCES room_members(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS answers (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            author_key TEXT NOT NULL,
            author_nickname TEXT,
            encrypted_answer TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
            UNIQUE(question_id, author_key)
        );

        CREATE TABLE IF NOT EXISTS question_bank (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('subjective', 'multiple', 'essay')),
            question_text TEXT NOT NULL,
            options_json TEXT NOT NULL DEFAULT '[]',
            author_label TEXT NOT NULL DEFAULT '사용자 공유',
            usage_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
        CREATE INDEX IF NOT EXISTS idx_questions_room ON questions(room_id);
        CREATE INDEX IF NOT EXISTS idx_answers_room ON answers(room_id);
        CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
        CREATE INDEX IF NOT EXISTS idx_question_bank_category ON question_bank(category);
    `);

    // Safe migrations for existing SQLite databases created before these columns existed
    const roomCols = db.prepare('PRAGMA table_info(rooms)').all().map(c => c.name);
    if (!roomCols.includes('max_members')) {
        db.exec('ALTER TABLE rooms ADD COLUMN max_members INTEGER;');
    }
    if (!roomCols.includes('allowed_nicknames')) {
        db.exec('ALTER TABLE rooms ADD COLUMN allowed_nicknames TEXT;');
    }

    const memberCols = db.prepare('PRAGMA table_info(room_members)').all().map(c => c.name);
    if (!memberCols.includes('device_id')) {
        db.exec('ALTER TABLE room_members ADD COLUMN device_id TEXT;');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_room_members_device ON room_members(room_id, device_id);');
}

function closeDb() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

module.exports = { getDb, closeDb };
