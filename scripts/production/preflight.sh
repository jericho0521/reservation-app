#!/bin/sh

set -eu

MIN_MEMORY_KIB=2097152
MIN_DISK_KIB=10485760

fail() {
  printf '%s\n' "preflight: $1" >&2
  exit 64
}

require_integer() {
  case $1 in
    ''|*[!0-9]*) fail "invalid probe value" ;;
  esac
}

check_architecture() {
  architecture=$1
  [ "$architecture" = "x86_64" ] || fail "unsupported architecture: $architecture (supported: x86_64)"
}

check_operating_system() {
  operating_system_id=$1
  operating_system_version=$2
  if [ "$operating_system_id" = "ubuntu" ]; then
    case $operating_system_version in
      22.04|24.04) return 0 ;;
    esac
  fi
  fail "supported operating system is Ubuntu 22.04 or 24.04 (detected: $operating_system_id $operating_system_version)"
}

check_memory() {
  memory_kib=$1
  require_integer "$memory_kib"
  [ "$memory_kib" -ge "$MIN_MEMORY_KIB" ] || fail "at least 2 GiB memory is required (detected: $memory_kib KiB)"
}

check_cpu() {
  cpu_count=$1
  require_integer "$cpu_count"
  [ "$cpu_count" -ge 2 ] || fail "at least 2 CPU cores are required (detected: $cpu_count)"
}

check_disk() {
  disk_kib=$1
  require_integer "$disk_kib"
  [ "$disk_kib" -ge "$MIN_DISK_KIB" ] || fail "at least 10 GiB free disk is required (detected: $disk_kib KiB)"
}

check_compose_version() {
  compose_version=$1
  case $compose_version in
    2.*|v2.*) return 0 ;;
    *) fail "Docker Compose v2 is required" ;;
  esac
}

check_ports() {
  occupied=$1
  case ",$occupied," in
    *,80,*) fail "TCP port 80 is already in use" ;;
    *,443,*) fail "TCP port 443 is already in use" ;;
    *,443/udp,*) fail "UDP port 443 is already in use" ;;
    *,none,*) return 0 ;;
    *) fail "invalid port probe value" ;;
  esac
}

check_domain() {
  domain=$1
  [ "${#domain}" -le 253 ] || fail "domain must be a normalized ASCII DNS name"
  case $domain in
    *.*) ;;
    *) fail "domain must be a normalized ASCII DNS name" ;;
  esac
  case $domain in
    *[!a-z0-9.-]*|.*|*.|*..*) fail "domain must be a normalized ASCII DNS name" ;;
  esac

  remaining=$domain
  while :; do
    label=${remaining%%.*}
    [ -n "$label" ] && [ "${#label}" -le 63 ] || fail "domain must be a normalized ASCII DNS name"
    case $label in
      -*|*-|*[!a-z0-9-]*) fail "domain must be a normalized ASCII DNS name" ;;
    esac
    [ "$remaining" != "$label" ] || break
    remaining=${remaining#*.}
  done
  case ${domain##*.} in
    *[!0-9]*) return 0 ;;
    *) fail "domain must be a normalized ASCII DNS name" ;;
  esac
}

check_public_ipv4() {
  address=$1
  case $address in
    ''|*[!0-9.]*) fail "host IP must be a public IPv4 address" ;;
  esac
  previous_ifs=$IFS
  IFS=.
  # shellcheck disable=SC2086
  set -- $address
  IFS=$previous_ifs
  [ "$#" -eq 4 ] || fail "host IP must be a public IPv4 address"
  for octet in "$@"; do
    require_integer "$octet"
    [ "$octet" -le 255 ] || fail "host IP must be a public IPv4 address"
  done
  case $address in
    0.*|10.*|127.*|169.254.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|192.168.*|224.*|225.*|226.*|227.*|228.*|229.*|23[0-9].*|24[0-9].*|25[0-5].*)
      fail "host IP must be a public IPv4 address"
      ;;
  esac
}

