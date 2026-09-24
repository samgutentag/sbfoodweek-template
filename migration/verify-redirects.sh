#!/usr/bin/env bash
# Check the around805.com redirects against what each migration phase expects.
#
#   migration/verify-redirects.sh phase1
#   migration/verify-redirects.sh phase2 burger coffee   # only events already cut over
#
# Each check asserts the first-hop status code and the final URL after
# following redirects (which must answer 200). A redirect loop fails loudly.

set -u

fail=0

check() {
  local url=$1 want_code=$2 want_final=$3
  local code final rc
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url")
  final=$(curl -sL -o /dev/null -m 20 --max-redirs 6 -w '%{url_effective} %{http_code}' "$url")
  rc=$?
  if [ "$rc" -eq 47 ]; then
    printf 'FAIL  %s  redirect loop (more than 6 hops)\n' "$url"
    fail=1
    return
  fi
  if [[ $code =~ ^($want_code)$ ]] && [ "$final" = "$want_final 200" ]; then
    printf 'ok    %s  %s -> %s\n' "$url" "$code" "$want_final"
  else
    printf 'FAIL  %s\n      want %s -> %s 200\n      got  %s -> %s\n' \
      "$url" "$want_code" "$want_final" "$code" "$final"
    fail=1
  fi
}

legacy_domain() {
  case $1 in
    burger) echo sbburgerweekmap.com ;;
    coffee) echo sbcoffeeweekmap.com ;;
    sandwich) echo sbsandwichweekmap.com ;;
    *) echo "unknown event: $1 (burger|coffee|sandwich)" >&2; exit 2 ;;
  esac
}

phase=${1:-}
[ $# -gt 0 ] && shift

case $phase in
  phase1)
    for ev in burger coffee sandwich; do
      d=$(legacy_domain "$ev")
      check "https://around805.com/${ev}week2026"            302 "https://$d/"
      check "https://around805.com/${ev}week2026/stats/"     302 "https://$d/stats/"
      check "https://around805.com/${ev}week2026/?utm=test"  302 "https://$d/?utm=test"
      check "https://around805.com/${ev}week"                302 "https://$d/"
      check "https://$d/"                                    200 "https://$d/"
    done
    # Burrito has no legacy domain: served in place by the interim Worker.
    check "https://around805.com/burritoweek2026/"         200 "https://around805.com/burritoweek2026/"
    check "https://around805.com/burritoweek"              302 "https://around805.com/burritoweek2026/"
    check "https://around805.com/" 302 "https://gutentag.world/"
    ;;
  phase2)
    [ $# -eq 0 ] && { echo "phase2 needs event names: burger coffee sandwich" >&2; exit 2; }
    for ev in "$@"; do
      d=$(legacy_domain "$ev")
      check "https://$d/"                                    "301|302" "https://around805.com/${ev}week2026/"
      check "https://www.$d/stats/"                          "301|302" "https://around805.com/${ev}week2026/stats/"
      check "https://$d/embed/map/?x=1"                      "301|302" "https://around805.com/${ev}week2026/embed/map/?x=1"
      check "https://around805.com/${ev}week2026/"           200 "https://around805.com/${ev}week2026/"
      check "https://around805.com/${ev}week"                302 "https://around805.com/${ev}week2026/"
    done
    ;;
  *)
    echo "usage: $0 phase1 | phase2 <burger|coffee|sandwich>..." >&2
    exit 2
    ;;
esac

exit $fail
