import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import {
  apiGetMyChild,
  apiCreateChild,
  apiFetchTodayTopic,
  apiFetchConversation,
  apiSendVoiceChat,
  apiFetchParentReport,
  apiFetchProgress,
  apiFetchBadges,
} from "./lib/api";
const TOPIC_CATEGORIES = [
  { id: "space", label: "우주", emoji: "🚀" },
  { id: "dinosaur", label: "공룡", emoji: "🦖" },
  { id: "animal", label: "동물", emoji: "🐼" },
  { id: "food", label: "음식", emoji: "🍕" },
  { id: "amusement", label: "놀이공원", emoji: "🎡" },
  { id: "magic", label: "마법", emoji: "🪄" },
  { id: "school", label: "학교", emoji: "🏫" },
  { id: "friend", label: "친구", emoji: "🤝" },
  { id: "birthday", label: "생일", emoji: "🎂" },
  { id: "game", label: "게임", emoji: "🎮" },
];

export default function App() {
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password1234");
  const [childName, setChildName] = useState("민준");

  const [session, setSession] = useState(null);
  const [child, setChild] = useState(null);
  const [topic, setTopic] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [status, setStatus] = useState("");
  const [parentReport, setParentReport] = useState(null);
  const [topicCategory, setTopicCategory] = useState("space");

  const [progress, setProgress] = useState(null);
  const [rewardMessage, setRewardMessage] = useState("");
const [badges, setBadges] = useState([]);
const [newBadges, setNewBadges] = useState([]);

  const [loadingTopic, setLoadingTopic] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
const [isThinking, setIsThinking] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab !== "chat") return;

    requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    });
  }, [messages, activeTab]);

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setStatus("회원가입 실패: " + error.message);
      return;
    }

    setStatus("회원가입 완료. 이미 가입했다면 로그인하세요.");
  }

  async function signIn() {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("로그인 실패: " + error.message);
      return;
    }

    setSession(data.session);
    setStatus("로그인 성공");
    setActiveTab("home");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setChild(null);
    setTopic(null);
    setMessages([]);
    setParentReport(null);
    setProgress(null);
    setRewardMessage("");
setNewBadges([]);
setIsThinking(false);
    setBadges([]);
setNewBadges([]);
    setStatus("로그아웃 완료");
  }

  async function loadBadges(childId) {
  try {
    const data = await apiFetchBadges(childId);
    setBadges(data);
  } catch (err) {
    console.error("badges load failed:", err);
  }
}
async function loadProgress(childId) {
  try {
    const data = await apiFetchProgress(childId);
    setProgress(data);
  } catch (err) {
    console.error("progress load failed:", err);
  }
}

