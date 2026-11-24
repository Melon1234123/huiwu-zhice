import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {FormEvent, KeyboardEvent} from 'react';
import type {BudgetItem, Shared} from '../types';
import {ApiError, money} from '../api';
import {PageHeader, ErrorBox} from '../components/Common';
import {Icon} from '../components/Icon';

type DraftItem = {name: string; qty: string; unit_price: string};
const MAX_ITEMS = 100;
const MAX_YUAN = 100_000_000;

function draftItems(items: BudgetItem[]): DraftItem[] {
  return items.map(item => ({name: item.name, qty: String(item.qty), unit_price: String(item.unit_price)}));
}

function percentText(rate: number) {
  return String(Math.round(rate * 10_000) / 100);
}

// Only accept values that round-trip at the precision accepted by the API.
function scaled(raw: string, scale: number, min: number, max: number) {
  const value = Number(raw);
  const units = Math.round(value * scale);
  return raw.trim() !== '' && value >= min && value <= max && units / scale === value ? units : null;
}

function amount(cents: number | null) {
  return cents === null ? '—' : money(cents / 100);
}

export function Budget({state, change, notify}: Shared) {
  const [items, setItems] = useState(() => draftItems(state.budget.items));
  const [reserve, setReserve] = useState(() => percentText(state.budget.reserve_rate));
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const baseline = useRef(state.budget);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dirty) {
      baseline.current = state.budget;
      setItems(draftItems(state.budget.items));
      setReserve(percentText(state.budget.reserve_rate));
    }
  }, [state.budget, dirty]);

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const name = form.current?.querySelectorAll<HTMLInputElement>('.budget-item-name')[pendingFocus.current];
    (name ?? addButton.current)?.focus();
    pendingFocus.current = null;
  }, [items.length]);

  const rows = items.map(item => {
    const qty = scaled(item.qty, 1, 1, 100_000);
    const price = scaled(item.unit_price, 100, 0, MAX_YUAN);
    return {qty, price, cents: qty === null || price === null ? null : qty * price};
  });
  const sum = rows.reduce<number | null>((acc, row) =>
    acc === null || row.cents === null ? null : acc + row.cents, 0);
  const exceedsLimit = sum !== null && sum > MAX_YUAN * 100;
  const subtotal = exceedsLimit ? null : sum;
  const basisPoints = scaled(reserve, 100, 0, 100);
  // At the accepted subtotal limit this product is still an exact JS integer.
  const reserveAmount = subtotal === null || basisPoints === null
    ? null : Math.floor((subtotal * basisPoints + 5000) / 10_000);
  const total = subtotal === null || reserveAmount === null ? null : subtotal + reserveAmount;
  const limit = Math.round(state.project.budget_limit * 100);
  const remaining = total === null ? null : limit - total;
  const over = remaining !== null && remaining < 0;
  const ratio = total !== null && limit > 0 ? Math.round(total * 100 / limit) : null;

  function edit() {
    setDirty(true);
    setError('');
  }

  function update(index: number, key: keyof DraftItem, value: string) {
    setItems(prev => prev.map((row, i) => i === index ? {...row, [key]: value} : row));
    edit();
  }

  function addItem() {
    if (busy || items.length >= MAX_ITEMS) return;
    pendingFocus.current = items.length;
    setItems(prev => [...prev, {name: '', qty: '1', unit_price: ''}]);
    edit();
  }

  function removeItem(index: number) {
    pendingFocus.current = Math.min(index, items.length - 2);
    setItems(prev => prev.filter((_, i) => i !== index));
    edit();
  }

  function nextField(event: KeyboardEvent<HTMLInputElement>, index: number, key: keyof DraftItem) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    const input = event.currentTarget;
    if (!input.reportValidity()) return;
    const row = input.closest('tr');
    const focusSelector = key === 'name' ? '.budget-qty' : key === 'qty' ? '.budget-price' : '.budget-item-name';
    const nextRow = key === 'unit_price' ? row?.nextElementSibling : row;
    const next = nextRow?.querySelector<HTMLInputElement>(focusSelector);
    if (next) {
      next.focus();
      next.select();
    } else if (index + 1 < MAX_ITEMS) {
      addItem();
    } else {
      saveButton.current?.focus();
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty || conflict || exceedsLimit) return;
    if (!form.current?.reportValidity()) return;
    if (total === null || basisPoints === null) {
      setError('请检查数量、单价和预备金比例。单价和百分比最多保留两位小数。');
      return;
    }
    const entries = items.map((item, i) => ({
      name: item.name.trim(), qty: rows[i].qty, unit_price: Number(item.unit_price)
    }));
    setBusy(true);
    setError('');
    try {
      const base = baseline.current;
      await change('/api/budget', {
        items: entries, reserve_rate: basisPoints / 10_000,
        base_budget: {items: base.items, reserve_rate: base.reserve_rate},
      });
      setDirty(false);
      notify('预算已保存');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.snapshot) setConflict(true);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function resetDraft() {
    baseline.current = state.budget;
    setConflict(false);
    setItems(draftItems(state.budget.items));
    setReserve(percentText(state.budget.reserve_rate));
    setDirty(false);
    setError('');
  }

  return <>
    <PageHeader eyebrow="策划与执行" title="每一笔费用，都心中有数" description="费用明细与预备金实时计算，提前发现预算压力。" action={<>
      <span className={`draft-label ${dirty ? 'unsaved' : ''}`}>{dirty ? '有未保存的修改' : '已与项目同步'}</span>
      <button ref={saveButton} className="button" type="submit" form="budget-form" disabled={busy || !dirty || conflict || exceedsLimit}>
        <Icon name="check" size={18}/> {busy ? '保存中…' : '保存预算'}
      </button>
    </>}/>
    {conflict && <div className="budget-conflict panel" role="alert" style={{padding: '16px 20px', marginBottom: 16}}>
      <strong>预算已在其他窗口更新，当前草稿已保留</strong>
      <details><summary>查看最新预算（{money(state.budget.total)}，含预备金）</summary>
        <ul>{state.budget.items.map((item, i) => <li key={i}>{item.name} · {item.qty} × {money(item.unit_price)}</li>)}</ul>
        <p>预备金比例 {percentText(state.budget.reserve_rate)}%</p>
      </details>
      <div className="form-actions">
        <button className="button secondary" onClick={() => {
          baseline.current = state.budget;
          setConflict(false);
          notify('已保留当前草稿。下次保存时将整体替换已核对的预算。');
        }}>保留草稿，继续编辑</button>
        <button className="button" onClick={resetDraft}>放弃草稿，载入最新预算</button>
      </div>
    </div>}
    <div className="budget-summary">
      <div><span className="budget-stat-icon"><Icon name="budget"/></span><span><small>预算上限</small><strong>{amount(limit)}</strong></span></div>
      <div><span className="budget-stat-icon"><Icon name="documents"/></span><span><small>预计总支出 <em>含预备金</em></small><strong>{amount(total)}</strong></span></div>
      <div className={over ? 'budget-alert' : 'budget-available'}><span className="budget-stat-icon"><Icon name={over ? 'info' : 'budget'}/></span>
        <span><small>{over ? '超出预算' : '剩余预算'}</small><strong>{amount(remaining === null ? null : Math.abs(remaining))}</strong></span></div>
    </div>
    {over && <div className="budget-overrun" role="status"><Icon name="info"/><span>当前费用超出预算 <strong>{amount(Math.abs(remaining))}</strong>，请调整费用或在活动信息中修改预算上限。</span></div>}
    <div className="budget-layout">
      <section className="panel budget-details">
        <div className="panel-heading"><div><h2>费用明细</h2><p>{items.length} / {MAX_ITEMS} 项 · 金额单位为元</p></div>
          <button ref={addButton} className="button secondary small" type="button" disabled={busy || items.length >= MAX_ITEMS} onClick={addItem}><Icon name="plus" size={18}/> 添加费用</button></div>
        <form id="budget-form" ref={form} onSubmit={save}>
          <div className="budget-table-wrap"><table className="budget-table">
            <thead><tr><th>费用项目</th><th>数量</th><th>单价（元）</th><th>小计</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody id="budget-items">{items.map((item, i) => <tr key={i}>
              <td><div className="budget-name"><span className="row-number">{String(i + 1).padStart(2, '0')}</span>
                <input className="budget-item-name" aria-label={`第${i+1}项费用名称`} required pattern={'.*\\S.*'} title="请输入费用名称" disabled={busy} maxLength={100} placeholder="费用名称" value={item.name}
                  onChange={e => update(i, 'name', e.target.value)} onKeyDown={e => nextField(e, i, 'name')}/></div></td>
              <td><input className="budget-qty" aria-label={`第${i+1}项数量`} required disabled={busy} type="number" min="1" max="100000" step="1" value={item.qty}
                onChange={e => update(i, 'qty', e.target.value)} onKeyDown={e => nextField(e, i, 'qty')}/></td>
              <td><input className="budget-price" aria-label={`第${i+1}项单价`} required disabled={busy} type="number" min="0" max={MAX_YUAN} step="0.01" value={item.unit_price}
                onChange={e => update(i, 'unit_price', e.target.value)} onKeyDown={e => nextField(e, i, 'unit_price')}/></td>
              <td className="row-amount">{amount(rows[i].cents)}</td>
              <td><button className="icon-button budget-delete" type="button" disabled={busy} aria-label={`删除第${i+1}项费用`} onClick={() => removeItem(i)}><Icon name="trash" size={17}/></button></td>
            </tr>)}</tbody>
          </table></div>
          {!items.length && <div className="compact-empty">暂无费用，点击“添加费用”开始记录。</div>}
          <div className="budget-table-footer"><span>直接费用合计</span><strong>{amount(subtotal)}</strong></div>
          {exceedsLimit && <ErrorBox error="直接费用合计超过 1 亿元，请调整数量或单价后保存。"/>}
          <ErrorBox error={error} retry={() => form.current?.requestSubmit()}/>
        </form>
        <p className="panel-footer">按 Enter 切换录入字段，在末行单价按 Enter 可继续添加费用。</p>
      </section>
      <aside className="panel calculation">
        <div className="panel-heading"><div><h2>预算计算</h2><p>为临时需求留出空间</p></div></div>
        <div className="calculation-content">
          <label className="field"><span>预备金比例</span><div className="percent-input"><input id="reserve-rate" form="budget-form" disabled={busy} type="number" min="0" max="100" step="0.01" required value={reserve}
            onChange={e => {setReserve(e.target.value); edit()}}/><span>%</span></div><small>按直接费用计算，预备金四舍五入到分</small></label>
          <div className="calc-row"><span>直接费用</span><strong>{amount(subtotal)}</strong></div>
          <div className="calc-row"><span>{basisPoints === null ? '预备金' : `预备金（${basisPoints / 100}%）`}</span><strong>{amount(reserveAmount)}</strong></div>
          <div className="calc-total"><span>预计总支出</span><strong>{amount(total)}</strong></div>
          <div className="budget-ratio"><span>预算使用比例</span><strong>{ratio === null ? limit === 0 ? '预算上限为零' : '—' : `${ratio}%`}</strong></div>
          {ratio !== null && <div className="budget-line"><div className={over ? 'over' : ''} style={{width: `${Math.min(ratio, 100)}%`}}/></div>}
          <p className="calculation-note"><Icon name="info" size={16}/>{dirty ? '当前为未保存草稿，导出和模型审阅仍使用上次保存的预算。' : '预算已保存，可用于模型审阅与项目导出。'}</p>
          {dirty && <button className="text-button" disabled={busy} onClick={resetDraft}>放弃本次修改</button>}
        </div>
      </aside>
    </div>
  </>;
}
