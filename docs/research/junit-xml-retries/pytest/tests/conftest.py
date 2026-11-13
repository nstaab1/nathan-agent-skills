import os
from pathlib import Path

import pytest

# Marker files carry state from one attempt to the next, whether the attempt is
# a rerun inside the same pytest process or a new pytest process.
STATE = Path(os.environ.get("FLAKE_STATE", Path(__file__).resolve().parent.parent / ".flake-state"))


@pytest.fixture
def first_attempt(request):
    """True the first time this test runs since the state folder was cleared."""
    marker = STATE / request.node.nodeid.replace("/", "_").replace(":", "_")
    if marker.exists():
        return False
    STATE.mkdir(parents=True, exist_ok=True)
    marker.touch()
    return True
