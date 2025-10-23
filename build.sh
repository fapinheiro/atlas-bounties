# Build script for Atlas LW Server
cd atlas-lw-server/scripts
./build.sh
cd ../..

# Build Atlas Bounties Bot
cd atlas-bounties-bot
npm install
cd scripts
./build.sh
cd ../..

