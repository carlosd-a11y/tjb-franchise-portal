"""Reading the Firebase config out of a pasted console snippet."""

import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "read_firebase_config.py"

PASTE = """
const firebaseConfig = {
  apiKey: "AIzaSyExampleKeyNotReal123456",
  authDomain: "tjb-franchise-portal.firebaseapp.com",
  projectId: "tjb-franchise-portal",
  storageBucket: "tjb-franchise-portal.firebasestorage.app",
  messagingSenderId: "362607255666",
  appId: "1:362607255666:web:abc123def456"
};
"""


def run(tmp_path, text):
    return subprocess.run(
        [sys.executable, "-I", str(SCRIPT)],
        input=text, capture_output=True, text=True, cwd=tmp_path, timeout=60,
    )


def test_it_reads_a_pasted_block(tmp_path):
    result = run(tmp_path, PASTE)
    assert result.returncode == 0, result.stderr
    written = (tmp_path / ".env.production").read_text()
    assert "VITE_FIREBASE_API_KEY=AIzaSyExampleKeyNotReal123456" in written
    assert "VITE_FIREBASE_PROJECT_ID=tjb-franchise-portal" in written
    assert "VITE_BACKEND=server" in written
    assert "VITE_USE_EMULATORS=false" in written


def test_it_copes_with_single_quotes_and_odd_spacing(tmp_path):
    odd = PASTE.replace('"', "'").replace(": ", ":   ")
    assert run(tmp_path, odd).returncode == 0
    assert "VITE_FIREBASE_APP_ID=1:362607255666:web:abc123def456" in (
        tmp_path / ".env.production"
    ).read_text()


def test_it_refuses_a_half_paste(tmp_path):
    result = run(tmp_path, 'apiKey: "AIzaSyOnlyThisOne",')
    assert result.returncode == 1
    assert "missing" in result.stderr
    assert not (tmp_path / ".env.production").exists()


def test_it_refuses_a_config_from_another_project(tmp_path):
    wrong = PASTE.replace('projectId: "tjb-franchise-portal"', 'projectId: "tjb-hiring-demo"')
    result = run(tmp_path, wrong)
    assert result.returncode == 1
    assert "tjb-hiring-demo" in result.stderr
    assert not (tmp_path / ".env.production").exists()


@pytest.mark.parametrize("text", ["", "   \n\n", "nothing useful here"])
def test_it_refuses_rubbish(tmp_path, text):
    assert run(tmp_path, text).returncode == 1
