#!/bin/bash
# Ship the current working tree to the Lightsail instance and (re)start the stack.
# Usage: deploy/deploy.sh [ip]        # ip defaults to the sage-prod-ip static IP
#
# Requires: deploy/provision.sh has been run once, and a local .env exists
# (copy .env.example -> .env and fill in secrets before first deploy).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${AWS_REGION:=$(aws configure get region)}"
: "${INSTANCE_NAME:=sage}"
KEY_PATH="$HOME/.ssh/${INSTANCE_NAME}-lightsail.pem"
REMOTE_DIR="/opt/sage"

IP="${1:-$(aws lightsail get-static-ip --static-ip-name "${INSTANCE_NAME}-ip" --region "$AWS_REGION" --query 'staticIp.ipAddress' --output text)}"

if [ ! -f .env ]; then
  echo "No .env found locally. Copy .env.example -> .env and fill in secrets first." >&2
  exit 1
fi

SSH="ssh -i $KEY_PATH -o StrictHostKeyChecking=accept-new ubuntu@$IP"

echo "Packing tracked working tree (git archive, so untracked/ignored files stay off the wire)..."
TARBALL=$(mktemp -t sage-deploy-XXXX.tar.gz)
trap 'rm -f "$TARBALL"' EXIT
git archive --format=tar.gz -o "$TARBALL" HEAD

echo "Uploading to $IP:$REMOTE_DIR..."
$SSH "mkdir -p $REMOTE_DIR"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=accept-new "$TARBALL" "ubuntu@$IP:/tmp/sage-deploy.tar.gz"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=accept-new .env "ubuntu@$IP:/tmp/sage.env"

echo "Extracting and starting stack on remote..."
$SSH bash -s <<REMOTE
set -euo pipefail
rm -rf $REMOTE_DIR/*
tar -xzf /tmp/sage-deploy.tar.gz -C $REMOTE_DIR
mv /tmp/sage.env $REMOTE_DIR/.env
rm -f /tmp/sage-deploy.tar.gz
cd $REMOTE_DIR
sudo docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build db retail-mcp openclaw web
sudo docker image prune -f
REMOTE

echo "Done. App reachable at http://$IP"
