export const ReadmeTemplate = `
# {{name}}

{{#if description}}
> {{description}}
{{/if}}

## Prerequisites

- [Rust](https://www.rust-lang.org)
- [Tauri](https://tauri.app)

## Running the application

To run \`{{name}}\`:

\`\`\`sh
pnpm install
pnpm tauri dev
\`\`\`
`;
