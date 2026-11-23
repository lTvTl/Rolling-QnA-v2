export async function apiRequest(path, options = {}) {
    const { method = 'GET', body } = options;
    const headers = {};
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
        err.status = res.status;
        throw err;
    }
    return data;
}

export const QUESTION_TYPE_LABELS = {
    subjective: '주관식',
    multiple: '객관식',
    essay: '서술형'
};

export function formatShortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}