async function loadBadges(childId) {
  try {
    const data = await apiFetchBadges(childId);
    setBadges(data);
  } catch (err) {
    console.error("badges load failed:", err);
  }
}

  async function loadChild() {
    try {
      const foundChild = await apiGetMyChild();

      if (!foundChild) {
        setStatus("아이 프로필이 없습니다. 아이 생성을 눌러주세요.");
        return null;
      }

      setChild(foundChild);
      await loadProgress(foundChild.id);
      await loadBadges(foundChild.id);
      setStatus("아이 프로필 불러오기 성공");
      return foundChild;
    } catch (err) {
      setStatus("아이 조회 실패: " + err.message);
      return null;
    }
  }

  async function createChild() {
    try {
      const createdChild = await apiCreateChild({
        name: childName,
        level: "beginner",
        ageGroup: "elementary",
      });

      setChild(createdChild);
      await loadProgress(createdChild.id);
      await loadProgress(createdChild.id);
await loadBadges(createdChild.id);
      setStatus("아이 프로필 생성 성공");
    } catch (err) {
      setStatus("아이 생성 실패: " + err.message);
    }
  }

  async function loadTodayTopic(refresh = false) {
    if (loadingTopic) return;

    try {
      setLoadingTopic(true);
      setRewardMessage("");

      let currentChild = child;

      if (!currentChild) {
        currentChild = await apiGetMyChild();
        setChild(currentChild);
      }

      if (!currentChild) {
        setStatus("아이 프로필이 없습니다. 먼저 아이 생성을 해주세요.");
        return;
      }

      await loadProgress(currentChild.id);
await loadProgress(currentChild.id);
await loadBadges(currentChild.id);
      const todayTopic = await apiFetchTodayTopic(
  currentChild.id,
  refresh,
  topicCategory
);
      setTopic(todayTopic);

      const conversation = await apiFetchConversation({
        childId: currentChild.id,
        topicId: todayTopic.id,
      });

      setMessages(conversation);
      setStatus(refresh ? "새 대화 주제로 변경 완료" : "오늘 주제 불러오기 성공");
    } catch (err) {
      setStatus("주제 불러오기 실패: " + err.message);
    } finally {
      setLoadingTopic(false);
    }
  }

  async function startRecording() {
    try {
      if (!child || !topic) {
        setStatus("홈에서 아이 조회와 오늘 주제를 먼저 실행하세요.");
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("이 브라우저는 마이크 녹음을 지원하지 않습니다.");
        return;
      }

      setRewardMessage("");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      chunksRef.current = [];

      let mimeType = "";

      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      }

      const recorderOptions = {
        audioBitsPerSecond: 24000,
      };

      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setStatus("녹음 중 오류가 발생했습니다.");
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        console.log("녹음 파일 크기:", audioBlob.size);
        console.log("녹음 파일 타입:", audioBlob.type);

        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size < 1000) {
          setStatus("녹음된 소리가 너무 짧거나 비어 있습니다. 다시 말해보세요.");
          return;
        }

        await sendVoice(audioBlob);
      };

      recorder.start(500);

      setIsRecording(true);
      setStatus("녹음 중입니다. 영어로 또렷하게 말해보세요.");

      setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          stopRecording();
        }
      }, 8000);
    } catch (err) {
      console.error(err);
      setStatus("마이크 시작 실패: " + err.message);
    }
  }

  function stopRecording() {
  if (!mediaRecorderRef.current) {
    setStatus("녹음 장치가 준비되지 않았습니다.");
    return;
  }

  if (mediaRecorderRef.current.state === "inactive") {
    setStatus("이미 녹음이 종료되었습니다.");
    return;
  }

  mediaRecorderRef.current.stop();
  setIsRecording(false);
  setIsThinking(true);
  setStatus("AI가 영어 문장을 이해하는 중입니다.");
}

