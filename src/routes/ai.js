// import express from "express";
// import axios from "axios";
// import { v4 as uuid } from "uuid";
// import { tmdb } from "../services/tmdb.js";

// const router = express.Router();

// const sessions = {};
// /* ============================================================
//    OPENROUTER CHAT HELPER
// ============================================================ */
// async function askOpenRouter(
//   messages,
//   model = "openai/gpt-4o-mini"
// ) {
//   try {
//     const r = await axios.post(
//       "https://openrouter.ai/api/v1/chat/completions",
//       {
//         model,
//         messages,
//         max_tokens: 200
//       },
//       {
//         headers: {
//           "Authorization": `Bearer ${process.env.OPEN_ROUTER_API}`,
//           "Content-Type": "application/json",
//           "HTTP-Referer": "https://film-suggest.vercel.app",
//           "X-Title": "FilmSuggest AI"
//         }
//       }
//     );

//     return r.data.choices?.[0]?.message?.content || "No response from AI.";
//   } catch (err) {
//     console.error("OpenRouter Error:", err.response?.data || err.message);
//     return "AI error knk.";
//   }
// }

// /* ============================================================
//    GET TRAILER FOR MOVIE
// ============================================================ */
// async function getTrailer(movieId) {
//   try {
//     const r = await tmdb.get(`/movie/${movieId}/videos`);

//     const yt = r.data.results.find(
//       (v) => v.site === "YouTube" && v.type === "Trailer"
//     );

//     if (!yt) return { videoUrl: null, videoSource: null };

//     return {
//       videoUrl: `https://www.youtube.com/watch?v=${yt.key}`,
//       videoSource: "youtube"
//     };
//   } catch {
//     return { videoUrl: null, videoSource: null };
//   }
// }

// /* ============================================================
//    TMDB SEARCH + TRAILER + FORCE 5 RESULTS
// ============================================================ */
// async function searchTMDBFull(query) {
//   try {
//     const r = await tmdb.get("/search/movie", {
//       params: {
//         query,
//         include_adult: false
//       }
//     });

//     let results = r.data.results;

//     // Eğer 5 film yoksa → trend ekleyip tamamla
//     if (results.length < 5) {
//       const trend = await tmdb.get("/trending/movie/day");
//       results = [...results, ...trend.data.results].slice(0, 5);
//     } else {
//       results = results.slice(0, 5);
//     }

//     // Her film için trailer getir
//     const movies = [];
//     for (const m of results) {
//       const trailer = await getTrailer(m.id);

//       movies.push({
//         id: m.id,
//         title: m.title,
//         overview: m.overview,
//         year: m.release_date?.split("-")[0] || null,

//         poster: m.poster_path
//           ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
//           : null,

//         backdrop: m.backdrop_path
//           ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}`
//           : null,

//         videoUrl: trailer.videoUrl,
//         videoSource: trailer.videoSource
//       });
//     }

//     return movies;
//   } catch (err) {
//     console.error("TMDB Search Error:", err.message);
//     return [];
//   }
// }

// /* ============================================================
//    1) START AI CHAT SESSION
// ============================================================ */
// router.post("/session/start", (req, res) => {
//   const { movieId } = req.body;

//   if (!movieId) return res.status(400).json({ error: "movieId is required" });

//   const sessionId = uuid();

//   sessions[sessionId] = {
//     movieId,
//     history: []
//   };

//   return res.json({
//     sessionId,
//     aiMessage:
//       "Chat session started . Ask me anything about this movie."
//   });
// });

// /* ============================================================
//    2) CONTINUE CHAT
// ============================================================ */
// router.post("/session/message", async (req, res) => {
//   const { sessionId, message } = req.body;

//   if (!sessionId || !message)
//     return res.status(400).json({ error: "sessionId and message are required" });

//   const session = sessions[sessionId];
//   if (!session) return res.status(404).json({ error: "Session not found" });

//   const msgs = [
//     {
//       role: "system",
//       content:
//         "You are a friendly movie assistant. Always respond in English. User calls you 'knk'."
//     }
//   ];

//   session.history.push({ role: "user", content: message });
//   msgs.push(...session.history);

//   const response = await askOpenRouter(msgs);

//   session.history.push({ role: "assistant", content: response });

//   return res.json({
//     aiMessage: response
//   });
// });

// /* ============================================================
//    3) RECOMMEND MOVIES (NO TALKING — ONLY RESULTS)
// ============================================================ */
// router.post("/recommend", async (req, res) => {
//   const { message } = req.body;

//   if (!message)
//     return res.status(400).json({ error: "message is required" });

//   // Step 1: AI → convert request to simple keyword
//   const prompt = `
// Convert the user's request into a simple English movie search keyword.

// Example:
// User: "knk I want scary psychological thrillers"
// Output: "psychological thriller"

// User Input: "${message}"
// Return ONLY the keyword.
// `;

//   const aiQuery = await askOpenRouter(
//     [{ role: "user", content: prompt }],
//     "openai/gpt-4o-mini"
//   );

