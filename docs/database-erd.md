# Database ER Diagram

Schema snapshot: 2026-08-22 (Asia/Bangkok)

เอกสารนี้สร้างจาก PostgreSQL catalog ของฐานที่รันจริงแบบ read-only:

- `inblackm_system`: 15 base tables
- `topup_inblackm`: 34 base tables
- Saved connections `gameinfo` และ `topup_inblackm` ชี้ไปที่ฐาน `topup_inblackm` เดียวกัน
- รวมฐานจริง 49 ตาราง; `gamedb_cell_notes` เป็นตารางลำดับที่ 50 ที่มี DDL ในโค้ดแต่ยังไม่มีในฐานจริง

## Legend

- `PK` — Primary key จริง
- `FK` — Foreign key constraint จริง
- `UK` — Unique constraint/index จริง; หากเป็น composite key เครื่องหมายจะอยู่ทุกคอลัมน์ในชุด
- `LOGICAL` — แอปเชื่อมข้อมูลด้วย column/JSON/การ JOIN แต่ PostgreSQL ไม่มี FK constraint
- `nullable` / `not null` — nullability จาก schema จริง
- ชื่อคอลัมน์ภาษาไทยใน `pack_list` ใช้ alias ASCII เพื่อให้ Mermaid render ได้ โดยชื่อจริงอยู่ในคำอธิบายของคอลัมน์

## Database overview

```mermaid
flowchart LR
  APP[system.db.inblackm]
  SYSTEM[(inblackm_system<br/>15 tables)]
  TOPUP[(topup_inblackm<br/>34 tables)]
  GAMEINFO[Saved connection: gameinfo]
  ITUNE[Saved connection: topup_inblackm]

  APP --> SYSTEM
  APP --> GAMEINFO
  APP --> ITUNE
  GAMEINFO --> TOPUP
  ITUNE --> TOPUP
  SYSTEM -. "LOGICAL cross-database user/role IDs" .-> TOPUP
```

PostgreSQL ไม่รองรับ FK constraint ข้ามฐานข้อมูล เส้นข้าม `inblackm_system` และ `topup_inblackm` จึงเป็น `LOGICAL` เท่านั้น

## 1. System and queries — `inblackm_system`

```mermaid
erDiagram
  gamedb_connection_flags {
    integer connection_id PK "not null"
    boolean allow_write "not null"
    integer statement_timeout_ms "nullable"
    integer max_rows "nullable"
    timestamptz updated_at "not null"
  }
  gamedb_connections {
    integer id PK "not null"
    varchar_255 name "not null"
    varchar_255 host "not null"
    integer port "not null"
    varchar_255 database "not null"
    varchar_255 username "not null"
    text password_enc "nullable"
    boolean ssl "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamedb_edit_log {
    integer id PK "not null"
    integer query_id "nullable"
    varchar_255 actor "nullable"
    varchar_255 table_name "not null"
    varchar_255 pk_column "not null"
    text pk_value "nullable"
    varchar_255 column_name "not null"
    text old_value "nullable"
    text new_value "nullable"
    timestamptz created_at "not null"
    varchar_64 ip "nullable"
    text user_agent "nullable"
  }
  gamedb_filter_views {
    integer id PK "not null"
    integer query_id "not null"
    varchar_120 name "not null"
    text row_filter "not null"
    jsonb lookup_row_filter "nullable"
    jsonb param_values "not null"
    varchar_255 created_by "nullable"
    timestamptz created_at "not null"
  }
  gamedb_queries {
    integer id PK "not null"
    varchar_255 name "not null"
    text description "nullable"
    text sql_text "not null"
    jsonb layout "not null"
    integer sort_order "not null"
    varchar_255 created_by "nullable"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
    integer connection_id FK "nullable"
  }
  gamedb_shares {
    integer id PK "not null"
    varchar_64 token UK "not null"
    integer query_id FK "not null; partial UK while live"
    varchar_255 created_by "nullable"
    timestamptz created_at "not null"
    timestamptz revoked_at "nullable"
  }
  gamedb_snapshots {
    integer id PK "not null"
    integer query_id "not null"
    varchar_255 name "not null"
    jsonb params "not null"
    jsonb columns "not null"
    jsonb rows "not null"
    integer row_count "not null"
    varchar_255 created_by "nullable"
    timestamptz created_at "not null"
  }
  gamedb_user_layouts {
    integer user_id PK "not null"
    integer query_id PK "not null"
    jsonb layout "not null"
    timestamptz updated_at "not null"
  }
  gamedb_views {
    integer id PK "not null"
    varchar_255 name "not null"
    text description "nullable"
    jsonb config "not null"
    boolean is_public "not null"
    boolean is_default "not null"
    jsonb shared_with "not null"
    varchar_255 created_by "nullable"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
    boolean is_read_only "not null"
    boolean owner_only "not null"
    boolean allow_staff_edit "not null"
    boolean allow_user_edit "not null"
  }

  gamedb_connections |o--o{ gamedb_queries : "FK SET NULL"
  gamedb_queries ||--o{ gamedb_shares : "FK CASCADE"
  gamedb_connections |o--o| gamedb_connection_flags : "LOGICAL id or 0 sentinel"
  gamedb_queries |o--o{ gamedb_edit_log : "LOGICAL query_id"
  gamedb_queries ||--o{ gamedb_filter_views : "LOGICAL query_id"
  gamedb_queries ||--o{ gamedb_snapshots : "LOGICAL query_id"
  gamedb_queries ||--o{ gamedb_user_layouts : "LOGICAL query_id"
```

