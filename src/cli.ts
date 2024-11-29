#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
// @ts-ignore
if (!globalThis.__ssr_start_time) {
  // @ts-ignore
  globalThis.__ssr_start_time = performance.now()
}

const [, , ...args] = process.argv

const options = {} as Record<string, any>

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  const nextArg = args[i + 1]
  if (arg.startsWith('--')) {
    options[arg.replace('--', '')] =
      !nextArg || nextArg.startsWith('--') ? true : nextArg
  }
}

const [command] = args

if (command === 'build') {
  ;(async () => {
    const { mode, ssr, watch } = options
    
    // Dynamic import for build
    const { default: build } = await import('./build/index.js')

    await build({
      clientOptions: { mode, build: { watch } },
      serverOptions: { mode, build: { ssr } },
    })

    if (!watch) {
      process.exit()
    }
  })()
} else if (
  command === 'dev' ||
  command === undefined ||
  command.startsWith('-')
) {
  // Dynamic import for dev
  import('./dev').then(({ startServer }) => startServer(options))
} else {
  console.log(`Command "${command}" not supported`)
}
