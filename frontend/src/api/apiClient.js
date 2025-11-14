import axios from 'axios';
import { resolveBaseURL } from '../utils/env';

function normalize(url) {
  if (!url) return '';
  const u = String(url).trim();
  return u.replace(/\/+$/, '');
}

let BASE_URL = normalize(resolveBaseURL());

function makeClient() {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
  });
}

let API = makeClient();

export function setApiBaseURL(url) {
  BASE_URL = normalize(url || BASE_URL);
  API = makeClient();
  return BASE_URL;
}

async function getWithFallback(primary, fallback) {
  try {
    return await API.get(primary);
  } catch (e) {
    if (fallback) return API.get(fallback);
    throw e;
  }
}
async function postWithFallback(primary, payload, fallback) {
  try {
    return await API.post(primary, payload);
  } catch (e) {
    if (fallback) return API.post(fallback, payload);
    throw e;
  }
}

export const api = {
  refreshBaseURL() { API = makeClient(); },

  getSample() {
    return getWithFallback('/config/sample', '/sample');
  },

  sendConfig(data) {
    return postWithFallback('/config/submit', data, '/config');
  },

  simulateBaseline(data) {
    return postWithFallback('/simulate/baseline', data);
  },

  simulateMemoryAware(data) {
    return postWithFallback('/simulate/memory-aware', data);
  },

  compareSchedulers(data) {
    return postWithFallback('/compare', data, '/simulate/compare');
  },
};
