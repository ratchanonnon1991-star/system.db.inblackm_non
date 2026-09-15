(function storeFacebookGraphqlDocuments() {
  const listener = (event) => {
    if (event.source !== window || event.data?.source !== "inblackm-facebook-graphql") return;
    const { name, docId } = event.data;
    if (!name || !/^\d+$/.test(docId || "")) return;
    try {
      chrome.storage.local.get({ facebookGraphqlDocIds: {} }, ({ facebookGraphqlDocIds }) => {
        if (chrome.runtime.lastError || facebookGraphqlDocIds[name] === docId) return;
        chrome.storage.local.set({ facebookGraphqlDocIds: { ...facebookGraphqlDocIds, [name]: docId } }, () => void chrome.runtime.lastError);
      });
    } catch { window.removeEventListener("message", listener); }
  };
  window.addEventListener("message", listener);
})();
