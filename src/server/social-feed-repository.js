import pg from "pg";
import { categoryMatchesRules, normalizeRuleTerms } from "@/lib/social-feed-rules";

const { Pool } = pg;
let pool;
let schemaReady;

function getSocialPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: process.env.SOCIAL_FEED_DATABASE || "topup_inblackm",
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return pool;
}

const schemaSql = `
  CREATE TABLE IF NOT EXISTS social_feed_work_leases (
    source_id BIGINT PRIMARY KEY, instance_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS social_feed_categories (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS social_feed_sources (
    id BIGSERIAL PRIMARY KEY, category_id BIGINT NOT NULL REFERENCES social_feed_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL, facebook_url TEXT NOT NULL UNIQUE, facebook_group_id TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE, last_seen_at TIMESTAMPTZ, last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS login_account TEXT NOT NULL DEFAULT '';
  ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'unchecked';
  ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS session_checked_at TIMESTAMPTZ;
  ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS access_note TEXT NOT NULL DEFAULT '';
  ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS platform_account_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE social_feed_sources ADD COLUMN IF NOT EXISTS requires_login BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS social_feed_collector_accounts (
    id BIGSERIAL PRIMARY KEY, instance_id TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
    platform_account_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'unknown',
    enabled BOOLEAN NOT NULL DEFAULT TRUE, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS social_feed_source_account_status (
    source_id BIGINT NOT NULL REFERENCES social_feed_sources(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES social_feed_collector_accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unknown', note TEXT NOT NULL DEFAULT '', checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(source_id,account_id)
  );
  CREATE TABLE IF NOT EXISTS social_feed_rules (
    id BIGSERIAL PRIMARY KEY, category_id BIGINT NOT NULL REFERENCES social_feed_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('all','any','exclude')), terms TEXT[] NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS social_feed_posts (
    id BIGSERIAL PRIMARY KEY, source_id BIGINT NOT NULL REFERENCES social_feed_sources(id) ON DELETE CASCADE,
    external_post_id TEXT NOT NULL, message TEXT NOT NULL, original_url TEXT NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL, ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, external_post_id)
  );
  CREATE INDEX IF NOT EXISTS social_feed_posts_time_idx ON social_feed_posts(posted_at DESC, id DESC);
  ALTER TABLE social_feed_posts ALTER COLUMN posted_at DROP NOT NULL;
  CREATE TABLE IF NOT EXISTS social_feed_post_categories (
    post_id BIGINT NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES social_feed_categories(id) ON DELETE CASCADE,
    PRIMARY KEY(post_id, category_id)
  );
  CREATE TABLE IF NOT EXISTS social_feed_tags (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS social_feed_post_tags (
    post_id BIGINT NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES social_feed_tags(id) ON DELETE CASCADE,
    PRIMARY KEY(post_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS social_feed_saved_posts (
    post_id BIGINT NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(post_id, user_id)
  );
`;

