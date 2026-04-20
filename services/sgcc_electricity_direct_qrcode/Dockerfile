FROM arcw/sgcc_electricity:latest

COPY patch_direct_qrcode.py /tmp/patch_direct_qrcode.py
RUN python3 /tmp/patch_direct_qrcode.py && rm -f /tmp/patch_direct_qrcode.py
