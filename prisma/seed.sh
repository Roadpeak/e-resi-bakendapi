#!/usr/bin/env bash
# =============================================================================
# HomVR — Full Test Data Seed Script
# Covers: auth, properties, units, inquiries, bookings, reservations,
#         saved-properties, rent-listings, documents, analytics, tours,
#         construction-updates, amenities, notifications, media
# =============================================================================
set -uo pipefail

API="http://localhost:4000/api"
PASS=0; FAIL=0
declare -a ERRORS=()

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()      { echo -e "  ${GREEN}✓${RESET} $1"; PASS=$((PASS+1)); }
fail()    { echo -e "  ${RED}✗${RESET} $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }
header()  { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
info()    { echo -e "    ${YELLOW}→${RESET} $1"; }

# Global: set by get_id, read immediately after
LAST_ID=""

# ── JSON helpers ─────────────────────────────────────────────────────────────
extract() {
  local json="$1" field="$2"
  printf '%s' "$json" | python3 -c "
import sys,json
try:
    d=json.loads(sys.stdin.read())
    v=d
    for k in '${field}'.split('.'):
        v=v[k]
    print('' if v is None else v)
except: print('')
" 2>/dev/null
}

check_ok() {
  local label="$1" json="$2"
  if [[ "$(extract "$json" "success")" == "True" ]]; then
    ok "$label"
  else
    fail "$label | $(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?'))" 2>/dev/null | head -c 120)"
  fi
}

# Like check_ok but treats "already in use" / "already exists" as a skip (idempotent re-runs)
check_register() {
  local label="$1" json="$2"
  local s err
  s=$(extract "$json" "success")
  err=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('error',''); print(e if isinstance(e,str) else str(e))" 2>/dev/null)
  if [[ "$s" == "True" ]]; then
    ok "$label"
  elif echo "$err" | grep -qi "already\|taken\|exist"; then
    ok "$label (already exists — skipped)"
  else
    fail "$label | ${err:0:120}"
  fi
}

get_id() {
  local label="$1" json="$2"
  LAST_ID=$(extract "$json" "data.id")
  if [[ -n "$LAST_ID" ]]; then
    ok "$label → id=$LAST_ID"
  else
    fail "$label | $(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?'))" 2>/dev/null | head -c 120)"
  fi
}

db() { docker exec homvr_postgres psql -U postgres -d homvr -c "$1" >/dev/null 2>&1; }

# =============================================================================
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         HomVR — Full Test Data Seed                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# =============================================================================
header "1. AUTH — Create Users"
# =============================================================================

# ── Admin (direct DB — no register endpoint) ─────────────────────────────────
ADMIN_EMAIL="admin@homvr.test"
ADMIN_PASS="Admin123!"
EXISTING=$(docker exec homvr_postgres psql -U postgres -d homvr -t -c \
  "SELECT id FROM \"User\" WHERE email='${ADMIN_EMAIL}';" 2>/dev/null | tr -d ' \n')
if [[ -z "$EXISTING" ]]; then
  # Register as DEVELOPER first (register endpoint doesn't allow ADMIN), then promote via DB
  R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\",\"firstName\":\"Platform\",\"lastName\":\"Admin\",\"role\":\"DEVELOPER\",\"companyName\":\"HomVR Platform\"}")
  check_register "POST /auth/register admin (as DEVELOPER first)" "$R"
  db "UPDATE \"User\" SET role='ADMIN', \"emailVerified\"=true WHERE email='${ADMIN_EMAIL}';"
  info "Promoted ${ADMIN_EMAIL} → ADMIN"
else
  db "UPDATE \"User\" SET \"emailVerified\"=true WHERE email='${ADMIN_EMAIL}';"
  info "Admin already exists: ${ADMIN_EMAIL}"
fi

R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\"}")
ADMIN_TOKEN=$(extract "$R" "data.accessToken")
if [[ -n "$ADMIN_TOKEN" ]]; then ok "Login admin → token obtained"; else fail "Login admin failed | $R"; fi

# ── Developer 1 — Westlands Dev Co ───────────────────────────────────────────
DEV1_EMAIL="dev1@homvr.test"
DEV1_PASS="DevPass1!"
R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEV1_EMAIL}\",\"password\":\"${DEV1_PASS}\",\"firstName\":\"James\",\"lastName\":\"Kariuki\",\"role\":\"DEVELOPER\",\"companyName\":\"Westlands Dev Co\"}")
check_register "POST /auth/register developer-1" "$R"
db "UPDATE \"User\" SET \"emailVerified\"=true WHERE email='${DEV1_EMAIL}';"
R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEV1_EMAIL}\",\"password\":\"${DEV1_PASS}\"}")
DEV1_TOKEN=$(extract "$R" "data.accessToken")
DEV1_ID=$(extract "$R" "data.user.id")
if [[ -n "$DEV1_TOKEN" ]]; then ok "Login developer-1 → token obtained"; else fail "Login developer-1 failed"; fi
info "dev1 id=$DEV1_ID"

# ── Developer 2 — Kileleshwa Homes ───────────────────────────────────────────
DEV2_EMAIL="dev2@homvr.test"
DEV2_PASS="DevPass2!"
R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEV2_EMAIL}\",\"password\":\"${DEV2_PASS}\",\"firstName\":\"Sarah\",\"lastName\":\"Njeri\",\"role\":\"DEVELOPER\",\"companyName\":\"Kileleshwa Homes\"}")
check_register "POST /auth/register developer-2" "$R"
db "UPDATE \"User\" SET \"emailVerified\"=true WHERE email='${DEV2_EMAIL}';"
R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEV2_EMAIL}\",\"password\":\"${DEV2_PASS}\"}")
DEV2_TOKEN=$(extract "$R" "data.accessToken")
DEV2_ID=$(extract "$R" "data.user.id")
if [[ -n "$DEV2_TOKEN" ]]; then ok "Login developer-2 → token obtained"; else fail "Login developer-2 failed"; fi

# ── Investor 1 ───────────────────────────────────────────────────────────────
INV1_EMAIL="investor1@homvr.test"
INV1_PASS="Invest123!"
R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${INV1_EMAIL}\",\"password\":\"${INV1_PASS}\",\"firstName\":\"Michael\",\"lastName\":\"Omondi\",\"role\":\"INVESTOR\"}")
check_register "POST /auth/register investor-1" "$R"
db "UPDATE \"User\" SET \"emailVerified\"=true WHERE email='${INV1_EMAIL}';"
R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${INV1_EMAIL}\",\"password\":\"${INV1_PASS}\"}")
INV1_TOKEN=$(extract "$R" "data.accessToken")
INV1_ID=$(extract "$R" "data.user.id")
if [[ -n "$INV1_TOKEN" ]]; then ok "Login investor-1 → token obtained"; else fail "Login investor-1 failed"; fi

