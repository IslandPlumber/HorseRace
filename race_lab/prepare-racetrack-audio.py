"""Prepare quieter outdoor audience/applause and real galloping; retain the bugle."""
import hashlib,json,shutil,subprocess,tempfile,urllib.request
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
RATE=32000
FFMPEG=shutil.which('ffmpeg')
if not FFMPEG:
    import imageio_ffmpeg
    FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
sources={
    'audience':('https://upload.wikimedia.org/wikipedia/commons/a/a3/Slow_starting_applause.ogg','https://commons.wikimedia.org/wiki/File:Slow_starting_applause.ogg','stephan','Public domain'),
    'hooves':('https://upload.wikimedia.org/wikipedia/commons/9/96/Six_Horses_Galloping_By.ogg','https://commons.wikimedia.org/wiki/File:Six_Horses_Galloping_By.ogg','Bruno Auzet / Freesound Community','CC0 (as recorded by Wikimedia Commons)'),
}
manifest=json.loads((ROOT/'audio/manifest.json').read_text())
tracks=[t for t in manifest['tracks'] if t['id']=='bugle']
with tempfile.TemporaryDirectory(prefix='horserace-audience-') as directory:
    raw={};hashes={}
    for key,(url,*_) in sources.items():
        source=Path(directory)/(key+'.ogg')
        request=urllib.request.Request(url,headers={'User-Agent':'HorseRacePrototype/1.0 (audio asset preparation)'})
        with urllib.request.urlopen(request,timeout=60) as response: source.write_bytes(response.read())
        hashes[key]=hashlib.sha256(source.read_bytes()).hexdigest()
        data=subprocess.run([FFMPEG,'-v','error','-i',str(source),'-ac','2','-ar',str(RATE),'-af','highpass=f=90,lowpass=f=6500','-f','f32le','pipe:1'],capture_output=True,check=True).stdout
        raw[key]=np.frombuffer(data,dtype='<f4').reshape(-1,2).copy()
    for name,key,start,duration,rms,loop in [('crowd','audience',0,8,.075,True),('cheer','audience',17,4,.13,False),('hooves','hooves',8,8,.18,True)]:
        audio=raw[key][int(start*RATE):int((start+duration)*RATE)].copy()
        assert len(audio)>=3*RATE
        if name=='crowd':
            # Suppress foreground bursts rather than endlessly repeating them.
            size,hop=1024,256
            padded=np.pad(audio,((size,size),(0,0)))
            window=np.hanning(size)[:,None]
            spectra=np.array([np.fft.rfft(padded[i:i+size]*window,axis=0) for i in range(0,len(padded)-size,hop)])
            magnitudes=np.abs(spectra)
            for i in range(len(spectra)):
                bed=np.median(magnitudes[max(0,i-12):min(len(spectra),i+13)],axis=0)
                spectra[i]*=np.minimum(1,(bed*1.35+1e-8)/(magnitudes[i]+1e-8))
            clean=np.zeros_like(padded);weight=np.zeros((len(padded),1))
            for j,spectrum in enumerate(spectra):
                i=j*hop;clean[i:i+size]+=np.fft.irfft(spectrum,n=size,axis=0)*window;weight[i:i+size]+=window**2
            audio=(clean/np.maximum(weight,1e-8))[size:size+len(audio)]
        if loop:
            n=int(.25*RATE);u=np.linspace(0,1,n)[:,None]
            audio=np.concatenate([audio[n:-n],audio[-n:]*(1-u)+audio[:n]*u])
        else:
            n=int(.1*RATE);audio[:n]*=np.linspace(0,1,n)[:,None]
            n=int(1*RATE);audio[-n:]*=np.linspace(1,0,n)[:,None]
        audio*=min(rms/max(float(np.sqrt(np.mean(audio**2))),1e-6),.72/max(float(np.max(np.abs(audio))),1e-6))
        target=ROOT/'audio'/(name+'.mp3')
        subprocess.run([FFMPEG,'-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','96k',str(target)],input=audio.astype('<f4').tobytes(),check=True)
        decoded=subprocess.run([FFMPEG,'-v','error','-i',str(target),'-ac','2','-ar',str(RATE),'-f','f32le','pipe:1'],capture_output=True,check=True).stdout
        samples=np.frombuffer(decoded,dtype='<f4')
        assert np.max(np.abs(samples))<1
        url,page,artist,license=sources[key]
        tracks.append(dict(id=name,file=target.name,source=url,source_page=page,artist=artist,license=license,source_sha256=hashes[key],sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size,duration_seconds=len(samples)/2/RATE,decoded_peak=float(np.max(np.abs(samples))),decoded_rms=float(np.sqrt(np.mean(samples**2))),adaptation=f'{start}–{start+duration}s excerpt; filtered, normalized, '+('crossfaded loop' if loop else 'short faded applause reaction; never continuously looped')))
manifest.update(tracks=tracks,preparation='prepare-racetrack-audio.py',mix='Transient-suppressed outdoor audience; brief enveloped applause; individual distance-driven hoof voices derived from recorded galloping and dry dirt impacts; no fixed-size herd loop or F1 air horns.')
(ROOT/'audio/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(tracks,indent=2))