function speakEnglish(text) {
  if (!text) return;

  if (!window.speechSynthesis) {
    console.warn("이 브라우저는 음성 읽기를 지원하지 않습니다.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  utterance.pitch = 1.05;
  utterance.volume = 1;

  const voices = window.speechSynthesis.getVoices();

  const englishVoice =
    voices.find((voice) => voice.lang === "en-US") ||
    voices.find((voice) => voice.lang.startsWith("en")) ||
    voices[0];

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);
}

async function sendVoice(audioBlob) {
  try {
    setIsSendingVoice(true);
    setIsThinking(true);

      const data = await apiSendVoiceChat({
        childId: child.id,
        topicId: topic.id,
        audioBlob,
      });

      setMessages(data.conversation || []);

      if (data.progress) {
        setProgress(data.progress);
      }
      if (data.badges) {
  setBadges(data.badges);
}

if (data.newBadges) {
  setNewBadges(data.newBadges);
}

     if (data.reward) {
  let message = `+${data.reward.earnedXp} XP 획득!`;

  if (data.reward.newlyCompletedToday) {
    message += " 오늘 미션 완료!";
  }

  if (data.reward.leveledUp) {
    message += ` 레벨 ${data.progress?.level} 달성!`;
  }

  if (data.newBadges && data.newBadges.length > 0) {
    message += ` 새 배지 ${data.newBadges.length}개 획득!`;
  }

  setRewardMessage(message);
  setStatus(message);
} else {
  setStatus("AI 답변 완료");
}

const aiText = data.aiMessage?.text;
const aiAudioUrl = data.aiMessage?.audioUrl;

if (aiAudioUrl) {
  const audio = new Audio(aiAudioUrl);
  audio.play().catch(() => {
    speakEnglish(aiText);
  });
} else {
  speakEnglish(aiText);
}
    } catch (err) {
      setStatus("음성 대화 실패: " + err.message);
    } finally {
  setIsSendingVoice(false);
  setIsThinking(false);
}
  }

  async function loadParentReport() {
    try {
      let currentChild = child;

      if (!currentChild) {
        currentChild = await apiGetMyChild();
        setChild(currentChild);
      }

      if (!currentChild) {
        setStatus("아이 프로필이 없습니다. 먼저 아이 생성을 해주세요.");
        return;
      }

      await loadProgress(currentChild.id);

      const report = await apiFetchParentReport(currentChild.id);

      setParentReport(report);
      setStatus("부모 리포트 생성 완료");
    } catch (err) {
      setStatus("부모 리포트 실패: " + err.message);
    }
  }

  if (!session) {
    return (
      <main style={page}>
        <section style={phone}>
          <div style={hero}>
            <div style={logo}>AI</div>
            <h1 style={title}>톡톡잉글리시</h1>
            <p style={subtitle}>
              말하면 AI가 영어로 대답하고 한국어 뜻도 보여줘요
            </p>
          </div>

          <section style={card}>
            <label style={label}>이메일</label>
            <input
              style={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label style={label}>비밀번호</label>
            <input
              style={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button style={primaryButton} onClick={signIn}>
              로그인
            </button>
            <button style={ghostButton} onClick={signUp}>
              회원가입
            </button>

            {status && <p style={statusBox}>{status}</p>}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main style={page}>
      <section style={phone}>
        <header style={header}>
          <div>
            <p style={smallText}>AI 음성 영어회화</p>
            <h1 style={headerTitle}>톡톡잉글리시</h1>
          </div>
          <button style={smallButton} onClick={signOut}>
            로그아웃
          </button>
        </header>

        {activeTab === "home" && (
          <>
            <section style={heroCard}>
              <p style={badge}>오늘의 음성 회화 주제</p>
              <h2 style={heroTitle}>
                {topic ? topic.title : "새 주제를 시작해보세요"}
              </h2>
              <p style={heroText}>
                {topic
                  ? topic.goal
                  : "AI가 초등학생에게 맞는 영어 회화 상황을 만들어줍니다."}
              </p>

              {topic && (
                <div style={expressionBox}>
                  <p style={smallTextWhite}>AI 질문</p>
                  <strong>{topic.openingQuestion || topic.mainExpression}</strong>
                  {topic.openingQuestionKo && (
                    <p style={smallTextWhite}>{topic.openingQuestionKo}</p>
                  )}
                </div>
              )}
              <div style={categoryBox}>
  <p style={smallTextWhite}>주제 선택</p>

  <div style={categoryGrid}>
    {TOPIC_CATEGORIES.map((item) => {
      const active = topicCategory === item.id;

      return (
        <button
          key={item.id}
          type="button"
          style={categoryButton(active)}
          onClick={() => setTopicCategory(item.id)}
        >
          <span>{item.emoji}</span>
          <span>{item.label}</span>
        </button>
      );
    })}
  </div>
</div>

              <div style={buttonRow}>
                <button
                  style={whiteButton}
                  onClick={() => loadTodayTopic(false)}
                  disabled={loadingTopic}
                >
                  {loadingTopic ? "불러오는 중..." : "오늘 주제"}
                </button>

                <button
                  style={outlineWhiteButton}
                  onClick={() => loadTodayTopic(true)}
                  disabled={loadingTopic}
                >
                  {loadingTopic ? "생성 중..." : "새 주제"}
                </button>
              </div>
            </section>

            {progress && (
              <section style={rewardCard}>
                <div style={rewardTop}>
                  <div>
                    <p style={smallText}>나의 성장</p>
                    <h3 style={rewardLevel}>Level {progress.level}</h3>
                  </div>
                  <div style={xpBadge}>{progress.totalXp} XP</div>
                </div>

                <div style={progressBarOuter}>
                  <div
                    style={{
                      ...progressBarInner,
                      width: `${Math.min(progress.totalXp % 100, 100)}%`,
                    }}
                  />
                </div>

                <div style={rewardGrid}>
                  <div style={rewardItem}>
                    <b>{progress.todaySpeakingCount}</b>
                    <span>오늘 말하기</span>
                  </div>
                  <div style={rewardItem}>
                    <b>{progress.todayTargetCount}</b>
                    <span>오늘 목표</span>
                  </div>
                  <div style={rewardItem}>
                    <b>{progress.streakDays}</b>
                    <span>연속 출석</span>
                  </div>
                </div>

{badges.length > 0 && (
  <section style={badgeCard}>
    <div style={badgeHeader}>
      <div>
        <p style={smallText}>나의 배지</p>
        <h3 style={badgeTitle}>획득 배지 {badges.length}개</h3>
      </div>
      <span style={badgeCount}>🏅</span>
    </div>

    <div style={badgeGrid}>
      {badges.slice(0, 6).map((badge) => (
        <div key={badge.id} style={badgeItem}>
          <div style={badgeEmoji}>{badge.emoji}</div>
          <b>{badge.name}</b>
          <span>{badge.description}</span>
        </div>
      ))}
    </div>
  </section>
)}

                <p style={infoText}>
                  오늘 미션: {progress.todaySpeakingCount} /{" "}
                  {progress.todayTargetCount}
                  {progress.todayCompleted ? " 완료!" : ""}
                </p>
              </section>
            )}

            <section style={card}>
              <h3 style={sectionTitle}>아이 프로필</h3>
              <input
                style={input}
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="아이 이름"
              />

              <div style={buttonRowNormal}>
                <button style={primaryButtonSmall} onClick={loadChild}>
                  아이 조회
                </button>
                <button style={secondaryButton} onClick={createChild}>
                  아이 생성
                </button>
              </div>

              {child && (
                <p style={infoText}>
                  현재 아이: <b>{child.name}</b> / 레벨: {child.level}
                </p>
              )}
            </section>

            {topic && (
              <section style={card}>
                <h3 style={sectionTitle}>오늘의 미션</h3>
                <ul style={missionList}>
                  {topic.missions.map((mission) => (
                    <li key={mission} style={missionItem}>
                      {mission}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {activeTab === "chat" && (
          <>
            <section style={chatHeader}>
              <p style={smallText}>AI 음성 상황극</p>
              <h2 style={sectionTitle}>
                {topic ? topic.title : "주제를 먼저 생성하세요"}
              </h2>

              {topic && (
                <>
                  <p style={infoText}>AI 질문: {topic.openingQuestion}</p>
                  <p style={infoText}>{topic.openingQuestionKo}</p>
                </>
              )}
            </section>

            <section style={chatBox}>
              {messages.length === 0 && (
                <p style={emptyText}>
                  홈에서 오늘 주제를 만든 뒤 마이크로 말해보세요.
                </p>
              )}

              {messages.map((m) => (
                <div key={m.id} style={m.role === "user" ? userBubble : aiBubble}>
                  <b>{m.role === "user" ? "나" : "AI"}</b>

                  <p style={englishText}>{m.text}</p>

                  {m.koreanMeaning && (
                    <p style={koreanText}>{m.koreanMeaning}</p>
                  )}
{m.role === "ai" && m.aiPronunciation && (
  <p style={pronunciationText}>
    발음: {m.aiPronunciation}
  </p>
)}

{m.role === "ai" && (
  <button
    style={listenButton}
    onClick={() => speakEnglish(m.text)}
  >
    🔊 다시 듣기
  </button>
)}

                  {m.correction && (
                    <p style={correction}>교정: {m.correction}</p>
                  )}

                  {m.role === "user" && m.pronunciationScore > 0 && (
                    <div style={feedbackBox}>
                      <div style={scoreRow}>
                        <b>발음 점수</b>
                        <span>{m.pronunciationScore}점</span>
                      </div>

                      {m.pronunciationFeedback && (
                        <p style={feedbackText}>{m.pronunciationFeedback}</p>
                      )}

                      {m.betterSentence && (
                        <p style={practiceText}>
                          더 자연스럽게: <b>{m.betterSentence}</b>
                        </p>
                      )}

                      {m.practiceSentence && (
                        <p style={practiceText}>
                          반복 연습: <b>{m.practiceSentence}</b>
                        </p>
                      )}
                    </div>
                  )}

                  {m.audioUrl && (
                    <audio style={audioPlayer} controls src={m.audioUrl} />
                  )}
                </div>
              ))}
{isThinking && (
  <div style={thinkingBubble}>
    <div style={thinkingDots}>
      <span style={thinkingDot}></span>
      <span style={thinkingDot}></span>
      <span style={thinkingDot}></span>
    </div>
    <div>
      <b>AI가 생각 중...</b>
      <p style={thinkingText}>영어 문장을 이해하고 답변을 준비하고 있어요.</p>
    </div>
  </div>
)}

<div ref={chatEndRef} />
              <div ref={chatEndRef} />
            </section>

            {rewardMessage && <div style={rewardToast}>{rewardMessage}</div>}

{newBadges.length > 0 && (
  <section style={praiseCard}>
    <h3 style={praiseTitle}>🎉 새 배지 획득!</h3>

    {newBadges.map((badge) => (
      <div key={badge.id} style={newBadgeItem}>
        <span style={newBadgeEmoji}>{badge.emoji}</span>
        <div>
          <b>{badge.name}</b>
          <p>{badge.description}</p>
        </div>
      </div>
    ))}
  </section>
)}

            <section style={voicePanel}>
           {!isRecording ? (
  <button
    style={isSendingVoice ? disabledRecordButton : recordButton}
    onClick={startRecording}
    disabled={isSendingVoice}
  >
    {isSendingVoice ? "🧠 AI가 생각 중..." : "🎙️ 말하기 시작"}
  </button>
) : (
  <button style={stopButton} onClick={stopRecording}>
    👂 듣는 중... 말하기 끝
  </button>
)}

              <p style={voiceHint}>
                영어로 말하면, AI가 영어 답변과 한국어 뜻을 함께 보여줍니다.
              </p>
            </section>

            <button
              style={secondaryFullButton}
              onClick={() => loadTodayTopic(true)}
              disabled={loadingTopic}
            >
              {loadingTopic ? "생성 중..." : "다른 주제로 새 대화 시작"}
            </button>
          </>
        )}

        {activeTab === "report" && (
          <section style={card}>
            <h2 style={sectionTitle}>부모 리포트</h2>
            <p style={infoText}>
              아이의 오늘 음성 회화 기록을 바탕으로 학습 요약을 보여줍니다.
            </p>

            <button style={primaryButton} onClick={loadParentReport}>
              리포트 생성 / 새로고침
            </button>

            {!parentReport && (
              <p style={emptyText}>
                아직 리포트가 없습니다. 회화를 한 뒤 리포트를 생성해보세요.
              </p>
            )}

            {parentReport && (
              <div style={{ marginTop: 16 }}>
                <div style={reportItem}>
                  <b>아이</b>
                  <span>{parentReport.childName}</span>
                </div>

                <div style={reportItem}>
                  <b>오늘 주제</b>
                  <span>{parentReport.topicTitle}</span>
                </div>

                <div style={reportItem}>
                  <b>말하기 횟수</b>
                  <span>{parentReport.speakingCount}회</span>
                </div>

                <div style={reportItem}>
                  <b>전체 대화</b>
                  <span>{parentReport.totalMessages}개</span>
                </div>

                {parentReport.progress && (
                  <section style={reportBlock}>
                    <h3 style={reportTitle}>성장 정보</h3>
                    <p style={infoText}>
                      레벨 {parentReport.progress.level} / 총{" "}
                      {parentReport.progress.totalXp} XP / 연속 출석{" "}
                      {parentReport.progress.streakDays}일
                    </p>
                  </section>
                )}

                <section style={reportBlock}>
                  <h3 style={reportTitle}>오늘 요약</h3>
                  <p style={infoText}>{parentReport.summary}</p>
                </section>

                <section style={reportBlock}>
                  <h3 style={reportTitle}>잘한 점</h3>
                  <ul style={missionList}>
                    {parentReport.strengths.map((item) => (
                      <li key={item} style={missionItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>

                <section style={reportBlock}>
                  <h3 style={reportTitle}>보완할 점</h3>
                  <ul style={missionList}>
                    {parentReport.weakPoints.map((item) => (
                      <li key={item} style={missionItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>

                <section style={reportBlock}>
                  <h3 style={reportTitle}>추천 연습</h3>
                  <p style={infoText}>{parentReport.recommendation}</p>
                </section>

                <section style={reportBlock}>
                  <h3 style={reportTitle}>집에서 이렇게 해보세요</h3>
                  <p style={infoText}>{parentReport.homePractice}</p>
                </section>

                {parentReport.latestUserEnglish && (
                  <section style={reportBlock}>
                    <h3 style={reportTitle}>최근 아이 발화</h3>
                    <p style={englishText}>{parentReport.latestUserEnglish}</p>
                    <p style={koreanText}>{parentReport.latestUserKorean}</p>
                  </section>
                )}

                {parentReport.latestAiEnglish && (
                  <section style={reportBlock}>
                    <h3 style={reportTitle}>최근 AI 답변</h3>
                    <p style={englishText}>{parentReport.latestAiEnglish}</p>
                    <p style={koreanText}>{parentReport.latestAiKorean}</p>
                  </section>
                )}
              </div>
            )}
          </section>
        )}

        {status && <p style={statusBox}>{status}</p>}

        <nav style={bottomNav}>
          <button
            style={tabButton(activeTab === "home")}
            onClick={() => setActiveTab("home")}
          >
            홈
          </button>
          <button
            style={tabButton(activeTab === "chat")}
            onClick={() => setActiveTab("chat")}
          >
            회화
          </button>
          <button
            style={tabButton(activeTab === "report")}
            onClick={() => setActiveTab("report")}
          >
            리포트
          </button>
        </nav>
      </section>
    </main>
  );
}

const page = {
  minHeight: "100vh",
  background: "#eef2ff",
  display: "flex",
  justifyContent: "center",
};

const phone = {
  width: "100%",
  maxWidth: 430,
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 18,
  boxSizing: "border-box",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 18,
};

const smallText = {
  margin: 0,
  fontSize: 13,
  color: "#6366f1",
  fontWeight: 700,
};

const smallTextWhite = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "rgba(255,255,255,0.8)",
  fontWeight: 700,
};

const headerTitle = {
  margin: 0,
  fontSize: 25,
  fontWeight: 900,
};

const hero = {
  paddingTop: 50,
  paddingBottom: 30,
  textAlign: "center",
};

const logo = {
  width: 64,
  height: 64,
  borderRadius: 24,
  margin: "0 auto 16px",
  background: "#6366f1",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 24,
};

const title = {
  fontSize: 36,
  margin: "0 0 10px",
};

const subtitle = {
  color: "#64748b",
  lineHeight: 1.6,
};

const card = {
  background: "white",
  borderRadius: 28,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
};

const heroCard = {
  background: "linear-gradient(135deg, #6366f1, #a855f7)",
  color: "white",
  borderRadius: 32,
  padding: 22,
  marginBottom: 16,
  boxShadow: "0 12px 24px rgba(99, 102, 241, 0.25)",
};

const badge = {
  display: "inline-block",
  padding: "6px 12px",
  background: "rgba(255,255,255,0.2)",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const heroTitle = {
  fontSize: 30,
  margin: "18px 0 8px",
  lineHeight: 1.2,
};

const heroText = {
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.82)",
};

const expressionBox = {
  background: "rgba(255,255,255,0.16)",
  padding: 14,
  borderRadius: 20,
  marginBottom: 16,
};

const input = {
  width: "100%",
  padding: 14,
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  boxSizing: "border-box",
  margin: "8px 0 14px",
  fontSize: 15,
};

const label = {
  fontSize: 14,
  fontWeight: 800,
  color: "#475569",
};

const primaryButton = {
  width: "100%",
  border: 0,
  borderRadius: 16,
  padding: 14,
  background: "#4f46e5",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const primaryButtonSmall = {
  flex: 1,
  border: 0,
  borderRadius: 16,
  padding: 14,
  background: "#4f46e5",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton = {
  flex: 1,
  border: 0,
  borderRadius: 16,
  padding: 14,
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const ghostButton = {
  width: "100%",
  border: 0,
  borderRadius: 16,
  padding: 14,
  marginTop: 10,
  background: "#eef2ff",
  color: "#4f46e5",
  fontWeight: 900,
  cursor: "pointer",
};

const smallButton = {
  border: 0,
  borderRadius: 14,
  padding: "9px 12px",
  background: "white",
  color: "#475569",
  fontWeight: 800,
  cursor: "pointer",
};

const whiteButton = {
  flex: 1,
  border: 0,
  borderRadius: 16,
  padding: 14,
  background: "white",
  color: "#4f46e5",
  fontWeight: 900,
  cursor: "pointer",
};

const outlineWhiteButton = {
  flex: 1,
  border: "1px solid rgba(255,255,255,0.55)",
  borderRadius: 16,
  padding: 14,
  background: "transparent",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonRow = {
  display: "flex",
  gap: 10,
};

const buttonRowNormal = {
  display: "flex",
  gap: 10,
};

const sectionTitle = {
  margin: "0 0 12px",
  fontSize: 22,
  fontWeight: 900,
};

const infoText = {
  color: "#64748b",
  lineHeight: 1.6,
};

const statusBox = {
  background: "#fff7ed",
  color: "#9a3412",
  padding: 12,
  borderRadius: 16,
  fontSize: 14,
  fontWeight: 700,
};

const missionList = {
  paddingLeft: 0,
  listStyle: "none",
};

const missionItem = {
  background: "#f1f5f9",
  padding: 12,
  borderRadius: 16,
  marginBottom: 8,
  fontWeight: 700,
};

const rewardCard = {
  background: "white",
  borderRadius: 28,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
};

const rewardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const rewardLevel = {
  margin: "4px 0 0",
  fontSize: 28,
  fontWeight: 900,
};

const xpBadge = {
  background: "#fef3c7",
  color: "#92400e",
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 900,
};

const progressBarOuter = {
  height: 10,
  background: "#e5e7eb",
  borderRadius: 999,
  overflow: "hidden",
  margin: "16px 0",
};

const progressBarInner = {
  height: "100%",
  background: "#6366f1",
  borderRadius: 999,
};

const rewardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const rewardItem = {
  background: "#f8fafc",
  borderRadius: 16,
  padding: 12,
  textAlign: "center",
  display: "grid",
  gap: 4,
};

const rewardToast = {
  background: "#ecfdf5",
  color: "#047857",
  borderRadius: 18,
  padding: 14,
  marginBottom: 12,
  fontWeight: 900,
  textAlign: "center",
};

const chatHeader = {
  background: "white",
  borderRadius: 24,
  padding: 18,
  marginBottom: 14,
};

const chatBox = {
  minHeight: 330,
  maxHeight: 440,
  overflowY: "auto",
  paddingBottom: 10,
  scrollBehavior: "auto",
};

const aiBubble = {
  background: "white",
  borderRadius: 20,
  padding: 14,
  marginBottom: 10,
  maxWidth: "86%",
};

const userBubble = {
  background: "#4f46e5",
  color: "white",
  borderRadius: 20,
  padding: 14,
  marginBottom: 10,
  maxWidth: "86%",
  marginLeft: "auto",
};

const englishText = {
  margin: "8px 0 4px",
  fontSize: 16,
  fontWeight: 800,
};

const koreanText = {
  margin: "0",
  fontSize: 14,
  lineHeight: 1.5,
  opacity: 0.8,
};

const correction = {
  color: "#10b981",
  fontSize: 13,
  marginTop: 8,
};

const feedbackBox = {
  background: "rgba(255,255,255,0.18)",
  borderRadius: 16,
  padding: 12,
  marginTop: 10,
};

const scoreRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

const feedbackText = {
  fontSize: 13,
  lineHeight: 1.5,
  margin: "6px 0",
};

const practiceText = {
  fontSize: 13,
  lineHeight: 1.5,
  margin: "6px 0",
};

const audioPlayer = {
  width: "100%",
  marginTop: 10,
};

const emptyText = {
  color: "#94a3b8",
  textAlign: "center",
  marginTop: 80,
};

const voicePanel = {
  background: "white",
  borderRadius: 24,
  padding: 16,
  marginBottom: 12,
  textAlign: "center",
};

const recordButton = {
  width: "100%",
  border: 0,
  background: "#ef4444",
  color: "white",
  borderRadius: 22,
  padding: 18,
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
};

const stopButton = {
  width: "100%",
  border: 0,
  background: "#111827",
  color: "white",
  borderRadius: 22,
  padding: 18,
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
};

const voiceHint = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const secondaryFullButton = {
  width: "100%",
  border: 0,
  background: "#e0e7ff",
  color: "#3730a3",
  borderRadius: 18,
  padding: 14,
  fontWeight: 900,
};

const reportItem = {
  background: "#f1f5f9",
  borderRadius: 18,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 10,
};

const reportBlock = {
  background: "#f8fafc",
  borderRadius: 18,
  padding: 14,
  marginTop: 12,
};

const reportTitle = {
  margin: "0 0 8px",
  fontSize: 17,
  fontWeight: 900,
};

const bottomNav = {
  position: "sticky",
  bottom: 12,
  background: "#111827",
  borderRadius: 24,
  padding: 8,
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 6,
  marginTop: 20,
};

const tabButton = (active) => ({
  border: 0,
  borderRadius: 18,
  padding: 12,
  background: active ? "white" : "transparent",
  color: active ? "#111827" : "rgba(255,255,255,0.65)",
  fontWeight: 900,
  cursor: "pointer",

  
});
const badgeCard = {
  background: "white",
  borderRadius: 28,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
};

const badgeHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
};

const badgeTitle = {
  margin: "4px 0 0",
  fontSize: 22,
  fontWeight: 900,
};

const badgeCount = {
  fontSize: 30,
};

const badgeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 10,
};

const badgeItem = {
  background: "#f8fafc",
  borderRadius: 18,
  padding: 12,
  display: "grid",
  gap: 4,
  textAlign: "center",
};

const badgeEmoji = {
  fontSize: 28,
};

const praiseCard = {
  background: "linear-gradient(135deg, #fef3c7, #fde68a)",
  color: "#78350f",
  borderRadius: 24,
  padding: 16,
  marginBottom: 12,
  boxShadow: "0 8px 20px rgba(245, 158, 11, 0.18)",
};

const praiseTitle = {
  margin: "0 0 10px",
  fontSize: 20,
  fontWeight: 900,
};

const newBadgeItem = {
  background: "rgba(255,255,255,0.55)",
  borderRadius: 18,
  padding: 12,
  display: "flex",
  gap: 12,
  alignItems: "center",
  marginBottom: 8,
};

const newBadgeEmoji = {
  fontSize: 34,
};
const pronunciationText = {
  margin: "6px 0 0",
  fontSize: 14,
  lineHeight: 1.5,
  color: "#7c3aed",
  fontWeight: 800,
};
const listenButton = {
  marginTop: 10,
  border: 0,
  borderRadius: 14,
  padding: "8px 12px",
  background: "#ede9fe",
  color: "#5b21b6",
  fontWeight: 900,
  cursor: "pointer",
};
const disabledRecordButton = {
  width: "100%",
  border: 0,
  background: "#9ca3af",
  color: "white",
  borderRadius: 22,
  padding: 18,
  fontSize: 18,
  fontWeight: 900,
  cursor: "not-allowed",
};

const thinkingBubble = {
  background: "#eef2ff",
  color: "#312e81",
  borderRadius: 20,
  padding: 14,
  marginBottom: 10,
  maxWidth: "90%",
  display: "flex",
  gap: 12,
  alignItems: "center",
  boxShadow: "0 6px 14px rgba(79, 70, 229, 0.12)",
};

const thinkingDots = {
  display: "flex",
  gap: 4,
  alignItems: "center",
};

const thinkingDot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#6366f1",
  display: "inline-block",
};

const thinkingText = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#4f46e5",
  lineHeight: 1.4,
};
const categoryBox = {
  background: "rgba(255,255,255,0.14)",
  borderRadius: 20,
  padding: 14,
  marginBottom: 16,
};

const categoryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
  marginTop: 10,
};

const categoryButton = (active) => ({
  border: active ? "2px solid white" : "1px solid rgba(255,255,255,0.35)",
  borderRadius: 14,
  padding: "8px 4px",
  background: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
  display: "grid",
  gap: 3,
  fontSize: 12,
});