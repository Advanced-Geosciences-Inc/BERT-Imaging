from pathlib import Path

# base = .../backend
BASE = Path(__file__).resolve().parents[1]
DATA_ROOT = BASE / "data"
RESULTS_ROOT = BASE / "results"

for p in (DATA_ROOT, RESULTS_ROOT):
    p.mkdir(parents=True, exist_ok=True)
