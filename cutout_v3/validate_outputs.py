"""Verify rendered media, inspect frame exposure, and compare recorded audio."""
from pathlib import Path
import subprocess,wave,json,struct,hashlib
import numpy as np
import imageio_ffmpeg
from PIL import Image,ImageDraw,ImageStat
root=Path(__file__).resolve().parent
frames=[]
for f in range(1,97):
    path=root/'frames'/f'{f:04d}.png'
    with Image.open(path) as im:
        assert im.size==(1600,900),(f,im.size)
        im.verify()
    with Image.open(path) as im:
        frames.append({'frame':f,'brightness':ImageStat.Stat(im.convert('L')).mean[0]})
brightness=[f['brightness'] for f in frames]
assert min(brightness)>.80*np.median(brightness),(min(brightness),np.median(brightness))
sheet=Image.new('RGB',(1600,3*250),(23,25,24));draw=ImageDraw.Draw(sheet)
for i,f in enumerate([1,10,20,32,41,48,60,68,73,81,89,96]):
    with Image.open(root/'frames'/f'{f:04d}.png') as im:
        im.thumbnail((400,225));sheet.paste(im,((i%4)*400,(i//4)*250))
    draw.text(((i%4)*400+8,(i//4)*250+228),f'Frame {f:02d} / {(f-1)/24:.2f} sec',fill=(238,233,219))
sheet.save(root/'motion_contact_sheet.jpg',quality=92)
video=root/'streakchat_three_riders.mp4'
data=video.read_bytes()
def boxes(a,b):
    while a+8<=b:
        n,t=struct.unpack_from('>I4s',data,a)
        assert n>=8 and a+n<=b
        yield t,a+8,a+n
        a+=n
info={}
for t,s,e in boxes(0,len(data)):
    if t==b'moov':
        for t1,s1,e1 in boxes(s,e):
            if t1==b'mvhd':
                at=s1+(20 if data[s1]==1 else 12)
                rate=struct.unpack_from('>I',data,at)[0]
                duration=struct.unpack_from('>Q' if data[s1]==1 else '>I',data,at+4)[0]
                info['seconds']=duration/rate
            if t1==b'trak':
                for t2,s2,e2 in boxes(s1,e1):
                    if t2==b'tkhd':
                        w,h=struct.unpack_from('>II',data,e2-8)
                        if w:info['resolution']=[w/65536,h/65536]
assert abs(info['seconds']-4)<.05 and info['resolution']==[1600,900],info
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(video),
    '-vn','-ac','1','-ar','44100','-f','f32le','pipe:1'],capture_output=True,check=True)
decoded=np.frombuffer(result.stdout,dtype='<f4')
with wave.open(str(root/'audio'/'cmon_man.wav'),'rb') as f:
    rate=f.getframerate();source=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
expected=round(1.75*rate);margin=2048
segment=decoded[expected-margin:expected+len(source)+margin]
size=1 << (len(segment)+len(source)-2).bit_length()
correlation=np.fft.irfft(np.fft.rfft(segment,size)*np.conjugate(np.fft.rfft(source,size)),size)
lag=int(np.argmax(correlation[:2*margin+1]));aligned=segment[lag:lag+len(source)]
match=float(np.corrcoef(source,aligned)[0,1]);active=np.flatnonzero(np.abs(decoded)>.005)
assert match>.97,match
info.update({'verified_frames':96,'video_bytes':len(data),'source_audio_correlation':match,
    'audio_alignment_offset_samples':lag-margin,'audible_start_seconds':float(active[0]/rate),
    'audible_end_seconds':float(active[-1]/rate),'brightness_min':min(brightness),
    'brightness_median':float(np.median(brightness)),
    'source_wav_sha256':hashlib.sha256((root/'audio'/'cmon_man.wav').read_bytes()).hexdigest()})
(root/'validation.json').write_text(json.dumps(info,indent=2))
print(json.dumps(info,indent=2))
