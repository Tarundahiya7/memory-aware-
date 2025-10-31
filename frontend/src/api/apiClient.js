// frontend/src/api/apiClient.js
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

export const submitConfig = async (data) => {
  return await axios.post(`${API_BASE}/config/submit`, data);
};
