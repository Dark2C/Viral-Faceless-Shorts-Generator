FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask piper-tts pathvalidate g2pw requests unicode-rbnf sentence-stream

# Needed for g2pw
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 5002

CMD ["python", "/app/app.py"]
