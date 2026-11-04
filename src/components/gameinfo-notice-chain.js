"use client";

import { useState } from "react";
import { Bot, Check, CircleAlert, Clock, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Notices that stand between a person and an action (editing a game, sending
// a listing for a check, recording a check), one layer after another. Each is
// shown once a day per browser: after it is acknowledged it stays quiet until
// midnight. A chain started with `force` cannot be dismissed, only answered.
const STORAGE_KEY = "gameinfo-notices-seen";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

function readSeen() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return stored?.day === today() ? stored : { day: today(), keys: {} };
  } catch {
    return { day: today(), keys: {} };
  }
}

export function isGameinfoNoticeSeen(key) {
  return Boolean(readSeen().keys[key]);
}

function markSeen(key) {
  const seen = readSeen();
  seen.keys[key] = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Without storage the notice simply shows again next time.
  }
}

/**
 * `run(steps, done, { force })`: `steps` are [{ key, render(step, total, next, cancel) }]
 * or names of the built-in steps below; those already seen today are skipped.
 * `node` is what the page renders. `className` carries the page's typeface into the layer.
 */
export function useGameinfoNoticeChain(className = "") {
  const [chain, setChain] = useState(null);

  function run(steps, done, { force = true, onCancel = null } = {}) {
    const pending = steps.filter((step) => !isGameinfoNoticeSeen(step.key));
    if (!pending.length) {
      done?.();
      return;
    }
    setChain({ steps: pending, index: 0, done, force, onCancel });
  }

  function next() {
    const step = chain.steps[chain.index];
    markSeen(step.key);
    if (chain.index + 1 < chain.steps.length) {
      setChain({ ...chain, index: chain.index + 1 });
      return;
    }
    setChain(null);
    chain.done?.();
  }

  function cancel() {
    const onCancel = chain?.onCancel;
    setChain(null);
    onCancel?.();
  }

  const step = chain?.steps[chain.index];
  const node = step ? (
    <Dialog open onOpenChange={(open) => { if (!open && !chain.force) cancel(); }}>
      <DialogContent showCloseButton={false} className={`gd gd-notice ${step.wide ? "wide" : ""} ${className}`}>
        <DialogTitle className="sr-only">{step.title}</DialogTitle>
        {chain.steps.length > 1 ? (
          <div className="gd-stp">
            <span>ชั้นที่ {chain.index + 1} จาก {chain.steps.length}</span>
            {chain.steps.map((item, index) => <i key={item.key} className={index <= chain.index ? "on" : ""} />)}
          </div>
        ) : null}
        {step.render(next, cancel)}
      </DialogContent>
    </Dialog>
  ) : null;

  return { run, node };
}

/** The red ticket card most notices use. */
export function GameinfoNoticeCard({ heading, icon: Icon, title, children, confirm, onConfirm, cancelLabel = "ยกเลิก", onCancel }) {
  return (
    <div className="gd-cl">
      <div className="gd-cl-h"><b>{heading}</b></div>
      <div className="gd-cl-pn">
        <span className="gd-cl-ic"><Icon size={30} aria-hidden="true" /></span>
        <div>
          <b>{title}</b>
          {children}
        </div>
      </div>
      <button type="button" className="gd-cl-cta" onClick={onConfirm} autoFocus>
        <span className="ck"><Check size={16} aria-hidden="true" /></span>{confirm}
      </button>
      {onCancel ? <button type="button" className="gd-cl-sec" onClick={onCancel}>{cancelLabel}</button> : null}
    </div>
  );
}

// The CEO's notice: the picture is the message, and its own button acknowledges it.
export const GAMEINFO_CEO_NOTICE = {
  key: "ceo",
  wide: true,
  title: "ประกาศจาก CEO",
  render: (next) => (
    <div className="gd-ceo-art">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/gameinfo/ceo-notice.webp" alt="CEO ข้าวแต้มสั่งด่วน ห้ามลืมตรวจสอบราคาทุก Platform หลังการอัพเดท" width={960} height={640} />
      <button type="button" className="gd-hs-ok" onClick={next} aria-label="ข้าพเจ้าเข้าใจท่าน CEO เป็นอย่างดี" autoFocus />
    </div>
  ),
};

export const GAMEINFO_BOT_NOTICE = {
  key: "bot",
  title: "ระวังบอทเติมอัตโนมัติ",
  render: (next, cancel) => (
    <GameinfoNoticeCard heading="ระวัง !" icon={Bot} title="แก้ไขแล้วบอทเติมตามทันที" confirm="รับทราบ ไปต่อ" onConfirm={next} onCancel={cancel}>
      <small>เกมนี้เติมอัตโนมัติด้วย Bot Auto ตรวจชื่อ ราคา และจำนวนให้ถูกก่อนกดบันทึกทุกครั้ง</small>
    </GameinfoNoticeCard>
  ),
};

export function gameinfoPlatformNotice(channels) {
  return {
    key: "list",
    title: "ตรวจให้ครบทุก Platform",
    render: (next, cancel) => (
      <GameinfoNoticeCard heading="ตรวจให้ครบ !" icon={ShieldCheck} title="หลังแก้ไข ตรวจราคาทุก Platform" confirm="เข้าใจแล้ว เข้าโหมดแก้ไข" onConfirm={next} onCancel={cancel}>
        <div className="gd-cl-tags">{channels.map((channel) => <span key={channel}>{channel}</span>)}</div>
      </GameinfoNoticeCard>
    ),
  };
}

export function gameinfoSendNotice({ round, lister, reviewer }) {
  return {
    key: "send",
    title: "ยืนยันส่งตรวจ",
    render: (next, cancel) => (
      <GameinfoNoticeCard heading="ส่งตรวจ !" icon={Clock} title={`ยืนยันส่งตรวจรอบที่ ${round}`} confirm="ยืนยันส่งตรวจ" onConfirm={next} cancelLabel="ย้อนกลับ" onCancel={cancel}>
        <div className="gd-cl-kv"><span>ผู้ลง</span><span>{lister}</span></div>
        <div className="gd-cl-kv"><span>ผู้ตรวจ</span><span>{reviewer}</span></div>
        <small>ผู้ตรวจมีเวลา 1 ชั่วโมง เกินเวลาระบบปิดการตรวจ</small>
      </GameinfoNoticeCard>
    ),
  };
}

export function gameinfoJudgeNotice({ ok, pack, channel }) {
  return {
    key: ok ? "judge_ok" : "judge_bad",
    title: "ยืนยันผลตรวจ",
    render: (next, cancel) => (
      <GameinfoNoticeCard heading={ok ? "ราคาตรงกัน !" : "ราคาผิด !"} icon={ok ? Check : CircleAlert} title="ยืนยันผลตรวจ" confirm="ยืนยัน" onConfirm={next} cancelLabel="ย้อนกลับ" onCancel={cancel}>
        <div className="gd-cl-kv"><span>แพ็ค</span><span>{pack}</span></div>
        <div className="gd-cl-kv"><span>ช่องทาง</span><span>{channel}</span></div>
        <small>{ok ? "บันทึกว่าตรวจแล้วและราคาถูกต้อง" : "ผู้ลงต้องแก้ไขและส่งตรวจใหม่"}</small>
      </GameinfoNoticeCard>
    ),
  };
}