`gamedb_shares_live_query` เป็น partial unique index บน `query_id` เฉพาะแถวที่ `revoked_at IS NULL`

## 2. Users and permissions — `inblackm_system`

```mermaid
erDiagram
  gamedb_login_log {
    integer id PK "not null"
    varchar_255 username "not null"
    boolean success "not null"
    varchar_255 reason "nullable"
    varchar_64 ip "nullable"
    timestamptz created_at "not null"
    text user_agent "nullable"
  }
  gamedb_permission_migrations {
    varchar_64 key PK "not null"
    timestamptz applied_at "not null"
  }
  gamedb_sso_map {
    integer id PK "not null"
    varchar_255 hiring_email UK "not null"
    varchar_64 gamedb_username "not null"
    timestamptz created_at "not null"
  }
  gamedb_user_permissions {
    integer user_id PK "not null"
    varchar_96 permission_key PK "not null"
    timestamptz updated_at "not null"
  }
  gamedb_user_preferences {
    integer user_id PK "not null"
    integer default_view_id "nullable"
    varchar_16 role_override "nullable"
    timestamptz updated_at "not null"
    varchar_16 projectm_role "nullable"
    integer itune_role_id "nullable"
    boolean can_write_data "not null"
    boolean can_update_data "not null"
    varchar_16 gameinfo_role "nullable"
  }
  gamedb_users {
    integer id PK "not null"
    varchar_64 username UK "not null"
    varchar_255 display_name "nullable"
    text password_hash "not null"
    varchar_16 role "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }

  gamedb_users ||--o| gamedb_user_preferences : "LOGICAL user_id"
  gamedb_users ||--o{ gamedb_user_permissions : "LOGICAL user_id"
  gamedb_users |o--o{ gamedb_login_log : "LOGICAL username"
  gamedb_users |o--o| gamedb_sso_map : "LOGICAL gamedb_username"
```

`gamedb_user_preferences.default_view_id` เชื่อมแบบ `LOGICAL` ไป `gamedb_views.id`

## 3. Game Info — `topup_inblackm`

```mermaid
erDiagram
  game_list {
    bigint id PK "not null"
    smallint rank_stars "not null"
    varchar bot_manual "not null"
    varchar channel "not null"
    varchar region "not null"
    varchar vpn "not null"
    varchar game "not null"
    boolean is_repeatable "not null"
    text link "nullable"
    varchar platform "nullable"
    varchar server "nullable"
    text remark "nullable"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gameinfo_exchange_rates {
    varchar_16 pair PK "not null"
    timestamptz fetched_hour PK "not null"
    numeric rate "not null"
    varchar_80 provider "not null"
    timestamptz fetched_at "not null"
    timestamptz provider_at "nullable"
    timestamptz expires_at "not null"
  }
  gameinfo_mode_data {
    integer game_id PK "not null"
    varchar_16 data_mode PK "not null"
    jsonb data "not null"
    timestamptz updated_at "not null"
  }
  gamelist_favorites {
    text user_id PK "not null"
    integer game_id PK "not null"
    timestamptz created_at "not null"
  }
  gamelist_formula_variable_logs {
    bigint id PK "not null"
    integer game_id "not null"
    integer actor_id "nullable"
    text actor_name "nullable"
    jsonb before_data "nullable"
    jsonb after_data "nullable"
    timestamptz created_at "not null"
  }
  gamelist_formula_variables {
    integer game_id PK "not null"
    jsonb data "not null"
    timestamptz updated_at "not null"
  }
  gamelist_images {
    integer game_id PK "not null"
    text image_url "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_links {
    integer game_id PK "not null"
    jsonb data "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_order {
    integer game_id PK "not null"
    integer sort_order "not null"
    timestamptz updated_at "not null"
  }
  gamelist_reports {
    bigint id PK "not null"
    integer game_id "not null"
    text source "not null"
    text message "not null"
    text status "not null"
    text created_by "not null"
    timestamptz created_at "not null"
    text resolved_by "nullable"
    timestamptz resolved_at "nullable"
  }
  gamelist_service_status {
    integer game_id PK "not null"
    boolean enabled "not null"
    timestamptz updated_at "not null"
    boolean is_new "not null"
  }
  gamelist_tutorials {
    integer game_id PK "not null"
    jsonb data "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
    jsonb warning_data "not null"
  }

  game_list ||--o{ gameinfo_mode_data : "LOGICAL game_id"
  game_list ||--o{ gamelist_favorites : "LOGICAL game_id"
  game_list |o--o| gamelist_formula_variables : "LOGICAL game_id; 0 is global"
  gamelist_formula_variables |o--o{ gamelist_formula_variable_logs : "LOGICAL game_id"
  game_list ||--o| gamelist_images : "LOGICAL game_id"
  game_list ||--o| gamelist_links : "LOGICAL game_id"
  game_list ||--o| gamelist_order : "LOGICAL game_id"
  game_list ||--o{ gamelist_reports : "LOGICAL game_id"
  game_list ||--o| gamelist_service_status : "LOGICAL game_id"
  game_list ||--o| gamelist_tutorials : "LOGICAL game_id"
```

