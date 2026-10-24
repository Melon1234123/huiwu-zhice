"""A single SQLite transaction per mutation, guarded across HTTP workers."""
import copy
import datetime as dt
import json
from pathlib import Path
import sqlite3
import threading
import uuid
from .validation import budget


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def new_id():
    return uuid.uuid4().hex[:16]


def seed():
    stamp = now()
    data = dict(project=dict(name='校园 AI 创意分享会', audience='对 AI 应用感兴趣的在校学生与社团成员', date='2026-11-14',
                location='校园报告厅（虚构教学样例）', attendees=80, budget_limit=3000,
                goal='通过案例分享与小组交流，帮助参与者形成可执行的 AI 应用创意。'),
        documents=[dict(id=new_id(), name='场地与执行约束（虚构样例）', created_at=stamp,
             content='【虚构教学样例】校园报告厅最多容纳 100 人，活动预计 80 人。场地在 2026-11-14 的 13:00–18:00 可用。正式活动为 14:00–17:00。签到预留 30 分钟，清场预留 20 分钟。现场不能使用明火，通道必须保持畅通。设备包括投影仪、两支无线麦克风和音响。'),
            dict(id=new_id(), name='活动需求与费用草案（虚构样例）', created_at=stamp,
             content='【虚构教学样例】本次校园 AI 创意分享会面向在校学生，预计 80 人，预算上限 3000 元。直接费用初稿为 1900 元，预备金比例 10%，含预备金总额 2090 元，预算余量 910 元。宣传内容应说明活动时间、地点、对象与报名方式。报名入口尚未确定，不得编造链接。嘉宾与主办方尚未确定。')],
        tasks=[], budget={}, outputs={}, activity=[])
    specs = [('确认场地与设备', '场务组', '2026-11-07', 'done'), ('整理分享主题与议程', '内容组', '2026-11-09', 'doing'),
             ('发布活动报名通知', '宣传组', '2026-11-10', 'todo'), ('准备签到物料', '执行组', '2026-11-12', 'todo'),
             ('核对费用与采购清单', '财务组', '2026-11-12', 'doing'), ('确认现场应急联系人', '安全组', '2026-11-13', 'done')]
    data['tasks'] = [dict(id=new_id(), title=t, owner=o, due=d, status=s) for t,o,d,s in specs]
    data['budget'] = budget(dict(items=[dict(name='活动物料',qty=80,unit_price=10),dict(name='设备与布置',qty=1,unit_price=600),
                    dict(name='茶歇与饮水',qty=1,unit_price=500)], reserve_rate=.1), 3000)
    data['activity'] = [dict(id=new_id(),action='初始化工作台', detail='全部示例资料、地点和人员角色均为虚构教学样例。',created_at=stamp)]
    return data


class Store:
    def __init__(self, path):
        self.path = str(Path(path).expanduser().resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with self._db() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO state VALUES (1, ?)', (json.dumps(seed(), ensure_ascii=False),))

    def _db(self):
        return sqlite3.connect(self.path, timeout=10)

    def read(self):
        with self.lock, self._db() as db:
            return json.loads(db.execute('SELECT value FROM state WHERE id=1').fetchone()[0])

    def mutate(self, action, detail, fn):
        with self.lock, self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            state = json.loads(db.execute('SELECT value FROM state WHERE id=1').fetchone()[0])
            fn(state)
            state['budget'] = budget(state['budget'], state['project']['budget_limit'])
            state['activity'].insert(0, dict(id=new_id(), action=action, detail=detail, created_at=now()))
            state['activity'] = state['activity'][:200]
            db.execute('UPDATE state SET value=? WHERE id=1',(json.dumps(state, ensure_ascii=False, allow_nan=False),))
            return copy.deepcopy(state)

    def reset(self):
        fresh = seed()
        return self.mutate('重置示例', '已恢复虚构教学样例。', lambda state: (state.clear(), state.update(fresh)))
