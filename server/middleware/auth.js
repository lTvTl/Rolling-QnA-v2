const { getDb } = require('../db/database');

function requireRoomMember(req, res, next) {
    const { roomId } = req.params;
    const membership = req.session?.memberships?.[roomId];
    if (!membership) {
        return res.status(401).json({ error: '이 모임에 먼저 입장해 주세요.' });
    }

    const db = getDb();
    const room = db.prepare('SELECT id, invite_code, encrypted_meta, is_revealed, created_at FROM rooms WHERE id = ?').get(roomId);
    if (!room) {
        delete req.session.memberships[roomId];
        return res.status(404).json({ error: '존재하지 않거나 삭제된 모임입니다.' });
    }

    const member = db.prepare('SELECT id, room_id, nickname, role, created_at FROM room_members WHERE id = ? AND room_id = ?').get(membership.memberId, roomId);
    if (!member) {
        delete req.session.memberships[roomId];
        return res.status(401).json({ error: '모임 멤버 정보를 확인할 수 없습니다. 다시 입장해 주세요.' });
    }

    req.room = room;
    req.member = member;
    next();
}

function requireRoomHost(req, res, next) {
    if (!req.member || req.member.role !== 'host') {
        return res.status(403).json({ error: '모임 방장만 사용할 수 있는 기능입니다.' });
    }
    next();
}

module.exports = {
    requireRoomMember,
    requireRoomHost
};
