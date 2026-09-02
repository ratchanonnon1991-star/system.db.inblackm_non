import {
  getRazerAccount,
  getRazerAccountByEmail,
  listRazerAccounts,
  markRazerAccountInUse,
  normalizeZone,
  persistUniqueTfaSecret,
  RAZER_STATUSES,
  releaseRazerAccountInUse,
  suggestTotpKeyFromEmail,
  updateRazerAccount,
} from "@/server/profit-razer";
import { generateTotp } from "@/server/profit-razer-sync";
import { fetchRazerOtpFromExternalApi, fetchTotpSecretForAccount } from "@/server/profit-razer-otp-inbox";

function inferStatus({ goldBalance, silverBalance }) {
  const gold = Number(goldBalance) || 0;
  const silver = Number(silverBalance) || 0;
  if (gold > 0) return "ACTIVE";
  if (silver >= 5000) return "SILVER_READY";
  return "PENDING_TOPUP";
}

function totpMeta(tfaSecret) {
  if (!tfaSecret) return { totp: "", totpSecondsLeft: 0 };
  return {
    totp: generateTotp(tfaSecret),
    totpSecondsLeft: 30 - (Math.floor(Date.now() / 1000) % 30),
  };
}

function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    zone: account.zone,
    rate: account.rate,
    status: account.status,
    goldBalance: account.goldBalance,
    silverBalance: account.silverBalance,
    goldThb: account.goldThb,
    hidden: account.hidden,
    botEnabled: account.botEnabled,
    inUseBy: account.inUseBy,
    inUseOrderId: account.inUseOrderId,
    inUseAt: account.inUseAt,
    hasPassword: account.hasPassword,
    hasTfa: account.hasTfa,
    hasTotpKey: account.hasTotpKey,
    totpKey: account.totpKey,
    lastSyncedAt: account.lastSyncedAt,
  };
}

export async function getRazerAccountOtpBundle(accountOrId, {
  includeSecrets = true,
  persistExternalSecret = false,
  forceExternal = false,
} = {}) {
  const account = typeof accountOrId === "string"
    ? await getRazerAccount(accountOrId, { includeSecrets })
    : accountOrId;
  if (!account) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });

  const accountId = account.id;
  let totp = "";
  let totpSecondsLeft = 0;
  let tfaSecret = forceExternal ? "" : (account.tfaSecret || "");
  let otpSource = forceExternal ? "none" : (account.hasTfa ? "totp" : "none");
  let otpError = "";
  let totpKeyUsed = account.totpKey || suggestTotpKeyFromEmail(account.email);

  // 1) Try to pull a unique secret from api-system and store locally (per-account OTP).
  if (!tfaSecret && !forceExternal) {
    const pulled = await fetchTotpSecretForAccount({
      totpKey: account.totpKey,
      email: account.email,
    });
    if (pulled.secret) {
      totpKeyUsed = pulled.totpKeyUsed || totpKeyUsed;
      const { saved, duplicateOf } = await persistUniqueTfaSecret(accountId, pulled.secret);
      if (saved || persistExternalSecret) {
        if (saved) tfaSecret = pulled.secret;
      } else if (duplicateOf) {
        otpError = `Secret จาก api-system ซ้ำกับ ${duplicateOf.email} — ใส่ 2FA Secret ของบัญชีนี้ใน Shield`;
      }
    }
  }

  let { totp: localTotp, totpSecondsLeft: localSeconds } = totpMeta(tfaSecret);
  totp = localTotp;
  totpSecondsLeft = localSeconds;
  if (totp) {
    otpSource = "totp";
  } else if (!otpError) {
    const others = await listRazerAccounts();
    const probeKeys = others
      .filter((a) => a.id !== accountId && a.totpKey)
      .map((a) => a.totpKey)
      .slice(0, 3);

    // 2) OTP จาก api-system — ลอง ?key= ก่อน
    let external = await fetchRazerOtpFromExternalApi({
      email: account.email,
      totpKey: account.totpKey,
      probeKeys,
    });

    // 3) ถ้า OTP ซ้ำ / ไม่ได้ → ลอง ?account=email
    if ((!external.otp || external.otpError) && account.email) {
      const byEmail = await fetchRazerOtpFromExternalApi({
        email: account.email,
        probeKeys,
        emailOnly: true,
      });
      if (byEmail.otp && !byEmail.otpError) external = byEmail;
    }

    if (external.totpKeyUsed) totpKeyUsed = external.totpKeyUsed;

    if (external.tfaSecret) {
      const { saved, duplicateOf } = await persistUniqueTfaSecret(accountId, external.tfaSecret);
      if (saved) {
        tfaSecret = external.tfaSecret;
        ({ totp: localTotp, totpSecondsLeft: localSeconds } = totpMeta(tfaSecret));
        totp = localTotp;
        totpSecondsLeft = localSeconds;
        otpSource = "totp";
      } else if (duplicateOf) {
        otpError = `Secret จาก api-system ซ้ำกับ ${duplicateOf.email} — ใส่ 2FA Secret ของบัญชีนี้ใน Shield`;
      }
    } else if (external.otp && !external.otpError) {
      totp = external.otp;
      totpSecondsLeft = external.otpSecondsLeft ?? 0;
      if (totpSecondsLeft <= 0 && totp) {
        totpSecondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30) || 30;
      }
      otpSource = external.otpSource || "external";
    }

    if (external.otpError && !otpError) otpError = external.otpError;
  }

  if (tfaSecret && !account.hasTfa) {
    account.hasTfa = true;
    account.tfaSecret = tfaSecret;
  }

  return {
    account: publicAccount(account),
    email: account.email,
    password: includeSecrets ? account.password || "" : undefined,
    tfaSecret: includeSecrets ? tfaSecret : undefined,
    totp,
    totpSecondsLeft,
    otp: totp,
    otpSource,
    otpError,
    totpKeyUsed,
    goldBalance: account.goldBalance,
    silverBalance: account.silverBalance,
    zone: account.zone,
    status: account.status,
  };
}

