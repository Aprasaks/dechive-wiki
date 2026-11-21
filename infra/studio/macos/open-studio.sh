#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
studio_dir="$HOME/.dechive-wiki-studio"
mkdir -p "$studio_dir"
chmod 700 "$studio_dir"
for f in localhost.crt localhost.key https-proxy.py; do
  [[ -f "$studio_dir/$f" ]] || { echo "필수 파일이 없습니다: $studio_dir/$f" >&2; exit 1; }
done
for c in aws session-manager-plugin python3 curl lsof; do
  command -v "$c" >/dev/null || { echo "필요한 프로그램이 없습니다: $c" >&2; exit 1; }
done
check_studio() { [[ "$(curl -ksS --max-time 3 -o /dev/null -w '%{http_code}' https://localhost:43122/studio/login 2>/dev/null || true)" == 200 ]]; }
if ! check_studio; then
  if ! lsof -nP -iTCP:43123 -sTCP:LISTEN >/dev/null 2>&1; then
    nohup aws ssm start-session --profile dechive-cleanup --region ap-northeast-2 --target i-092c854b4839b24dd --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host":["172.18.0.4"],"portNumber":["3121"],"localPortNumber":["43123"]}' >"$studio_dir/tunnel.log" 2>&1 </dev/null &
    for i in {1..20}; do lsof -nP -iTCP:43123 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 1; done
    lsof -nP -iTCP:43123 -sTCP:LISTEN >/dev/null 2>&1 || { echo "편집실 연결에 실패했습니다. AWS 로그인과 $studio_dir/tunnel.log를 확인해 주세요." >&2; exit 1; }
  fi
  if ! lsof -nP -iTCP:43122 -sTCP:LISTEN >/dev/null 2>&1; then
    nohup python3 "$studio_dir/https-proxy.py" >"$studio_dir/proxy.log" 2>&1 </dev/null &
  fi
  for i in {1..15}; do check_studio && break; sleep 1; done
fi
check_studio || { echo "편집실이 응답하지 않습니다. 이미 사용 중인 포트나 연결 상태를 확인해 주세요." >&2; exit 1; }
echo "편집실 연결 완료: https://localhost:43122/studio"
if [[ "${1:-}" != --no-open ]]; then open 'https://localhost:43122/studio'; fi