const seedSql = `
  INSERT INTO social_feed_categories(name,sort_order) VALUES
    ('Neverness to Everness',1),('CookieRun Classic',2),('Light and Night',3),('Lineage W',4),
    ('Gangstar Mirage City',5),('Marvel Rivals',6),('JoJo’s Bizarre Adventure Golden Spirit',7),
    ('Yulgang',8),('Petit Planet',9),('Silver Palace',10),('Azur Promilia',11),('ANANTA',12),
    ('Animula Nook',13),('MapleStory Classic World',14)
  ON CONFLICT(name) DO NOTHING;
  INSERT INTO social_feed_sources(category_id,name,facebook_url,facebook_group_id)
  SELECT c.id,v.name,v.url,v.gid FROM (VALUES
    ('Neverness to Everness','Neverness to Everness NTE Thailand','https://www.facebook.com/groups/414272087779283/','414272087779283'),
    ('Neverness to Everness','Neverness to Everness - NTE พูดคุย ซื้อขาย','https://www.facebook.com/groups/617281392243291/','617281392243291'),
    ('Neverness to Everness','Neverness to Everness NTE ซื้อขาย-แลกเปลี่ยน🇹🇭','https://www.facebook.com/groups/933868306215972/','933868306215972'),
    ('Neverness to Everness','Neverness to Everness N.T.E Thailand พูดคุย ซื้อขาย 🇹🇭','https://www.facebook.com/groups/518197783675311/','518197783675311'),
    ('Neverness to Everness','Neverness to Everness - NTE Thailand ซื้อขาย แลกเปลี่ยน','https://www.facebook.com/groups/425402798562776/','425402798562776'),
    ('CookieRun Classic','CookieRun Classic Thailand Community','https://www.facebook.com/groups/1923737701844238/','1923737701844238'),
    ('CookieRun Classic','CookieRun Classic Thailand พูดคุย ซื้อขาย','https://www.facebook.com/groups/1016812777598675/about','1016812777598675'),
    ('CookieRun Classic','CookieRun Classic Thailand Infinity สังคมคนสายฟาร์ม','https://www.facebook.com/groups/231195153743112/about','231195153743112'),
    ('CookieRun Classic','CookieRun Classic : Family Thailand','https://www.facebook.com/groups/4002684826698372/about','4002684826698372'),
    ('CookieRun Classic','CookieRun Classic คุกกี้รันคลาสสิค อัพเดทข่าวสาร+พูดคุย+ซื้อขาย TH 🇹🇭⚔️','https://www.facebook.com/groups/476937407848395/about','476937407848395'),
    ('CookieRun Classic','Cookie Run Classic ThaiLand','https://www.facebook.com/groups/1500388064401255/about','1500388064401255'),
    ('Light and Night','Light and Night - ชมรมดีไซเนอร์ - กลุ่มออฟฟิเชียล','https://www.facebook.com/groups/1434248664920358','1434248664920358'),
    ('Light and Night','Light and Night TH Community 🌙','https://www.facebook.com/groups/1678836633288770','1678836633288770')
    ,('Lineage W','Lineage W Thailand Official','https://www.facebook.com/groups/lineagew.th/','lineagew.th')
    ,('Lineage W','Lineage W (กลุ่มซื้อขาย/พูดคุย/แลกเปลี่ยน)','https://www.facebook.com/groups/1761641817978633/','1761641817978633')
    ,('Gangstar Mirage City','Gangstar Mirage City Thailand Official','https://www.facebook.com/groups/gangstarmcth/about','gangstarmcth')
    ,('Gangstar Mirage City','Gangstar Mirage City Thailand พูดคุย ซื้อขาย','https://www.facebook.com/groups/478490952955117/about','478490952955117')
    ,('Gangstar Mirage City','Gangstar Mirage City Thailand กลุ่มผู้เล่นคนไทย','https://www.facebook.com/groups/963468448130704/about','963468448130704')
    ,('Gangstar Mirage City','Gangstar Mirage City Thailand ( SEA ) พูดคุย ซื้อขาย แลกเปลี่ยน','https://www.facebook.com/groups/1055847651695176/about','1055847651695176')
    ,('Gangstar Mirage City','Gangstar Mirage CITY ซื้อขาย - พูดคุย','https://www.facebook.com/groups/526249674465851/about','526249674465851')
    ,('Marvel Rivals','Marvel Rivals Thailand Community','https://www.facebook.com/groups/marvelrivalsthailandcommunity/about','marvelrivalsthailandcommunity')
    ,('Marvel Rivals','Marvel Rivals Thailand Marketplace','https://www.facebook.com/groups/marvelrivalsthaimarketplace/about','marvelrivalsthaimarketplace')
    ,('Marvel Rivals','Marvel Rivals Thailand [ ซื้อขาย - แลกเปลี่ยน ]','https://www.facebook.com/groups/marvelrivalsmarket/','marvelrivalsmarket')
    ,('Marvel Rivals','Marvel Rivals Thailand','https://www.facebook.com/groups/marvelrivalsthailandd/','marvelrivalsthailandd')
    ,('Marvel Rivals','Marvel Rival TH (พูดคุยซื้อ-ขาย)','https://www.facebook.com/groups/572922525361325/','572922525361325')
    ,('JoJo’s Bizarre Adventure Golden Spirit','JoJo’s Bizarre Adventure Golden Spirit [โจโจ้] กลุ่มคนไทย Thailand 🇹🇭 💥','https://www.facebook.com/groups/318905500488469/about','318905500488469')
    ,('JoJo’s Bizarre Adventure Golden Spirit','JoJo Bizarre Adventure Thailand พูดคุย-ซื้อขาย','https://www.facebook.com/groups/582132906659836/about','582132906659836')
    ,('JoJo’s Bizarre Adventure Golden Spirit','JoJo ซื้อ,ขาย,สะสม Figure Sas Sl','https://www.facebook.com/groups/777523929109356/','777523929109356')
    ,('JoJo’s Bizarre Adventure Golden Spirit','JoJo’s Bizarre Adventure: Golden Spirit พูดคุย ซื้อขาย','https://www.facebook.com/groups/1281225385844774/','1281225385844774')
    ,('Yulgang','กลุ่มทางการ Yulgang:ยุทธภพสนุก','https://www.facebook.com/groups/877664901512112/','877664901512112')
    ,('Yulgang','Yulgang W: โลกโยกังใหม่','https://www.facebook.com/groups/297280407053408/about','297280407053408')
    ,('Yulgang','Yulgang:ยุทธภพสนุก X Yulgang W','https://www.facebook.com/groups/snookkiddinggame/about','snookkiddinggame')
    ,('Yulgang','Yulgang Thailand Community','https://www.facebook.com/groups/633204573718114/','633204573718114')
    ,('Yulgang','Yulgang W: โลกโยกังใหม่ Thailand พูดคุย-ซื้อขายทั่วโลก(FastlaneLV)','https://www.facebook.com/groups/866311771720582/','866311771720582')
    ,('Yulgang','Yulgang: ยุทธภพสนุก Thailand พูดคุย ซื้อขาย แลกเปลี่ยน','https://www.facebook.com/groups/1283990985968844/','1283990985968844')
    ,('Yulgang','Yulgang W: โลกโยกังใหม่ Thailand🇹🇭 Community 💥','https://www.facebook.com/groups/310217680232780/','310217680232780')
    ,('Yulgang','Yulgang W กลุ่มพูดคุยเซิร์ฟไทย ( กลุ่มคนไทย )','https://www.facebook.com/groups/477704268354631/','477704268354631')
    ,('Yulgang','Yulgang W : โลกโยกังใหม่ ซื้อขาย แลกเปลี่ยน พูดคุย','https://www.facebook.com/groups/194021220698215/','194021220698215')
    ,('Yulgang','Yulgang W ไทย(ของแทร่)⚡️พูดคุย ซื้อขาย แลกเปลี่ยน(แอดเบส)','https://www.facebook.com/groups/864046295178908/','864046295178908')
    ,('Petit Planet','Petit Planet Thailand Community','https://www.facebook.com/groups/2438981359896396/about','2438981359896396')
    ,('Petit Planet','Petit Planet กลุ่มพูดคุยคนไทย','https://www.facebook.com/groups/809985948743571/about','809985948743571')
    ,('Petit Planet','Petit Planet Thailand','https://www.facebook.com/groups/1517856661849480/about','1517856661849480')
    ,('Petit Planet','Petit Planet Thailand กลุ่มคนไทย','https://www.facebook.com/groups/196659795455369/about','196659795455369')
    ,('Petit Planet','Petit Planet Thailand Community พูดคุย ซื้อขาย กลุ่มคนไทย','https://www.facebook.com/groups/1581771539320708/about','1581771539320708')
    ,('Petit Planet','Petit Planet Thailand พูดคุย','https://www.facebook.com/groups/1257240161777744/about','1257240161777744')
    ,('Petit Planet','Petit Planet กลุ่มผู้เล่นคนไทย 🇹🇭✨','https://www.facebook.com/groups/609882599187813/about','609882599187813')
    ,('Petit Planet','Petit Planet - Thailand (ไทย)','https://www.facebook.com/groups/669037316240282/','669037316240282')
    ,('Petit Planet','Petit Planet 🇹🇭กลุ่มคนไทย💥','https://www.facebook.com/groups/800338830051069/','800338830051069')
    ,('Petit Planet','Petit Planet 💥กลุ่มสำหรับคนไทย🇹🇭','https://www.facebook.com/groups/1335404753775723/','1335404753775723')
    ,('Silver Palace','Silver Palace | TH คอมมูนิตี้ พูดคุย หาเพื่อนเล่น แชร์ข้อมูล','https://www.facebook.com/groups/1440748763749525/','1440748763749525')
    ,('Silver Palace','Silver Palace Thailand 🇹🇭 พูดคุย ซื้อขาย แลกเปลี่ยน','https://www.facebook.com/groups/1199616331620303/','1199616331620303')
    ,('Silver Palace','Silver Palace Thailand พูดคุยซื้อขาย','https://www.facebook.com/groups/astronomia.brasil.enigmas','astronomia.brasil.enigmas')
    ,('Silver Palace','Silver Palace Thailand','https://www.facebook.com/groups/941677328633277/','941677328633277')
    ,('Silver Palace','Silver Palace TH กลุ่มสำหรับคนไทย🇹🇭','https://www.facebook.com/groups/3316579448373294/','3316579448373294')
    ,('Silver Palace','Silver Palace Thailand Community - กลุ่มผู้เล่นไทย','https://www.facebook.com/groups/2228493587574036/','2228493587574036')
    ,('Silver Palace','Silver Palace Thailand Community','https://www.facebook.com/groups/2063033291763906/','2063033291763906')
    ,('Silver Palace','Silver Palace Thailand พูดคุย ซื้อขาย','https://www.facebook.com/groups/1422483853118774/','1422483853118774')
    ,('Silver Palace','Silver Palace [SP] กลุ่มผู้เล่นไทย Thailand 🇹🇭 💥','https://www.facebook.com/groups/1326713434849965/','1326713434849965')
    ,('Azur Promilia','Azur Promilia ข่าวสาร พูดคุย TH','https://www.facebook.com/groups/2378649879283926','2378649879283926')
    ,('Azur Promilia','Azur Promilia Community','https://www.facebook.com/groups/3220346201502211/about','3220346201502211')
    ,('Azur Promilia','Azur Promilia คนไทย💜','https://www.facebook.com/groups/thaithai/about','thaithai')
    ,('Azur Promilia','Azur Promilia กลุ่ม สำหรับคนไทย 🇹🇭🇹🇭','https://www.facebook.com/groups/879961319600139/about','879961319600139')
    ,('Azur Promilia','Azur Promilia (Global) กลุ่มผู้เล่นไทย','https://www.facebook.com/groups/395120316564555/about','395120316564555')
    ,('Azur Promilia','Azur Promilia Thailand พูดคุย ซื้อขาย','https://www.facebook.com/groups/1366329835624795/about','1366329835624795')
    ,('Azur Promilia','Azur Promilia พูดคุย ซื้อขาย 🇹🇭💯','https://www.facebook.com/groups/779075234106283/about','779075234106283')
    ,('ANANTA','ANANTA THAILAND','https://www.facebook.com/groups/1864275091102322/about','1864275091102322')
    ,('ANANTA','ANANTA : Thailand (ไทย)','https://www.facebook.com/groups/1244449906612579/about','1244449906612579')
    ,('ANANTA','ANANTA กลุ่มผู้เล่นไทย Thailand 🇹🇭 💥','https://www.facebook.com/groups/772249140569779/about','772249140569779')
    ,('ANANTA','Ananta Thailand Community','https://www.facebook.com/groups/958379027060721/about','958379027060721')
    ,('ANANTA','Ananta THAILAND 🇹🇭✨','https://www.facebook.com/groups/2201339183773089/about','2201339183773089')
    ,('ANANTA','Ananta Thailand พูดคุย ซื้อขาย-เเลกเปลี่ยน','https://www.facebook.com/groups/1096438688261641/','1096438688261641')
    ,('Animula Nook','Animula Nook Thailand Community','https://www.facebook.com/groups/1734709991280989/about','1734709991280989')
    ,('Animula Nook','Animula Nook 🇹🇭🦉','https://www.facebook.com/groups/3745004222216872/about','3745004222216872')
    ,('Animula Nook','Animula Nook Thailand กลุ่มผู้เล่นคนไทย','https://www.facebook.com/groups/fragpunkthailand/about','fragpunkthailand')
    ,('Animula Nook','Animula Nook Community กลุ่มพูดคุยผู้เล่นคนไทย🇹🇭','https://www.facebook.com/groups/703633548080172/about','703633548080172')
    ,('Animula Nook','Animula Nook Thailand กลุ่มผู้เล่นไทย','https://www.facebook.com/groups/516808099465868/about','516808099465868')
    ,('Animula Nook','Animula Nook - Thailand Community','https://www.facebook.com/groups/1390512556182382/','1390512556182382')
    ,('Animula Nook','Animula Nook TH Community','https://www.facebook.com/groups/1472581481209293/','1472581481209293')
    ,('Animula Nook','Animula Nook Community','https://www.facebook.com/groups/1813871656655299/about','1813871656655299')
    ,('Animula Nook','Animula Nook Thailand ชุมชนคนตัวจิ๋ว','https://www.facebook.com/groups/1463633151955983/','1463633151955983')
    ,('Animula Nook','Animula Nook Talk & Trade TH community','https://www.facebook.com/groups/1231366255816934/','1231366255816934')
    ,('MapleStory Classic World','MapleStory Classic World Thailand','https://www.facebook.com/groups/1464880627539200/about','1464880627539200')
    ,('MapleStory Classic World','MapleStory Classic World TH Community','https://www.facebook.com/groups/869032788171097/about','869032788171097')
    ,('MapleStory Classic World','Maplestory Classic world ซื้อ-ขาย','https://www.facebook.com/groups/riseofstarsthailand/about','riseofstarsthailand')
    ,('MapleStory Classic World','Maplestory Classic World TH','https://www.facebook.com/groups/1618645192114562/','1618645192114562')
    ,('MapleStory Classic World','MapleStory Classic World + NFT Thailand ตลาดพูดคุย-ซื้อขาย (FastlaneLV)','https://www.facebook.com/groups/1006125957157207/about','1006125957157207')
    ,('MapleStory Classic World','Maplestory Classic World [TH]','https://www.facebook.com/groups/1487123340125034/','1487123340125034')
  ) AS v(category,name,url,gid) JOIN social_feed_categories c ON c.name=v.category
  ON CONFLICT DO NOTHING;
  INSERT INTO social_feed_rules(category_id,name,mode,terms)
  SELECT c.id,v.rule_name,v.mode,v.terms FROM (VALUES
    ('Neverness to Everness','มีทั้งคำว่า เติม และ เกม','all',ARRAY['เติม','เกม']::text[]),
    ('Neverness to Everness','เจอคำซื้อขาย','any',ARRAY['ซื้อ','ขาย','ไอดี']::text[]),
    ('CookieRun Classic','คำที่เกี่ยวกับ CookieRun','any',ARRAY['คุกกี้','cookierun','cookie run']::text[]),
    ('Light and Night','คำที่เกี่ยวกับ Light and Night','any',ARRAY['light and night','ดีไซเนอร์']::text[]),
    ('Lineage W','คำที่เกี่ยวกับ Lineage W','any',ARRAY['lineage w','ไลน์เอจ']::text[])
  ) AS v(category,rule_name,mode,terms) JOIN social_feed_categories c ON c.name=v.category
  WHERE NOT EXISTS (SELECT 1 FROM social_feed_rules r WHERE r.category_id=c.id AND r.name=v.rule_name);
  INSERT INTO social_feed_posts(source_id,external_post_id,message,original_url,posted_at)
  SELECT s.id,v.pid,v.message,s.facebook_url,NOW()-v.age FROM (VALUES
    ('414272087779283','demo-nte-1','ตามหาเพื่อนเล่น NTE และร้านเติมเกมที่ไว้ใจได้ครับ',interval '8 minutes'),
    ('617281392243291','demo-nte-2','ขายไอดีเริ่มต้น Neverness to Everness สนใจทักได้เลย',interval '24 minutes'),
    ('1923737701844238','demo-cookie-1','CookieRun Classic เปิดกิจกรรมใหม่ ใครกำลังฟาร์มมาคุยกันครับ',interval '38 minutes'),
    ('476937407848395','demo-cookie-2','คุกกี้รันคลาสสิค อัปเดตข่าวสารแพตช์ล่าสุดแล้ว',interval '1 hour'),
    ('1434248664920358','demo-ln-1','Light and Night ชมรมดีไซเนอร์เปิดรับสมาชิกใหม่',interval '2 hours')
  ) AS v(gid,pid,message,age) JOIN social_feed_sources s ON s.facebook_group_id=v.gid
  ON CONFLICT(source_id,external_post_id) DO NOTHING;
  INSERT INTO social_feed_post_categories(post_id,category_id)
  SELECT p.id,s.category_id FROM social_feed_posts p JOIN social_feed_sources s ON s.id=p.source_id
  WHERE p.external_post_id LIKE 'demo-%' ON CONFLICT DO NOTHING;
`;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getSocialPool().query(schemaSql).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function seedSocialFeedDefaults() {
  await ensureSchema();
  await getSocialPool().query(seedSql);
}

