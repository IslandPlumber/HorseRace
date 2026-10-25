"""Check runtime audio hashes/levels and actual captured browser output."""
import json,hashlib,subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent
manifest=json.loads((root/'audio/manifest.json').read_text())
checks=[]
def decode(p):
 raw=subprocess.run(['ffmpeg','-v','error','-i',str(p),'-ac','1','-ar','16000','-f','f32le','pipe:1'],capture_output=True,check=True).stdout
 return np.frombuffer(raw,dtype='<f4')
for track in manifest['tracks']:
 p=root/'audio'/track['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==track['sha256']
 x=decode(p);peak=float(np.max(np.abs(x)));rms=float(np.sqrt(np.mean(x*x)));assert .005<rms<.5 and peak<1
 checks.append({'id':track['id'],'duration_seconds':len(x)/16000,'peak':peak,'rms':rms,'hash_matches':True})
p=root/'review/audio/actual-browser-audio.webm';x=decode(p);peak=float(np.max(np.abs(x)));rms=float(np.sqrt(np.mean(x*x)));assert .001<rms<.5 and peak<.99
report={'passed':True,'runtime_audio':checks,'browser_recording':{'duration_seconds':len(x)/16000,'decoded_peak':peak,'decoded_rms':rms,'clipped_samples':int(np.count_nonzero(np.abs(x)>=.99))}}
(root/'review/audio/media-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
