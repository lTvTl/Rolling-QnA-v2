import React, { useState, useEffect } from 'react';
import { X, Send, Lock, CheckCircle2 } from 'lucide-react';
import { QUESTION_TYPE_LABELS } from '../utils/api';

export default function AnswerModal({ question, onClose, onSubmit }) {
    const [answer, setAnswer] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (question) {
            setAnswer(question.myAnswer || '');
            setError('');
        }
    }, [question]);

    if (!question) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const trimmed = answer.trim();
        if (!trimmed) {
            setError('답변을 입력하거나 보기를 선택해 주세요.');
            return;
        }
        setSubmitting(true);
        try {
            await onSubmit(question.id, trimmed);
            onClose();
        } catch (err) {
            setError(err.message || '답변 저장에 실패했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel glass-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="badge-row">
                        <span className={`badge-type ${question.type}`}>
                            {QUESTION_TYPE_LABELS[question.type]}
                        </span>
                        {question.isAnonymous && (
                            <span className="badge-anon">
                                <Lock size={12} /> 완전 익명
                            </span>
                        )}
                        {question.answered && (
                            <span className="badge-done">
                                <CheckCircle2 size={12} /> 답변 완료
                            </span>
                        )}
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
                        <X size={20} />
                    </button>
                </div>

                <h2 className="answer-question-title">{question.questionText}</h2>
                {question.isAnonymous && (
                    <p className="anon-notice">
                        이 질문은 완전 익명 모드입니다. 방장을 포함해 누구도 작성자를 확인할 수 없습니다.
                    </p>
                )}

                {error && <div className="alert-box error">{error}</div>}

                <form onSubmit={handleSubmit} className="form-stack">
                    {question.type === 'multiple' ? (
                        <div className="radio-options-list">
                            {question.options.map((opt, idx) => {
                                const selected = answer === opt;
                                return (
                                    <label key={idx} className={`radio-option ${selected ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="answer-choice"
                                            value={opt}
                                            checked={selected}
                                            onChange={() => setAnswer(opt)}
                                        />
                                        <span>{opt}</span>
                                    </label>
                                );
                            })}
                        </div>
                    ) : question.type === 'essay' ? (
                        <textarea
                            rows={6}
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            placeholder="생각을 자유롭게 적어주세요..."
                            className="form-control"
                            required
                        />
                    ) : (
                        <input
                            type="text"
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            placeholder="답변을 입력해 주세요 (단답형)"
                            className="form-control"
                            required
                        />
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            취소
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            <Send size={15} /> {submitting ? '암호화 저장 중...' : question.answered ? '답변 수정하기' : '답변 제출하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
