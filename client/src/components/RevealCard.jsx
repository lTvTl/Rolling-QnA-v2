import React, { useState } from 'react';
import { Users, Eye, Lock, Trash2 } from 'lucide-react';
import { QUESTION_TYPE_LABELS } from '../utils/api';

export default function RevealCard({
    question,
    answers,
    mode,
    onModeChange,
    isHost,
    onDeleteAnswer
}) {
    const [revealedIds, setRevealedIds] = useState({});
    const total = answers.length;

    const getAuthorLabel = (ans) => {
        if (question.isAnonymous || !ans.authorNickname) {
            return { text: '완전익명', canReveal: false };
        }
        if (mode === 'standard') {
            return { text: ans.authorNickname, canReveal: false };
        }
        if (mode === 'select') {
            if (revealedIds[ans.id]) {
                return { text: ans.authorNickname, canReveal: false };
            }
            return { text: '익명', canReveal: true };
        }
        return { text: '익명', canReveal: false };
    };

    const revealOne = (ansId) => {
        setRevealedIds(prev => ({ ...prev, [ansId]: true }));
    };

    // Subjective frequency stats
    const freqList = question.type === 'subjective'
        ? Object.entries(
            answers.reduce((acc, a) => {
                const key = (a.answer || '').trim();
                if (key) acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {})
        ).sort((a, b) => b[1] - a[1])
        : [];

    return (
        <div className="reveal-card glass-card">
            <div className="reveal-card-top">
                <div className="badge-row">
                    <span className={`badge-type ${question.type}`}>
                        {QUESTION_TYPE_LABELS[question.type]}
                    </span>
                    {question.isAnonymous && (
                        <span className="badge-anon">
                            <Lock size={12} /> 완전 익명
                        </span>
                    )}
                    <span className="count-pill">
                        <Users size={13} /> {total}명 참여
                    </span>
                </div>

                {!question.isAnonymous && (
                    <div className="segmented-toggle sm">
                        <button
                            type="button"
                            className={mode === 'anon' ? 'active' : ''}
                            onClick={() => onModeChange('anon')}
                        >
                            익명
                        </button>
                        <button
                            type="button"
                            className={mode === 'standard' ? 'active' : ''}
                            onClick={() => onModeChange('standard')}
                        >
                            실명
                        </button>
                        <button
                            type="button"
                            className={mode === 'select' ? 'active' : ''}
                            onClick={() => onModeChange('select')}
                        >
                            선택공개
                        </button>
                    </div>
                )}
            </div>

            <h3 className="reveal-question-text">{question.questionText}</h3>

            {question.type === 'multiple' && (
                <div className="chart-section">
                    {question.options.map((opt, idx) => {
                        const optAnswers = answers.filter(a => a.answer === opt);
                        const count = optAnswers.length;
                        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                            <div key={idx} className="chart-bar-block">
                                <div className="chart-bar-label">
                                    <span>{opt}</span>
                                    <span className="chart-bar-count">{count}명 ({percent}%)</span>
                                </div>
                                <div className="chart-bar-track">
                                    <div className="chart-bar-fill" style={{ width: `${percent}%` }} />
                                </div>
                                {(mode === 'standard' || mode === 'select') && !question.isAnonymous && optAnswers.length > 0 && (
                                    <div className="voter-chips">
                                        {optAnswers.map(ans => {
                                            const label = getAuthorLabel(ans);
                                            return (
                                                <span key={ans.id} className="voter-chip">
                                                    {label.text}
                                                    {label.canReveal && (
                                                        <button
                                                            type="button"
                                                            className="chip-reveal-btn"
                                                            onClick={() => revealOne(ans.id)}
                                                            title="작성자 공개"
                                                        >
                                                            <Eye size={11} />
                                                        </button>
                                                    )}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {(question.type === 'subjective' || question.type === 'essay') && (
                <div className="answers-list">
                    {answers.length === 0 ? (
                        <div className="empty-inline">아직 제출된 답변이 없습니다.</div>
                    ) : (
                        answers.map(ans => {
                            const label = getAuthorLabel(ans);
                            return (
                                <div key={ans.id} className={`reveal-answer-row ${question.type}`}>
                                    <div className="reveal-answer-author">
                                        <span>{label.text}</span>
                                        {label.canReveal && (
                                            <button
                                                type="button"
                                                className="btn-inline-reveal"
                                                onClick={() => revealOne(ans.id)}
                                            >
                                                <Eye size={12} /> 확인
                                            </button>
                                        )}
                                    </div>
                                    <div className="reveal-answer-body">{ans.answer}</div>
                                    {isHost && (
                                        <button
                                            type="button"
                                            className="icon-btn danger sm"
                                            title="답변 삭제 (방장 전용)"
                                            onClick={() => onDeleteAnswer(ans.id)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {question.type === 'subjective' && freqList.length > 0 && (
                <div className="chart-section freq-section">
                    <h4 className="sub-section-title">답변 빈도 차트</h4>
                    {freqList.map(([text, count]) => {
                        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                            <div key={text} className="chart-bar-block">
                                <div className="chart-bar-label">
                                    <span>"{text}"</span>
                                    <span className="chart-bar-count">{count}명 ({percent}%)</span>
                                </div>
                                <div className="chart-bar-track">
                                    <div className="chart-bar-fill" style={{ width: `${percent}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
