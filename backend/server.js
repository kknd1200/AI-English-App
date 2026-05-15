import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:4000";

const USE_MOCK_AI = process.env.USE_MOCK_AI === "true";
const ENABLE_TTS = process.env.ENABLE_TTS === "true";

const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
const OPENAI_TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

const tmpDir = path.join(__dirname, "tmp");
const generatedAudioDir = path.join(__dirname, "generated-audio");

fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(generatedAudioDir, { recursive: true });

function getAudioExtension(mimetype = "") {
  if (mimetype.includes("webm")) return ".webm";
  if (mimetype.includes("mp4")) return ".mp4";
  if (mimetype.includes("mpeg")) return ".mp3";
  if (mimetype.includes("wav")) return ".wav";
  if (mimetype.includes("ogg")) return ".ogg";
  return ".webm";
}

const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (req, file, cb) => {
    const ext = getAudioExtension(file.mimetype);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const openai = USE_MOCK_AI
  ? null
  : new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());
app.use("/generated-audio", express.static(generatedAudioDir));

app.get("/", (req, res) => {
  res.send("English AI backend is running. Use /api/health to check status.");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running",
    supabaseConnected: Boolean(process.env.SUPABASE_URL),
    mockAI: USE_MOCK_AI,
    enableTTS: ENABLE_TTS,
    textModel: USE_MOCK_AI ? "mock" : OPENAI_TEXT_MODEL,
    transcribeModel: USE_MOCK_AI ? "mock" : OPENAI_TRANSCRIBE_MODEL,
    ttsModel: ENABLE_TTS ? OPENAI_TTS_MODEL : "disabled",
  });
});

async function requireUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Missing Authorization Bearer token",
      });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Invalid or expired token",
      });
    }

    req.user = data.user;
    next();
  } catch (error) {
    next(error);
  }
}

function todayDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return todayDateString(date);
}

function calculateLevel(totalXp) {
  return Math.floor(totalXp / 100) + 1;
}

async function getOwnedChildOrThrow({ childId, userId }) {
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("id", childId)
    .eq("parent_user_id", userId)
    .single();

  if (error || !data) {
    const err = new Error("Child not found");
    err.status = 404;
    throw err;
  }

  return data;
}

function normalizeTopic(topic) {
  return {
    id: topic.id,
    childId: topic.child_id,
    date: topic.topic_date,
    title: topic.title,
    level: topic.level,
    goal: topic.goal,
    mainExpression: topic.main_expression || "",
    openingQuestion: topic.opening_question || "",
    openingQuestionKo: topic.opening_question_ko || "",
    warmup: topic.warmup || [],
    missions: topic.missions || [],
    parentNote: topic.parent_note || "",
    createdAt: topic.created_at,
  };
}

function normalizeConversation(row) {
  return {
    id: row.id,
    childId: row.child_id,
    topicId: row.topic_id,
    role: row.role,
    text: row.message,
    koreanMeaning: row.korean_meaning || "",
    aiPronunciation: row.ai_pronunciation || "",
    correction: row.correction || "",
    nextQuestion: row.next_question || "",
    emotion: row.emotion || "",
    xp: row.xp || 0,
    audioPath: row.audio_path || "",
    audioUrl: row.audio_path ? `${BACKEND_ORIGIN}${row.audio_path}` : "",
    pronunciationScore: row.pronunciation_score || 0,
    pronunciationFeedback: row.pronunciation_feedback || "",
    betterSentence: row.better_sentence || "",
    practiceSentence: row.practice_sentence || "",
    createdAt: row.created_at,
  };
}

function normalizeProgress(progress, mission) {
  return {
    totalXp: progress?.total_xp || 0,
    level: progress?.level || 1,
    streakDays: progress?.streak_days || 0,
    lastStudyDate: progress?.last_study_date || null,
    totalSpeakingCount: progress?.total_speaking_count || 0,
    todaySpeakingCount: mission?.speaking_count || 0,
    todayTargetCount: mission?.target_count || 3,
    todayCompleted: mission?.completed || false,
    todayEarnedXp: mission?.earned_xp || 0,
  };
}
const BADGE_DEFINITIONS = [
  {
    code: "first_speaking",
    name: "첫 영어 말하기",
    description: "첫 음성 영어 회화를 완료했어요.",
    emoji: "🎤",
  },
  {
    code: "daily_speaker",
    name: "오늘의 스피커",
    description: "하루 말하기 목표를 완료했어요.",
    emoji: "🔥",
  },
  {
    code: "three_day_streak",
    name: "꾸준함 스타터",
    description: "3일 연속으로 영어를 연습했어요.",
    emoji: "🌱",
  },
  {
    code: "level_2",
    name: "레벨업 시작",
    description: "레벨 2를 달성했어요.",
    emoji: "⭐",
  },
];

function normalizeBadge(row) {
  const badge = row.badges || row;

  return {
    id: row.id,
    badgeId: badge.id,
    code: badge.code,
    name: badge.name,
    description: badge.description,
    emoji: badge.emoji,
    earnedAt: row.earned_at || null,
  };
}

async function ensureBadgesSeeded() {
  const { error } = await supabase.from("badges").upsert(BADGE_DEFINITIONS, {
    onConflict: "code",
  });

  if (error) {
    throw error;
  }
}

