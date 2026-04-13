#!/bin/bash
# Sync local changes to the remote server and restart the application if needed.

SERVER="ubuntu@server.jedbillyb.com"
REMOTE_PROJECT_DIR="nz-vehicle-finder" # The directory where the project code lives
REMOTE_WEB_ROOT="/var/www/html/nz-vehicle-finder" # The directory where the built site is served from
KEY="~/downloads/Other/ssh-key-2026-03-14.key"

echo "🚀 Syncing with server..."
# Sync project files (excluding build artifacts and node_modules)
# Use sudo for creating the remote directory if it doesn't exist
ssh -i $KEY $SERVER "sudo mkdir -p $REMOTE_PROJECT_DIR && sudo chown ubuntu:ubuntu $REMOTE_PROJECT_DIR"
rsync -avz -e "ssh -i $KEY" --exclude 'node_modules' --exclude 'dist' --exclude '.git' ./ $SERVER:$REMOTE_PROJECT_DIR/

# Sync static assets from public/ to the web root
ssh -i $KEY $SERVER "sudo mkdir -p $REMOTE_WEB_ROOT && sudo chown ubuntu:ubuntu $REMOTE_WEB_ROOT"
rsync -avz -e "ssh -i $KEY" ./public/ $SERVER:$REMOTE_WEB_ROOT/

echo "🛠️ Restarting app on server..."
# Example: If running via PM2 or a custom start script, adjust this command
# First, ensure dependencies are installed and build is run on the server
ssh -i $KEY $SERVER "cd $REMOTE_PROJECT_DIR && npm install && npm run build"
echo "Deployment complete!"