async function botAccountWithCredentials(account) {
  const otpBundle = await getRazerAccountOtpBundle(account, {
    includeSecrets: true,
    forceExternal: !account.tfaSecret,
  });
  return {
    ...publicAccount(account),
    password: account.password || "",
    tfaSecret: otpBundle.tfaSecret || account.tfaSecret || "",
    totp: otpBundle.totp || otpBundle.otp || "",
    totpSecondsLeft: otpBundle.totpSecondsLeft ?? 0,
    otp: otpBundle.otp || otpBundle.totp || "",
    otpSource: otpBundle.otpSource || "",
    otpError: otpBundle.otpError || "",
    totpKeyUsed: otpBundle.totpKeyUsed || account.totpKey || "",
  };
}

export async function listRazerAccountsForBot({
  zone,
  status,
  minGold = 0,
  minSilver = 0,
  includeDisabled = false,
} = {}) {
  const accounts = await listRazerAccounts({ zone, status });
  const eligible = [];

  for (const summary of accounts) {
    if (summary.hidden) continue;
    if (!includeDisabled && !summary.botEnabled) continue;
    if (summary.goldBalance < minGold && summary.silverBalance < minSilver) continue;

    const full = await getRazerAccount(summary.id, { includeSecrets: true });
    if (!full?.hasPassword) continue;

    eligible.push(await botAccountWithCredentials(full));
  }

  return eligible;
}

export async function claimRazerAccountForBot(id, body = {}) {
  const account = await getRazerAccount(id);
  if (!account) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
  if (!account.botEnabled) throw Object.assign(new Error("บัญชีนี้ปิด Bot API"), { status: 403 });

  const updated = await markRazerAccountInUse(id, {
    botName: body.botName || body.bot || body.by,
    orderId: body.orderId || body.order_id,
    note: body.note,
  });

  const full = await getRazerAccount(updated.id, { includeSecrets: true });
  const otpBundle = await getRazerAccountOtpBundle(full, {
    includeSecrets: true,
    forceExternal: !full.tfaSecret,
  });
  return { account: await botAccountWithCredentials(full), ...otpBundle };
}

export async function claimRazerAccountByEmailForBot(email, body = {}) {
  const account = await getRazerAccountByEmail(email);
  if (!account) throw Object.assign(new Error(`ไม่พบบัญชี ${email}`), { status: 404 });
  return claimRazerAccountForBot(account.id, body);
}

export async function releaseRazerAccountForBot(id, body = {}) {
  const updated = await releaseRazerAccountInUse(id, { status: body.status });
  return { account: publicAccount(updated) };
}

export async function getRazerOtpForBot({ id, email }) {
  if (id) {
    const account = await getRazerAccount(id, { includeSecrets: true });
    if (!account) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
    return getRazerAccountOtpBundle(account, {
      includeSecrets: true,
      forceExternal: !account.tfaSecret,
    });
  }
  if (email) {
    const account = await getRazerAccountByEmail(email, { includeSecrets: true });
    if (!account) throw Object.assign(new Error(`ไม่พบบัญชี ${email}`), { status: 404 });
    return getRazerAccountOtpBundle(account, {
      includeSecrets: true,
      forceExternal: !account.tfaSecret,
    });
  }
  throw Object.assign(new Error("ต้องระบุ id หรือ email"), { status: 400 });
}

/** @deprecated Bot should list accounts and pick itself — kept for compatibility. */
export async function pickRazerAccountForBot({ zone, minGold = 0, email } = {}) {
  let accounts = await listRazerAccountsForBot({
    zone: zone ? normalizeZone(zone) : undefined,
    minGold,
  });

  if (email) {
    accounts = accounts.filter((a) => a.email.toLowerCase() === String(email).trim().toLowerCase());
  }

  if (!accounts.length) {
    throw Object.assign(new Error(`ไม่มีบัญชีพร้อมจ่ายในโซน ${zone || "?"}`), { status: 404 });
  }

  accounts.sort((a, b) => {
    if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
    if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
    return b.goldBalance - a.goldBalance;
  });
  return { account: accounts[0] };
}

export async function reportRazerPayment(id, body = {}) {
  const account = await getRazerAccount(id);
  if (!account) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
  if (!account.botEnabled) {
    throw Object.assign(new Error("บัญชีนี้ปิด Bot API"), { status: 403 });
  }

  let goldBalance = body.goldBalance ?? body.gold_balance;
  let silverBalance = body.silverBalance ?? body.silver_balance;

  if (goldBalance == null && body.deductGold != null) {
    goldBalance = Math.max(0, account.goldBalance - (Number(body.deductGold) || 0));
  }
  if (silverBalance == null && body.deductSilver != null) {
    silverBalance = Math.max(0, account.silverBalance - (Number(body.deductSilver) || 0));
  }

  const nextGold = goldBalance != null ? Number(goldBalance) || 0 : account.goldBalance;
  const nextSilver = silverBalance != null ? Number(silverBalance) || 0 : account.silverBalance;
  const nextStatus = body.status && RAZER_STATUSES.includes(body.status) && body.status !== "IN_USE"
    ? body.status
    : inferStatus({ goldBalance: nextGold, silverBalance: nextSilver });

  const updated = await updateRazerAccount(id, {
    goldBalance: nextGold,
    silverBalance: nextSilver,
    status: nextStatus,
    clearInUse: true,
    syncBalance: true,
  });

  return {
    account: publicAccount(updated),
    note: body.note || body.orderId || null,
  };
}
