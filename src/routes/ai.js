import express from "express";
import axios from "axios";
import NodeCache from "node-cache";

const router = express.Router();

// AI filtre cache'i (prompt -> filters)
const aiCache = new NodeCache({
  stdTTL: 300,    // 5 dk
  checkperiod: 320,
});

// AI + Feed birleşmiş result cache'i (prompt -> feed)
const aiFeedCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 320,
});

// Aynı anda gelen istekleri tek çağrıya düşürmek için
const inFlightFilters = new Map();
const inFlightFeeds = new Map();

/**
 * Ortak helper: prompt'a göre AI'dan filtre al
 * Hem cache'li hem concurrency kontrollü
 */
async function getFiltersForPrompt(userPrompt) {
  const normalizedPrompt = userPrompt.toLowerCase().trim();
  const cacheKey = `ai_filters_${normalizedPrompt}`;

  // 1) Cache varsa
  const cached = aiCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true, shared: false };
  }

  // 2) Aynı prompt için AI çağrısı zaten çalışıyorsa, onu bekle
  if (inFlightFilters.has(cacheKey)) {
    const sharedResp = await inFlightFilters.get(cacheKey);
    return { ...sharedResp, cached: true, shared: true };
  }

  // 3) İlk biz istiyoruz → OpenRouter'a git
  const aiPromise = (async () => {
    const openRouterResp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini", // istersen başka modelle değiştir
        messages: [
          {
            role: "system",
            content:
              "You are a movie recommendation filter builder for a TMDB-based trailer app. " +
              "The user writes in natural language what they want to watch. " +
              "You must respond ONLY with a valid JSON object, no explanation. " +
              "Use this shape: " +
              "{ category?: 'action'|'adventure'|'comedy'|'crime'|'drama'|'fantasy'|'horror'|'romance'|'scifi'|'thriller'," +
              "  genres?: string[], minRating?: number, yearRange?: [number, number], maxRuntime?: number }"
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPEN_ROUTER_API}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawContent =
      openRouterResp.data?.choices?.[0]?.message?.content || "{}";

    let filters;
    try {
      filters = JSON.parse(rawContent);
    } catch (e) {
      console.error("AI JSON parse error:", e.message, "raw:", rawContent);
      // Parse edilemezse default
      filters = { category: "action" };
    }

    const result = {
      prompt: userPrompt,
      filters,
    };

    aiCache.set(cacheKey, result);
    inFlightFilters.delete(cacheKey);

    return result;
  })();

  inFlightFilters.set(cacheKey, aiPromise);

  const fresh = await aiPromise;
  return { ...fresh, cached: false, shared: false };
}

/**
 * 1) Sadece filtre görmek için:
 * POST /api/ai/recommend
 * body: { "prompt": "..." }
 */
router.post("/recommend", async (req, res) => {
  try {
    const userPrompt = (req.body.prompt || "").trim();
    if (!userPrompt) {
      return res.status(400).json({ error: "prompt lazım knk" });
    }

    const data = await getFiltersForPrompt(userPrompt);
    return res.json(data);
  } catch (err) {
    console.error("AI /recommend ERROR:", err.response?.data || err.message);
    return res.status(500).json({ error: "AI hata verdi knk" });
  }
});

/**
 * 2) Asıl istediğimiz endpoint:
 * POST /api/ai/feed
 * body: { "prompt": "bugün hızlı tempolu bilim kurgu istiyorum" }
 *
 * Yaptığı:
 *  - AI'dan filtre alır (category, minRating vs.)
 *  - Arkada /api/feed?category=... çağırır
 *  - Feed içinden AI filtrelerine uyan filmleri süzer
 *  - Sana TMDB feed ile AYNI formatta (fragmanlı) film listesi döner
 */
router.post("/feed", async (req, res) => {
  try {
    const userPrompt = (req.body.prompt || "").trim();
    if (!userPrompt) {
      return res.status(400).json({ error: "prompt lazım knk" });
    }

    const normalizedPrompt = userPrompt.toLowerCase();
    const cacheKey = `ai_feed_${normalizedPrompt}`;

    // 1) CACHE
    const cached = aiFeedCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 2) IN-FLIGHT
    if (inFlightFeeds.has(cacheKey)) {
      const shared = await inFlightFeeds.get(cacheKey);
      return res.json({ ...shared, cached: true, shared: true });
    }

    // 3) Yeni feed oluştur
    const feedPromise = (async () => {
      // 3.1 AI'dan filtreleri al
      const { filters } = await getFiltersForPrompt(userPrompt);
      const category = (filters.category || "action").toLowerCase();

      // 3.2 Arka planda feed çek
      const baseUrl = process.env.INTERNAL_BASE_URL || "http://localhost:3000";
      const feedResp = await axios.get(`${baseUrl}/api`, {
        params: { category },
        headers: {
          "x-app-secret": process.env.APP_SECRET,
        },
      });

      let movies = feedResp.data.feed || [];

      // 3.3 AI filtrelerini uygula
      if (filters.minRating) {
        movies = movies.filter((m) => (m.rating || 0) >= filters.minRating);
      }

      if (filters.yearRange && Array.isArray(filters.yearRange)) {
        const [minYear, maxYear] = filters.yearRange;
        movies = movies.filter((m) => {
          const y = parseInt(m.year, 10);
          if (Number.isNaN(y)) return false;
          if (minYear && y < minYear) return false;
          if (maxYear && y > maxYear) return false;
          return true;
        });
      }

      if (filters.maxRuntime) {
        movies = movies.filter(
          (m) => !m.runtime || m.runtime <= filters.maxRuntime
        );
      }

      if (filters.genres && Array.isArray(filters.genres)) {
        const wanted = filters.genres.map((g) => g.toLowerCase());
        movies = movies.filter((m) => {
          const movieGenres = (m.genres || []).map((g) => g.toLowerCase());
          return movieGenres.some((mg) => wanted.includes(mg));
        });
      }

      // -------------------------
      // 3.4 AGENT MESAJI EKLİYORUZ 🔥
      // -------------------------

      let agentMessage = "Film önerileri hazır knk.";

      if (movies.length > 0) {
        const topMovies = movies.slice(0, 5).map((m) => m.title).join(", ");

        // AI'ya feed verip bir özet cümle ürettirelim
        try {
          const agentResp = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "Sen bir film öneri asistanısın. Kullanıcının istediği türe göre kısa, akıcı bir öneri cümlesi yaz. Maksimum 2 cümle."
                },
                {
                  role: "user",
                  content:
                    `Kullanıcı şunu istedi: "${userPrompt}".` +
                    ` Ona uygun filmler: ${topMovies}.`
                }
              ]
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPEN_ROUTER_API}`,
                "Content-Type": "application/json",
              },
            }
          );

          agentMessage =
            agentResp.data?.choices?.[0]?.message?.content ||
            agentMessage;
        } catch (e) {
          console.error("Agent message error:", e.message);
        }
      }

      // Response
      const responseBody = {
        prompt: userPrompt,
        filters,
        agent: agentMessage,   // 🔥 YENİ EKLEDİĞİMİZ KISIM
        category,
        count: movies.length,
        feed: movies,
      };

      aiFeedCache.set(cacheKey, responseBody);
      inFlightFeeds.delete(cacheKey);

      return responseBody;
    })();

    inFlightFeeds.set(cacheKey, feedPromise);
    const finalFeed = await feedPromise;

    return res.json({ ...finalFeed, cached: false });

  } catch (err) {
    console.error("AI /feed ERROR:", err.response?.data || err.message);
    return res.status(500).json({ error: "AI feed hata verdi knk" });
  }
});


export default router;
