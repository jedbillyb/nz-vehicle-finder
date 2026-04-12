#!/bin/bash
# Sync local changes to the remote server and restart the application if needed.

SERVER="ubuntu@server.jedbillyb.com"
REMOTE_DIR="nz-vehicle-finder"
KEY="~/downloads/Other/ssh-key-2026-03-14.key"

echo "🚀 Syncing with server..."
# Sync files (excluding node_modules and build artifacts)
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' ./ $SERVER:$REMOTE_DIR/

echo "🛠️ Restarting app on server..."
# Example: If running via PM2 or a custom start script, adjust this command
ssh -i $KEY $SERVER "cd $REMOTE_DIR && npm install && npm run build"
echo "✅ Deployment complete!"
