"""Extract the user's supplied recording; no speech synthesis or voice cloning."""
from pathlib import Path
import subprocess,json,wave
import numpy as np
import imageio_ffmpeg

root=Path(__file__).resolve().parent
out=root/'audio';out.mkdir(exist_ok=True)
source=root/'sources'/'biden_reference.webm'
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
clips=[('cmon_man',37.34,1.10,"C'mon, man!"),
       ('hairy_legs',38.43,1.87,'I got hairy legs')]
report={'source_url':'https://www.youtube.com/watch?v=3qUgMGN04wU',
        'source_title':'Joe Biden: Come On Man (Small Edit)',
        'source_channel':'CARBONSLAY','audio_track':'en-US original (251-7)',
        'construction':'Recorded excerpts only. No synthetic speech or voice cloning.',
        'clips':[]}
for name,start,length,words in clips:
    path=out/(name+'.wav')
    subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-ss',str(start),
        '-i',str(source),'-t',str(length),'-vn','-ar','44100','-ac','1',
        '-c:a','pcm_s16le',str(path)],check=True)
    with wave.open(str(path),'rb') as f:
        rate=f.getframerate();samples=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
    # Preserve timing and pitch; normalize only volume and soften edit edges.
    peak=float(np.max(np.abs(samples)))
    samples*=.86/max(peak,1e-9)
    fade=min(round(.008*rate),len(samples)//4)
    samples[:fade]*=np.linspace(0,1,fade);samples[-fade:]*=np.linspace(1,0,fade)
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
        f.writeframes((samples*32767).astype('<i2').tobytes())
    report['clips'].append({'file':path.name,'source_start_seconds':start,
        'duration_seconds':len(samples)/rate,'words':words,'rate':rate,'peak':float(np.max(np.abs(samples)))})
    if name=='cmon_man':
        rms=[]
        for frame in range(96):
            time=frame/24-1.75
            a=max(0,round(time*rate));b=min(len(samples),round((time+1/24)*rate))
            rms.append(float(np.sqrt(np.mean(samples[a:b]**2))) if b>a and time+1/24>0 else 0)
        upper=max(rms)
        envelope=[round(min(1,v/upper),5) for v in rms]
        (out/'cmon_man_envelope.json').write_text(json.dumps({'start_frame':43,'start_seconds':1.75,
            'end_seconds':2.85,'frames':envelope},indent=2))
(out/'clips.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