`gamelist_favorites.user_id` เชื่อมข้ามฐานแบบ `LOGICAL` ไปยังผู้ใช้ของ `inblackm_system`

## 4. Packs and catalogs — `topup_inblackm`

```mermaid
erDiagram
  gamelist_pack_audit_logs {
    bigint id PK "not null"
    integer game_id "not null"
    text pack_id "nullable"
    integer actor_id "nullable"
    varchar_255 actor_name "not null"
    varchar_32 action "not null"
    jsonb before_data "nullable"
    jsonb after_data "nullable"
    timestamptz created_at "not null"
    varchar_32 source "not null"
    varchar_32 area "not null"
    varchar_16 data_mode "not null"
  }
  gamelist_pack_languages {
    bigint id PK "not null"
    varchar_80 name "not null"
    varchar_80 normalized_name UK "not null"
    integer created_by "nullable"
    timestamptz created_at "not null"
  }
  gamelist_pack_view_presets {
    bigint id PK "not null"
    integer game_id UK "not null; composite UK"
    integer user_id UK "not null; composite UK"
    varchar_12 surface "not null"
    varchar_80 name UK "not null; composite UK"
    jsonb layout "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_packs {
    integer game_id PK "not null"
    text pack_id PK "not null"
    jsonb data "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_publisher_catalog {
    text publisher_key PK "not null"
    text name "not null"
    text image_url "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_publishers {
    integer game_id PK "not null"
    jsonb data "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_tag_catalog {
    text tag_key PK "not null"
    text name "not null"
    text image_url "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  gamelist_tags {
    integer game_id PK "not null"
    jsonb data "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }

  gamelist_packs |o--o{ gamelist_pack_audit_logs : "LOGICAL game_id and pack_id"
  gamelist_tag_catalog |o--o{ gamelist_tags : "LOGICAL tag keys in JSON"
  gamelist_publisher_catalog |o--o{ gamelist_publishers : "LOGICAL publisher keys in JSON"
```

ความสัมพันธ์ต่อไปนี้อยู่ข้ามกลุ่มในฐานเดียวกันและเป็น `LOGICAL`:

- `game_list.id` → `gamelist_packs.game_id`, `gamelist_pack_audit_logs.game_id`, `gamelist_pack_view_presets.game_id`, `gamelist_tags.game_id`, `gamelist_publishers.game_id`
- `gamedb_users.id` → `gamelist_pack_view_presets.user_id`, `gamelist_pack_languages.created_by`, `gamelist_pack_audit_logs.actor_id` เป็นความสัมพันธ์ข้ามฐาน
- Unique index จริงของ preset คือ `(game_id, user_id, name)`; `surface` ไม่อยู่ใน unique index ของฐานจริง

## 5. iTune queue and logs — `topup_inblackm`

