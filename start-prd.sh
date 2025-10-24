docker-compose -f docker-compose-prd.yml up -d 

# Wait for a few seconds to allow the container to start
sleep 5

# Check if the server is running
if [ "$(docker-compose ps -q atlas-lw-server | xargs docker inspect -f '{{.State.Running}}')" != "true" ]; then
  echo "Atlas Liquid Server container failed to start."
  exit 1
fi

# Check if database is running
if [ "$(docker-compose ps -q supabase | xargs docker inspect -f '{{.State.Running}}')" != "true" ]; then
  echo "Database container failed to start."
  exit 1
fi

cd atlas-bounties-bot
npm run prod
cd ..