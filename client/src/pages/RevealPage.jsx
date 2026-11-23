import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { apiRequest } from '../utils/api';
import {
    extractKeyFromHash,
    getStoredKeyForRoom,
    importRoomKey,
    decryptJson
} from '../utils/e2ee';
import RevealCard from '../components/RevealCard';

export default function RevealPage() {
    const { inviteCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [showIntro, setShowIntro] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [room, setRoom] = useState(null);
    const [meta, setMeta] = useState({ title: '' });
    const [currentMember, setCurrentMember] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [cardModes, setCardModes] = useState({});
    const [globalMode, setGlobalMode] = useState('anon');

    const keyString = extractKeyFromHash(location.hash) || getStoredKeyForRoom(inviteCode) || '';

    const loadRevealData = useCallback(async () => {
        if (!keyString) {
            setError('암호화 키가 없어 결과를 복호화할 수 없습니다.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const cryptoKey = await importRoomKey(keyString);
            const inviteData = await apiRequest(`/api/rooms/invite/${inviteCode}`);
            if (!inviteData.currentMember) {
                navigate(`/room/${inviteCode}#key=${keyString}`, { replace: true });
                return;
            }
            setCurrentMember(inviteData.currentMember);

            const revealData = await apiRequest(`/api/rooms/${inviteData.room.id}/reveal`);
            setRoom(revealData.room);

            const decryptedMeta = await decryptJson(cryptoKey, revealData.room.encryptedMeta);
            setMeta(decryptedMeta);

            const decQuestions = await Promise.all(
                revealData.questions.map(async q => {
                    let payload = { questionText: '[복호화 실패]', options: [] };
                    try {
                        payload = await decryptJson(cryptoKey, q.encryptedPayload);
                    } catch {
                        // ignore
                    }
                    return {
                        ...q,
                        questionText: payload.questionText || '',
                        options: Array.isArray(payload.options) ? payload.options : []
                    };
                })
            );

            const decAnswers = await Promise.all(
                revealData.answers.map(async a => {
                    let text = '[복호화 실패]';
                    try {
                        const obj = await decryptJson(cryptoKey, a.encryptedAnswer);
                        text = obj.answer || '';
                    } catch {
                        // ignore
                    }
                    return { ...a, answer: text };
                })
            );

            setQuestions(decQuestions);
            setAnswers(decAnswers);
            setCardModes(prev => {
                const next = { ...prev };
                decQuestions.forEach(q => {
                    if (!next[q.id]) next[q.id] = 'anon';
                });
                return next;
            });
        } catch (err) {
            setError(err.message || '답변 공개 데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [inviteCode, keyString, navigate]);

    useEffect(() => {
        loadRevealData();
    }, [loadRevealData]);

    const handleGlobalMode = (nextMode) => {
        setGlobalMode(nextMode);
        const updated = {};
        questions.forEach(q => { updated[q.id] = nextMode; });
        setCardModes(updated);
    };

    const handleCardModeChange = (qId, nextMode) => {
        setCardModes(prev => {
            const next = { ...prev, [qId]: nextMode };
            const values = Object.values(next);
            if (values.every(v => v === 'anon')) setGlobalMode('anon');
            else if (values.every(v => v === 'standard')) setGlobalMode('standard');
            else setGlobalMode('mixed');
            return next;
        });
    };

    const handleDeleteAnswer = async (answerId) => {
        if (!window.confirm('이 답변을 삭제하시겠습니까?')) return;
        try {
            await apiRequest(`/api/rooms/${room.id}/answers/${answerId}`, { method: 'DELETE' });
            setAnswers(prev => prev.filter(a => a.id !== answerId));
        } catch (err) {
            alert(err.message);
        }
    };

    const goBackToRoom = () => {
        navigate(`/room/${inviteCode}#key=${keyString}`);
    };

    if (loading) {
        return <div className="center-view"><div className="loading-text">답변 결과를 복호화하는 중...</div></div>;
    }

    if (error) {
        return (
            <div className="center-view">
                <div className="glass-card auth-card">
                    <h2>답변을 확인할 수 없습니다</h2>
                    <p className="card-desc">{error}</p>
                    <button type="button" className="btn btn-primary btn-block" onClick={goBackToRoom}>
                        <ArrowLeft size={16} /> 모임으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    if (showIntro) {
        return (
            <div className="center-view">
                <div className="glass-card intro-card">
                    <Gamepad2 size={54} className="accent-icon" style={{ marginBottom: 20 }} />
                    <h2>안내사항</h2>
                    <p className="intro-slogan">"게임은 게임일 뿐, 즐깁시다!"</p>
                    <p className="card-desc">
                        모든 답변은 즐거운 대화를 위해 공개됩니다. 서로의 답변에 과몰입하거나 상처받지 않도록 웃으며 즐겨주세요!
                    </p>
                    <div className="intro-actions">
                        <button type="button" className="btn btn-secondary" onClick={goBackToRoom}>
                            돌아가기
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => setShowIntro(false)}>
                            결과 확인하기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isHost = currentMember?.role === 'host';

    return (
        <div className="reveal-page">
            <header className="top-header glass-card">
                <div className="header-left">
                    <button
                        type="button"
                        className="logo-btn"
                        title="현재 모임 처음 화면으로 돌아가기"
                        onClick={goBackToRoom}
                    >
                        Rolling <span className="accent-text">Q&A</span>
                    </button>
                </div>
                <div className="header-right">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={goBackToRoom}>
                        <ArrowLeft size={14} /> {meta.title || '모임'}으로 돌아가기
                    </button>
                </div>
            </header>

            <div className="reveal-header">
                <div>
                    <h1>📊 답변 공개 모드</h1>
                    <p className="room-desc">
                        익명 · 실명 · 선택공개 모드를 자유롭게 전환하며 이야기를 나눠보세요.
                    </p>
                </div>

                <div className="reveal-controls">
                    <button type="button" className="icon-btn" onClick={loadRevealData} title="새로고침">
                        <RefreshCw size={16} />
                    </button>
                    <div className="segmented-toggle">
                        <button
                            type="button"
                            className={globalMode === 'anon' ? 'active' : ''}
                            onClick={() => handleGlobalMode('anon')}
                        >
                            <EyeOff size={14} /> 전체 익명
                        </button>
                        <button
                            type="button"
                            className={globalMode === 'standard' ? 'active' : ''}
                            onClick={() => handleGlobalMode('standard')}
                        >
                            <Eye size={14} /> 전체 실명
                        </button>
                    </div>
                </div>
            </div>

            {questions.length === 0 ? (
                <div className="empty-card glass-card">
                    <h3>등록된 질문이 없습니다.</h3>
                </div>
            ) : (
                <div className="reveal-list">
                    {questions.map(q => (
                        <RevealCard
                            key={q.id}
                            question={q}
                            answers={answers.filter(a => a.questionId === q.id)}
                            mode={cardModes[q.id] || 'anon'}
                            onModeChange={(nextMode) => handleCardModeChange(q.id, nextMode)}
                            isHost={isHost}
                            onDeleteAnswer={handleDeleteAnswer}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
