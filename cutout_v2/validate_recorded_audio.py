from pathlib import Path
import subprocess,wave,json,hashlib
import numpy as np
import imageio_ffmpeg
root=Path(__file__).resolve().parent
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
video=root/'streakchat_cmon_man.mp4'
result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(video),
    '-vn','-ac','1','-ar','44100','-f','f32le','pipe:1'],capture_output=True,check=True)
decoded=np.frombuffer(result.stdout,dtype='<f4')
with wave.open(str(root/'audio'/'cmon_man.wav'),'rb') as f:
    rate=f.getframerate();source=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
expected=round(1.75*rate)
margin=2048
segment=decoded[expected-margin:expected+len(source)+margin]
size=1 << (len(segment)+len(source)-2).bit_length()
correlation=np.fft.irfft(np.fft.rfft(segment,size)*np.conjugate(np.fft.rfft(source,size)),size)
lag=int(np.argmax(correlation[:2*margin+1]))
aligned=segment[lag:lag+len(source)]
match=float(np.corrcoef(source,aligned)[0,1])
active=np.flatnonzero(np.abs(decoded)>.005)
info={'video':video.name,'decoded_audio_seconds':len(decoded)/rate,
      'recording_insert_seconds':1.75,'hat_release_seconds':40/24,
      'audible_start_seconds':float(active[0]/rate),'audible_end_seconds':float(active[-1]/rate),
      'matches_source_recording_correlation':match,'alignment_offset_samples':lag-margin,
      'decoded_peak':float(np.max(np.abs(decoded))),
      'source_url':'https://www.youtube.com/watch?v=3qUgMGN04wU',
      'source_excerpt_seconds':[37.34,38.44],
      'source_wav_sha256':hashlib.sha256((root/'audio'/'cmon_man.wav').read_bytes()).hexdigest()}
assert match>.97,info
assert 1.70<info['audible_start_seconds']<2.10,info
assert 2.4<info['audible_end_seconds']<2.95,info
assert info['decoded_peak']>.1,info
(root/'audio_validation.json').write_text(json.dumps(info,indent=2))
print(json.dumps(info,indent=2))
