#!/bin/bash
# Sync local changes to the remote server and restart the application if needed.

SERVER="ubuntu@server.jedbillyb.com"
REMOTE_PROJECT_DIR="nz-vehicle-finder" # The directory where the project code lives
REMOTE_WEB_ROOT="/var/www/html/nz-vehicle-finder" # The directory where the built site is served from
KEY="~/downloads/Other/ssh-key-2026-03-14.key"

echo "Syncing with server..."
# Sync project files (excluding build artifacts and node_modules)
# Use sudo for creating the remote directory if it doesn't exist
ssh -i $KEY $SERVER "sudo mkdir -p $REMOTE_PROJECT_DIR && sudo chown ubuntu:ubuntu $REMOTE_PROJECT_DIR"
rsync -avz -e "ssh -i $KEY" --exclude 'node_modules' --exclude 'dist' --exclude '.git' --exclude 'database/*.db*' ./ $SERVER:$REMOTE_PROJECT_DIR/

echo "Building on server..."
ssh -i $KEY $SERVER "cd $REMOTE_PROJECT_DIR && npm install && npm run build"

# Sync the built files from dist/ to the web root
echo "Updating live site files..."
ssh -i $KEY $SERVER "sudo mkdir -p $REMOTE_WEB_ROOT && sudo chown ubuntu:ubuntu $REMOTE_WEB_ROOT"
ssh -i $KEY $SERVER "sudo cp -rv $REMOTE_PROJECT_DIR/dist/* $REMOTE_WEB_ROOT/"

echo "Deployment complete!"