check_dns() {
  dns_domain=$1
  host_ip=$2
  resolved_csv=$3
  check_domain "$dns_domain"
  check_public_ipv4 "$host_ip"
  case ",$resolved_csv," in
    *,"$host_ip",*) return 0 ;;
    *) fail "DNS for $dns_domain does not resolve to host IP $host_ip" ;;
  esac
}

if [ "${1:-}" = "--probe-architecture" ] && [ "$#" -eq 2 ]; then
  check_architecture "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-os" ] && [ "$#" -eq 3 ]; then
  check_operating_system "$2" "$3"
  exit 0
fi
if [ "${1:-}" = "--probe-memory-kib" ] && [ "$#" -eq 2 ]; then
  check_memory "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-cpu-count" ] && [ "$#" -eq 2 ]; then
  check_cpu "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-disk-kib" ] && [ "$#" -eq 2 ]; then
  check_disk "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-compose-version" ] && [ "$#" -eq 2 ]; then
  check_compose_version "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-ports" ] && [ "$#" -eq 2 ]; then
  check_ports "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-domain" ] && [ "$#" -eq 2 ]; then
  check_domain "$2"
  exit 0
fi
if [ "${1:-}" = "--probe-dns" ] && [ "$#" -eq 4 ]; then
  check_dns "$2" "$3" "$4"
  exit 0
fi

domain=
host_ip=
while [ "$#" -gt 0 ]; do
  case $1 in
    --domain)
      [ "$#" -ge 2 ] || fail "--domain requires a value"
      domain=$2
      shift 2
      ;;
    --host-ip)
      [ "$#" -ge 2 ] || fail "--host-ip requires a value"
      host_ip=$2
      shift 2
      ;;
    *) fail "usage: preflight.sh --domain <dns-name> [--host-ip <public-ip>]" ;;
  esac
done

[ -n "$domain" ] || fail "usage: preflight.sh --domain <dns-name> [--host-ip <public-ip>]"

[ -r /etc/os-release ] || fail "supported Ubuntu release metadata is unavailable"
# shellcheck disable=SC1091
. /etc/os-release
check_operating_system "${ID:-unknown}" "${VERSION_ID:-unknown}"

check_architecture "$(uname -m)"

cpu_count=$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '0')
check_cpu "$cpu_count"

memory_kib=$(awk '/^MemTotal:/ { print $2; exit }' /proc/meminfo 2>/dev/null || true)
check_memory "$memory_kib"

disk_target=/
if [ -d /opt ]; then disk_target=/opt; fi
disk_kib=$(df -Pk "$disk_target" | awk 'NR == 2 { print $4 }')
check_disk "$disk_kib"

command -v docker >/dev/null 2>&1 || fail "Docker Engine is required"
docker info >/dev/null 2>&1 || fail "Docker Engine is not running or is not accessible"
compose_version=$(docker compose version --short 2>/dev/null || printf 'missing')
check_compose_version "$compose_version"

command -v ss >/dev/null 2>&1 || fail "the ss command is required to verify ports"
occupied=none
if ss -H -ltn '( sport = :80 )' 2>/dev/null | grep -q .; then occupied=80; fi
if ss -H -ltn '( sport = :443 )' 2>/dev/null | grep -q .; then
  if [ "$occupied" = "none" ]; then occupied=443; else occupied="$occupied,443"; fi
fi
if ss -H -lun '( sport = :443 )' 2>/dev/null | grep -q .; then
  if [ "$occupied" = "none" ]; then occupied=443/udp; else occupied="$occupied,443/udp"; fi
fi
check_ports "$occupied"

check_domain "$domain"
command -v getent >/dev/null 2>&1 || fail "getent is required to verify DNS"
resolved_csv=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{ print $1 }' | sort -u | paste -sd, -)
[ -n "$resolved_csv" ] || fail "DNS for $domain does not resolve"
if [ -z "$host_ip" ]; then
  host_ip=$(hostname -I 2>/dev/null | awk '{ print $1 }')
fi
[ -n "$host_ip" ] || fail "host IP could not be detected; pass --host-ip"
check_dns "$domain" "$host_ip" "$resolved_csv"

printf '%s\n' "Preflight passed for $domain."
