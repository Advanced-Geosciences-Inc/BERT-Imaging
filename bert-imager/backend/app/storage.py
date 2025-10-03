import uuid
from pathlib import Path
from .config import DATA_ROOT

def save_upload(kind: str, content: bytes, orig_suffix: str) -> Path:
    file_id = f"{kind}-{uuid.uuid4().hex}"
    path = DATA_ROOT / f"{file_id}{orig_suffix}"
    path.write_bytes(content)
    return path
