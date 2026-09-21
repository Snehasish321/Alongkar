# Alongkar (অলংকার)

A modern, elegant e-commerce jewelry web application built with React 19, TypeScript, Tailwind CSS v4, and Vite.

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Routing**: React Router v7
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion & Lottie
- **Authentication**: Clerk React SDK
- **Deployment**: Vercel

---

## Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Snehasish321/Alongkar.git
cd Alongkar
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

---

## Deployment & Pull Request Preview Workflow

Alongkar is deployed on **Vercel** with automatic Continuous Integration and Continuous Deployment (CI/CD):

### 1. Production Deployment (`main` branch)
- Commits pushed or merged into the `main` branch are automatically built and deployed to the production environment (`https://alongkar.vercel.app` or custom domain).

### 2. Automatic Pull Request Preview Deployments
- Whenever a contributor opens a **Pull Request (PR)** against `main`:
  1. Vercel automatically detects the PR event (`opened`, `synchronize`, `reopened`).
  2. Vercel builds the PR branch in an isolated temporary preview environment.
  3. A unique preview deployment URL is generated and automatically commented on the PR discussion thread.
  4. The PR author and repository maintainers can open the preview URL to inspect the live UI and test features before merging.
  5. Every new commit pushed to the PR automatically triggers a new preview deployment.
  6. **Zero Impact on Production**: Preview builds are fully isolated and do not alter or overwrite the production deployment.

### 3. Vercel Environment Configuration
In the Vercel Project Settings (`Settings > Environment Variables`):
- **Production**: Set production keys for live traffic.
- **Preview**: Configure test/preview keys (e.g., Clerk test publishable key) applied automatically to all PR preview deployments.
- **Development**: Applied when using `vercel env pull` locally.

