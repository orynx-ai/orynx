#!/usr/bin/env bash
# Installs Orynx on this computer as a service that starts when you log in, and opens it to your wifi at
# https://orynx.local, behind an access code. Run it again to update or to renew the certificate.
# What it changes and how to undo it: README.md › Install.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
home="${DEVHUB_HOME:-$HOME/.devhub}"
tls="$home/tls"
os="$(uname -s)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf '\nOrynx install: %s\n' "$*" >&2
  exit 1
}

[ "$os" = Darwin ] || [ "$os" = Linux ] || fail "Orynx installs on macOS or Linux."
[ "$(id -u)" -ne 0 ] || fail "run ./install.sh as yourself, not root. It asks for sudo when it needs it."
for tool in git openssl curl; do
  command -v "$tool" >/dev/null || fail "$tool is missing. Install it, then run ./install.sh again."
done

say "1/5 Node 24 and pnpm"
cd "$repo"
nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$nvm_sh" ]; then
  set +u # nvm reads unset variables
  # shellcheck disable=SC1090
  . "$nvm_sh"
  nvm install >/dev/null # the version in .nvmrc
  set -u
fi
command -v node >/dev/null || fail "Node is missing. Install Node 24 (https://nodejs.org or nvm), then run ./install.sh again."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ] ||
  fail "Orynx needs Node 24; this is $(node -v). Run: nvm install 24"
# A proxy that re-signs TLS breaks Node downloads unless Node trusts the OS's certificates too.
export NODE_OPTIONS="${NODE_OPTIONS:-} --use-system-ca"
command -v pnpm >/dev/null || corepack enable pnpm || fail "couldn't turn on pnpm. Run: corepack enable pnpm"
node_bin="$(command -v node)"

say "2/5 Building Orynx"
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@devhub/server... --filter=@devhub/web

say "3/5 A certificate for https://orynx.local"
mkdir -p "$tls"
chmod 700 "$home" "$tls"
if [ ! -f "$tls/ca.key" ]; then
  # Your own certificate authority, made on this computer; its key never leaves it. The name constraint
  # means that even a stolen key can sign for orynx.local and localhost only, never a real site.
  openssl req -x509 -new -nodes -newkey rsa:2048 -sha256 -days 3650 -subj "/CN=Orynx local CA ($(hostname -s))" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;DNS:orynx.local,permitted;DNS:localhost,permitted;IP:127.0.0.1/255.255.255.255" \
    -keyout "$tls/ca.key" -out "$tls/ca.crt" 2>/dev/null
  rm -f "$tls/orynx.crt"
fi
# 825 days is the longest Apple devices accept; a run within 30 days of the end makes a new one.
if [ ! -f "$tls/orynx.crt" ] || ! openssl x509 -checkend 2592000 -noout -in "$tls/orynx.crt" >/dev/null; then
  openssl req -new -nodes -newkey rsa:2048 -subj "/CN=orynx.local" \
    -keyout "$tls/orynx.key" -out "$tls/orynx.csr" 2>/dev/null
  printf '%s\n' "subjectAltName=DNS:orynx.local,DNS:localhost,IP:127.0.0.1" "basicConstraints=CA:FALSE" \
    "keyUsage=critical,digitalSignature,keyEncipherment" "extendedKeyUsage=serverAuth" >"$tls/orynx.ext"
  openssl x509 -req -in "$tls/orynx.csr" -CA "$tls/ca.crt" -CAkey "$tls/ca.key" \
    -set_serial "0x$(openssl rand -hex 16)" -days 825 -sha256 -extfile "$tls/orynx.ext" -out "$tls/orynx.crt" 2>/dev/null
  rm -f "$tls/orynx.csr" "$tls/orynx.ext"
