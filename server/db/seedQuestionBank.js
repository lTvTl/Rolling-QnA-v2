const { generateId } = require('../utils/crypto');

const DEFAULT_BANK_QUESTIONS = [
    // 아이스브레이킹
    {
        category: '아이스브레이킹',
        type: 'subjective',
        questionText: '요즘 나를 가장 행복하게 만드는 소소한 것 한 가지는?',
        options: []
    },
    {
        category: '아이스브레이킹',
        type: 'subjective',
        questionText: '나를 한 단어(또는 별명)로 표현한다면?',
        options: []
    },
    {
        category: '아이스브레이킹',
        type: 'multiple',
        questionText: '주말에 에너지를 충전하는 나만의 방식은?',
        options: ['집에서 푹 쉬기', '친구들과 수다 떨기', '운동/야외 활동', '카페에서 혼자 시간 보내기']
    },
    {
        category: '아이스브레이킹',
        type: 'subjective',
        questionText: '최근에 가장 재미있게 본 영화, 드라마 또는 유튜브 채널은?',
        options: []
    },

    // 밸런스게임
    {
        category: '밸런스게임',
        type: 'multiple',
        questionText: '평생 한 가지 계절만 살아야 한다면?',
        options: ['무조건 한여름 ☀️', '무조건 한겨울 ❄️']
    },
    {
        category: '밸런스게임',
        type: 'multiple',
        questionText: '둘 중 딱 하나의 초능력을 가질 수 있다면?',
        options: ['10년 전으로 돌아가기', '10년 뒤 미래 10분 보고 오기']
    },
    {
        category: '밸런스게임',
        type: 'multiple',
        questionText: '여행 스타일을 고른다면?',
        options: ['분 단위 계획형 파워 J', '발길 닿는 대로 즉흥형 파워 P']
    },
    {
        category: '밸런스게임',
        type: 'multiple',
        questionText: '평생 둘 중 하나만 포기해야 한다면?',
        options: ['탄산음료 & 커피 평생 금지', '밀가루 음식 평생 금지']
    },

    // TMI & 일상
    {
        category: 'TMI & 일상',
        type: 'subjective',
        questionText: '최근에 결제한 것 중 가장 만족스러웠던 소비는?',
        options: []
    },
    {
        category: 'TMI & 일상',
        type: 'multiple',
        questionText: '스트레스 받을 때 가장 먼저 하는 행동은?',
        options: ['맛있는 거 먹기', '잠자기', '노래 듣기/부르기', '운동하거나 산책하기', '누군가에게 털어놓기']
    },
    {
        category: 'TMI & 일상',
        type: 'subjective',
        questionText: '아무도 모를 것 같은 나만의 사소한 습관이나 TMI는?',
        options: []
    },

    // 가치관 & 깊은 대화
    {
        category: '가치관',
        type: 'essay',
        questionText: '올해가 끝나기 전에 꼭 이루고 싶거나 도전해 보고 싶은 일이 있다면?',
        options: []
    },
    {
        category: '가치관',
        type: 'essay',
        questionText: '살면서 누군가에게 들었던 말 중 가장 기억에 남는 한마디는?',
        options: []
    },
    {
        category: '가치관',
        type: 'multiple',
        questionText: '인간관계에서 내가 가장 중요하게 생각하는 요소는?',
        options: ['유머와 대화 코드', '신뢰와 약속', '배려와 공감', '서로의 선을 지키는 것']
    },

    // 모임 & 추억
    {
        category: '모임 & 추억',
        type: 'subjective',
        questionText: '이 모임에서 가장 첫인상과 지금 이미지가 다른 사람은?',
        options: []
    },
    {
        category: '모임 & 추억',
        type: 'essay',
        questionText: '이 모임 사람들과 함께 해보고 싶은 버킷리스트가 있다면?',
        options: []
    },
    {
        category: '모임 & 추억',
        type: 'essay',
        questionText: '평소에 쑥스러워서 못 했던 고마운 말이나 한마디를 남겨주세요!',
        options: []
    }
];

function seedQuestionBank(db) {
    const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM question_bank').get();
    if (countRow && countRow.cnt > 0) {
        return;
    }

    const insert = db.prepare(`
        INSERT INTO question_bank (id, category, type, question_text, options_json, author_label, usage_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
        for (const item of DEFAULT_BANK_QUESTIONS) {
            insert.run(
                generateId(),
                item.category,
                item.type,
                item.questionText,
                JSON.stringify(item.options),
                '기본 제공',
                now
            );
        }
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

module.exports = { seedQuestionBank };
