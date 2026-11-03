#!/usr/bin/env bash
# Missing initial cache is allowed; network failures must not revert a newer registry.
set -euo pipefail
set +e
git ls-remote --exit-code --heads origin product-data-cache >/tmp/product-cache-ref
result=$?
set -e
if [ "$result" = 2 ]; then
  echo 'Initial product cache not created yet; using the committed registry.'
elif [ "$result" = 0 ]; then
  git fetch origin product-data-cache --depth=1
  git show FETCH_HEAD:registry.json > /tmp/product-registry.json
  node --input-type=module -e "import fs from 'node:fs';const x=JSON.parse(fs.readFileSync('/tmp/product-registry.json'));if(!Array.isArray(x.products)||!Array.isArray(x.sources))throw Error('Invalid product cache');"
  if git cat-file -e FETCH_HEAD:substance-products.json 2>/dev/null; then
    git show FETCH_HEAD:substance-products.json > /tmp/substance-products.json
    node --input-type=module -e "import fs from 'node:fs';const x=JSON.parse(fs.readFileSync('/tmp/substance-products.json')),r=JSON.parse(fs.readFileSync('/tmp/product-registry.json'));if(x.schema!==1||!Array.isArray(x.records)||x.registryBuilt!==r.built)throw Error('Inconsistent substance cache generation');"
    cp /tmp/substance-products.json companies/substance-products.json
  else
    rm -f companies/substance-products.json
  fi
  cp /tmp/product-registry.json companies/registry.json
else
  echo 'Product cache unavailable; publication stopped to preserve the last complete snapshot.'
  exit 1
fi