# ── Tenant 1 ─────────────────────────────────────────────────────────────────
TEN1_EMAIL="tenant1@homvr.test"
TEN1_PASS="Tenant123!"
R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEN1_EMAIL}\",\"password\":\"${TEN1_PASS}\",\"firstName\":\"Amina\",\"lastName\":\"Hassan\",\"role\":\"TENANT\"}")
check_register "POST /auth/register tenant-1" "$R"
db "UPDATE \"User\" SET \"emailVerified\"=true WHERE email='${TEN1_EMAIL}';"
R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEN1_EMAIL}\",\"password\":\"${TEN1_PASS}\"}")
TEN1_TOKEN=$(extract "$R" "data.accessToken")
TEN1_ID=$(extract "$R" "data.user.id")
if [[ -n "$TEN1_TOKEN" ]]; then ok "Login tenant-1 → token obtained"; else fail "Login tenant-1 failed"; fi

# ── Tenant 2 ─────────────────────────────────────────────────────────────────
TEN2_EMAIL="tenant2@homvr.test"
TEN2_PASS="Tenant456!"
R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEN2_EMAIL}\",\"password\":\"${TEN2_PASS}\",\"firstName\":\"David\",\"lastName\":\"Mwangi\",\"role\":\"TENANT\"}")
check_register "POST /auth/register tenant-2" "$R"
db "UPDATE \"User\" SET \"emailVerified\"=true WHERE email='${TEN2_EMAIL}';"
R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEN2_EMAIL}\",\"password\":\"${TEN2_PASS}\"}")
TEN2_TOKEN=$(extract "$R" "data.accessToken")
TEN2_ID=$(extract "$R" "data.user.id")
if [[ -n "$TEN2_TOKEN" ]]; then ok "Login tenant-2 → token obtained"; else fail "Login tenant-2 failed"; fi

# =============================================================================
header "2. DEVELOPER PROFILES — Update KYB & Profile"
# =============================================================================

R=$(curl -s -X PATCH "$API/users/developers/me" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Award-winning real estate developer specialising in luxury Nairobi properties since 2010. Over 2,000 units delivered.","establishedYear":2010,"website":"https://westlandsdev.co.ke","logoUrl":"https://placehold.co/200x200"}')
check_ok "PATCH /users/developers/me (dev1)" "$R"

R=$(curl -s -X PATCH "$API/users/developers/me" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Boutique developer crafting premium family homes in Nairobi'\''s sought-after suburbs.","establishedYear":2015,"website":"https://kileleshwahomes.co.ke","logoUrl":"https://placehold.co/200x200"}')
check_ok "PATCH /users/developers/me (dev2)" "$R"

# Approve KYB via admin
DEV1_PROFILE_ID=$(curl -s -H "Authorization: Bearer $DEV1_TOKEN" "$API/users/developers/me" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
DEV2_PROFILE_ID=$(curl -s -H "Authorization: Bearer $DEV2_TOKEN" "$API/users/developers/me" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

if [[ -n "$DEV1_PROFILE_ID" ]]; then
  R=$(curl -s -X PATCH "$API/users/developers/${DEV1_PROFILE_ID}/kyb" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"APPROVED"}')
  check_ok "PATCH /users/developers/:id/kyb APPROVED (dev1)" "$R"
fi
if [[ -n "$DEV2_PROFILE_ID" ]]; then
  R=$(curl -s -X PATCH "$API/users/developers/${DEV2_PROFILE_ID}/kyb" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"APPROVED"}')
  check_ok "PATCH /users/developers/:id/kyb APPROVED (dev2)" "$R"
fi

# =============================================================================
header "3. PROPERTIES — Create 4 Properties"
# =============================================================================

# ── Property 1: Westlands Heights (APARTMENT, has 3D + VR tour, ACTIVE) ──────
R=$(curl -s -X POST "$API/properties" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Westlands Heights",
    "tagline": "Luxury high-rise living above the Nairobi skyline",
    "description": "Westlands Heights is a 32-storey residential tower offering panoramic views of Nairobi. Each unit features floor-to-ceiling windows, smart home automation, and premium finishes. Residents enjoy a rooftop pool, fully equipped gym, co-working lounge, and 24/7 concierge. Ideal for discerning buyers seeking both lifestyle and investment value.",
    "category": "APARTMENT",
    "city": "Nairobi",
    "neighborhood": "Westlands",
    "county": "Nairobi County",
    "latitude": -1.2637,
    "longitude": 36.8035,
    "heroImageUrl": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200",
    "priceFrom": 8500000,
    "priceTo": 45000000,
    "tags": ["pool","gym","concierge","smart-home","rooftop","ev-charging","fibre"]
  }')
get_id "POST /properties (Westlands Heights)" "$R"; P1_ID="$LAST_ID"
P1_SLUG=$(extract "$R" "data.slug")
info "slug=$P1_SLUG"

# Activate property
curl -s -X PATCH "$API/properties/${P1_SLUG}/status" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}' >/dev/null
ok "PATCH /properties/:slug/status → ACTIVE"

# ── Property 2: Kileleshwa Gardens (VILLA, hasCinematicTour, ACTIVE) ─────────
R=$(curl -s -X POST "$API/properties" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kileleshwa Gardens",
    "tagline": "Serene gated villas with lush tropical gardens",
    "description": "Kileleshwa Gardens is a private estate of 24 luxury villas nestled behind mature trees in one of Nairobi'\''s most prestigious addresses. Each villa features expansive living areas, gourmet kitchen, private garden, and a dedicated domestic staff quarters. The estate boasts a residents-only clubhouse, swimming pool, tennis court, and electric gate with 24-hour security.",
    "category": "VILLA",
    "city": "Nairobi",
    "neighborhood": "Kileleshwa",
    "county": "Nairobi County",
    "latitude": -1.2762,
    "longitude": 36.7764,
    "heroImageUrl": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200",
    "priceFrom": 35000000,
    "priceTo": 75000000,
    "tags": ["gated","villa","garden","tennis","pool","dsq","generator"]
  }')
get_id "POST /properties (Kileleshwa Gardens)" "$R"; P2_ID="$LAST_ID"
P2_SLUG=$(extract "$R" "data.slug")
info "slug=$P2_SLUG"

curl -s -X PATCH "$API/properties/${P2_SLUG}/status" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}' >/dev/null
ok "PATCH /properties/:slug/status → ACTIVE"

# ── Property 3: Karen Penthouse (PENTHOUSE, off-plan, DEV1) ──────────────────
R=$(curl -s -X POST "$API/properties" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Karen Ridge Penthouses",
    "tagline": "Off-plan penthouses with uninterrupted Ngong Hills views",
    "description": "Karen Ridge Penthouses is an exclusive off-plan development featuring just 12 sky-high penthouses, each with a private rooftop terrace, plunge pool, and dedicated lift access. Completion targeted for Q4 2027. Early investors benefit from pre-launch pricing and flexible payment plans.",
    "category": "PENTHOUSE",
    "city": "Nairobi",
    "neighborhood": "Karen",
    "county": "Nairobi County",
    "latitude": -1.3205,
    "longitude": 36.7128,
    "heroImageUrl": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
    "priceFrom": 55000000,
    "priceTo": 120000000,
    "completionDate": "2027-12-01T00:00:00.000Z",
    "tags": ["off-plan","penthouse","rooftop-pool","private-lift","ngong-views"]
  }')
get_id "POST /properties (Karen Ridge Penthouses)" "$R"; P3_ID="$LAST_ID"
P3_SLUG=$(extract "$R" "data.slug")
info "slug=$P3_SLUG"

curl -s -X PATCH "$API/properties/${P3_SLUG}/status" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"OFF_PLAN"}' >/dev/null
ok "PATCH /properties/:slug/status → OFF_PLAN"

# ── Property 4: Parklands Office Block (OFFICE, ACTIVE, DEV2) ────────────────
R=$(curl -s -X POST "$API/properties" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Parklands Business Hub",
    "tagline": "Grade-A office spaces in the heart of Parklands",
    "description": "A modern 12-storey Grade-A commercial building offering open-plan and partitioned office suites from 45 sqm to full floor plates of 1,200 sqm. Features fibre connectivity, backup power, 3 high-speed lifts, basement parking, and a ground-floor restaurant and café.",
    "category": "OFFICE",
    "city": "Nairobi",
    "neighborhood": "Parklands",
    "county": "Nairobi County",
    "latitude": -1.2583,
    "longitude": 36.8214,
    "heroImageUrl": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200",
    "priceFrom": 12000000,
    "priceTo": 95000000,
    "tags": ["office","grade-a","fibre","backup-power","parking","restaurant"]
  }')
get_id "POST /properties (Parklands Business Hub)" "$R"; P4_ID="$LAST_ID"
P4_SLUG=$(extract "$R" "data.slug")
info "slug=$P4_SLUG"

curl -s -X PATCH "$API/properties/${P4_SLUG}/status" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}' >/dev/null
ok "PATCH /properties/:slug/status → ACTIVE"

