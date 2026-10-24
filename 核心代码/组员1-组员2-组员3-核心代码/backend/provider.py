"""OpenAI-compatible transport. Credentials never enter public state or logs."""
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


class ModelError(RuntimeError):
    pass


def read_config(path=None):
    values = {}
    config = Path(path) if path else Path.home()/'.config/huiwu-zhice/runtime.env'
    for source in (config, Path(__file__).resolve().parent.parent/'.env'):
      if source.is_file():
        for line in source.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=',1)
                values[key.strip()] = value.strip().strip('"\'')
    values.update(os.environ)
    return values


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Provider:
    def __init__(self, env=None):
        env = read_config() if env is None else env
        self.key = env.get('LLM_API_KEY','').strip()
        self.base = env.get('LLM_BASE_URL','').strip().rstrip('/')
        self.model = env.get('LLM_MODEL','deepseek-v4.1-flash').strip()
        try:
            self.timeout = min(180, max(5,float(env.get('LLM_TIMEOUT',90))))
        except ValueError:
            self.timeout = 90
        try:
            self.max_tokens=min(8192,max(256,int(env.get('LLM_MAX_TOKENS',4096))))
        except (ValueError,TypeError):
            self.max_tokens=4096
        self.thinking=env.get('LLM_THINKING','disabled').strip().lower()
        if self.thinking not in ('enabled','disabled'):
            raise ModelError('LLM_THINKING 仅支持 enabled 或 disabled。')
        parsed = urllib.parse.urlsplit(self.base)
        self.configured = bool(self.key and self.base and self.model)
        if self.configured and (parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment):
            raise ModelError('模型接口配置无效，请检查本机配置。')
        if self.configured and parsed.scheme == 'http' and parsed.hostname not in ('127.0.0.1','localhost','::1'):
            raise ModelError('远程模型接口必须使用 HTTPS。')

    def settings(self):
        return dict(configured=self.configured, model=self.model if self.configured else '本地规则引擎', mode='model' if self.configured else 'rule')

    def complete(self, system, user):
        if not self.configured:
            raise ModelError('尚未配置模型接口。')
        payload = dict(model=self.model, messages=[dict(role='system',content=system),dict(role='user',content=user)],
                       temperature=.35, max_tokens=self.max_tokens, stream=False)
        if 'deepseek' in self.model.lower():
            payload['thinking']=dict(type=self.thinking)
        request = urllib.request.Request(self.base+'/chat/completions', data=json.dumps(payload,ensure_ascii=False).encode(),
                    headers={'Authorization':'Bearer '+self.key,'Content-Type':'application/json','Accept':'application/json'}, method='POST')
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=self.timeout) as response:
                raw = response.read(2_000_001)
            if len(raw)>2_000_000:
                raise ModelError('模型返回内容过大，请缩小请求后重试。')
            result = json.loads(raw)
            if result['choices'][0].get('finish_reason')=='length':
                raise ModelError('模型结果因长度限制被截断，未保存。请减少要求或提高 LLM_MAX_TOKENS 后重试。')
            content = result['choices'][0]['message']['content']
            if not isinstance(content,str) or not content.strip():
                raise ValueError('empty')
            if len(content)>60000:
                raise ModelError('模型结果过长，请缩小请求后重试。')
            return content.strip()
        except urllib.error.HTTPError as exc:
            code = exc.code
            if code in (401,403):
                raise ModelError('模型服务拒绝认证，请检查本机密钥或模型权限。') from None
            if code == 429:
                raise ModelError('模型服务限流，请稍后重试。') from None
            raise ModelError(f'模型服务暂不可用（HTTP {code}），请稍后重试。') from None
        except (urllib.error.URLError,TimeoutError,OSError):
            raise ModelError('模型服务连接失败或超时，请检查网络后重试。') from None
        except (json.JSONDecodeError,KeyError,IndexError,TypeError,ValueError):
            raise ModelError('模型返回格式异常，请重试。') from None
