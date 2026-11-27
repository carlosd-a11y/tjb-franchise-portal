#!/bin/sh
# Is the company website still fine?
#
# Run before and after the DNS change. It checks the things this project must
# never affect: the site, www, and company email. It only reads.
set -u
fail=0

check() {
  label="$1"; got="$2"; want="$3"
  if [ "$got" = "$want" ]; then
    printf '  ok    %-28s %s\n' "$label" "$got"
  else
    printf '  WRONG %-28s got "%s", expected "%s"\n' "$label" "$got" "$want"
    fail=1
  fi
}

echo "Company website"
check "tropicaljuicebar.com" "$(dig +short tropicaljuicebar.com A | tr '\n' ' ' | sed 's/ $//')" "82.25.87.9"
check "www" "$(dig +short www.tropicaljuicebar.com A | tail -1)" "82.25.87.9"
check "site responds" "$(curl -sS -m 20 -o /dev/null -w '%{http_code}' https://tropicaljuicebar.com/ 2>/dev/null)" "200"
check "email (MX count)" "$(dig +short tropicaljuicebar.com MX | wc -l | tr -d ' ')" "5"

echo "Other service"
check "platia" "$(dig +short platia.tropicaljuicebar.com A | tail -1)" "2.24.76.133"

echo "The portal (expected to change)"
printf '  note  %-28s %s\n' "franchise" "$(dig +short franchise.tropicaljuicebar.com A | tr '\n' ' ')"

if [ "$fail" -eq 0 ]; then
  echo "Nothing that matters has moved."
else
  echo "SOMETHING MOVED. Put it back before going further."
fi
exit "$fail"
