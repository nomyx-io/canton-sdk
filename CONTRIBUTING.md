# Contributing to @nomyx/canton-sdk

Thank you for your interest in contributing to `@nomyx/canton-sdk`. This document
provides guidelines and instructions for contributing.

## Reporting Bugs

Open a [GitHub issue](https://github.com/nomyx-io/canton-sdk/issues) with a clear
description of the bug, steps to reproduce, expected behavior, and your environment
details (OS, Node version, package version).

## Suggesting Features

Open a [GitHub issue](https://github.com/nomyx-io/canton-sdk/issues) with the
prefix `[Feature]` in the title. Describe the problem your feature would solve,
your proposed solution, and any alternatives you have considered.

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-fork>/canton-sdk.git
   cd canton-sdk
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Code Style

- TypeScript strict mode is enabled. Do not use `any` types.
- Run `npm run typecheck` before submitting your changes.
- Follow existing code conventions and patterns in the repository.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes in the feature branch.
3. Ensure all tests pass (`npm test`) and types check (`npm run typecheck`).
4. Write or update tests for your changes as appropriate.
5. Submit a pull request against `main` with a clear description of the changes.

## Commit Messages

- Use the imperative mood in the subject line (e.g., "Add retry logic" not "Added retry logic").
- Keep the subject line concise (72 characters or fewer).
- Reference relevant issues in the body when applicable.

## License

By contributing to this project, you agree that your contributions will be licensed
under the [Apache License 2.0](./LICENSE).
