"""Prepare existing recorded voices and speech-only jaw envelopes."""
from pathlib import Path
import json,subprocess,wave
import numpy as np
import imageio_ffmpeg
root=Path(__file__).resolve().parent
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
source=root/'sources'/'trump_youre_fired.mp3'
result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(source),
    '-ac','1','-ar','44100','-f','f32le','pipe:1'],capture_output=True,check=True)
samples=np.frombuffer(result.stdout,dtype='<f4').copy();rate=44100
samples*=.86/max(float(np.max(np.abs(samples))),1e-9)
fade=round(.006*rate)
samples[:fade]*=np.linspace(0,1,fade);samples[-fade:]*=np.linspace(1,0,fade)
with wave.open(str(root/'audio'/'youre_fired.wav'),'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
    f.writeframes((samples*32767).astype('<i2').tobytes())
clips=[('Trump','youre_fired.wav',19,"YOU'RE FIRED!",'https://www.101soundboards.com/sounds/15922-youre-fired'),
       ('Biden','cmon_man.wav',55,"C'MON, MAN!",'https://www.youtube.com/watch?v=3qUgMGN04wU')]
report={'kind':'Existing recorded voices only; no synthesized or cloned voice.','fps':24,'frames':96,'clips':[]}
for name,file,start_frame,words,url in clips:
    with wave.open(str(root/'audio'/file),'rb') as f:
        rate=f.getframerate();pcm=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
    start=(start_frame-1)/24;rms=[]
    for frame in range(96):
        time=frame/24-start
        a=max(0,round(time*rate));b=min(len(pcm),round((time+1/24)*rate))
        rms.append(float(np.sqrt(np.mean(pcm[a:b]**2))) if b>a and time+1/24>0 else 0)
    peak=max(rms)
    envelope=[round(v/peak,6) if v/peak>.065 else 0 for v in rms]
    report['clips'].append({'rider':name,'file':file,'start_frame':start_frame,'start_seconds':start,
        'duration_seconds':len(pcm)/rate,'words':words,'source_url':url,'envelope':envelope})
(root/'audio'/'dialogue.json').write_text(json.dumps(report,indent=2))
print(json.dumps({x['rider']:{k:v for k,v in x.items() if k!='envelope'} for x in report['clips']},indent=2))
