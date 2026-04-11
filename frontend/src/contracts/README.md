# HashFlow Frontend - Technical Conventions

This project follows the **Next.js 16 "Modern Institutional"** standard.

## 1. Async Request APIs
Synchronous access to `cookies()`, `headers()`, `params`, and `searchParams` is **NOT permitted**.
Always use the async pattern:
```tsx
export default async function Page(props: PageProps) {
  const params = await props.params;
}
```

## 2. Global Performance
- **React Compiler**: Enabled via `next.config.ts`. Avoid manual `useMemo` unless necessary for complex dependency chains.
- **Turbopack**: Default bundler. Enhanced caching enabled for development.

## 3. Web3 Connectivity
- Environment awareness (HashKey vs Anvil) is managed in `src/providers/web3-provider.tsx`.
- Contract artifacts (ABIs/Addresses) are auto-synced from `contracts/` using `sync-artifacts.js`.

## 4. Design Language
- **Colors**: Deep Sea Blue (`#001B3D`), Emerald Green (`#10B981`).
- **Styling**: `rounded-md` (6px) borders, Zebra-stripe tables.
- **Typography**: Inter (UI), JetBrains Mono (On-chain Data).
