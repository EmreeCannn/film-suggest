import express from "express";
import axios from "axios";

const router = express.Router();

const SYSTEM_PROMPT = `
Sen bir film sohbet asistanısın. Kullanıcıyla samimi bir Türkçe tonunda konuşabilirsin (kanka gibi), ama aşırı argo kullanma.

Görevin:
- Kullanıcının sorduğu soruya cevap vermek
- Film hakkındaki bilgileri film objesinden okumak
- Kullanıcı spoiler istemiyorsa SPOILER verme
- Kullanıcı isterse benzer filmler öner
- Sadece JSON yanıt döndür

Format:
{
  "reply": "kullanıcıya vereceğin kısa sohbet cevabı"
}
`;

router.post("/movie-chat", async (req, res) => {
  try {
    const { movie, message } = req.body;

    if (!movie || !message) {
      return res.status(400).json({ error: "movie ve message lazım knk" });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY eksik" });
    }

    const movieContext = `
Film Bilgisi:
Başlık: ${movie.title}
Yıl: ${movie.year}
Türler: ${movie.genres?.join(", ")}
Özet: ${movie.overview}
`;

    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: movieContext },
          { role: "user", content: message }
        ],
        max_tokens: 300,
        temperature: 0.8
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPEN_ROUTER_API}`,
          "Content-Type": "application/json"
        }
      }
    );

    let raw = aiRes.data.choices[0].message.content;

    let reply = "";

    try {
      const parsed = JSON.parse(raw);
      reply = parsed.reply || "Knk cevap oluşturamadım.";
    } catch (err) {
      reply = raw; 
    }

    return res.json({ reply });

  } catch (err) {
    console.error("AI movie chat error:", err.message);
    return res.status(500).json({ error: "AI movie chat hata verdi knk" });
  }
});

export default router;
