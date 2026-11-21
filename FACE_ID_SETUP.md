# Face ID Registration – Groupmate Setup Guide

Branch: `feat-face_scan`

This branch introduces client-side **Face ID registration** to the Profile tab. Follow these steps after pulling the branch.

---

## 1. Pull the Branch

```bash
git fetch origin
git checkout feat-face_scan
git pull origin feat-face_scan
```

---

## 2. Install New Dependencies

Both the backend and frontend have new dependencies:

```bash
# Install backend dependencies (class-validator, class-transformer, @nestjs/throttler)
npm install --prefix backend

# Install frontend dependencies (@vladmandic/face-api)
npm install --prefix frontend
```

---

## 3. Synchronize Database & Prisma Client

The `User` model in `backend/prisma/schema.prisma` now includes `faceDescriptor Float[]` and `faceRegisteredAt DateTime?`.

1. **Regenerate Prisma Client:**
   ```bash
   npm --prefix backend run db:generate
   ```

2. **Sync Database:**
   - If using cloud Supabase (already synced), just generate client.
   - If using a local PostgreSQL database, apply migration:
     ```bash
     cd backend
     npx prisma migrate dev --name add_face_id
     ```

---

## 4. Model Weights

The required neural network model weights are already committed and located in:
```text
frontend/public/assets/models/
├── tiny_face_detector_model-weights_manifest.json
├── tiny_face_detector_model.bin
├── face_landmark_68_model-weights_manifest.json
├── face_landmark_68_model.bin
├── face_recognition_model-weights_manifest.json
└── face_recognition_model.bin
```
No manual downloading is required; Angular serves them automatically at `/assets/models/`.

---

## 5. Running the Application

1. **Start the backend:**
   ```bash
   cd backend
   npm run start:dev
   ```
   *(Runs at `http://localhost:5000/api/v1`)*

2. **Start the frontend:**
   ```bash
   cd frontend
   npm start
   ```
   *(Runs at `http://localhost:4200`)*

---

## 6. How to Test Face ID

1. Open `http://localhost:4200` and sign in to your account.
2. Navigate to the **Profile** tab (`/profile`).
3. You will see a prompt modal: *"Do you want to register your Face ID?"*.
4. Choose **"Yes, register"** &rarr; allow browser camera permission.
5. Align your face inside the animated oval guide and click **"Capture Face"**.
6. A 128-number vector descriptor is extracted client-side (no photos are ever saved or uploaded).
7. Once registered, the Profile card will display **"Face ID registered"** with a **"Remove Face ID"** button.
8. If you click **"Not now"**, the prompt will be suppressed for the remainder of your browser session (`sessionStorage`).

---

## 7. Notes & Troubleshooting

- **Camera Context:** Camera access (`getUserMedia`) requires a secure context (`http://localhost` or `https://`).
- **Camera Conflict Prevention:** Active camera tracks are cleanly stopped immediately after capture or cancellation so hardware is never locked for the QR scanner (ZXing).
- **Privacy:** `faceDescriptor` is strictly excluded from general user queries (`login`, `getMe`, `register`) and is never returned in public API payloads.