```mermaid
erDiagram
  projectm_itune_admin_log {
    bigint id PK "not null"
    text action "not null"
    integer target_id "nullable"
    jsonb details "not null"
    integer user_id "nullable"
    text username "nullable"
    timestamptz created_at "not null"
    text category "not null"
    integer entry_id "nullable"
    text entry_email "nullable"
    jsonb old_values "nullable"
    jsonb new_values "nullable"
    integer actor_user_id "nullable"
    text actor_username "nullable"
  }
  projectm_itune_amount_log {
    integer id PK "not null"
    integer entry_id "not null"
    text entry_email "nullable"
    numeric_14_2 old_amount "not null"
    numeric_14_2 new_amount "not null"
    integer changed_by_user_id "nullable"
    text changed_by_username "nullable"
    timestamptz changed_at "not null"
    text image "nullable"
  }
  projectm_itune_claim_log {
    integer id PK "not null"
    integer entry_id "not null"
    text entry_email "nullable"
    text action "not null"
    integer user_id "nullable"
    text username "nullable"
    timestamptz created_at "not null"
    integer issue_log_id "nullable"
  }
  projectm_itune_claim_sessions {
    bigint id PK "not null"
    integer entry_id "not null"
    text entry_email "nullable"
    integer user_id "nullable"
    text username "nullable"
    timestamptz claimed_at "not null"
    timestamptz released_at "nullable"
    numeric_14_2 start_amount "not null"
    numeric_14_2 end_amount "nullable"
    numeric_14_2 amount_used "nullable"
    text outcome "nullable"
    text proof_image "nullable"
    text note "nullable"
    timestamptz created_at "not null"
  }
  projectm_itune_entries {
    integer id PK "not null"
    timestamptz added_at "not null"
    date sms_expiry "not null"
    text status "nullable"
    text support "nullable"
    text email "nullable"
    text password "nullable"
    integer created_by_user_id "nullable"
    text currency "nullable"
    text supplier "nullable"
    numeric_14_2 amount "not null"
    text amount_confirm_image "nullable"
    numeric_14_2 amount_out "not null"
    text link_sms "nullable"
    text qna "nullable"
    text other_notes "nullable"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
    integer claimed_by_user_id "nullable"
    timestamptz claimed_at "nullable"
    boolean is_permanent "not null"
    integer priority_order "nullable"
    boolean claim_hold "not null"
    text password_enc "nullable"
    text link_sms_enc "nullable"
    bytea link_sms_bidx "nullable"
    text qna_enc "nullable"
    bigint active_claim_session_id "nullable"
  }
  projectm_itune_entry_log {
    bigint id PK "not null"
    integer entry_id "not null"
    text entry_email "nullable"
    text action "not null"
    jsonb changes "not null"
    integer user_id "nullable"
    text username "nullable"
    timestamptz created_at "not null"
    jsonb old_values "nullable"
    jsonb new_values "nullable"
    integer changed_by_user_id "nullable"
    text changed_by_username "nullable"
    timestamptz changed_at "not null"
  }
  projectm_itune_issue_log {
    integer id PK "not null"
    integer entry_id "not null"
    text entry_email "nullable"
    text note "not null"
    integer reported_by_user_id "nullable"
    text reported_by_username "nullable"
    timestamptz reported_at "not null"
    integer resolved_by_user_id "nullable"
    text resolved_by_username "nullable"
    timestamptz resolved_at "nullable"
    text entry_password "nullable"
    text entry_currency "nullable"
    text entry_supplier "nullable"
    numeric_14_2 entry_amount "nullable"
    text entry_link_sms "nullable"
    text entry_qna "nullable"
    boolean is_reject "not null"
    timestamptz reject_confirmed_at "nullable"
    integer reject_confirmed_by_user_id "nullable"
    text reject_confirmed_by_username "nullable"
  }
  projectm_itune_release_settings {
    integer id PK "not null"
    numeric_14_2 max_amount "not null"
    timestamptz updated_at "not null"
    integer updated_by_user_id "nullable"
    text updated_by_username "nullable"
    boolean claim_paused "not null"
    numeric_14_2 priority_amount_threshold "nullable"
    numeric_8_2 target_hours "nullable"
    numeric_14_2 burn_rate_usd_per_hour "nullable"
    numeric_8_2 expected_idle_hours "nullable"
    numeric_8_2 claim_warning_hours "nullable"
  }
  projectm_itune_roles {
    integer id PK "not null"
    text name "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  projectm_itune_secret_access_log {
    bigint id PK "not null"
    integer entry_id "not null"
    text field "not null"
    text action "not null"
    integer actor_user_id "not null"
    text actor_username "nullable"
    text authorization_context "not null"
    text outcome "not null"
    timestamptz accessed_at "not null"
  }
  projectm_itune_status_rules {
    integer id PK "not null"
    jsonb rules "not null"
    timestamptz updated_at "not null"
    integer updated_by_user_id "nullable"
    text updated_by_username "nullable"
  }

  projectm_itune_entries ||--o{ projectm_itune_entry_log : "LOGICAL entry_id"
  projectm_itune_entries ||--o{ projectm_itune_issue_log : "LOGICAL entry_id"
  projectm_itune_entries ||--o{ projectm_itune_amount_log : "LOGICAL entry_id"
  projectm_itune_entries ||--o{ projectm_itune_claim_log : "LOGICAL entry_id"
  projectm_itune_entries ||--o{ projectm_itune_claim_sessions : "LOGICAL entry_id"
  projectm_itune_entries |o--o{ projectm_itune_admin_log : "LOGICAL entry_id"
  projectm_itune_entries ||--o{ projectm_itune_secret_access_log : "LOGICAL entry_id"
  projectm_itune_issue_log |o--o{ projectm_itune_claim_log : "LOGICAL issue_log_id"
  projectm_itune_claim_sessions |o--o| projectm_itune_entries : "LOGICAL active_claim_session_id"
```

