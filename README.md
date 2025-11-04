# Atlas Bounties

The Atlas Bounties is a reward program so that the community can suggest new features and developers gets rewarded by implementing the features.

The Atlas Bounties uses Telegram bot.

The suggested features is ranked based on payments. The community will pay for what they want the most. 

The payments can be by Pix (via Altas Bridge) or Depix (via Altas Liquid Wallet Server)


# Requirements

- Docker 4.16.2 (95914) or latest
- Build
```shell
chmod +x build.sh start.sh stop.sh logs.sh
./build.sh
```
- Install Migrations
```shell
atlas-bounties-bot\migrations\001.schema.sql
```

# Run
Start environment
```shell
./start.sh
```

Check if server is running
```shell
./logs.sh
```

# Generate Mnemonics
For the first time will have to generate mnemonics and setup wallet.

```shell
# get inside server
docker container exec -it atlas-bounties-atlas-lw-server-1 bash

# warning: get mnemonic or ignore if already defined in .env
MNEMONICS=$(lwk_cli signer generate | jq -r .mnemonic)

# prd
MNEMONICS=$(lwk_cli --network mainnet --addr 127.0.0.1:32112 signer generate | jq -r .mnemonic)

# load wallet
lwk_cli signer load-software --persist true --mnemonic "$MNEMONICS" --signer s1
DESCRIPTOR=$(lwk_cli signer singlesig-desc --signer s1 --descriptor-blinding-key slip77 --kind wpkh | jq -r .descriptor)
lwk_cli wallet load --wallet w1 -d "$DESCRIPTOR"

# prd
lwk_cli --network mainnet --addr 127.0.0.1:32112 signer load-software --persist true --mnemonic "$MNEMONICS" --signer s1
DESCRIPTOR=$(lwk_cli --network mainnet --addr 127.0.0.1:32112 signer singlesig-desc --signer s1 --descriptor-blinding-key slip77 --kind wpkh | jq -r .descriptor)
lwk_cli --network mainnet --addr 127.0.0.1:32112 wallet load --wallet w1 -d "$DESCRIPTOR"

# Scan blockchain if persitent or cache files is lost
lwk-cli server scan
# prd
lwk-cli --network mainnet --addr 127.0.0.1:32112 server scan

```


# Generate Address via RPC
If wallet is already setup, just try generating address through RPC
```shell
# localhost
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_address", "params": { "index": 0, "name": "w1", "with_text_qr": false}, "id":1, "jsonrpc":"2.0"}' http://localhost:32111 -s
# prd
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_address", "params": { "index": 0, "name": "w1", "with_text_qr": false}, "id":1, "jsonrpc":"2.0"}' http://localhost:32112 -s

# inside server container
docker container exec -it atlas-bounties-atlas-lw-server-1 bash
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_address", "params": { "index": 0, "name": "w1", "with_text_qr": false}, "id":1, "jsonrpc":"2.0"}' http://localhost:32111 -s
# prd
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_address", "params": { "index": 0, "name": "w1", "with_text_qr": false}, "id":1, "jsonrpc":"2.0"}' http://localhost:32112 -s

# inside atlas bot container
docker container exec -it atlas-bounties-atlas-bounties-bot-1 bash
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_address", "params": { "index": 0, "name": "w1", "with_text_qr": false}, "id":1, "jsonrpc":"2.0"}' http://atlas-lw-server:32111 -s
# prd
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_address", "params": { "index": 0, "name": "w1", "with_text_qr": false}, "id":1, "jsonrpc":"2.0"}' http://atlas-lw-server:32111 -s
```

# List Wallet UTXOS via RPC
To list wallet utxos

```shell
# localhost
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_utxos", "params": { "name": "w1"}, "id":1, "jsonrpc":"2.0"}' http://localhost:32111 -s
# prd
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_utxos", "params": { "name": "w1"}, "id":1, "jsonrpc":"2.0"}' http://localhost:32112 -s

# inside server container
docker container exec -it atlas-bounties-atlas-lw-server-1 bash
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_utxos", "params": { "name": "w1"}, "id":1, "jsonrpc":"2.0"}' http://localhost:32111 -s
# prd
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_utxos", "params": { "name": "w1"}, "id":1, "jsonrpc":"2.0"}' http://localhost:32112 -s

# inside atlas bot container
docker container exec -it atlas-bounties-atlas-bounties-bot-1 bash
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_utxos", "params": { "name": "w1"}, "id":1, "jsonrpc":"2.0"}' http://atlas-lw-server:32111 -s
# prd
curl --header "Content-Type: application/json" --request POST --data '{"method":"wallet_utxos", "params": { "name": "w1"}, "id":1, "jsonrpc":"2.0"}' http://atlas-lw-server:32112 -s
```