function mapCategory(row) {
  return { id: String(row.id), name: row.name, sortOrder: row.sort_order };
}

function validDateFilter(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export async function getSocialFeedState(userId, filters = {}) {
  await ensureSchema();
  const db = getSocialPool();
  const [categoriesResult, sourcesResult, rulesResult, tagsResult, accountsResult, assignmentsResult] = await Promise.all([
    db.query(`SELECT * FROM social_feed_categories ORDER BY sort_order, id`),
    db.query(`SELECT * FROM social_feed_sources ORDER BY category_id, id`),
    db.query(`SELECT * FROM social_feed_rules ORDER BY category_id, id`),
    db.query(`SELECT t.*, COUNT(pt.post_id)::int AS count FROM social_feed_tags t LEFT JOIN social_feed_post_tags pt ON pt.tag_id=t.id GROUP BY t.id ORDER BY t.name`),
    db.query(`SELECT a.*,COUNT(sas.source_id)::int AS checked_sources FROM social_feed_collector_accounts a LEFT JOIN social_feed_source_account_status sas ON sas.account_id=a.id WHERE a.enabled=TRUE GROUP BY a.id ORDER BY a.id`),
    db.query(`WITH active AS (SELECT id,row_number() OVER(ORDER BY id)-1 AS slot,count(*) OVER() AS total FROM social_feed_collector_accounts WHERE enabled=TRUE AND status='ready' AND last_seen_at>NOW()-INTERVAL '10 minutes'), eligible AS (SELECT s.id AS source_id,s.name,s.facebook_url,a.id AS account_id,row_number() OVER(PARTITION BY s.id ORDER BY mod(a.slot-mod(s.id-1,a.total)+a.total,a.total)) AS choice FROM social_feed_sources s CROSS JOIN active a LEFT JOIN social_feed_source_account_status sas ON sas.source_id=s.id AND sas.account_id=a.id WHERE s.enabled=TRUE AND COALESCE(sas.status,'') NOT IN ('needs_join','checkpoint','logged_out')) SELECT account_id,COUNT(*)::int AS source_count,COALESCE(jsonb_agg(jsonb_build_object('id',source_id::text,'name',name,'url',facebook_url) ORDER BY source_id),'[]') AS sources FROM eligible WHERE choice=1 GROUP BY account_id`),
  ]);
  const assignmentByAccount = new Map(assignmentsResult.rows.map((row) => [String(row.account_id), { count: row.source_count, sources: row.sources }]));
  const accounts = accountsResult.rows.map((row) => {
    const status = row.status === "ready" && Date.now() - new Date(row.last_seen_at).getTime() > 10 * 60 * 1000 ? "offline" : row.status;
    const assignment = assignmentByAccount.get(String(row.id)) || { count: 0, sources: [] };
    return { id: String(row.id), instanceId: row.instance_id, label: row.label, platformAccountId: row.platform_account_id, status, lastSeenAt: row.last_seen_at, sessionCheckedAt: row.session_checked_at, checkedSources: row.checked_sources, assignedSourceCount: assignment.count, assignedSources: assignment.sources };
  });
  const activeCollectorCount = accounts.filter((account) => account.status === "ready").length;
  const enabledSourceCount = sourcesResult.rows.filter((source) => source.enabled).length;
  const sourcesPerCollector = activeCollectorCount ? Math.ceil(enabledSourceCount / activeCollectorCount) : enabledSourceCount;
  const riskLevel = !activeCollectorCount ? "offline" : sourcesPerCollector <= 10 ? "low" : sourcesPerCollector <= 25 ? "medium" : "high";
  const values = [String(userId)];
  const where = [];
  if (filters.categoryId) { values.push(filters.categoryId); where.push(`s.category_id = $${values.length}`); }
  if (filters.tagId) { values.push(filters.tagId); where.push(`EXISTS (SELECT 1 FROM social_feed_post_tags x WHERE x.post_id=p.id AND x.tag_id=$${values.length})`); }
  if (filters.saved === "true") where.push(`sp.post_id IS NOT NULL`);
  if (filters.q) { values.push(`%${String(filters.q).slice(0, 120)}%`); where.push(`p.message ILIKE $${values.length}`); }
  if (validDateFilter(filters.dateFrom)) { values.push(filters.dateFrom); where.push(`p.posted_at >= ($${values.length}::date AT TIME ZONE 'Asia/Bangkok')`); }
  if (validDateFilter(filters.dateTo)) { values.push(filters.dateTo); where.push(`p.posted_at < (($${values.length}::date + 1) AT TIME ZONE 'Asia/Bangkok')`); }
  const requestedPage = Number.parseInt(filters.page, 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = ["20", "50", "100", "all"].includes(String(filters.pageSize)) ? String(filters.pageSize) : "20";
  const countValues = [...values];
  const countSql = `SELECT COUNT(*)::int AS count FROM social_feed_posts p JOIN social_feed_sources s ON s.id=p.source_id LEFT JOIN social_feed_saved_posts sp ON sp.post_id=p.id AND sp.user_id=$1 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  let pagingSql = "";
  if (pageSize !== "all") {
    values.push(Number(pageSize), (page - 1) * Number(pageSize));
    pagingSql = `LIMIT $${values.length - 1} OFFSET $${values.length}`;
  }
  const [postsResult, countResult] = await Promise.all([db.query(`
    SELECT p.*, s.name AS source_name, s.facebook_url AS source_url, sp.post_id IS NOT NULL AS saved,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',t.id::text,'name',t.name)) FILTER (WHERE t.id IS NOT NULL),'[]') AS tags
    FROM social_feed_posts p
    JOIN social_feed_sources s ON s.id=p.source_id

    LEFT JOIN social_feed_saved_posts sp ON sp.post_id=p.id AND sp.user_id=$1
    LEFT JOIN social_feed_post_tags pt ON pt.post_id=p.id LEFT JOIN social_feed_tags t ON t.id=pt.tag_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY p.id,s.id,sp.post_id ORDER BY p.posted_at DESC NULLS LAST,p.id DESC ${pagingSql}`, values), db.query(countSql, countValues)]);
  const totalPosts = countResult.rows[0]?.count || 0;
  return {
    categories: categoriesResult.rows.map(mapCategory),
    sources: sourcesResult.rows.map((row) => ({ id: String(row.id), categoryId: String(row.category_id), name: row.name, url: row.facebook_url, groupId: row.facebook_group_id, enabled: row.enabled, lastSeenAt: row.last_seen_at, lastError: row.last_error, requiresLogin: row.requires_login, accessStatus: row.access_status, sessionCheckedAt: row.session_checked_at, accessNote: row.access_note })),
    rules: rulesResult.rows.map((row) => ({ id: String(row.id), categoryId: String(row.category_id), name: row.name, mode: row.mode, terms: row.terms, enabled: row.enabled })),
    tags: tagsResult.rows.map((row) => ({ id: String(row.id), name: row.name, count: row.count })),
    accounts,
    collectorSummary: { activeCollectorCount, enabledSourceCount, sourcesPerCollector, riskLevel },
    posts: postsResult.rows.map((row) => ({ id: String(row.id), sourceId: String(row.source_id), sourceName: row.source_name, message: row.message, originalUrl: row.original_url, postedAt: row.posted_at, ingestedAt: row.ingested_at, saved: row.saved, tags: row.tags })),
    pagination: { page: pageSize === "all" ? 1 : page, pageSize, total: totalPosts, totalPages: pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalPosts / Number(pageSize))) },
    refreshedAt: new Date().toISOString(),
  };
}

export async function saveSocialRule(input) {
  await ensureSchema();
  const terms = normalizeRuleTerms(input.terms);
  if (!input.categoryId || !String(input.name || "").trim() || !terms.length || !["all", "any", "exclude"].includes(input.mode)) {
    const error = new Error("ข้อมูล rule ไม่ครบ"); error.status = 400; throw error;
  }
  const result = await getSocialPool().query(`INSERT INTO social_feed_rules(category_id,name,mode,terms,enabled) VALUES($1,$2,$3,$4,$5) RETURNING *`, [input.categoryId, String(input.name).trim().slice(0, 100), input.mode, terms, input.enabled !== false]);
  await reclassifyCategory(input.categoryId);
  return result.rows[0];
}

export async function deleteSocialRule(id) {
  await ensureSchema();
  const result = await getSocialPool().query(`DELETE FROM social_feed_rules WHERE id=$1 RETURNING category_id`, [id]);
  if (result.rows[0]) await reclassifyCategory(result.rows[0].category_id);
}

export async function deleteAllSocialPosts() {
  await ensureSchema();
  const result = await getSocialPool().query(`WITH deleted AS (DELETE FROM social_feed_posts RETURNING 1) SELECT COUNT(*)::int AS count FROM deleted`);
  return result.rows[0]?.count || 0;
}

export async function createSocialCategory(name) {
  await ensureSchema();
  const clean = String(name || "").trim().slice(0, 100);
  if (!clean) { const error = new Error("กรุณาใส่ชื่อหมวดหมู่"); error.status = 400; throw error; }
  const duplicate = await getSocialPool().query(`SELECT 1 FROM social_feed_categories WHERE lower(name)=lower($1)`, [clean]);
  if (duplicate.rowCount) { const error = new Error("มีหมวดหมู่นี้แล้ว"); error.status = 409; throw error; }
  const result = await getSocialPool().query(`INSERT INTO social_feed_categories(name,sort_order) VALUES($1,COALESCE((SELECT MAX(sort_order)+1 FROM social_feed_categories),1)) RETURNING *`, [clean]);
  return mapCategory(result.rows[0]);
}

export async function deleteSocialCategory(id) {
  await ensureSchema();
  const categoryId = String(id || "").trim();
  if (!/^\d+$/.test(categoryId)) { const error = new Error("รหัสหมวดหมู่ไม่ถูกต้อง"); error.status = 400; throw error; }
  const result = await getSocialPool().query(`DELETE FROM social_feed_categories WHERE id=$1 RETURNING 1`, [categoryId]);
  if (!result.rowCount) { const error = new Error("ไม่พบหมวดหมู่"); error.status = 404; throw error; }
  return result.rowCount;
}

export async function createSocialSource({ categoryId, name, facebookUrl }) {

  await ensureSchema();
  const cleanName = String(name || "").trim().slice(0, 180);
  let parsed;
  try { parsed = new URL(String(facebookUrl || "").trim()); } catch {}
  const groupId = parsed?.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)/)?.[1] || "";
  if (!categoryId || !cleanName || parsed?.protocol !== "https:" || !/(^|\.)facebook\.com$/i.test(parsed.hostname) || !groupId) {
    const error = new Error("กรุณาใส่ชื่อและลิงก์ Facebook Group ที่ถูกต้อง"); error.status = 400; throw error;
  }
  const canonicalUrl = `https://www.facebook.com/groups/${groupId}/`;
  try {
    const result = await getSocialPool().query(`INSERT INTO social_feed_sources(category_id,name,facebook_url,facebook_group_id) VALUES($1,$2,$3,$4) RETURNING *`, [categoryId, cleanName, canonicalUrl, groupId]);
    return { id: String(result.rows[0].id), categoryId: String(result.rows[0].category_id), name: result.rows[0].name, url: result.rows[0].facebook_url, groupId };
  } catch (error) {
    if (error.code === "23505") { error.message = "กลุ่ม Facebook นี้มีอยู่แล้ว"; error.status = 409; }
    throw error;
  }
}

export async function deleteSocialSources(id = "") {
  await ensureSchema();
  const sourceId = String(id || "").trim();
  if (sourceId && !/^\d+$/.test(sourceId)) { const error = new Error("รหัสกลุ่มไม่ถูกต้อง"); error.status = 400; throw error; }
  const result = sourceId
    ? await getSocialPool().query(`DELETE FROM social_feed_sources WHERE id=$1 RETURNING 1`, [sourceId])
    : await getSocialPool().query(`DELETE FROM social_feed_categories RETURNING 1`);
  if (sourceId && !result.rowCount) { const error = new Error("ไม่พบกลุ่ม Facebook"); error.status = 404; throw error; }
  return result.rowCount;
}

export async function heartbeatCollectorAccount({ instanceId, label, platformAccountId, status, activate = false }) {
  await ensureSchema();
  const cleanInstance = String(instanceId || "").trim().slice(0, 100);
  const cleanLabel = String(label || "").trim().slice(0, 100);
  if (!cleanInstance || !cleanLabel) { const error = new Error("ข้อมูล Chrome profile ไม่ครบ"); error.status = 400; throw error; }
  const allowed = ["ready", "logged_out", "checkpoint", "offline", "unknown"];
  const cleanStatus = allowed.includes(status) ? status : "unknown";
  const result = await getSocialPool().query(`INSERT INTO social_feed_collector_accounts(instance_id,label,platform_account_id,status,enabled,last_seen_at,session_checked_at) VALUES($1,$2,$3,$4,TRUE,NOW(),NOW()) ON CONFLICT(instance_id) DO UPDATE SET label=EXCLUDED.label,platform_account_id=CASE WHEN EXCLUDED.platform_account_id<>'' THEN EXCLUDED.platform_account_id ELSE social_feed_collector_accounts.platform_account_id END,status=EXCLUDED.status,last_seen_at=NOW(),session_checked_at=NOW(),enabled=CASE WHEN $5 THEN TRUE ELSE social_feed_collector_accounts.enabled END,updated_at=NOW() RETURNING id,enabled`, [cleanInstance, cleanLabel, String(platformAccountId || "").replace(/\D/g, "").slice(0, 40), cleanStatus, Boolean(activate)]);
  return { id: String(result.rows[0].id), enabled: result.rows[0].enabled };
}

export async function listCollectorSources(instanceId, publicOnly = false) {
  await ensureSchema();
  if (publicOnly) {
    const error = new Error("กรุณาอัปเดต Extension เพื่อใช้คิวกลาง"); error.status = 426; throw error;
  }
  const account = await getSocialPool().query(`SELECT id FROM social_feed_collector_accounts WHERE instance_id=$1 AND enabled=TRUE AND status='ready' AND last_seen_at>NOW()-INTERVAL '10 minutes'`, [String(instanceId || "").trim()]);
  if (!account.rowCount) return [];
  const result = await getSocialPool().query(`WITH active AS (SELECT id,row_number() OVER(ORDER BY id)-1 AS slot,count(*) OVER() AS total FROM social_feed_collector_accounts WHERE enabled=TRUE AND status='ready' AND last_seen_at>NOW()-INTERVAL '10 minutes'), eligible AS (SELECT s.id,s.name,s.facebook_url,s.facebook_group_id,s.requires_login,a.id AS account_id,row_number() OVER(PARTITION BY s.id ORDER BY mod(a.slot-mod(s.id-1,a.total)+a.total,a.total)) AS choice FROM social_feed_sources s CROSS JOIN active a LEFT JOIN social_feed_source_account_status sas ON sas.source_id=s.id AND sas.account_id=a.id WHERE s.enabled=TRUE AND COALESCE(sas.status,'') NOT IN ('needs_join','checkpoint','logged_out')) SELECT id,name,facebook_url,facebook_group_id,requires_login FROM eligible WHERE choice=1 AND account_id=$1 ORDER BY id`, [account.rows[0].id]);
  return result.rows.map((row) => ({ id: String(row.id), name: row.name, url: row.facebook_url, groupId: row.facebook_group_id, requiresLogin: row.requires_login }));
}

export async function updateCollectorSourceStatus({ sourceId, instanceId, status, note }) {
  await ensureSchema();
  const allowed = ["ready", "logged_out", "needs_join", "checkpoint", "unknown", "error"];
  const cleanStatus = allowed.includes(status) ? status : "unknown";
  const account = await getSocialPool().query(`SELECT id FROM social_feed_collector_accounts WHERE instance_id=$1 AND enabled=TRUE`, [String(instanceId || "").trim()]);
  if (!account.rowCount) {
    await getSocialPool().query(`UPDATE social_feed_sources SET access_status=$2,access_note=$3,session_checked_at=NOW(),updated_at=NOW() WHERE id=$1`, [sourceId, cleanStatus, String(note || "").slice(0, 500)]);
    return;
  }
  await getSocialPool().query(`INSERT INTO social_feed_source_account_status(source_id,account_id,status,note,checked_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(source_id,account_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,checked_at=NOW()`, [sourceId, account.rows[0].id, cleanStatus, String(note || "").slice(0, 500)]);
  await getSocialPool().query(`UPDATE social_feed_sources SET access_status=$2,access_note=$3,session_checked_at=NOW(),updated_at=NOW() WHERE id=$1`, [sourceId, cleanStatus, String(note || "").slice(0, 500)]);
}

export async function claimSocialSource({ sourceId, instanceId }) {
  await ensureSchema();
  if (!/^[1-9]\d*$/.test(String(sourceId || "")) || !String(instanceId || "").trim()) {
    const error = new Error("ข้อมูลคิวไม่ครบ"); error.status = 400; throw error;
  }
  const result = await getSocialPool().query(`INSERT INTO social_feed_work_leases(source_id,instance_id,expires_at)
    SELECT s.id,$2,NOW()+INTERVAL '2 minutes' FROM social_feed_sources s
    WHERE s.id=$1 AND s.enabled=TRUE AND EXISTS (SELECT 1 FROM social_feed_collector_accounts a WHERE a.instance_id=$2 AND a.enabled=TRUE AND a.status='ready')
    ON CONFLICT(source_id) DO UPDATE SET instance_id=EXCLUDED.instance_id,expires_at=EXCLUDED.expires_at
    WHERE social_feed_work_leases.expires_at<=NOW() RETURNING source_id`, [sourceId, instanceId]);
  return result.rowCount > 0;
}

export async function finishSocialSource({ sourceId, instanceId, status }) {
  await ensureSchema();
  await getSocialPool().query(`UPDATE social_feed_work_leases SET expires_at=NOW()+CASE WHEN $3='ready' THEN INTERVAL '5 minutes' ELSE INTERVAL '0 seconds' END WHERE source_id=$1 AND instance_id=$2`, [sourceId, instanceId, status]);
}

export async function removeCollectorAccount(id) {
  await ensureSchema();
  const result = await getSocialPool().query(`UPDATE social_feed_collector_accounts SET enabled=FALSE,status='offline',updated_at=NOW() WHERE id=$1 RETURNING id`, [id]);
  if (!result.rowCount) { const error = new Error("ไม่พบบัญชี Login"); error.status = 404; throw error; }
}
async function reclassifyCategory(categoryId) {
  const db = getSocialPool();
  const [rules, posts] = await Promise.all([
    db.query(`SELECT * FROM social_feed_rules WHERE category_id=$1 AND enabled=TRUE`, [categoryId]),
    db.query(`SELECT p.id,p.message FROM social_feed_posts p JOIN social_feed_sources s ON s.id=p.source_id WHERE s.category_id=$1`, [categoryId]),
  ]);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM social_feed_post_categories WHERE category_id=$1`, [categoryId]);
    for (const post of posts.rows) {
      if (categoryMatchesRules(rules.rows, post.message)) await client.query(`INSERT INTO social_feed_post_categories(post_id,category_id) VALUES($1,$2)`, [post.id, categoryId]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function setSocialPostSaved(postId, userId, saved) {
  await ensureSchema();
  if (saved) await getSocialPool().query(`INSERT INTO social_feed_saved_posts(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [postId, String(userId)]);
  else await getSocialPool().query(`DELETE FROM social_feed_saved_posts WHERE post_id=$1 AND user_id=$2`, [postId, String(userId)]);
}

export async function setSocialPostTags(postId, names) {
  await ensureSchema();
  const clean = [...new Set((names || []).map((name) => String(name).trim()).filter(Boolean))].slice(0, 12);
  const client = await getSocialPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM social_feed_post_tags WHERE post_id=$1`, [postId]);
    for (const name of clean) {
      const tag = await client.query(`INSERT INTO social_feed_tags(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [name.slice(0, 60)]);
      await client.query(`INSERT INTO social_feed_post_tags(post_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [postId, tag.rows[0].id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function ingestSocialPosts(items) {
  await ensureSchema();
  const client = await getSocialPool().connect();
  let ingested = 0;
  let existing = 0;
  const now = Date.now();
  try {
    await client.query("BEGIN");
    for (const item of (items || []).slice(0, 500)) {
      const rawSourceId = String(item.sourceId || "");
      const sourceId = /^\d+$/.test(rawSourceId) ? rawSourceId : "0";
      const source = await client.query(`SELECT * FROM social_feed_sources WHERE id=$1 OR facebook_group_id=$2 LIMIT 1`, [sourceId, String(item.groupId || "")]);
      if (!source.rows[0] || !item.externalPostId || !String(item.message || "").trim()) continue;
      const sourceRow = source.rows[0];
      const timestamp = item.postedAt ? new Date(item.postedAt).getTime() : NaN;
      const postedAt = Number.isFinite(timestamp) && timestamp <= now ? new Date(timestamp).toISOString() : null;
      let originalUrl = sourceRow.facebook_url;
      try {
        const candidate = new URL(String(item.originalUrl || ""));
        if (candidate.protocol === "https:" && /(^|\.)facebook\.com$/i.test(candidate.hostname)) originalUrl = candidate.toString();
      } catch {}
      const message = String(item.message).trim().slice(0, 20000);
      const result = await client.query(`INSERT INTO social_feed_posts(source_id,external_post_id,message,original_url,posted_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,external_post_id) DO UPDATE SET posted_at=COALESCE(EXCLUDED.posted_at,social_feed_posts.posted_at),message=CASE WHEN length(EXCLUDED.message)>length(social_feed_posts.message) THEN EXCLUDED.message ELSE social_feed_posts.message END,original_url=CASE WHEN length(EXCLUDED.message)>length(social_feed_posts.message) THEN EXCLUDED.original_url ELSE social_feed_posts.original_url END RETURNING id,(xmax=0) AS inserted`, [sourceRow.id, String(item.externalPostId).slice(0, 255), message, originalUrl, postedAt]);
      if (!result.rows[0].inserted) { existing += 1; continue; }
      const postId = result.rows[0].id;
      await client.query(`DELETE FROM social_feed_post_categories WHERE post_id=$1`, [postId]);
      await client.query(`INSERT INTO social_feed_post_categories(post_id,category_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [postId, sourceRow.category_id]);
      await client.query(`UPDATE social_feed_sources SET last_seen_at=NOW(),last_error='',updated_at=NOW() WHERE id=$1`, [sourceRow.id]);
      ingested += 1;
    }
    await client.query("COMMIT");
    return { ingested, existing };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
