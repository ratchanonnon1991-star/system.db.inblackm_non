(function storeFacebookGraphqlDocuments() {
  const listener = (event) => {
    if (event.source !== window || event.data?.source !== "inblackm-facebook-graphql") return;
    const { name, docId, asbdId, attribution, tracking } = event.data;
    try {
      chrome.storage.local.get({ facebookGraphqlDocIds: {}, facebookGraphqlEnvelope: {} }, (stored) => {
        if (chrome.runtime.lastError) return;
        const docIds = stored.facebookGraphqlDocIds || {};
        const envelope = stored.facebookGraphqlEnvelope || {};
        const update = {};
        if (name && /^\d+$/.test(docId || "") && docIds[name] !== docId) update.facebookGraphqlDocIds = { ...docIds, [name]: docId };
        const nextEnvelope = { ...envelope };
        let envelopeChanged = false;
        if (/^\d+$/.test(asbdId || "") && envelope.asbdId !== asbdId) { nextEnvelope.asbdId = asbdId; envelopeChanged = true; }
        if (typeof attribution === "string" && attribution && envelope.attribution !== attribution) { nextEnvelope.attribution = attribution; envelopeChanged = true; }
        if (Array.isArray(tracking) && tracking.length && JSON.stringify(envelope.tracking) !== JSON.stringify(tracking)) { nextEnvelope.tracking = tracking; envelopeChanged = true; }
        if (envelopeChanged) update.facebookGraphqlEnvelope = nextEnvelope;
        if (Object.keys(update).length) chrome.storage.local.set(update, () => void chrome.runtime.lastError);
      });
    } catch { window.removeEventListener("message", listener); }
  };
  window.addEventListener("message", listener);
})();
