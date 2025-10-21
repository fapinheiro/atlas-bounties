docker run -d --name atlas-lw-server --rm \
  -p 32111:32111 \
  -v $(pwd)/data:/data \
  atlas-lw-server:1.0.0