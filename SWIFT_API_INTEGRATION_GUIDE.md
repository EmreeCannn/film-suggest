# 🎬 Film Suggest API - Swift + Antigravity Entegrasyon Rehberi

Bu rehber, Film Suggest backend API'sini Swift uygulamanızda Antigravity kullanarak nasıl entegre edeceğinizi detaylı bir şekilde açıklar.

## 📋 İçindekiler

1. [Genel Bilgiler](#genel-bilgiler)
2. [Base URL ve Headers](#base-url-ve-headers)
3. [Modeller (Models)](#modeller-models)
4. [API Endpoint'leri](#api-endpointleri)
5. [Örnek Kodlar](#örnek-kodlar)

---

## 🔧 Genel Bilgiler

### Base URL
```
Production: https://your-api-domain.com
Development: http://localhost:3000
```

### Önemli Notlar
- Tüm `/api/*` endpoint'leri için `x-app-secret` header'ı zorunludur
- Authentication gerektiren endpoint'ler için `Authorization: Bearer {token}` header'ı kullanılır
- Tüm request'ler JSON formatında gönderilir
- Tüm response'lar JSON formatında döner

---

## 📡 Base URL ve Headers

### Antigravity ile Base Configuration

```swift
import Antigravity

class APIClient {
    static let shared = APIClient()
    
    private let baseURL = "https://your-api-domain.com"
    private let appSecret = "YOUR_APP_SECRET_HERE" // Backend'den alınacak
    
    private var defaultHeaders: [String: String] {
        var headers = [
            "Content-Type": "application/json",
            "x-app-secret": appSecret
        ]
        
        // Eğer kullanıcı giriş yaptıysa token ekle
        if let token = UserDefaults.standard.string(forKey: "auth_token") {
            headers["Authorization"] = "Bearer \(token)"
        }
        
        return headers
    }
    
    private init() {}
}
```

---

## 📦 Modeller (Models)

### User Model

```swift
struct User: Codable {
    let id: String
    let email: String?
    let name: String?
    let plan: String // "free" veya "premium"
    let dailyCount: Int?
    let lastResetDate: String?
    let createdAt: String?
    let updatedAt: String?
}

struct AuthResponse: Codable {
    let user: User
    let token: String
}
```

### Movie Model

```swift
struct CastMember: Codable {
    let name: String
    let character: String
    let profile: String?
}

struct Platform: Codable {
    let name: String
    let type: String // "subscription", "buy", "rent", "ads"
    let logo: String?
}

struct ProductionCompany: Codable {
    let name: String
    let logo: String?
}

struct Movie: Codable {
    let id: Int
    let title: String
    let overview: String
    let year: String
    let rating: Double
    let runtime: Int?
    let certification: String?
    let director: String?
    let genres: [String]
    let cast: [CastMember]
    let poster: String?
    let backdrop: String?
    let platforms: [Platform]
    let platformLink: String?
    let videoUrl: String
    let videoSource: String // "tmdb_mp4" veya "youtube"
    let productionCompanies: [ProductionCompany]? // Sadece feed endpoint'inde var
}
```

### Response Models

```swift
// All Feed Response
struct AllFeedResponse: Codable {
    let page: Int
    let count: Int
    let movies: [Movie]
}

// Feed Response
struct FeedResponse: Codable {
    let category: String
    let count: Int
    let feed: [Movie]
    let cached: Bool?
}

// Trending Response
struct TrendingResponse: Codable {
    let mode: String
    let count: Int
    let feed: [Movie]
    let cached: Bool?
}

// Search Response
struct SearchResponse: Codable {
    let query: String
    let count: Int
    let movies: [Movie]
}

// Error Response
struct ErrorResponse: Codable {
    let error: String
    let limit: Int?
    let currentCount: Int?
    let remaining: Int?
    let isPremium: Bool?
}
```

---

## 🚀 API Endpoint'leri

### 1. Authentication Endpoints

#### 1.1 Register (Kayıt)

**Endpoint:** `POST /auth/register`

**Headers:**
- `Content-Type: application/json`
- `x-app-secret: YOUR_APP_SECRET` (NOT: /auth endpoint'leri için secret gerekmez)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe" // Optional
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "name": "John Doe",
    "plan": "free",
    "dailyCount": 0,
    "lastResetDate": "2024-12-04T...",
    "createdAt": "2024-12-04T...",
    "updatedAt": "2024-12-04T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Swift Implementation:**
```swift
func register(email: String, password: String, name: String?) async throws -> AuthResponse {
    let url = URL(string: "\(baseURL)/auth/register")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any?] = [
        "email": email,
        "password": password,
        "name": name
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body.compactMapValues { $0 })
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode == 409 {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.conflict(error.error)
    }
    
    guard httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    return try JSONDecoder().decode(AuthResponse.self, from: data)
}
```

#### 1.2 Login (Giriş)

**Endpoint:** `POST /auth/login`

**Headers:**
- `Content-Type: application/json`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** Aynı Register response formatı

**Swift Implementation:**
```swift
func login(email: String, password: String) async throws -> AuthResponse {
    let url = URL(string: "\(baseURL)/auth/login")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: String] = [
        "email": email,
        "password": password
    ]
    request.httpBody = try JSONEncoder().encode(body)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode == 401 {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.unauthorized(error.error)
    }
    
    guard httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
    
    // Token'ı kaydet
    UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
    
    return authResponse
}
```

#### 1.3 Google Sign-In

**Endpoint:** `POST /auth/google`

**Headers:**
- `Content-Type: application/json`

**Request Body:**
```json
{
  "idToken": "google_id_token_here"
}
```

**Response:** Aynı Register response formatı

**Swift Implementation:**
```swift
func googleSignIn(idToken: String) async throws -> AuthResponse {
    let url = URL(string: "\(baseURL)/auth/google")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: String] = ["idToken": idToken]
    request.httpBody = try JSONEncoder().encode(body)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
    UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
    
    return authResponse
}
```

#### 1.4 Premium Upgrade

**Endpoint:** `POST /auth/upgrade`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer {token}` (ZORUNLU)
- `x-app-secret: YOUR_APP_SECRET`

**Request Body:** Boş (body göndermene gerek yok)

**Response (200 OK):**
```json
{
  "message": "Premium başarıyla aktif edildi knk 🎉",
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "plan": "premium",
    ...
  },
  "token": "new_token_here"
}
```

**Swift Implementation:**
```swift
func upgradeToPremium() async throws -> AuthResponse {
    let url = URL(string: "\(baseURL)/auth/upgrade")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    
    // Tüm header'ları ekle
    for (key, value) in defaultHeaders {
        request.setValue(value, forHTTPHeaderField: key)
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
    UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
    
    return authResponse
}
```

---

### 2. Movie Feed Endpoints

#### 2.1 All Feed (TikTok Tarzı Scroll)

**Endpoint:** `GET /api/all?page={page}`

**Headers:**
- `x-app-secret: YOUR_APP_SECRET` (ZORUNLU)
- `Authorization: Bearer {token}` (Optional - Guest olarak da kullanılabilir)

**Query Parameters:**
- `page` (Int, optional, default: 1) - Sayfa numarası

**Response (200 OK):**
```json
{
  "page": 1,
  "count": 10,
  "movies": [
    {
      "id": 123,
      "title": "Movie Title",
      "overview": "Movie description...",
      "year": "2024",
      "rating": 8.5,
      "runtime": 120,
      "certification": "PG-13",
      "director": "Director Name",
      "genres": ["Action", "Drama"],
      "cast": [
        {
          "name": "Actor Name",
          "character": "Character Name",
          "profile": "https://image.tmdb.org/t/p/w500/..."
        }
      ],
      "poster": "https://image.tmdb.org/t/p/w500/...",
      "backdrop": "https://image.tmdb.org/t/p/w780/...",
      "platforms": [
        {
          "name": "Netflix",
          "type": "subscription",
          "logo": "https://image.tmdb.org/t/p/w500/..."
        }
      ],
      "platformLink": "https://www.themoviedb.org/...",
      "videoUrl": "https://www.youtube.com/watch?v=...",
      "videoSource": "youtube"
    }
  ]
}
```

**Response (403 Forbidden - Limit Dolu):**
```json
{
  "error": "Günlük 30 film limitini doldurdun knk. Yarın tekrar dene!",
  "limit": 30,
  "currentCount": 30,
  "remaining": 0,
  "isPremium": false
}
```

**Swift Implementation:**
```swift
func getAllFeed(page: Int = 1) async throws -> AllFeedResponse {
    let url = URL(string: "\(baseURL)/api/all?page=\(page)")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    
    // Header'ları ekle
    for (key, value) in defaultHeaders {
        request.setValue(value, forHTTPHeaderField: key)
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode == 403 {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.limitReached(error)
    }
    
    guard httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    return try JSONDecoder().decode(AllFeedResponse.self, from: data)
}
```

#### 2.2 Category Feed

**Endpoint:** `GET /api?category={category}`

**Headers:**
- `x-app-secret: YOUR_APP_SECRET` (ZORUNLU)
- `Authorization: Bearer {token}` (Optional)

**Query Parameters:**
- `category` (String, optional, default: "action") - Kategori: "action", "comedy", "drama", "horror", "romance", "scifi", "thriller", vb.

**Response (200 OK):**
```json
{
  "category": "action",
  "count": 25,
  "feed": [/* Movie array */],
  "cached": false
}
```

**Swift Implementation:**
```swift
func getCategoryFeed(category: String = "action") async throws -> FeedResponse {
    let url = URL(string: "\(baseURL)/api?category=\(category)")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    
    for (key, value) in defaultHeaders {
        request.setValue(value, forHTTPHeaderField: key)
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    return try JSONDecoder().decode(FeedResponse.self, from: data)
}
```

#### 2.3 Trending Movies

**Endpoint:** `GET /api/trending`

**Headers:**
- `x-app-secret: YOUR_APP_SECRET` (ZORUNLU)

**Response (200 OK):**
```json
{
  "mode": "trending",
  "count": 15,
  "feed": [/* Movie array */],
  "cached": false
}
```

**Swift Implementation:**
```swift
func getTrendingMovies() async throws -> TrendingResponse {
    let url = URL(string: "\(baseURL)/api/trending")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    
    for (key, value) in defaultHeaders {
        request.setValue(value, forHTTPHeaderField: key)
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    return try JSONDecoder().decode(TrendingResponse.self, from: data)
}
```

#### 2.4 Search Movies

**Endpoint:** `GET /api/search?query={search_term}`

**Headers:**
- `x-app-secret: YOUR_APP_SECRET` (ZORUNLU)

**Query Parameters:**
- `query` (String, ZORUNLU) - Arama terimi

**Response (200 OK):**
```json
{
  "query": "batman",
  "count": 8,
  "movies": [/* Movie array */]
}
```

**Response (400 Bad Request):**
```json
{
  "error": "query lazım knk"
}
```

**Swift Implementation:**
```swift
func searchMovies(query: String) async throws -> SearchResponse {
    guard let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
          let url = URL(string: "\(baseURL)/api/search?query=\(encodedQuery)") else {
        throw APIError.invalidURL
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    
    for (key, value) in defaultHeaders {
        request.setValue(value, forHTTPHeaderField: key)
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode == 400 {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.badRequest(error.error)
    }
    
    guard httpResponse.statusCode == 200 else {
        let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw APIError.serverError(error.error)
    }
    
    return try JSONDecoder().decode(SearchResponse.self, from: data)
}
```

---

## 🛠 Error Handling

### APIError Enum

```swift
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized(String)
    case conflict(String)
    case badRequest(String)
    case limitReached(ErrorResponse)
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Geçersiz URL"
        case .invalidResponse:
            return "Geçersiz yanıt"
        case .unauthorized(let message):
            return message
        case .conflict(let message):
            return message
        case .badRequest(let message):
            return message
        case .limitReached(let error):
            return error.error
        case .serverError(let message):
            return message
        }
    }
}
```

---

## 📱 Kullanım Örnekleri

### Örnek 1: Kullanıcı Kaydı ve Feed Çekme

```swift
Task {
    do {
        // 1. Kullanıcı kaydı
        let authResponse = try await APIClient.shared.register(
            email: "user@example.com",
            password: "password123",
            name: "John Doe"
        )
        
        print("Kullanıcı kaydedildi: \(authResponse.user.email ?? "")")
        print("Token: \(authResponse.token)")
        
        // 2. Feed çekme
        let feedResponse = try await APIClient.shared.getAllFeed(page: 1)
        print("\(feedResponse.count) film geldi")
        
        for movie in feedResponse.movies {
            print("Film: \(movie.title)")
            print("Video URL: \(movie.videoUrl)")
        }
        
    } catch APIError.limitReached(let error) {
        print("Limit doldu: \(error.error)")
        print("Kalan: \(error.remaining ?? 0)")
    } catch {
        print("Hata: \(error.localizedDescription)")
    }
}
```

### Örnek 2: Guest Kullanıcı ile Feed Çekme

```swift
Task {
    do {
        // Token olmadan feed çekme (Guest mode)
        // APIClient'ta token yoksa otomatik olarak guest olarak işlem yapılır
        let feedResponse = try await APIClient.shared.getAllFeed(page: 1)
        
        // Filmleri göster
        for movie in feedResponse.movies {
            // UI'da göster
        }
        
    } catch APIError.limitReached(let error) {
        // Limit doldu, kullanıcıya göster
        showAlert(message: error.error)
    } catch {
        print("Hata: \(error.localizedDescription)")
    }
}
```

### Örnek 3: Premium Upgrade

```swift
Task {
    do {
        let authResponse = try await APIClient.shared.upgradeToPremium()
        
        if authResponse.user.plan == "premium" {
            print("Premium aktif!")
            // UI'ı güncelle
        }
        
    } catch {
        print("Premium upgrade hatası: \(error.localizedDescription)")
    }
}
```

### Örnek 4: Film Arama

```swift
Task {
    do {
        let searchResponse = try await APIClient.shared.searchMovies(query: "batman")
        
        print("\(searchResponse.count) sonuç bulundu")
        
        for movie in searchResponse.movies {
            print("Film: \(movie.title) (\(movie.year))")
        }
        
    } catch APIError.badRequest(let message) {
        print("Arama hatası: \(message)")
    } catch {
        print("Hata: \(error.localizedDescription)")
    }
}
```

---

## 🔐 Güvenlik Notları

1. **Token Saklama:** Token'ı `UserDefaults` yerine `Keychain` kullanarak saklamak daha güvenlidir
2. **App Secret:** App secret'ı hardcode etmek yerine `Info.plist` veya environment variable'dan alın
3. **HTTPS:** Production'da mutlaka HTTPS kullanın
4. **Token Yenileme:** Token 7 gün geçerli, expire olmadan önce yenileme mekanizması ekleyin

---

## 📝 Önemli Notlar

1. **Limit Sistemi:**
   - Free/Guest kullanıcılar: Günlük 30 film limiti
   - Premium kullanıcılar: Sınırsız
   - Limit her gün saat 00:00'da sıfırlanır

2. **Authentication:**
   - `/auth/*` endpoint'leri için `x-app-secret` gerekmez
   - `/api/*` endpoint'leri için `x-app-secret` ZORUNLU
   - Token optional - Guest olarak da kullanılabilir

3. **Video Formatları:**
   - `videoSource: "youtube"` → YouTube URL'i
   - `videoSource: "tmdb_mp4"` → Direkt MP4 URL'i

4. **Pagination:**
   - `all` endpoint'i sayfa bazlı çalışır
   - Her sayfada maksimum 10 film döner
   - Limit dolmuşsa 403 hatası döner

---

## 🎯 Tam Çalışan APIClient Örneği

```swift
import Foundation
import Antigravity

class APIClient {
    static let shared = APIClient()
    
    private let baseURL = "https://your-api-domain.com"
    private let appSecret = "YOUR_APP_SECRET"
    
    private var defaultHeaders: [String: String] {
        var headers = [
            "Content-Type": "application/json",
            "x-app-secret": appSecret
        ]
        
        if let token = UserDefaults.standard.string(forKey: "auth_token") {
            headers["Authorization"] = "Bearer \(token)"
        }
        
        return headers
    }
    
    private init() {}
    
    // MARK: - Authentication
    
    func register(email: String, password: String, name: String?) async throws -> AuthResponse {
        let url = URL(string: "\(baseURL)/auth/register")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any?] = ["email": email, "password": password, "name": name]
        request.httpBody = try JSONSerialization.data(withJSONObject: body.compactMapValues { $0 })
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        if httpResponse.statusCode == 409 {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.conflict(error.error)
        }
        
        guard httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
        
        return authResponse
    }
    
    func login(email: String, password: String) async throws -> AuthResponse {
        let url = URL(string: "\(baseURL)/auth/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = ["email": email, "password": password]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        if httpResponse.statusCode == 401 {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.unauthorized(error.error)
        }
        
        guard httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
        
        return authResponse
    }
    
    func googleSignIn(idToken: String) async throws -> AuthResponse {
        let url = URL(string: "\(baseURL)/auth/google")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = ["idToken": idToken]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
        
        return authResponse
    }
    
    func upgradeToPremium() async throws -> AuthResponse {
        let url = URL(string: "\(baseURL)/auth/upgrade")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        for (key, value) in defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        UserDefaults.standard.set(authResponse.token, forKey: "auth_token")
        
        return authResponse
    }
    
    // MARK: - Movies
    
    func getAllFeed(page: Int = 1) async throws -> AllFeedResponse {
        let url = URL(string: "\(baseURL)/api/all?page=\(page)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        for (key, value) in defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        if httpResponse.statusCode == 403 {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.limitReached(error)
        }
        
        guard httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        return try JSONDecoder().decode(AllFeedResponse.self, from: data)
    }
    
    func getCategoryFeed(category: String = "action") async throws -> FeedResponse {
        let url = URL(string: "\(baseURL)/api?category=\(category)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        for (key, value) in defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        return try JSONDecoder().decode(FeedResponse.self, from: data)
    }
    
    func getTrendingMovies() async throws -> TrendingResponse {
        let url = URL(string: "\(baseURL)/api/trending")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        for (key, value) in defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        return try JSONDecoder().decode(TrendingResponse.self, from: data)
    }
    
    func searchMovies(query: String) async throws -> SearchResponse {
        guard let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseURL)/api/search?query=\(encodedQuery)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        for (key, value) in defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        if httpResponse.statusCode == 400 {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.badRequest(error.error)
        }
        
        guard httpResponse.statusCode == 200 else {
            let error = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(error.error)
        }
        
        return try JSONDecoder().decode(SearchResponse.self, from: data)
    }
}

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized(String)
    case conflict(String)
    case badRequest(String)
    case limitReached(ErrorResponse)
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Geçersiz URL"
        case .invalidResponse:
            return "Geçersiz yanıt"
        case .unauthorized(let message):
            return message
        case .conflict(let message):
            return message
        case .badRequest(let message):
            return message
        case .limitReached(let error):
            return error.error
        case .serverError(let message):
            return message
        }
    }
}
```

---

## ✅ Test Checklist

- [ ] Register endpoint çalışıyor mu?
- [ ] Login endpoint çalışıyor mu?
- [ ] Google Sign-In çalışıyor mu?
- [ ] Token doğru şekilde kaydediliyor mu?
- [ ] All feed endpoint'i çalışıyor mu?
- [ ] Limit kontrolü doğru çalışıyor mu?
- [ ] Premium upgrade çalışıyor mu?
- [ ] Search endpoint çalışıyor mu?
- [ ] Trending endpoint çalışıyor mu?
- [ ] Category feed çalışıyor mu?
- [ ] Error handling doğru çalışıyor mu?

---

**Not:** Bu rehberde Antigravity kütüphanesi kullanılmıştır, ancak kod örnekleri standart Swift `URLSession` API'sini kullanmaktadır. Antigravity'nin kendi API'sine göre uyarlamanız gerekebilir.

