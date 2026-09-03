FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DOWNLOAD_DIR=/tmp/tg-downloads

WORKDIR /srv

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Telethon depends on pyaes, which ships only an sdist with a legacy setup.py.
# setuptools 78+ dropped "setup.py install", so pin it below that to build.
COPY requirements.txt .
RUN pip install "setuptools<78" wheel \
 && pip install -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
