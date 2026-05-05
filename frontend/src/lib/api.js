import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "cc_access_token";
const REFRESH_KEY = "cc_refresh_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setTokens = (access, refresh) => {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
};
export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retried) {
      original._retried = true;
      try {
        if (!refreshing) {
          const r = localStorage.getItem(REFRESH_KEY);
          refreshing = axios.post(`${API}/auth/refresh`, {}, {
            withCredentials: true,
            headers: r ? { Authorization: `Bearer ${r}` } : {},
          }).finally(() => { setTimeout(() => (refreshing = null), 0); });
        }
        const resp = await refreshing;
        setTokens(resp.data.access_token, resp.data.refresh_token);
        original.headers.Authorization = `Bearer ${resp.data.access_token}`;
        return api(original);
      } catch (_) {
        clearTokens();
      }
    }
    return Promise.reject(error);
  }
);

export const formatApiError = (e) => {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Something went wrong.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
  return JSON.stringify(d);
};

export default api;
