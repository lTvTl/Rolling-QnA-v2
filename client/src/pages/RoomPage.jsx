import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
    ShieldCheck, Copy, Check, Library, PlusCircle, BarChart3, Users,
    LogOut, Trash2, Pencil, Lock, CheckCircle2, Clock, Crown, Eye, EyeOff, ArrowLeft, Home
} from 'lucide-react';
import { apiRequest, QUESTION_TYPE_LABELS } from '../utils/api';
import {
    extractKeyFromHash,
    getStoredKeyForRoom,
    importRoomKey,
    encryptJson,
    decryptJson,
    saveRecentRoom,
    removeRecentRoom,
    buildInviteUrl,
    parseInviteInput
} from '../utils/e2ee';
import QuestionFormModal from '../components/QuestionFormModal';
import QuestionBankModal from '../components/QuestionBankModal';
import AnswerModal from '../components/AnswerModal';

export default function RoomPage() {
    const { inviteCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [keyString, setKeyString] = useState('');
    const [cryptoKey, setCryptoKey] = useState(null);
    const [manualLinkInput, setManualLinkInput] = useState('');
    const [keyError, setKeyError] = useState('');

    const [room, setRoom] = useState(null);
    const [meta, setMeta] = useState({ title: '', description: '' });
    const [currentMember, setCurrentMember] = useState(null);
    const [deviceMemberNickname, setDeviceMemberNickname] = useState(null);
    const [members, setMembers] = useState([]);
    const [showMembers, setShowMembers] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState('');

    // Join form state
    const [nickname, setNickname] = useState('');
    const [pin, setPin] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState('');

    // UI states
    const [copied, setCopied] = useState(false);
    const [toast, setToast] = useState('');
    const [isBankOpen, setIsBankOpen] = useState(false);
    const [formModal, setFormModal] = useState({ open: false, isEdit: false, initialData: null, title: '' });
    const [activeAnswerQ, setActiveAnswerQ] = useState(null);

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 2600);
    };

    // 1. Resolve E2EE key from URL hash or localStorage
    useEffect(() => {
        const fromHash = extractKeyFromHash(location.hash);
        const resolved = fromHash || getStoredKeyForRoom(inviteCode) || '';
        setKeyString(resolved);

        if (!resolved) {
            setCryptoKey(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        importRoomKey(resolved)
            .then(key => {
                if (!cancelled) {
                    setCryptoKey(key);
                    setKeyError('');
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCryptoKey(null);
                    setKeyError('암호화 키가 올바르지 않습니다. 방장에게 받은 전체 초대 링크를 다시 입력해 주세요.');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [inviteCode, location.hash]);

    // 2. Load room info & questions
    const loadRoomData = useCallback(async (activeKey, activeKeyStr) => {
        if (!activeKey) return;
        setLoading(true);
        setPageError('');
        try {
            const inviteData = await apiRequest(`/api/rooms/invite/${inviteCode}`);
            const roomObj = inviteData.room;
            setRoom(roomObj);
            setDeviceMemberNickname(inviteData.deviceMemberNickname || null);
            if (inviteData.deviceMemberNickname) {
                setNickname(prev => prev || inviteData.deviceMemberNickname);
            }

            let decryptedMeta = { title: '암호화된 모임', description: '' };
            try {
                decryptedMeta = await decryptJson(activeKey, roomObj.encryptedMeta);
            } catch {
                setKeyError('이 모임의 암호화 키와 일치하지 않습니다. 올바른 초대 링크를 확인해 주세요.');
                setCryptoKey(null);
                setLoading(false);
                return;
            }
            setMeta(decryptedMeta);
            saveRecentRoom({ inviteCode: roomObj.inviteCode, keyString: activeKeyStr, title: decryptedMeta.title });

            if (!inviteData.currentMember) {
                setCurrentMember(null);
                setLoading(false);
                return;
            }

            setCurrentMember(inviteData.currentMember);

            const [detailData, rawQuestions] = await Promise.all([
                apiRequest(`/api/rooms/${roomObj.id}`),
                apiRequest(`/api/rooms/${roomObj.id}/questions`)
            ]);

            setRoom(detailData.room);
            setMembers(detailData.members || []);

            const decryptedQuestions = await Promise.all(
                rawQuestions.map(async (q) => {
                    let payload = { questionText: '[복호화 실패]', options: [] };
                    try {
                        payload = await decryptJson(activeKey, q.encryptedPayload);
                    } catch {
                        // keep fallback
                    }
                    let myAnswer = null;
                    if (q.myEncryptedAnswer) {
                        try {
                            const ansObj = await decryptJson(activeKey, q.myEncryptedAnswer);
                            myAnswer = ansObj.answer;
                        } catch {
                            myAnswer = '';
                        }
                    }
                    return {
                        ...q,
                        questionText: payload.questionText || '',
                        options: Array.isArray(payload.options) ? payload.options : [],
                        myAnswer
                    };
                })
            );

            setQuestions(decryptedQuestions);
        } catch (err) {
            if (err.status === 404) {
                removeRecentRoom(inviteCode);
            }
            setPageError(err.message || '모임 정보를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [inviteCode]);

    useEffect(() => {
        if (cryptoKey && keyString) {
            loadRoomData(cryptoKey, keyString);
        }
    }, [cryptoKey, keyString, loadRoomData]);

    const handleUnlockWithLink = (e) => {
        e.preventDefault();
        const parsed = parseInviteInput(manualLinkInput);
        if (!parsed.keyString) {
            setKeyError('링크에 #key=... 암호화 키가 포함되어 있어야 합니다.');
            return;
        }
        const targetCode = parsed.inviteCode || inviteCode;
        navigate(`/room/${targetCode}#key=${parsed.keyString}`, { replace: true });
    };

    const handleJoin = async (e) => {
        e.preventDefault();
        setJoinError('');
        setJoining(true);
        try {
            await apiRequest(`/api/rooms/invite/${inviteCode}/join`, {
                method: 'POST',
                body: { nickname: nickname.trim(), pin: pin.trim() }
            });
            setNickname('');
            setPin('');
            await loadRoomData(cryptoKey, keyString);
        } catch (err) {
            setJoinError(err.message || '입장에 실패했습니다.');
        } finally {
            setJoining(false);
        }
    };

    const handleCopyInvite = async () => {
        const url = buildInviteUrl(room.inviteCode, keyString);
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            showToast('암호화 키가 포함된 초대 링크가 복사되었습니다!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            prompt('아래 초대 링크를 복사해 친구들에게 공유하세요:', url);
        }
    };

    const handleSaveQuestion = async ({ id, type, questionText, options, isAnonymous }) => {
        const encryptedPayload = await encryptJson(cryptoKey, { questionText, options });
        if (id) {
            await apiRequest(`/api/rooms/${room.id}/questions/${id}`, {
                method: 'PUT',
                body: { type, encryptedPayload }
            });
            showToast('질문이 수정되었습니다.');
        } else {
            await apiRequest(`/api/rooms/${room.id}/questions`, {
                method: 'POST',
                body: { type, encryptedPayload, isAnonymous }
            });
            showToast('새 질문이 등록되었습니다.');
        }
        await loadRoomData(cryptoKey, keyString);
    };

    const handleQuickAddFromBank = async (bankItem) => {
        const encryptedPayload = await encryptJson(cryptoKey, {
            questionText: bankItem.questionText,
            options: bankItem.options || []
        });
        const res = await apiRequest(`/api/rooms/${room.id}/questions`, {
            method: 'POST',
            body: {
                type: bankItem.type,
                encryptedPayload,
                isAnonymous: false
            }
        });
        // Increment bank usage in background
        apiRequest('/api/question-bank/use', {
            method: 'POST',
            body: { ids: [bankItem.id] }
        }).catch(() => {});

        await loadRoomData(cryptoKey, keyString);
        showToast('질문 은행에서 모임으로 추가되었습니다!');
        return {
            id: res.ids[0],
            type: bankItem.type,
            questionText: bankItem.questionText,
            options: bankItem.options || [],
            isAnonymous: false
        };
    };

    const handleDeleteQuestion = async (e, qId) => {
        e.stopPropagation();
        if (!window.confirm('이 질문을 삭제하시겠습니까? 연결된 답변도 함께 삭제됩니다.')) return;
        try {
            await apiRequest(`/api/rooms/${room.id}/questions/${qId}`, { method: 'DELETE' });
            showToast('질문이 삭제되었습니다.');
            await loadRoomData(cryptoKey, keyString);
        } catch (err) {
            alert(err.message);
        }
    };

    const handleSubmitAnswer = async (questionId, answerText) => {
        const encryptedAnswer = await encryptJson(cryptoKey, { answer: answerText });
        await apiRequest(`/api/rooms/${room.id}/questions/${questionId}/answer`, {
            method: 'PUT',
            body: { encryptedAnswer }
        });
        showToast('답변이 암호화되어 저장되었습니다!');
        await loadRoomData(cryptoKey, keyString);
    };

    const handleToggleReveal = async () => {
        try {
            const next = !room.isRevealed;
            await apiRequest(`/api/rooms/${room.id}/reveal`, {
                method: 'PATCH',
                body: { isRevealed: next }
            });
            setRoom(prev => ({ ...prev, isRevealed: next }));
            showToast(next ? '이제 모든 모임원이 답변 결과를 볼 수 있습니다!' : '결과 공개가 방장 전용으로 전환되었습니다.');
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteRoom = async () => {
        if (!window.confirm('정말로 이 모임을 삭제하시겠습니까? 모든 질문과 답변이 영구 삭제됩니다.')) return;
        try {
            await apiRequest(`/api/rooms/${room.id}`, { method: 'DELETE' });
            removeRecentRoom(room.inviteCode);
            navigate('/');
        } catch (err) {
            alert(err.message);
        }
    };

    const handleLeave = async () => {
        if (room) {
            await apiRequest(`/api/rooms/${room.id}/leave`, { method: 'POST' }).catch(() => {});
        }
        setCurrentMember(null);
    };

    // Case 1: Missing or invalid E2EE key
    if (!cryptoKey && !loading) {
        return (
            <div className="center-view">
                <div className="glass-card auth-card">
                    <button type="button" className="logo-btn auth-logo" onClick={() => navigate('/')}>
                        Rolling <span className="accent-text">Q&A</span>
                    </button>
                    <div className="center-icon"><Lock size={34} /></div>
                    <h2>암호화 키가 필요합니다</h2>
                    <p className="card-desc">
                        이 모임은 종단간 암호화(E2EE)로 보호되고 있습니다. 방장에게 받은 <strong>전체 초대 링크(#key=... 포함)</strong>를 붙여넣어 주세요.
                    </p>
                    {keyError && <div className="alert-box error">{keyError}</div>}
                    <form onSubmit={handleUnlockWithLink} className="form-stack">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="https://.../room/XXXXXXXX#key=..."
                            value={manualLinkInput}
                            onChange={e => setManualLinkInput(e.target.value)}
                            required
                        />
                        <button type="submit" className="btn btn-primary btn-block">모임 잠금 해제</button>
                        <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('/')}>
                            홈으로 돌아가기
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (loading) {
        return <div className="center-view"><div className="loading-text">암호화된 모임 데이터를 복호화하는 중...</div></div>;
    }

    if (pageError) {
        return (
            <div className="center-view">
                <div className="glass-card auth-card">
                    <h2>모임을 찾을 수 없습니다</h2>
                    <p className="card-desc">{pageError}</p>
                    <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/')}>
                        <ArrowLeft size={16} /> 홈으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    // Case 2: Valid key & room, but user hasn't joined with nickname + PIN yet
    if (!currentMember) {
        const hasRoster = Array.isArray(room?.allowedNicknames) && room.allowedNicknames.length > 0;
        const joinedSet = new Set(room?.joinedNicknames || []);

        return (
            <div className="center-view">
                <div className="glass-card auth-card">
                    <button type="button" className="logo-btn auth-logo" onClick={() => navigate('/')}>
                        Rolling <span className="accent-text">Q&A</span>
                    </button>
                    <h1 className="join-room-title">{meta.title}</h1>
                    {meta.description && <p className="card-desc">{meta.description}</p>}
                    <p className="member-count-hint">
                        <Users size={14} /> 현재 {room?.memberCount || 0}명 참여 중
                        {room?.maxMembers ? ` / 최대 ${room.maxMembers}명` : ''}
                    </p>

                    {deviceMemberNickname && (
                        <div className="device-hint-box">
                            이 브라우저에서는 이미 <strong>{deviceMemberNickname}</strong> 닉네임으로 참여했습니다. 기존 닉네임과 PIN으로 재접속해 주세요.
                        </div>
                    )}

                    {joinError && <div className="alert-box error">{joinError}</div>}

                    <form onSubmit={handleJoin} className="form-stack" style={{ marginTop: 18 }}>
                        {hasRoster ? (
                            <div className="input-group">
                                <label>사전 등록 명단에서 본인 이름 선택</label>
                                <div className="roster-pills">
                                    {room.allowedNicknames.map(name => {
                                        const isTaken = joinedSet.has(name);
                                        const isSelected = nickname === name;
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                className={`roster-pill ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}`}
                                                onClick={() => setNickname(name)}
                                            >
                                                <span>{name}</span>
                                                <small>{isTaken ? '재접속' : '첫 입장'}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="input-group">
                                <label htmlFor="join-nick">모임에서 사용할 닉네임</label>
                                <input
                                    id="join-nick"
                                    type="text"
                                    className="form-control"
                                    placeholder="예: 민수, 수지"
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                    maxLength={20}
                                    required
                                />
                            </div>
                        )}
                        <div className="input-group">
                            <label htmlFor="join-pin">간단 PIN (4자 이상)</label>
                            <input
                                id="join-pin"
                                type="password"
                                className="form-control"
                                placeholder={joinedSet.has(nickname) ? '기존에 설정한 PIN 입력' : '재접속 시 본인 확인용 PIN 설정'}
                                value={pin}
                                onChange={e => setPin(e.target.value)}
                                minLength={4}
                                maxLength={20}
                                required
                            />
                            <p className="field-tip">
                                기기당 1계정만 생성할 수 있으며, 기존 닉네임+PIN으로 언제든 재접속됩니다.
                            </p>
                        </div>
                        <button type="submit" className="btn btn-primary btn-block" disabled={joining || !nickname.trim()}>
                            {joining ? '입장 중...' : joinedSet.has(nickname) ? '기존 계정으로 재접속' : '모임 입장하기'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Case 3: Joined Room Dashboard
    const isHost = currentMember.role === 'host';
    const totalCount = questions.length;
    const completedCount = questions.filter(q => q.answered).length;
    const pendingCount = totalCount - completedCount;
    const canOpenReveal = isHost || room.isRevealed;

    return (
        <div className="room-page">
            {toast && <div className="toast-banner">{toast}</div>}

            {/* Header */}
            <header className="top-header glass-card">
                <div className="header-left">
                    <button
                        type="button"
                        className="logo-btn"
                        title="현재 모임 처음 화면으로"
                        onClick={() => {
                            setIsBankOpen(false);
                            setFormModal(prev => ({ ...prev, open: false }));
                            setActiveAnswerQ(null);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                    >
                        Rolling <span className="accent-text">Q&A</span>
                    </button>
                </div>

                <div className="header-right">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyInvite}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? '링크 복사됨' : '초대 링크 복사'}
                    </button>

                    {canOpenReveal && (
                        <button
                            type="button"
                            className="btn btn-accent btn-sm"
                            onClick={() => navigate(`/room/${room.inviteCode}/reveal#key=${keyString}`)}
                        >
                            <BarChart3 size={14} /> 답변 공개
                        </button>
                    )}

                    <div className="user-pill">
                        {isHost && <Crown size={13} className="crown-icon" />}
                        <span>{currentMember.nickname}</span>
                    </div>

                    <button type="button" className="icon-btn" onClick={() => navigate('/')} title="전체 홈 (다른 모임 이동)">
                        <Home size={16} />
                    </button>

                    <button type="button" className="icon-btn" onClick={handleLeave} title="모임 로그아웃">
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* Room Banner & Stats */}
            <section className="room-hero">
                <div className="room-hero-text">
                    <div className="room-code-tag">초대 코드: {room.inviteCode}</div>
                    <h1>{meta.title}</h1>
                    {meta.description && <p className="room-desc">{meta.description}</p>}
                </div>

                <div className="stats-row">
                    <div className="stat-box">
                        <div className="stat-num">{totalCount}</div>
                        <div className="stat-label">전체 질문</div>
                    </div>
                    <div className="stat-box success">
                        <div className="stat-num">{completedCount}</div>
                        <div className="stat-label">답변 완료</div>
                    </div>
                    <div className="stat-box warning">
                        <div className="stat-num">{pendingCount}</div>
                        <div className="stat-label">미완료</div>
                    </div>
                    <button
                        type="button"
                        className="stat-box clickable"
                        onClick={() => setShowMembers(v => !v)}
                    >
                        <div className="stat-num">{members.length}</div>
                        <div className="stat-label">참여자</div>
                    </button>
                </div>
            </section>

            {/* Expandable Members Drawer */}
            {showMembers && (
                <div className="members-bar glass-card">
                    <div className="members-bar-title">
                        <Users size={15} /> 참여 중인 멤버 ({members.length}명)
                    </div>
                    <div className="members-chips">
                        {members.map(m => (
                            <span key={m.id} className={`member-chip ${m.role === 'host' ? 'host' : ''}`}>
                                {m.role === 'host' && <Crown size={12} />}
                                {m.nickname}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Host Controls */}
            {isHost && (
                <div className="host-bar glass-card">
                    <div className="host-bar-info">
                        <Crown size={16} className="crown-icon" />
                        <span>방장 컨트롤</span>
                    </div>
                    <div className="host-bar-actions">
                        <button
                            type="button"
                            className={`btn btn-sm ${room.isRevealed ? 'btn-success' : 'btn-secondary'}`}
                            onClick={handleToggleReveal}
                        >
                            {room.isRevealed ? <Eye size={14} /> : <EyeOff size={14} />}
                            {room.isRevealed ? '모임원 결과 공개 ON' : '모임원 결과 공개 OFF'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger-outline btn-sm"
                            onClick={handleDeleteRoom}
                        >
                            <Trash2 size={14} /> 모임 삭제
                        </button>
                    </div>
                </div>
            )}

            {/* Question Action Toolbar */}
            <div className="section-toolbar">
                <h2>
                    질문 리스트 <span className="count-pill">{totalCount}</span>
                </h2>
                <div className="toolbar-buttons">
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setIsBankOpen(true)}
                    >
                        <Library size={15} /> 질문 은행에서 추가
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFormModal({
                            open: true,
                            isEdit: false,
                            initialData: null,
                            title: '새 질문 직접 만들기'
                        })}
                    >
                        <PlusCircle size={15} /> 직접 작성
                    </button>
                </div>
            </div>

            {/* Questions Grid */}
            {questions.length === 0 ? (
                <div className="empty-card glass-card">
                    <Library size={40} className="muted-icon" />
                    <h3>아직 등록된 질문이 없어요</h3>
                    <p>
                        <strong>질문 은행</strong>에서 클릭 몇 번으로 재미있는 질문을 골라 추가하거나 직접 만들어 보세요!
                    </p>
                    <div className="empty-actions">
                        <button type="button" className="btn btn-primary" onClick={() => setIsBankOpen(true)}>
                            <Library size={16} /> 질문 은행 열기
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setFormModal({ open: true, isEdit: false, initialData: null, title: '새 질문 직접 만들기' })}
                        >
                            <PlusCircle size={16} /> 직접 작성하기
                        </button>
                    </div>
                </div>
            ) : (
                <div className="questions-grid">
                    {questions.map(q => (
                        <div
                            key={q.id}
                            className={`question-card glass-card ${q.answered ? 'answered' : ''}`}
                            onClick={() => setActiveAnswerQ(q)}
                        >
                            <div className="q-card-top">
                                <div className="badge-row">
                                    <span className={`badge-type ${q.type}`}>
                                        {QUESTION_TYPE_LABELS[q.type]}
                                    </span>
                                    {q.isAnonymous && (
                                        <span className="badge-anon">
                                            <Lock size={11} /> 익명
                                        </span>
                                    )}
                                </div>
                                <div className="q-card-status">
                                    {q.answered ? (
                                        <span className="badge-done"><CheckCircle2 size={12} /> 완료</span>
                                    ) : (
                                        <span className="badge-pending"><Clock size={12} /> 미완료</span>
                                    )}
                                </div>
                            </div>

                            <div className="q-card-text">{q.questionText}</div>

                            <div className="q-card-footer">
                                <span className="q-meta-info">
                                    by {q.creatorNickname} · {q.answerCount}명 답변
                                </span>
                                <div className="q-card-btns">
                                    {q.canEdit && (
                                        <>
                                            <button
                                                type="button"
                                                className="icon-btn sm"
                                                title="질문 수정"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFormModal({
                                                        open: true,
                                                        isEdit: true,
                                                        initialData: q,
                                                        title: '질문 수정하기'
                                                    });
                                                }}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-btn danger sm"
                                                title="질문 삭제"
                                                onClick={(e) => handleDeleteQuestion(e, q.id)}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}
            <QuestionBankModal
                isOpen={isBankOpen}
                onClose={() => setIsBankOpen(false)}
                onQuickAdd={handleQuickAddFromBank}
                currentNickname={currentMember.nickname}
                onEditAddedQuestion={(addedQ) => {
                    setIsBankOpen(false);
                    setFormModal({
                        open: true,
                        isEdit: true,
                        initialData: addedQ,
                        title: '방금 추가한 질문 수정하기'
                    });
                }}
                onEditBeforeAdd={(bankItem) => {
                    setIsBankOpen(false);
                    setFormModal({
                        open: true,
                        isEdit: false,
                        initialData: {
                            type: bankItem.type,
                            questionText: bankItem.questionText,
                            options: bankItem.options || [],
                            isAnonymous: false
                        },
                        title: '질문 은행 내용 수정 후 추가'
                    });
                }}
            />

            <QuestionFormModal
                isOpen={formModal.open}
                onClose={() => setFormModal(prev => ({ ...prev, open: false }))}
                onSubmit={handleSaveQuestion}
                initialData={formModal.initialData}
                isEdit={formModal.isEdit}
                title={formModal.title}
            />

            <AnswerModal
                question={activeAnswerQ}
                onClose={() => setActiveAnswerQ(null)}
                onSubmit={handleSubmitAnswer}
            />
        </div>
    );
}
