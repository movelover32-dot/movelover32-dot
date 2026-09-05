const SUPABASE_URL = "https://tevzumwqjzerablqfamu.supabase.co";
const SUPABASE_KEY = "sb_publishable_RTavC98pqDPvU2VlIdb4GQ_LA8uo341";

const VAPID_PUBLIC_KEY =
  "BKabYneyxGXb0Z2vkjOtS00NlwcOfYjxGzBaYZSk76hIXG29pkYva_1NKG5xGsh5bSo415fi1nar4AIS7AEH1vc";

const SITE_URL =
  "https://movelover32-dot.github.io/movelover32-dot/";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const $ = (id) => document.getElementById(id);

const authPage = $("authPage");
const dashboardPage = $("dashboardPage");
const publicPage = $("publicPage");

const authForm = $("authForm");
const emailInput = $("email");
const passwordInput = $("password");
const authBtn = $("authBtn");
const authMessage = $("authMessage");

const loginTab = $("loginTab");
const signupTab = $("signupTab");
const logoutBtn = $("logoutBtn");

const publicLink = $("publicLink");
const copyBtn = $("copyBtn");
const shareBtn = $("shareBtn");
const refreshBtn = $("refreshBtn");
const questionsList = $("questionsList");

const questionForm = $("questionForm");
const questionText = $("questionText");
const questionCounter = $("questionCounter");
const questionMessage = $("questionMessage");

const notificationBox = $("notificationBox");
const notificationBtn = $("notificationBtn");
const notificationMessage = $("notificationMessage");

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let currentPublicProfile = null;
let lastQuestionId = null;

function show(page) {
  [authPage, dashboardPage, publicPage].forEach((p) =>
    p.classList.add("hidden")
  );

  page.classList.remove("hidden");
}

function message(element, text, success = false) {
  element.textContent = text;
  element.style.color = success ? "#39d98a" : "#ff6b78";
}

function clearMessage(element) {
  element.textContent = "";
}

function randomSlug() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "rf-";

  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

async function getOwnProfile(userId) {
  const { data, error } = await client
    .from("profiles")
    .select("id, slug, user_id, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function createOwnProfile() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();

    const { data, error } = await client.rpc(
      "create_my_profile",
      {
        profile_slug: slug
      }
    );

    if (!error && data) {
      return Array.isArray(data) ? data[0] : data;
    }
  }

  throw new Error("Impossible de créer ton profil.");
}

async function loadProfile(user) {
  let profile = await getOwnProfile(user.id);

  if (!profile) {
    profile = await createOwnProfile();
  }

  currentProfile = profile;

  publicLink.value =
    SITE_URL + "?u=" + encodeURIComponent(profile.slug);

  await loadQuestions();
}

async function loadQuestions() {
  if (!currentProfile) return;

  questionsList.innerHTML =
    '<p class="message">Chargement...</p>';

  const { data: questions, error } = await client
    .from("questions")
    .select("id, question, status, created_at")
    .eq("profile_id", currentProfile.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    questionsList.innerHTML = "";
    message(authMessage, "Impossible de charger les questions.");
    return;
  }

  if (!questions || !questions.length) {
    questionsList.innerHTML =
      '<p class="message">Aucune question pour le moment.</p>';
    return;
  }

  const ids = questions.map((q) => q.id);

  const { data: answers } = await client
    .from("answers")
    .select("id, question_id, answer, created_at")
    .in("question_id", ids);

  const answerMap = {};

  (answers || []).forEach((answer) => {
    answerMap[answer.question_id] = answer;
  });

  questionsList.innerHTML = questions.map((q) => {

    const answer = answerMap[q.id];
    const status = String(q.status || "pending").trim().toLowerCase();

    let flagHtml = "";

    if (status === "red") {
      flagHtml =
        '<div class="flagStatus red">🔴 RED FLAG</div>';
    } else if (status === "green") {
      flagHtml =
        '<div class="flagStatus green">🟢 GREEN FLAG</div>';
    } else {
      flagHtml = `
        <div class="flagButtons">
          <button
            type="button"
            class="flagBtn redFlagBtn"
            onclick="setQuestionStatus('${q.id}', 'red')"
          >
            🔴 Red Flag
          </button>

          <button
            type="button"
            class="flagBtn greenFlagBtn"
            onclick="setQuestionStatus('${q.id}', 'green')"
          >
            🟢 Green Flag
          </button>
        </div>
      `;
    }

    return `
      <article class="questionCard">

        <div class="questionText">
          ${escapeHtml(q.question)}
        </div>

        <div class="meta">
          ${formatDate(q.created_at)}
        </div>

        ${flagHtml}

        ${
          answer
            ? `
              <div class="status">✓ Répondue</div>

              <div class="answer">
                ${escapeHtml(answer.answer)}
              </div>
            `
            : `
              <div class="status" style="color:#ffcc66;">
                • En attente de réponse
              </div>

              <div class="answer">
                <textarea
                  id="answer-${q.id}"
                  maxlength="5000"
                  placeholder="Écris ta réponse..."
                ></textarea>

                <button
                  class="primary"
                  onclick="answerQuestion('${q.id}')"
                >
                  Répondre
                </button>

                <p
                  id="answer-message-${q.id}"
                  class="message"
                ></p>
              </div>
            `
        }

      </article>
    `;
  }).join("");
}