คอลัมน์ `*_user_id`, `actor_user_id`, `created_by_user_id`, `claimed_by_user_id`, `reported_by_user_id`, `resolved_by_user_id` และ `updated_by_user_id` เชื่อมแบบ `LOGICAL` ไป `inblackm_system.gamedb_users.id` ส่วน `gamedb_user_preferences.itune_role_id` เชื่อมแบบ `LOGICAL` ไป `projectm_itune_roles.id`

`projectm_itune_release_settings` และ `projectm_itune_status_rules` เป็น singleton-style settings tables; `projectm_itune_admin_log` มี append-only trigger ใน schema ที่แอปติดตั้ง

## 6. Legacy tables — `topup_inblackm`

```mermaid
erDiagram
  games {
    integer id PK "not null"
    integer order "not null"
    text game_name "not null"
    text region "not null"
    text vpn "not null"
    text web_topup "not null"
    text platform "not null"
    text server "not null"
    text image "not null"
    jsonb currencies "not null"
    jsonb computed_column "nullable"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  game_packs {
    integer game_id PK, FK "not null"
    text pack_id PK "not null"
    jsonb data "not null"
    timestamptz created_at "not null"
    timestamptz updated_at "not null"
  }
  pack_list {
    bigint id "nullable"
    double sell_price "nullable"
    double usdt "nullable"
    double kaleoz "nullable"
    text column_5 "DB: gemที่กด; nullable"
    bigint column_6 "DB: gemรวม; nullable"
    text column_7 "DB: phpที่กด; nullable"
    bigint column_8 "DB: phpรวม; nullable"
    double column_9 "DB: razer_cadที่กด; nullable"
    double column_10 "DB: razer_usdที่กด; nullable"
    text column_11 "DB: ช่องทางหลัก; nullable"
    text column_12 "DB: ช่องทางสำรอง; nullable"
    text country "nullable"
  }

  games ||--o{ game_packs : "FK CASCADE"
```

`pack_list` ไม่มี PK, UK หรือ FK ในฐานจริง

## Physical foreign keys

ฐานจริงมี FK constraints เพียง 3 เส้น:

| Database | From | To | On delete |
|---|---|---|---|
| `inblackm_system` | `gamedb_queries.connection_id` | `gamedb_connections.id` | `SET NULL` |
| `inblackm_system` | `gamedb_shares.query_id` | `gamedb_queries.id` | `CASCADE` |
| `topup_inblackm` | `game_packs.game_id` | `games.id` | `CASCADE` |

## Schema drift

- Live count คือ 49 base tables (15 + 34) ไม่ใช่ 50 ตามจำนวนตั้งต้น
- `gamedb_cell_notes` มี `CREATE TABLE IF NOT EXISTS` ใน `src/server/gamedb-cell-notes.js` แต่ยังไม่มีใน `inblackm_system`
- ตาราง legacy ที่มีในฐานจริงแต่ไม่มี runtime `CREATE TABLE` ปัจจุบัน ได้แก่ `games`, `game_packs`, `projectm_itune_roles`, `projectm_itune_secret_access_log` และ `projectm_itune_status_rules`
- `gamedb_user_preferences.itune_role_id` และ legacy columns บางส่วนใน `projectm_itune_*_log` ยังอยู่ในฐานจริง แม้ runtime DDL ปัจจุบันไม่ได้สร้างคอลัมน์เหล่านี้ตั้งแต่ต้น
- `gamelist_pack_view_presets` ในฐานจริงมี unique index `(game_id, user_id, name)` ซึ่งต่างจาก DDL ปัจจุบันที่ระบุ `(game_id, user_id, surface, name)`

เอกสารนี้ไม่รวม row data, password, encrypted secret หรือ connection host/user ใด ๆ
