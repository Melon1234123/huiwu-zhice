"""Application operations separated from HTTP and model transport."""
import csv
import io
import json
from . import validation as v
from .generation import KINDS,generate,task_key
from .retrieval import ask
from .storage import new_id,now


class Service:
    def __init__(self,store,provider):
        self.store,self.provider=store,provider

    def state(self):
        state=self.store.read()
        state['settings']=self.provider.settings()
        return state

    def result(self,state):
        state['settings']=self.provider.settings()
        return state

    def project(self,data):
        value=v.project(data)
        return self.result(self.store.mutate('更新活动信息',value['name'],lambda state:state.update(project=value)))

    def add_document(self,data):
        v.obj(data)
        name=v.text(data.get('name'),'资料名称',150)
        content=v.text(data.get('content'),'资料正文',50000)
        def change(state):
            if len(state['documents'])>=50 or sum(len(d['content']) for d in state['documents'])+len(content)>300000:
                raise v.UserError('资料库容量已满，请删除无效资料。')
            state['documents'].insert(0,dict(id=new_id(),name=name,content=content,created_at=now()))
        return self.result(self.store.mutate('新增资料',name,change))

    def delete(self,kind,ident):
        def change(state):
            found=[item for item in state[kind] if item['id']==ident]
            if not found:
                raise LookupError('未找到对应内容。')
            state[kind]=[item for item in state[kind] if item['id']!=ident]
        return self.result(self.store.mutate('删除资料' if kind=='documents' else '删除任务',ident,change))

    def save_task(self,data,ident=None):
        v.obj(data)
        def change(state):
            if ident:
                matches=[item for item in state['tasks'] if item['id']==ident]
                if not matches:
                    raise LookupError('任务不存在。')
                value=v.task({**matches[0],**data})
            else:
                if len(state['tasks'])>=500:
                    raise v.UserError('任务数量已达上限。')
                value=v.task(data)
            if any(task_key(t['title'])==task_key(value['title']) and t['id']!=ident for t in state['tasks']):
                raise v.UserError('已有同名任务，请编辑现有任务。')
            if ident:
                matches[0].update(value)
            else:
                state['tasks'].append(dict(id=new_id(),**value))
        return self.result(self.store.mutate('更新任务' if ident else '新增任务',v.text(data.get('title','任务'),'任务名称',200),change))

    def save_budget(self,data):
        def change(state):
            state['budget']=v.budget(data,state['project']['budget_limit'])
        return self.result(self.store.mutate('更新预算','费用明细与预备金已重新计算。',change))

    def ask(self,data):
        v.obj(data)
        question=v.text(data.get('question'),'问题',1500)
        return ask(question,self.store.read()['documents'],self.provider)

    def generate(self,data):
        v.obj(data)
        kind=data.get('kind')
        if kind not in KINDS:
            raise v.UserError('不支持的生成类型。')
        instruction=v.text(data.get('instruction',''),'补充要求',3000,True)
        before=self.store.read()
        content,mode=generate(kind,before,instruction,self.provider)
        def change(state):
            for key in ('project','documents','budget'):
                if state[key]!=before[key]:
                    raise v.UserError('活动或资料在生成期间已更新，请重新生成以采用最新信息。')
            if kind=='tasks':
                keys={task_key(t['title']) for t in state['tasks']}
                count=0
                for value in content:
                    key=task_key(value['title'])
                    if key not in keys:
                        if len(state['tasks'])>=500:
                            raise v.UserError('任务数量已达上限。')
                        keys.add(key)
                        state['tasks'].append(dict(id=new_id(),**value))
                        count+=1
                state['activity'].insert(0,dict(id=new_id(),action='任务去重结果',detail=f'新增 {count} 项，跳过同名 {len(content)-count} 项；已有负责人和状态保持。',created_at=now()))
            else:
                state['outputs'][kind]=dict(content=content,mode=mode,created_at=now())
        return self.result(self.store.mutate('生成'+KINDS[kind],('真实模型' if mode=='model' else '本地规则')+'生成，结果需人工审阅。',change))

    def export(self,fmt):
        state=self.state()
        if fmt=='json':
            return 'application/json; charset=utf-8',json.dumps(state,ensure_ascii=False,indent=2).encode()
        if fmt=='csv':
            stream=io.StringIO(newline='')
            writer=csv.writer(stream)
            writer.writerow(['任务','负责人','截止日期','状态'])
            def safe(value):
                value=str(value)
                return "'"+value if value.lstrip().startswith(('=','+','-','@','\t','\r')) else value
            for task in state['tasks']:
                writer.writerow([safe(task[key]) for key in ('title','owner','due','status')])
            return 'text/csv; charset=utf-8',stream.getvalue().encode('utf-8-sig')
        if fmt!='md':
            raise v.UserError('导出格式须为 md、json 或 csv。')
        p,b=state['project'],state['budget']
        escape=lambda x:str(x).replace('|','\\|').replace('\n',' ')
        lines=[f'# {p["name"]}', '', '> 本文含虚构教学样例或用户录入内容，使用前须核实。', '',
               f'- 日期：{p["date"]}',f'- 地点：{p["location"]}',f'- 对象：{p["audience"]}',
               f'- 预计人数：{p["attendees"]}',f'- 目标：{p["goal"]}',f'- 预算：¥{b["total"]:.2f} / ¥{p["budget_limit"]:.2f}',
               '', '## 任务清单','','| 任务 | 负责人 | 截止日期 | 状态 |','| --- | --- | --- | --- |']
        lines.extend('| '+' | '.join(escape(task[key]) for key in ('title','owner','due','status'))+' |' for task in state['tasks'])
        lines+=['','## 费用明细','','| 项目 | 数量 | 单价 |','| --- | --- | --- |']
        lines.extend(f'| {escape(item["name"])} | {item["qty"]} | {item["unit_price"]:.2f} |' for item in b['items'])
        lines+=['',f'直接费用 ¥{b["subtotal"]:.2f}；预备金 {b["reserve_rate"]:.2%} / ¥{b["reserve"]:.2f}；余量 ¥{b["remaining"]:.2f}。']
        for kind,value in state['outputs'].items():
            lines+=['','---','',f'## {KINDS[kind]}（{value["mode"]}）','',value['content']]
        lines+=['','## 资料库']
        for document in state['documents']:
            lines+=['',f'### {document["name"]}',document['content']]
        return 'text/markdown; charset=utf-8','\n'.join(lines).encode()
