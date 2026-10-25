"""Prepare compact, credited runtime effects from verified public source URLs."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
SOURCES=[
 ('bugle','FirstCall.mp3','https://upload.wikimedia.org/wikipedia/commons/5/5d/FirstCall.mp3','U.S. Army','Public domain','https://commons.wikimedia.org/wiki/File:FirstCall.mp3'),
 ('crowd','crowd.wav','https://upload.wikimedia.org/wikipedia/commons/a/a9/360703_eguobyte_large-crowd-medium-distance-stereo.wav','eguobyte','CC0','https://commons.wikimedia.org/wiki/File:360703_eguobyte_large-crowd-medium-distance-stereo.wav'),
 ('cheer','cheer.wav','https://upload.wikimedia.org/wikipedia/commons/9/94/F1-Race-Crowd-Applause-Air-Horns.wav','WebbFilmsUK','CC BY 4.0','https://commons.wikimedia.org/wiki/File:F1-Race-Crowd-Applause-Air-Horns.wav'),
]
RATE=32000
(ROOT/'audio').mkdir(exist_ok=True)
report=[]
with tempfile.TemporaryDirectory(prefix='race-sound-') as directory:
 for name,file,url,artist,license,page in SOURCES:
  path=Path(directory)/file
  subprocess.run(['curl','-fsSL','--retry','2','--max-time','90',url,'-o',str(path)],check=True)
  raw=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-ac','2','-ar',str(RATE),'-af','highpass=f=100,lowpass=f=9500'+(',alimiter=limit=0.15:level=0' if name=='cheer' else ''),'-f','f32le','pipe:1'],capture_output=True,check=True).stdout
  audio=np.frombuffer(raw,dtype='<f4').reshape(-1,2).copy()
  if name=='bugle':
   active=np.flatnonzero(np.max(np.abs(audio),axis=1)>.008)
   audio=audio[max(0,active[0]-int(.025*RATE)):min(len(audio),active[-1]+int(.12*RATE))]
   peak=np.max(np.abs(audio));audio*=.72/max(peak,1e-6)
   fade=int(.02*RATE);audio[:fade]*=np.linspace(0,1,fade)[:,None];audio[-fade:]*=np.linspace(1,0,fade)[:,None]
  else:
   audio=audio[:int((24 if name=='crowd' else 16)*RATE)]
   # A continuous wrap: blend the tail into the next pass's opening section.
   n=int(.35*RATE);u=np.linspace(0,1,n)[:,None]
   audio=np.concatenate([audio[n:-n],audio[-n:]*(1-u)+audio[:n]*u])
   rms=float(np.sqrt(np.mean(audio**2)));audio*=min((.15 if name=='crowd' else .20)/max(rms,1e-6),.72/max(np.max(np.abs(audio)),1e-6))
  target=ROOT/'audio'/f'{name}.mp3'
  subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','96k',str(target)],input=audio.astype('<f4').tobytes(),check=True)
  decoded=subprocess.run(['ffmpeg','-v','error','-i',str(target),'-ac','2','-ar',str(RATE),'-f','f32le','pipe:1'],capture_output=True,check=True).stdout
  samples=np.frombuffer(decoded,dtype='<f4');peak=float(np.max(np.abs(samples)));assert peak<1
  report.append(dict(id=name,file=target.name,source=url,source_page=page,artist=artist,license=license,source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size,duration_seconds=len(samples)/2/RATE,decoded_peak=peak,decoded_rms=float(np.sqrt(np.mean(samples**2))),adaptation='Filtered, trimmed, level-adjusted; crowd/cheer loop seams crossfaded.'))
(ROOT/'audio/manifest.json').write_text(json.dumps({'sample_rate':RATE,'tracks':report,'starter_shot':'Original deterministic procedural sound design in race-audio.js; no recording or voice used.'},indent=2)+'\n')
print(json.dumps(report,indent=2))
