# Atlas Bounties Bot

 The Atlas Bounties Bot is the interface for users to create bounties via Telegram.

 
# Inpect

    To inspect debian image, to run commands manually in order to debug something.

```shell
# Inspect the base image
docker container run --rm -it -v $(pwd)/data:/data debian:stable-slim bash

# Inspect the atlas image
docker container run --rm -it -v $(pwd)/data:/data atlas-bounties-bot:1.0.0 bash

# Inpsect the atlas container 
docker container exec -it atlas-bounties-bot bash

# Inpsect the atlas docker-compose container 
docker container exec -it atlas-bounties-atlas-bounties-bot-1 bash
```

