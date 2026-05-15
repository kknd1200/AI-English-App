import { supabase } from "./supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const token = data.session?.access_token;

  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }

  return token;
}

export async function fetchJson(path, options = {}) {
  const token = await getAccessToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `요청 실패: ${res.status}`);
  }

  return data;
}

export async function apiGetMyChild() {
  const data = await fetchJson("/api/me/child");
  return data.child;
}

export async function apiCreateChild({
  name,
  level = "beginner",
  ageGroup = "elementary",
}) {
  const data = await fetchJson("/api/me/child", {
    method: "POST",
    body: JSON.stringify({
      name,
      level,
      ageGroup,
    }),
  });

  return data.child;
}

export async function apiFetchProgress(childId) {
  const data = await fetchJson(
    `/api/progress?childId=${encodeURIComponent(childId)}`
  );

  return data.progress;
}

export async function apiFetchBadges(childId) {
  const data = await fetchJson(
    `/api/badges?childId=${encodeURIComponent(childId)}`
  );

  return data.badges || [];
}

export async function apiFetchTodayTopic(
  childId,
  refresh = false,
  category = ""
) {
  const params = new URLSearchParams({
    childId,
    refresh: String(refresh),
  });

  if (category) {
    params.set("category", category);
  }

  const data = await fetchJson(`/api/today-topic?${params.toString()}`);

  return data.topic;
}

export async function apiFetchConversation({ childId, topicId }) {
  const data = await fetchJson(
    `/api/conversation?childId=${encodeURIComponent(
      childId
    )}&topicId=${encodeURIComponent(topicId)}`
  );

  return data.conversation || [];
}

export async function apiSendVoiceChat({ childId, topicId, audioBlob }) {
  const token = await getAccessToken();

  const formData = new FormData();
  formData.append("childId", childId);
  formData.append("topicId", topicId);

  if (audioBlob) {
    formData.append("audio", audioBlob, "speech.webm");
  }

  const res = await fetch(`${API_BASE_URL}/api/voice-chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `요청 실패: ${res.status}`);
  }

  return data;
}

export async function apiFetchParentReport(childId) {
  const data = await fetchJson(
    `/api/parent-report?childId=${encodeURIComponent(childId)}`
  );

  return data.report;
}