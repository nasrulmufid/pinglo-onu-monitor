# PingLo (Vite + React + shadcn/UI + node:sqlite + Map ONU)

Aplikasi monitoring OLT dan ONU/ONT via SNMP berbasis **Vite + React + TypeScript + shadcn/UI + Express + `node:sqlite`** (bawaan Node.js v22.5+, tanpa kompilasi native `node-gyp`), dilengkapi fitur **Mapping Lokasi ONU (Leaflet + OpenStreetMap & Satelit)**, tanpa modul Telegram Bot.

## Persyaratan
- **Node.js v22.5 atau lebih baru** (termasuk Node 24/26) — atau **Docker**.

## Cara Menjalankan

### 1. Mode Development (Vite + Express)
```bash
npm install
npm run dev
```
- Frontend Vite: `http://localhost:5173`
- Backend API Express: `http://127.0.0.1:3007`

### 2. Mode Production (Single Service Port 3007)
```bash
npm install
npm run build
npm run start
```
Buka di `http://IP-SERVER:3007`.

### 3. Deploy dengan Docker Compose (Rekomendasi untuk VPS / Server Lokal)
```bash
docker compose up -d --build
```
Database SQLite tersimpan persisten di folder `./data/mikroin-monitor.db`.

## Akun Login Default
- **Super Admin:** `superadmin` / `superadmin123`
- **Admin:** `admin` / `admin123`
