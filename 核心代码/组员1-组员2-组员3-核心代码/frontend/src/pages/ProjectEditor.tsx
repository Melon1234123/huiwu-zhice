import {useState} from 'react';
import type {FormEvent} from 'react';
import {Button, ErrorBox, Field, Modal} from '../components/Common';
import type {Shared} from '../types';

export function ProjectEditor({state, change, notify, close}: Shared & {close: () => void}) {
  const [draft, setDraft] = useState(state.project);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      await change('/api/project', draft);
      notify('活动信息已保存'); close();
    } catch (e) {setError((e as Error).message)}
    finally {setSaving(false)}
  }
  return <Modal title="编辑活动信息" onClose={() => {if (!saving) close()}}>
    <form id="project-form" onSubmit={save}>
      <fieldset disabled={saving} className="editor-fields">
        <Field label="活动名称"><input required maxLength={100} value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}/></Field>
        <div className="form-grid">
          <Field label="活动日期"><input required type="date" value={draft.date} onChange={e => setDraft({...draft, date: e.target.value})}/></Field>
          <Field label="预计人数"><input required type="number" min="1" max="100000" value={draft.attendees || ''} onChange={e => setDraft({...draft, attendees: Number(e.target.value)})}/></Field>
          <Field label="活动地点"><input required maxLength={200} value={draft.location} onChange={e => setDraft({...draft, location: e.target.value})}/></Field>
          <Field label="预算上限（元）"><input required min="0" max="100000000" step="0.01" type="number" value={draft.budget_limit} onChange={e => setDraft({...draft, budget_limit: Number(e.target.value)})}/></Field>
        </div>
        <Field label="面向人群"><input required maxLength={200} value={draft.audience} onChange={e => setDraft({...draft, audience: e.target.value})}/></Field>
        <Field label="活动目标"><textarea required maxLength={2000} rows={3} value={draft.goal} onChange={e => setDraft({...draft, goal: e.target.value})}/></Field>
        <ErrorBox error={error}/><div className="form-actions"><Button type="button" variant="secondary" onClick={close}>取消</Button><Button>{saving ? '保存中…' : '保存活动信息'}</Button></div>
      </fieldset>
    </form>
  </Modal>;
}
