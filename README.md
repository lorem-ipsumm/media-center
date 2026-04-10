# React + TypeScript + Vite + Tailwind + Shadcn + Hono Stack

This is my go-to boilerplate for React projects with API routing. I've put together this stack because it gives me everything I need to build modern full-stack web apps quickly and is meant to prevent vendor lock-in.

## What's in here

- **React ^18** with TypeScript for solid, type-safe components
- **Vite** very fast and very unopinionated
- **Tailwind CSS V4** for styling without writing much CSS
- **Shadcn/ui** for beautiful components that actually work well
- **Hono** for NextJS-like API routing experience
- **Bun** my runtime and package manager of choice, but can also be replaced with npm, yarn, pnpm, etc.

## Getting it running

You'll need Bun installed first - grab it from [bun.sh](https://bun.sh/) if you don't have it.

```bash
# Clone and get into the directory
git clone <your-repo-url>
cd vite-typescript-tailwind-shadcn

# Install stuff
bun i

# Fire it up
bun run dev
```

Then head to `https://localhost:5173` and you should see it running. Your API routes will be available at `https://localhost:5173/api/*`.

## The usual commands

- `bun run dev` - development server with hot reload (includes API routing)
- `bun run build` - production build
- `bun run lint` - check your code quality
- `bun run preview` - test the production build locally

## API Routes

This setup includes Hono for API routing that works seamlessly with Vite during development. All API routes are automatically mounted at `/api/*` and are excluded from the frontend routing.

Example API endpoints:
- `GET /api/hello` - returns a simple JSON response
- `POST /api/echo` - echoes back the request body

You can add new API routes in the `api/app.ts` file following the Hono routing conventions.

## Adding components

Shadcn/ui is already configured, so when you want to add components:

```bash
bunx --bun shadcn@latest add dialog
# or whatever component you need
```

## How it's organized

```
src/
├── components/    # Your React components go here
  ├── ui/          # UI components from Shadcn/ui (or custom UI components)
├── lib/           # Utilities and config related files/interfaces/etc.
├── styles/        # Global styles
└── App.tsx        # Main app component

api/
├── app.ts         # Main Hono app with all your API routes
├── dev.ts         # Development entry point for Vite plugin
└── tsconfig.json  # TypeScript config for API

packages/
├── interfaces/    # Shared TypeScript interfaces between frontend and API
└── ...            # Other shared code (utils, constants, etc.)
```

## Path Aliases

The project includes convenient path aliases:
- `@` → `./src` (for frontend code)
- `@shared` → `./packages` (for shared code between frontend and API)

Example usage:
```typescript
import { SomeInterface } from '@shared/interfaces/mock';
import { Button } from '@/components/ui/button';
```
