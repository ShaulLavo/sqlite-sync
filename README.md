## Usage

```bash
$ npm install # or pnpm install or yarn install
```

### Learn more on the [Solid Website](https://solidjs.com) and come chat with us on our [Discord](https://discord.com/invite/solidjs)

## Available Scripts

In the project directory, you can run:

### `npm run dev`

Runs the app in the development mode.<br>
Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

### `npm run build`

Builds the app for production to the `dist` folder.<br>
It correctly bundles Solid in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br>
Your app is ready to be deployed!

## Deployment

Learn more about deploying your application with the [documentations](https://vite.dev/guide/static-deploy.html)

```
sqlite-sync
├─ bun.lock
├─ drizzle
│  ├─ 0000_lying_jack_murdock.sql
│  └─ meta
│     ├─ 0000_snapshot.json
│     └─ _journal.json
├─ drizzle.config.ts
├─ index.html
├─ package.json
├─ public
│  └─ vite.svg
├─ README.md
├─ src
│  ├─ App.tsx
│  ├─ assets
│  │  └─ solid.svg
│  ├─ components
│  ├─ consts
│  │  └─ miagration.ts
│  ├─ index.css
│  ├─ index.tsx
│  ├─ schema.ts
│  ├─ sqliteWorker.ts
│  ├─ utils
│  │  └─ client-wasm.ts
│  └─ vite-env.d.ts
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```