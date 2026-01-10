<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/assets/images/logo/favicon.png" alt="Oronts" width="60" height="60">
  </a>
</p>

# Contributing to Data Hub Plugin

Thank you for your interest in contributing to the Data Hub plugin for Vendure!

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/oronts/data-hub-plugin.git
cd data-hub-plugin
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run populate  # First time only - seeds the database
npm run dev
```

4. Open the admin dashboard at http://localhost:3000/admin
   - Login: `superadmin` / `superadmin`

### Project Structure

```
data-hub/
├── src/                    # Backend source code
│   ├── api/               # GraphQL resolvers, schema, and controllers
│   ├── bootstrap/         # Plugin initialization services
│   ├── constants/         # Adapter definitions (operators, extractors, loaders, feeds, sinks)
│   ├── entities/          # TypeORM entities (Pipeline, PipelineRun, etc.)
│   ├── extractors/        # Data source extractors (REST, GraphQL, CSV, etc.)
│   ├── feeds/             # Product feed generators (Google, Meta, Amazon, Custom)
│   ├── jobs/              # Background job handlers
│   ├── loaders/           # Entity loaders (Product, Customer, Order, etc.)
│   ├── mappers/           # Field mapping utilities
│   ├── operators/         # Transform operators (string, numeric, date, etc.)
│   ├── parsers/           # File parsing services
│   ├── runtime/           # Pipeline execution engine
│   ├── sdk/               # DSL pipeline builder and type definitions
│   ├── services/          # Business logic services
│   └── transforms/        # Transform executor
├── dashboard/             # Admin UI (React components for Vendure Dashboard)
├── docs/                  # Documentation
│   ├── getting-started/   # Installation and quick start
│   ├── reference/         # API reference (operators, extractors, loaders, etc.)
│   └── developer-guide/   # DSL, extending, architecture
├── dev-server/            # Development server
└── e2e/                   # End-to-end tests
```

## Development Workflow

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e
```

### Building

```bash
# Build the plugin
npm run build

# Watch mode for development
npm run compile:watch
```

### Linting

```bash
npm run lint
```

## Pull Request Process

1. Fork the repository and create a new branch from `master`
2. Make your changes following the coding guidelines
3. Add or update tests as needed
4. Ensure all tests pass
5. Update documentation if needed
6. Submit a pull request

### Commit Messages

We follow conventional commits. Please format your commit messages as:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Code Style

- Use TypeScript for all new code
- Follow the existing code patterns
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write meaningful variable names

## Adding New Features

### Adding an Extractor

1. Create a new file in `src/extractors/`
2. Implement the `DataExtractor` interface
3. Register it in `src/extractors/index.ts`
4. Add tests in `src/extractors/__tests__/`

### Adding a Loader

1. Create a new file in `src/loaders/`
2. Implement the `EntityLoader` interface
3. Register it in `src/loaders/registry.ts`
4. Add tests

### Adding a Transform Operator

1. Add the operator definition in `src/operators/`
2. Implement the transform logic in `src/transforms/`
3. Add tests

## Reporting Issues

- Use the GitHub issue templates
- Provide detailed reproduction steps
- Include version information
- Attach relevant logs or screenshots

## Questions?

Feel free to open a discussion on GitHub or reach out to the maintainers.

- Email: office@oronts.com
- Website: [https://oronts.com](https://oronts.com)

## License

By contributing, you agree that your contributions will be licensed under the same license terms as the project (see [LICENSE](LICENSE)). You retain copyright of your contributions but grant Oronts the right to use and distribute them under the project's license terms.

---

<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/assets/images/logo/favicon.png" alt="Oronts" width="40" height="40">
  </a>
</p>

<p align="center">
  <strong>Oronts</strong> - AI-powered automation and e-commerce solutions
</p>
