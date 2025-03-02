# CLAUDE.md - Fireside Events Project Guide

## Build and Development Commands

- 🚀 Start development: `pnpm dev` or `turbo dev --ui tui` (root)
- 📱 Web development: `pnpm dev` (in web directory)
- 🖥️ Backend development: `pnpm dev` (in backend directory)
- 🔍 Type checking: `pnpm typecheck` (in web directory)
- 🧪 Run tests: `pnpm test` (in backend directory)
- 🧪 Run single test: `pnpm test -- -t "test name"` (in backend directory)
- 🚢 Deploy: `pnpm deploy` (in web or backend directory)

## Code Style Guidelines

- **TypeScript**: Strict mode enabled with ESNext target
- **Imports**: Use ES modules, path aliases (`~/*` for web app directory)
- **Formatting**: Follow ESLint config (React recommended + hooks + neverthrow rules)
- **Error Handling**: Use neverthrow library for Result types, must-use-result rule enforced
- **Types**: Types for all parameters and return values, prefer more specific over any
- **Naming**: PascalCase for components and types, camelCase for functions and variables
- **Components**: Use function components with React hooks, extract reusable components
- **State Management**: Use XState for state machines, React context for global state
- **CSS**: Use Tailwind CSS with class-variance-authority for components

## Git commit message guides

- Never use `🤖 Generated with [Claude Code](https://claude.ai/code), Co-Authored-By: Claude <noreply@anthropic.com>")` these two lines on your commit messages
