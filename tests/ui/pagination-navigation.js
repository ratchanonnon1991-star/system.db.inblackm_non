export const useRouter = () => ({ push: (url) => { location.href = url; }, refresh() {} });
export const useParams = () => ({ categoryId: "demo", cardId: "demo" });
