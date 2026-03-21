# Tastizo FCM Token API (Flutter Team Ready)

Base URL: `https://api.tastizo.com/api`

Yeh document Flutter team ke liye final format hai.  
Bakalaa reference ke hisab se `token + platform: "app"` payload fully supported hai.

## Quick Flow (End-to-End)

1. Login karo (`/auth/login`) with correct role.
2. Response se `accessToken` lo.
3. `Authorization: Bearer <accessToken>` ke saath FCM token save karo.
4. Logout par same platform ka token remove karo.

---

## 1) Login API (All Roles)

Endpoint: `POST /auth/login`

### User Login

```json
{
  "email": "customer@gmail.com",
  "password": "password123",
  "role": "user"
}
```

### Restaurant Login

```json
{
  "email": "restaurant@gmail.com",
  "password": "password123",
  "role": "restaurant"
}
```

### Delivery Login

```json
{
  "email": "delivery@gmail.com",
  "password": "password123",
  "role": "delivery"
}
```

> Note: Delivery role `delivery` hi rahega (restaurant nahi).

---

## 2) Save FCM Token APIs

Auth Header (required):

`Authorization: Bearer <accessToken>`

### User

`POST /auth/fcm-token`

### Restaurant

`POST /restaurant/auth/fcm-token`

### Delivery

`POST /delivery/auth/fcm-token`

### Recommended Payload (Bakalaa Compatible)

#### Android App

```json
{
  "token": "fcm_token_value_here",
  "platform": "app",
  "deviceType": "android"
}
```

#### iOS App

```json
{
  "token": "fcm_token_value_here",
  "platform": "app",
  "deviceType": "ios"
}
```

#### Web

```json
{
  "token": "fcm_token_value_here",
  "platform": "web"
}
```

### Backward Compatibility (already supported)

Old payload bhi chalega:

```json
{
  "fcmToken": "fcm_token_value_here",
  "platform": "android"
}
```

---

## 3) Remove FCM Token APIs

Auth Header (required):

`Authorization: Bearer <accessToken>`

- `DELETE /auth/fcm-token`
- `DELETE /restaurant/auth/fcm-token`
- `DELETE /delivery/auth/fcm-token`

### Remove Android App Token

```json
{
  "platform": "app",
  "deviceType": "android"
}
```

### Remove iOS App Token

```json
{
  "platform": "app",
  "deviceType": "ios"
}
```

### Remove Web Token

```json
{
  "platform": "web"
}
```

---

## 4) Database Fields (Final)

In teeno entities me FCM fields available hain:

- User
- Restaurant
- Delivery

Stored fields:

- `fcmTokenWeb`
- `fcmTokenAndroid`
- `fcmTokenIos`

### Mapping Logic

- `platform: "web"` -> `fcmTokenWeb`
- `platform: "android"` -> `fcmTokenAndroid`
- `platform: "ios"` -> `fcmTokenIos`
- `platform: "app"` + `deviceType: "android"` -> `fcmTokenAndroid`
- `platform: "app"` + `deviceType: "ios"` -> `fcmTokenIos`

If `platform: "app"` and `deviceType` missing hai, default Android treat hota hai.