window.answerQuestion = async function (questionId) {
  const textarea = document.getElementById(
    `answer-${questionId}`
  );

  const msg = document.getElementById(
    `answer-message-${questionId}`
  );

  const answer = textarea.value.trim();

  if (!answer) {
    message(msg, "Écris une réponse.");
    return;
  }

  textarea.disabled = true;

  const button =
    textarea.parentElement.querySelector("button");

  if (button) button.disabled = true;

  message(msg, "Envoi...");

  try {
    const {
      data: { session }
    } = await client.auth.getSession();

    if (!session) {
      throw new Error("Session expirée.");
    }

    const { error } = await client
      .from("answers")
      .insert({
        question_id: questionId,
        answer: answer
      });

    if (error) throw error;

    await client.functions.invoke("send-answer-push", {
      body: {
        question_id: questionId,
        answer: answer
      }
    });

    message(
      msg,
      "Réponse envoyée !",
      true
    );

    setTimeout(loadQuestions, 500);
  } catch (error) {
    console.error(error);

    textarea.disabled = false;

    if (button) button.disabled = false;

    message(
      msg,
      error.message || "Impossible d'envoyer la réponse."
    );
  }
};

window.setQuestionStatus = async function (questionId, status) {
  try {
    const {
      data: { session }
    } = await client.auth.getSession();

    if (!session) {
      alert("Session expirée. Reconnecte-toi.");
      return;
    }

    const { error } = await client
      .from("questions")
      .update({ status: status })
      .eq("id", questionId);

    if (error) {
      console.error("Erreur statut :", error);
      alert("ERREUR SUPABASE : " + error.message + "\nCode : " + (error.code || "inconnu"));
      return;
    }

    await loadQuestions();

  } catch (error) {
    console.error("Erreur statut :", error);
    alert("Erreur : " + error.message);
  }
};

async function openDashboard(user) {
  currentUser = user;

  logoutBtn.classList.remove("hidden");
  show(dashboardPage);

  try {
    await loadProfile(user);
  } catch (error) {
    console.error(error);
    message(
      authMessage,
      "Impossible de charger ton profil."
    );
  }
}

async function openPublicProfile(slug) {
  if (!slug) {
    show(authPage);
    return;
  }

  const { data, error } = await client.rpc(
    "get_profile_by_slug",
    {
      profile_slug: slug
    }
  );

  if (error) {
    console.error(error);
    show(authPage);
    return;
  }

  const profile = Array.isArray(data)
    ? data[0]
    : data;

  if (!profile) {
    show(authPage);
    return;
  }

  currentPublicProfile = profile;

  show(publicPage);

  clearMessage(questionMessage);
  clearMessage(notificationMessage);

  notificationBox.classList.add("hidden");
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage(authMessage);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  authBtn.disabled = true;
  authBtn.textContent =
    authMode === "login"
      ? "Connexion..."
      : "Création...";

  try {
    if (authMode === "login") {
      const { data, error } =
        await client.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      await openDashboard(data.user);
    } else {
      const { data, error } =
        await client.auth.signUp({
          email,
          password
        });

      if (error) throw error;

      if (data.session && data.user) {
        await openDashboard(data.user);
      } else {
        message(
          authMessage,
          "Compte créé. Vérifie ton e-mail pour confirmer ton compte.",
          true
        );
      }
    }
  } catch (error) {
    console.error(error);

    message(
      authMessage,
      error.message || "Une erreur est survenue."
    );
  } finally {
    authBtn.disabled = false;
    authBtn.textContent =
      authMode === "login"
        ? "Se connecter"
        : "Créer mon profil";
  }
});

loginTab.addEventListener("click", () => {
  authMode = "login";

  loginTab.classList.add("active");
  signupTab.classList.remove("active");

  authBtn.textContent = "Se connecter";

  clearMessage(authMessage);
});

signupTab.addEventListener("click", () => {
  authMode = "signup";

  signupTab.classList.add("active");
  loginTab.classList.remove("active");

  authBtn.textContent = "Créer mon profil";

  clearMessage(authMessage);
});

logoutBtn.addEventListener("click", async () => {
  await client.auth.signOut();

  currentUser = null;
  currentProfile = null;

  logoutBtn.classList.add("hidden");

  show(authPage);
});

