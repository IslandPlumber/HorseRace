"""Check rendered frame coverage and inspect standard GLB/MP4 metadata."""
import json
import struct
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent
framefolder=root/'renders'/'720p'
frames=[]
for f in range(1,145):
    path=framefolder/f'frame_{f:04d}.png'
    with Image.open(path) as im:
        assert im.size==(1280,720),(f,im.size)
        im.verify()
    frames.append(f)
assets=[]
for path in sorted((root/'assets').glob('*.glb')):
    data=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data)
    n,chunk=struct.unpack_from('<I4s',data,12)
    assert chunk==b'JSON'
    doc=json.loads(data[20:20+n])
    entry={'file':path.name,'bytes':len(data),'meshes':len(doc.get('meshes',[])),
        'skins':len(doc.get('skins',[])),'animations':len(doc.get('animations',[])),
        'nodes':len(doc.get('nodes',[]))}
    assert entry['meshes']>0,entry
    if path.stem!='red_cap':
        assert entry['skins']>0 and entry['animations']>0,entry
    assets.append(entry)
assert len(assets)==5,assets

def boxes(buf,start=0,end=None):
    end=len(buf) if end is None else end
    p=start
    while p+8<=end:
        size,typ=struct.unpack_from('>I4s',buf,p)
        head=8
        if size==1:
            size=struct.unpack_from('>Q',buf,p+8)[0];head=16
        if size==0:size=end-p
        if size<head or p+size>end:raise ValueError('Invalid MP4 box')
        yield typ,p+head,p+size
        p+=size

video=(root/'streakchat_hat_throw.mp4').read_bytes()
video_report={'bytes':len(video)}
for typ,start,end in boxes(video):
    if typ==b'moov':
        for t,s,e in boxes(video,start,end):
            if t==b'mvhd':
                version=video[s]
                offset=s+(20 if version==1 else 12)
                timescale=struct.unpack_from('>I',video,offset)[0]
                duration=struct.unpack_from('>Q' if version==1 else '>I',video,offset+4)[0]
                video_report['seconds']=duration/timescale
            if t==b'trak':
                for tt,ss,ee in boxes(video,s,e):
                    if tt==b'tkhd':
                        w,h=struct.unpack_from('>II',video,ee-8)
                        if w and h:video_report['resolution']=[w/65536,h/65536]
assert video_report['resolution']==[1280,720],video_report
assert abs(video_report['seconds']-6)<.05,video_report
result={'verified_frames':len(frames),'frame_resolution':[1280,720],
        'video':video_report,'assets':assets}
(root/'validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
