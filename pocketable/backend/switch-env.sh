#!/bin/bash

# Environment switcher for Pocketable backend
# Usage: ./switch-env.sh [selfhosted|cloudsdk]

if [ $# -eq 0 ]; then
    echo "Usage: ./switch-env.sh [selfhosted|cloudsdk]"
    echo ""
    echo "Current environment:"
    if [ -f .env ]; then
        if grep -q "DAYTONA_API_URL" .env; then
            echo "  ✓ Self-hosted Daytona"
        else
            echo "  ✓ Daytona Cloud SDK"
        fi
    else
        echo "  ✗ No .env file found"
    fi
    exit 1
fi

ENV=$1

case $ENV in
    selfhosted)
        if [ ! -f .env.selfhosted ]; then
            echo "Error: .env.selfhosted not found"
            exit 1
        fi
        cp .env.selfhosted .env
        echo "✓ Switched to self-hosted Daytona"
        echo "  Infrastructure: Your EC2 instance"
        echo "  Timeout: 600s (10 minutes)"
        echo "  Sandboxes: Unlimited"
        ;;
    cloudsdk)
        if [ ! -f .env.cloudsdk ]; then
            echo "Error: .env.cloudsdk not found"
            exit 1
        fi
        cp .env.cloudsdk .env
        echo "✓ Switched to Daytona Cloud SDK"
        echo "  Infrastructure: Daytona Cloud"
        echo "  Timeout: 180s (3 minutes)"
        echo "  Sandboxes: 10 (Free) or 50-100 (Pro)"
        ;;
    *)
        echo "Error: Unknown environment '$ENV'"
        echo "Use: selfhosted or cloudsdk"
        exit 1
        ;;
esac

echo ""
echo "Restart the backend to apply changes:"
echo "  npm run dev"