# =============================================================================
header "4. UNITS — Add Units to Properties"
# =============================================================================

# ── Westlands Heights units (P1) ─────────────────────────────────────────────
WH_UNITS=()
for cfg in \
  '{"name":"Unit 5A","floor":5,"bedrooms":1,"bathrooms":1,"sqm":55,"price":8500000,"status":"AVAILABLE","features":["balcony","fitted-kitchen"]}' \
  '{"name":"Unit 8B","floor":8,"bedrooms":2,"bathrooms":2,"sqm":95,"price":12500000,"status":"AVAILABLE","features":["ensuite","balcony","dsq"]}' \
  '{"name":"Unit 12C","floor":12,"bedrooms":2,"bathrooms":2,"sqm":100,"price":13200000,"status":"RESERVED","features":["ensuite","balcony","corner-unit"]}' \
  '{"name":"Unit 15A","floor":15,"bedrooms":3,"bathrooms":3,"sqm":145,"price":21000000,"status":"AVAILABLE","features":["ensuite","2-balconies","dsq","storage"]}' \
  '{"name":"Unit 20B","floor":20,"bedrooms":3,"bathrooms":3,"sqm":155,"price":23500000,"status":"AVAILABLE","features":["ensuite","panoramic-view","dsq","utility-room"]}' \
  '{"name":"Unit 28D","floor":28,"bedrooms":4,"bathrooms":4,"sqm":220,"price":38000000,"status":"AVAILABLE","features":["ensuite","2-balconies","dsq","home-office","wine-room"]}' \
  '{"name":"Penthouse 32","floor":32,"bedrooms":5,"bathrooms":5,"sqm":420,"price":45000000,"status":"SOLD","features":["rooftop-terrace","plunge-pool","3-balconies","dsq","private-lift"]}'; do
  R=$(curl -s -X POST "$API/properties/${P1_SLUG}/units" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$cfg")
  UID_VAL=$(extract "$R" "data.id")
  if [[ -n "$UID_VAL" ]]; then
    ok "POST unit → $(extract "$R" "data.name")"
    WH_UNITS+=("$UID_VAL")
  else
    fail "POST unit failed | $(extract "$R" "error")"
  fi
done

# ── Kileleshwa Gardens units (P2) ────────────────────────────────────────────
KG_UNITS=()
for cfg in \
  '{"name":"Villa 3","floor":0,"bedrooms":4,"bathrooms":4,"sqm":380,"price":38000000,"status":"AVAILABLE","features":["private-garden","dsq","store","double-garage"]}' \
  '{"name":"Villa 7","floor":0,"bedrooms":5,"bathrooms":5,"sqm":450,"price":45000000,"status":"AVAILABLE","features":["private-garden","dsq","store","double-garage","home-office"]}' \
  '{"name":"Villa 12","floor":0,"bedrooms":5,"bathrooms":5,"sqm":480,"price":52000000,"status":"RESERVED","features":["corner-plot","private-garden","dsq","double-garage","home-gym"]}' \
  '{"name":"Villa 18","floor":0,"bedrooms":6,"bathrooms":6,"sqm":550,"price":75000000,"status":"AVAILABLE","features":["largest-plot","pool","dsq","triple-garage","home-cinema"]}'; do
  R=$(curl -s -X POST "$API/properties/${P2_SLUG}/units" \
    -H "Authorization: Bearer $DEV2_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$cfg")
  UID_VAL=$(extract "$R" "data.id")
  if [[ -n "$UID_VAL" ]]; then
    ok "POST unit → $(extract "$R" "data.name")"
    KG_UNITS+=("$UID_VAL")
  else
    fail "POST unit failed | $(extract "$R" "error")"
  fi
done

# ── Karen Ridge Penthouses units (P3) ────────────────────────────────────────
KR_UNITS=()
for cfg in \
  '{"name":"PH-01","floor":18,"bedrooms":3,"bathrooms":3,"sqm":280,"price":55000000,"status":"AVAILABLE","features":["rooftop-terrace","plunge-pool","private-lift"]}' \
  '{"name":"PH-06","floor":19,"bedrooms":4,"bathrooms":4,"sqm":340,"price":75000000,"status":"AVAILABLE","features":["rooftop-terrace","plunge-pool","private-lift","360-views"]}' \
  '{"name":"PH-12","floor":20,"bedrooms":5,"bathrooms":5,"sqm":420,"price":120000000,"status":"AVAILABLE","features":["duplex","private-pool","lift","360-views","staff-quarters"]}'; do
  R=$(curl -s -X POST "$API/properties/${P3_SLUG}/units" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$cfg")
  UID_VAL=$(extract "$R" "data.id")
  if [[ -n "$UID_VAL" ]]; then
    ok "POST unit → $(extract "$R" "data.name")"
    KR_UNITS+=("$UID_VAL")
  else
    fail "POST unit failed | $(extract "$R" "error")"
  fi
done

# ── Parklands Business Hub units (P4) ────────────────────────────────────────
for cfg in \
  '{"name":"Suite 2A","floor":2,"bedrooms":0,"bathrooms":1,"sqm":45,"price":12000000,"status":"AVAILABLE","features":["partitioned","fibre","ac"]}' \
  '{"name":"Suite 4B","floor":4,"bedrooms":0,"bathrooms":2,"sqm":120,"price":28000000,"status":"AVAILABLE","features":["open-plan","fibre","ac","boardroom"]}' \
  '{"name":"Floor 8 Full","floor":8,"bedrooms":0,"bathrooms":4,"sqm":1200,"price":95000000,"status":"AVAILABLE","features":["full-floor","fibre","ac","4-boardrooms","reception"]}'; do
  R=$(curl -s -X POST "$API/properties/${P4_SLUG}/units" \
    -H "Authorization: Bearer $DEV2_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$cfg")
  if [[ "$(extract "$R" "success")" == "True" ]]; then
    ok "POST unit → $(extract "$R" "data.name")"
  else
    fail "POST unit failed | $(extract "$R" "error")"
  fi
done

# =============================================================================
header "5. AMENITIES"
# =============================================================================

# Westlands Heights amenities
R=$(curl -s -X POST "$API/properties/${P1_SLUG}/amenities/bulk" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"name":"The Westgate Shopping Mall","type":"MALL","distance":"0.4 km"},
    {"name":"MP Shah Hospital","type":"HOSPITAL","distance":"1.2 km"},
    {"name":"Sarit Centre","type":"MALL","distance":"0.8 km"},
    {"name":"Village Market","type":"MALL","distance":"3.5 km"},
    {"name":"Westlands Matatu Stop","type":"TRANSPORT","distance":"0.2 km"},
    {"name":"JKIA Airport","type":"AIRPORT","distance":"18 km"},
    {"name":"ABC Place Gym","type":"GYM","distance":"0.3 km"},
    {"name":"Naivas Supermarket","type":"SUPERMARKET","distance":"0.5 km"}
  ]')
check_ok "POST /amenities/bulk (Westlands Heights)" "$R"

# Kileleshwa Gardens amenities
R=$(curl -s -X POST "$API/properties/${P2_SLUG}/amenities/bulk" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"name":"Kileleshwa Primary School","type":"SCHOOL","distance":"0.5 km"},
    {"name":"Nairobi Hospital","type":"HOSPITAL","distance":"2.1 km"},
    {"name":"Junction Mall","type":"MALL","distance":"4.2 km"},
    {"name":"Valley Arcade","type":"MALL","distance":"1.8 km"},
    {"name":"Mamlaka Road Bus Stop","type":"TRANSPORT","distance":"0.7 km"},
    {"name":"Karen Country Club","type":"PARK","distance":"5.0 km"}
  ]')
