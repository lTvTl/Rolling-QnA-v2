const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { getDb } = require('./db/database');
const { getServerSecret, generateId } = require('./utils/crypto');
const roomsRouter = require('./routes/rooms');
const questionsRouter = require('./routes/questions');
const answersRouter = require('./routes/answers');
const questionBankRouter = require('./routes/questionBank');

function createApp() {
    // Initialize SQLite database & seed default question bank
    getDb();

    const app = express();

    app.use(helmet({
        contentSecurityPolicy: false
    }));

    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));

    app.use(session({
        secret: getServerSecret(),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
            maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
        }
    }));

    // Persistent HttpOnly device cookie to prevent accidental duplicate accounts per browser
    app.use((req, res, next) => {
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.match(/(?:^|;\s*)rq_device_id=([^;]+)/);
        let deviceId = match ? decodeURIComponent(match[1]) : '';
        if (!deviceId || deviceId.length < 16) {
            deviceId = generateId();
            res.cookie('rq_device_id', deviceId, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
                maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year
            });
        }
        req.deviceId = deviceId;
        next();
    });

    // Health check
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // API Routes
    app.use('/api/rooms', roomsRouter);
    app.use('/api/rooms/:roomId/questions', questionsRouter);
    app.use('/api/rooms/:roomId', answersRouter);
    app.use('/api/question-bank', questionBankRouter);

    // Serve built React frontend in production
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    if (fs.existsSync(clientDist)) {
        app.use(express.static(clientDist));
        app.use((req, res, next) => {
            if (req.path.startsWith('/api')) {
                return res.status(404).json({ error: '존재하지 않는 API 경로입니다.' });
            }
            res.sendFile(path.join(clientDist, 'index.html'));
        });
    } else {
        app.use('/api', (req, res) => {
            res.status(404).json({ error: '존재하지 않는 API 경로입니다.' });
        });
    }

    // Central error handler
    app.use((err, req, res, next) => {
        console.error('[Server Error]', err);
        res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
    });

    return app;
}

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    const app = createApp();
    app.listen(PORT, () => {
        console.log(`Rolling QnA v2 server running on http://localhost:${PORT}`);
    });
}

module.exports = { createApp };