async function getChildBadges(childId) {
  await ensureBadgesSeeded();

  const { data, error } = await supabase
    .from("child_badges")
    .select(
      `
      id,
      earned_at,
      badges (
        id,
        code,
        name,
        description,
        emoji
      )
    `
    )
    .eq("child_id", childId)
    .order("earned_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeBadge);
}

async function awardBadgeByCode(childId, code) {
  await ensureBadgesSeeded();

  const badgeResult = await supabase
    .from("badges")
    .select("*")
    .eq("code", code)
    .single();

  if (badgeResult.error || !badgeResult.data) {
    return null;
  }

  const existing = await supabase
    .from("child_badges")
    .select(
      `
      id,
      earned_at,
      badges (
        id,
        code,
        name,
        description,
        emoji
      )
    `
    )
    .eq("child_id", childId)
    .eq("badge_id", badgeResult.data.id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return null;
  }

  const inserted = await supabase
    .from("child_badges")
    .insert({
      child_id: childId,
      badge_id: badgeResult.data.id,
    })
    .select(
      `
      id,
      earned_at,
      badges (
        id,
        code,
        name,
        description,
        emoji
      )
    `
    )
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return normalizeBadge(inserted.data);
}

async function evaluateAndAwardBadges({ childId, progress, mission, reward }) {
  const newBadges = [];

  if ((progress.total_speaking_count || 0) >= 1) {
    const badge = await awardBadgeByCode(childId, "first_speaking");
    if (badge) newBadges.push(badge);
  }

  if (mission.completed || reward.newlyCompletedToday) {
    const badge = await awardBadgeByCode(childId, "daily_speaker");
    if (badge) newBadges.push(badge);
  }

  if ((progress.streak_days || 0) >= 3) {
    const badge = await awardBadgeByCode(childId, "three_day_streak");
    if (badge) newBadges.push(badge);
  }

  if ((progress.level || 1) >= 2) {
    const badge = await awardBadgeByCode(childId, "level_2");
    if (badge) newBadges.push(badge);
  }

  const badges = await getChildBadges(childId);

  return {
    newBadges,
    badges,
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("AI response was not valid JSON");
  }
}
function getCategoryInstruction(category = "") {
  const map = {
    space: {
      label: "우주",
      instruction:
        "우주, 달, 화성, 우주선, 외계인, 별, 행성 같은 소재를 사용해라.",
    },
    dinosaur: {
      label: "공룡",
      instruction:
        "공룡 공원, 티라노사우루스, 트리케라톱스, 공룡 알, 공룡 친구 같은 소재를 사용해라.",
    },
    animal: {
      label: "동물",
      instruction:
        "동물원, 반려동물, 귀여운 동물, 동물 친구, 동물 먹이 같은 소재를 사용해라.",
    },
    food: {
      label: "음식",
      instruction:
        "피자, 쿠키, 아이스크림, 과일, 도시락, 간식, 좋아하는 음식 같은 소재를 사용해라.",
    },
    amusement: {
      label: "놀이공원",
      instruction:
        "놀이공원, 회전목마, 기차, 관람차, 롤러코스터, 풍선 같은 소재를 사용해라.",
    },
    magic: {
      label: "마법",
      instruction:
        "마법 가게, 마법 지팡이, 마법 동물, 마법 주문, 마법 학교 같은 소재를 사용해라.",
    },
    school: {
      label: "학교",
      instruction:
        "교실, 친구, 선생님, 급식, 미술 시간, 체육 시간, 준비물 같은 소재를 사용해라.",
    },
    friend: {
      label: "친구",
      instruction:
        "친구와 놀기, 같이 먹기, 장난감 공유하기, 초대하기, 고맙다고 말하기 같은 소재를 사용해라.",
    },
    birthday: {
      label: "생일",
      instruction:
        "생일파티, 선물, 케이크, 초대장, 친구들과 축하하기 같은 소재를 사용해라.",
    },
    game: {
      label: "게임",
      instruction:
        "안전하고 건전한 게임, 퍼즐, 보드게임, 미니게임, 점수 얻기 같은 소재를 사용해라.",
    },
  };

  return (
    map[category] || {
      label: "랜덤",
      instruction:
        "초등학생이 좋아할 만한 안전하고 재미있는 소재를 자유롭게 선택해라.",
    }
  );
}

function createMockTodayTopic({ child, currentTitle = "", category = "" }) {
  const topics = {
    space: [
      {
        title: "우주선에서 음식 고르기",
        goal: "우주선 상황에서 먹고 싶은 음식을 자유롭게 말하기",
        mainExpression: "I want to try pizza.",
        openingQuestion: "What food do you want to try in a spaceship?",
        openingQuestionKo: "우주선에서 어떤 음식을 먹어보고 싶니?",
        warmup: ["Spaceship", "Food", "I want to try pizza."],
        missions: [
          "먹어보고 싶은 음식 말하기",
          "왜 좋아하는지 말하기",
          "AI에게 좋아하는 음식 물어보기",
        ],
        parentNote:
          "오늘은 우주선이라는 상상 상황에서 아이가 먹고 싶은 음식을 자유롭게 영어로 말하는 연습을 합니다.",
      },
      {
        title: "달에서 하루 보내기",
        goal: "달에서 하고 싶은 일을 영어로 말하기",
        mainExpression: "I want to jump on the moon.",
        openingQuestion: "What do you want to do on the moon?",
        openingQuestionKo: "달에서 무엇을 해보고 싶니?",
        warmup: ["Moon", "Jump", "I want to jump."],
        missions: [
          "달에서 하고 싶은 일 말하기",
          "왜 하고 싶은지 말하기",
          "AI에게 달에서 뭘 하고 싶은지 물어보기",
        ],
        parentNote:
          "오늘은 달이라는 상상 상황에서 아이가 하고 싶은 일을 영어로 말하는 연습을 합니다.",
      },
    ],

    dinosaur: [
      {
        title: "공룡 공원에서 친구 만나기",
        goal: "공룡 공원에서 보고 싶은 공룡을 말하기",
        mainExpression: "I want to see a T-Rex.",
        openingQuestion: "What dinosaur do you want to see?",
        openingQuestionKo: "어떤 공룡을 보고 싶니?",
        warmup: ["Dinosaur", "T-Rex", "I want to see a T-Rex."],
        missions: [
          "보고 싶은 공룡 말하기",
          "공룡의 크기 말하기",
          "무서운지 귀여운지 말하기",
        ],
        parentNote:
          "오늘은 공룡 공원 상황에서 아이가 보고 싶은 공룡을 영어로 말하는 연습을 합니다.",
      },
    ],

    animal: [
      {
        title: "동물원에서 동물 만나기",
        goal: "좋아하는 동물을 영어로 말하기",
        mainExpression: "I like pandas.",
        openingQuestion: "What animal do you want to meet?",
        openingQuestionKo: "어떤 동물을 만나보고 싶니?",
        warmup: ["Animal", "Panda", "I like pandas."],
        missions: [
          "좋아하는 동물 말하기",
          "동물이 귀여운지 말하기",
          "동물에게 줄 먹이 말하기",
        ],
        parentNote:
          "오늘은 동물원 상황에서 좋아하는 동물과 이유를 영어로 말하는 연습을 합니다.",
      },
    ],

    food: [
      {
        title: "맛있는 간식 고르기",
        goal: "좋아하는 음식을 영어로 말하기",
        mainExpression: "I like pizza.",
        openingQuestion: "What food do you like?",
        openingQuestionKo: "어떤 음식을 좋아하니?",
        warmup: ["Food", "Pizza", "I like pizza."],
        missions: [
          "좋아하는 음식 말하기",
          "왜 좋아하는지 말하기",
          "AI에게 좋아하는 음식 물어보기",
        ],
        parentNote:
          "오늘은 좋아하는 음식을 영어로 말하고 이유를 말하는 연습을 합니다.",
      },
    ],

    amusement: [
      {
        title: "놀이공원에서 하루 보내기",
        goal: "놀이공원에서 타고 싶은 것을 말하기",
        mainExpression: "I want to ride the train.",
        openingQuestion: "What ride do you want to try at the amusement park?",
        openingQuestionKo: "놀이공원에서 어떤 놀이기구를 타보고 싶니?",
        warmup: ["Ride", "Train", "I want to ride the train."],
        missions: [
          "타고 싶은 놀이기구 말하기",
          "왜 타고 싶은지 말하기",
          "친구에게 같이 타자고 말하기",
        ],
        parentNote:
          "오늘은 놀이공원 상황에서 아이가 원하는 것과 이유를 영어로 말하는 연습을 합니다.",
      },
    ],

    magic: [
      {
        title: "마법 가게에서 물건 고르기",
        goal: "마법 가게에서 갖고 싶은 물건을 말하기",
        mainExpression: "I want a magic wand.",
        openingQuestion: "What magic item do you want?",
        openingQuestionKo: "어떤 마법 물건을 갖고 싶니?",
        warmup: ["Magic", "Wand", "I want a magic wand."],
        missions: [
          "갖고 싶은 마법 물건 말하기",
          "그 물건으로 하고 싶은 일 말하기",
          "고맙다고 말하기",
        ],
        parentNote:
          "오늘은 마법 가게 상황에서 원하는 물건과 이유를 영어로 말하는 연습을 합니다.",
      },
    ],

    school: [
      {
        title: "학교에서 좋아하는 시간 말하기",
        goal: "학교에서 좋아하는 활동을 영어로 말하기",
        mainExpression: "I like art class.",
        openingQuestion: "What class do you like at school?",
        openingQuestionKo: "학교에서 어떤 수업을 좋아하니?",
        warmup: ["School", "Art", "I like art class."],
        missions: [
          "좋아하는 수업 말하기",
          "왜 좋아하는지 말하기",
          "친구와 같이 하고 싶은 활동 말하기",
        ],
        parentNote:
          "오늘은 학교생활과 좋아하는 수업을 영어로 말하는 연습을 합니다.",
      },
    ],

    friend: [
      {
        title: "친구와 놀기",
        goal: "친구와 하고 싶은 일을 영어로 말하기",
        mainExpression: "I want to play soccer.",
        openingQuestion: "What do you want to play with your friend?",
        openingQuestionKo: "친구와 무엇을 하며 놀고 싶니?",
        warmup: ["Friend", "Play", "I want to play soccer."],
        missions: [
          "친구와 하고 싶은 일 말하기",
          "친구에게 같이 하자고 말하기",
          "고맙다고 말하기",
        ],
        parentNote:
          "오늘은 친구와 놀기 상황에서 원하는 활동을 영어로 말하는 연습을 합니다.",
      },
    ],

    birthday: [
      {
        title: "생일파티 준비하기",
        goal: "생일파티에서 원하는 것을 영어로 말하기",
        mainExpression: "I want a chocolate cake.",
        openingQuestion: "What do you want for your birthday party?",
        openingQuestionKo: "생일파티에 무엇이 있으면 좋겠니?",
        warmup: ["Birthday", "Cake", "I want a cake."],
        missions: [
          "원하는 선물 말하기",
          "먹고 싶은 케이크 말하기",
          "친구를 초대하는 말 하기",
        ],
        parentNote:
          "오늘은 생일파티 상황에서 원하는 것과 이유를 영어로 말하는 연습을 합니다.",
      },
    ],

    game: [
      {
        title: "재미있는 게임 고르기",
        goal: "하고 싶은 게임을 영어로 말하기",
        mainExpression: "I want to play a puzzle game.",
        openingQuestion: "What game do you want to play?",
        openingQuestionKo: "어떤 게임을 하고 싶니?",
        warmup: ["Game", "Puzzle", "I want to play a game."],
        missions: [
          "하고 싶은 게임 말하기",
          "왜 재미있는지 말하기",
          "AI에게 같이 하자고 말하기",
        ],
        parentNote:
          "오늘은 안전하고 건전한 게임 상황에서 원하는 활동을 영어로 말하는 연습을 합니다.",
      },
    ],
  };

  const allTopics = Object.values(topics).flat();
  const selectedTopics = topics[category] || allTopics;

  const candidates = selectedTopics.filter((topic) => topic.title !== currentTitle);
  const pool = candidates.length > 0 ? candidates : selectedTopics;

  const randomTopic = pool[Math.floor(Math.random() * pool.length)];

  return {
    ...randomTopic,
    level: child.level || "beginner",
  };
}

async function createAITodayTopic({ child, currentTitle = "", category = "" }) {
  const categoryInfo = getCategoryInstruction(category);

  if (USE_MOCK_AI) {
    return createMockTodayTopic({ child, currentTitle, category });
  }

  if (!process.env.OPENAI_API_KEY) {
    return createMockTodayTopic({ child, currentTitle, category });
  }
const categoryInfo = getCategoryInstruction(category);
const prompt = `
너는 초등학생용 AI 영어회화 앱의 상황극 주제 생성기다.

목표:
초등학생이 흥미를 느낄 만한 영어 음성 회화 상황을 하나 만들어라.

아이 정보:
- 이름: ${child.name}
- 영어 레벨: ${child.level || "beginner"}
- 나이대: ${child.age_group || "elementary"}


직전 또는 현재 주제:
${currentTitle || "없음"}

조건:
- 직전 주제와 다른 주제로 만들어라.
- 고정 표현을 반복시키는 주제가 아니라, 아이가 자유롭게 대답할 수 있는 질문형 상황극이어야 한다.
- openingQuestion은 AI가 아이에게 처음 던질 자연스러운 영어 질문이다.
- openingQuestionKo는 openingQuestion의 한국어 뜻이다.
- mainExpression은 참고 표현일 뿐, 아이에게 강제로 반복시키지 않는다.
- 초등학생이 좋아할 만한 소재를 사용한다: 우주, 공룡, 마법, 동물, 놀이공원, 간식, 친구, 학교, 가족, 여행, 생일, 게임 등.
- 위험, 폭력, 성적 내용, 정치, 종교, 의료 조언, 공포, 개인정보 요구 주제는 피한다.
- 영어 난이도는 초급 초등학생 기준이다.
- JSON만 출력한다.

좋은 예:
title: 우주선에서 음식 고르기
openingQuestion: What food do you want to try in a spaceship?
openingQuestionKo: 우주선에서 어떤 음식을 먹어보고 싶니?

나쁜 예:
openingQuestion: I want some cookies.
`.trim();

  try {
    const response = await openai.responses.create({
      model: OPENAI_TEXT_MODEL,
      input: [
        {
          role: "system",
          content:
            "You create safe, fun, question-based English speaking role-play topics for Korean elementary students. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "daily_topic",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              level: { type: "string" },
              goal: { type: "string" },
              mainExpression: { type: "string" },
              openingQuestion: { type: "string" },
              openingQuestionKo: { type: "string" },
              warmup: {
                type: "array",
                items: { type: "string" },
              },
              missions: {
                type: "array",
                items: { type: "string" },
              },
              parentNote: { type: "string" },
            },
            required: [
              "title",
              "level",
              "goal",
              "mainExpression",
              "openingQuestion",
              "openingQuestionKo",
              "warmup",
              "missions",
              "parentNote",
            ],
          },
        },
      },
    });

    const parsed = safeJsonParse(response.output_text);

    return {
      title: parsed.title,
      level: parsed.level || child.level || "beginner",
      goal: parsed.goal,
      mainExpression: parsed.mainExpression || "",
      openingQuestion: parsed.openingQuestion || "",
      openingQuestionKo: parsed.openingQuestionKo || "",
      warmup: Array.isArray(parsed.warmup) ? parsed.warmup : [],
      missions: Array.isArray(parsed.missions) ? parsed.missions : [],
      parentNote: parsed.parentNote || "",
    };
  } catch (error) {
    console.error("OpenAI topic generation failed. Falling back to mock topic.", {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    return createMockTodayTopic({ child, currentTitle, category });
  }
}

async function transcribeAudio(filePath) {
  if (USE_MOCK_AI) {
    return "I like pizza.";
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  try {
    const stats = fs.statSync(filePath);

    console.log("TRANSCRIBE FILE:", {
      filePath,
      size: stats.size,
      model: OPENAI_TRANSCRIBE_MODEL,
    });

    if (stats.size < 1000) {
      return "";
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: OPENAI_TRANSCRIBE_MODEL,
      language: "en",
      prompt:
        "The speaker is a Korean elementary student practicing simple English conversation. Possible phrases include I like pizza, I want to try pizza, I like dinosaurs, I want to see a T-Rex, What is your name.",
    });

    const text = String(transcription.text || "").trim();

    console.log("TRANSCRIBED TEXT:", text);

    return text;
  } catch (error) {
    console.error("Transcription failed.", {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    return "";
  }
}

async function createVoiceChatReply({ child, topic, transcript }) {
  const categoryInfo = { label: "현재 주제", instruction: "" };
  const cleanTranscript = String(transcript || "").trim();
  const main = topic.main_expression || "";
  const openingQuestion = topic.opening_question || "";

  if (USE_MOCK_AI) {
    return {
      userEnglish: cleanTranscript || "I like pizza.",
      userKorean: "나는 피자를 좋아해요.",
      aiEnglish: "Pizza in space sounds fun! Why do you like pizza?",
      aiKorean: "우주에서 피자를 먹는 건 재미있겠어요! 왜 피자를 좋아하나요?",
      aiPronunciation: "피자 인 스페이스 사운즈 펀! 와이 두 유 라이크 피자?",
      correction: "",
      nextQuestion: "Why do you like pizza?",
      xp: 10,
      emotion: "curious",
      pronunciationScore: 80,
      pronunciationFeedback:
        "좋아요. 음성 인식 결과 기준으로 의미가 잘 전달됐어요.",
      betterSentence: cleanTranscript || "I like pizza.",
      practiceSentence: cleanTranscript || "I like pizza.",
    };
  }

  const prompt = `
너는 초등학생용 AI 영어회화 선생님이다.

중요:
- 아이에게 mainExpression을 강제로 반복시키지 마라.
- 아이가 말한 음식/동물/물건/생각을 중심으로 대화를 이어가라.
- AI 답변은 아이 발화에 대한 반응 + 짧은 추가 질문으로 만든다.
- 아이가 pizza라고 말하면 cookies가 아니라 pizza에 대해 이어가라.
- 오늘 주제와 다소 달라도 아이의 말을 먼저 받아준다.
- AI 영어 답변은 1~2문장으로 짧고 자연스럽게 만든다.
- aiPronunciation은 AI 영어 답변을 한국어 발음처럼 읽기 쉽게 적어준다.
- aiPronunciation은 초등학생이 따라 읽기 쉽게 만든다.
- 단, 너무 긴 설명은 하지 말고 발음만 적는다.

오늘의 주제:
- 제목: ${topic.title}
- 목표: ${topic.goal}
- 참고 표현: ${main}
- 시작 질문: ${openingQuestion}

아이 정보:
- 이름: ${child.name}
- 레벨: ${child.level || "beginner"}

음성 인식으로 추출된 아이의 영어 문장:
${cleanTranscript}

해야 할 일:
1. 아이가 말한 영어를 자연스럽게 정리한다.
2. 그 영어 문장의 한국어 뜻을 만든다.
3. 아이가 말한 내용을 먼저 받아주는 AI 영어 답변을 만든다.
4. AI 답변의 한국어 뜻을 만든다.
5. AI 답변의 한국어식 발음 가이드를 만든다.
6. 교정이 필요하면 부드럽게 제안한다.
7. 다음 질문을 하나 만든다.
8. 발음 점수는 음성 인식 텍스트 기준의 추정 점수로만 만든다.
9. 발음 피드백은 과장하지 말고 한국어로 친절하게 작성한다.
10. betterSentence는 아이 발화의 더 자연스러운 표현이다.
11. practiceSentence는 아이가 반복 연습할 짧은 문장이다.
12. JSON만 출력한다.

좋은 예:
아이: I like pizza.
AI: Pizza in space sounds fun! Why do you like pizza?
뜻: 우주에서 피자를 먹는 건 재미있겠어요! 왜 피자를 좋아하나요?
발음: 피자 인 스페이스 사운즈 펀! 와이 두 유 라이크 피자?

나쁜 예:
AI: I want some cookies.
`.trim();

  try {
    const response = await openai.responses.create({
      model: OPENAI_TEXT_MODEL,
      input: [
        {
          role: "system",
          content:
            "You are a kind English speaking tutor for Korean elementary students. Continue the conversation naturally. Do not force repetition of lesson expressions. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "voice_chat_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              userEnglish: { type: "string" },
              userKorean: { type: "string" },
              aiEnglish: { type: "string" },
              aiKorean: { type: "string" },
              aiPronunciation: { type: "string" },
              correction: { type: "string" },
              nextQuestion: { type: "string" },
              emotion: { type: "string" },
              xp: { type: "number" },
              pronunciationScore: { type: "number" },
              pronunciationFeedback: { type: "string" },
              betterSentence: { type: "string" },
              practiceSentence: { type: "string" },
            },
            required: [
              "userEnglish",
              "userKorean",
              "aiEnglish",
              "aiKorean",
              "aiPronunciation",
              "correction",
              "nextQuestion",
              "emotion",
              "xp",
              "pronunciationScore",
              "pronunciationFeedback",
              "betterSentence",
              "practiceSentence",
            ],
          },
        },
      },
    });

    const parsed = safeJsonParse(response.output_text);

    return {
      userEnglish: String(parsed.userEnglish || cleanTranscript || "").trim(),
      userKorean: parsed.userKorean || "",
      aiEnglish: parsed.aiEnglish || "That sounds fun! Tell me more.",
      aiKorean: parsed.aiKorean || "재미있겠어요! 더 말해 주세요.",
      aiPronunciation:
        parsed.aiPronunciation || "댓 사운즈 펀! 텔 미 모어.",
      correction: parsed.correction || "",
      nextQuestion: parsed.nextQuestion || "Can you tell me more?",
      emotion: parsed.emotion || "curious",
      xp: Number(parsed.xp || 10),
      pronunciationScore: Number(parsed.pronunciationScore || 80),
      pronunciationFeedback:
        parsed.pronunciationFeedback ||
        "좋아요. 음성 인식 결과 기준으로 의미가 잘 전달됐어요.",
      betterSentence: parsed.betterSentence || cleanTranscript,
      practiceSentence:
        parsed.practiceSentence || parsed.betterSentence || cleanTranscript,
    };
  } catch (error) {
    console.error("Voice chat AI reply failed. Falling back to natural mock reply.", {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    const lower = cleanTranscript.toLowerCase();

    let userKorean = "영어로 대답했어요.";
    let aiEnglish = "That sounds fun! Can you tell me more?";
    let aiKorean = "재미있겠어요! 조금 더 말해줄 수 있나요?";
    let aiPronunciation = "댓 사운즈 펀! 캔 유 텔 미 모어?";
    let betterSentence = cleanTranscript || "I like it.";
    let nextQuestion = "Can you tell me more?";

    if (lower.includes("pizza")) {
      userKorean = "나는 피자를 좋아해요.";
      betterSentence = lower.includes("want")
        ? "I want to try pizza."
        : "I like pizza.";
      aiEnglish = "Pizza in space sounds fun! Why do you like pizza?";
      aiKorean =
        "우주에서 피자를 먹는 건 재미있겠어요! 왜 피자를 좋아하나요?";
      aiPronunciation =
        "피자 인 스페이스 사운즈 펀! 와이 두 유 라이크 피자?";
      nextQuestion = "Why do you like pizza?";
    } else if (lower.includes("dinosaur")) {
      userKorean = "나는 공룡에 대해 말했어요.";
      betterSentence = cleanTranscript || "I like dinosaurs.";
      aiEnglish =
        "Dinosaurs are exciting! Which dinosaur do you like best?";
      aiKorean =
        "공룡은 정말 신나요! 어떤 공룡을 가장 좋아하나요?";
      aiPronunciation =
        "다이너소어즈 아 익사이팅! 위치 다이너소어 두 유 라이크 베스트?";
      nextQuestion = "Which dinosaur do you like best?";
    }

    return {
      userEnglish: cleanTranscript || "I like it.",
      userKorean,
      aiEnglish,
      aiKorean,
      aiPronunciation,
      correction:
        cleanTranscript && cleanTranscript !== betterSentence
          ? `${cleanTranscript} → ${betterSentence}`
          : "",
      nextQuestion,
      emotion: "curious",
      xp: 10,
      pronunciationScore: 78,
      pronunciationFeedback:
        "좋아요. 음성 인식 결과 기준으로 의미가 전달됐어요.",
      betterSentence,
      practiceSentence: betterSentence,
    };
  }
}

async function createSpeechFile({ text }) {
  if (!ENABLE_TTS || USE_MOCK_AI || !text) {
    return "";
  }

  try {
    const fileName = `${Date.now()}-${crypto.randomUUID()}.mp3`;
    const outputPath = path.join(generatedAudioDir, fileName);

    const audio = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
    });

    const buffer = Buffer.from(await audio.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    return `/generated-audio/${fileName}`;
  } catch (error) {
    console.error("TTS failed. Continuing without audio.", {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    return "";
  }
}

async function getProgressAndMission(childId) {
  const today = todayDateString();

  let progressResult = await supabase
    .from("learning_progress")
    .select("*")
    .eq("child_id", childId)
    .maybeSingle();

  if (progressResult.error) {
    throw progressResult.error;
  }

  if (!progressResult.data) {
    const created = await supabase
      .from("learning_progress")
      .insert({
        child_id: childId,
        total_xp: 0,
        level: 1,
        streak_days: 0,
        last_study_date: null,
        total_speaking_count: 0,
      })
      .select("*")
      .single();

    if (created.error) {
      throw created.error;
    }

    progressResult = created;
  }

  let missionResult = await supabase
    .from("daily_missions")
    .select("*")
    .eq("child_id", childId)
    .eq("mission_date", today)
    .maybeSingle();

  if (missionResult.error) {
    throw missionResult.error;
  }

  if (!missionResult.data) {
    const created = await supabase
      .from("daily_missions")
      .insert({
        child_id: childId,
        mission_date: today,
        speaking_count: 0,
        target_count: 3,
        completed: false,
        earned_xp: 0,
      })
      .select("*")
      .single();

    if (created.error) {
      throw created.error;
    }

    missionResult = created;
  }

  return {
    progress: progressResult.data,
    mission: missionResult.data,
  };
}

async function applyVoiceReward({ childId, baseXp = 10 }) {
  const today = todayDateString();
  const yesterday = yesterdayDateString();

  const { progress, mission } = await getProgressAndMission(childId);

  const wasCompleted = mission.completed;
  const nextSpeakingCount = mission.speaking_count + 1;
  const completed = nextSpeakingCount >= mission.target_count;

  const completionBonus = !wasCompleted && completed ? 20 : 0;
  const earnedXp = baseXp + completionBonus;

  let nextStreakDays = progress.streak_days || 0;

  if (progress.last_study_date === today) {
    nextStreakDays = progress.streak_days || 1;
  } else if (progress.last_study_date === yesterday) {
    nextStreakDays = (progress.streak_days || 0) + 1;
  } else {
    nextStreakDays = 1;
  }

  const nextTotalXp = (progress.total_xp || 0) + earnedXp;
  const nextLevel = calculateLevel(nextTotalXp);
  const leveledUp = nextLevel > (progress.level || 1);

  const updatedProgress = await supabase
    .from("learning_progress")
    .update({
      total_xp: nextTotalXp,
      level: nextLevel,
      streak_days: nextStreakDays,
      last_study_date: today,
      total_speaking_count: (progress.total_speaking_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", progress.id)
    .select("*")
    .single();

  if (updatedProgress.error) {
    throw updatedProgress.error;
  }

  const updatedMission = await supabase
    .from("daily_missions")
    .update({
      speaking_count: nextSpeakingCount,
      completed,
      earned_xp: (mission.earned_xp || 0) + earnedXp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mission.id)
    .select("*")
    .single();

  if (updatedMission.error) {
    throw updatedMission.error;
  }

  const reward = {
    earnedXp,
    baseXp,
    completionBonus,
    leveledUp,
    completedToday: completed,
    newlyCompletedToday: !wasCompleted && completed,
    progress: normalizeProgress(updatedProgress.data, updatedMission.data),
  };

  const badgeResult = await evaluateAndAwardBadges({
    childId,
    progress: updatedProgress.data,
    mission: updatedMission.data,
    reward,
  });

  return {
    ...reward,
    newBadges: badgeResult.newBadges,
    badges: badgeResult.badges,
  };
}

app.get("/api/me/child", requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("children")
      .select("*")
      .eq("parent_user_id", req.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    res.json({
      child: data,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/me/child", requireUser, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const level = String(req.body.level || "beginner");
    const ageGroup = String(req.body.ageGroup || "elementary");

    if (!name) {
      return res.status(400).json({
        error: "name is required",
      });
    }

    const { data, error } = await supabase
      .from("children")
      .insert({
        parent_user_id: req.user.id,
        name,
        level,
        age_group: ageGroup,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await getProgressAndMission(data.id);

    res.status(201).json({
      child: data,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/progress", requireUser, async (req, res, next) => {
  try {
    const childId = String(req.query.childId || "").trim();

    if (!childId) {
      return res.status(400).json({
        error: "childId is required",
      });
    }
app.get("/api/badges", requireUser, async (req, res, next) => {
  try {
    const childId = String(req.query.childId || "").trim();

    if (!childId) {
      return res.status(400).json({
        error: "childId is required",
      });
    }

    await getOwnedChildOrThrow({
      childId,
      userId: req.user.id,
    });

    const badges = await getChildBadges(childId);

    res.json({
      badges,
    });
  } catch (error) {
    next(error);
  }
});

    await getOwnedChildOrThrow({
      childId,
      userId: req.user.id,
    });

    const { progress, mission } = await getProgressAndMission(childId);

    res.json({
      progress: normalizeProgress(progress, mission),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/today-topic", requireUser, async (req, res, next) => {
  try {
    const childId = String(req.query.childId || "").trim();
    const refresh = String(req.query.refresh || "false") === "true";
    const category = String(req.query.category || "").trim();

    if (!childId) {
      return res.status(400).json({
        error: "childId is required",
      });
    }

    const child = await getOwnedChildOrThrow({
      childId,
      userId: req.user.id,
    });

    const today = todayDateString();

    const existing = await supabase
      .from("daily_topics")
      .select("*")
      .eq("child_id", childId)
      .eq("topic_date", today)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data && !refresh) {
      return res.json({
        source: "cache",
        topic: normalizeTopic(existing.data),
      });
    }

  const aiTopic = await createAITodayTopic({
  child,
  currentTitle: existing.data?.title || "",
  category,
});
    let savedTopic;

    if (existing.data && refresh) {
      const deletedConversations = await supabase
        .from("conversations")
        .delete()
        .eq("child_id", childId)
        .eq("topic_id", existing.data.id);

      if (deletedConversations.error) {
        throw deletedConversations.error;
      }

      const updated = await supabase
        .from("daily_topics")
        .update({
          title: aiTopic.title,
          level: aiTopic.level,
          goal: aiTopic.goal,
          main_expression: aiTopic.mainExpression,
          opening_question: aiTopic.openingQuestion,
          opening_question_ko: aiTopic.openingQuestionKo,
          warmup: aiTopic.warmup,
          missions: aiTopic.missions,
          parent_note: aiTopic.parentNote,
        })
        .eq("id", existing.data.id)
        .select("*")
        .single();

      if (updated.error) {
        throw updated.error;
      }

      savedTopic = updated.data;
    } else {
      const inserted = await supabase
        .from("daily_topics")
        .insert({
          child_id: childId,
          topic_date: today,
          title: aiTopic.title,
          level: aiTopic.level,
          goal: aiTopic.goal,
          main_expression: aiTopic.mainExpression,
          opening_question: aiTopic.openingQuestion,
          opening_question_ko: aiTopic.openingQuestionKo,
          warmup: aiTopic.warmup,
          missions: aiTopic.missions,
          parent_note: aiTopic.parentNote,
        })
        .select("*")
        .single();

      if (inserted.error) {
        throw inserted.error;
      }

      savedTopic = inserted.data;
    }

    const intro = await supabase.from("conversations").insert({
      child_id: childId,
      topic_id: savedTopic.id,
      role: "ai",
      message:
        savedTopic.opening_question ||
        `Hi! ${savedTopic.title} sounds fun. What do you want to say?`,
      korean_meaning:
        savedTopic.opening_question_ko ||
        "오늘 주제에 대해 영어로 자유롭게 말해보세요.",
      ai_pronunciation: "",  
      correction: "",
      next_question: savedTopic.opening_question || "",
      emotion: "curious",
      xp: 0,
      audio_path: "",
      pronunciation_score: 0,
      pronunciation_feedback: "",
      better_sentence: "",
      practice_sentence: "",
    });

    if (intro.error) {
      throw intro.error;
    }

    res.json({
      source: refresh ? "refreshed" : "generated",
      topic: normalizeTopic(savedTopic),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/conversation", requireUser, async (req, res, next) => {
  try {
    const childId = String(req.query.childId || "").trim();
    const topicId = String(req.query.topicId || "").trim();

    if (!childId) {
      return res.status(400).json({ error: "childId is required" });
    }

    if (!topicId) {
      return res.status(400).json({ error: "topicId is required" });
    }

    await getOwnedChildOrThrow({
      childId,
      userId: req.user.id,
    });

    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("child_id", childId)
      .eq("topic_id", topicId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    res.json({
      conversation: (data || []).map(normalizeConversation),
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/voice-chat",
  requireUser,
  upload.single("audio"),
  async (req, res, next) => {
    const uploadedFilePath = req.file?.path;

    try {
      const childId = String(req.body.childId || "").trim();
      const topicId = String(req.body.topicId || "").trim();

      console.log("VOICE CHAT REQUEST:", {
        childId,
        topicId,
        hasFile: Boolean(req.file),
        filePath: req.file?.path,
        fileSize: req.file?.size,
        mimeType: req.file?.mimetype,
      });

      if (!childId) {
        return res.status(400).json({ error: "childId is required" });
      }

      if (!topicId) {
        return res.status(400).json({ error: "topicId is required" });
      }

      if (!req.file && !USE_MOCK_AI) {
        return res.status(400).json({ error: "audio file is required" });
      }

      const child = await getOwnedChildOrThrow({
        childId,
        userId: req.user.id,
      });

      const topicResult = await supabase
        .from("daily_topics")
        .select("*")
        .eq("id", topicId)
        .eq("child_id", childId)
        .single();

      if (topicResult.error || !topicResult.data) {
        return res.status(404).json({
          error: "Topic not found",
        });
      }

      const topic = topicResult.data;
      const transcript = await transcribeAudio(uploadedFilePath);

      console.log("VOICE CHAT TRANSCRIPT:", transcript);

      if (!transcript || transcript.trim().length === 0) {
        return res.status(400).json({
          error:
            "음성이 인식되지 않았습니다. OpenAI API 결제/사용량 한도를 확인하거나, 마이크를 가까이 두고 다시 말해보세요.",
        });
      }

      const reply = await createVoiceChatReply({
        child,
        topic,
        transcript,
      });

      const aiAudioPath = await createSpeechFile({
        text: reply.aiEnglish,
      });

      const savedUser = await supabase
        .from("conversations")
        .insert({
          child_id: childId,
          topic_id: topicId,
          role: "user",
          message: reply.userEnglish,
          korean_meaning: reply.userKorean,
          ai_pronunciation: "",
          correction: reply.correction,
          next_question: "",
          emotion: "",
          xp: 0,
          audio_path: "",
          pronunciation_score: reply.pronunciationScore,
          pronunciation_feedback: reply.pronunciationFeedback,
          better_sentence: reply.betterSentence,
          practice_sentence: reply.practiceSentence,
        })
        .select("*")
        .single();

      if (savedUser.error) {
        throw savedUser.error;
      }

      const savedAi = await supabase
        .from("conversations")
        .insert({
          child_id: childId,
          topic_id: topicId,
          role: "ai",
          message: reply.aiEnglish,
          korean_meaning: reply.aiKorean,
          ai_pronunciation: reply.aiPronunciation,
          correction: "",
          next_question: reply.nextQuestion,
          emotion: reply.emotion,
          xp: reply.xp,
          audio_path: aiAudioPath,
          pronunciation_score: 0,
          pronunciation_feedback: "",
          better_sentence: "",
          practice_sentence: "",
        })
        .select("*")
        .single();

      if (savedAi.error) {
        throw savedAi.error;
      }

      const reward = await applyVoiceReward({
        childId,
        baseXp: Number(reply.xp || 10),
      });

      const finalHistory = await supabase
        .from("conversations")
        .select("*")
        .eq("child_id", childId)
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true });

      if (finalHistory.error) {
        throw finalHistory.error;
      }

      res.json({
        userMessage: normalizeConversation(savedUser.data),
        aiMessage: normalizeConversation(savedAi.data),
        reward,
        progress: reward.progress,
        conversation: (finalHistory.data || []).map(normalizeConversation),
      });
    } catch (error) {
      next(error);
    } finally {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
    }
  }
);

app.get("/api/parent-report", requireUser, async (req, res, next) => {
  try {
    const childId = String(req.query.childId || "").trim();

    if (!childId) {
      return res.status(400).json({
        error: "childId is required",
      });
    }

    const child = await getOwnedChildOrThrow({
      childId,
      userId: req.user.id,
    });

    const today = todayDateString();

    const topicResult = await supabase
      .from("daily_topics")
      .select("*")
      .eq("child_id", childId)
      .eq("topic_date", today)
      .maybeSingle();

    const conversationsResult = await supabase
      .from("conversations")
      .select("*")
      .eq("child_id", childId)
      .order("created_at", { ascending: true });

    if (conversationsResult.error) {
      throw conversationsResult.error;
    }

    const { progress, mission } = await getProgressAndMission(childId);

    const conversations = conversationsResult.data || [];
    const userMessages = conversations.filter((item) => item.role === "user");
    const aiMessages = conversations.filter((item) => item.role === "ai");

    const latestUserMessage = userMessages[userMessages.length - 1];
    const latestAiMessage = aiMessages[aiMessages.length - 1];

    const speakingCount = userMessages.length;
    const totalMessages = conversations.length;

    const report = {
      childName: child.name,
      date: today,
      topicTitle: topicResult.data?.title || "아직 오늘 주제가 없습니다.",
      openingQuestion: topicResult.data?.opening_question || "",
      openingQuestionKo: topicResult.data?.opening_question_ko || "",
      totalMessages,
      speakingCount,
      aiResponseCount: aiMessages.length,
      progress: normalizeProgress(progress, mission),
      summary:
        speakingCount > 0
          ? `${child.name}님은 오늘 ${speakingCount}번 영어로 말하기를 연습했습니다. 현재 레벨은 ${progress.level}이고 총 XP는 ${progress.total_xp}입니다.`
          : `${child.name}님은 아직 오늘 영어 말하기 기록이 없습니다.`,
      strengths:
        speakingCount > 0
          ? [
              "영어로 직접 말하기를 시도했습니다.",
              "AI와 상황 질문 기반 대화를 이어갔습니다.",
              "영어 문장과 한국어 뜻을 함께 확인했습니다.",
            ]
          : ["오늘의 주제를 먼저 시작하면 리포트가 더 자세히 생성됩니다."],
      weakPoints:
        speakingCount > 0
          ? [
              "짧은 문장으로 한 번 더 답하는 연습을 하면 좋습니다.",
              "좋아하는 이유를 영어로 말하는 연습이 필요합니다.",
            ]
          : ["아직 충분한 말하기 데이터가 없습니다."],
      recommendation:
        topicResult.data?.opening_question
          ? `오늘 질문 "${topicResult.data.opening_question}"에 2~3가지 다른 답을 말해보세요.`
          : "오늘의 주제를 먼저 생성하고 음성 회화를 시작해보세요.",
      homePractice:
        topicResult.data?.opening_question_ko
          ? `부모님이 "${topicResult.data.opening_question_ko}"라고 물어보고, 아이가 영어로 자유롭게 답하게 해주세요.`
          : "아이와 함께 간단한 인사 표현부터 연습해보세요.",
      latestUserEnglish: latestUserMessage?.message || "",
      latestUserKorean: latestUserMessage?.korean_meaning || "",
      latestAiEnglish: latestAiMessage?.message || "",
      latestAiKorean: latestAiMessage?.korean_meaning || "",
    };

    res.json({
      report,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error("SERVER ERROR DETAIL:", {
    message: error.message,
    status: error.status,
    code: error.code,
    details: error.details,
    hint: error.hint,
    stack: error.stack,
  });

  res.status(error.status || 500).json({
    error: error.message || "Internal Server Error",
    code: error.code || "",
    details: error.details || "",
    hint: error.hint || "",
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});