check_ok "POST /amenities/bulk (Kileleshwa Gardens)" "$R"

# =============================================================================
header "6. CONSTRUCTION UPDATES"
# =============================================================================

# Karen Ridge Penthouses (off-plan — construction updates relevant)
for upd in \
  '{"title":"Site Preparation Complete","description":"Site clearance and grading completed. Borehole drilling complete — water supply confirmed at 65 m depth.","percentComplete":5,"date":"2026-01-15"}' \
  '{"title":"Foundation Piling Complete","description":"450 mm diameter bored piles installed to a depth of 22 m. Structural engineer sign-off received. Concrete curing in progress.","percentComplete":18,"date":"2026-03-10"}' \
  '{"title":"Ground Floor Slab Poured","description":"The ground floor slab has been successfully poured. Mechanical, electrical and plumbing first-fix ongoing.","percentComplete":25,"date":"2026-05-20"}' \
  '{"title":"Level 5 Reached — Superstructure Progress","description":"Superstructure has reached level 5. Concrete works proceeding at 2 floors per month. External scaffold erected on south and west facades.","percentComplete":38,"date":"2026-07-01"}'; do
  R=$(curl -s -X POST "$API/properties/${P3_SLUG}/construction-updates" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$upd")
  if [[ "$(extract "$R" "success")" == "True" ]]; then
    ok "POST construction-update → $(echo "$upd" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])")"
  else
    fail "POST construction-update failed | $(extract "$R" "error")"
  fi
done

