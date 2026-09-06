"""Upload only QA screenshots and recording using configured R2 credentials."""
from pathlib import Path
import os
import mimetypes
import urllib.request
import boto3
ROOT=Path(__file__).resolve().parents[1]
PREFIX="opensketch/experimental-ai-assets-20260904/batch-02"
client=boto3.client("s3",endpoint_url="https://"+os.environ["CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],region_name="auto")
for name in ["collection-svg.png","collection-png-dark.png","collection-png-white.png","collection-svg-dark.png","collection-svg-white.png","transparency-inspection.webm"]:
    key=PREFIX+"/"+name
    client.upload_file(str(ROOT/"qa"/name),os.environ["R2_BUCKET"],key,ExtraArgs={"ContentType":mimetypes.guess_type(name)[0]})
    url=os.environ["R2_PUBLIC_BASE_URL"].rstrip("/")+"/"+key
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})) as response:
        assert response.status==200
    print(url)
