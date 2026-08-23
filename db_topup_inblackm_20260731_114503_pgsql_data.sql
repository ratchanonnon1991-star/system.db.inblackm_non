--
-- PostgreSQL database dump
--

\restrict k7aEs4Vr5cGaVM1CmcIgnBjeWpRWUd14e93wzkWvborvclPm9F5MTX037gGVGe3

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE ONLY public.game_list DROP CONSTRAINT game_list_pkey;
ALTER TABLE public.game_list ALTER COLUMN id DROP DEFAULT;
DROP TABLE public.pack_list;
DROP SEQUENCE public.game_list_id_seq;
DROP TABLE public.game_list;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: game_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.game_list (
    id bigint NOT NULL,
    rank_stars smallint DEFAULT 0 NOT NULL,
    bot_manual character varying NOT NULL,
    channel character varying NOT NULL,
    region character varying NOT NULL,
    vpn character varying DEFAULT 'NO_VPN'::character varying NOT NULL,
    game character varying NOT NULL,
    is_repeatable boolean DEFAULT false NOT NULL,
    link text,
    platform character varying,
    server character varying,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.game_list OWNER TO postgres;

--
-- Name: game_list_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.game_list_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_list_id_seq OWNER TO postgres;

--
-- Name: game_list_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.game_list_id_seq OWNED BY public.game_list.id;


--
-- Name: pack_list; Type: TABLE; Schema: public; Owner: topup_inblackm
--

CREATE TABLE public.pack_list (
    id bigint,
    sell_price double precision,
    usdt double precision,
    kaleoz double precision,
    "gemที่กด" text,
    "gemรวม" bigint,
    "phpที่กด" text,
    "phpรวม" bigint,
    "razer_cadที่กด" double precision,
    "razer_usdที่กด" double precision,
    "ช่องทางหลัก" text,
    "ช่องทางสำรอง" text,
    country text
);


ALTER TABLE public.pack_list OWNER TO topup_inblackm;

--
-- Name: game_list id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_list ALTER COLUMN id SET DEFAULT nextval('public.game_list_id_seq'::regclass);


--
-- Data for Name: game_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.game_list (id, rank_stars, bot_manual, channel, region, vpn, game, is_repeatable, link, platform, server, remark, created_at, updated_at) FROM stdin;
4	2	Manual	Ooredoo	MMK	NO VPN	AUTO CHESS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=215079588#gid=215079588	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
5	2	Manual	Ooredoo	MMK	NO VPN	PATH TO NOWHERE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1321784237#gid=1321784237	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
6	2	Manual	Ooredoo	MMK	NO VPN	SHINING NIKKI	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2077299555#gid=2077299555	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
8	2	Manual	Wavepay	MMK	NO VPN	HEAVEN BURNS RED	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=229185591#gid=229185591	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
9	2	Bot Auto	Wavepay	MMK	NO VPN	THE DIVISION RESURGENCE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1811244715#gid=1811244715	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
10	1	Manual	ATOM	MMK	NO VPN	8 BALL POOL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1751886234#gid=1751886234	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
11	3	Manual	Razer (SGD)	PHP	NO VPN	NEVERNESS TO EVERNESS NTE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1216659896#gid=1216659896	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
12	3	Manual	Razer (SGD)	PHP	VPN	OVERMORTAL SEA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=58015146#gid=58015146	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
13	3	Manual	Razer (SGD)	PHP	NO VPN	WESING	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1205444619#gid=1205444619	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
14	3	Manual	Razer (SGD)	PHP	NO VPN	EPIC HEROES	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1068263906#gid=1068263906	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
15	3	Manual	Razer (CAD)	PHP	NO VPN	LEGEND OF MUSHROOM RUSH SEA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=930867781#gid=930867781	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
16	3	Manual	Razer (CAD)	PHP	NO VPN	HERO REBOIRN: ETERNAL PACT	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=502785673#gid=502785673	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
17	3	Manual	Razer (CAD)	PHP	VPN	CLUB M STAR	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1727880040#gid=1727880040	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
18	3	Manual	RAZER (PHP)	PHP	NO VPN	REVELATION M  (SEA)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=889044409#gid=889044409	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
19	3	Manual	RAZER (PHP)	PHP	NO VPN	MAPLE STORY M	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=426087495#gid=426087495	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
20	3	Bot Auto	TNT	PHP	NO VPN	HONKAI STAR RAIL /  HSR	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=77812468#gid=77812468	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
21	3	Manual	TNT	PHP	NO VPN	STUMBLE GUYS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=728946147#gid=728946147	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
22	2	Manual	Razer (CAD)	PHP	VPN	GODDESS OF VICTORY: NIKKE UID	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=478828118#gid=478828118	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
23	2	Manual	Razer (CAD)	PHP	VPN	DRAGONHEIR SILENT GOD	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=840286092#gid=840286092	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
24	2	Manual	RAZER (PHP)	PHP	NO VPN	LINEAGE2M	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=517848048#gid=517848048	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
25	2	Manual	RAZER (PHP)	PHP	NO VPN	LINEAGE W	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1195460590#gid=1195460590	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
26	2	Manual	GCASH	PHP	NO VPN	DUNK CITY DYNASTY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=45324395#gid=45324395	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
27	2	Manual	Oneone	PHP	NO VPN	RAGNAROK M : CLASSIC	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1718054023#gid=1718054023	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
28	1	Manual	Razer (SGD)	PHP	NO VPN	OMNIHEROES	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=748551788#gid=748551788	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
29	1	Manual	Razer (CAD)	PHP	NO VPN	PIXEL GUN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1855230416#gid=1855230416	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
30	1	Manual	Razer (CAD)	PHP	NO VPN	DRAGON RAJA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=290072260#gid=290072260	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
31	1	Manual	Razer (CAD)	PHP	NO VPN	RAGNAROK ETERNAL LOVE (ROM)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=309329932#gid=309329932	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
32	1	Manual	Razer (CAD)	PHP	VPN	REALMS OF PIXEL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2133824996#gid=2133824996	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
33	1	Manual	Razer (CAD)	PHP	NO VPN	X-SAMKOK	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1553905680#gid=1553905680	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
3	1	Bot Auto	Wavepay	MMK	NO VPN	LOVE AND DEEPSPACE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1636319288#gid=1636319288	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
2	2	Bot Auto	Wavepay	MMK	NO VPN	HARRY MAGIC AWAKEN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1850754726#gid=1850754726	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
7	0	Manual	Ooredoo	MMK	NO VPN	DUMMY LAND	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1238607792#gid=1238607792	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
34	1	Manual	Razer (CAD)	PHP	NO VPN	TWILIGHT CHRONICLE:IDLE RPG	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1531796833#gid=1531796833	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
35	1	Manual	Razer (CAD)	PHP	NO VPN	HAUNTED ROOM SLEEP SURVIVOR	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1036509171#gid=1036509171	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
36	1	Manual	RAZER (PHP)	PHP	NO VPN	LIGHT AND NIGHT	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=678764280#gid=678764280	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
37	1	Manual	RAZER (PHP)	PHP	NO VPN	MOONLIGHT BLADE M	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1907592509#gid=1907592509	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
38	1	Manual	RAZER (PHP)	PHP	NO VPN	COOKIERUN OVENSMASH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1500296975#gid=1500296975	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
39	1	Manual	RAZER (PHP)	PHP	NO VPN	GOALS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1434926581#gid=1434926581	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
40	1	Manual	TNT	PHP	NO VPN	TOP ELEVEN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1762879327#gid=1762879327	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
41	1	Manual	GCASH	PHP	NO VPN	LEGEND OF YMIR  (My Card Link)	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=1221331752#gid=1221331752	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
42	1	Manual	GCASH	PHP	NO VPN	NIGHT CROWS  (My Card Link)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=535990812#gid=535990812	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
43	1	Manual	GCASH	PHP	NO VPN	RAN MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1611940299#gid=1611940299	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
44	1	Manual	GCASH	PHP	NO VPN	DRIVE : CAR SIMULATOR	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=431960060#gid=431960060	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
45	1	Manual	Oneone	PHP	NO VPN	RAGNAROK ENDLESS TRAILS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=751845165#gid=751845165	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
46	1	Manual	GoCash	PHP	VPN	WAR ROBOTS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2120569880#gid=2120569880	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
47	1	Manual	Dito	PHP	VPN	MU NEW DAWN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1752834297#gid=1752834297	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
48	3	Manual	LAOS TELECOM	LAK	NO VPN	DRAGON CITY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=452396877#gid=452396877	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
49	2	Manual	LAOS TELECOM	LAK	NO VPN	GROWTOPIA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2023726444#gid=2023726444	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
50	1	Manual	LAOS TELECOM	LAK	NO VPN	TOM AND JERRY: CHASE (ASIA)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1185726649#gid=1185726649	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
51	1	Manual	LAOS TELECOM	LAK	NO VPN	MODERN COMBAT 5	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1677417225#gid=1677417225	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
52	1	Manual	LAOS TELECOM	LAK	NO VPN	MICO: MAKE FRIENDS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=503176868#gid=503176868	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
53	1	Manual	LAOS TELECOM	LAK	NO VPN	YALLA LUDO	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1036360370#gid=1036360370	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
54	1	Manual	LAOS TELECOM	LAK	NO VPN	YALLA LIVE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=442005770#gid=442005770	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
55	1	Manual	LAOS TELECOM	LAK	NO VPN	CHAMET	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1506442243#gid=1506442243	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
56	1	Manual	LAOS TELECOM	LAK	NO VPN	POPPO LIVE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=19587474#gid=19587474	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
57	3	Manual	Razer (SGD)	IDR	NO VPN	HERO CLASH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=11627919#gid=11627919	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
58	3	Manual	Razer (SGD)	IDR	NO VPN	RAGNAROK THE NEW WORLD	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=89076647#gid=89076647	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
59	3	Manual	Razer (CAD)	IDR	NO VPN	KINGDOM HEROES M	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=256912339#gid=256912339	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
60	3	Manual	Razer (CAD)	IDR	VPN	BLEACH: SOUL RESONANCE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1808009912#gid=1808009912	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
61	3	Bot Auto	Donshop IDR	IDR	NO VPN	MARVEL RIVALS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=398989048#gid=398989048	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
62	3	Bot Auto	Donshop IDR	IDR	NO VPN	Where Winds Meet	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1946363599#gid=1946363599	PC	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
63	3	Manual	Donshop IDR	IDR	NO VPN	MOBILE LEGENDS / MLBB MY / SG	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1414440615#gid=1414440615	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
64	3	Bot Auto	Donshop IDR	IDR	NO VPN	PUBG MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=155081232#gid=155081232	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
65	3	Manual	Agenh2h (IDR)	IDR	NO VPN	ZENLESS ZONE ZERO / ZZZ	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1413178326#gid=1413178326	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
66	3	Manual	Agenh2h (IDR)	IDR	NO VPN	GENSHIN IMPACT (GL)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1289504327#gid=1289504327	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
200	1	Manual	Razer (CAD)	CAD	NO VPN	XBOX US	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=362484192#gid=362484192	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
67	2	Manual	Razer (SGD)	IDR	VPN	SOUL LAND NEW WORLD	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1254997763#gid=1254997763	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
68	2	Manual	Razer (CAD)	IDR	NO VPN	X - CLASH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1205456643#gid=1205456643	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
69	2	Manual	Razer (CAD)	IDR	VPN	RAGNAROK X (ROX) SEA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2116684929#gid=2116684929	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
70	2	Bot Auto	Donshop IDR	IDR	NO VPN	SUPERSUS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1857085754#gid=1857085754	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
71	2	Bot Auto	Donshop IDR	IDR	NO VPN	DESTINY:RISING	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1491019338#gid=1491019338	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
72	2	Manual	Xsolla Gold	IDR	VPN	BULLET ECHO	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1190789326#gid=1190789326	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
73	1	Manual	Razer (SGD)	IDR	NO VPN	RAGNAROK BACK TO GLORY	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=647211230#gid=647211230	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
74	1	Manual	Razer (SGD)	IDR	NO VPN	DYNASTY HEROES SAMKOK LEGEND	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=853245827#gid=853245827	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
75	1	Manual	Razer (CAD)	IDR	NO VPN	DREAMLIKE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1799877980#gid=1799877980	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
76	1	Manual	Oneone	IDR	NO VPN	RAGNAROK IDLE ADVENTURE PLUS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=444245437#gid=444245437	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
77	1	Manual	Oneone	IDR	NO VPN	RAGNAROK ORIGIN CLASSIC	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1252612952#gid=1252612952	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
78	1	Bot Auto	Donshop IDR	IDR	NO VPN	DRAGON NEST M : CLASSIC	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2052125271#gid=2052125271	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
79	1	Bot Auto	Donshop IDR	IDR	NO VPN	ONMYOJI ARENA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1475146394#gid=1475146394	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
80	1	Bot Auto	Donshop IDR	IDR	NO VPN	ONE PUNCH MAN THE STRONGEST	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=767566741#gid=767566741	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
81	1	Bot Auto	Donshop IDR	IDR	NO VPN	HATSUNE MIKU: COLORFUL STAGE!	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=920634440#gid=920634440	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
82	1	Bot Auto	Donshop IDR	IDR	NO VPN	SPEED DRIFTERS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=746836667#gid=746836667	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
83	1	Manual	UNIPIN(IDR)	IDR	NO VPN	TOTAL FOOTBALL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1462520849#gid=1462520849	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
84	1	Manual	UNIPIN(IDR)	IDR	VPN	LORDNINE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1568010223#gid=1568010223	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
85	1	Manual	BRI	IDR	NO VPN	PALMON SURVIVAL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1381619694#gid=1381619694	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
86	1	Manual	BRI	IDR	NO VPN	DRAGON TRAVELER	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?pli=1&gid=26802274#gid=26802274	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
87	3	Manual	Razer (SGD)	USD	NO VPN	TOKYO GHOUL ( SEA )	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1607515852#gid=1607515852	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
88	3	Manual	Razer (SGD)	USD	VPN	APEX LEGENDS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1364264676#gid=1364264676	PC	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
89	3	Bot Auto	Multi Game Card	USD	NO VPN	OXIDE : SURVIVAL ISLAND	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1292574408#gid=1292574408	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
90	3	Bot Auto	CODASHOP (USD)	USD	NO VPN	BLOOD STRIKE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=638953695#gid=638953695	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
91	3	Bot Auto	CODASHOP (USD)	USD	NO VPN	ZEPETO	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1428075775#gid=1428075775	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
92	3	Bot Auto	CODASHOP (USD)	USD	NO VPN	MOBILE LEGENDS / MLBB GL / TH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=469511174#gid=469511174	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
93	3	Bot Auto	CODASHOP (USD)	USD	NO VPN	MOBILE LEGENDS / MLBB PHP	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1355898656#gid=1355898656	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
94	2	Manual	Razer (CAD)	USD	NO VPN	AVATAR : REALMS COLLIDE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=383211804#gid=383211804	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
95	2	Manual	Razer (CAD)	USD	NO VPN	INFINITE MAGICRAID	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1399828396#gid=1399828396	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
96	2	Manual	Razer (CAD)	USD	NO VPN	C.A.T.S: CRASH ARENA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1502539992#gid=1502539992	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
97	2	Manual	Razer (CAD)	USD	NO VPN	MY SINGING MONSTERS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=574860198#gid=574860198	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
98	2	Manual	Razer (CAD)	USD	VPN	CROSSOUT MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=972928561#gid=972928561	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
99	2	Manual	KTB DAD	USD	NO VPN	LAST ISLAND OF SURVIVAL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1114184466#gid=1114184466	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
100	2	Manual	Multi Game Card	USD	NO VPN	AVAKIN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2034064046#gid=2034064046	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
101	2	Manual	GoCash	USD	NO VPN	MADOUT 2	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=617965261#gid=617965261	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
102	2	Bot Auto	CODASHOP (USD)	USD	NO VPN	AFK JOURNEY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1581716300#gid=1581716300	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
103	2	Bot Auto	CODASHOP (USD)	USD	NO VPN	PUNISHING GRAY RAVEN / PGR	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=518303590#gid=518303590	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
104	2	Bot Auto	CODASHOP (USD)	USD	NO VPN	MAGIC CHESS: GO GO	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1600354480#gid=1600354480	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
105	2	Bot Auto	Oneone	USD	NO VPN	RAGNAROK ORIGIN (ROO) SEA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1279676737#gid=1279676737	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
106	2	Manual	Oneone	USD	NO VPN	RAGNAROK CLASSIC	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=756296215#gid=756296215	PC	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
107	1	Manual	Razer (SGD)	USD	NO VPN	MAGICMON WORLD	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2037963801#gid=2037963801	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
108	1	Manual	Razer (SGD)	USD	NO VPN	SAMKOK NEW FORCE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1699230175#gid=1699230175	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
109	1	Manual	Razer (SGD)	USD	NO VPN	Legend of Aoqi (GL)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=998927656#gid=998927656	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
110	1	Manual	Razer (CAD)	USD	NO VPN	問劍長生	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=593749739#gid=593749739	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
111	1	Manual	Razer (CAD)	USD	NO VPN	CAR X DRIFT RACING 3	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=912029646#gid=912029646	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
112	1	Manual	Razer (CAD)	USD	NO VPN	PURE SNIPER	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=552707201#gid=552707201	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
113	1	Manual	Razer (CAD)	USD	NO VPN	BLOCKPOST MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=799948282#gid=799948282	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
114	1	Manual	Razer (CAD)	USD	NO VPN	THE LEGEND OF NEVERLAND	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=587041974#gid=587041974	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
115	1	Manual	Razer (CAD)	USD	NO VPN	OVERMORTAL GLOBAL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1587664987#gid=1587664987	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
116	3	Manual	CODASHOP (USD)	USD	NO VPN	GENSHIN IMPACT (TH)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1019225890#gid=1019225890	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
117	1	Manual	Razer (CAD)	USD	NO VPN	TALES OF MECHA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=170951139#gid=170951139	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
118	1	Manual	RAZER (OTHER)	USD	NO VPN	APPLE CARD US	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1381637969#gid=1381637969	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
119	1	Manual	RAZER (OTHER)	USD	NO VPN	PLAYSTATION	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=461836544#gid=461836544	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
120	1	Manual	RAZER (OTHER)	USD	NO VPN	GRIM SOUL : SURVIVAL MAGIC RPG	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1207194621#gid=1207194621	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
121	1	Manual	RAZER (OTHER)	USD	NO VPN	BANUSHERS:FAITHS ENTWINED	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1413897405#gid=1413897405	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
122	1	Manual	KTB DAD	USD	NO VPN	CRYSTAL OF ATLAN ( EU/NA)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1098410986#gid=1098410986	Mobile	EU/NA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
123	1	Manual	KTB DAD	USD	NO VPN	STAR WARS GALAXY OF HEROES	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1853576912#gid=1853576912	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
124	1	Manual	KTB DAD	USD	NO VPN	DRAGON RAJA EU	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1952294168#gid=1952294168	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
125	1	Bot Auto	CODASHOP (USD)	USD	NO VPN	RAINBOW SIX MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=674973533#gid=674973533	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
126	1	Bot Auto	CODASHOP (USD)	USD	NO VPN	FARLIGHT 84	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=868375998#gid=868375998	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
127	1	Bot Auto	CODASHOP (USD)	USD	NO VPN	FREE FIRE ID	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=681526953#gid=681526953	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
128	1	Manual	Oneone	USD	NO VPN	RAGNAROK ZERO GLOBAL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=375598729#gid=375598729	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
129	1	Manual	Netease Credit	USD	NO VPN	SWORD OF JUSTICE (EU)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=721584308#gid=721584308	Mobile	EU/NA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
130	1	Manual	Shop2Topup	USD	NO VPN	FREE FIRE RU	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1075716518#gid=1075716518	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
131	1	Manual	Razer (SGD)	SGD	NO VPN	SEGA FOOTBALL CLUB CHAMPIONS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=235621238#gid=235621238	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
132	1	Manual	Razer (SGD)	SGD	NO VPN	DREAM AND LETHE RECORD	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2009587306#gid=2009587306	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
133	1	Manual	Razer (CAD)	SGD	NO VPN	TREE OF SAVIOR NAVERLAND (TWD)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1713563776#gid=1713563776	Mobile	ASIA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
134	1	Manual	Shell SGD	SGD	NO VPN	FREEFIRE SG/MY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1899079857#gid=1899079857	Mobile	ASIA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
135	1	Manual	Shell SGD	SGD	NO VPN	HAIKYU FLY HIGH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1840816733#gid=1840816733	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
136	2	Bot Auto	Razer (SGD)	JPY	NO VPN	AGE OF EMPIRES MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=767408887#gid=767408887	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
137	2	Manual	Razer (CAD)	JPY	VPN	SNOWBREAK:CONTAINMENT ZONE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1715484235#gid=1715484235	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
138	1	Manual	Razer (CAD)	JPY	NO VPN	PLAYTOGETHER	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=151519226#gid=151519226	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
139	3	Manual	GoCash	JPY	VPN	SKY CHILDREN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1140476929#gid=1140476929	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
140	3	Manual	BITCASH(JPY)	JPY	NO VPN	ARENA BREAKOUT INFINITE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=210708579#gid=210708579	PC	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
141	3	Manual	BITCASH(JPY)	JPY	VPN	WUTHERING WAVES	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=1180664261#gid=1180664261	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
142	3	Bot Auto	NetEase Pay ( JPY )	JPY	NO VPN	IDENTITY V / IDV	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1300297981#gid=1300297981	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
143	1	Manual	Razer (CAD)	TWD	NO VPN	SWORD X STAFF	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=856375937#gid=856375937	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
144	1	Manual	Razer (CAD)	TWD	VPN	SIPHER ODYSSEY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=175181418#gid=175181418	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
145	3	Manual	My Cards	TWD	NO VPN	HEARTOPIA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1412123851#gid=1412123851	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
146	1	Manual	My Cards	TWD	NO VPN	AION 2 (My Card Link)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=647503680#gid=647503680	Mobile	TW	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
147	1	Manual	My Cards	TWD	VPN	DOOMSDAY : LAST SURVIVORS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1034990332#gid=1034990332	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
148	1	Manual	My Cards	TWD	NO VPN	MINI WORLD ROYALE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=165795561#gid=165795561	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
149	1	Manual	My Cards	TWD	NO VPN	RAGNAROK : THE NEW WORLD (TW)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=697351590#gid=697351590	Mobile	TW	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
150	3	Manual	Razer (SGD)	THB	NO VPN	Kuroko's Basketball	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2128898019#gid=2128898019	Mobile	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
151	3	Manual	Razer (SGD)	THB	NO VPN	GAME OF THRONES	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2038917085#gid=2038917085	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
152	1	Manual	Razer (SGD)	THB	NO VPN	MONGIL : STAR DIVE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=57986490#gid=57986490	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
153	3	Bot Auto	AIS / DTAC	THB	VPN	WORLD WAR HEROES / WWH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=340206126#gid=340206126	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
154	2	Manual	Razer (CAD)	THB	NO VPN	BLACK DESERT \nPC/CONSOLE (Razer Link)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1369941321#gid=1369941321	PC	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
155	2	Manual	RAZER (OTHER)	THB	NO VPN	SOLO LEVELING: ARISE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=289520506#gid=289520506	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
156	3	Manual	Razer (THB)	THB	NO VPN	GENSHIN TH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1019225890#gid=1019225890	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
157	2	Manual	Razer (THB)	THB	NO VPN	GHOST SOUL M TH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1097538028#gid=1097538028	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
158	2	Manual	Razer (THB)	THB	NO VPN	THE MOONLIT OATH	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1264883286#gid=1264883286	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
159	2	Manual	Razer (THB)	THB	NO VPN	PRINCESS LINK	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=686526006#gid=686526006	PC	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
160	1	Manual	Razer (THB)	THB	NO VPN	ROBLOX GIFT CARD [THB]	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=369643354#gid=369643354	Mobile	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
161	1	Manual	Razer (THB)	THB	NO VPN	PLAYSTATION STORE [THB]	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=40230419#gid=40230419	PC	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
162	3	Bot Auto	Garena Shell	THB	NO VPN	FREE FIRE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1768935944#gid=1768935944	Mobile	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
163	3	Bot Auto	Garena Shell	THB	NO VPN	ROV	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1089266024#gid=1089266024	Mobile	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
164	2	Manual	Wepay	THB	NO VPN	VALORANT	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1218840164#gid=1218840164	PC	TH	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
165	3	Bot Auto	CODASHOP (USD)	MYR	NO VPN	MAGIC CHESS GO GO MY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1799315706#gid=1799315706	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
166	2	Manual	Razer (CAD)	MYR	NO VPN	DDTank Origin	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=190415610#gid=190415610	Mobile	ASIA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
167	3	Manual	Plsbuy	MYR	NO VPN	STELLA SORA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1362984985#gid=1362984985	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
168	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (US)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=742624512#gid=742624512	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
169	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (TW)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1107955136#gid=1107955136	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
170	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (PH)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=308961433#gid=308961433	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
171	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (ID)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=9518615#gid=9518615	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
172	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (BR)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=805662044#gid=805662044	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
173	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (SG)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=761487925#gid=761487925	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
174	3	Manual	Plsbuy	MYR	NO VPN	GENSHIN IMPACT (MY)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2028390647#gid=2028390647	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
175	2	Bot Auto	Plsbuy	MYR	NO VPN	AZUR LANE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1437972153#gid=1437972153	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
176	1	Manual	Plsbuy	MYR	NO VPN	TILES OF SURVIVE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2037733143#gid=2037733143	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
177	2	Manual	Plsbuy	MYR	NO VPN	WATCHER OF REALM	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1790619307#gid=1790619307	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
178	3	Manual	Gamepoint club	MYR	NO VPN	MOBILE LEGENDS / MLBB IDR	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1629694593#gid=1629694593	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
179	3	Bot Auto	Gamepoint club	MYR	NO VPN	HONOR OF KING	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=317141993#gid=317141993	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
180	3	Bot Auto	Gamepoint club	MYR	NO VPN	ONCE HUMAN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=172890288#gid=172890288	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
181	3	Bot Auto	Gamepoint club	MYR	NO VPN	BE THE KING	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1301415127#gid=1301415127	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
182	3	Bot Auto	Gamepoint club	MYR	NO VPN	SWORD OF JUSTICE (SEA)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1673518355#gid=1673518355	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
183	2	Bot Auto	Gamepoint club	MYR	NO VPN	WHITEOUT SURVIVAL	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1625984614#gid=1625984614	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
184	1	Bot Auto	Gamepoint club	MYR	NO VPN	RACING MASTER	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1713637726#gid=1713637726	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
185	1	Bot Auto	Gamepoint club	MYR	NO VPN	CROSSFIRE : LEGENDS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=304616569#gid=304616569	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
186	1	Bot Auto	Gamepoint club	MYR	NO VPN	EGGY PARTY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1329712769#gid=1329712769	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
187	1	Bot Auto	Gamepoint club	MYR	NO VPN	LIFE AFTER SEA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=192046658#gid=192046658	Mobile	SEA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
188	3	Manual	Razer (SGD)	TRY	NO VPN	LEGEND OF MUSHROOM (GL)	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=270809841#gid=270809841	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
189	3	Manual	Razer (SGD)	TRY	NO VPN	LEGEND OF ELEMENTS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1343091525#gid=1343091525	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
190	3	Manual	Razer (TRY)	TRY	VPN	FORNITE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=674820469#gid=674820469	PC	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
191	3	Manual	Razer (CAD)	TRY	NO VPN	UNDAWN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=934223036#gid=934223036	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
192	1	Manual	KTB DAD	TRY	VPN	VIKING RISE	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=1508064729#gid=1508064729	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
193	2	Manual	My Cards	TRY	VPN	LORDS MOBILE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1640507967#gid=1640507967	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
194	3	Manual	Razer (SGD)	RUB	NO VPN	DRAG RACING STREETS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1175368964#gid=1175368964	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
195	2	Manual	Razer (CAD)	RUB	NO VPN	MWT: TANK BATTLES	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=939914805#gid=939914805	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
196	2	Manual	Razer (CAD)	BRL	VPN	LIFE MAKEOVER	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1233979177#gid=1233979177	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
197	1	Manual	Razer (CAD)	BRL	VPN	IDLE ANGELS	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1734717382#gid=1734717382	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
198	3	Manual	Razer (CAD)	PKR	NO VPN	ARENA BREAKOUT	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1594781997#gid=1594781997	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
199	2	Manual	Razer (CAD)	PKR	NO VPN	DELTA FORCE	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1232462106#gid=1232462106	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
201	1	Manual	Razer (CAD)	CAD	NO VPN	NINTENDO US	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=194018906#gid=194018906	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
202	3	Manual	KTB DAD	CAD	VPN	BLEACH: SOUL RESONANCE NA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=452904249#gid=452904249	Mobile	EU/NA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
203	2	Manual	Smile one	EGP	NO VPN	SAUSAGE MAN	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=510771256#gid=510771256	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
204	1	Manual	Ether.fi	EGP	NO VPN	BLOCKMAN GO	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=2112719823#gid=2112719823	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
205	3	Manual	GoCash	KRW	NO VPN	MOBILE LEGEND ADVENTURE / MLA	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1453678631#gid=1453678631	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
206	3	Manual	Smile one	RUB	NO VPN	MOBILE LEGENDS / MLBB RU	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1557372567#gid=1557372567	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
207	2	Manual	Razer (CAD)	HKD	VPN	MECH ARENA	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=1714172453#gid=1714172453	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
208	1	Manual	Razer (CAD)	VND	NO VPN	INFINITE BORDER	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=954963076#gid=954963076	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
209	3	Manual	KTB DAD	USD	UID	TANK COMPANY	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1058617453#gid=1058617453	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
210	3	Manual	KTB DAD	USD	UID	LOST LIGHT	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=1207158131#gid=1207158131	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
211	1	Manual	IOS STOCK		IOS - Stock	TELEGRAM	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=198646403#gid=198646403	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
212	2	Manual	GOOGLE (TRY)		Google	DISCORD	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=1317546549#gid=1317546549	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
213	1	Manual	ITUNES (UK)		ITUNES	TIKTOK	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=6722445#gid=6722445	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
214	1	Manual	ITUNES(DE) +9		ITUNES	BIGO LIVE	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=704366792#gid=704366792	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
215	1	Manual	JazzCash ( PKR )		OFF	Spotify	t	https://docs.google.com/spreadsheets/d/1gLUEag45OOnnlvXR-mH_rNptRsaSbcgfh_RETC-JB2Y/edit?gid=1980709987#gid=1980709987	Mobile	GL	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
1	2	Bot Auto	Ooredoo	MMK	NO VPN	HONKAI IMPACT	t	https://docs.google.com/spreadsheets/d/192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks/edit?gid=627518256#gid=627518256	Mobile	ASIA	\N	2026-07-29 22:12:44.840538+07	2026-07-29 22:12:44.840538+07
216	0	ทดสอบ	ทดสอบ	ทดสอบ	NO_VPN	ทดสอบ	f	ทดสอบ	ทดสอบ	ทดสอบ	ทดสอบ	2026-07-30 23:45:49.253131+07	2026-07-30 23:45:49.253131+07
\.


--
-- Data for Name: pack_list; Type: TABLE DATA; Schema: public; Owner: topup_inblackm
--

COPY public.pack_list (id, sell_price, usdt, kaleoz, "gemที่กด", "gemรวม", "phpที่กด", "phpรวม", "razer_cadที่กด", "razer_usdที่กด", "ช่องทางหลัก", "ช่องทางสำรอง", country) FROM stdin;
22	25	0.74	26.25	60+1	61	49	49	1.12	0.82	Razer (CAD)	RAZER (OTHER)	Philippines
22	50	1.49	52.5	120+3	123	99	99	2.26	1.66	Razer (CAD)	RAZER (OTHER)	Philippines
22	125	3.72	131.25	320+10	330	249	249	5.69	4.17	Razer (CAD)	RAZER (OTHER)	Philippines
22	245	7.29	257.25	720+120	840	499	499	11.4	8.35	Razer (CAD)	RAZER (OTHER)	Philippines
22	490	14.57	514.5	1500+260	1760	999	999	22.82	16.73	Razer (CAD)	RAZER (OTHER)	Philippines
22	735	21.86	771.75	2300+400	2700	1490	1490	34.03	24.95	Razer (CAD)	RAZER (OTHER)	Philippines
22	760	22.6	798	2370+400	2770	1550	1550	35.4	25.95	Razer (CAD)	RAZER (OTHER)	Philippines
22	1350	40.15	1417.5	4200+1000	5200	2790	2790	63.72	46.71	Razer (CAD)	RAZER (OTHER)	Philippines
22	1960	58.29	2058	6200+1500	7700	3990	3990	91.13	66.8	Razer (CAD)	RAZER (OTHER)	Philippines
22	3920	116.57	4116	6200 X 2	12400	3990 X 2	7980	182.26	133.61	Razer (CAD)	RAZER (OTHER)	Philippines
22	5880	174.86	6174	6200 X 3	18600	3990 X 3	11970	273.4	200.41	Razer (CAD)	RAZER (OTHER)	Philippines
22	9800	291.43	10290	6200 X 5	31000	3990 X 5	19950	455.66	334.02	Razer (CAD)	RAZER (OTHER)	Philippines
22	19600	582.86	20580	6200 X 10	62000	3990 X 10	39900	911.32	668.04	Razer (CAD)	RAZER (OTHER)	Philippines
22	122.5	3.64	128.625	Monthly pass	\N	249	249	5.69	4.17	Razer (CAD)	RAZER (OTHER)	Philippines
22	1430	42.53	1501.5	Enhanced Module Set	\N	833055	833055	64.71	49.08	Razer (CAD)	RAZER (OTHER)	Indonesia
22	1430	42.53	1501.5	Technical Support S I	\N	833055	833055	64.71	49.08	Razer (CAD)	RAZER (OTHER)	Indonesia
22	1430	42.53	1501.5	Manufacturer Backup	\N	833055	833055	64.71	49.08	Razer (CAD)	RAZER (OTHER)	Indonesia
22	270	8.03	283.5	Technical Master	\N	553	553	12.63	9.26	Razer (CAD)	RAZER (OTHER)	Philippines
22	2200	65.42	2310	Technical Support S II	\N	1254855	1254855	97.48	73.93	Razer (CAD)	RAZER (OTHER)	Indonesia
22	540	16.06	567	Grow Selection Set	\N	1107	1107	25.28	18.53	Razer (CAD)	RAZER (OTHER)	Philippines
22	540	16.06	567	Class Research Set	\N	1107	1107	25.28	18.53	Razer (CAD)	RAZER (OTHER)	Philippines
22	810	24.09	850.5	Manufacturer Research Set	\N	1661	1661	37.94	27.81	Razer (CAD)	RAZER (OTHER)	Philippines
\.


--
-- Name: game_list_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.game_list_id_seq', 216, true);


--
-- Name: game_list game_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_list
    ADD CONSTRAINT game_list_pkey PRIMARY KEY (id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO topup_inblackm;


--
-- Name: TABLE game_list; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.game_list TO topup_inblackm;


--
-- Name: SEQUENCE game_list_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.game_list_id_seq TO topup_inblackm;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO topup_inblackm;


--
-- PostgreSQL database dump complete
--

\unrestrict k7aEs4Vr5cGaVM1CmcIgnBjeWpRWUd14e93wzkWvborvclPm9F5MTX037gGVGe3

