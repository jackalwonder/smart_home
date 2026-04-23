FROM arcw/sgcc_electricity:latest

COPY patch_direct_qrcode.py /tmp/patch_direct_qrcode.py
RUN python3 /tmp/patch_direct_qrcode.py && rm -f /tmp/patch_direct_qrcode.py

RUN pip3 install --no-cache-dir "fastapi>=0.115.0,<1.0.0" "uvicorn>=0.30.0,<1.0.0"

COPY sgcc_sidecar.py /app/sgcc_sidecar.py
