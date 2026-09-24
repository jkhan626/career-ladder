"""Render the hub explainer to MP4 (1080p30) frame by frame with Playwright + ffmpeg.
Usage: python render_mp4.py <out.mp4>   (serves the hub folder on :8766 itself)"""
import base64, os, subprocess, sys, threading, wave, http.server, socketserver, functools, shutil
from playwright.sync_api import sync_playwright
HUB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'explainer.mp4')
TMP = os.path.join(os.path.dirname(OUT), '_frames'); FPS = 30; WIDTH = 1920
shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP)
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HUB)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 8766), functools.partial(Q, directory=HUB))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.goto('http://127.0.0.1:8766/explainer/preview.html?clt=0')
    pg.wait_for_function('window.__clxExport && window.__clxExport.duration() > 50', timeout=30000)
    pg.wait_for_timeout(4000)  # fonts + QR image
    info = pg.evaluate('window.__clxExport.audio()')
    size = 500000; parts = []
    for i in range((info['b64len'] + size - 1) // size): parts.append(pg.evaluate(f'window.__clxExport.pcmChunk({i},{size})'))
    pcm = base64.b64decode(''.join(parts))
    wav = os.path.join(TMP, 'audio.wav')
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(info['rate']); w.writeframes(pcm)
    dur = pg.evaluate('window.__clxExport.duration()'); n = int(dur * FPS)
    print('audio ok', info, 'frames', n, flush=True)
    for i in range(n):
        d = pg.evaluate(f'window.__clxExport.frame({i / FPS:.4f},{WIDTH})')
        open(os.path.join(TMP, f'{i:05d}.jpg'), 'wb').write(base64.b64decode(d.split(',', 1)[1]))
        if i % 150 == 0: print('frame', i, flush=True)
    b.close()
httpd.shutdown()
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(TMP, '%05d.jpg'), '-i', wav,
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
                '-movflags', '+faststart', '-shortest', OUT], check=True)
SMALL = OUT.replace('.mp4', '_720p_email.mp4')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(TMP, '%05d.jpg'), '-i', wav,
                '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', SMALL], check=True)
print('SMALL', SMALL, os.path.getsize(SMALL) // 1024, 'KB')
shutil.rmtree(TMP, ignore_errors=True)
print('DONE', OUT, os.path.getsize(OUT) // 1024, 'KB')
