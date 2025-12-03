# 🚀 Backend AI Servisleri Entegrasyon Kılavuzu

Aşağıda backend'imizde hazır olan Yapay Zeka (AI) endpoint'leri ve kullanım detayları yer almaktadır. Tüm istekler `POST` metodudur ve JSON formatında veri bekler.

### 🔐 Genel Ayarlar (Headers)
Bazı endpoint'ler güvenlik için secret key isteyebilir. Garanti olması adına tüm isteklere şu header'ı eklemelisin:
*   **Header:** `x-app-secret`
*   **Değer:** (Env dosyasındaki `APP_SECRET` değeri)

---

### 1. 🎬 Akıllı Film Önerisi (Smart Recommendation)
Kullanıcının doğal dilde yazdığı isteği (örn: "bana kafa dağıtmalık komedi bul") alır, arka planda anahtar kelimelere çevirip TMDB'den en uygun filmleri ve fragmanlarını getirir.

*   **Endpoint:** `/api/ai/recommend`
*   **Method:** `POST`
*   **Body:**
    ```json
    {
      "message": "Kullanıcının yazdığı istek cümlesi (örn: I want 90s action movies)"
    }
    ```
*   **Dönen Cevap (Response):**
    ```json
    {
      "query": "Kullanıcının orjinal mesajı",
      "searchQuery": "AI tarafından üretilen arama terimi",
      "count": 5,
      "movies": [
        {
          "id": 123,
          "title": "Film Adı",
          "overview": "Film özeti...",
          "poster": "https://...",
          "videoUrl": "https://youtube.com/...",
          "videoSource": "youtube"
        }
        // ... toplam 5 film
      ]
    }
    ```

---

### 2. 💬 Film ile Sohbet (Contextual Movie Chat - "Kanka Modu")
Kullanıcının o an ekranda baktığı film hakkında, filmin detaylarını da bağlam (context) olarak vererek yapay zeka ile Türkçe ve samimi ("kanka" ağzıyla) konuşmasını sağlar.

*   **Endpoint:** `/api/ai/movie-chat`
*   **Method:** `POST`
*   **Body:**
    ```json
    {
      "movie": {
        "title": "Inception",
        "year": "2010",
        "genres": ["Action", "Sci-Fi"],
        "overview": "Dom Cobb is a skilled thief..."
      },
      "message": "Bu filmin sonu sence rüya mıydı?"
    }
    ```
*   **Dönen Cevap (Response):**
    ```json
    {
      "reply": "Kanka bence kesinlikle rüyaydı çünkü topaç düşmedi..."
    }
    ```

---

### 3. 🧠 Oturumlu Sohbet (Session Based Chat)
Bir film hakkında bağlamı koruyarak (önceki konuşmaları hatırlayarak) İngilizce sohbet etmek için kullanılır.

**Adım A: Oturum Başlat**
*   **Endpoint:** `/api/ai/session/start`
*   **Body:** `{ "movieId": "550" }`
*   **Response:** `{ "sessionId": "uuid-...", "aiMessage": "Chat session started..." }`

**Adım B: Sohbete Devam Et**
*   **Endpoint:** `/api/ai/session/message`
*   **Body:**
    ```json
    {
      "sessionId": "Adım A'dan dönen ID",
      "message": "Who is the main actor?"
    }
    ```
*   **Response:** `{ "aiMessage": "The main actor is Edward Norton..." }`
