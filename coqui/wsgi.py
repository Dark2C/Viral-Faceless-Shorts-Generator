#!/usr/bin/env python3
"""
Threaded TTS server wrapper - enables concurrent request handling.
Patches the Flask app to use threading before starting the TTS server.
"""
import os
import sys

# Must set before importing TTS
os.environ.setdefault("TTS_HOME", "/root/.local/share/tts")

# Monkey-patch Flask's run method to enable threading
import flask
_original_run = flask.Flask.run

def patched_run(self, *args, **kwargs):
    kwargs.setdefault('threaded', True)
    return _original_run(self, *args, **kwargs)

flask.Flask.run = patched_run

# Now import and run the TTS server
# This will use our patched Flask.run() with threading enabled
from TTS.server.server import app, args

print(f"Starting TTS server in threaded mode on {args.port}...")
app.run(
    host="::",
    port=args.port,
    debug=args.debug,
    threaded=True
)
