from pathlib import Path
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
import json,re

root=Path(__file__).resolve().parent/'sources'
root.mkdir(exist_ok=True)
sources={
 'horse.blend':'https://opengameart.org/sites/default/files/riggedHorse.blend',
 'trump.png':'https://www.whitehouse.gov/wp-content/uploads/2025/06/President-Donald-Trump-Official-Presidential-Portrait.png',
 'biden.png':'https://bidenwhitehouse.archives.gov/wp-content/uploads/2025/01/biden-profile-31.png',
}
def fetch(item):
    name,url=item
    request=Request(url,headers={'User-Agent':'StreakChat-Local-Art-Prototype/1.0'})
    with urlopen(request,timeout=60) as response:
        data=response.read()
    (root/name).write_bytes(data)
    return {'file':name,'url':url,'bytes':len(data)}
with ThreadPoolExecutor(max_workers=3) as pool:
    report=list(pool.map(fetch,sources.items()))
(root/'source_urls.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
