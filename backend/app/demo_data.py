"""Fixed, fictional examples. Imported only by an explicit user action."""

DEMO_MEMORIES = (
    (
        {
            'past_memory': '初めて参加した料理教室で失敗したが、隣の人に教えてもらい最後は一緒に料理を完成させた。',
            'think': '最初から上手にできなくても、試してみると新しい楽しさや出会いがある。',
            'values': ('失敗も学びの入り口として受け止める。', '知らないことにもまず興味を持ってみる。'),
        },
        {
            'past_memory': '友人を誘って近所の街を散策し、予定になかった小さな展示会を見つけた。',
            'think': 'いつもの場所でも、少し行動を変えるだけで発見がある。',
            'values': ('日常の小さな発見を大切にする。', '楽しい発見は周りの人と分かち合いたい。'),
        },
    ),
    (
        {
            'past_memory': '部活動の大会で負けた後、練習方法を見直し、次の大会で自己ベストを更新した。',
            'think': '悔しさを次の行動に変えれば、結果は少しずつ変えられる。',
            'values': ('目標に向かって粘り強く挑戦する。', '結果だけでなく前回からの成長も評価する。'),
        },
        {
            'past_memory': '文化祭の準備を一人で進めて行き詰まり、仲間に役割を頼んで完成させた。',
            'think': '行動力は大切だが、仲間の力を借りることも前に進む方法だ。',
            'values': ('困ったときは早めに協力を求める。', '勢いと周囲への配慮を両立したい。'),
        },
    ),
    (
        {
            'past_memory': '旅行前に天候と移動経路を調べていたため、当日の運休にも代わりの経路で対応できた。',
            'think': '事前に選択肢を用意しておくと、予想外のことにも落ち着いて対処できる。',
            'values': ('判断する前に情報を集める。', 'リスクに備えて代わりの方法を考える。'),
        },
        {
            'past_memory': '応募する講座を慎重に比較している間に、申し込み期限が過ぎてしまった。',
            'think': '十分に調べることと、期限内に決めることの両方が必要だ。',
            'values': ('完璧な情報を待ちすぎない。', '判断の期限を決めて小さく試す。'),
        },
    ),
    (
        {
            'past_memory': '落ち込んでいた友人の話を静かに聞いたところ、気持ちが軽くなったと感謝された。',
            'think': 'すぐに解決策を出さなくても、そばにいて話を聞くことで支えになれる。',
            'values': ('相手の気持ちを受け止める。', '結論を急がず安心して話せる時間をつくる。'),
        },
        {
            'past_memory': '頼まれごとを断れず疲れてしまい、自分の予定も伝えるようにしたら無理なく協力できた。',
            'think': '優しくするためにも、自分の余裕を大切にしてよい。',
            'values': ('相手への配慮と自分の境界線を大切にする。', '無理のない範囲で長く支え合いたい。'),
        },
    ),
)


def load_demo_data(db):
    added_memories = added_values = updated = skipped = 0
    with db.connect() as con:
        # Serialize the emptiness check and all inserts, including concurrent clicks.
        con.execute('BEGIN IMMEDIATE')
        profiles = con.execute('SELECT personality_id FROM profile ORDER BY personality_id').fetchall()
        for profile, examples in zip(profiles, DEMO_MEMORIES):
            pid = profile['personality_id']
            if con.execute('SELECT 1 FROM past_memories WHERE personality_id=? LIMIT 1', (pid,)).fetchone():
                skipped += 1
                continue
            for example in examples:
                memory_id = con.execute(
                    'INSERT INTO past_memories(personality_id,past_memory,think) VALUES(?,?,?)',
                    (pid, example['past_memory'], example['think']),
                ).lastrowid
                con.executemany(
                    'INSERT INTO formed_personalities(memory_id,formed_personality) VALUES(?,?)',
                    [(memory_id, value) for value in example['values']],
                )
                added_memories += 1
                added_values += len(example['values'])
            updated += 1
    return {'updated_personalities': updated, 'skipped_personalities': skipped,
            'added_memories': added_memories, 'added_values': added_values}
