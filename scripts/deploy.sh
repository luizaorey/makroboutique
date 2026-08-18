#!/bin/bash
# Publica as mudanças pendentes no repo makroboutique (GitHub Pages).
# Lê o GITHUB_TOKEN de .env (nunca commitado) e autentica via header, sem
# guardar o token na URL do remote.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Arquivo .env não encontrado. Crie um com GITHUB_TOKEN=..." >&2
  exit 1
fi
source .env

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN vazio em .env. Cole o token lá antes de rodar este script." >&2
  exit 1
fi

node --check painel/painel.js
node --check painel/config.js

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "Deploy: atualiza painel"
fi

AUTH=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64)
git -c http.extraHeader="Authorization: Basic ${AUTH}" push origin main

echo "Publicado. GitHub Pages deve atualizar em alguns segundos:"
echo "https://www.makroboutique.com.br/painel/"
