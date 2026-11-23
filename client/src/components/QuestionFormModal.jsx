import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Lock, Sparkles } from 'lucide-react';

export default function QuestionFormModal({
    isOpen,
    onClose,
    onSubmit,
    initialData = null,
    isEdit = false,
    title = '새 질문 만들기'
}) {
    const [type, setType] = useState('subjective');
    const [questionText, setQuestionText] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setError('');
        if (initialData) {
            setType(initialData.type || 'subjective');
            setQuestionText(initialData.questionText || '');
            setOptions(
                Array.isArray(initialData.options) && initialData.options.length >= 2
                    ? [...initialData.options]
                    : ['', '']
            );
            setIsAnonymous(Boolean(initialData.isAnonymous));
        } else {
            setType('subjective');
            setQuestionText('');
            setOptions(['', '']);
            setIsAnonymous(false);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleOptionChange = (index, value) => {
        setOptions(prev => prev.map((opt, i) => (i === index ? value : opt)));
    };

    const handleAddOption = () => {
        if (options.length >= 10) return;
        setOptions(prev => [...prev, '']);
    };

    const handleRemoveOption = (index) => {
        if (options.length <= 2) return;
        setOptions(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const cleanText = questionText.trim();
        if (!cleanText) {
            setError('질문 내용을 입력해 주세요.');
            return;
        }

        let cleanOptions = [];
        if (type === 'multiple') {
            cleanOptions = options.map(o => o.trim()).filter(Boolean);
            if (cleanOptions.length < 2) {
                setError('객관식 보기는 최소 2개 이상 입력해 주세요.');
                return;
            }
        }

        setSubmitting(true);
        try {
            await onSubmit({
                id: initialData?.id,
                type,
                questionText: cleanText,
                options: cleanOptions,
                isAnonymous
            });
            onClose();
        } catch (err) {
            setError(err.message || '질문 저장에 실패했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel glass-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">
                        <Sparkles size={20} className="accent-icon" />
                        {title}
                    </h3>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
                        <X size={20} />
                    </button>
                </div>

                {error && <div className="alert-box error">{error}</div>}

                <form onSubmit={handleSubmit} className="form-stack">
                    <div className="input-group">
                        <label htmlFor="q-type">질문 유형</label>
                        <select
                            id="q-type"
                            value={type}
                            onChange={e => setType(e.target.value)}
                            className="form-control"
                        >
                            <option value="subjective">주관식 (단답형)</option>
                            <option value="multiple">객관식 (선택형)</option>
                            <option value="essay">서술형 (자유롭게 길게)</option>
                        </select>
                    </div>

                    <div className="input-group">
                        <label htmlFor="q-text">질문 내용</label>
                        <textarea
                            id="q-text"
                            rows={3}
                            value={questionText}
                            onChange={e => setQuestionText(e.target.value)}
                            placeholder="모임 사람들에게 물어볼 질문을 입력해 주세요"
                            className="form-control"
                            required
                        />
                    </div>

                    {type === 'multiple' && (
                        <div className="input-group">
                            <label>객관식 보기 (최소 2개)</label>
                            <div className="options-editor">
                                {options.map((opt, idx) => (
                                    <div key={idx} className="option-row">
                                        <input
                                            type="text"
                                            value={opt}
                                            onChange={e => handleOptionChange(idx, e.target.value)}
                                            placeholder={`보기 ${idx + 1}`}
                                            className="form-control"
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="icon-btn danger"
                                            onClick={() => handleRemoveOption(idx)}
                                            disabled={options.length <= 2}
                                            title="보기 삭제"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={handleAddOption}
                                disabled={options.length >= 10}
                            >
                                <Plus size={15} /> 보기 추가
                            </button>
                        </div>
                    )}

                    <label className={`checkbox-card ${isEdit ? 'disabled' : ''}`}>
                        <input
                            type="checkbox"
                            checked={isAnonymous}
                            disabled={isEdit}
                            onChange={e => setIsAnonymous(e.target.checked)}
                        />
                        <div>
                            <div className="checkbox-title">
                                <Lock size={14} /> 완전 익명 질문으로 설정
                            </div>
                            <p className="checkbox-desc">
                                {isEdit
                                    ? '데이터 정합성을 위해 등록 후에는 익명 설정을 변경할 수 없습니다.'
                                    : '방장을 포함해 누구도 답변 작성자를 알 수 없습니다.'}
                            </p>
                        </div>
                    </label>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            취소
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? '암호화 및 저장 중...' : isEdit ? '수정 완료' : '질문 등록하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
