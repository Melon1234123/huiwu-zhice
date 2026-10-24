"""Shared input boundaries; errors are safe to show to a user."""
import datetime as dt
import math
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


class UserError(ValueError):
    pass


def obj(value):
    if not isinstance(value, dict):
        raise UserError("请求必须是 JSON 对象。")
    return value


def text(value, label, limit=1000, allow_empty=False):
    if not isinstance(value, str):
        raise UserError(f"{label}必须是文本。")
    value = value.strip()
    if (not value and not allow_empty) or len(value) > limit or "\x00" in value:
        raise UserError(f"{label}请填写 1–{limit} 个字符。" if not allow_empty else f"{label}不能超过 {limit} 个字符。")
    return value


def integer(value, label, minimum=0, maximum=1000000):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value,float) and not math.isfinite(value)) or int(value) != value:
        raise UserError(f"{label}必须是整数。")
    value = int(value)
    if not minimum <= value <= maximum:
        raise UserError(f"{label}须在 {minimum}–{maximum} 之间。")
    return value


def decimal(value, label, minimum=Decimal('0'), maximum=Decimal('100000000'), places=None):
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise UserError(f"{label}必须是数字。")
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        raise UserError(f"{label}必须是数字。") from None
    if not number.is_finite() or not minimum <= number <= maximum:
        raise UserError(f"{label}超出允许范围。")
    if places is not None and number != number.quantize(Decimal(places)):
        raise UserError(f"{label}最多保留两位小数。")
    return number


def date(value, label='日期'):
    value = text(value, label, 10)
    try:
        parsed = dt.date.fromisoformat(value)
    except ValueError:
        raise UserError(f"{label}应为 YYYY-MM-DD 格式。") from None
    if parsed.isoformat() != value:
        raise UserError(f"{label}应为 YYYY-MM-DD 格式。")
    return value


def money(value):
    return float(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def project(data):
    obj(data)
    try:
        return dict(name=text(data['name'], '活动名称', 100), audience=text(data['audience'], '参与对象', 200),
                    date=date(data['date']), location=text(data['location'], '活动地点', 200),
                    attendees=integer(data['attendees'], '预计人数', 1, 100000),
                    budget_limit=money(decimal(data['budget_limit'], '预算上限', places='0.01')),
                    goal=text(data['goal'], '活动目标', 2000))
    except KeyError as e:
        raise UserError(f"缺少字段：{e.args[0]}") from None


def task(data):
    obj(data)
    try:
        status = data.get('status', 'todo')
        if status not in ('todo', 'doing', 'done'):
            raise UserError('任务状态无效。')
        return dict(title=text(data['title'], '任务名称', 200), owner=text(data.get('owner', ''), '负责人', 80, True),
                    due=date(data['due'], '截止日期'), status=status)
    except KeyError as e:
        raise UserError(f"缺少字段：{e.args[0]}") from None


def budget(data, limit):
    obj(data)
    items = data.get('items')
    if not isinstance(items, list) or len(items) > 100:
        raise UserError('费用明细须为不超过 100 项的列表。')
    validated = []
    total = Decimal(0)
    for item in items:
        obj(item)
        try:
            name = text(item['name'], '费用名称', 100)
            qty = integer(item['qty'], '数量', 1, 100000)
            price = decimal(item['unit_price'], '单价', places='0.01')
        except KeyError as e:
            raise UserError(f"缺少费用字段：{e.args[0]}") from None
        total += qty * price
        if total > Decimal('100000000'):
            raise UserError('费用合计超出上限。')
        validated.append(dict(name=name, qty=qty, unit_price=money(price)))
    rate = decimal(data.get('reserve_rate'), '预备金比例', maximum=Decimal(1))
    if rate != rate.quantize(Decimal('.0001')):
        raise UserError('预备金比例最多保留四位小数。')
    reserve = Decimal(str(money(total * rate)))
    return dict(items=validated, reserve_rate=float(rate), subtotal=money(total), reserve=money(reserve),
                total=money(total + reserve), remaining=money(Decimal(str(limit)) - total - reserve))
