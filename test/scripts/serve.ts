import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { execa } from 'execa'
import http from 'http'
import express from 'express'
/**
 * Givin a vue-ssr app path, it builds in and serve it in production mode with express
 */
async function serve(
  root: string
): Promise<{ baseUrl: string; server: http.Server } | undefined> {
  const srcDir = path.resolve(root)

  // build
  await execa('pnpm', ['build'], { cwd: srcDir })

  // start prod server
  const app = await createServer(srcDir)

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(0, () => {
        // @ts-ignore
        const { port } = server.address()
        const baseUrl = `http://localhost:${port}`
        // console.log(`Test server running at ${baseUrl}`)
        return resolve({ server, baseUrl })
      })
    } catch (e) {
      return reject(e)
    }
  })
}

export default serve

// This is a simple Node server that uses the built project.

async function createServer(projectPath: string) {
  const readJson = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(projectPath, file), 'utf-8'))

  // This contains the entry file and a list of static routes (assets)
  const { main, ssr } = readJson('dist/server/package.json')

  // The manifest is required for preloading assets
  const manifest = readJson('dist/client/.vite/ssr-manifest.json')

  // This is the server renderer we just built
  const { default: renderPage } = await import(
    pathToFileURL(path.join(projectPath, 'dist/server', main)).href
  )

  const server = express()

  // Serve every static asset route
  for (const asset of ssr.assets || []) {
    server.use(
      '/' + asset,
      express.static(path.join(`${projectPath}/dist/client/` + asset))
    )
  }

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

    response.writeHead(status || 200, statusText || headers, headers)
    response.end(html)
  })

  return server
}