# Westlands Heights (active but add some historical updates)
R=$(curl -s -X POST "$API/properties/${P1_SLUG}/construction-updates" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Tower Completed — Ready for Handover","description":"All 32 floors completed. Lift commissioning done. Landscaping and external works finalised. Certificate of Occupation received from NCC.","percentComplete":100,"date":"2025-11-01"}')
check_ok "POST construction-update (Westlands Heights — complete)" "$R"

# =============================================================================
header "7. TOURS — Cinematic, 3D, VR, Floor Plans"
# =============================================================================

# ── Westlands Heights — 3D Tour sections & scenes ────────────────────────────
R=$(curl -s -X POST "$API/properties/${P1_SLUG}/tours/3d/sections" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Common Areas","order":1}')
SEC1_ID=$(extract "$R" "data.id")
if [[ -n "$SEC1_ID" ]]; then ok "POST 3D section → Common Areas (id=$SEC1_ID)"; else fail "POST 3D section failed | $(extract "$R" "error")"; fi

R=$(curl -s -X POST "$API/properties/${P1_SLUG}/tours/3d/sections" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Unit Showcase","order":2}')
SEC2_ID=$(extract "$R" "data.id")
if [[ -n "$SEC2_ID" ]]; then ok "POST 3D section → Unit Showcase (id=$SEC2_ID)"; else fail "POST 3D section failed | $(extract "$R" "error")"; fi

if [[ -n "$SEC1_ID" ]]; then
  for scene in \
    '{"label":"Building Lobby","description":"Grand double-volume lobby with marble flooring and concierge desk.","imageUrl":"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800","cameraPreset":"LOBBY","order":1}' \
    '{"label":"Rooftop Pool","description":"Infinity pool on the 32nd floor with panoramic city views.","imageUrl":"https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800","cameraPreset":"POOL","order":2}' \
    '{"label":"Residents Gym","description":"Fully equipped 24-hour gym with Technogym equipment and yoga studio.","imageUrl":"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800","cameraPreset":"GYM","order":3}'; do
    R=$(curl -s -X POST "$API/properties/${P1_SLUG}/tours/3d/sections/${SEC1_ID}/scenes" \
      -H "Authorization: Bearer $DEV1_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$scene")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST 3D scene → $(echo "$scene" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
    else
      fail "POST 3D scene failed | $(extract "$R" "error")"
    fi
  done
fi

if [[ -n "$SEC2_ID" ]]; then
  for scene in \
    '{"label":"Living & Dining","description":"Open-plan living and dining area with floor-to-ceiling windows.","imageUrl":"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800","cameraPreset":"INTERIOR","order":1}' \
    '{"label":"Master Bedroom","description":"Spacious master suite with walk-in wardrobe and ensuite bathroom.","imageUrl":"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800","cameraPreset":"INTERIOR","order":2}' \
    '{"label":"Kitchen","description":"German-engineered kitchen with island, integrated appliances and quartz countertops.","imageUrl":"https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800","cameraPreset":"INTERIOR","order":3}'; do
    R=$(curl -s -X POST "$API/properties/${P1_SLUG}/tours/3d/sections/${SEC2_ID}/scenes" \
      -H "Authorization: Bearer $DEV1_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$scene")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST 3D scene → $(echo "$scene" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
    else
      fail "POST 3D scene failed | $(extract "$R" "error")"
    fi
  done
fi

# ── Westlands Heights — VR scenes ────────────────────────────────────────────
for scene in \
  '{"label":"Aerial Approach","description":"Drone view approaching the tower from the north-west.","imageUrl":"https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800","cameraPreset":"AERIAL","order":1}' \
  '{"label":"Rooftop Experience","description":"360° view from the rooftop pool deck at golden hour.","imageUrl":"https://images.unsplash.com/photo-1599922560999-1bab7c101f6b?w=800","cameraPreset":"ROOFTOP","order":2}' \
  '{"label":"Show Apartment","description":"Fully furnished 2-bedroom show apartment on the 15th floor.","imageUrl":"https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800","cameraPreset":"INTERIOR","order":3}'; do
  R=$(curl -s -X POST "$API/properties/${P1_SLUG}/tours/vr" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$scene")
  if [[ "$(extract "$R" "success")" == "True" ]]; then
    ok "POST VR scene → $(echo "$scene" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
  else
    fail "POST VR scene failed | $(extract "$R" "error")"
  fi
done

# ── Kileleshwa Gardens — Cinematic Tour ──────────────────────────────────────
for scene in \
  '{"label":"Estate Overview","sublabel":"Aerial View","category":"AERIAL","videoUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4","thumbnailUrl":"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400","order":1}' \
  '{"label":"Entrance & Gardens","sublabel":"Landscaped grounds","category":"EXTERIOR","videoUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4","thumbnailUrl":"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400","order":2}' \
  '{"label":"Living Room","sublabel":"Open-plan design","category":"LIVING_ROOM","videoUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4","thumbnailUrl":"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400","order":3}' \
  '{"label":"Master Suite","sublabel":"Retreat & relaxation","category":"BEDROOM","videoUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4","thumbnailUrl":"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400","order":4}' \
  '{"label":"Estate Amenities","sublabel":"Pool, tennis & clubhouse","category":"AMENITIES","videoUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4","thumbnailUrl":"https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=400","order":5}'; do
  R=$(curl -s -X POST "$API/properties/${P2_SLUG}/tours/cinematic" \
    -H "Authorization: Bearer $DEV2_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$scene")
  if [[ "$(extract "$R" "success")" == "True" ]]; then
    ok "POST cinematic scene → $(echo "$scene" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
  else
    fail "POST cinematic scene failed | $(extract "$R" "error")"
  fi
done

# ── Floor Plans — Westlands Heights ──────────────────────────────────────────
for fp in \
  '{"name":"Type A — 1 Bedroom","bedrooms":1,"bathrooms":1,"sqm":55,"imageUrl":"https://placehold.co/800x600/1a1a2e/ffffff?text=1BR+Type+A","order":1}' \
  '{"name":"Type B — 2 Bedroom","bedrooms":2,"bathrooms":2,"sqm":95,"imageUrl":"https://placehold.co/800x600/1a1a2e/ffffff?text=2BR+Type+B","order":2}' \
  '{"name":"Type C — 3 Bedroom","bedrooms":3,"bathrooms":3,"sqm":145,"imageUrl":"https://placehold.co/800x600/1a1a2e/ffffff?text=3BR+Type+C","order":3}' \
  '{"name":"Type D — 4 Bedroom","bedrooms":4,"bathrooms":4,"sqm":220,"imageUrl":"https://placehold.co/800x600/1a1a2e/ffffff?text=4BR+Type+D","order":4}'; do
  R=$(curl -s -X POST "$API/properties/${P1_SLUG}/tours/floor-plans" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$fp")
  if [[ "$(extract "$R" "success")" == "True" ]]; then
    ok "POST floor-plan → $(echo "$fp" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")"
  else
    fail "POST floor-plan failed | $(extract "$R" "error")"
  fi
done

# =============================================================================
header "8. MEDIA — Gallery Images"
# =============================================================================

for url in \
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800" \
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800" \
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800" \
  "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800" \
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800"; do
  R=$(curl -s -X POST "$API/media/properties/${P1_SLUG}" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"PHOTO\",\"url\":\"${url}\",\"title\":\"Westlands Heights Gallery\"}")
  if [[ "$(extract "$R" "success")" == "True" ]]; then ok "POST media photo (P1)"; else fail "POST media photo failed | $(extract "$R" "error")"; fi
done

for url in \
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800" \
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800" \
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"; do
  R=$(curl -s -X POST "$API/media/properties/${P2_SLUG}" \
    -H "Authorization: Bearer $DEV2_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"PHOTO\",\"url\":\"${url}\",\"title\":\"Kileleshwa Gardens Gallery\"}")
  if [[ "$(extract "$R" "success")" == "True" ]]; then ok "POST media photo (P2)"; else fail "POST media photo failed | $(extract "$R" "error")"; fi
done

# =============================================================================
header "9. RENT LISTINGS — Create 3 Rental Properties"
# =============================================================================

# ── Rent Listing 1: Kilimani Serviced Apartments (belongs to P1 developer) ───
R=$(curl -s -X POST "$API/rent-listings" \
  -H "Authorization: Bearer $DEV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Kilimani Serviced Apartments\",
    \"tagline\": \"Fully serviced 1 & 2 bedroom units in prime Kilimani\",
    \"description\": \"Modern serviced apartments with hotel-style amenities. Ideal for short-to-medium term stays. Includes weekly housekeeping, 24/7 security, Wi-Fi, backup power, and parking.\",
    \"propertySlug\": \"${P1_SLUG}\",
    \"city\": \"Nairobi\",
    \"neighborhood\": \"Kilimani\",
    \"furnishing\": \"FURNISHED\",
    \"priceFrom\": 75000,
    \"priceTo\": 120000,
    \"heroImageUrl\": \"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200\",
    \"minLeaseTerm\": 6,
    \"tags\": [\"serviced\",\"furnished\",\"backup-power\",\"parking\",\"wifi\"]
  }")
get_id "POST /rent-listings (Kilimani Serviced)" "$R"; RL1_ID="$LAST_ID"
RL1_SLUG=$(extract "$R" "data.slug")

if [[ -n "$RL1_ID" ]]; then
  for runit in \
    '{"label":"1 Bedroom Standard","bedrooms":1,"bathrooms":1,"sqm":52,"pricePerMonth":75000,"available":3,"total":8,"furnishing":"FURNISHED","features":["kitchenette","balcony","wifi"]}' \
    '{"label":"2 Bedroom Deluxe","bedrooms":2,"bathrooms":2,"sqm":90,"pricePerMonth":115000,"available":2,"total":5,"furnishing":"FURNISHED","features":["full-kitchen","2-balconies","wifi","dsq"]}'; do
    R=$(curl -s -X POST "$API/rent-listings/${RL1_ID}/units" \
      -H "Authorization: Bearer $DEV1_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$runit")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST rent unit → $(echo "$runit" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
    else
      fail "POST rent unit failed | $(extract "$R" "error")"
    fi
  done
fi

# ── Rent Listing 2: Lavington Family Homes ────────────────────────────────────
R=$(curl -s -X POST "$API/rent-listings" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Lavington Family Homes\",
    \"tagline\": \"Spacious semi-furnished 3 & 4BR homes with large gardens\",
    \"description\": \"Detached and semi-detached family homes in a secure cul-de-sac in Lavington. Each home features a large garden, DSQ, 2-car garage, borehole water, and solar panels.\",
    \"propertySlug\": \"${P2_SLUG}\",
    \"city\": \"Nairobi\",
    \"neighborhood\": \"Lavington\",
    \"furnishing\": \"SEMI_FURNISHED\",
    \"priceFrom\": 180000,
    \"priceTo\": 280000,
    \"heroImageUrl\": \"https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200\",
    \"minLeaseTerm\": 12,
    \"tags\": [\"family\",\"garden\",\"dsq\",\"garage\",\"borehole\",\"solar\"]
  }")
get_id "POST /rent-listings (Lavington Family Homes)" "$R"; RL2_ID="$LAST_ID"

if [[ -n "$RL2_ID" ]]; then
  for runit in \
    '{"label":"3 Bedroom Semi-Detached","bedrooms":3,"bathrooms":3,"sqm":220,"pricePerMonth":180000,"available":2,"total":6,"furnishing":"SEMI_FURNISHED","features":["garden","dsq","garage","borehole"]}' \
    '{"label":"4 Bedroom Detached","bedrooms":4,"bathrooms":4,"sqm":320,"pricePerMonth":260000,"available":1,"total":4,"furnishing":"SEMI_FURNISHED","features":["large-garden","dsq","double-garage","borehole","solar"]}'; do
    R=$(curl -s -X POST "$API/rent-listings/${RL2_ID}/units" \
      -H "Authorization: Bearer $DEV2_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$runit")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST rent unit → $(echo "$runit" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
    else
      fail "POST rent unit failed | $(extract "$R" "error")"
    fi
  done
fi

# ── Rent Listing 3: South C Studio & 1BR Units (P4 belongs to DEV2) ──────────
R=$(curl -s -X POST "$API/rent-listings" \
  -H "Authorization: Bearer $DEV2_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"South C Modern Flats\",
    \"tagline\": \"Affordable studio & 1BR units near the CBD\",
    \"description\": \"Modern unfurnished units in a well-maintained block. 5 minutes from JKIA Express, 15 minutes from CBD. 24/7 security, CCTV, backup water, parking.\",
    \"propertySlug\": \"${P4_SLUG}\",
    \"city\": \"Nairobi\",
    \"neighborhood\": \"South C\",
    \"furnishing\": \"UNFURNISHED\",
    \"priceFrom\": 25000,
    \"priceTo\": 55000,
    \"heroImageUrl\": \"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200\",
    \"minLeaseTerm\": 12,
    \"tags\": [\"affordable\",\"security\",\"parking\",\"cctv\",\"backup-water\"]
  }")
get_id "POST /rent-listings (South C Modern Flats)" "$R"; RL3_ID="$LAST_ID"

if [[ -n "$RL3_ID" ]]; then
  for runit in \
    '{"label":"Studio","bedrooms":0,"bathrooms":1,"sqm":28,"pricePerMonth":25000,"available":5,"total":12,"furnishing":"UNFURNISHED","features":["open-plan","fitted-kitchen"]}' \
    '{"label":"1 Bedroom","bedrooms":1,"bathrooms":1,"sqm":48,"pricePerMonth":45000,"available":3,"total":8,"furnishing":"UNFURNISHED","features":["balcony","fitted-kitchen","parking"]}'; do
    R=$(curl -s -X POST "$API/rent-listings/${RL3_ID}/units" \
      -H "Authorization: Bearer $DEV2_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$runit")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST rent unit → $(echo "$runit" | python3 -c "import sys,json; print(json.load(sys.stdin)['label'])")"
    else
      fail "POST rent unit failed | $(extract "$R" "error")"
    fi
  done
fi

# =============================================================================
header "10. INQUIRIES — Buyer & Tenant Inquiries"
# =============================================================================

# Guest inquiry on Westlands Heights
R=$(curl -s -X POST "$API/inquiries" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Grace Wambui\",\"email\":\"gwambui@gmail.com\",\"phone\":\"+254711000001\",\"message\":\"I am interested in a 2-bedroom unit. Are there flexible payment plans available? What is the management fee?\",\"propertySlug\":\"${P1_SLUG}\",\"interestedUnit\":\"2BR\"}")
get_id "POST /inquiries (guest → Westlands Heights)" "$R"; WH_INQ1_ID="$LAST_ID"

# Tenant1 inquiry on Westlands Heights
R=$(curl -s -X POST "$API/inquiries" \
  -H "Authorization: Bearer $TEN1_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Amina Hassan\",\"email\":\"${TEN1_EMAIL}\",\"phone\":\"+254700001001\",\"message\":\"Could you arrange a site visit this weekend? I am particularly interested in the 3-bedroom units on the upper floors.\",\"propertySlug\":\"${P1_SLUG}\",\"interestedUnit\":\"3BR\"}")
get_id "POST /inquiries (tenant1 → Westlands Heights)" "$R"; WH_INQ2_ID="$LAST_ID"

# Investor1 inquiry on Karen Ridge
R=$(curl -s -X POST "$API/inquiries" \
  -H "Authorization: Bearer $INV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Michael Omondi\",\"email\":\"${INV1_EMAIL}\",\"phone\":\"+254700002001\",\"message\":\"I am looking to purchase PH-06 or PH-12 as an investment. What is the projected rental yield?\",\"propertySlug\":\"${P3_SLUG}\",\"interestedUnit\":\"PH-06\"}")
get_id "POST /inquiries (investor1 → Karen Ridge)" "$R"; KR_INQ1_ID="$LAST_ID"

# Tenant2 inquiry on rent listing
R=$(curl -s -X POST "$API/inquiries" \
  -H "Authorization: Bearer $TEN2_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"David Mwangi\",\"email\":\"${TEN2_EMAIL}\",\"phone\":\"+254700003001\",\"message\":\"Is the 2-bedroom serviced apartment available from 1st August? What does the weekly housekeeping cover?\",\"rentListingId\":\"${RL1_ID}\"}")
get_id "POST /inquiries (tenant2 → rent listing)" "$R"

# Developer replies to inquiry
if [[ -n "$WH_INQ1_ID" ]]; then
  R=$(curl -s -X POST "$API/inquiries/${WH_INQ1_ID}/reply" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"Thank you for your interest in Westlands Heights! We offer 2BR units from KES 12.5M. Payment plans available: 20% on booking, 30% during construction, 50% on completion. Management fee is 8% of rental income. Please call +254700123456 to schedule a showroom visit."}')
  check_ok "POST /inquiries/:id/reply (dev1 replies)" "$R"
fi

if [[ -n "$KR_INQ1_ID" ]]; then
  R=$(curl -s -X POST "$API/inquiries/${KR_INQ1_ID}/reply" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello Michael, thank you for your interest in Karen Ridge Penthouses. PH-06 at KES 75M and PH-12 at KES 120M are both available. Current projected gross rental yield is 7.5-9% p.a. based on comparable Nairobi prime luxury rentals. We offer a structured payment plan: 30% on reservation, 30% at mid-construction, 40% on handover. Would you like to schedule a call with our sales team?"}')
  check_ok "POST /inquiries/:id/reply (dev1 replies to investor)" "$R"
fi

# =============================================================================
header "11. BOOKINGS — Site Visits"
# =============================================================================

R=$(curl -s -X POST "$API/bookings" \
  -H "Authorization: Bearer $TEN1_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"propertySlug\":\"${P1_SLUG}\",\"name\":\"Amina Hassan\",\"email\":\"${TEN1_EMAIL}\",\"phone\":\"+254700001001\",\"date\":\"2026-08-05\",\"time\":\"10:00\",\"type\":\"PHYSICAL\",\"message\":\"Please show me the 3BR units on floors 15-20 if possible.\"}")
get_id "POST /bookings (tenant1 → Westlands Heights PHYSICAL)" "$R"; BK1_ID="$LAST_ID"

R=$(curl -s -X POST "$API/bookings" \
  -H "Authorization: Bearer $TEN2_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"propertySlug\":\"${P2_SLUG}\",\"name\":\"David Mwangi\",\"email\":\"${TEN2_EMAIL}\",\"phone\":\"+254700003001\",\"date\":\"2026-08-10\",\"time\":\"14:00\",\"type\":\"PHYSICAL\",\"message\":\"Interested in a 4-5 bedroom villa for family.\"}")
get_id "POST /bookings (tenant2 → Kileleshwa Gardens)" "$R"; BK2_ID="$LAST_ID"

R=$(curl -s -X POST "$API/bookings" \
  -H "Authorization: Bearer $INV1_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"propertySlug\":\"${P3_SLUG}\",\"name\":\"Michael Omondi\",\"email\":\"${INV1_EMAIL}\",\"phone\":\"+254700002001\",\"date\":\"2026-08-15\",\"time\":\"11:00\",\"type\":\"VIRTUAL\",\"message\":\"I am based in the diaspora — please arrange a virtual walkthrough of PH-06.\"}")
get_id "POST /bookings (investor1 → Karen Ridge VIRTUAL)" "$R"; BK3_ID="$LAST_ID"

# Guest booking
R=$(curl -s -X POST "$API/bookings" \
  -H "Content-Type: application/json" \
  -d "{\"propertySlug\":\"${P1_SLUG}\",\"name\":\"Peter Kamau\",\"email\":\"pkamau@email.com\",\"phone\":\"+254722000001\",\"date\":\"2026-08-20\",\"time\":\"09:00\",\"type\":\"PHYSICAL\"}")
get_id "POST /bookings (guest → Westlands Heights)" "$R"; BK4_ID="$LAST_ID"

# Developer confirms and completes some bookings
if [[ -n "$BK1_ID" ]]; then
  R=$(curl -s -X PATCH "$API/bookings/${BK1_ID}/status" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"CONFIRMED","meetingUrl":null}')
  check_ok "PATCH /bookings/:id/status → CONFIRMED (BK1)" "$R"
fi

if [[ -n "$BK3_ID" ]]; then
  R=$(curl -s -X PATCH "$API/bookings/${BK3_ID}/status" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"CONFIRMED","meetingUrl":"https://meet.google.com/abc-defg-hij"}')
  check_ok "PATCH /bookings/:id/status → CONFIRMED + meetingUrl (BK3)" "$R"
fi

if [[ -n "$BK4_ID" ]]; then
  R=$(curl -s -X PATCH "$API/bookings/${BK4_ID}/status" \
    -H "Authorization: Bearer $DEV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"COMPLETED"}')
  check_ok "PATCH /bookings/:id/status → COMPLETED (BK4)" "$R"
fi

# =============================================================================
header "12. SAVED PROPERTIES"
# =============================================================================

# Tenant1 saves P1 and P3
for slug in "$P1_SLUG" "$P3_SLUG"; do
  R=$(curl -s -X POST "$API/saved-properties/${slug}" \
    -H "Authorization: Bearer $TEN1_TOKEN")
  check_ok "POST /saved-properties/${slug} (tenant1)" "$R"
done

# Investor1 saves P3 and P1
for slug in "$P3_SLUG" "$P1_SLUG"; do
  R=$(curl -s -X POST "$API/saved-properties/${slug}" \
    -H "Authorization: Bearer $INV1_TOKEN")
  check_ok "POST /saved-properties/${slug} (investor1)" "$R"
done

# Tenant2 saves P2
R=$(curl -s -X POST "$API/saved-properties/${P2_SLUG}" \
  -H "Authorization: Bearer $TEN2_TOKEN")
check_ok "POST /saved-properties/${P2_SLUG} (tenant2)" "$R"

# =============================================================================
header "13. RESERVATIONS — Full Stage Journey"
# =============================================================================

# Get an available unit ID for each scenario
WH_AVAIL_UNIT="${WH_UNITS[0]:-}"   # Unit 5A
KR_AVAIL_UNIT="${KR_UNITS[0]:-}"   # PH-01

if [[ -n "$WH_AVAIL_UNIT" ]]; then
  # Tenant1 reserves Unit 5A — advances to DEPOSIT_PAID
  R=$(curl -s -X POST "$API/reservations" \
    -H "Authorization: Bearer $TEN1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"unitId\":\"${WH_AVAIL_UNIT}\"}")
  get_id "POST /reservations (tenant1 → Unit 5A)" "$R"; RES1_ID="$LAST_ID"

  if [[ -n "$RES1_ID" ]]; then
    for stage in "AGREEMENT_SIGNED" "DEPOSIT_PAID"; do
      R=$(curl -s -X PATCH "$API/reservations/${RES1_ID}/stage" \
        -H "Authorization: Bearer $DEV1_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"stage\":\"${stage}\"}")
      check_ok "PATCH /reservations/:id/stage → ${stage}" "$R"
    done
  fi
fi

if [[ -n "$KR_AVAIL_UNIT" ]]; then
  # Investor1 reserves PH-01 — advances all the way to TITLE_TRANSFERRED
  R=$(curl -s -X POST "$API/reservations" \
    -H "Authorization: Bearer $INV1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"unitId\":\"${KR_AVAIL_UNIT}\"}")
  get_id "POST /reservations (investor1 → PH-01)" "$R"; RES2_ID="$LAST_ID"

  if [[ -n "$RES2_ID" ]]; then
    for stage in "AGREEMENT_SIGNED" "DEPOSIT_PAID" "FINAL_PAYMENT" "TITLE_TRANSFERRED"; do
      R=$(curl -s -X PATCH "$API/reservations/${RES2_ID}/stage" \
        -H "Authorization: Bearer $DEV1_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"stage\":\"${stage}\"}")
      check_ok "PATCH /reservations/:id/stage → ${stage}" "$R"
    done
  fi
fi

if [[ ${#KG_UNITS[@]} -gt 0 ]]; then
  KG_AVAIL_UNIT="${KG_UNITS[0]}"
  # Tenant2 reserves Villa 3 — stays at RESERVED
  R=$(curl -s -X POST "$API/reservations" \
    -H "Authorization: Bearer $TEN2_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"unitId\":\"${KG_AVAIL_UNIT}\"}")
  get_id "POST /reservations (tenant2 → Villa 3 — stays RESERVED)" "$R"
fi

# =============================================================================
header "14. DOCUMENTS — Upload to Reservations"
# =============================================================================

if [[ -n "${RES1_ID:-}" ]]; then
  for doc in \
    "{\"name\":\"Sale & Purchase Agreement\",\"url\":\"https://example.com/docs/spa-wh-unit5a.pdf\",\"type\":\"application/pdf\",\"sizeBytes\":204800,\"reservationId\":\"${RES1_ID}\"}" \
    "{\"name\":\"KYC — ID Copy\",\"url\":\"https://example.com/docs/kyc-amina-id.pdf\",\"type\":\"application/pdf\",\"sizeBytes\":102400,\"reservationId\":\"${RES1_ID}\"}" \
    "{\"name\":\"Deposit Receipt — KES 2.55M\",\"url\":\"https://example.com/docs/receipt-deposit-wh5a.pdf\",\"type\":\"application/pdf\",\"sizeBytes\":51200,\"reservationId\":\"${RES1_ID}\"}"; do
    R=$(curl -s -X POST "$API/documents" \
      -H "Authorization: Bearer $TEN1_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$doc")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST /documents → $(echo "$doc" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")"
    else
      fail "POST /documents failed | $(extract "$R" "error")"
    fi
  done
fi

if [[ -n "${RES2_ID:-}" ]]; then
  for doc in \
    "{\"name\":\"Sale & Purchase Agreement — PH-01\",\"url\":\"https://example.com/docs/spa-kr-ph01.pdf\",\"type\":\"application/pdf\",\"sizeBytes\":358400,\"reservationId\":\"${RES2_ID}\"}" \
    "{\"name\":\"Title Deed — PH-01\",\"url\":\"https://example.com/docs/title-kr-ph01.pdf\",\"type\":\"application/pdf\",\"sizeBytes\":512000,\"reservationId\":\"${RES2_ID}\"}" \
    "{\"name\":\"Final Payment Receipt — KES 27.5M\",\"url\":\"https://example.com/docs/receipt-final-kr-ph01.pdf\",\"type\":\"application/pdf\",\"sizeBytes\":65536,\"reservationId\":\"${RES2_ID}\"}"; do
    R=$(curl -s -X POST "$API/documents" \
      -H "Authorization: Bearer $INV1_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$doc")
    if [[ "$(extract "$R" "success")" == "True" ]]; then
      ok "POST /documents → $(echo "$doc" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")"
    else
      fail "POST /documents failed | $(extract "$R" "error")"
    fi
  done
fi

# =============================================================================
header "15. ANALYTICS — Track Events"
# =============================================================================

for event in \
  "{\"type\":\"PAGE_VIEW\",\"propertyId\":\"${P1_ID}\",\"source\":\"google\"}" \
  "{\"type\":\"PAGE_VIEW\",\"propertyId\":\"${P1_ID}\",\"source\":\"direct\"}" \
  "{\"type\":\"PAGE_VIEW\",\"propertyId\":\"${P2_ID}\",\"source\":\"facebook\"}" \
  "{\"type\":\"TOUR_START\",\"propertyId\":\"${P1_ID}\"}" \
  "{\"type\":\"TOUR_COMPLETE\",\"propertyId\":\"${P1_ID}\"}" \
  "{\"type\":\"TOUR_START\",\"propertyId\":\"${P2_ID}\"}" \
  "{\"type\":\"UNIT_VIEWED\",\"propertyId\":\"${P1_ID}\"}" \
  "{\"type\":\"PROPERTY_SAVED\",\"propertyId\":\"${P1_ID}\"}" \
  "{\"type\":\"PROPERTY_SAVED\",\"propertyId\":\"${P3_ID}\"}" \
  "{\"type\":\"INQUIRY_SUBMITTED\",\"propertyId\":\"${P1_ID}\"}" \
  "{\"type\":\"BOOKING_SUBMITTED\",\"propertyId\":\"${P1_ID}\"}" \
  "{\"type\":\"PAGE_VIEW\",\"propertyId\":\"${P3_ID}\",\"source\":\"referral\"}" \
  "{\"type\":\"TOUR_START\",\"propertyId\":\"${P3_ID}\"}" \
  "{\"type\":\"PAGE_VIEW\",\"propertyId\":\"${P4_ID}\",\"source\":\"google\"}"; do
  R=$(curl -s -X POST "$API/analytics/track" \
    -H "Content-Type: application/json" \
    -d "$event")
  if [[ "$(extract "$R" "success")" == "True" ]]; then
    ok "POST /analytics/track → $(echo "$event" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['type'])")"
  else
    fail "POST /analytics/track failed | $(extract "$R" "error")"
  fi
done

# =============================================================================
header "16. NOTIFICATIONS — Read Status"
# =============================================================================

# Just check GET works for each user — notifications are auto-created by the system
for token_label in \
  "${DEV1_TOKEN}:developer-1" \
  "${TEN1_TOKEN}:tenant-1" \
  "${INV1_TOKEN}:investor-1"; do
  TOKEN="${token_label%%:*}"
  LABEL="${token_label##*:}"
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/notifications")
  check_ok "GET /notifications ($LABEL)" "$R"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/notifications/unread-count")
  check_ok "GET /notifications/unread-count ($LABEL)" "$R"

  # Mark all read
  R=$(curl -s -X PATCH "$API/notifications/read-all" \
    -H "Authorization: Bearer $TOKEN")
  check_ok "PATCH /notifications/read-all ($LABEL)" "$R"
done

# =============================================================================
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}${BOLD} ✓ All ${TOTAL} operations succeeded — seed complete!${RESET}"
else
  echo -e "${YELLOW}${BOLD} Results: ${TOTAL} operations — ${PASS} passed, ${FAIL} failed${RESET}"
fi
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${CYAN}${BOLD}Test credentials:${RESET}"
echo -e "  Admin      admin@homvr.test / Admin123!"
echo -e "  Developer1 dev1@homvr.test  / DevPass1!"
echo -e "  Developer2 dev2@homvr.test  / DevPass2!"
echo -e "  Investor   investor1@homvr.test / Invest123!"
echo -e "  Tenant1    tenant1@homvr.test / Tenant123!"
echo -e "  Tenant2    tenant2@homvr.test / Tenant456!"
echo ""
echo -e "${CYAN}${BOLD}Properties seeded:${RESET}"
echo -e "  ${P1_SLUG} — Westlands Heights (APARTMENT, ACTIVE, 3D+VR tours)"
echo -e "  ${P2_SLUG} — Kileleshwa Gardens (VILLA, ACTIVE, cinematic tour)"
echo -e "  ${P3_SLUG} — Karen Ridge Penthouses (PENTHOUSE, OFF_PLAN)"
echo -e "  ${P4_SLUG} — Parklands Business Hub (OFFICE, ACTIVE)"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}Failed operations:${RESET}"
  for e in "${ERRORS[@]}"; do echo -e "  ${RED}✗${RESET} $e"; done
  echo ""
  exit 1
fi
