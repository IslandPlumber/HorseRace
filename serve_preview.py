"""Loopback-only local player server, including MP4 byte ranges for seeking."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re

os.chdir(Path(__file__).resolve().parent)

class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.byte_range=None
        path=Path(self.translate_path(self.path))
        requested=self.headers.get('Range','')
        if path.suffix.lower()!='.mp4' or not path.is_file() or not requested:
            return super().send_head()
        size=path.stat().st_size
        match=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
        if not match or not any(match.groups()):
            self.send_error(416,'Unsupported byte range');return None
        a,b=match.groups()
        start=int(a) if a else max(0,size-int(b))
        end=min(int(b),size-1) if a and b else size-1
        if start>=size or start>end:
            self.send_response(416)
            self.send_header('Content-Range',f'bytes */{size}')
            self.end_headers();return None
        f=path.open('rb');f.seek(start)
        self.byte_range=(start,end)
        self.send_response(206)
        self.send_header('Content-Type','video/mp4')
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length',str(end-start+1))
        self.end_headers()
        return f

    def copyfile(self,source,outputfile):
        if self.byte_range is None:
            return super().copyfile(source,outputfile)
        remain=self.byte_range[1]-self.byte_range[0]+1
        while remain:
            chunk=source.read(min(remain,256*1024))
            if not chunk:break
            try:outputfile.write(chunk)
            except (BrokenPipeError,ConnectionResetError):break
            remain-=len(chunk)

print('Local sample: http://127.0.0.1:8768/preview.html',flush=True)
ThreadingHTTPServer(('127.0.0.1',8768),RangeHandler).serve_forever()