fi
chmod 600 "$tls"/*.key

trust_note=""
if [ "$os" = Darwin ]; then
  if ! security verify-cert -c "$tls/orynx.crt" -p ssl -s orynx.local >/dev/null 2>&1; then
    echo "So this Mac's browsers trust https://orynx.local, macOS asks for your password once."
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$tls/ca.crt" ||
      trust_note="This Mac doesn't trust the certificate yet; run ./install.sh again to add it."
  fi
else
  echo "So this computer trusts https://orynx.local and can use ports 80 and 443, Linux asks for sudo."
  if command -v update-ca-certificates >/dev/null; then
    sudo cp "$tls/ca.crt" /usr/local/share/ca-certificates/orynx-local-ca.crt && sudo update-ca-certificates >/dev/null
  elif command -v update-ca-trust >/dev/null; then
    sudo cp "$tls/ca.crt" /etc/pki/ca-trust/source/anchors/orynx-local-ca.crt && sudo update-ca-trust
  else
    trust_note="Add $tls/ca.crt to this computer's trusted certificates by hand."
  fi
  # Linux keeps ports below 1024 for root; let any user listen from 80 up, now and after a restart.
  if [ "$(sysctl -n net.ipv4.ip_unprivileged_port_start)" -gt 80 ]; then
    echo "net.ipv4.ip_unprivileged_port_start=80" | sudo tee /etc/sysctl.d/60-orynx.conf >/dev/null
    sudo sysctl -q -w net.ipv4.ip_unprivileged_port_start=80
  fi
  command -v avahi-publish >/dev/null ||
    trust_note="$trust_note Install avahi-utils so other devices find orynx.local."
fi

say "4/5 Starting Orynx when you log in"
mkdir -p "$home"
if [ "$os" = Darwin ]; then
  plist="$HOME/Library/LaunchAgents/dev.orynx.server.plist"
  mkdir -p "$(dirname "$plist")"
  cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.orynx.server</string>
  <key>ProgramArguments</key>
  <array><string>$node_bin</string><string>$repo/apps/server/dist/main.mjs</string><string>--serve-web</string></array>
  <key>WorkingDirectory</key><string>$repo</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DEVHUB_LAN</key><string>true</string>
    <key>DEVHUB_HOME</key><string>$home</string>
    <key>NODE_ENV</key><string>production</string>
    <key>PATH</key><string>$PATH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$home/orynx.log</string>
  <key>StandardErrorPath</key><string>$home/orynx.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/dev.orynx.server" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  logs="$home/orynx.log"
else
  unit="$HOME/.config/systemd/user/orynx.service"
  mkdir -p "$(dirname "$unit")"
  cat >"$unit" <<EOF
[Unit]
Description=Orynx
After=network-online.target

[Service]
WorkingDirectory=$repo
ExecStart=$node_bin $repo/apps/server/dist/main.mjs --serve-web
Environment="DEVHUB_LAN=true" "DEVHUB_HOME=$home" "NODE_ENV=production" "PATH=$PATH"
Restart=on-failure

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable orynx >/dev/null
  systemctl --user restart orynx
  logs="journalctl --user -u orynx"
fi

say "5/5 Checking https://orynx.local"
ready=""
for _ in $(seq 1 60); do
  # Straight to this computer, so the check doesn't wait on the wifi's name lookup.
  if curl -sf -o /dev/null --cacert "$tls/ca.crt" --resolve orynx.local:443:127.0.0.1 https://orynx.local/manifest.webmanifest; then
    ready=yes
    break
  fi
  sleep 1
done
[ -n "$ready" ] || fail "Orynx didn't answer within a minute. See what it said: $logs"
code="$(cat "$home/lan-access-code")"

cat <<EOF

Orynx is installed, and starts whenever you log in.

  On this computer   http://127.0.0.1:4317  or  https://orynx.local
  On your wifi       https://orynx.local   access code: $code

On a phone or another computer, trust Orynx's certificate once: open http://orynx.local/orynx-ca.crt,
then follow README.md › Other devices. To keep Orynx as an app, choose Install in Chrome or Edge, or
Share › Add to Home Screen (Add to Dock on a Mac) in Safari.

Logs: $logs
EOF
[ -z "$trust_note" ] || printf '\n%s\n' "$trust_note"
