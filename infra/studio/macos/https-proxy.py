import http.server, http.client, ssl
class Proxy(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def handle_request(self):
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n) if n else None
        headers = {k:v for k,v in self.headers.items() if k.lower() not in ('connection','transfer-encoding','host')}
        headers['Host'] = 'localhost:43122'
        c = http.client.HTTPConnection('127.0.0.1', 43123, timeout=60)
        try:
            c.request(self.command, self.path, body=data, headers=headers)
            res = c.getresponse()
            body = res.read()
            self.send_response_only(res.status, res.reason)
            for k,v in res.getheaders():
                if k.lower() not in ('connection','transfer-encoding','content-length'):
                    self.send_header(k,v)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        finally: c.close()
    do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = do_HEAD = handle_request
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1',43122), Proxy)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
from pathlib import Path
cert_dir = Path.home() / '.dechive-wiki-studio'
ctx.load_cert_chain(str(cert_dir / 'localhost.crt'), str(cert_dir / 'localhost.key'))
server.socket = ctx.wrap_socket(server.socket, server_side=True)
server.serve_forever()