refreshBtn.addEventListener("click", async () => {
  await loadQuestions();
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(
      publicLink.value
    );

    copyBtn.textContent = "Copié ✓";

    setTimeout(() => {
      copyBtn.textContent = "Copier";
    }, 1500);
  } catch {
    publicLink.select();
    document.execCommand("copy");

    copyBtn.textContent = "Copié ✓";

    setTimeout(() => {
      copyBtn.textContent = "Copier";
    }, 1500);
  }
});

shareBtn.addEventListener("click", async () => {
  const url = publicLink.value;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Mon RedFlag",
        text: "Pose-moi une question anonymement sur RedFlag.",
        url
      });
    } catch {
      // Partage annulé.
    }
  } else {
    await navigator.clipboard.writeText(url);

    shareBtn.textContent = "Lien copié ✓";

    setTimeout(() => {
      shareBtn.textContent = "Partager mon lien";
    }, 1500);
  }
});

questionText.addEventListener("input", () => {
  questionCounter.textContent =
    `${questionText.value.length} / 1000`;
});

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage(questionMessage);

  if (!currentPublicProfile) {
    message(
      questionMessage,
      "Profil introuvable."
    );
    return;
  }

  const text = questionText.value.trim();

  if (!text) {
    message(
      questionMessage,
      "Écris une question."
    );
    return;
  }

  const submitButton =
    questionForm.querySelector("button");

  submitButton.disabled = true;
  submitButton.textContent = "Envoi...";

  try {
    const { data, error } = await client
      .from("questions")
      .insert({
        profile_id: currentPublicProfile.id,
        question: text
      })
      .select("id")
      .single();

    if (error) throw error;

    lastQuestionId = data.id;

    questionText.value = "";
    questionCounter.textContent = "0 / 1000";

    message(
      questionMessage,
      "Question envoyée anonymement !",
      true
    );

    notificationBox.classList.remove("hidden");
  } catch (error) {
    console.error(error);

    message(
      questionMessage,
      error.message || "Impossible d'envoyer la question."
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent =
      "Envoyer anonymement";
  }
});

notificationBtn.addEventListener("click", async () => {
  if (!lastQuestionId) {
    message(
      notificationMessage,
      "Envoie d'abord ta question."
    );
    return;
  }

  if (!("Notification" in window)) {
    message(
      notificationMessage,
      "Les notifications ne sont pas disponibles sur ce navigateur."
    );
    return;
  }

  if (!("serviceWorker" in navigator)) {
    message(
      notificationMessage,
      "Ce navigateur ne prend pas en charge les notifications push."
    );
    return;
  }

  notificationBtn.disabled = true;
  notificationBtn.textContent =
    "Activation...";

  try {
    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Autorisation de notification refusée."
      );
    }

    const registration =
      await navigator.serviceWorker.register(
        "./sw.js"
      );

    const subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC_KEY
        )
      });

    const { error } = await client
      .from("push_subscriptions")
      .upsert(
        {
          question_id: lastQuestionId,
          subscription: subscription.toJSON()
        },
        {
          onConflict: "question_id"
        }
      );

    if (error) throw error;

    message(
      notificationMessage,
      "Notifications activées ✓",
      true
    );

    notificationBtn.textContent =
      "Notifications activées ✓";
  } catch (error) {
    console.error(error);

    message(
      notificationMessage,
      error.message ||
        "Impossible d'activer les notifications."
    );

    notificationBtn.disabled = false;
    notificationBtn.textContent =
      "Activer les notifications";
  }
});

async function init() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(
        "./sw.js"
      );
    } catch (error) {
      console.error(
        "Service Worker:",
        error
      );
    }
  }

  const params =
    new URLSearchParams(location.search);

  const slug = params.get("u");

  if (slug) {
    await openPublicProfile(slug);
    return;
  }

  const {
    data: { session }
  } = await client.auth.getSession();

  if (session?.user) {
    await openDashboard(session.user);
  } else {
    logoutBtn.classList.add("hidden");
    show(authPage);
  }
}

client.auth.onAuthStateChange(
  async (event, session) => {
    if (
      event === "SIGNED_OUT" ||
      !session?.user
    ) {
      currentUser = null;
      currentProfile = null;

      if (
        !new URLSearchParams(
          location.search
        ).get("u")
      ) {
        show(authPage);
      }

      return;
    }

    if (
      event === "SIGNED_IN" ||
      event === "INITIAL_SESSION"
    ) {
      if (
        !new URLSearchParams(
          location.search
        ).get("u")
      ) {
        await openDashboard(session.user);
      }
    }
  }
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date) {
  try {
    return new Date(date).toLocaleString(
      "fr-FR",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  } catch {
    return "";
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding =
    "=".repeat(
      (4 - (base64String.length % 4)) % 4
    );

  const base64 =
    (base64String + padding)
      .replaceAll("-", "+")
      .replaceAll("_", "/");

  const rawData = atob(base64);

  return Uint8Array.from(
    [...rawData].map((char) =>
      char.charCodeAt(0)
    )
  );
}

init();
