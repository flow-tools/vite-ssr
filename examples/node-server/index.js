// This is a simple Node server that uses the built project.
// Usage: node index.js <example>  (or `pnpm serve:node` in an example)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import express from 'express'
import { api } from './api.js'

const example = process.argv[2]

if (!example) {
  throw new Error('Specify example name in the first argument')
}

const dist = fileURLToPath(new URL(`../${example}/dist/`, import.meta.url))
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(dist, file), 'utf-8'))

// This contains the entry file and a list of static routes (assets)
const { main, ssr } = readJson('server/package.json')

// The manifest is required for preloading assets
const manifest = readJson('client/.vite/ssr-manifest.json')

// This is the server renderer we just built
const { default: renderPage } = await import(
  pathToFileURL(path.join(dist, 'server', main)).href
)

const server = express()

// Serve every static asset route
for (const asset of ssr.assets || []) {
  server.use('/' + asset, express.static(path.join(dist, 'client', asset)))
}

// Custom API to get data for each page
// See src/main.js to see how this is called
api.forEach(({ route, handler, method = 'get' }) =>
  server[method](route, handler)
)

// Everything else is treated as a "rendering request"
server.use(async (request, response) => {
  const url =
    request.protocol + '://' + request.get('host') + request.originalUrl

  const { html, status, statusText, headers } = await renderPage(url, {
    manifest,
    preload: true,
    // Anything passed here will be available in the main hook
    request,
    response,
    // initialState: { ... } // <- This would also be available
  })

  response.type('html')
  response.writeHead(status || 200, statusText || headers, headers)
  response.end(html)
})

const port = process.env.PORT || 8080
console.log(`Server started: http://localhost:${port}`)
server.listen(port)
