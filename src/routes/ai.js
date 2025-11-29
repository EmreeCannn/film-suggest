import express from "express";
import axios from "axios";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

/**
 * YouTube Embed → Watch URL
 */
function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  if (!youtubeIdOrUrl.includes("youtube")) {
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  }

  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }

  if (youtubeIdOrUrl.includes("watch?v=")) {
    return youtubeIdOrUrl;
  }

  return null;
}

/**
 * Tek bir movieId'den full movie objesi üretir
 */
async function buildMovieObject(movieId) {
  try {
    // 1) Detaylar
    const detailsRes = await tmdb.get(`/movie/${movieId}`);
    const details = detailsRes.data;

    // 2) Cast & Director
    const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
    const castRaw = creditsRes.data.cast.slice(0, 8);
    const crewRaw = creditsRes.data.crew || [];

    const cast = castRaw.map((p) => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null,
    }));

    const director =
      crewRaw.find((p) => p.job === "Director")?.name || null;

    // 3) Sertifika
    const releaseRes = await tmdb.get(`/movie/${movieId}/release_dates`);
    const certification =
      releaseRes.data.results
        ?.find((r) => r.iso_3166_1 === "US")
        ?.release_dates?.[0]?.certification || null;

    // 4) Fragman
    const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
    const videos = videoRes.data.results || [];

    const tmdbVideo = videos.find(
      (v) => v.site === "TMDB" && (v.url?.endsWith(".mp4") || false)
    );

    let videoUrl = null;
    let videoSource = null;

    if (tmdbVideo) {
      videoUrl = tmdbVideo.url;
      videoSource = "tmdb_mp4";
    } else {
      const yt = videos.find(
        (v) => v.site === "YouTube" && v.type === "Trailer"
      );
      if (yt) {
        videoUrl = convertToWatchUrl(yt.key);
        videoSource = "youtube";
      }
    }

    // 5) Watch providers (Netflix, Prime, Disney+, vs.)
    const providerRes = await tmdb.get(`/movie/${movieId}/watch/providers`);
    const usProviders = providerRes.data.results?.US || {};

    function mapProviders(list, type) {
      if (!list) return [];
      return list.map((p) => ({
        name: p.provider_name,
        type, // subscription / buy / rent / ads
        logo: p.logo_path
          ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
          : null,
      }));
    }

    const platforms = [
      ...mapProviders(usProviders.flatrate, "subscription"),
      ...mapProviders(usProviders.buy, "buy"),
      ...mapProviders(usProviders.rent, "rent"),
      ...mapProviders(usProviders.ads, "ads"),
    ];

    const platformLink = usProviders.link || null;

    return {
      id: movieId,
      title: details.title,
      overview: details.overview,
      year: details.release_date?.split("-")[0] || "N/A",
      rating: details.vote_average,
      runtime: details.runtime,
      certification,
      director,
      genres: details.genres?.map((g) => g.name) || [],
      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null,
      backdrop: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
        : null,
      cast,
      platforms,
      platformLink,
      videoUrl,
      videoSource,
    };
  } catch (err) {
    console.error("buildMovieObject error:", err.message);
    return null;
  }
}

/**
 * AI'dan film isimleriyle plan almamız için prompt
 */
const SYSTEM_PROMPT = `
Sen bir film öneri yapay zekasısın. Kullanıcıyla Türkçe konuş, samimi ol, "kanka" tonunda yazabilirsin ama aşırı abartma.

Cevabın HER ZAMAN sadece şu formatta olsun:

{
  "reply": "kullanıcıya yazacağın sohbet mesajı (Türkçe, kısa, maksimum 3-4 cümle)",
  "movies": ["Film Adı 1", "Film Adı 2", "Film Adı 3"]
}

Kurallar:
- "movies" dizisinde en fazla 5 film olsun.
- 1 ile 5 arası film önerebilirsin, ama asla 5'ten fazla olmasın.
- Filmler mutlaka GERÇEK sinema filmleri olsun, uydurma isim yazma.
- Kullanıcının isteğiyle tür, ton ve dönem açısından alakalı filmler seç.
- Film isimlerini sadece orijinal isimleriyle yaz (İngilizce veya TMDB'de geçtiği haliyle).
- JSON dışında hiçbir şey yazma, açıklama ekleme, markdown kullanma.
`;

/**
 * POST /api/ai/feed
 * body: { message: "..." }
 */
router.post("/feed", async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage) {
      return res.status(400).json({ error: "message lazım knk" });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY yok knk" });
    }

    // 1) OpenRouter'dan AI cevabı ve film isimlerini al
    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini", // istersen burayı değiştiririz
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.8,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawContent = aiRes.data?.choices?.[0]?.message?.content;
    let replyText = "";
    let movieTitles = [];

    try {
      const parsed = JSON.parse(rawContent);
      replyText = parsed.reply || "";
      if (Array.isArray(parsed.movies)) {
        movieTitles = parsed.movies
          .filter((m) => typeof m === "string")
          .slice(0, 5);
      }
    } catch (err) {
      console.error("AI JSON parse error:", err.message);
      // Fallback: düz text gibi davran
      replyText = rawContent || "";
      movieTitles = [];
    }

    // 2) Eğer film listesi boşsa, kullanıcıya sadece mesaj dön
    if (!movieTitles.length) {
      return res.json({
        message: replyText || "Knk şu an net bir film seçemedim ama biraz daha detay verirsen sana güzel liste yaparım.",
        count: 0,
        movies: [],
      });
    }

    // 3) Her film adı için TMDB'den en iyi eşleşen filmi bul
    const movieResults = [];

    for (const title of movieTitles) {
      try {
        const searchRes = await tmdb.get("/search/movie", {
          params: {
            query: title,
            include_adult: false,
            page: 1,
          },
        });

        const first = searchRes.data.results?.[0];
        if (!first) continue;

        const fullMovie = await buildMovieObject(first.id);
        if (fullMovie) {
          movieResults.push(fullMovie);
        }
      } catch (err) {
        console.error("TMDB search error for title:", title, err.message);
      }
    }

    return res.json({
      message: replyText,
      count: movieResults.length,
      movies: movieResults,
    });
  } catch (err) {
    console.error("AI FEED ERROR:", err.message);
    return res.status(500).json({ error: "AI feed hata verdi knk" });
  }
});

export default router;
