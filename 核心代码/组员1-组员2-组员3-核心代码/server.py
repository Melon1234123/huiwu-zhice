#!/usr/bin/env python3
"""Run `python3 server.py`; serves built assets and local same-origin API."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import re
import sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs,unquote,urlsplit

from backend.provider import ModelError,Provider
from backend.service import Service
from backend.storage import Store
from backend.validation import UserError

ROOT=Path(__file__).resolve().parent
MAX_BODY=1_000_000


def make_handler(service,static_root=None):
    static_root=Path(static_root or ROOT/'static').resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version='HuiwuZhice/1.0'
        sys_version=''

        def log_message(self,format,*args):
            # Paths and bodies may contain user data; do not log them.
            pass

        def send(self,status,body,content_type='application/json; charset=utf-8',download=None,extra_headers=None):
            if not isinstance(body,bytes):
                body=json.dumps(body,ensure_ascii=False,allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(body)))
            for name,value in (extra_headers or {}).items():
                self.send_header(name,value)
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('X-Frame-Options','DENY')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            if download:
                self.send_header('Content-Disposition',f'attachment; filename="huiwu-zhice.{download}"')
            self.end_headers()
            if self.command!='HEAD':
                self.wfile.write(body)

        def origin_check(self):
            expected_host=self.headers.get('Host','')
            port=self.server.server_port
            allowed={f'127.0.0.1:{port}',f'localhost:{port}',f'[::1]:{port}'}
            if expected_host not in allowed:
                raise UserError('仅接受本机地址请求。')
            origin=self.headers.get('Origin')
            if origin and origin not in {f'http://{host}' for host in allowed}:
                raise UserError('不接受跨站请求。')
            if self.headers.get('Sec-Fetch-Site')=='cross-site':
                raise UserError('不接受跨站请求。')

        def body(self):
            content_type=self.headers.get('Content-Type','').split(';',1)[0].strip()
            if content_type!='application/json':
                raise UserError('请使用 application/json 请求。')
            if self.headers.get('Transfer-Encoding'):
                raise UserError('不支持分块请求。')
            try:
                size=int(self.headers.get('Content-Length','0'))
            except ValueError:
                raise UserError('请求长度无效。') from None
            if not 0<size<=MAX_BODY:
                raise UserError('请求正文为空或过大。')
            try:
                value=json.loads(self.rfile.read(size).decode('utf-8'),parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
            except (UnicodeDecodeError,ValueError):
                raise UserError('请求正文不是有效 JSON。') from None
            if not isinstance(value,dict):
                raise UserError('请求必须是 JSON 对象。')
            return value

        def route(self):
            self.origin_check()
            url=urlsplit(self.path)
            path=unquote(url.path)
            if self.command in ('GET','HEAD'):
                if path=='/api/health':
                    settings=service.provider.settings()
                    return self.send(200,dict(ok=True,mode=settings['mode'],model=settings['model']))
                if path=='/api/state':
                    return self.send(200,service.state())
                if path=='/api/export':
                    fmt=parse_qs(url.query).get('format',['md'])[0]
                    content_type,body=service.export(fmt)
                    return self.send(200,body,content_type,fmt)
                if path.startswith('/api/'):
                    raise LookupError('接口不存在。')
                if path in ('/','/index.html'):
                    target=static_root/'index.html'
                elif path.startswith('/static/'):
                    target=(static_root/path[len('/static/'):]).resolve()
                    if not target.is_relative_to(static_root):
                        raise LookupError('文件不存在。')
                else:
                    raise LookupError('页面不存在。')
                if not target.is_file():
                    if path=='/':
                        return self.send(200,'前端尚未构建，请在 frontend 目录运行 npm ci && npm run build。'.encode(),'text/plain; charset=utf-8')
                    raise LookupError('文件不存在。')
                mime=mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
                if target.suffix=='.js':
                    mime='text/javascript'
                if target.suffix in ('.mp4','.webm'):
                    content=target.read_bytes()
                    headers={'Accept-Ranges':'bytes'}
                    value=self.headers.get('Range')
                    if value:
                        match=re.fullmatch(r'bytes=(\d*)-(\d*)',value)
                        if not match or not any(match.groups()):
                            return self.send(416,b'',mime,extra_headers={'Content-Range':f'bytes */{len(content)}'})
                        first,last=match.groups()
                        start=int(first) if first else max(0,len(content)-int(last))
                        end=min(int(last),len(content)-1) if first and last else len(content)-1
                        if start>=len(content) or start>end:
                            return self.send(416,b'',mime,extra_headers={'Content-Range':f'bytes */{len(content)}'})
                        headers['Content-Range']=f'bytes {start}-{end}/{len(content)}'
                        return self.send(206,content[start:end+1],mime,extra_headers=headers)
                    return self.send(200,content,mime,extra_headers=headers)
                return self.send(200,target.read_bytes(),mime+('; charset=utf-8' if mime.startswith('text/') else ''))
            data={} if self.command=='DELETE' and self.headers.get('Content-Length','0')=='0' else self.body()
            if self.command=='POST':
                routes={'/api/project':service.project,'/api/documents':service.add_document,'/api/tasks':service.save_task,
                        '/api/budget':service.save_budget,'/api/ask':service.ask,'/api/generate':service.generate}
                if path=='/api/reset':
                    return self.send(200,service.result(service.store.reset()))
                if path in routes:
                    return self.send(200,routes[path](data))
            match=re.fullmatch(r'/api/(documents|tasks)/([a-f0-9]{16})',path)
            if match:
                kind,ident=match.groups()
                if self.command=='DELETE':
                    return self.send(200,service.delete(kind,ident))
                if self.command=='PATCH' and kind=='tasks':
                    return self.send(200,service.save_task(data,ident))
            raise LookupError('接口不存在。')

        def handle_request(self):
            try:
                self.route()
            except UserError as error:
                self.send(400,dict(error=str(error)))
            except LookupError as error:
                self.send(404,dict(error=str(error)))
            except ModelError as error:
                self.send(502,dict(error=str(error)))
            except (BrokenPipeError,ConnectionResetError):
                pass
            except Exception:
                self.send(500,dict(error='服务内部错误，未完成操作。请稍后重试。'))

        do_GET=do_HEAD=do_POST=do_PATCH=do_DELETE=handle_request

    return Handler


def create_server(port=8765,db=None,provider=None,static_root=None):
    service=Service(Store(db or ROOT/'data'/'workspace.sqlite3'),provider or Provider())
    server=ThreadingHTTPServer(('127.0.0.1',port),make_handler(service,static_root))
    server.daemon_threads=True
    return server


def main():
    parser=argparse.ArgumentParser(description='会务智策本地工作台')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--db',default=os.environ.get('HUIWU_DB',str(ROOT/'data'/'workspace.sqlite3')))
    args=parser.parse_args()
    try:
        server=create_server(args.port,args.db)
    except (OSError,ModelError):
        print('启动失败：请检查端口、数据库权限与本机模型配置。',file=sys.stderr)
        return 1
    settings=server.RequestHandlerClass
    print(f'会务智策已启动：http://127.0.0.1:{server.server_port}',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__=='__main__':
    raise SystemExit(main())
