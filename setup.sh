#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install
cp node_modules/three/build/three.min.js www/three.min.js
npx cap add ios || true
npx cap sync ios
echo "OK. Next: npx cap open ios"
