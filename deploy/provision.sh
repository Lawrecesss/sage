#!/bin/bash
# Prepare the existing Lightsail VM ("sage") to run the sage docker-compose stack:
# installs Docker if missing, opens port 80, attaches a static IP.
# Usage: deploy/provision.sh
#
# Safe to re-run. Does NOT touch app code or .env — see deploy/deploy.sh for that.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${AWS_REGION:=$(aws configure get region)}"
: "${INSTANCE_NAME:=sage}"
STATIC_IP_NAME="${INSTANCE_NAME}-ip"

if ! aws lightsail get-instance --instance-name "$INSTANCE_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "No instance named '$INSTANCE_NAME' in $AWS_REGION. Set INSTANCE_NAME or create it first." >&2
  exit 1
fi

echo "Opening port 80 (web)..."
aws lightsail open-instance-public-ports --region "$AWS_REGION" --instance-name "$INSTANCE_NAME" \
  --port-info fromPort=80,toPort=80,protocol=TCP

if aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Static IP $STATIC_IP_NAME already exists."
else
  echo "Allocating static IP..."
  aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" --region "$AWS_REGION"
fi

echo "Attaching static IP to $INSTANCE_NAME..."
aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$INSTANCE_NAME" --region "$AWS_REGION" >/dev/null

IP=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --region "$AWS_REGION" --query 'staticIp.ipAddress' --output text)

KEY_PATH="$HOME/.ssh/${INSTANCE_NAME}-lightsail.pem"
if [ ! -f "$KEY_PATH" ]; then
  echo "Downloading default key pair to $KEY_PATH..."
  aws lightsail download-default-key-pair --region "$AWS_REGION" --query 'privateKeyBase64' --output text > "$KEY_PATH"
  chmod 600 "$KEY_PATH"
fi

echo "Installing Docker on the instance (skips cleanly if already installed)..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=accept-new "ubuntu@$IP" 'sudo bash -s' < deploy/cloud-init.sh

cat <<EOF

Instance ready.
  IP:        $IP
  SSH key:   $KEY_PATH
  SSH:       ssh -i "$KEY_PATH" ubuntu@$IP

Next: deploy/deploy.sh
EOF
