import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Plus, Pencil, Check, Library, Share2, Trash2 } from 'lucide-react';
import { apiRequest, QUESTION_TYPE_LABELS } from '../utils/api';

const PRESET_CATEGORIES = ['아이스브레이킹', '밸런스게임', 'TMI & 일상', '가치관', '모임 & 추억'];

export default function QuestionBankModal({
    isOpen,
    onClose,
    onQuickAdd,
    onEditAddedQuestion,
    onEditBeforeAdd,
    currentNickname
}) {
    const [tab, setTab] = useState('browse'); // 'browse' | 'share'
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('전체');
    const [selectedType, setSelectedType] = useState('');
    const [search, setSearch] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [addingId, setAddingId] = useState(null);
    // Map of bankItemId -> newly created room question object (for immediate editing!)
    const [addedMap, setAddedMap] = useState({});
    const [error, setError] = useState('');

    // Share new question form state
    const [shareCategory, setShareCategory] = useState('아이스브레이킹');
    const [shareType, setShareType] = useState('subjective');
    const [shareText, setShareText] = useState('');
    const [shareOptions, setShareOptions] = useState(['', '']);
    const [shareSubmitting, setShareSubmitting] = useState(false);
    const [shareSuccess, setShareSuccess] = useState('');

    const fetchBank = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (selectedCategory !== '전체') params.set('category', selectedCategory);
            if (selectedType) params.set('type', selectedType);
            if (search.trim()) params.set('search', search.trim());
            const data = await apiRequest(`/api/question-bank?${params.toString()}`);
            setCategories(data.categories || []);
            setItems(data.items || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedCategory, selectedType, search]);

    useEffect(() => {
        if (isOpen && tab === 'browse') {
            const timer = setTimeout(fetchBank, 150);
            return () => clearTimeout(timer);
        }
    }, [isOpen, tab, fetchBank]);

    useEffect(() => {
        if (isOpen) {
            setAddedMap({});
            setShareSuccess('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleQuickAddClick = async (item) => {
        setAddingId(item.id);
        setError('');
        try {
            const createdQuestion = await onQuickAdd(item);
            setAddedMap(prev => ({ ...prev, [item.id]: createdQuestion }));
        } catch (err) {
            setError(err.message || '질문 추가에 실패했습니다.');
        } finally {
            setAddingId(null);
        }
    };

    const handleShareSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setShareSuccess('');

        const cleanOptions = shareType === 'multiple'
            ? shareOptions.map(o => o.trim()).filter(Boolean)
            : [];

        if (shareType === 'multiple' && cleanOptions.length < 2) {
            setError('객관식 보기는 최소 2개 이상 입력해 주세요.');
            return;
        }

        setShareSubmitting(true);
        try {
            await apiRequest('/api/question-bank', {
                method: 'POST',
                body: {
                    category: shareCategory,
                    type: shareType,
                    questionText: shareText.trim(),
                    options: cleanOptions,
                    authorLabel: currentNickname || '사용자 공유'
                }
            });
            setShareText('');
            setShareOptions(['', '']);
            setShareSuccess('질문 은행에 등록되었습니다! 이제 다른 모임에서도 사용할 수 있어요.');
            setTimeout(() => {
                setTab('browse');
                setShareSuccess('');
            }, 1000);
        } catch (err) {
            setError(err.message);
        } finally {
            setShareSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel modal-lg glass-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">
                            <Library size={20} className="accent-icon" />
                            질문 은행
                        </h3>
                        <p className="modal-subtitle">
                            클릭 한 번으로 모임에 질문을 추가하고, 추가한 질문은 바로 수정할 수 있어요.
                        </p>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
                        <X size={20} />
                    </button>
                </div>

                <div className="tab-bar">
                    <button
                        type="button"
                        className={`tab-btn ${tab === 'browse' ? 'active' : ''}`}
                        onClick={() => setTab('browse')}
                    >
                        <Library size={15} /> 질문 탐색 & 바로 추가
                    </button>
                    <button
                        type="button"
                        className={`tab-btn ${tab === 'share' ? 'active' : ''}`}
                        onClick={() => setTab('share')}
                    >
                        <Share2 size={15} /> 새 질문 공유하기
                    </button>
                </div>

                {error && <div className="alert-box error">{error}</div>}
                {shareSuccess && <div className="alert-box success">{shareSuccess}</div>}

                {tab === 'browse' ? (
                    <>
                        <div className="bank-filters">
                            <div className="search-input-wrap">
                                <Search size={16} />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="키워드로 질문 검색..."
                                    className="form-control"
                                />
                            </div>
                            <select
                                value={selectedType}
                                onChange={e => setSelectedType(e.target.value)}
                                className="form-control type-select"
                            >
                                <option value="">모든 유형</option>
                                <option value="subjective">주관식</option>
                                <option value="multiple">객관식</option>
                                <option value="essay">서술형</option>
                            </select>
                        </div>

                        <div className="category-pills">
                            {['전체', ...categories].map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    className={`pill-btn ${selectedCategory === cat ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="bank-list">
                            {loading ? (
                                <div className="empty-inline">질문 은행을 불러오는 중...</div>
                            ) : items.length === 0 ? (
                                <div className="empty-inline">조건에 맞는 질문이 없습니다.</div>
                            ) : (
                                items.map(item => {
                                    const addedQuestion = addedMap[item.id];
                                    const isAdding = addingId === item.id;
                                    return (
                                        <div key={item.id} className={`bank-card ${addedQuestion ? 'added' : ''}`}>
                                            <div className="bank-card-meta">
                                                <span className="category-tag">{item.category}</span>
                                                <span className={`badge-type ${item.type}`}>
                                                    {QUESTION_TYPE_LABELS[item.type]}
                                                </span>
                                                <span className="bank-usage">
                                                    {item.authorLabel} · {item.usageCount}회 사용
                                                </span>
                                            </div>

                                            <div className="bank-card-text">{item.questionText}</div>

                                            {item.type === 'multiple' && item.options?.length > 0 && (
                                                <div className="bank-options-preview">
                                                    {item.options.map((opt, idx) => (
                                                        <span key={idx} className="option-chip">{opt}</span>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="bank-card-actions">
                                                {addedQuestion ? (
                                                    <>
                                                        <span className="added-badge">
                                                            <Check size={14} /> 모임에 추가됨
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => onEditAddedQuestion(addedQuestion)}
                                                        >
                                                            <Pencil size={13} /> 방금 추가한 질문 수정
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => onEditBeforeAdd(item)}
                                                        >
                                                            <Pencil size={13} /> 수정 후 추가
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm"
                                                            disabled={isAdding}
                                                            onClick={() => handleQuickAddClick(item)}
                                                        >
                                                            <Plus size={14} /> {isAdding ? '추가 중...' : '바로 추가'}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                ) : (
                    <form onSubmit={handleShareSubmit} className="form-stack">
                        <div className="form-row-2">
                            <div className="input-group">
                                <label>카테고리</label>
                                <select
                                    value={shareCategory}
                                    onChange={e => setShareCategory(e.target.value)}
                                    className="form-control"
                                >
                                    {PRESET_CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>질문 유형</label>
                                <select
                                    value={shareType}
                                    onChange={e => setShareType(e.target.value)}
                                    className="form-control"
                                >
                                    <option value="subjective">주관식 (단답형)</option>
                                    <option value="multiple">객관식 (선택형)</option>
                                    <option value="essay">서술형</option>
                                </select>
                            </div>
                        </div>

                        <div className="input-group">
                            <label>공유할 질문 내용</label>
                            <textarea
                                rows={3}
                                value={shareText}
                                onChange={e => setShareText(e.target.value)}
                                placeholder="다른 모임에서도 쓰기 좋은 재미있는 질문을 공유해 주세요!"
                                className="form-control"
                                required
                            />
                        </div>

                        {shareType === 'multiple' && (
                            <div className="input-group">
                                <label>객관식 보기</label>
                                <div className="options-editor">
                                    {shareOptions.map((opt, idx) => (
                                        <div key={idx} className="option-row">
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={e => setShareOptions(prev => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                                                placeholder={`보기 ${idx + 1}`}
                                                className="form-control"
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="icon-btn danger"
                                                disabled={shareOptions.length <= 2}
                                                onClick={() => setShareOptions(prev => prev.filter((_, i) => i !== idx))}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShareOptions(prev => [...prev, ''])}
                                >
                                    <Plus size={14} /> 보기 추가
                                </button>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button type="submit" className="btn btn-primary" disabled={shareSubmitting}>
                                {shareSubmitting ? '등록 중...' : '질문 은행에 공유하기'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
