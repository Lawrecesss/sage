#!/usr/bin/env bash
# Lightsail provisioning helper. Requires the `aws` CLI with Lightsail permissions
# and an SSH key already registered in Lightsail.
#
#   bash infra/provision.sh create     # make the instance + static IP + firewall
#   bash infra/provision.sh setup      # ssh in, install docker, clone, first build
#   bash infra/provision.sh restart    # git pull + compose up -d --build
#   bash infra/provision.sh logs       # tail compose logs
set -euo pipefail

INSTANCE="${SAGE_INSTANCE:-sage}"
REGION="${AWS_REGION:-ap-southeast-1}"
BLUEPRINT="${SAGE_BLUEPRINT:-ubuntu_24_04}"
BUNDLE="${SAGE_BUNDLE:-medium_3_0}"          # 4 GB / 2 vCPU / 80 GB SSD, ~$24/mo
SSH_USER="ubuntu"
COMPOSE="docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml"

ip() { aws lightsail get-static-ip --static-ip-name "${INSTANCE}-ip" --region "$REGION" \
        --query 'staticIp.ipAddress' --output text; }

case "${1:-}" in
  create)
    aws lightsail create-instances --region "$REGION" \
      --instance-names "$INSTANCE" \
      --availability-zone "${REGION}a" \
      --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" \
      --user-data "$(cat infra/cloud-init.yaml)"
    aws lightsail allocate-static-ip --region "$REGION" --static-ip-name "${INSTANCE}-ip"
    echo "waiting for instance to run..."
    aws lightsail wait instance-running --region "$REGION" --instance-name "$INSTANCE" || true
    aws lightsail attach-static-ip --region "$REGION" --static-ip-name "${INSTANCE}-ip" --instance-name "$INSTANCE"
    aws lightsail put-instance-public-ports --region "$REGION" --instance-name "$INSTANCE" \
      --port-infos fromPort=22,toPort=22,protocol=TCP \
                   fromPort=80,toPort=80,protocol=TCP \
                   fromPort=443,toPort=443,protocol=TCP
    echo "static IP: $(ip)  — point your DNS A record here, then: bash infra/provision.sh setup"
    ;;
  setup|restart)
    HOST="$(ip)"
    ssh "${SSH_USER}@${HOST}" bash -s <<EOF
set -euo pipefail
sudo test -d /opt/sage || sudo git clone https://github.com/Lawrecesss/sage /opt/sage
cd /opt/sage && sudo git pull --ff-only
sudo test -f .env || sudo cp .env.example .env
echo ">>> edit /opt/sage/.env with real secrets if you have not"
sudo $COMPOSE up -d --build
sudo $COMPOSE ps
EOF
    ;;
  logs)
    ssh "${SSH_USER}@$(ip)" "cd /opt/sage && sudo $COMPOSE logs -f --tail=100"
    ;;
  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -12
    exit 1
    ;;
esac