//   // Step 2: TMDB search + trailers + ensure 5 results
//   const movies = await searchTMDBFull(aiQuery);

//   return res.json({
//     query: message,
//     searchQuery: aiQuery,
//     count: movies.length,
//     movies
//   });
// });

// export default router;
import express from "express";
import axios from "axios";
import { v4 as uuid } from "uuid";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();
const sessions = {};

/* ============================================================
   OPENROUTER CHAT HELPER
============================================================ */
async function askOpenRouter(messages, model = "openai/gpt-4o-mini") {
  try {
    const r = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model,
        messages,
        max_tokens: 250,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPEN_ROUTER_API}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://film-suggest.vercel.app",
          "X-Title": "FilmSuggest AI",
        },
      }
    );

    return r.data.choices?.[0]?.message?.content || "No response.";
  } catch (err) {
    console.error("OpenRouter Error:", err.response?.data || err.message);
    return "AI error knk.";
  }
}

/* ============================================================
   TRAILER GETTER
============================================================ */
async function getTrailer(movieId) {
  try {
    const r = await tmdb.get(`/movie/${movieId}/videos`);

    const yt = r.data.results.find(
      (v) => v.site === "YouTube" && v.type === "Trailer"
    );

    if (!yt) return { videoUrl: null, videoSource: null };

    return {
      videoUrl: `https://www.youtube.com/watch?v=${yt.key}`,
      videoSource: "youtube",
    };
  } catch {
    return { videoUrl: null, videoSource: null };
  }
}

/* ============================================================
   TMDB SEARCH + TRAILER + FORCE 5 RESULTS
============================================================ */
async function searchTMDBFull(query) {
  try {
    const r = await tmdb.get("/search/movie", {
      params: { query, include_adult: false },
    });

    let results = r.data.results;

    if (results.length < 5) {
      const trend = await tmdb.get("/trending/movie/day");
      results = [...results, ...trend.data.results].slice(0, 5);
    } else {
      results = results.slice(0, 5);
    }

    const movies = [];
    for (const m of results) {
      const trailer = await getTrailer(m.id);

      movies.push({
        id: m.id,
        title: m.title,
        overview: m.overview,
        year: m.release_date?.split("-")[0] || null,
        poster: m.poster_path
          ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
          : null,
        backdrop: m.backdrop_path
          ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}`
          : null,
        videoUrl: trailer.videoUrl,
        videoSource: trailer.videoSource,
      });
    }

    return movies;
  } catch (err) {
    console.error("TMDB Search Error:", err.message);
    return [];
  }
}

/* ============================================================
   1) START SESSION
============================================================ */
router.post("/session/start", (req, res) => {
  const { movieId } = req.body;
  if (!movieId) return res.status(400).json({ error: "movieId is required" });

  const sessionId = uuid();

  sessions[sessionId] = {
    movieId,
    history: [],
    language: null, // Auto detect later
  };

  return res.json({
    sessionId,
    aiMessage: "Chat session started. Ask me anything about this movie.",
  });
});

/* ============================================================
   2) CHAT MESSAGE
============================================================ */
router.post("/session/message", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message)
    return res.status(400).json({ error: "sessionId and message required" });

  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  /* -------------------------------
     AUTO-DETECT USER LANGUAGE
  --------------------------------*/
  if (!session.language) {
    const langPrompt = `
Detect the language of this message: "${message}"
Return only the ISO code like "en", "tr", "es", "de".
`;
    const lang = await askOpenRouter([{ role: "user", content: langPrompt }]);
    session.language = lang.trim().toLowerCase() || "en";
  }

  /* -------------------------------
     NEW SYSTEM PROMPT (SMART!)
  --------------------------------*/
  const msgs = [
    {
      role: "system",
      content: `
You are FilmSuggest AI.
Your only job is:
- Talk ONLY about movies, cinema, actors, directors, story analysis, trivia.
- Always answer in the user's language: "${session.language}".
- Never behave like a search engine.
- Never give unrelated answers.
- Keep your responses short, useful, and friendly.
- User calls you "knk", respond naturally.
      `,
    },
  ];

  session.history.push({ role: "user", content: message });
  msgs.push(...session.history);

  const response = await askOpenRouter(msgs);
  session.history.push({ role: "assistant", content: response });

  return res.json({ aiMessage: response });
});

/* ============================================================
   3) MOVIE RECOMMENDATION (SMART)
============================================================ */
router.post("/recommend", async (req, res) => {
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: "message required" });

  const prompt = `
USER REQUEST: "${message}"

You MUST return **only a short search keyword** in English.
Examples:
- "sad romantic movies" → "romantic drama"
- "knk I want something scary" → "horror"
- "uzaylılı filmler öner" → "alien sci-fi"
- "komik ne var" → "comedy"

Return ONLY 1–3 words. No sentences.
  `;

  const aiQuery = await askOpenRouter([{ role: "user", content: prompt }]);

  const movies = await searchTMDBFull(aiQuery);

  return res.json({
    query: message,
    searchQuery: aiQuery,
    count: movies.length,
    movies,
  });
});

export default router;
