# Atlas LW Server

The Atlas Liquid Wallet Server is the Atlas server layer in order to provide wallet operations such as generating address for clients via JSON-RPC protocol.

# Inpect

To inspect debian image, to run commands manually in order to debug something.
```shell
# Inspect the base image
docker container run --rm -it -v $(pwd)/data:/data debian:stable-slim bash

# Inspect the atlas image
docker container run --rm -it -p 32111:32111 -v $(pwd)/data:/data atlas-lw-server:1.0.0 bash

# Inpsect the atlas container 
docker container exec -it atlas-lw-server bash

# Inpsect the atlas docker-compose container 
docker container exec -it atlas-bounties-atlas-lw-server-1 bash
```

# Build

To build atlas liquid wallet server
```shell
docker build -t atlas-lw-server:1.0.0 .

or

./build.sh
```

# Run

To run atlas liquid wallet server locally
```shell
docker run -d --name atlas-lw-server --rm \
  -p 32111:32111 \
  -v $(pwd)/data:/data \
  atlas-lw-server:1.0.0

or

./run.sh
```

# Logs

To see the container logs
```shell
# The entire log
docker logs -f atlas-lw-server

# Only a few lines of logs
docker logs --tail 100 atlas-lw-server

# Via script
./logs.sh
```

# RPC

To see if atlas liquid wallet server is running
```shell
# get into de container first
docker container exec -it atlas-lw-server bash

# test if is running should get response "The rpc method 'get_info' does not exist" 
curl --location 'http://localhost:32111' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
    "jsonrpc" : "2.0",
    "id" : "1",
    "method": "get_info",
    "params": []
}'
```

# References
- https://docs.liquid.net/docs/lwk-overview-and-examples
- https://forge.rust-lang.org/infra/other-installation-methods.html
- https://linuxcapable.com/how-to-install-rust-on-debian-linux/
- https://blockstream.github.io/lwk/book/intro.html
- https://github.com/Blockstream/lwk/tree/master/lwk_cli
- https://liquidtestnet.com/faucet

