import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Sparkles, ShieldCheck, PlusCircle, LogIn, Clock, Trash2, ArrowRight, Lock
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import {
    generateRoomKey,
    encryptJson,
    saveRecentRoom,
    getRecentRooms,
    removeRecentRoom,
    parseInviteInput
} from '../utils/e2ee';

export default function HomePage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('create'); // 'create' | 'join'
    const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());

    // Create room form
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [hostNickname, setHostNickname] = useState('');
    const [hostPin, setHostPin] = useState('');
    const [maxMembers, setMaxMembers] = useState('');
    const [rosterInput, setRosterInput] = useState('');
    const [creating, setCreating] = useState(false);

    // Join room form
    const [inviteInput, setInviteInput] = useState('');
    const [error, setError] = useState('');

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        setError('');

        const cleanTitle = title.trim();
        const cleanNick = hostNickname.trim();
        const cleanPin = hostPin.trim();

        if (!cleanTitle) return setError('모임 이름을 입력해 주세요.');
        if (!cleanNick) return setError('방장 닉네임을 입력해 주세요.');
        if (cleanPin.length < 4) return setError('PIN 비밀번호는 4자 이상 입력해 주세요.');

        setCreating(true);
        try {
            const { cryptoKey, keyString } = await generateRoomKey();
            const encryptedMeta = await encryptJson(cryptoKey, {
                title: cleanTitle,
                description: description.trim()
            });

            const allowedNicknames = rosterInput
                .split(/[,\n]+/)
                .map(s => s.trim())
                .filter(Boolean);

            const data = await apiRequest('/api/rooms', {
                method: 'POST',
                body: {
                    encryptedMeta,
                    hostNickname: cleanNick,
                    hostPin: cleanPin,
                    maxMembers: maxMembers ? Number(maxMembers) : null,
                    allowedNicknames: allowedNicknames.length > 0 ? allowedNicknames : null
                }
            });

            const inviteCode = data.room.inviteCode;
            saveRecentRoom({ inviteCode, keyString, title: cleanTitle });
            navigate(`/room/${inviteCode}#key=${keyString}`);
        } catch (err) {
            setError(err.message || '모임 생성에 실패했습니다.');
        } finally {
            setCreating(false);
        }
    };

    const handleJoinSubmit = (e) => {
        e.preventDefault();
        setError('');
        const { inviteCode, keyString } = parseInviteInput(inviteInput);
        if (!inviteCode) {
            setError('초대 링크 또는 모임 코드를 입력해 주세요.');
            return;
        }
        if (keyString) {
            navigate(`/room/${inviteCode}#key=${keyString}`);
        } else {
            navigate(`/room/${inviteCode}`);
        }
    };

    const handleRemoveRecent = (e, code) => {
        e.stopPropagation();
        removeRecentRoom(code);
        setRecentRooms(getRecentRooms());
    };

    return (
        <div className="home-wrapper">
            <div className="hero-brand">
                <div className="hero-badge">
                    <ShieldCheck size={15} /> 종단간 암호화 (E2EE) · 모임 전용 프라이빗 Q&A
                </div>
                <h1 className="hero-title clickable-logo" onClick={() => navigate('/')}>
                    Rolling <span className="accent-gradient">Q&A</span>
                </h1>
                <p className="hero-subtitle">
                    회원가입 없이 모임을 만들고, 질문 은행에서 아이디어를 골라 친구들과 솔직한 대화를 나눠보세요.
                    <br />
                    모든 질문과 답변은 브라우저에서 암호화되어 서버 관리자도 볼 수 없습니다.
                </p>
            </div>

            <div className="home-card glass-card">
                <div className="tab-bar">
                    <button
                        type="button"
                        className={`tab-btn ${mode === 'create' ? 'active' : ''}`}
                        onClick={() => { setMode('create'); setError(''); }}
                    >
                        <PlusCircle size={16} /> 새 모임 만들기
                    </button>
                    <button
                        type="button"
                        className={`tab-btn ${mode === 'join' ? 'active' : ''}`}
                        onClick={() => { setMode('join'); setError(''); }}
                    >
                        <LogIn size={16} /> 초대 링크로 입장
                    </button>
                </div>

                {error && <div className="alert-box error">{error}</div>}

                {mode === 'create' ? (
                    <form onSubmit={handleCreateRoom} className="form-stack">
                        <div className="input-group">
                            <label htmlFor="room-title">모임 이름</label>
                            <input
                                id="room-title"
                                type="text"
                                className="form-control"
                                placeholder="예: 2026 연말 동기 모임, 프로젝트 회고방"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                maxLength={40}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor="room-desc">한 줄 소개 (선택)</label>
                            <input
                                id="room-desc"
                                type="text"
                                className="form-control"
                                placeholder="예: 편하게 답하고 모임 날 다 같이 공개해요!"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        <div className="form-row-2">
                            <div className="input-group">
                                <label htmlFor="host-nick">방장 닉네임</label>
                                <input
                                    id="host-nick"
                                    type="text"
                                    className="form-control"
                                    placeholder="모임에서 쓸 이름"
                                    value={hostNickname}
                                    onChange={e => setHostNickname(e.target.value)}
                                    maxLength={20}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="host-pin">방장 PIN (4자 이상)</label>
                                <input
                                    id="host-pin"
                                    type="password"
                                    className="form-control"
                                    placeholder="재접속용 비밀번호"
                                    value={hostPin}
                                    onChange={e => setHostPin(e.target.value)}
                                    minLength={4}
                                    maxLength={20}
                                    required
                                />
                            </div>
                        </div>

                        <div className="optional-box">
                            <div className="optional-box-title">
                                <ShieldCheck size={14} /> 중복 참여 방지 설정 (선택)
                            </div>
                            <div className="form-row-2">
                                <div className="input-group">
                                    <label htmlFor="room-max">최대 인원 제한</label>
                                    <input
                                        id="room-max"
                                        type="number"
                                        min={2}
                                        max={100}
                                        className="form-control"
                                        placeholder="제한 없음 (예: 6)"
                                        value={maxMembers}
                                        onChange={e => setMaxMembers(e.target.value)}
                                    />
                                </div>
                                <div className="input-group">
                                    <label htmlFor="room-roster">사전 참여자 명단</label>
                                    <input
                                        id="room-roster"
                                        type="text"
                                        className="form-control"
                                        placeholder="쉼표로 구분 (예: 민수, 수지, 지훈)"
                                        value={rosterInput}
                                        onChange={e => setRosterInput(e.target.value)}
                                    />
                                </div>
                            </div>
                            <p className="field-tip">
                                기기당 1계정 제한이 기본 적용되며, 사전 명단을 입력하면 명단에 있는 이름만 입장할 수 있습니다. (방장 닉네임 자동 포함)
                            </p>
                        </div>

                        <div className="e2ee-note">
                            <Lock size={14} />
                            <span>
                                모임 생성 시 전용 암호화 키가 자동 생성되어 초대 링크에 포함됩니다. 링크를 꼭 복사해 보관해 주세요!
                            </span>
                        </div>

                        <button type="submit" className="btn btn-primary btn-block" disabled={creating}>
                            <Sparkles size={16} />
                            {creating ? '암호화 키 생성 및 모임 개설 중...' : '프라이빗 모임 만들기'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleJoinSubmit} className="form-stack">
                        <div className="input-group">
                            <label htmlFor="invite-input">초대 링크 붙여넣기</label>
                            <input
                                id="invite-input"
                                type="text"
                                className="form-control"
                                placeholder="https://.../room/XXXXXXXX#key=..."
                                value={inviteInput}
                                onChange={e => setInviteInput(e.target.value)}
                                required
                            />
                            <p className="field-tip">
                                방장에게 받은 초대 링크 전체를 붙여넣으면 암호화 키까지 자동으로 연결됩니다.
                            </p>
                        </div>

                        <button type="submit" className="btn btn-primary btn-block">
                            모임 입장하기 <ArrowRight size={16} />
                        </button>
                    </form>
                )}
            </div>

            {recentRooms.length > 0 && (
                <div className="recent-section">
                    <h3 className="recent-title">
                        <Clock size={15} /> 최근 방문한 내 모임
                    </h3>
                    <div className="recent-grid">
                        {recentRooms.map(r => (
                            <div
                                key={r.inviteCode}
                                className="recent-card glass-card"
                                onClick={() => navigate(`/room/${r.inviteCode}#key=${r.keyString}`)}
                            >
                                <div>
                                    <div className="recent-room-name">{r.title}</div>
                                    <div className="recent-room-code">코드: {r.inviteCode}</div>
                                </div>
                                <div className="recent-actions">
                                    <button
                                        type="button"
                                        className="icon-btn danger sm"
                                        title="목록에서 제거"
                                        onClick={e => handleRemoveRecent(e, r.inviteCode)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    <ArrowRight size={16} className="accent-icon" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
